import { Activity, Lightbulb } from "lucide-react";
import { ContinuityBadge } from "@/components/kaia/badges";
import type { Continuity } from "@/lib/types";
import { cn } from "@/lib/utils";

const FACTOR_LABEL: Record<string, string> = {
  unscheduled_days: "Days unscheduled",
  previous_missed_appointments: "Missed appointments",
  distance_category: "Distance to facility",
  facility_availability: "Facility availability",
  referral_priority: "Referral priority",
  previous_follow_up_completed: "Prior follow-up completed",
  appointment_delay_days: "Appointment delay",
};

/** KAIA Continuity Engine — provider-facing. Predicts follow-up drop-off, never disease. */
export function ContinuityPanel({ continuity, className }: { continuity: Continuity; className?: string }) {
  const max = Math.max(0.5, ...(continuity.contributions ?? []).map((c) => Math.abs(c.weight)));
  return (
    <div className={cn("rounded-card border border-border bg-surface p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Activity className="size-4 text-primary" /> Continuity risk
        </div>
        <ContinuityBadge risk={continuity.risk_level} />
      </div>
      <p className="mt-3 text-sm leading-relaxed text-foreground">{continuity.reason}</p>
      <div className="mt-4 flex items-start gap-2.5 rounded-field bg-secondary/60 px-3.5 py-3 text-sm">
        <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" />
        <div>
          <p className="eyebrow">Recommended action</p>
          <p className="mt-0.5 font-medium text-foreground">{continuity.recommended_intervention}</p>
        </div>
      </div>
      {continuity.contributions && continuity.contributions.length > 0 && (
        <div className="mt-5 space-y-2">
          {continuity.contributions.map((c) => (
            <div key={c.factor} className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-2 text-xs">
              <span className="truncate text-muted-foreground">{FACTOR_LABEL[c.factor] ?? c.factor}</span>
              <span className="relative h-1.5 rounded-full bg-muted">
                <span
                  className={cn("absolute inset-y-0 left-0 rounded-full", c.weight >= 0 ? "bg-priority/70" : "bg-success/70")}
                  style={{ width: `${(Math.abs(c.weight) / max) * 100}%` }}
                />
              </span>
              <span className="tabular text-right text-muted-foreground">
                {c.weight > 0 ? "+" : ""}
                {c.weight.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 text-[11px] leading-relaxed text-subtle">
        Score {continuity.score.toFixed(2)} · {continuity.model_version ?? "kaia-continuity-sim"} · predicts follow-up completion only
      </p>
    </div>
  );
}
