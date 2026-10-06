# KAIA API Reference

The base path is `/api`. Interactive OpenAPI documentation is served at **`/api/docs`** (Swagger) and **`/api/redoc`**.

## Conventions

- **Authentication.** Send `Authorization: Bearer <access_token>`. The refresh token is an httpOnly cookie scoped to `/api/auth`.
- **Validation.** Request bodies are strict: unknown fields produce `422`.
- **Errors.** Errors use `{"detail": "..."}`.
  - `401`: unauthenticated.
  - `403`: role or consent denied.
  - `404`: not found. Patients also get `404` for records that are not theirs.
  - `409`: invalid state transition.
- **Auditing.** Every call that touches patient data writes an audit log entry.
- **Roles.**
  - **P**: patient
  - **HW**: health worker
  - **IA**: institution admin
  - **SA**: KAIA system admin
  - **Any**: any authenticated user
  - "+consent" means the patient must have an active consent for the worker's organization.

## Authentication

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/auth/register` | public | Patient self-registration (`privacy_notice_accepted: true`; adults only; password policy) |
| POST | `/auth/login` | public | Returns `access_token` and sets the refresh cookie. Rate-limited. |
| POST | `/auth/refresh` | cookie | New access token (`204` when there is no session) |
| POST | `/auth/logout` | cookie | Revokes all tokens for the user |
| GET | `/auth/me` | Any | Current user |

```json
POST /api/auth/login
{ "email": "maria.santos@demo.kaia.ph", "password": "KaiaDemo2026!" }
→ { "access_token": "…", "token_type": "bearer", "expires_in": 1800, "user": { "role": "patient", … } }
```

## Patients & KAIA Passport

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/patients/me` | P | Profile (decrypted for the owner only) |
| PATCH | `/patients/me` | P | Phone, barangay, distance category, language |
| GET | `/patients/me/dashboard` | P | Current screening, journey tracker, next best action |
| GET | `/patients/me/screenings` | P | All screenings |
| GET | `/patients/me/passport` | P | Screening timeline (date, event, institution, status, source, verified) |
| POST | `/patients/me/passport` | P | Add a self-reported (unverified) record |
| GET | `/patients/me/referrals` | P | My referrals |
| GET | `/patients/me/access-log` | P | Who accessed my data |

## Kits & screenings

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/kits/register` | P | `{kit_code, site_organization_id, consent_confirmed: true}` → screening |
| GET | `/kits/lookup/{kit_code}` | HW | Kit inventory status |
| POST | `/screenings` | HW | Walk-in: `{patient_code, kit_code, sample_collected, patient_consent_confirmed: true}` |
| GET | `/screenings/{id}` | P / HW+consent | Patient view or provider detail |
| GET | `/screenings/{id}/result` | P / HW+consent | Released result card with disclaimer. Withheld from patients until reviewed. |
| POST | `/screenings/{id}/sample-collected` | P / HW+consent | Sample returned |
| POST | `/screenings/{id}/cartridge` | HW+consent | `{cartridge_code, reader_code, sim_profile?}` inserts into a reader |
| POST | `/screenings/{id}/review` | HW+consent | Clinician approval. `{override_outcome?, notes?}`; a justification is required to override. |
| GET | `/screenings/{id}/care` | P / HW+consent | Care pathway, steps, next best action, facility options (continuity data for providers only) |
| GET | `/screenings/{id}/vision` | HW+consent | KAIA Vision interpretation and Risk Engine decision trace |

## KAIA Reader

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/readers` | HW, IA, SA | Readers (own organization; all for SA; `?organization_id=`) |
| GET | `/readers/{reader_id}` | HW, IA, SA | Detail and the 7 stage definitions (`reader_id` = UUID or `KAIA-RDR-003`) |
| GET | `/readers/{reader_id}/status` | HW, IA, SA | Polling fallback, including the last event |
| POST | `/readers/{reader_id}/start-analysis` | HW+consent | `{screening_id}` → `202`; runs the 7 stages in the background |
| POST | `/readers/{reader_id}/calibrate` | HW, IA, SA | Record calibration |
| POST | `/readers` | SA | Register a reader |
| PATCH | `/readers/{reader_id}` | IA (status, location), SA | Update |
| WS | `/ws/readers/{reader_code}` | HW, IA, SA | First message `{"token": "<access>"}`. Events: `subscribed`, `analysis_started`, `stage_started`, `stage_completed`, `analysis_complete`, `analysis_failed` |

