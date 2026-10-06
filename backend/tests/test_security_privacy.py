from datetime import date

from sqlalchemy import select, text

from app.core.security import sign_file_path
from app.db.session import SessionLocal
from app.models import Kit, Organization
from app.models.enums import KitStatus


def test_requires_authentication(client):
    assert client.get("/api/patients/me").status_code == 401
    assert client.get("/api/worker/queue").status_code == 401


def test_role_based_access(client, auth):
    maria, ana, ramon = auth("maria.santos"), auth("ana.reyes"), auth("ramon.bautista")
    assert client.get("/api/worker/queue", headers=maria).status_code == 403
    assert client.get("/api/admin/users", headers=ramon).status_code == 403
    assert client.get("/api/patients/me/dashboard", headers=ana).status_code == 403

    orgs = client.get("/api/organizations", headers=auth("sysadmin")).json()
    kwhc = next(o for o in orgs if o["name"] == "KAIA Women's Health Clinic")
    assert client.get(f"/api/organizations/{kwhc['id']}/analytics", headers=ramon).status_code == 403


def test_population_dashboard_has_no_identifiers(client, auth):
    ramon = auth("ramon.bautista")
    bcho = client.get("/api/organizations", headers=ramon).json()[0]
    body = client.get(f"/api/organizations/{bcho['id']}/analytics", headers=ramon).text
    for identifier in ("Santos", "KAIA-USER", "@demo.kaia.ph", "birth"):
        assert identifier not in body


def test_consent_revocation_blocks_health_worker(client, auth):
    with SessionLocal() as db:
        bcho = db.scalar(select(Organization).where(Organization.code == "BCHO"))
        kit = db.scalar(select(Kit).where(Kit.organization_id == bcho.id, Kit.status == KitStatus.distributed,
                                          Kit.kit_code != "K26-00921"))
        kit_code, bcho_id = kit.kit_code, str(bcho.id)

    res = client.post("/api/auth/register", json={
        "email": "consent.test@example.org", "password": "Str0ngPassphrase", "full_name": "Test Patient",
        "birth_date": "1990-01-01", "privacy_notice_accepted": True,
    })
    assert res.status_code == 201, res.text
    patient = {"Authorization": f"Bearer {res.json()['access_token']}"}
    screening = client.post("/api/kits/register", headers=patient,
                            json={"kit_code": kit_code, "site_organization_id": bcho_id, "consent_confirmed": True}).json()

    ana = auth("ana.reyes")
    assert client.get(f"/api/screenings/{screening['id']}", headers=ana).status_code == 200

    consent = next(c for c in client.get("/api/consents", headers=patient).json()
                   if c["scope"] == "screening" and c["status"] == "granted")
    assert client.delete(f"/api/consents/{consent['id']}", headers=patient).status_code == 200

    assert client.get(f"/api/screenings/{screening['id']}", headers=ana).status_code == 403
    row = next(r for r in client.get("/api/worker/queue", headers=ana).json() if r["screening_id"] == screening["id"])
    assert row["access_restricted"] is True and row["patient_name"] is None

    logs = client.get("/api/audit-logs?action=consent", headers=auth("sysadmin")).json()
    assert any(item["action"] == "consent.revoke" for item in logs["items"])


def test_sensitive_fields_encrypted_at_rest():
    with SessionLocal() as db:
        raw = db.execute(text("SELECT full_name FROM users WHERE email = 'maria.santos@demo.kaia.ph'")).scalar_one()
        birth = db.execute(text("SELECT birth_date FROM patient_profiles WHERE patient_code = 'KAIA-USER-0921'")).scalar_one()
    assert "Maria" not in raw and raw.startswith("gAAAA")
    assert "1991" not in birth


def test_signed_file_urls(client):
    url = sign_file_path("assays/does-not-matter.svg")
    tampered = url.replace("sig=", "sig=0")
    assert client.get(tampered).status_code == 403
    assert client.get(url.split("?")[0] + "?exp=1&sig=abc").status_code == 403


def test_password_policy_and_validation(client):
    weak = client.post("/api/auth/register", json={
        "email": "weak@example.org", "password": "short", "full_name": "X", "birth_date": date(1990, 1, 1).isoformat(),
        "privacy_notice_accepted": True,
    })
    assert weak.status_code == 422
    extra = client.post("/api/auth/login", json={"email": "a@example.org", "password": "x", "role": "system_admin"})
    assert extra.status_code == 422


def test_logout_revokes_tokens(client):
    res = client.post("/api/auth/login", json={"email": "grace.aquino@demo.kaia.ph", "password": "KaiaDemo2026!"})
    headers = {"Authorization": f"Bearer {res.json()['access_token']}"}
    assert client.get("/api/auth/me", headers=headers).status_code == 200
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me", headers=headers).status_code == 401
