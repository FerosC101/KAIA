"""FastAPI dependencies: authentication and role-based authorization (server-side)."""

import uuid

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import ACCESS, decode_token
from app.db.session import get_db
from app.models import User
from app.models.enums import Role

bearer = HTTPBearer(auto_error=False)

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


def user_from_token(db: Session, token: str) -> User:
    try:
        payload = decode_token(token, ACCESS)
        user_id = uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, ValueError, KeyError):
        raise _UNAUTHORIZED from None
    user = db.get(User, user_id)
    if user is None or not user.is_active or user.token_version != payload.get("ver"):
        raise _UNAUTHORIZED
    return user


def get_current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None or creds.scheme.lower() != "bearer":
        raise _UNAUTHORIZED
    user = user_from_token(db, creds.credentials)
    request.state.user_id = user.id
    return user


def require_roles(*roles: Role):
    allowed = {r.value for r in roles}

    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Your role is not permitted to perform this action")
        return user

    return dependency


PatientUser = Depends(require_roles(Role.patient))
WorkerUser = Depends(require_roles(Role.health_worker))
InstitutionUser = Depends(require_roles(Role.institution_admin, Role.system_admin))
SystemAdminUser = Depends(require_roles(Role.system_admin))
AnyUser = Depends(get_current_user)


def client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None
