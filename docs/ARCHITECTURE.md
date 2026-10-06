# KAIA Architecture

KAIA is a modular monolith: one FastAPI service backed by PostgreSQL, with a React single-page app. Every AI and hardware component is isolated behind an interface inside `backend/app/services/`, so a trained model or a physical KAIA Reader can replace a simulator without changing routes, schemas or the UI.

## 1. System architecture

```mermaid
flowchart TD
  subgraph Device["Point of care"]
    COLLECT["KAIA Collect<br/>sample insert"] --> CART["KAIA Cartridge<br/>sealed · serialized"]
    CART --> READER["KAIA Reader<br/>verification · incubation · optics"]
  end

  READER -->|ReaderGateway interface| GATEWAY["Reader API / gateway<br/>(simulated)"]

  subgraph Backend["FastAPI backend"]
    GATEWAY --> ORCH["Analysis orchestrator<br/>7 stages · live events"]
    ORCH --> VISION["KAIA Vision service<br/>region detection → quantification → QC → classification"]
    VISION --> RISK["KAIA Risk Engine<br/>configurable rules + constrained model<br/><i>Clinical Decision Support</i>"]
    RISK --> REVIEW["Clinician review & release"]
    REVIEW --> CARE["KAIA Care<br/>pathways · next best action · referrals"]
    CARE --> CONT["KAIA Continuity Engine<br/>follow-up drop-off risk"]
    ACCESS["Consent & RBAC checks"] -.guards.-> CARE
    AUDIT["Audit log"] -.records.-> ACCESS
  end

  ORCH -. WebSocket .-> PORTAL
  Backend --> DB[("PostgreSQL<br/>encrypted sensitive fields")]
  VISION --> STORE[("Object storage<br/>signed, expiring URLs")]

  DB --> PATIENT["Patient app<br/>KAIA Passport · KAIA Care · Privacy"]
  DB --> PORTAL["Provider portal<br/>Screening queue · Reader · Vision · Referrals"]
  PATIENT --> POP
  PORTAL --> POP["KAIA Population<br/>de-identified aggregates"]
  POP --> LGU["LGU / institutional analytics<br/>funnel · coverage · care gaps"]
```

## 2. Module map (backend)

| Module | Responsibility |
|---|---|
| `core/config.py` | Settings from environment |
| `core/security.py` | bcrypt hashing, JWT access/refresh tokens, HMAC signed file URLs, QR referral tokens |
| `core/crypto.py` | `EncryptedString` column type (Fernet / MultiFernet, key rotation) |
| `core/deps.py` | Authentication dependency and `require_roles(...)` |
| `services/access.py` | **Consent-based access control**: `ensure_screening_access`, `ensure_referral_access`, `ensure_org_scope` |
| `services/audit.py` | Append-only access logging (never health values) |
| `services/screening.py` | Kit registration, sample receipt, cartridge registration, clinician release |
| `services/analysis.py` | Seven-stage reader orchestration, persisted progress, live events, crash recovery |
| `services/reader/` | `ReaderGateway` interface, simulator, synthetic assay image renderer |
| `services/vision/` | `VisionModel` interface and simulated model |
| `services/risk_engine.py` | Rule schema and validation, evaluation, constrained model, decision trace |
| `services/care.py` | Care pathway lifecycle, next best action, referral state machine, passport updates |
| `services/continuity.py` | Feature extraction and follow-up drop-off prediction |
| `services/analytics.py` | Program aggregation, funnel, barangay breakdown, monthly cohorts, care-gap detection, CSV export |
| `services/storage.py` | `StorageBackend` (local; S3/MinIO-ready) |
| `services/events.py` | Reader event bus (in-process; Redis-ready) |

## 3. AI and decision-support design

| Service | Output | Constraint |
|---|---|---|
| KAIA Vision | Control validity, HPV signal, genotype channel, secondary biomarker, sample quality, assay confidence, regions, intensities | Signals only. It never produces a disease probability. |
| KAIA Risk Engine | `routine_screening` · `follow_up_recommended` · `priority_follow_up` | Rules first, and the most protective matching rule wins. The model may escalate follow-up to priority but can never lower an outcome. Every result requires clinician review before release. A full decision trace is stored. |
| KAIA Continuity Engine | `HIGH` / `MEDIUM` / `LOW` risk of not completing follow-up, a reason and an intervention | Predicts care drop-off, never disease. Shown only to providers and administrators. |