**Stages:**

1. Cartridge verification
2. Sample quality check
3. Assay processing
4. Image capture
5. KAIA Vision analysis
6. Risk engine processing
7. Result generated

## KAIA Vision

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/assays/{id}` | HW+consent | Assay and every AIAnalysis record |
| POST | `/assays/{id}/analyze` | HW+consent | Re-run with the active model version (appends a new AIAnalysis) |
| GET | `/files/{path}?exp=&sig=` | signed URL | Assay image (HMAC, 5-minute expiry) |

Each AIAnalysis stores `image_url`, `model_version`, `signal_intensity`, `control_validity`, `prediction`, `confidence`, `confidence_score`, `regions`, `pipeline` and `timestamp`. No disease probability is ever produced.

## KAIA Care: referrals & follow-up

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/referrals` | P / HW (screening site)+consent | `{screening_id, destination_org_id, preferred_schedule?, notes?, patient_consent_confirmed: true}` |
| GET | `/referrals` | HW | Worklist `?direction=incoming\|outgoing\|all&status=` with continuity risk |
| GET | `/referrals/{id}` | P / HW (source or destination)+consent | Detail, appointments, follow-up events, QR, allowed transitions |
| PATCH | `/referrals/{id}` | P (`scheduled` only) / HW | `{status, scheduled_for?, notes?, completion_outcome?}` |
| POST | `/referrals/verify` | HW | `{token}` from a scanned QR code; authorized facilities only |
| GET | `/referrals/{id}/continuity` | HW | KAIA Continuity Engine prediction |
| POST | `/followups` | P (`attended` self-report) / HW (`reminder_sent`, `outreach_contact`) | Record a follow-up event |
| GET | `/facilities?service=` | Any | Partner facilities |
| GET | `/facilities/{id}` | Any | Facility detail |

**Referral fields:**

- `referral_id`, `patient_id`, `screening_id`
- `source_org`, `destination_org`
- `referral_type`, `priority`, `generated_at`, `preferred_schedule`
- `status`

**Referral state machine:**

```
created ──► scheduled ──► attended ──► completed
   │  ▲          │  ▲
   │  └─ missed ◄┘  └─ (reschedule)
   └──────► cancelled ◄── scheduled / missed
```

Completing a referral requires `completion_outcome`: `return_to_routine_screening` or `continuing_care_at_facility`. KAIA stores pathway outcomes, never diagnoses.

## Health worker

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/worker/dashboard` | HW | Today's screenings, pending analysis, follow-up required, priority, unresolved referrals, readers |
| GET | `/worker/queue` | HW | `?scope=active\|today\|all&status=&q=`: patient code, kit, reader, status, result, referral, next action |
| GET | `/worker/follow-ups` | HW | Active pathways ranked by continuity risk |
| GET | `/worker/patients/lookup?code=` | HW | Patient lookup for walk-in registration |

## KAIA Population (institution analytics)

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/organizations` | IA, SA | Organizations visible to the caller |
| GET | `/organizations/{id}/analytics` | IA (own), SA | Summary, barangay breakdown, monthly cohorts |
| GET | `/organizations/{id}/screening-funnel` | IA (own), SA | Eligible → kit distributed → screened → follow-up required → completed |
| GET | `/organizations/{id}/care-gaps` | IA (own), SA | Program gap alerts with recommendations |
| GET | `/organizations/{id}/overview` | IA (own), SA | Institution dashboard |
| GET | `/organizations/{id}/unresolved-follow-ups` | IA (own), SA | Pseudonymous list with continuity risk |
| GET | `/organizations/{id}/reports/aggregate.csv` | IA (own), SA | CSV export (cells 1–4 suppressed) |
| GET / POST | `/organizations/{id}/staff` | IA (own), SA | Health workers |
| PATCH | `/organizations/{id}/staff/{worker_id}` | IA (own), SA | Activate/deactivate (revokes sessions) |

