/**
 * TEMP — dev-only UI playground at /ui-test.
 * Renders the real patient and portal pages with hardcoded mock data (no backend, no login).
 * Registered only when import.meta.env.DEV; delete this file, its route in App.tsx and setApiMock in lib/api.ts when done.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { PortalLayout } from "@/layouts/PortalLayout";
import { setApiMock } from "@/lib/api";
import { StaticAuthProvider } from "@/lib/auth";
import type { CareView, Facility, JourneyStep, OrgRef, Outcome, PatientDashboard, PatientScreening, ResultCard } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MOCK_ADMIN, MOCK_WORKER, portalMock } from "@/pages/dev/portalMocks";
import Overview from "@/pages/institution/Overview";
import CareJourney from "@/pages/patient/CareJourney";
import Home from "@/pages/patient/Home";
import RegisterKit from "@/pages/patient/RegisterKit";
import Result from "@/pages/patient/Result";
import UsageGuide from "@/pages/patient/UsageGuide";
import WorkerDashboard from "@/pages/worker/Dashboard";
import Vision from "@/pages/worker/Vision";

type View = "register" | "usage" | "tracking" | "result" | "journey" | "queue" | "vision" | "overview";
const PORTAL_VIEWS: View[] = ["queue", "vision", "overview"];
type Stage = "kit_registered" | "pending_review" | "result_ready";
type ResultState = Outcome | "waiting";

// ---------------------------------------------------------------- mock data

const SITES: OrgRef[] = [
  { id: "site-1", name: "San Isidro Rural Health Unit", org_type: "lgu_health_office" },
  { id: "site-2", name: "Botika ng Bayan · Poblacion", org_type: "pharmacy" },
];

const FACILITIES: Facility[] = [
  {
    id: "fac-1",
    name: "Marikina Women's Clinic",
    org_type: "clinic",
    address: "12 J.P. Rizal St, Marikina",
    city: "Marikina",
    phone: null,
    operating_hours: "Mon–Sat · 8:00–17:00",
    services: ["confirmatory_screening", "counseling"],
  },
  {
    id: "fac-2",
    name: "San Isidro Rural Health Unit",
    org_type: "lgu_health_office",
    address: "Barangay Hall Compound, San Isidro",
    city: "Marikina",
    phone: null,
    operating_hours: "Mon–Fri · 8:00–16:00",
    services: ["kaia_screening", "confirmatory_screening"],
  },
];

const JOURNEY_FACILITY: Facility = {
  id: "fac-2",
  name: "San Isidro Rural Health Unit",
  org_type: "lgu_health_office",
  address: "Barangay Hall Compound, San Isidro",
  city: "Marikina",
  phone: null,
  operating_hours: "Mon–Fri · 8:00–16:00",
  services: ["confirmatory_screening", "same_week_appointments"],
  distance_km: 5.2,
};

// Mirrors backend/app/services/care.py::pathway_steps (7 stages); CareJourney groups them into 4 milestones.
const JOURNEY_CARE = {
  pathway: {
    id: "path-1",
    pathway_type: "follow_up_recommended",
    outcome_label: "Follow-up recommended",
    current_stage: "appointment_scheduled",
    status: "active",
    recommended_action: "Confirmatory screening",
    timeframe_days: 28,
    timeframe_label: "Within 4 weeks",
    due_date: "2025-07-12",
    completed_at: null,
  },
  screening: { id: "scr-demo", screening_code: "SCR-26-00417", kit_code: "K26-00921", released_at: "2025-06-14T09:30:00+08:00" },
  steps: [
    { key: "screening_complete", label: "Screening complete", state: "done", date: "2025-06-14T09:30:00+08:00" },
    { key: "follow_up_recommended", label: "Follow-up recommended", state: "done", date: "2025-06-14T09:30:00+08:00" },
    { key: "find_care", label: "Find care", state: "done", date: "2025-06-14T10:05:00+08:00" },
    { key: "referral_generated", label: "Referral generated", state: "done", date: "2025-06-14T10:05:00+08:00" },
    { key: "appointment_scheduled", label: "Appointment", state: "current", date: "2025-06-20T10:00:00+08:00" },
    { key: "confirmatory_screening", label: "Confirmatory screening", state: "pending", date: null },
    { key: "care_completed", label: "Care completed", state: "pending", date: null },
  ],
  next_best_action: null,
  referrals: [
    {
      id: "ref-1",
      referral_code: "REF-26-0193",
      status: "scheduled",
      priority: "standard",
      referral_type: "confirmatory_screening",
      referral_type_label: "Confirmatory screening",
      generated_at: "2025-06-14T10:05:00+08:00",
      preferred_schedule: null,
      source_org: SITES[0],
      destination_org: { id: JOURNEY_FACILITY.id, name: JOURNEY_FACILITY.name, org_type: JOURNEY_FACILITY.org_type },
      appointment_at: "2025-06-20T10:00:00+08:00",
      appointment_status: "scheduled",
    },
  ],
  facility_options: [JOURNEY_FACILITY, ...FACILITIES],
  recommended_facility_id: JOURNEY_FACILITY.id,
} as unknown as CareView;

const step = (key: string, label: string, state: JourneyStep["state"], date: string | null = null, note: string | null = null): JourneyStep => ({
  key,
  label,
  state,
  date,
  note,
});

// Mirrors backend/app/api/serializers.py::journey
const JOURNEYS: Record<Stage, JourneyStep[]> = {
  kit_registered: [
    step("kit_registered", "Kit Registered", "done", "2026-10-02"),
    step("sample_collected", "Sample Collected", "current"),
    step("sample_analyzed", "Sample Analyzed", "pending"),
    step("result_ready", "Result Ready", "pending"),
    step("referral", "Referral", "pending"),
    step("follow_up", "Follow-Up", "pending"),
  ],
  pending_review: [
    step("kit_registered", "Kit Registered", "done", "2026-10-02"),
    step("sample_collected", "Sample Collected", "done", "2026-10-04"),
    step("sample_analyzed", "Sample Analyzed", "done", "2026-10-06"),
    step("result_ready", "Result Ready", "current", null, "Clinician reviewing"),
    step("referral", "Referral", "pending"),
    step("follow_up", "Follow-Up", "pending"),
  ],
  result_ready: [
    step("kit_registered", "Kit Registered", "done", "2026-10-02"),
    step("sample_collected", "Sample Collected", "done", "2026-10-04"),
    step("sample_analyzed", "Sample Analyzed", "done", "2026-10-06"),
    step("result_ready", "Result Ready", "done", "2026-10-08"),
    step("referral", "Referral", "current"),
    step("follow_up", "Follow-Up", "pending"),
  ],
};

const STATUS_LABEL: Record<Stage, string> = {
  kit_registered: "Kit registered",
  pending_review: "Clinician review",
  result_ready: "Result ready",
};

function resultCard(outcome: Outcome): ResultCard {
  return {
    outcome,
    label: outcome,
    message: "",
    next_step: "",
    disclaimer: "This is a screening result and is not a diagnosis. Please discuss it with a healthcare provider.",
    released_at: "2026-10-08T09:30:00Z",
  };
}

function screening(stage: Stage, outcome: Outcome): PatientScreening {
  return {
    id: "scr-demo",
    screening_code: "SCR-26-00417",
    kit_code: "K26-00921",
    status: stage,
    status_label: STATUS_LABEL[stage],
    site: SITES[0],
    registered_at: "2026-10-02T08:00:00Z",
    sample_collected_at: stage === "kit_registered" ? null : "2026-10-04T08:00:00Z",
    analysis_completed_at: stage === "kit_registered" ? null : "2026-10-06T08:00:00Z",
    released_at: stage === "result_ready" ? "2026-10-08T09:30:00Z" : null,
    result: stage === "result_ready" ? resultCard(outcome) : null,
    journey: JOURNEYS[stage],
    care_pathway_id: null,
  };
}

function dashboard(view: View, stage: Stage, outcome: Outcome): PatientDashboard {
  const current = view === "register" ? null : screening(stage, outcome);
  return {
    first_name: "Maria",
    patient_code: "P-00417",
    is_demo: true,
    current_screening: current,
    next_best_action:
      current?.result && outcome !== "routine_screening"
        ? {
            stage: "referral",
            tone: outcome === "priority_follow_up" ? "priority" : "warning",
            title: outcome === "priority_follow_up" ? "See a clinician soon" : "Book your follow-up test",
            description: "Choose a nearby clinic. KAIA will send your referral and keep track of your appointment.",
            timeframe_label: outcome === "priority_follow_up" ? "Within 2 weeks" : "Within 4 weeks",
            due_date: "2026-11-05",
            facility: null,
            referral_id: null,
            referral_status: null,
            actions: [],
          }
        : null,
    can_register_kit: view === "register",
    unread_notifications: 0,
    screening_sites: SITES,
    passport_entries: 3,
    screening_count: 1,
  };
}

const delay = <T,>(value: T) => new Promise<T>((r) => setTimeout(() => r(value), 250));

// ---------------------------------------------------------------- page

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-full bg-sunken p-1">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors",
            v === value ? "bg-surface text-primary shadow-card" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function UiPlayground() {
  // ?view=register|usage|tracking|result|journey|queue|vision|overview opens a screen directly.
  const [view, setView] = useState<View>(() => {
    const v = new URLSearchParams(window.location.search).get("view") as View | null;
    return v && ["register", "usage", "tracking", "result", "journey", ...PORTAL_VIEWS].includes(v) ? v : "register";
  });
  const [stage, setStage] = useState<Stage>("kit_registered");
  const [result, setResult] = useState<ResultState>("routine_screening");
  const outcome: Outcome = result === "waiting" ? "follow_up_recommended" : result;

  // Answer every api() call from mock data while the playground is mounted.
  useLayoutEffect(() => {
    setApiMock((path, { method = "GET" }) => {
      const portal = portalMock(path);
      if (portal !== undefined) return delay(portal);
      if (path === "/patients/me/dashboard") return delay(dashboard(view, stage, outcome));
      if (path === "/kits/register" && method === "POST") return delay(screening("kit_registered", outcome));
      if (path.endsWith("/sample-collected")) return delay(undefined);
      if (path.endsWith("/result")) {
        const ready = result !== "waiting";
        return delay({
          screening_id: "scr-demo",
          screening_code: "SCR-26-00417",
          kit_code: "K26-00921",
          site: SITES[0].name,
          status: ready ? "result_ready" : "pending_review",
          status_label: ready ? "Result ready" : "Your result is being reviewed",
          ready,
          result: ready ? resultCard(outcome) : null,
        });
      }
      if (path.endsWith("/care"))
        return delay(view === "journey" ? JOURNEY_CARE : ({ facility_options: FACILITIES, recommended_facility_id: "fac-1" } as unknown as CareView));
      return delay(null);
    });
    return () => setApiMock(null);
  }, [view, stage, result, outcome]);

  // A fresh cache per scenario so each switch re-renders from its own mock data.
  const scenario = `${view}-${stage}-${result}`;
  const client = useMemo(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }),
    [scenario],
  );

  const viewTabs: [View, string][] = [
    ["register", "Kit registration"],
    ["usage", "Usage guide"],
    ["tracking", "Tracking"],
    ["result", "Result"],
    ["journey", "Care journey"],
    ["queue", "Clinician queue"],
    ["vision", "Assay + AI"],
    ["overview", "Program overview"],
  ];

  // Portal screens: real PortalLayout (dark sidebar) with a mock signed-in clinician; controls float bottom-right.
  if (PORTAL_VIEWS.includes(view)) {
    const page = view === "queue" ? <WorkerDashboard /> : view === "vision" ? <Vision /> : <Overview />;
    return (
      <StaticAuthProvider user={view === "overview" ? MOCK_ADMIN : MOCK_WORKER}>
        <QueryClientProvider key={scenario} client={client}>
          <PortalLayout>{page}</PortalLayout>
        </QueryClientProvider>
        <div className="fixed bottom-4 right-4 z-50 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface/95 p-2 shadow-lift backdrop-blur-md">
          <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">UI playground · mock data</p>
          <Segmented value={view} onChange={setView} options={viewTabs} />
        </div>
      </StaticAuthProvider>
    );
  }

  let page: ReactNode;
  if (view === "register") page = <RegisterKit />;
  else if (view === "usage") page = <UsageGuide />;
  else if (view === "journey") page = <CareJourney />;
  else if (view === "tracking") page = <Home />;
  else page = <Result />;

  return (
    <div className="min-h-dvh bg-background">
      <div className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">UI playground · mock data</p>
            <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">Dev only</span>
          </div>
          <Segmented value={view} onChange={setView} options={viewTabs} />
          {view === "tracking" && (
            <Segmented
              value={stage}
              onChange={setStage}
              options={[
                ["kit_registered", "Kit registered"],
                ["pending_review", "In review"],
                ["result_ready", "Result ready"],
              ]}
            />
          )}
          {(view === "result" || (view === "tracking" && stage === "result_ready")) && (
            <Segmented
              value={result}
              onChange={setResult}
              options={[
                ["routine_screening", "Good"],
                ["follow_up_recommended", "Follow-up"],
                ["priority_follow_up", "Priority"],
                ...(view === "result" ? ([["waiting", "Waiting"]] as [ResultState, string][]) : []),
              ]}
            />
          )}
        </div>
      </div>

      {/* Same frame as PatientLayout's <main> */}
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-6">
        <QueryClientProvider key={scenario} client={client}>
          {page}
        </QueryClientProvider>
      </main>
    </div>
  );
}
