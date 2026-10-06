export type Role = "patient" | "health_worker" | "institution_admin" | "system_admin";

export type OrgRef = { id: string; name: string; org_type: string };

export type User = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  organization: OrgRef | null;
  last_login_at: string | null;
  created_at: string;
  is_demo: boolean;
  patient_code?: string;
};

export type AuthSession = { access_token: string; token_type: string; expires_in: number; user: User };

export type Outcome = "routine_screening" | "follow_up_recommended" | "priority_follow_up";

export type ScreeningStatus =
  | "kit_registered"
  | "sample_collected"
  | "cartridge_registered"
  | "analyzing"
  | "pending_review"
  | "result_ready"
  | "invalid_sample";

export type ReferralStatus = "created" | "scheduled" | "attended" | "completed" | "missed" | "cancelled";

export type StepState = "done" | "current" | "pending" | "attention" | "not_needed" | "upcoming";

export type JourneyStep = { key: string; label: string; state: StepState; date: string | null; note: string | null };

export type ResultCard = {
  outcome: Outcome;
  label: string;
  message: string;
  next_step: string;
  disclaimer: string;
  released_at: string;
};

export type PatientScreening = {
  id: string;
  screening_code: string;
  kit_code: string;
  status: ScreeningStatus;
  status_label: string;
  site: OrgRef;
  registered_at: string;
  sample_collected_at: string | null;
  analysis_completed_at: string | null;
  released_at: string | null;
  result: ResultCard | null;
  journey: JourneyStep[];
  care_pathway_id: string | null;
};

export type Facility = {
  id: string;
  name: string;
  org_type: string;
  address: string;
  city: string;
  phone: string | null;
  operating_hours: string | null;
  services: string[];
};

export type NextBestAction = {
  stage: string;
  tone: "success" | "warning" | "priority" | "info";
  title: string;
  description: string;
  timeframe_label: string;
  due_date: string;
  facility: Facility | null;
  referral_id: string | null;
  referral_status: ReferralStatus | null;
  appointment_at?: string;
  actions: string[];
};

export type PatientDashboard = {
  first_name: string;
  patient_code: string;
  is_demo: boolean;
  current_screening: PatientScreening | null;
  next_best_action: NextBestAction | null;
  can_register_kit: boolean;
  unread_notifications: number;
  screening_sites: OrgRef[];
  passport_entries: number;
  screening_count: number;
};

export type PassportEntry = {
  id: string;
  event_date: string;
  event_type: string;
  title: string;
  detail: string | null;
  institution_name: string;
  status: string;
  source: string;
  verified: boolean;
};

export type ReferralSummary = {
  id: string;
  referral_code: string;
  status: ReferralStatus;
  priority: "standard" | "priority";
  referral_type: string;
  referral_type_label: string;
  generated_at: string;
  preferred_schedule: string | null;
  source_org: OrgRef;
  destination_org: OrgRef;
  appointment_at: string | null;
  appointment_status: string | null;
};

export type ContinuityContribution = { factor: string; weight: number; reason: string; intervention: string };

export type Continuity = {
  risk_level: "HIGH" | "MEDIUM" | "LOW";
  score: number;
  reason: string;
  recommended_intervention: string;
  contributions?: ContinuityContribution[];
  features?: Record<string, unknown>;
  model_version?: string;
};

export type FollowUpEvent = {
  id: string;
  event_type: string;
  occurred_at: string;
  source: string;
  verified: boolean;
  notes: string | null;
};

export type ReferralDetail = ReferralSummary & {
  screening: { id: string; screening_code: string; outcome: Outcome; outcome_label: string; released_at: string };
  patient: { patient_code: string; name: string | null; age_bracket: string };
  destination_facility: Facility;
  appointments: { id: string; scheduled_for: string; status: string }[];
  follow_ups: FollowUpEvent[];
  qr: { token: string; url: string };
  allowed_transitions: ReferralStatus[];
  completion_outcomes: Record<string, string>;
  clinical_notes: string | null;
  continuity?: Continuity;
  verified?: boolean;
};

export type PathwayStep = { key: string; label: string; state: StepState; date: string | null; note?: string | null };

export type CareView = {
  pathway: {
    id: string;
    pathway_type: Outcome;
    outcome_label: string;
    current_stage: string;
    status: "active" | "completed" | "closed";
    recommended_action: string;
    timeframe_days: number;
    timeframe_label: string;
    due_date: string;
    completed_at: string | null;
  };
  screening: { id: string; screening_code: string; kit_code: string; released_at: string };
  steps: PathwayStep[];
  next_best_action: NextBestAction;
  referrals: ReferralSummary[];
  facility_options: Facility[];
  recommended_facility_id: string | null;
  continuity?: Continuity;
};

export type Region = {
  key: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  intensity?: number;
  state?: string;
  detection_score: number;
};

export type Analysis = {
  id: string;
  model_version: string;
  analysis_type: string;
  image_url: string;
  regions: Region[];
  signal_intensity: Record<string, number>;
  control_validity: boolean;
  prediction: string;
  confidence: string;
  confidence_score: number;
  pipeline: { key: string; label: string; duration_ms: number; summary: string }[];
  timestamp: string;
};

