/** TEMP — mock data for the clinician / program portal screens in the dev /ui-test playground. */
import type { InventoryBatch, OrgRef, QueueRow, Reader, User, VisionView } from "@/lib/types";

const SITE: OrgRef = { id: "org-rhu", name: "San Isidro Rural Health Unit", org_type: "lgu_health_office" };
/** ISO time `minutes` ago, so relative labels ("5 min ago") always read naturally. */
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const NOW = ago(0);

export const MOCK_WORKER: User = {
  id: "u-worker",
  email: "ana.reyes@example.test",
  full_name: "Ana Reyes",
  role: "health_worker",
  is_active: true,
  organization: SITE,
  last_login_at: NOW,
  created_at: "2026-01-10T00:00:00Z",
  is_demo: false,
};

export const MOCK_ADMIN: User = { ...MOCK_WORKER, id: "u-admin", full_name: "Dr. Lea Santos", email: "lea.santos@example.test", role: "institution_admin" };

// ---------------------------------------------------------------- readers & queue

function reader(code: string, status: Reader["status"], cartridge: string | null): Reader {
  return {
    id: code,
    reader_code: code,
    serial_number: `SN-${code.slice(-3)}`,
    organization: SITE,
    location_name: "Lab room 1",
    status,
    firmware_version: "2.4.1",
    temperature_c: 24.6,
    temperature_label: "24.6 °C · normal",
    last_calibration: "2026-10-01",
    last_heartbeat_at: NOW,
    total_analyses: 412,
    is_available: status === "online",
    current_cartridge: cartridge ? { cartridge_code: cartridge } : null,
    active_screening: null,
  };
}

const READERS = [reader("KAIA-RDR-001", "analyzing", "CRT-26-1182"), reader("KAIA-RDR-002", "online", null), reader("KAIA-RDR-003", "maintenance", null)];

function row(p: Partial<QueueRow> & Pick<QueueRow, "patient_code" | "status" | "status_label">): QueueRow {
  return {
    screening_id: `scr-${p.patient_code}`,
    screening_code: `SCR-${p.patient_code}`,
    patient_name: null,
    access_restricted: false,
    kit_code: "K26-00000",
    cartridge_code: null,
    reader_code: null,
    outcome: null,
    outcome_label: null,
    outcome_released: false,
    referral_status: null,
    referral_label: "—",
    registered_at: NOW,
    updated_at: NOW,
    next_action: null,
    ...p,
  };
}

const QUEUE: QueueRow[] = [
  row({ patient_code: "P-00417", patient_name: "Maria Dela Cruz", kit_code: "K26-00921", status: "pending_review", status_label: "Awaiting review", reader_code: "KAIA-RDR-001", outcome: "follow_up_recommended", next_action: "review", updated_at: ago(18) }),
  row({ patient_code: "P-00422", patient_name: "Joy Ramos", kit_code: "K26-00934", status: "analyzing", status_label: "Analyzing", reader_code: "KAIA-RDR-001", next_action: "view_reader", updated_at: ago(5) }),
  row({ patient_code: "P-00431", patient_name: "Liza Mercado", kit_code: "K26-00940", status: "sample_collected", status_label: "Sample received", next_action: "register_cartridge", updated_at: ago(32) }),
  row({ patient_code: "P-00398", patient_name: null, access_restricted: true, kit_code: "K26-00877", status: "kit_registered", status_label: "Kit registered", next_action: "receive_sample", updated_at: ago(960) }),
  row({ patient_code: "P-00376", patient_name: "Rosa Villanueva", kit_code: "K26-00851", status: "result_ready", status_label: "Result released", outcome: "priority_follow_up", outcome_released: true, referral_label: "Not Created", next_action: "create_referral", updated_at: ago(1140) }),
  row({ patient_code: "P-00352", patient_name: "Carmen Bautista", kit_code: "K26-00829", status: "result_ready", status_label: "Result released", outcome: "routine_screening", outcome_released: true, referral_label: "Not needed", updated_at: ago(2880) }),
];

// ---------------------------------------------------------------- KAIA Vision (assay image drawn as SVG)

const intensity = { control: 0.91, hpv: 0.58, genotype: 0.08, secondary: 0.04 };
const LINE_X = { control: 390, hpv: 460, genotype: 530, secondary: 600 };

const ASSAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">
<defs><radialGradient id="g" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#2f2a2d"/><stop offset="1" stop-color="#141113"/></radialGradient></defs>
<rect width="800" height="500" fill="url(#g)"/>
<rect x="100" y="60" width="600" height="380" rx="36" fill="#e9e4dd"/>
<rect x="100" y="60" width="600" height="380" rx="36" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>
<circle cx="200" cy="250" r="56" fill="#d3cabf"/><circle cx="200" cy="250" r="38" fill="#c3b8ab"/>
<rect x="330" y="170" width="320" height="160" rx="10" fill="#f8f4ee" stroke="#cfc5b8" stroke-width="2"/>
${Object.entries(LINE_X)
  .map(([k, x]) => `<rect x="${x - 7}" y="190" width="14" height="120" rx="3" fill="#5c3042" fill-opacity="${intensity[k as keyof typeof intensity]}"/>`)
  .join("")}
