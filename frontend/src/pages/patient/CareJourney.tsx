import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CalendarClock, Check, HeartHandshake, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/kaia/layout-bits";
import { Button } from "@/components/ui/button";
import { ApiError, api } from "@/lib/api";
import type { CareView, PatientDashboard, PathwayStep, StepState } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

type Milestone = { key: string; label: string; state: StepState; date: string | null; note?: string | null };

/** The backend's follow-up pathway has 7 stages; patients see them as 4 milestones. */
const GROUPS: { key: string; label: string; stages: string[]; dateFrom?: string }[] = [
  { key: "screening", label: "Screening Complete", stages: ["screening_complete"] },
  { key: "referral", label: "Referral Generated", stages: ["follow_up_recommended", "find_care", "referral_generated", "appointment_scheduled"], dateFrom: "referral_generated" },
  { key: "visit", label: "Clinic Visit", stages: ["confirmatory_screening"] },
  { key: "completed", label: "Care Completed", stages: ["care_completed"] },
];

function milestones(steps: PathwayStep[], routine: boolean): Milestone[] {
  if (routine) return steps;
  return GROUPS.map((g) => {
    const group = steps.filter((s) => g.stages.includes(s.key));
    const states = group.map((s) => s.state);
    const state: StepState =
      states.length && states.every((s) => s === "done")
        ? "done"
        : states.some((s) => s === "attention")
          ? "attention"
          : states.some((s) => s === "current" || s === "done")
            ? "current"
            : "pending";
    const date = (g.dateFrom ? group.find((s) => s.key === g.dateFrom)?.date : null) ?? group.filter((s) => s.date).at(-1)?.date ?? null;
    return { key: g.key, label: g.label, state, date, note: group.find((s) => s.note)?.note };
  });
}

function Dot({ state }: { state: StepState }) {
  if (state === "done")
    return (
      <span className="grid size-8 place-items-center rounded-full bg-success text-white shadow-card">
        <Check className="size-4" strokeWidth={3} />
      </span>
    );
  if (state === "current" || state === "attention")
    return (
      <span className="grid size-8 place-items-center rounded-full bg-primary shadow-button ring-4 ring-primary-soft">
        <span className="size-2.5 rounded-full bg-white" />
      </span>
    );
  return <span className="block size-8 rounded-full border-2 border-input bg-surface" />;
}

function appointmentLabel(iso: string) {
  const time = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }).format(new Date(iso));
  return `${formatDate(iso)} • ${time}`;
}

/** Care Journey: an elongated milestone timeline from screening to completed care, with the active referral inline. */
export default function CareJourney() {
  const params = useParams();
  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<PatientDashboard>("/patients/me/dashboard"),
    enabled: !params.screeningId,
  });
  const screeningId = params.screeningId ?? dashboard.data?.current_screening?.id;
  const care = useQuery({
    queryKey: ["care", screeningId],
    queryFn: () => api<CareView>(`/screenings/${screeningId}/care`),
    enabled: !!screeningId,
  });

  const header = (
    <>
      <Link
        to="/app"
        aria-label="Back to overview"
        className="-ml-2 grid size-11 place-items-center rounded-full text-primary transition-colors hover:bg-primary-soft"
      >
        <ArrowLeft className="size-5" />
      </Link>
      <header className="mt-2 text-center">
        <h1 className="text-[32px] leading-tight text-primary">Care Journey</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">We'll help you complete your next step.</p>
      </header>
    </>
  );
  const shell = (body: ReactNode) => <div className="mx-auto max-w-md">{header}<div className="mt-8">{body}</div></div>;

  if ((!params.screeningId && dashboard.isLoading) || care.isLoading) return shell(<LoadingBlock />);
  if (!screeningId || (care.error instanceof ApiError && care.error.status === 409))
    return shell(
      <EmptyState
        icon={<HeartHandshake />}
        title="Your care journey starts with a result"
        description="Once your screening result is reviewed and released, your next steps will appear here."
      />,
    );
  if (care.error || !care.data) return shell(<ErrorBlock error={care.error} onRetry={care.refetch} />);

  const view = care.data;
  const steps = milestones(view.steps, view.pathway.pathway_type === "routine_screening");
  const referral = view.referrals.find((r) => !["cancelled", "missed"].includes(r.status)) ?? view.referrals[0];
  const facility = referral ? view.facility_options.find((f) => f.id === referral.destination_org.id) : undefined;
  const facilityMeta = [
    facility?.distance_km != null ? `${facility.distance_km.toFixed(1)} km` : facility?.city,
    facility?.services.includes("same_week_appointments") ? "Available slots" : null,
  ].filter(Boolean);

  return shell(
    <ol className="relative">
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        const active = step.state === "current" || step.state === "attention";
        return (
          <li key={step.key} className={cn("relative flex gap-4", !last && "pb-10")}>
            {/* connector runs from this dot to the next one, so the line is continuous */}
            {!last && (
              <span
                aria-hidden
                className={cn("absolute left-[15px] top-8 bottom-0 w-0.5", step.state === "done" ? "bg-success/60" : "bg-border")}
              />
            )}
            <span className="relative z-10 shrink-0">
              <Dot state={step.state} />
            </span>

            <div className="min-w-0 flex-1 pt-1">
              <p className={cn("text-[16px] font-semibold leading-snug", step.state === "pending" || step.state === "upcoming" ? "text-muted-foreground" : active ? "text-primary" : "text-foreground")}>
                {step.label}
              </p>
              <p className={cn("mt-0.5 text-[13px]", step.state === "attention" ? "font-medium text-priority" : "text-muted-foreground")}>
                {step.note ?? (step.state === "pending" || !step.date ? "Pending" : formatDate(step.date))}
              </p>

              {step.key === "referral" && referral && (
                <div className="mt-4 rounded-2xl border border-primary/15 bg-primary-soft/50 p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-primary shadow-card">
                      <MapPin className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold leading-snug text-foreground">{referral.destination_org.name}</p>
                      {facilityMeta.length > 0 && <p className="mt-0.5 text-[13px] text-muted-foreground">{facilityMeta.join(" • ")}</p>}
                    </div>
                  </div>
                  {referral.appointment_at && (
                    <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-[13px] font-medium text-primary shadow-card">
                      <CalendarClock className="size-4" /> {appointmentLabel(referral.appointment_at)}
                    </p>
                  )}
                  <Button asChild variant="outline" className="mt-4 w-full rounded-full border-primary/30 bg-surface text-primary">
                    <Link to={`/app/referrals/${referral.id}`}>
                      View Referral QR <ArrowRight />
                    </Link>
                  </Button>
                </div>
              )}

              {step.key === "referral" && !referral && active && (
                <Button asChild className="mt-4 w-full rounded-full">
                  <Link to={`/app/care/${view.screening.id}`}>
                    Choose a clinic <ArrowRight />
                  </Link>
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ol>,
  );
}
