# KAIA

**AI-Powered Reproductive Health Screening and Care Platform**

> Screen earlier. Understand better. Reach care.

KAIA is a prototype platform for cervical-health screening and care navigation. It follows a woman through the whole journey:

- registering a KAIA Kit
- point-of-care analysis on a KAIA Reader
- AI-assisted assay interpretation
- a clinician-reviewed screening result
- a referral
- tracked follow-up, until confirmatory care is **completed**

De-identified program data then shows health offices where their screening pathway succeeds or loses women.

> **KAIA does not stop at screening. It follows the woman from sample collection to completed care.**

**⚠️ Prototype. KAIA does not diagnose cervical cancer.**

- Outputs are *screening results* and *follow-up recommendations* that require clinician review.
- The Reader, KAIA Vision and the Continuity Engine are **simulated**.
- All people and records are **synthetic**.

---

## Contents

- [Quick start (Docker)](#quick-start-docker)
- [Local development](#local-development)
- [Demo accounts](#demo-accounts)
- [The 5-minute demo](#the-5-minute-demo)
- [What's in the platform](#whats-in-the-platform)
- [Architecture](#architecture)
- [Security & privacy](#security--privacy)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Connecting real AI models and hardware](#connecting-real-ai-models-and-hardware)
- [Documentation](#documentation)

---

## Quick start (Docker)

```bash
cp .env.example .env          # optional for local demo; required secrets for anything shared
docker compose up --build
```

| Service | URL |
|---|---|
| Web app | http://localhost:8080 |
| API docs (Swagger) | http://localhost:8080/api/docs |
| API docs (ReDoc) | http://localhost:8080/api/redoc |

The API container runs `alembic upgrade head` and then seeds synthetic demo data when the database is empty.

**Optional services.** Redis and MinIO can be started with `docker compose --profile extras up`. The storage and reader-event interfaces are designed to be swapped onto them; the prototype does not require either.

## Local development

**Requirements:** Python 3.12, Node 20+, PostgreSQL 14+.

### Backend

```bash
createdb kaia
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example ../.env    # set DATABASE_URL (and secrets)
alembic upgrade head
python -m app.seed            # --reset wipes and re-seeds
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173 (proxies /api and WebSockets to :8000)
```

For a production build, run `npm run build`. It type-checks and outputs to `frontend/dist`. The app is an installable **PWA** (manifest and a service worker that caches the app shell only). Health data is never cached.

## Demo accounts

Every demo account uses the password **`KaiaDemo2026!`**. The sign-in page also has one-click demo buttons.

| Role | Name | Email |
|---|---|---|
| Patient (DEMO) | Maria Santos | `maria.santos@demo.kaia.ph` |
| Health worker · Batangas City Health Office | Ana Reyes | `ana.reyes@demo.kaia.ph` |
| Health worker · KAIA Women's Health Clinic | Dr. Liza Cruz | `liza.cruz@demo.kaia.ph` |
| Health worker · KAIA Partner Pharmacy | Joy Villanueva | `joy.villanueva@demo.kaia.ph` |
| Institution admin · Batangas City Health Office | Dr. Ramon Bautista | `ramon.bautista@demo.kaia.ph` |
| Institution admin · KAIA Women's Health Clinic | Teresa Lim | `teresa.lim@demo.kaia.ph` |
| KAIA system admin | KAIA Platform Operations | `sysadmin@demo.kaia.ph` |

### Seeded data

- **Organizations:** 3 — Batangas City Health Office, KAIA Partner Pharmacy, KAIA Women's Health Clinic.
- **Readers:** 5, including one offline and one with a cartridge already inserted.
- **Patients and screenings:** 50 synthetic patients and 100 screening records, covering every screening, referral and appointment state.
- **Barangay analytics:** 12 barangays, with de-identified program history that reproduces the reference figures (5,000 eligible → 184 follow-up required → 139 completed).
- **Inventory, models and rules:** inventory batches with low-stock and expiry alerts, AI model versions (active, shadow and retired), and the default Risk Engine rules.

## The 5-minute demo

The in-app **Demo guide** button (bottom-right) walks through each step and switches accounts for you. Full presenter script: [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md).

| # | Who | Action | What it shows |
|---|---|---|---|
| 0 | Dr. Ramon | KAIA Population | Follow-Up Required **184**, Completed **139** |
| 1 | Maria | Register Kit **K26-00921** at Batangas City Health Office | Consent-based kit registration |
| 2 | Maria | "I've returned my sample" | Journey tracker advances |
| 3 | Ana | Queue → Register cartridge **KAIA-CAR-00921** → **KAIA-RDR-003** | Chain of custody |
| 4 | Ana | **Begin Analysis** | Live 7-stage reader over WebSocket |
| 5 | Ana | KAIA Vision: Control *Valid* · HPV *Detected* · Secondary *Not detected* | Signals only, with region overlays, and no disease probability |
| 6 | Ana | Risk Engine suggests **Follow-up recommended** → *Approve & release* | Clinical decision support with a human in the loop |
| 7 | Maria | "Your screening identified a marker requiring additional clinical evaluation. This is not a cancer diagnosis." | Calm, non-diagnostic results |
| 8 | Maria | KAIA Care → *Confirmatory cervical-health screening, within 4 weeks* | Next best action |
| 9 | Maria | Generate Referral → KAIA Women's Health Clinic → Mark Appointment Scheduled | QR referral |
| 10 | Dr. Liza | Referrals → Maria → Mark attended → Mark care completed | Receiving facility closes the loop |
| 11 | Maria | KAIA Passport | Verified facility records |
| 12 | Dr. Ramon | KAIA Population | **185** required · **140** completed |

**Re-running the demo:** sign in as the system admin → *System health* → **Reset demo data**. From the CLI, run `python -m app.seed --reset`.

## What's in the platform

**Patient app** (mobile-first)
- **Dashboard:** current screening, journey tracker and next step.
- **Kit registration:** includes a consent step.
- **Screening results:** three calm states, always with "This is a screening result and is not a diagnosis."
- **KAIA Care:** next best action, facility details, referral with QR code, appointment tracking and attendance self-report.
- **KAIA Passport:** verified and unverified screening timeline; past records can be added.
- **Privacy:** who can access my data, grant/revoke access, and an access history built from audit logs.

**Health-worker portal**
- **Screening queue:** live metrics; actions for walk-in registration, sample receipt, cartridge registration, analysis and review.
- **KAIA Reader interface:** live status, calibration, simulator profile, and the animated 7-stage analysis.
- **KAIA Vision:**
  - image with region-detection overlays
  - signal intensities
  - processing pipeline
  - stored model and version record
  - re-run with the active model
  - clinician approve / override with justification
- **Referrals:**
  - incoming and outgoing worklists
  - QR scanning (camera via `jsQR`, or paste the link)
  - status transitions and outreach logging
- **Follow-ups:** ranked by the **KAIA Continuity Engine** (risk, reason, recommended intervention).

**Institution admin**
- **Overview:** hero follow-up completion rate, continuity risk, referral status, devices and inventory alerts.
- **KAIA Population:**
  - screening funnel and coverage by barangay
  - referral completion rate and average time to follow-up
  - screening activity and required-vs-completed charts, each with a table view
  - CSV export with small-cell suppression
- **Program gap detection:** e.g. *San Isidro participation 34% vs city 62%* and *Mabini follow-up completion 41%*, each with a recommendation.
- **Operations:** unresolved follow-ups (pseudonymous), inventory, health workers, device status and audit log.

**KAIA system admin**
- **System health:** service checks and demo reset.
- **Registries:** organizations, users, readers and test cartridges (lot provisioning).
- **AI model versions:** active, shadow and retired; promote or retire.
- **Risk Engine:** rule editor, dry-run tester and care-pathway messaging.
- **Audit logs.**

## Architecture

```mermaid
flowchart TD
  C[KAIA Collect / Cartridge] --> R[KAIA Reader]
  R --> RA[Reader gateway API]
  RA --> API[FastAPI backend]
  API --> V[KAIA Vision service]
  V --> RE[KAIA Risk Engine]
  RE --> DB[(PostgreSQL)]
  DB --> PA[Patient app<br/>KAIA Passport · KAIA Care]
  DB --> PP[Provider portal<br/>Screening queue · Referral management]
  PA --> POP[KAIA Population]
  PP --> POP
  POP --> LGU[LGU / institutional analytics]
```

| Layer | Stack |
|---|---|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS 4, shadcn-style Radix components, React Router 7, TanStack Query 5, Recharts 3 |
| Design | KAIA brand system — Playfair Display headlines, Inter UI, semantic design tokens (deep plum, muted burgundy, soft lavender, warm ivory, muted green, deep charcoal) |
| Backend | FastAPI, SQLAlchemy 2, Alembic, Pydantic 2, PyJWT, bcrypt, cryptography (Fernet) |
| Database | PostgreSQL |
| Realtime | WebSocket reader events with a polling fallback |

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the module map, ERD, API flow diagrams and design decisions.

### Design system

The interface follows one brand identity across the public site, patient app, provider portal, reader interface and institution dashboards.

- **Tokens.** All colour, radius, shadow and type values live as semantic tokens in [`frontend/src/index.css`](frontend/src/index.css) (`--color-primary`, `--color-success`, `--radius-card`…). Components never hardcode brand hexes, so re-theming happens in one file.
- **Type.** Playfair Display (`.display`) for page introductions and patient-facing statements; Inter for all data, tables, forms and navigation.
- **Surfaces.** Warm ivory canvas, warm-white cards with a 1px hairline, 16px radius and restrained shadow. Buttons are 10px — pills are reserved for status chips.
- **Colour as communication.** Muted green for completed care, lavender for in progress, amber for follow-up, muted burgundy for attention. Never an alarm red.
- **Charts.** The chart palette is validated for colour-blind separation and contrast; every chart ships a table view.

## Security & privacy

Reproductive-health data is treated as highly sensitive:

- **Server-side authorization everywhere.**
  - Role-based dependencies on every route.
  - **Consent-based access checks.** A health worker sees a patient's records only while the patient's consent for that organization and scope is active; revoking consent blocks access immediately.
  - Institution and system admins see aggregate or pseudonymous data only.
- **Authentication.**
  - Short-lived JWT access tokens are held in memory, never in `localStorage`.
  - Refresh tokens live in `httpOnly`, `SameSite=Strict` cookies.
  - Logout revokes all tokens.
  - Login is rate-limited.
  - Passwords are hashed with bcrypt and must meet a strength policy.
- **Field-level encryption** (Fernet, with rotatable keys) for names, birth dates, contact details and clinical notes.
- **Audit logs** for every data access: user, institution, action, resource, timestamp and IP. Health values are never logged. Patients can see who accessed their data.
- **Minimal data exposure.**
  - Notifications are content-free, so they are safe on a lock screen.
  - Population analytics carry no identifiers.
  - Exports suppress cells below 5.
- **Secure files.** Assay images are served only through HMAC-signed URLs that expire after 5 minutes, with restrictive CSP headers.
- **Validation and headers.**
  - Strict request validation: unknown fields are rejected and inputs constrained.
  - Security headers are set.
  - HTTPS-ready: `COOKIE_SECURE`, HSTS, proxy headers.
- **QR referrals** encode only an opaque signed token. Only the named source or destination facility, with consent, can open them.

## Testing

```bash
createdb kaia_test
cd backend
TEST_DATABASE_URL=postgresql+psycopg://USER:PASS@localhost:5432/kaia_test pytest -q
```

The suite (20 tests) includes an **end-to-end test of the full Maria scenario**, asserting 184 → 185 and 139 → 140. It also covers:

- RBAC, and consent revocation blocking a health worker
- encryption at rest, signed URLs and token revocation
- Risk Engine outcomes and model constraints
- Continuity Engine predictions
- care-gap detection

## Project structure

```
KAIA/
├── docker-compose.yml · .env.example
├── docs/                         ARCHITECTURE.md · API.md · DEMO_SCRIPT.md · schema.sql
├── backend/
│   ├── alembic/versions/         0001_initial_schema.py
│   ├── app/
│   │   ├── main.py               app, middleware, router registration
│   │   ├── core/                 config, security (JWT, bcrypt, signed URLs), field encryption, RBAC deps
│   │   ├── models/               SQLAlchemy entities (identity, devices, screening, care, privacy)
│   │   ├── schemas/inputs.py     strict request schemas
│   │   ├── api/routes/           auth, patients, screenings, readers, assays, referrals, worker,
│   │   │                         organizations, inventory, privacy (consent/audit/notifications), admin
│   │   ├── services/
│   │   │   ├── reader/           ReaderGateway interface + simulator + synthetic assay imaging
│   │   │   ├── vision/           VisionModel interface + simulated model
│   │   │   ├── risk_engine.py    configurable rules + constrained model (decision support)
│   │   │   ├── continuity.py     KAIA Continuity Engine (follow-up drop-off risk)
│   │   │   ├── analysis.py       7-stage reader orchestration + live events
│   │   │   ├── care.py           care pathways, next best action, referrals
│   │   │   ├── analytics.py      KAIA Population & care-gap detection
│   │   │   └── access.py · audit.py · storage.py · events.py
│   │   └── seed.py               deterministic synthetic data
│   └── tests/
└── frontend/
    ├── public/                   manifest, service worker, icons
    └── src/
        ├── components/ui/        buttons, cards, dialogs, tabs, tables…
        ├── components/kaia/      journey tracker, result hero, assay viewer, charts, demo guide…
        ├── layouts/              patient (mobile) and portal (sidebar) shells
        ├── lib/                  API client, auth, types, labels
        └── pages/                public · patient · worker · institution · admin · shared
```

## Connecting real AI models and hardware

The AI and device layers sit behind interfaces, so real components replace the simulations without platform changes:

| Component | Interface | Current implementation |
|---|---|---|
| KAIA Reader | `services/reader/base.py` → `ReaderGateway` (`verify_cartridge`, `check_sample_quality`, `process_assay`, `capture`) | `SimulatedReaderGateway` |
| KAIA Vision | `services/vision/base.py` → `VisionModel.analyze(capture) → VisionResult` | `SimulatedVisionModel` |
| Risk Engine model | `risk_engine.model_score` (may escalate, never de-escalate) | logistic simulation |
| Continuity Engine | `continuity.predict(features) → ContinuityPrediction` | transparent logistic simulation |
| Object storage | `services/storage.py` → `StorageBackend` (`save`, `read`) | local filesystem |
| Reader events | `services/events.py` → `publish` / `subscribe` | in-process bus (use Redis pub/sub for multi-worker) |

Every AI analysis stores the model version, signal intensities, control validity, prediction, confidence and timestamp. Versions are promoted from *shadow* to *active* in the admin console.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): system architecture, module map, ERD and API flow diagrams.
- [`docs/API.md`](docs/API.md): REST and WebSocket reference (live OpenAPI at `/api/docs`).
- [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md): presenter script for the end-to-end demo.
- [`docs/schema.sql`](docs/schema.sql): PostgreSQL DDL generated from the Alembic migration.
