import os

# Configure before any app module is imported (settings are cached at import time).
# Tests drop and recreate every table — always point them at a dedicated database.
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "postgresql+psycopg://kaia:kaia@localhost:5432/kaia_test")
os.environ["READER_STAGE_SECONDS"] = "0"
os.environ["MEDIA_ROOT"] = os.path.join(os.path.dirname(__file__), ".media")
os.environ["LOGIN_RATE_LIMIT_PER_5MIN"] = "10000"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

PASSWORD = "KaiaDemo2026!"


@pytest.fixture(scope="session")
def client():
    import app.models  # noqa: F401
    from app.db.base import Base
    from app.db.session import SessionLocal, engine
    from app.main import app
    from app.seed import seed_database

    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed_database(db)
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def auth(client):
    cache: dict[str, dict] = {}

    def _auth(handle: str) -> dict:
        if handle not in cache:
            res = client.post("/api/auth/login", json={"email": f"{handle}@demo.kaia.ph", "password": PASSWORD})
            assert res.status_code == 200, res.text
            cache[handle] = {"Authorization": f"Bearer {res.json()['access_token']}"}
        return cache[handle]

    return _auth
