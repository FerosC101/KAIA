# KAIA end-to-end demo script

**About 6 minutes. One message to land:**

> **KAIA does not stop at screening. It follows the woman from sample collection to completed care.**

**Before you start**

- Open the app: `http://localhost:8080` (Docker) or `http://localhost:5173` (dev).
- Use a desktop browser. Narrow the window, or open a phone-sized tab, for Maria's screens.
- The **Demo guide** button (bottom-right, once signed in) switches accounts for each step. Every password is `KaiaDemo2026!`.
- If the demo has already been run: sign in as `sysadmin@demo.kaia.ph` → *System health* → **Reset demo data**.

All people in this demo are synthetic. Maria Santos carries a **DEMO** badge.

---

### 0 · The problem (landing page, 30 s)

Scroll the landing page: *The problem* → *How KAIA works* → *Ecosystem*.

> "Screening fails in two places: women never enter the pathway, or they are lost after an abnormal result. KAIA is built around both."

### 1 · Baseline (Dr. Ramon Bautista, institution admin)

Go to **KAIA Population**. Point at the tiles: **Follow-Up Required 184**, **Follow-Up Completed 139**, **Unresolved 45**.

> "Remember these numbers."

### 2 · Maria registers her kit (mobile view)

Sign in as **Maria**. The home screen invites her to register a kit.

1. **Register KAIA Kit** → Kit ID `K26-00921`.
2. Choose site **Batangas City Health Office** and tick the consent box.
3. Tap **I've returned my sample**. The journey tracker advances.

> "Consent is explicit and specific: Maria chooses which facility can see her screening."

### 3 · Cartridge and reader (Ana Reyes, health worker)

1. Show the **screening queue**: today's metrics, readers, and a row with *Access restricted*, where a patient revoked consent.
2. On Maria's row (`KAIA-USER-0921`), click **Register cartridge**.
3. Enter `KAIA-CAR-00921` and choose reader **KAIA-RDR-003**.
4. The **KAIA Reader** interface shows Reader ID, location, status ONLINE, temperature, firmware, last calibration and the inserted cartridge.
5. Click **Begin Analysis** and watch the seven live stages.

### 4 · KAIA Vision and Risk Engine

Click **Open KAIA Vision**.

- The synthetic assay image shows detected regions: Control Valid, HPV Detected, Secondary Biomarker Not Detected, Sample Quality Good, Assay Confidence High.
- The pipeline runs Image → Region Detection → Signal Quantification → Quality Control → Screening Classification.
- The Risk Engine suggests **Follow-up recommended**. Point at the *Clinical Decision Support · not an autonomous diagnosis* label and the matched rule.

> "No disease probability, anywhere. A clinician approves every result."

Click **Approve & release result**.

### 5 · Maria's result and next step

Switch to **Maria**.

> "Your screening identified a marker requiring additional clinical evaluation. This is not a cancer diagnosis."

Tap **View Next Steps**. **KAIA Care** shows one clear next best action: *Confirmatory cervical-health screening · within 4 weeks · KAIA Women's Health Clinic*, with the pathway below it.

1. **Generate Referral** → confirm consent → the referral **QR code** appears.
2. **Mark Appointment Scheduled**.

### 6 · The clinic closes the loop (Dr. Liza Cruz)

1. **Referrals** shows Maria's incoming referral with a continuity risk badge. Optionally show **Scan referral QR**; only authorized facilities can open it.
2. Open the referral → **Mark attended** → **Mark care completed** (outcome: return to routine screening).
3. **Follow-ups**: the **KAIA Continuity Engine** ranks other women by risk of dropping out, for example *"Follow-up has remained unscheduled for 21 days" → Community health worker outreach*.

### 7 · Maria's KAIA Passport

Switch to **Maria** → **Passport**. The timeline runs:

1. 2014 HPV vaccination (verified)
2. 2023 routine screening (self-reported)
3. 2026 KAIA Screening
4. Clinical Referral (completed, verified)
5. Confirmatory Screening (completed, verified)

Then open **Privacy**: who can access her data, grant or revoke access, and recent access by each institution.

### 8 · The program sees it (Dr. Ramon)

**KAIA Population** now shows **Follow-Up Required 185** and **Follow-Up Completed 140**.

Open **Care gaps**:

- *Barangay San Isidro: participation 34% vs city 62%* → increase kit distribution and community outreach.
- *Barangay Mabini: participation 74%, follow-up completion 41%* → investigate referral accessibility.

> "Has she been screened? Does she need follow-up? Did she actually receive it? KAIA answers all three for every woman, and shows health offices exactly where the pathway breaks."
