"""KAIA Platform API — AI-powered reproductive health screening and care navigation (prototype)."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import ROUTERS
from app.core.config import settings
from app.db.session import SessionLocal
from app.services.analysis import recover_interrupted
from app.services.storage import get_storage

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

DESCRIPTION = """
**Screen earlier. Understand better. Reach care.**

KAIA is a prototype screening and care-navigation platform. It does **not** diagnose cervical
cancer: outputs are screening results and follow-up recommendations that require clinician review.

All data in this environment is synthetic.

* Authentication: `POST /api/auth/login` → use `access_token` as a Bearer token.
* Live reader events: WebSocket `/api/ws/readers/{reader_code}` (send `{"token": "..."}` first).
"""

TAGS = [
    {"name": "Authentication"},
    {"name": "Patients", "description": "Patient-facing endpoints: dashboard, KAIA Passport."},
    {"name": "Kits"},
    {"name": "Screenings", "description": "Kit → sample → cartridge → analysis → clinician review → release."},
    {"name": "KAIA Reader", "description": "Reader registry, analysis orchestration, live status."},
    {"name": "KAIA Vision", "description": "AI-assisted assay interpretation (signals only, no disease probability)."},
    {"name": "KAIA Care — Referrals"},
    {"name": "KAIA Care — Follow-up"},
    {"name": "KAIA Care — Facilities"},
    {"name": "KAIA Continuity Engine", "description": "Predicts risk of not completing follow-up — never disease."},
    {"name": "Health Worker"},
    {"name": "KAIA Population", "description": "De-identified program analytics and care-gap detection."},
    {"name": "Institution Admin"},
    {"name": "Inventory"},
    {"name": "Consent & Privacy"},
    {"name": "Audit"},
    {"name": "Notifications"},
    {"name": "KAIA System Admin", "description": "Organizations, users, devices, model versions, Risk Engine rules."},
    {"name": "Public"},
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_storage()
    with SessionLocal() as db:
        recover_interrupted(db)
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description=DESCRIPTION,
    openapi_tags=TAGS,
    docs_url=f"{settings.api_prefix}/docs",
    redoc_url=f"{settings.api_prefix}/redoc",
    openapi_url=f"{settings.api_prefix}/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    headers = response.headers
    headers.setdefault("X-Content-Type-Options", "nosniff")
    headers.setdefault("X-Frame-Options", "DENY")
    headers.setdefault("Referrer-Policy", "no-referrer")
    headers.setdefault("Permissions-Policy", "camera=(self), microphone=(), geolocation=()")
    path = request.url.path
    if path.startswith(settings.api_prefix) and "/files/" not in path and "/docs" not in path and "/redoc" not in path:
        headers.setdefault("Cache-Control", "no-store")
    if settings.cookie_secure:
        headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
    return response


for router in ROUTERS:
    app.include_router(router, prefix=settings.api_prefix)


@app.get(f"{settings.api_prefix}/health", tags=["Public"], summary="Liveness probe")
def health():
    return {"status": "ok", "service": "kaia-api"}
