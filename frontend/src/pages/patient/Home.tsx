import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BookHeart, Clock3, FlaskConical, PackagePlus, ShieldCheck, Sparkles } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { DemoBadge } from "@/components/kaia/badges";
import { Disclaimer, EmptyState, ErrorBlock, LoadingBlock } from "@/components/kaia/layout-bits";
import { JourneyTracker } from "@/components/kaia/Steps";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { PATIENT_OUTCOME } from "@/lib/labels";
import type { PatientDashboard, PatientScreening } from "@/lib/types";
import { cn, greeting } from "@/lib/utils";

const OUTCOME_BOX = {
  routine_screening: "border-success-ring bg-success-soft text-success",
  follow_up_recommended: "border-warning-ring bg-warning-soft text-warning",
  priority_follow_up: "border-priority-ring bg-priority-soft text-priority",
} as const;

function StatusMessage({ screening }: { screening: PatientScreening }) {
  const qc = useQueryClient();
  const returned = useMutation({
    mutationFn: () => api(`/screenings/${screening.id}/sample-collected`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Thank you — your sample is on its way to the KAIA Reader.");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const box = "mt-5 flex items-start gap-3 rounded-2xl bg-primary-soft/60 p-4 text-sm leading-relaxed text-muted-foreground";
  switch (screening.status) {
    case "kit_registered":
      return (
        <div className="mt-5 space-y-4">
          <div className={box}>
            <FlaskConical className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>
              Collect your sample with the KAIA Collect insert, seal it in the cartridge pouch, and return it to <b className="text-foreground">{screening.site.name}</b>.{" "}
              <Link to="/app/usage-guide" className="font-semibold text-primary hover:underline">
                How to use your kit
              </Link>
            </p>
          </div>
          <Button size="lg" className="w-full rounded-full sm:w-auto" onClick={() => returned.mutate()} disabled={returned.isPending}>
            I've returned my sample <ArrowRight />
          </Button>
        </div>
      );
    case "sample_collected":
    case "cartridge_registered":
      return (
        <div className={box}>
          <Clock3 className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>Your sample was received by {screening.site.name}. It will be analysed on a KAIA Reader soon.</p>
        </div>
      );
    case "analyzing":
      return (
        <div className={box}>
          <Sparkles className="mt-0.5 size-4 shrink-0 animate-pulse-soft text-primary" />
          <p>Your sample is being analysed right now.</p>
        </div>
      );
    case "pending_review":
      return (
        <div className={box}>
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>Your sample has been analysed. A clinician is reviewing it before your result is released — we'll let you know.</p>
        </div>
      );
    case "invalid_sample":
      return (
        <div className="mt-5 space-y-4">
          <div className="flex items-start gap-3 rounded-2xl border border-warning-ring bg-warning-soft p-4 text-sm leading-relaxed text-warning">
            <FlaskConical className="mt-0.5 size-4 shrink-0" />
            <p>Your sample could not be analysed. This is not a result and does not mean anything is wrong. Please collect a new sample with a new kit.</p>
          </div>
          <Button asChild size="lg" variant="outline" className="w-full rounded-full sm:w-auto">
            <Link to="/app/register-kit">Register a new kit</Link>
          </Button>
        </div>
      );
    default:
      return null;
  }
}

export default function Home() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<PatientDashboard>("/patients/me/dashboard"),
    refetchInterval: 15_000,
  });

  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={refetch} />;

  const screening = data.current_screening;
  const result = screening?.result;
  const action = data.next_best_action;

  return (
    <div className="space-y-8">
      <header>
        <div className="eyebrow flex items-center gap-2 text-primary">
          {greeting()}, {data.first_name}
          {data.is_demo && <DemoBadge />}
        </div>
        <h1 className="mt-2.5 text-[30px] leading-tight text-foreground sm:text-[38px]">You're taking care of tomorrow.</h1>
        <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">Here's where you are in your KAIA journey.</p>
      </header>

      {!screening ? (
        <EmptyState
          icon={<PackagePlus />}
          title="Start your KAIA screening"
          description="Register the KAIA Kit you received to begin. It takes less than a minute."
          action={
            <Button asChild size="lg" className="rounded-full">
              <Link to="/app/register-kit">
                Register KAIA Kit <ArrowRight />
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <Card className="overflow-hidden shadow-soft">
            <div className="p-5 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">Your current screening</p>
                  <h2 className="mt-1.5 text-[24px] leading-tight text-foreground">{screening.status_label}</h2>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">Kit {screening.kit_code} · {screening.site.name}</p>
                </div>
                <Badge tone={result ? "success" : "lavender"}>{result ? "Sample analysed" : screening.status_label}</Badge>
              </div>

              {result ? (
                <div className="mt-5">
                  <div className={cn("rounded-2xl border p-4", OUTCOME_BOX[result.outcome])}>
                    <p className="font-serif text-[20px] leading-snug">{PATIENT_OUTCOME[result.outcome].title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-foreground">{PATIENT_OUTCOME[result.outcome].summary}</p>
                  </div>
                  <Disclaimer className="mt-4" />
                  <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                    <Button size="lg" className="rounded-full" onClick={() => navigate(`/app/results/${screening.id}`)}>
                      View results <ArrowRight />
                    </Button>
                    <Button size="lg" variant="outline" className="rounded-full" asChild>
                      <Link to="/app/passport">View KAIA Passport</Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <StatusMessage screening={screening} />
              )}

            </div>
          </Card>

          <section aria-labelledby="track-title" className="space-y-6 pt-2">
            <header className="text-center">
              <h2 id="track-title" className="text-[28px] leading-tight text-foreground sm:text-[32px]">
                Track Your Kit
              </h2>
              <p className="mt-2 text-[15px] text-muted-foreground">See the status of your sample in real time.</p>
            </header>

            <Card className="px-6 py-7 sm:px-8">
              <JourneyTracker steps={screening.journey} layout="vertical" />
            </Card>

            {/* Transparent cut-out of the KAIA Reader, sitting straight on the cream page. 260w for 1x, 520w for 2x+. */}
            <img
              src="/kaia-analyzer-520.webp"
              srcSet="/kaia-analyzer-260.webp 260w, /kaia-analyzer-520.webp 520w"
              sizes="(min-width: 768px) 260px, 220px"
              alt="KAIA Analyzer"
              width={520}
              height={330}
              loading="lazy"
              decoding="async"
              className="pointer-events-none mx-auto mt-6 h-auto w-full max-w-[220px] md:max-w-[260px]"
            />
          </section>

          {action && action.tone !== "success" && (
            <section className="rounded-card border border-border/70 bg-card p-5 shadow-card sm:p-7">
              <p className="eyebrow text-primary">Your next step</p>
              <h2 className="mt-2 text-[24px] leading-tight text-foreground sm:text-[28px]">{action.title}</h2>
              <p className="mt-2.5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">{action.description}</p>
              <p className="mt-4 text-sm text-muted-foreground">
                Recommended: <span className="font-semibold text-foreground">{action.timeframe_label}</span>
              </p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <Button className="w-full rounded-full sm:w-auto" size="lg" onClick={() => navigate(`/app/care/${screening.id}`)}>
                  View care options <ArrowRight />
                </Button>
                <Button className="w-full rounded-full sm:w-auto" size="lg" variant="outline" onClick={() => navigate(`/app/care-journey/${screening.id}`)}>
                  Care journey
                </Button>
              </div>
            </section>
          )}
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Link to="/app/passport" className="group">
          <Card className="flex h-full items-center gap-4 p-5 transition-colors duration-200 group-hover:border-primary/30">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
              <BookHeart className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-foreground">KAIA Passport</p>
              <p className="text-sm text-muted-foreground">{data.passport_entries} screening records</p>
            </div>
            <ArrowRight className="ml-auto size-4 text-subtle" />
          </Card>
        </Link>
        <Link to="/app/privacy" className="group">
          <Card className="flex h-full items-center gap-4 p-5 transition-colors duration-200 group-hover:border-primary/30">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-success-soft text-success">
              <ShieldCheck className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-foreground">Privacy & consent</p>
              <p className="text-sm text-muted-foreground">Control who can see your data</p>
            </div>
            <ArrowRight className="ml-auto size-4 text-subtle" />
          </Card>
        </Link>
      </div>

      {screening && data.can_register_kit && screening.status === "result_ready" && (
        <p className="text-center text-sm text-muted-foreground">
          Received a new kit?{" "}
          <Link to="/app/register-kit" className="font-semibold text-primary hover:underline">
            Register it here
          </Link>
        </p>
      )}
    </div>
  );
}
