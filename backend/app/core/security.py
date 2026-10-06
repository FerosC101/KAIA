"""Password hashing, JWT issuing/verification, and signed file URLs."""

import hashlib
import hmac
import time
import uuid
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.core.config import settings

ACCESS = "access"
REFRESH = "refresh"


def hash_password(password: str) -> str:
    # bcrypt only uses the first 72 bytes; pre-hash to keep long passphrases meaningful.
    digest = hashlib.sha256(password.encode("utf-8")).hexdigest().encode("ascii")
    return bcrypt.hashpw(digest, bcrypt.gensalt(rounds=12)).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    digest = hashlib.sha256(password.encode("utf-8")).hexdigest().encode("ascii")
    try:
        return bcrypt.checkpw(digest, password_hash.encode("ascii"))
    except ValueError:
        return False


def create_token(subject: uuid.UUID, role: str, token_type: str, token_version: int) -> str:
    now = datetime.now(UTC)
    lifetime = (
        timedelta(minutes=settings.access_token_minutes)
        if token_type == ACCESS
        else timedelta(days=settings.refresh_token_days)
    )
    payload = {
        "sub": str(subject),
        "role": role,
        "typ": token_type,
        "ver": token_version,
        "iat": int(now.timestamp()),
        "exp": int((now + lifetime).timestamp()),
        "jti": uuid.uuid4().hex,
        "iss": "kaia-platform",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, expected_type: str) -> dict:
    payload = jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
        issuer="kaia-platform",
        options={"require": ["exp", "sub", "typ", "iss"]},
    )
    if payload.get("typ") != expected_type:
        raise jwt.InvalidTokenError("Wrong token type")
    return payload


# ---------------------------------------------------------------------------
# Signed, expiring file URLs (assay images). The URL itself carries no health data.
# ---------------------------------------------------------------------------


def _file_signature(path: str, expires: int) -> str:
    msg = f"{path}:{expires}".encode()
    return hmac.new(settings.file_url_secret.encode(), msg, hashlib.sha256).hexdigest()


def sign_file_path(path: str) -> str:
    expires = int(time.time()) + settings.file_url_ttl_seconds
    return f"{settings.api_prefix}/files/{path}?exp={expires}&sig={_file_signature(path, expires)}"


def verify_file_signature(path: str, expires: int, signature: str) -> bool:
    if expires < int(time.time()):
        return False
    return hmac.compare_digest(_file_signature(path, expires), signature)


# ---------------------------------------------------------------------------
# Referral QR tokens: short opaque signed token -> resolves to a referral server-side.
# ---------------------------------------------------------------------------


def referral_qr_token(referral_id: uuid.UUID) -> str:
    raw = referral_id.hex
    sig = hmac.new(settings.jwt_secret.encode(), f"referral:{raw}".encode(), hashlib.sha256).hexdigest()[:24]
    return f"{raw}.{sig}"


def parse_referral_qr_token(token: str) -> uuid.UUID | None:
    try:
        raw, sig = token.split(".", 1)
        expected = hmac.new(settings.jwt_secret.encode(), f"referral:{raw}".encode(), hashlib.sha256).hexdigest()[:24]
        if not hmac.compare_digest(expected, sig):
            return None
        return uuid.UUID(hex=raw)
    except (ValueError, AttributeError):
        return None