<text x="400" y="410" font-family="monospace" font-size="16" fill="#8b8079" text-anchor="middle">KAIA CARTRIDGE · CRT-26-1182</text>
</svg>`;

const lineRegion = (key: keyof typeof LINE_X, label: string, state: string) => ({
  key,
  label,
  x: (LINE_X[key] - 17) / 800,
  y: 0.37,
  w: 34 / 800,
  h: 0.26,
  intensity: intensity[key],
  state,
  detection_score: intensity[key],
});

const VISION: VisionView = {
  screening_id: "scr-P-00417",
  screening_code: "SCR-26-00417",
  patient_code: "P-00417",
  cartridge_code: "CRT-26-1182",
  reader_code: "KAIA-RDR-001",
  status: "pending_review",
  status_label: "Awaiting review",
  outcome: "follow_up_recommended",
  outcome_label: "Follow-up recommended",
  released_at: null,
  reviewed_at: null,
  disclaimer: "This is a screening result and is not a diagnosis.",
  decision_trace: {
    label: "KAIA Risk Engine",
    engine_version: "v1.3",
    matched_rules: [
      { id: "r-hpv", name: "High-risk HPV detected (non-16/18)", priority: 2, outcome: "follow_up_recommended" },
      { id: "r-ctrl", name: "Control line valid", priority: 9, outcome: "routine_screening" },
    ],
    rules_evaluated: 7,
    rule_outcome: "follow_up_recommended",
    rule_note: "Highest-priority rule determines the suggested outcome",
    model: { version: "kaia-prioritizer-0.4", score: 0.31, escalation_threshold: 0.7, escalated: false, note: "" },
    final_outcome: "follow_up_recommended",
    requires_clinician_review: true,
    quality_gate: "passed",
  },
  assay: {
    id: "assay-1",
    control_valid: true,
    hpv_signal: "detected",
    hpv_genotype: null,
    secondary_marker: "not_detected",
    sample_quality: "good",
    assay_confidence: "high",
    captured_at: ago(20),
    analyses: [
      {
        id: "an-1",
        model_version: "kaia-vision-2.1",
        analysis_type: "assay_image",
        image_url: `data:image/svg+xml;utf8,${encodeURIComponent(ASSAY_SVG)}`,
        regions: [
          { key: "sample_well", label: "Sample well", x: 0.18, y: 0.39, w: 0.1375, h: 0.22, detection_score: 0.99 },
          { key: "membrane_window", label: "Membrane window", x: 0.4125, y: 0.34, w: 0.4, h: 0.32, detection_score: 0.98 },
          lineRegion("control", "Control", "valid"),
          lineRegion("hpv", "hrHPV", "detected"),
          lineRegion("genotype", "HPV 16/18", "not_detected"),
          lineRegion("secondary", "Secondary", "not_detected"),
        ],
        signal_intensity: { ...intensity, background: 0.03 },
        control_validity: true,
        prediction: "hpv_detected_non_16_18",
        confidence: "high",
        confidence_score: 0.92,
        pipeline: [
          { key: "capture", label: "Capture", duration_ms: 120, summary: "1 frame" },
          { key: "align", label: "Align", duration_ms: 45, summary: "Fiducials locked" },
          { key: "segment", label: "Segment", duration_ms: 80, summary: "6 regions" },
          { key: "quantify", label: "Quantify", duration_ms: 60, summary: "4 channels" },
          { key: "quality", label: "Quality gate", duration_ms: 20, summary: "Control valid" },
        ],
        timestamp: ago(19),
      },
    ],
  },
};

// ---------------------------------------------------------------- institution overview

const batch = (id: string, number: string, quantity: number, low: boolean, expiring: boolean): InventoryBatch => ({
  id,
  organization: SITE,
  item_type: "cartridge",
  batch_number: number,
  manufacture_date: "2026-03-01",
  expiry_date: "2026-11-02",
  initial_quantity: 500,
  quantity,
  reorder_threshold: 60,
  location: "Store room",
  status: "active",
  low_stock: low,
  expiring_soon: expiring,
  expired: false,
  days_to_expiry: 22,
});

const OVERVIEW = {
  organization: SITE,
  summary: {
    eligible_population: 4820,
    kits_distributed: 1460,
    samples_returned: 1198,
    valid_screenings: 1152,
    follow_up_required: 138,
    follow_up_completed: 104,
    unresolved: 34,
    participation_rate: 0.239,
    sample_return_rate: 0.82,
    follow_up_completion_rate: 0.754,
    avg_days_to_follow_up: 11.4,
  },
  screening_stats: { platform_screenings: 1198, this_month: 86, pending_review: 4, in_progress: 9 },
  referral_status_counts: { created: 12, scheduled: 9, attended: 6, completed: 104, missed: 5, cancelled: 2 },
  continuity_risk: { HIGH: 7, MEDIUM: 15, LOW: 12 },
  devices: READERS.map((r) => ({
    id: r.id,
    reader_code: r.reader_code,
    location_name: r.location_name,
    status: r.status,
    temperature_label: r.temperature_label,
    last_calibration: r.last_calibration,
    calibration_due: r.status === "maintenance",
  })),
  inventory_alerts: [batch("b1", "CRT-B-2611", 42, true, false), batch("b2", "KIT-B-2604", 180, false, true)],
  staff_count: 8,
  privacy_note: "Program views show de-identified, aggregated data only. Individual records require patient consent.",
};

/** Answer a portal API path with mock data, or undefined if it isn't a portal path. */
export function portalMock(path: string): unknown {
  if (path === "/worker/dashboard")
    return {
      organization: SITE,
      worker: { name: MOCK_WORKER.full_name, position: "Midwife" },
      metrics: { todays_screenings: 14, pending_analysis: 3, awaiting_review: 1, follow_up_required: 6, priority_follow_up: 2, unresolved_referrals: 4, cartridges_in_stock: 42 },
      readers: READERS,
    };
  if (path.startsWith("/worker/queue")) return QUEUE;
  if (path.endsWith("/vision")) return VISION;
  if (path === "/organizations") return [SITE];
  if (path.startsWith("/organizations/") && path.endsWith("/overview")) return OVERVIEW;
  if (path === "/notifications") return { unread: 0, items: [] };
  return undefined;
}
