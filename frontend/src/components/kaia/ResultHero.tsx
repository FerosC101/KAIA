import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { OUTCOME_META } from "@/lib/labels";
import type { Outcome } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Calm, colour-coded screening outcome. Never a full-bleed alarm, never a probability. */
const STYLES: Record<Outcome, { wrap: string; accent: string; icon: ReactNode }> = {
  routine_screening: {
    wrap: "border-success-ring bg-success-soft/70",
    accent: "text-success",
    icon: <CircleCheck className="size-5" />,
  },
  follow_up_recommended: {
    wrap: "border-warning-ring bg-warning-soft/70",
    accent: "text-warning",
    icon: <TriangleAlert className="size-5" />,
  },
  priority_follow_up: {
    wrap: "border-priority-ring bg-priority-soft/70",
    accent: "text-priority",
    icon: <CircleAlert className="size-5" />,
  },
};

export function ResultHero({
  outcome,
  message,
  nextStep,
  footer,
  compact,
  className,
}: {
  outcome: Outcome;
  message?: string;
  nextStep?: string;
  footer?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  const meta = OUTCOME_META[outcome];
  const style = STYLES[outcome];
  return (
    <div className={cn("rounded-card border p-5 sm:p-7", style.wrap, className)}>
      <div className="eyebrow flex items-center gap-2">
        <span className={style.accent}>{style.icon}</span>
        Screening result
      </div>
      <p className={cn("display mt-2.5 text-[26px] sm:text-[30px]", style.accent)}>{meta.label}</p>
      <p className={cn("mt-3 max-w-2xl text-foreground", compact ? "text-sm" : "text-[15px] leading-relaxed")}>{message ?? meta.headline}</p>
      {nextStep && (
        <div className="mt-5 rounded-field border border-border/70 bg-surface/80 px-4 py-3">
          <p className="eyebrow">What happens next</p>
          <p className="mt-1 font-medium text-foreground">{nextStep}</p>
        </div>
      )}
      {footer}
    </div>
  );
}
