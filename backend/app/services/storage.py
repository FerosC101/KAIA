"""Object storage abstraction for assay images.

LocalStorage is used for the prototype. An S3/MinIO backend only needs to implement
`save` and `read` with the same signatures (e.g. using boto3 put_object/get_object);
files are always served to clients through short-lived signed URLs, never public paths.
"""

from pathlib import Path
from typing import Protocol

from app.core.config import settings


class StorageBackend(Protocol):
    def save(self, path: str, data: bytes, content_type: str) -> str: ...

    def read(self, path: str) -> bytes: ...


class LocalStorage:
    def __init__(self, root: str) -> None:
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _resolve(self, path: str) -> Path:
        target = (self.root / path).resolve()
        if not target.is_relative_to(self.root):  # path traversal guard
            raise ValueError("Invalid storage path")
        return target

    def save(self, path: str, data: bytes, content_type: str) -> str:
        target = self._resolve(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return path

    def read(self, path: str) -> bytes:
        return self._resolve(path).read_bytes()


_storage: StorageBackend | None = None


def get_storage() -> StorageBackend:
    global _storage
    if _storage is None:
        if settings.storage_backend != "local":
            raise RuntimeError(f"Storage backend '{settings.storage_backend}' is not configured in this build")
        _storage = LocalStorage(settings.media_root)
    return _storage
