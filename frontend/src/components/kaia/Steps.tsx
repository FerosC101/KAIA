import { AlertTriangle, Check, Minus } from "lucide-react";
import type { JourneyStep, PathwayStep, StepState } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

const STATE_TEXT: Partial<Record<StepState, string>> = {
  current: "Current",
  pending: "Pending",
  not_needed: "Not needed",
  attention: "Needs attention",
  upcoming: "Upcoming",
};

/** Completed = green check · current = brand ring · pending = hollow circle. */
function StepDot({ state }: { state: StepState }) {
  if (state === "done")
    return (
      <span className="grid size-7 place-items-center rounded-full bg-success text-white">
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    );
  if (state === "current")
    return (
      <span className="grid size-7 place-items-center rounded-full border-2 border-primary bg-surface">
        <span className="size-2.5 rounded-full bg-primary" />
      </span>
    );
  if (state === "attention")
    return (
      <span className="grid size-7 place-items-center rounded-full bg-priority-soft text-priority ring-1 ring-priority-ring">
        <AlertTriangle className="size-3.5" />
      </span>
    );
  if (state === "not_needed")
    return (
      <span className="grid size-7 place-items-center rounded-full bg-muted text-subtle">
        <Minus className="size-3.5" />
      </span>
    );
  return <span className={cn("block size-7 rounded-full border-2 bg-surface", state === "upcoming" ? "border-lavender" : "border-input")} />;
}

const HORIZONTAL_MD = {
  ol: "md:grid-flow-col md:auto-cols-fr",
  li: "md:flex-col md:items-center md:gap-2 md:pb-0 md:text-center",
  line: "md:left-[calc(50%+14px)] md:top-[13px] md:h-0.5 md:w-[calc(100%-28px)]",
  text: "md:flex-col md:items-center md:gap-0.5",
};

/** Patient screening journey: vertical on mobile, horizontal on wide screens. */
export function JourneyTracker({
  steps,
  className,
  layout = "responsive",
}: {
  steps: JourneyStep[];
  className?: string;
  layout?: "responsive" | "vertical";
}) {
  const h = layout === "responsive";
  if (!h) return <VerticalJourney steps={steps} className={className} />;
  return (
    <ol className={cn("relative grid gap-0", h && HORIZONTAL_MD.ol, className)}>
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={step.key} className={cn("relative flex gap-3 pb-5", h && HORIZONTAL_MD.li)}>
            {!last && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-0.5",
                  h && HORIZONTAL_MD.line,
                  step.state === "done" ? "bg-success/45" : "bg-border",
                )}
              />
            )}
            <span className="relative z-10">
              <StepDot state={step.state} />
            </span>
            <div className={cn("flex min-w-0 flex-1 items-baseline justify-between gap-2", h && HORIZONTAL_MD.text)}>
              <span
                className={cn(
                  "text-sm",
                  step.state === "pending" || step.state === "not_needed" ? "text-muted-foreground" : "font-medium text-foreground",
                )}
              >
                {step.label}
              </span>
              <span
                className={cn(
                  "text-xs",
                  step.state === "current"
                    ? "font-semibold text-primary"
                    : step.state === "attention"
                      ? "font-medium text-priority"
                      : "text-muted-foreground",
                )}
              >
                {step.state === "done" ? (step.date ? formatDate(step.date, { year: undefined }) : "Done") : (step.note ?? STATE_TEXT[step.state])}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Mobile-style vertical tracker: label on top, date or status underneath. */
function VerticalJourney({ steps, className }: { steps: JourneyStep[]; className?: string }) {
  return (
    <ol className={cn("relative", className)}>
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        const muted = step.state === "pending" || step.state === "not_needed" || step.state === "upcoming";
        return (
          <li key={step.key} className="relative flex gap-4 pb-7 last:pb-0">
            {!last && (
              <span
                aria-hidden
                className={cn("absolute left-[13px] top-8 h-[calc(100%-2.25rem)] w-0.5 rounded-full", step.state === "done" ? "bg-success/50" : "bg-border")}
              />
            )}
            <span className="relative z-10">
              <StepDot state={step.state} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className={cn("text-[15px] leading-snug", muted ? "text-muted-foreground" : "font-semibold text-foreground", step.state === "current" && "text-primary")}>
                {step.label}
              </p>
              <p
                className={cn(
                  "mt-0.5 text-[13px]",
                  step.state === "attention" ? "font-medium text-priority" : step.state === "done" ? "text-success" : "text-muted-foreground",
                )}
              >
                {step.state === "done" ? (step.date ? `Completed ${formatDate(step.date, { year: undefined })}` : "Completed") : (step.note ?? STATE_TEXT[step.state])}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** KAIA Care pathway — the vertical spine from screening to completed care. */
export function PathwaySteps({ steps, className }: { steps: PathwayStep[]; className?: string }) {
  return (
    <ol className={cn("relative", className)}>
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={step.key} className="relative flex gap-4 pb-6 last:pb-0">
            {!last && (
              <span
                aria-hidden
                className={cn("absolute left-[13px] top-8 h-[calc(100%-2rem)] w-0.5", step.state === "done" ? "bg-success/45" : "bg-border")}
              />
            )}
            <span className="relative z-10 mt-0.5">
              <StepDot state={step.state} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  className={cn(
                    "text-sm font-semibold",
                    step.state === "current" ? "text-primary" : step.state === "done" ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
                {step.state === "current" && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
                    You are here
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {step.note ?? (step.date ? formatDate(step.date) : step.state === "done" ? "Done" : STATE_TEXT[step.state])}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
