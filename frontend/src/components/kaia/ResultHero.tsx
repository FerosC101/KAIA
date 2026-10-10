import { ArrowRight, Check, CircleAlert, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { PATIENT_OUTCOME } from "@/lib/labels";
import type { Outcome } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Calm, colour-coded screening outcome: soft green when all is well, soft amber or red when follow-up is needed. Never a probability. */
const STYLES: Record<Outcome, { wrap: string; badge: string; title: string; icon: ReactNode }> = {
  routine_screening: {
    wrap: "border-success-ring bg-success-soft",
    badge: "bg-success text-white",
    title: "text-success",
    icon: <Check className="size-7" strokeWidth={2.75} />,
  },
  follow_up_recommended: {
    wrap: "border-warning-ring bg-warning-soft",
    badge: "bg-warning text-white",
    title: "text-warning",
    icon: <TriangleAlert className="size-6" />,
  },
  priority_follow_up: {
    wrap: "border-priority-ring bg-priority-soft",
    badge: "bg-priority text-white",
    title: "text-priority",
    icon: <CircleAlert className="size-6" />,
  },
};

export function ResultHero({
  outcome,
  nextStep,
  footer,
  className,
}: {
  outcome: Outcome;
  nextStep?: string;
  footer?: ReactNode;
  className?: string;
}) {
  const copy = PATIENT_OUTCOME[outcome];
  const style = STYLES[outcome];
  return (
    <section aria-label="Your screening result" className={cn("rounded-card border px-6 py-8 text-center shadow-card sm:px-10 sm:py-10", style.wrap, className)}>
      <span className={cn("mx-auto grid size-16 place-items-center rounded-full shadow-soft", style.badge)}>{style.icon}</span>
      <p className="eyebrow mt-5">Your screening result</p>
      <h1 className={cn("mx-auto mt-2 max-w-md text-balance text-[30px] leading-tight sm:text-[36px]", style.title)}>{copy.title}</h1>
      <p className="mx-auto mt-3 max-w-md text-[16px] leading-relaxed text-foreground">{copy.summary}</p>

      <div className="mx-auto mt-7 flex max-w-md items-start gap-3 rounded-2xl bg-surface/85 px-5 py-4 text-left">
        <ArrowRight className="mt-0.5 size-4 shrink-0 text-primary" />
        <div>
          <p className="eyebrow">What to do next</p>
          <p className="mt-1 text-[15px] font-medium leading-relaxed text-foreground">{nextStep ?? copy.nextStep}</p>
        </div>
      </div>
      {footer}
    </section>
  );
}
