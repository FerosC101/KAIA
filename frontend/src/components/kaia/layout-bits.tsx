import { AlertCircle, Inbox, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/misc";
import type { Tone } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** Page header: small eyebrow, editorial serif title, supporting line, actions right. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  size = "default",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  size?: "default" | "lg";
}) {
  return (
    <div className={cn("mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2 text-primary">{eyebrow}</div>}
        <h1 className={cn("display text-foreground", size === "lg" ? "text-[32px] sm:text-[40px]" : "text-[26px] sm:text-[32px]")}>{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const STAT_TONES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  plum: "bg-primary-soft text-primary",
  lavender: "bg-secondary text-secondary-foreground",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  priority: "bg-priority-soft text-priority",
  info: "bg-info-soft text-info",
};

/** Compact metric card — restrained numbers, label leads. */
export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "plum",
  highlight,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "bg-surface p-4 transition-shadow duration-200 hover:shadow-soft sm:p-5",
        highlight && "border-primary/30 ring-1 ring-primary/15",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[12px] font-medium leading-snug text-muted-foreground">{label}</span>
        {icon && <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl [&_svg]:size-4", STAT_TONES[tone])}>{icon}</span>}
      </div>
      <div className="tabular mt-3 text-[30px] font-semibold leading-none tracking-tight text-foreground">{value}</div>
      {sub && <div className="mt-2.5 text-xs leading-relaxed text-muted-foreground">{sub}</div>}
    </Card>
  );
}

export function Disclaimer({
  className,
  text = "This is a screening result and is not a diagnosis.",
}: {
  className?: string;
  text?: string;
}) {
  return (
    <div className={cn("flex items-start gap-2.5 rounded-field border border-border bg-muted/70 px-4 py-3 text-[13px] text-muted-foreground", className)}>
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
      <span>{text}</span>
    </div>
  );
}

export function LoadingBlock({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-busy>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {label}
      </div>
      <Skeleton className="h-28" />
      <Skeleton className="h-20" />
    </div>
  );
}

export function ErrorBlock({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <Card className={cn("flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center", className)}>
      <span className="grid size-10 place-items-center rounded-field bg-priority-soft text-priority">
        <AlertCircle className="size-5" />
      </span>
      <div className="flex-1">
        <p className="font-semibold">We couldn't load this</p>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw /> Try again
        </Button>
      )}
    </Card>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("brand-veil flex flex-col items-center justify-center rounded-card border border-dashed border-input px-6 py-14 text-center", className)}>
      <span className="grid size-12 place-items-center rounded-field bg-secondary text-primary [&_svg]:size-5">{icon ?? <Inbox />}</span>
      <p className="display mt-4 text-xl text-foreground">{title}</p>
      {description && <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{children}</h2>
      {action}
    </div>
  );
}

export function KeyValue({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right font-medium text-foreground", mono && "font-mono text-[13px]")}>{value}</span>
    </div>
  );
}
