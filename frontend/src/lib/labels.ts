import type { Outcome, ReferralStatus, ScreeningStatus } from "@/lib/types";

export type Tone = "neutral" | "plum" | "lavender" | "success" | "warning" | "priority" | "info";

export const OUTCOME_META: Record<
  Outcome,
  { label: string; short: string; tone: Tone; headline: string; nextStep: string }
> = {
  routine_screening: {
    label: "Low immediate concern",
    short: "Routine",
    tone: "success",
    headline: "No high-risk screening signal was identified in this test.",
    nextStep: "Continue routine screening according to healthcare guidance.",
  },
  follow_up_recommended: {
    label: "Follow-up recommended",
    short: "Follow-up",
    tone: "warning",
    headline: "A screening marker requiring additional evaluation was detected.",
    nextStep: "Confirmatory screening is recommended.",
  },
  priority_follow_up: {
    label: "Priority follow-up",
    short: "Priority",
    tone: "priority",
    headline: "Multiple screening signals suggest that clinical evaluation should be prioritized.",
    nextStep: "Please complete clinical follow-up as soon as practical.",
  },
};

/** Patient-facing wording: plain language, no lab terms, never a diagnosis. Clinician views keep OUTCOME_META. */
export const PATIENT_OUTCOME: Record<Outcome, { title: string; summary: string; nextStep: string }> = {
  routine_screening: {
    title: "No signs of concern found",
    summary: "Your sample did not show anything that needs a follow-up visit right now.",
    nextStep: "Nothing else to do for now. We'll remind you when it's time for your next screening.",
  },
  follow_up_recommended: {
    title: "Follow-up recommended",
    summary: "We found something that should be checked again with a second test. This does not mean you have cancer.",
    nextStep: "Book a follow-up test at a nearby clinic. KAIA can help you choose one and keep track of it.",
  },
  priority_follow_up: {
    title: "Please see a clinician soon",
    summary: "Your sample showed signs that a clinician should look at soon. This does not mean you have cancer.",
    nextStep: "Visit a clinic as soon as you can. KAIA can send a priority referral for you.",
  },
};

export const SCREENING_STATUS_TONE: Record<ScreeningStatus, Tone> = {
  kit_registered: "neutral",
  sample_collected: "lavender",
  cartridge_registered: "info",
  analyzing: "plum",
  pending_review: "warning",
  result_ready: "success",
  invalid_sample: "priority",
};

export const REFERRAL_STATUS_META: Record<ReferralStatus, { label: string; tone: Tone }> = {
  created: { label: "Created", tone: "lavender" },
  scheduled: { label: "Scheduled", tone: "info" },
  attended: { label: "Attended", tone: "plum" },
  completed: { label: "Completed", tone: "success" },
  missed: { label: "Missed", tone: "priority" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const SIGNAL_LABEL: Record<string, string> = {
  detected: "Detected",
  not_detected: "Not detected",
  indeterminate: "Indeterminate",
};

export const GENOTYPE_LABEL: Record<string, string> = {
  hpv_16_18: "HPV 16/18",
  other_high_risk: "Other high-risk type",
  none: "None",
};

export const SIM_PROFILES: { value: string; label: string }[] = [
  { value: "auto", label: "Auto (realistic distribution)" },
  { value: "negative", label: "No high-risk signal" },
  { value: "hpv_other_high_risk", label: "High-risk HPV signal" },
  { value: "hpv_16_18", label: "HPV 16/18 genotype signal" },
  { value: "hpv_with_marker", label: "HPV + secondary biomarker" },
  { value: "invalid", label: "Invalid assay (control fails)" },
];

export const FOLLOW_UP_EVENT_LABEL: Record<string, string> = {
  referral_created: "Referral created",
  appointment_scheduled: "Appointment scheduled",
  reminder_sent: "Reminder sent",
  outreach_contact: "Community outreach contact",
  attended: "Attended appointment",
  missed: "Missed appointment",
  confirmatory_screening_done: "Confirmatory screening done",
  care_completed: "Care completed",
  cancelled: "Referral cancelled",
};

export const SERVICE_LABEL: Record<string, string> = {
  kaia_screening: "KAIA screening",
  kit_distribution: "Kit distribution",
  counseling: "Counseling",
  community_outreach: "Community outreach",
  hpv_vaccination: "HPV vaccination",
  confirmatory_screening: "Confirmatory screening",
  clinical_evaluation: "Clinical evaluation",
  same_week_appointments: "Same-week appointments",
};

export const ORG_TYPE_LABEL: Record<string, string> = {
  lgu_health_office: "LGU health office",
  pharmacy: "Pharmacy",
  clinic: "Clinic",
};
