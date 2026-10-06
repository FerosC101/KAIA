import type { ComponentProps } from "react";
import type { Tone } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** Status chip: light tint + readable text + optional dot. Never a saturated fill. */
const TONES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground ring-border",
  plum: "bg-primary-soft text-primary ring-primary-ring",
  lavender: "bg-secondary text-secondary-foreground ring-lavender/60",
  success: "bg-success-soft text-success ring-success-ring",
  warning: "bg-warning-soft text-warning ring-warning-ring",
  priority: "bg-priority-soft text-priority ring-priority-ring",
  info: "bg-info-soft text-info ring-info-ring",
};

type BadgeProps = ComponentProps<"span"> & { tone?: Tone; dot?: boolean };

export function Badge({ className, tone = "neutral", dot, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset [&_svg]:size-3",
        TONES[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