export type DecisionTrace = {
  label: string;
  engine_version?: string;
  inputs?: Record<string, unknown>;
  matched_rules?: { id: string; name: string; priority: number; outcome: Outcome }[];
  rules_evaluated?: number;
  rule_outcome?: Outcome;
  rule_note?: string;
  model?: { version: string | null; score: number; escalation_threshold: number; escalated: boolean; note: string };
  final_outcome?: Outcome;
  requires_clinician_review?: boolean;
  quality_gate?: string;
  note?: string;
  clinician_override?: { from: Outcome; to: Outcome; at: string };
  reviewed?: boolean;
};

export type VisionView = {
  screening_id: string;
  screening_code: string;
  patient_code: string;
  cartridge_code: string | null;
  reader_code: string | null;
  status: ScreeningStatus;
  status_label: string;
  outcome: Outcome | null;
  outcome_label: string | null;
  decision_trace: DecisionTrace | null;
  released_at: string | null;
  reviewed_at: string | null;
  assay: {
    id: string;
    control_valid: boolean;
    hpv_signal: string;
    hpv_genotype: string | null;
    secondary_marker: string;
    sample_quality: string;
    assay_confidence: string;
    captured_at: string;
    analyses: Analysis[];
  } | null;
  disclaimer: string;
};

export type QueueRow = {
  screening_id: string;
  screening_code: string;
  patient_code: string;
  patient_name: string | null;
  access_restricted: boolean;
  kit_code: string;
  cartridge_code: string | null;
  reader_code: string | null;
  status: ScreeningStatus;
  status_label: string;
  outcome: Outcome | null;
  outcome_label: string | null;
  outcome_released: boolean;
  referral_status: ReferralStatus | null;
  referral_label: string;
  registered_at: string;
  updated_at: string;
  next_action: string | null;
};

export type ScreeningDetail = PatientScreening & {
  patient: { patient_code: string; name: string; age_bracket: string; barangay: string | null; distance_category: string };
  cartridge_code: string | null;
  reader_code: string | null;
  sim_profile: string | null;
  analysis_stage: number;
  outcome: Outcome | null;
  outcome_label: string | null;
  decision_trace: DecisionTrace | null;
  reviewed_at: string | null;
  review_notes: string | null;
  has_assay: boolean;
  next_action: string | null;
};

export type Reader = {
  id: string;
  reader_code: string;
  serial_number: string;
  organization: OrgRef;
  location_name: string;
  status: "online" | "analyzing" | "offline" | "maintenance";
  firmware_version: string;
  temperature_c: number;
  temperature_label: string;
  last_calibration: string;
  last_heartbeat_at: string | null;
  total_analyses: number;
  is_available: boolean;
  current_cartridge: { cartridge_code: string } | null;
  active_screening: {
    id: string;
    screening_code: string;
    patient_code: string;
    status: ScreeningStatus;
    analysis_stage: number;
    sim_profile: string | null;
  } | null;
  stages?: { stage: number; key: string; label: string }[];
  last_event?: ReaderEvent | null;
};

export type ReaderEvent = {
  type: "subscribed" | "analysis_started" | "stage_started" | "stage_completed" | "analysis_complete" | "analysis_failed";
  stage?: number;
  total?: number;
  key?: string;
  label?: string;
  detail?: { message?: string; [k: string]: unknown };
  screening_id?: string;
  message?: string;
  last_event?: ReaderEvent | null;
};

export type ProgramSummary = {
  eligible_population: number;
  kits_distributed: number;
  samples_returned: number;
  valid_screenings: number;
  follow_up_required: number;
  follow_up_completed: number;
  unresolved: number;
  participation_rate: number | null;
  sample_return_rate: number | null;
  follow_up_completion_rate: number | null;
  avg_days_to_follow_up: number | null;
};

export type BarangayRow = {
  barangay_id: string;
  barangay: string;
  eligible_population: number;
  kits_distributed: number;
  samples_returned: number;
  valid_screenings: number;
  follow_up_required: number;
  follow_up_completed: number;
  coverage_rate: number | null;
  sample_return_rate: number | null;
  follow_up_completion_rate: number | null;
  avg_days_to_follow_up: number | null;
};

export type MonthlyRow = {
  month: string;
  kits_distributed: number;
  valid_screenings: number;
  follow_up_required: number;
  follow_up_completed: number;
  referral_completion_rate: number | null;
  avg_days_to_follow_up: number | null;
};

export type GapAlert = {
  id: string;
  barangay: string;
  gap_type: string;
  stage: string;
  severity: "high" | "medium";
  headline: string;
  metrics: { label: string; value: number | null; format: "percent" | "number" | "days" }[];
  recommendation: string;
};

export type Consent = {
  id: string;
  grantee_name: string;
  organization: OrgRef | null;
  scope: "screening" | "referral" | "passport" | "anonymous_statistics";
  scope_label: string;
  status: "granted" | "revoked";
  granted_at: string;
  revoked_at: string | null;
  granted_via: string;
};

export type InventoryBatch = {
  id: string;
  organization: OrgRef;
  item_type: "kit" | "cartridge" | "reader";
  batch_number: string;
  manufacture_date: string;
  expiry_date: string;
  initial_quantity: number;
  quantity: number;
  reorder_threshold: number;
  location: string;
  status: string;
  low_stock: boolean;
  expiring_soon: boolean;
  expired: boolean;
  days_to_expiry: number;
};

export type Notification = {
  id: string;
  title: string;
  body: string;
  category: string;
  link: string | null;
  read: boolean;
  created_at: string;
};
