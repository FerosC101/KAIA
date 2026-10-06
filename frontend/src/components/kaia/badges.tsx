import { BrainCircuit, FlaskConical, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { OUTCOME_META, REFERRAL_STATUS_META, SCREENING_STATUS_TONE, type Tone } from "@/lib/labels";
import type { Continuity, Outcome, ReferralStatus, ScreeningStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function OutcomeBadge({ outcome, className, pending }: { outcome: Outcome | null; className?: string; pending?: boolean }) {
  if (!outcome) return <span className="text-muted-foreground">—</span>;
  const meta = OUTCOME_META[outcome];
  return (
    <Badge tone={meta.tone} dot className={className}>
      {meta.label}
      {pending && <span className="font-normal opacity-70">· suggested</span>}
    </Badge>
  );
}

export function ScreeningStatusBadge({ status, label }: { status: ScreeningStatus; label: string }) {
  return (
    <Badge tone={SCREENING_STATUS_TONE[status]} className={status === "analyzing" ? "animate-pulse-soft" : undefined}>
      {label}
    </Badge>
  );
}

export function ReferralStatusBadge({ status }: { status: ReferralStatus | null }) {
  if (!status) return <Badge tone="neutral">Not created</Badge>;
  const meta = REFERRAL_STATUS_META[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

const RISK_TONE: Record<Continuity["risk_level"], Tone> = { HIGH: "priority", MEDIUM: "warning", LOW: "success" };
const RISK_LABEL: Record<Continuity["risk_level"], string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };

export function ContinuityBadge({ risk, className }: { risk: Continuity["risk_level"] | null | undefined; className?: string }) {
  if (!risk) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <Badge tone={RISK_TONE[risk]} dot className={className}>
      {RISK_LABEL[risk]}
    </Badge>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground ring-1 ring-inset ring-border",
        className,
      )}
      title="Synthetic demo data — not a real person"
    >
      <FlaskConical className="size-3" /> Demo
    </span>
  );
}

/** Reserved label for anything the AI produced. Never "AI diagnosis". */
export function DecisionSupportLabel({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground ring-1 ring-inset ring-border",
        className,
      )}
    >
      <BrainCircuit className="size-3.5 text-primary" /> AI-assisted screening interpretation · not a diagnosis
    </span>
  );
}

export function PrivacyNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 text-xs leading-relaxed text-muted-foreground", className)}>
      <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
      <span>{children}</span>
    </p>
  );
}