Example summary:

```json
{ "eligible_population": 5000, "kits_distributed": 3840, "samples_returned": 3210, "valid_screenings": 3105,
  "follow_up_required": 184, "follow_up_completed": 139, "unresolved": 45,
  "participation_rate": 0.621, "follow_up_completion_rate": 0.7554, "avg_days_to_follow_up": 26.6,
  "sample_return_rate": 0.8359 }
```

## Consent, audit & notifications

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/consents` | P | Who can access my data |
| GET | `/consents/grantees` | P | Organizations I can grant access to |
| POST | `/consents` | P | `{scope: screening\|referral\|passport\|anonymous_statistics, organization_id?}` |
| DELETE | `/consents/{id}` | P | Revoke (takes effect immediately) |
| GET | `/audit-logs` | IA (own), SA | `?action=&resource_type=&organization_id=&page=&page_size=` |
| GET | `/notifications` | Any | Latest notifications and unread count |
| POST | `/notifications/{id}/read` | Any | Mark read |
| POST | `/notifications/read-all` | Any | Mark all read |

## Inventory

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/inventory` | HW, IA, SA | Batches: `batch_number`, `manufacture_date`, `expiry_date`, `quantity`, `location`, `status`, and the `low_stock` / `expiring_soon` flags |
| GET | `/inventory/alerts` | HW, IA, SA | Low-stock, expiring, expired and depleted alerts |
| GET | `/inventory/summary` | HW, IA, SA | Kits, cartridges and readers by status |
| POST | `/inventory` | IA (own), SA | Receive a batch |
| PATCH | `/inventory/{id}` | IA (own), SA | `{quantity_delta?, status?, location?, reorder_threshold?}` |

## KAIA system admin

| Method | Path | Description |
|---|---|---|
| GET / POST | `/admin/organizations` | List / create |
| PATCH | `/admin/organizations/{id}` | Update, activate or deactivate |
| GET / POST | `/admin/users` | List (`?role=&q=`) / create staff accounts |
| PATCH | `/admin/users/{id}` | Activate/deactivate (revokes sessions), change organization |
| GET | `/admin/cartridges` | Paged cartridge registry with status counts |
| POST | `/admin/cartridges/generate` | Provision a serialized cartridge lot and its inventory batch |
| GET / POST | `/admin/model-versions` | AI model registry |
| POST | `/admin/model-versions/{id}/activate` | Promote to active (previous active version is retired) |
| POST | `/admin/model-versions/{id}/status?status=` | Move to shadow or retired |
| GET / POST | `/admin/risk-rules` | Rules plus field and operator schema / create |
| PATCH / DELETE | `/admin/risk-rules/{id}` | Edit / delete |
| POST | `/admin/risk-rules/test` | Dry-run the Risk Engine on a hypothetical assay |
| GET | `/admin/pathways` | Care pathway configuration per outcome |
| PATCH | `/admin/pathways/{id}` | Edit recommended action, timeframe and messaging (diagnostic language rejected) |
| GET | `/admin/system-health` | Service checks, counts, reader fleet |
| POST | `/admin/demo/reset` | Re-seed synthetic demo data (disabled in production) |

Risk rule conditions format:

```json
{ "all": [
  { "field": "hpv_signal", "op": "eq", "value": "detected" },
  { "field": "secondary_marker", "op": "eq", "value": "detected" }
] }
```

- **Fields:**
  - `control_valid`
  - `hpv_signal`, `hpv_genotype`, `hpv_signal_intensity`
  - `secondary_marker`, `sample_quality`
  - `prior_high_risk_result`, `prior_missed_follow_up`
  - `age_bracket`
- **Operators:** `eq`, `ne`, `in`, `gte`, `lte`

## Public

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness |
| GET | `/public/barangays` | Barangay names for registration (no personal data) |