If the Vision quality gate fails (invalid control or poor sample), no screening outcome is generated. The patient is asked to recollect, and the message states that this is not a result.

## 4. Database ERD

```mermaid
erDiagram
  ORGANIZATION ||--o{ HEALTH_WORKER : employs
  ORGANIZATION ||--o{ READER : operates
  ORGANIZATION ||--o{ INVENTORY_BATCH : stocks
  ORGANIZATION ||--o{ BARANGAY : "runs program in"
  ORGANIZATION ||--o{ PROGRAM_AGGREGATE : reports
  USER ||--o| PATIENT_PROFILE : has
  USER ||--o| HEALTH_WORKER : "works as"
  USER ||--o{ NOTIFICATION : receives
  USER ||--o{ AUDIT_LOG : performs
  PATIENT_PROFILE ||--o{ SCREENING : undergoes
  PATIENT_PROFILE ||--o{ CONSENT : grants
  PATIENT_PROFILE ||--o{ PASSPORT_EVENT : "keeps"
  INVENTORY_BATCH ||--o{ KIT : contains
  INVENTORY_BATCH ||--o{ CARTRIDGE : contains
  KIT ||--o| SCREENING : "registered as"
  SCREENING ||--o| CARTRIDGE : uses
  READER ||--o{ SCREENING : analyzes
  SCREENING ||--o| ASSAY_RESULT : produces
  ASSAY_RESULT ||--o{ AI_ANALYSIS : "interpreted by"
  MODEL_VERSION ||--o{ AI_ANALYSIS : "produced by"
  SCREENING ||--o| CARE_PATHWAY : opens
  CARE_PATHWAY ||--o{ REFERRAL : generates
  ORGANIZATION ||--o{ REFERRAL : "sends / receives"
  REFERRAL ||--o{ APPOINTMENT : schedules
  REFERRAL ||--o{ FOLLOW_UP : tracks

  USER {
    uuid id PK
    string email UK
    string role
    text full_name "encrypted"
    int token_version "session revocation"
  }
  PATIENT_PROFILE {
    uuid id PK
    string patient_code UK "pseudonymous"
    text birth_date "encrypted"
    string age_bracket
    text phone "encrypted"
    uuid barangay_id FK
    string distance_category
  }
  SCREENING {
    uuid id PK
    string screening_code UK
    uuid patient_id FK
    uuid kit_id FK
    uuid cartridge_id FK
    uuid reader_id FK
    string status
    int analysis_stage
    string outcome
    json decision_trace
    timestamptz released_at
  }
  ASSAY_RESULT {
    uuid id PK
    bool control_valid
    string hpv_signal
    string hpv_genotype
    string secondary_marker
    string sample_quality
    string assay_confidence
    string image_path
  }
  AI_ANALYSIS {
    uuid id PK
    string model_version
    string image_url
    json regions
    json signal_intensity
    bool control_validity
    string prediction
    string confidence
    timestamptz created_at
  }
  CARE_PATHWAY {
    uuid id PK
    string pathway_type
    string current_stage
    string status
    date due_date
    uuid recommended_facility_id FK
  }
  REFERRAL {
    uuid id PK
    string referral_code UK
    uuid patient_id FK
    uuid screening_id FK
    uuid source_org_id FK
    uuid destination_org_id FK
    string referral_type
    string priority
    timestamptz generated_at
    date preferred_schedule
    string status
    text clinical_notes "encrypted"
  }
  FOLLOW_UP {
    uuid id PK
    string event_type
    string source
    bool verified
    text notes "encrypted"
  }
  CONSENT {
    uuid id PK
    uuid organization_id FK
    string scope
    string status
    timestamptz revoked_at
  }
  AUDIT_LOG {
    uuid id PK
    string user_label
    string institution_name
    string action
    string resource_type
    uuid subject_patient_id FK
    timestamptz timestamp
  }
```

Configuration tables not shown as relationships:

- `risk_rules`: configurable Risk Engine rules
- `pathway_configs`: KAIA Care recommendations and patient messaging per outcome
- `model_versions`: AI model registry

## 5. API flows

### 5.1 End-to-end screening → completed care

