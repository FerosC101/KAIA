import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BookHeart, Clock3, FlaskConical, PackagePlus, ShieldCheck, Sparkles } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { DemoBadge } from "@/components/kaia/badges";
import { Disclaimer, EmptyState, ErrorBlock, LoadingBlock, SectionTitle } from "@/components/kaia/layout-bits";
import { JourneyTracker } from "@/components/kaia/Steps";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { OUTCOME_META } from "@/lib/labels";
import type { PatientDashboard, PatientScreening } from "@/lib/types";
import { cn, greeting } from "@/lib/utils";

const OUTCOME_TEXT = {
  routine_screening: "text-success",
  follow_up_recommended: "text-warning",
  priority_follow_up: "text-priority",
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

  const box = "mt-5 flex items-start gap-3 rounded-field border border-border bg-muted/50 p-4 text-sm leading-relaxed text-muted-foreground";
  switch (screening.status) {
    case "kit_registered":
      return (
        <div className="mt-5 space-y-4">
          <div className={box}>
            <FlaskConical className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>
              Collect your sample with the KAIA Collect insert, seal it in the cartridge pouch, and return it to <b className="text-foreground">{screening.site.name}</b>.
            </p>
          </div>
          <Button className="w-full sm:w-auto" onClick={() => returned.mutate()} disabled={returned.isPending}>
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
          <div className="flex items-start gap-3 rounded-field border border-warning-ring bg-warning-soft/70 p-4 text-sm leading-relaxed text-warning">
            <FlaskConical className="mt-0.5 size-4 shrink-0" />
            <p>Your sample could not be analysed. This is not a result and does not mean anything is wrong. Please collect a new sample with a new kit.</p>
          </div>
          <Button asChild variant="outline">
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
        <h1 className="display mt-2.5 text-[30px] text-foreground sm:text-[38px]">You're taking care of tomorrow.</h1>
        <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">Here's where you are in your KAIA journey.</p>
      </header>

      {!screening ? (
        <EmptyState
          icon={<PackagePlus />}
          title="Start your KAIA screening"
          description="Register the KAIA Kit you received to begin. It takes less than a minute."
          action={
            <Button asChild size="lg">
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
                  <h2 className="display mt-1.5 text-[22px] text-foreground">
                    {result ? OUTCOME_META[result.outcome].label : screening.status_label}
                  </h2>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">Kit {screening.kit_code} · {screening.site.name}</p>
                </div>
                <Badge tone={result ? "success" : "lavender"}>{result ? "Sample analysed" : screening.status_label}</Badge>
              </div>

              {result ? (
                <div className="mt-5">
                  <p className={cn("text-[15px] font-medium leading-relaxed", OUTCOME_TEXT[result.outcome])}>{result.message}</p>
                  <Disclaimer className="mt-4" />
                  <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                    <Button size="lg" onClick={() => navigate(`/app/results/${screening.id}`)}>
                      View results <ArrowRight />
                    </Button>
                    <Button size="lg" variant="outline" asChild>
                      <Link to="/app/passport">View KAIA Passport</Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <StatusMessage screening={screening} />
              )}

              <div className="mt-7 border-t border-border pt-6">
                <SectionTitle>Progress</SectionTitle>
                <JourneyTracker steps={screening.journey} />
              </div>
            </div>
          </Card>

          {action && action.tone !== "success" && (
            <section className="rounded-card border border-border bg-surface p-5 shadow-soft sm:p-7">
              <p className="eyebrow text-primary">Your next step</p>
              <h2 className="display mt-2 text-[24px] text-foreground sm:text-[28px]">{action.title}</h2>
              <p className="mt-2.5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">{action.description}</p>
              <p className="mt-4 text-sm text-muted-foreground">
                Recommended: <span className="font-semibold text-foreground">{action.timeframe_label}</span>
              </p>
              <Button className="mt-5" size="lg" onClick={() => navigate(`/app/care/${screening.id}`)}>
                View care options <ArrowRight />
              </Button>
            </section>
          )}
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Link to="/app/passport" className="group">
          <Card className="flex h-full items-center gap-4 p-5 transition-colors duration-200 group-hover:border-primary/30">
            <span className="grid size-11 shrink-0 place-items-center rounded-field bg-secondary text-primary">
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
            <span className="grid size-11 shrink-0 place-items-center rounded-field bg-success-soft text-success">
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
