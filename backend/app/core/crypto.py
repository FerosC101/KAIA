"""Field-level encryption for sensitive personal data.

Sensitive columns (names, birth dates, contact details, clinical notes) are stored as
Fernet ciphertext (AES-128-CBC + HMAC-SHA256). Keys come from FIELD_ENCRYPTION_KEY and
can be rotated by supplying multiple comma-separated keys (newest first).
"""

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from sqlalchemy import String, Text
from sqlalchemy.types import TypeDecorator

from app.core.config import settings


def _build_fernet() -> MultiFernet:
    keys = [k.strip() for k in settings.field_encryption_key.split(",") if k.strip()]
    return MultiFernet([Fernet(k.encode()) for k in keys])


_fernet = _build_fernet()


def encrypt_value(value: str) -> str:
    return _fernet.encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_value(token: str) -> str:
    try:
        return _fernet.decrypt(token.encode("ascii")).decode("utf-8")
    except InvalidToken as exc:  # never leak ciphertext or key details
        raise ValueError("Unable to decrypt protected field") from exc


class EncryptedString(TypeDecorator):
    """Transparent encrypt-on-write / decrypt-on-read column type."""

    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return encrypt_value(str(value))

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return decrypt_value(value)


__all__ = ["EncryptedString", "encrypt_value", "decrypt_value", "String"]
