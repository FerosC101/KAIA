"""The core KAIA demo: from kit registration to completed care, with program analytics updating."""


def _bcho_summary(client, headers) -> tuple[str, dict]:
    orgs = client.get("/api/organizations", headers=headers).json()
    bcho = next(o for o in orgs if o["name"] == "Batangas City Health Office")
    return bcho["id"], client.get(f"/api/organizations/{bcho['id']}/analytics", headers=headers).json()["summary"]


def test_maria_end_to_end(client, auth):
    ramon, maria, ana, liza = auth("ramon.bautista"), auth("maria.santos"), auth("ana.reyes"), auth("liza.cruz")

    bcho_id, before = _bcho_summary(client, ramon)
    assert before["follow_up_required"] == 184
    assert before["follow_up_completed"] == 139
    assert before["eligible_population"] == 5000

    # 1. Maria registers kit K26-00921
    dash = client.get("/api/patients/me/dashboard", headers=maria).json()
    assert dash["first_name"] == "Maria" and dash["can_register_kit"]
    res = client.post("/api/kits/register", headers=maria,
                      json={"kit_code": "k26-00921", "site_organization_id": bcho_id, "consent_confirmed": True})
    assert res.status_code == 201, res.text
    screening_id = res.json()["id"]

    # 2. Sample returned
    assert client.post(f"/api/screenings/{screening_id}/sample-collected", headers=maria).status_code == 200

    # 3. Health worker inserts cartridge into KAIA-RDR-003
    queue = client.get("/api/worker/queue", headers=ana).json()
    row = next(r for r in queue if r["screening_id"] == screening_id)
    assert row["patient_name"] == "Maria Santos" and row["next_action"] == "register_cartridge"
    res = client.post(f"/api/screenings/{screening_id}/cartridge", headers=ana,
                      json={"cartridge_code": "KAIA-CAR-00921", "reader_code": "KAIA-RDR-003"})
    assert res.status_code == 200, res.text

    # 4–6. Reader → Vision → Risk Engine (background task runs inline under TestClient)
    res = client.post("/api/readers/KAIA-RDR-003/start-analysis", headers=ana, json={"screening_id": screening_id})
    assert res.status_code == 202, res.text
    assert len(res.json()["stages"]) == 7
    vision = client.get(f"/api/screenings/{screening_id}/vision", headers=ana).json()
    assert vision["status"] == "pending_review"
    assay = vision["assay"]
    assert assay["control_valid"] is True
    assert assay["hpv_signal"] == "detected"
    assert assay["secondary_marker"] == "not_detected"
    assert vision["outcome"] == "follow_up_recommended"
    assert vision["decision_trace"]["requires_clinician_review"] is True
    analysis = assay["analyses"][0]
    assert {"image_url", "model_version", "signal_intensity", "control_validity", "prediction", "confidence", "timestamp"} <= analysis.keys()
    assert "probability" not in str(vision).lower()
    image = client.get(analysis["image_url"])
    assert image.status_code == 200 and image.headers["content-type"].startswith("image/svg")

    # Result is withheld from the patient until clinician review
    assert client.get(f"/api/screenings/{screening_id}/result", headers=maria).json()["ready"] is False
    reader = client.get("/api/readers/KAIA-RDR-003", headers=ana).json()
    assert reader["status"] == "online" and reader["current_cartridge"] is None

    res = client.post(f"/api/screenings/{screening_id}/review", headers=ana, json={})
    assert res.status_code == 200, res.text

    # 7. Maria sees a calm, non-diagnostic result
    result = client.get(f"/api/screenings/{screening_id}/result", headers=maria).json()
    assert result["ready"] is True
    assert result["result"]["label"] == "Follow-up recommended"
    assert "not a cancer diagnosis" in result["result"]["message"]
    assert result["result"]["disclaimer"] == "This is a screening result and is not a diagnosis."

    _, mid = _bcho_summary(client, ramon)
    assert mid["follow_up_required"] == 185
    assert mid["follow_up_completed"] == 139

    # 8. KAIA Care next best action (no continuity score exposed to patients)
    care = client.get(f"/api/screenings/{screening_id}/care", headers=maria).json()
    nba = care["next_best_action"]
    assert nba["title"] == "Confirmatory cervical-health screening"
    assert nba["timeframe_label"] == "Within 4 weeks"
    assert "generate_referral" in nba["actions"]
    assert "continuity" not in care
    assert "continuity" in client.get(f"/api/screenings/{screening_id}/care", headers=ana).json()
    destination = care["recommended_facility_id"]
    assert next(f for f in care["facility_options"] if f["id"] == destination)["name"] == "KAIA Women's Health Clinic"

    # 9. Referral generated with QR token
    res = client.post("/api/referrals", headers=maria,
                      json={"screening_id": screening_id, "destination_org_id": destination, "patient_consent_confirmed": True})
    assert res.status_code == 201, res.text
    referral = res.json()
    for field in ("referral_code", "source_org", "destination_org", "referral_type", "priority", "generated_at", "status"):
        assert field in referral
    token = referral["qr"]["token"]
    res = client.patch(f"/api/referrals/{referral['id']}", headers=maria,
                       json={"status": "scheduled", "scheduled_for": "2026-10-01T09:00:00+08:00"})
    assert res.status_code == 200, res.text

    # Patients cannot mark their own care complete
    res = client.patch(f"/api/referrals/{referral['id']}", headers=maria,
                       json={"status": "attended"})
    assert res.status_code == 403

    # Receiving clinic scans the QR; an unrelated pharmacy cannot
    verified = client.post("/api/referrals/verify", headers=liza, json={"token": token})
    assert verified.status_code == 200 and verified.json()["patient"]["name"] == "Maria Santos"
    assert client.post("/api/referrals/verify", headers=auth("joy.villanueva"), json={"token": token}).status_code == 403
    assert client.post("/api/referrals/verify", headers=liza, json={"token": token[:-3] + "abc"}).status_code == 400

    # 10. Appointment attended and care completed
    assert client.patch(f"/api/referrals/{referral['id']}", headers=liza, json={"status": "attended"}).status_code == 200
    res = client.patch(f"/api/referrals/{referral['id']}", headers=liza,
                       json={"status": "completed", "completion_outcome": "return_to_routine_screening"})
    assert res.status_code == 200, res.text

    # 11. Passport updated with verified facility records
    entries = client.get("/api/patients/me/passport", headers=maria).json()["entries"]
    confirmatory = next(e for e in entries if e["title"] == "Confirmatory Screening")
    assert confirmatory["status"] == "Completed" and confirmatory["verified"] is True
    assert any(e["title"] == "KAIA Screening" and "follow-up" in e["status"] for e in entries)
    care = client.get(f"/api/screenings/{screening_id}/care", headers=maria).json()
    assert care["pathway"]["status"] == "completed"

    # 12. Institution dashboard reflects completed care
    _, after = _bcho_summary(client, ramon)
    assert after["follow_up_required"] == 185
    assert after["follow_up_completed"] == 140

    # Maria can see who accessed her data
    log = client.get("/api/patients/me/access-log", headers=maria).json()
    institutions = {entry["institution_name"] for entry in log}
    assert {"Batangas City Health Office", "KAIA Women's Health Clinic"} <= institutions