```mermaid
sequenceDiagram
  autonumber
  actor Maria as Patient
  participant App as Patient app
  participant API as FastAPI
  actor Ana as Health worker
  participant Reader as Reader orchestrator
  participant Vision as KAIA Vision
  participant Risk as Risk Engine
  actor Clinic as Receiving clinic

  Maria->>App: Register kit K26-00921
  App->>API: POST /kits/register (consent_confirmed)
  API-->>API: grant screening consent · passport "In progress" · audit
  Maria->>API: POST /screenings/{id}/sample-collected
  Ana->>API: POST /screenings/{id}/cartridge (KAIA-CAR-00921, KAIA-RDR-003)
  Ana->>API: POST /readers/KAIA-RDR-003/start-analysis
  API-)Reader: background task
  loop 7 stages
    Reader-->>Ana: WS stage_started / stage_completed
  end
  Reader->>Vision: analyze(capture)
  Vision-->>Reader: signals + regions (AIAnalysis stored)
  Reader->>Risk: evaluate(inputs)
  Risk-->>Reader: follow_up_recommended + decision trace
  Reader-->>Ana: WS analysis_complete (status pending_review)
  Ana->>API: POST /screenings/{id}/review (approve)
  API-->>API: release · create CarePathway · generic notification
  Maria->>API: GET /screenings/{id}/result · GET /screenings/{id}/care
  Maria->>API: POST /referrals (destination clinic, consent)
  API-->>API: grant referral consent · QR token · notify clinic
  Maria->>API: PATCH /referrals/{id} {status: scheduled}
  Clinic->>API: POST /referrals/verify {token}
  Clinic->>API: PATCH /referrals/{id} {status: attended}
  Clinic->>API: PATCH /referrals/{id} {status: completed}
  API-->>API: pathway completed · verified passport entries
  Note over API: KAIA Population: follow-up required +1, completed +1
```

### 5.2 Authentication and session refresh

```mermaid
sequenceDiagram
  participant SPA
  participant API
  SPA->>API: POST /auth/login {email, password}
  API-->>SPA: access_token (memory) + Set-Cookie kaia_refresh (httpOnly, SameSite=Strict)
  SPA->>API: GET /… Authorization: Bearer <access>
  API-->>SPA: 401 (expired)
  SPA->>API: POST /auth/refresh (cookie)
  API-->>SPA: new access_token
  SPA->>API: retry request
  SPA->>API: POST /auth/logout
  API-->>API: token_version += 1 (all tokens revoked)
```

### 5.3 Consent-checked data access

```mermaid
flowchart LR
  REQ[Request] --> AUTH{Valid JWT?}
  AUTH -- no --> E401[401]
  AUTH -- yes --> ROLE{Role allowed<br/>for route?}
  ROLE -- no --> E403[403]
  ROLE -- yes --> WHO{Who?}
  WHO -- patient --> OWN{Own record?}
  OWN -- no --> E404[404, existence not revealed]
  OWN -- yes --> OK
  WHO -- health worker --> CONSENT{Active consent for<br/>worker's organization<br/>and required scope?}
  CONSENT -- no --> E403b[403]
  CONSENT -- yes --> OK[Serve minimal view]
  WHO -- admin --> AGG[Aggregate / pseudonymous endpoints only]
  OK --> LOG[Audit log entry]
```

### 5.4 QR referral verification

The QR code encodes `…/portal/referrals/scan?token=<referral-id>.<hmac>`. The token contains no health data. `POST /referrals/verify` checks the HMAC, then applies `ensure_referral_access`. Only the source or destination facility can open the referral, and only with the patient's consent. Every scan is audited.

## 6. KAIA Population data model

Program totals combine two sources:

1. **`program_aggregates`**: de-identified monthly counts per barangay imported from pre-platform records (kits distributed, samples returned, valid screenings, follow-up required and completed, total days to follow-up).
2. **Live platform records**: kits, screenings and care pathways, counted at query time.

Screening-derived metrics are grouped by **month of result** (cohorts), so referral completion for recent months naturally reads as "in progress". Care-gap detection compares each barangay with the city:

- participation more than 15 points below the city average
- follow-up completion below 60%
- sample return below 70%
- average time to follow-up above 45 days

CSV exports suppress counts from 1 to 4.

## 7. Deployment

`docker-compose.yml` runs PostgreSQL, the API and an nginx container that serves the SPA and proxies `/api`, including the WebSocket upgrade. For production:

- set strong `JWT_SECRET`, `FIELD_ENCRYPTION_KEY` and `FILE_URL_SECRET`
- set `ENVIRONMENT=production`, which disables the demo reset
- terminate TLS, set `COOKIE_SECURE=true` and enable HSTS
- move storage to S3/MinIO and reader events to Redis before scaling horizontally
