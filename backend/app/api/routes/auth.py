import time
import uuid
from collections import defaultdict, deque
from datetime import UTC, datetime

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.serializers import user_dict
from app.core.config import settings
from app.core.deps import AnyUser, client_ip
from app.core.errors import conflict
from app.core.security import ACCESS, REFRESH, create_token, decode_token, hash_password, verify_password
from app.db.session import get_db
from app.models import Barangay, PatientProfile, User
from app.models.enums import ConsentScope, ConsentStatus, Role
from app.models import Consent
from app.schemas.inputs import LoginIn, RegisterIn
from app.services import audit
from app.services.common import age_bracket_for, notify, unique_code

router = APIRouter(prefix="/auth", tags=["Authentication"])

REFRESH_COOKIE = "kaia_refresh"
_attempts: dict[str, deque] = defaultdict(deque)


def _rate_limit(key: str) -> None:
    window = _attempts[key]
    now = time.monotonic()
    while window and now - window[0] > 300:
        window.popleft()
    if len(window) >= settings.login_rate_limit_per_5min:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many login attempts. Please wait a few minutes.")
    window.append(now)


def _session_payload(user: User, response: Response) -> dict:
    refresh = create_token(user.id, user.role, REFRESH, user.token_version)
    response.set_cookie(
        REFRESH_COOKIE,
        refresh,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        max_age=settings.refresh_token_days * 86400,
        path=f"{settings.api_prefix}/auth",
    )
    return {
        "access_token": create_token(user.id, user.role, ACCESS, user.token_version),
        "token_type": "bearer",
        "expires_in": settings.access_token_minutes * 60,
        "user": _me(user),
    }


def _me(user: User) -> dict:
    data = user_dict(user)
    if user.patient_profile:
        data["patient_code"] = user.patient_profile.patient_code
    return data


@router.post("/register", status_code=201, summary="Self-register a patient account")
def register(body: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise conflict("An account with this email already exists")
    if body.barangay_id and db.get(Barangay, body.barangay_id) is None:
        raise HTTPException(422, "Unknown barangay")
    user = User(email=email, password_hash=hash_password(body.password), role=Role.patient, full_name=body.full_name)
    db.add(user)
    db.flush()
    profile = PatientProfile(
        user_id=user.id,
        patient_code=unique_code(db, PatientProfile, PatientProfile.patient_code, "KAIA-USER-", 4),
        birth_date=body.birth_date.isoformat(),
        age_bracket=age_bracket_for(body.birth_date),
        phone=body.phone,
        barangay_id=body.barangay_id,
    )
    db.add(profile)
    db.flush()
    db.add(Consent(patient_id=profile.id, organization_id=None, grantee_name="KAIA Research Program",
                   scope=ConsentScope.anonymous_statistics, status=ConsentStatus.granted, granted_via="registration"))
    notify(db, user.id, "Welcome to KAIA", "Register your KAIA Kit to begin your screening journey.", "account", "/app/register-kit")
    audit.record(db, user, "auth.register", "user", user.id, patient_id=profile.id, request=request)
    db.commit()
    db.refresh(user)
    return _session_payload(user, response)


@router.post("/login", summary="Authenticate and receive an access token (refresh token set as httpOnly cookie)")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    email = body.email.lower()
    _rate_limit(f"{client_ip(request)}:{email}")
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been deactivated")
    user.last_login_at = datetime.now(UTC)
    audit.record(db, user, "auth.login", "user", user.id, request=request)
    db.commit()
    return _session_payload(user, response)


@router.post("/refresh", summary="Exchange the refresh cookie for a new access token")
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        # No session is a normal state for a first visit — answer quietly instead of 401.
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    try:
        payload = decode_token(token, REFRESH)
        user = db.get(User, uuid.UUID(payload["sub"]))
    except (jwt.PyJWTError, ValueError, KeyError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired") from None
    if user is None or not user.is_active or user.token_version != payload.get("ver"):
        response.delete_cookie(REFRESH_COOKIE, path=f"{settings.api_prefix}/auth")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired")
    return _session_payload(user, response)


@router.post("/logout", status_code=204, summary="End the session and revoke all issued tokens")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(REFRESH_COOKIE)
    if token:
        try:
            payload = decode_token(token, REFRESH)
            user = db.get(User, uuid.UUID(payload["sub"]))
            if user is not None and user.token_version == payload.get("ver"):
                user.token_version += 1  # invalidates outstanding access + refresh tokens
                audit.record(db, user, "auth.logout", "user", user.id, request=request)
                db.commit()
        except (jwt.PyJWTError, ValueError, KeyError):
            pass
    response.delete_cookie(REFRESH_COOKIE, path=f"{settings.api_prefix}/auth")
    response.status_code = 204
    return response


@router.get("/me", summary="Current user")
def me(user: User = AnyUser):
    return _me(user)
