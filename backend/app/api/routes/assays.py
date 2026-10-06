import uuid
from pathlib import PurePosixPath

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.api.serializers import vision_view
from app.core.deps import WorkerUser
from app.core.errors import not_found
from app.core.security import verify_file_signature
from app.db.session import get_db
from app.models import AssayResult, User
from app.services import analysis, audit
from app.services.access import ensure_screening_access
from app.services.storage import get_storage

router = APIRouter(tags=["KAIA Vision"])

MEDIA_TYPES = {".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg"}


@router.get("/assays/{assay_id}", summary="Assay result with all KAIA Vision analyses")
def get_assay(assay_id: uuid.UUID, request: Request, user: User = WorkerUser, db: Session = Depends(get_db)):
    assay = db.get(AssayResult, assay_id)
    if assay is None:
        raise not_found("Assay")
    ensure_screening_access(db, user, assay.screening)
    audit.record(db, user, "assay.view", "assay_result", assay.id, patient_id=assay.screening.patient_id, request=request)
    db.commit()
    return vision_view(assay.screening)


@router.post("/assays/{assay_id}/analyze", summary="Re-run KAIA Vision with the active model version")
def analyze_assay(assay_id: uuid.UUID, request: Request, user: User = WorkerUser, db: Session = Depends(get_db)):
    assay = db.get(AssayResult, assay_id)
    if assay is None:
        raise not_found("Assay")
    ensure_screening_access(db, user, assay.screening)
    result = analysis.rerun_vision(db, assay, user)
    audit.record(db, user, "assay.reanalyze", "assay_result", assay.id, patient_id=assay.screening.patient_id,
                 request=request, detail={"model_version": result.model_version})
    db.commit()
    db.refresh(assay)
    return vision_view(assay.screening)


@router.get("/files/{path:path}", include_in_schema=False)
def signed_file(path: str, exp: int, sig: str):
    if not verify_file_signature(path, exp, sig):
        raise HTTPException(403, "Link expired or invalid")
    try:
        data = get_storage().read(path)
    except (FileNotFoundError, ValueError):
        raise not_found("File") from None
    return Response(
        content=data,
        media_type=MEDIA_TYPES.get(PurePosixPath(path).suffix, "application/octet-stream"),
        headers={
            "Cache-Control": "private, max-age=300",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
            "X-Content-Type-Options": "nosniff",
        },
    )
