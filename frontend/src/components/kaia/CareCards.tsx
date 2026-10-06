import { Building2, CalendarCheck, CalendarClock, Clock, FileText, MapPin, Phone, QrCode, Stethoscope } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { ORG_TYPE_LABEL, SERVICE_LABEL } from "@/lib/labels";
import type { Facility, NextBestAction } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

const TONE_RAIL: Record<NextBestAction["tone"], string> = {
  warning: "before:bg-warning",
  priority: "before:bg-priority",
  success: "before:bg-success",
  info: "before:bg-primary",
};

type Handlers = {
  onViewFacility?: () => void;
  onGenerateReferral?: () => void;
  onMarkScheduled?: () => void;
  onViewReferral?: () => void;
  onReportAttended?: () => void;
  onViewPassport?: () => void;
};

/**
 * "Your next step" — the single most important patient component.
 * It answers "what should I do next?" before any analytics.
 */
export function NextBestActionCard({
  action,
  busy,
  className,
  ...handlers
}: { action: NextBestAction; busy?: boolean; className?: string } & Handlers) {
  const buttons: Record<string, ReactNode> = {
    view_facility: handlers.onViewFacility && (
      <Button key="facility" variant="outline" onClick={handlers.onViewFacility}>
        <Building2 /> View facility
      </Button>
    ),
    generate_referral: handlers.onGenerateReferral && (
      <Button key="referral" onClick={handlers.onGenerateReferral} disabled={busy}>
        <FileText /> Generate referral
      </Button>
    ),
    view_referral: handlers.onViewReferral && (
      <Button key="view-referral" variant="outline" onClick={handlers.onViewReferral}>
        <QrCode /> View referral
      </Button>
    ),
    mark_scheduled: handlers.onMarkScheduled && (
      <Button key="scheduled" onClick={handlers.onMarkScheduled} disabled={busy}>
        <CalendarCheck /> Mark appointment scheduled
      </Button>
    ),
    report_attended: handlers.onReportAttended && (
      <Button key="attended" variant="secondary" onClick={handlers.onReportAttended} disabled={busy}>
        <Stethoscope /> I attended
      </Button>
    ),
    view_passport: handlers.onViewPassport && (
      <Button key="passport" variant="subtle" onClick={handlers.onViewPassport}>
        View KAIA Passport
      </Button>
    ),
  };
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-card border border-border bg-surface p-5 shadow-soft before:absolute before:inset-y-0 before:left-0 before:w-1 sm:p-7",
        TONE_RAIL[action.tone],
        className,
      )}
      aria-label="Your next step"
    >
      <p className="eyebrow text-primary">Your next step</p>
      <h3 className="display mt-2 text-[24px] text-foreground sm:text-[28px]">{action.title}</h3>
      <p className="mt-2.5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">{action.description}</p>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-3 rounded-field border border-border bg-muted/50 px-4 py-3">
          <Clock className="mt-0.5 size-4 shrink-0 text-primary" />
          <div>
            <dt className="eyebrow">Recommended</dt>
            <dd className="text-sm font-semibold text-foreground">{action.timeframe_label}</dd>
            {action.tone !== "success" && <dd className="text-xs text-muted-foreground">by {formatDate(action.due_date)}</dd>}
          </div>
        </div>
        {action.facility && (
          <div className="flex items-start gap-3 rounded-field border border-border bg-muted/50 px-4 py-3">
            <Building2 className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <dt className="eyebrow">Care provider</dt>
              <dd className="truncate text-sm font-semibold text-foreground">{action.facility.name}</dd>
              <dd className="truncate text-xs text-muted-foreground">{action.facility.city}</dd>
            </div>
          </div>
        )}
        {action.appointment_at && (
          <div className="flex items-start gap-3 rounded-field border border-info-ring bg-info-soft px-4 py-3 sm:col-span-2">
            <CalendarClock className="mt-0.5 size-4 shrink-0 text-info" />
            <div>
              <dt className="eyebrow text-info">Appointment</dt>
              <dd className="text-sm font-semibold text-info">{formatDate(action.appointment_at, { weekday: "long", month: "long" })}</dd>
            </div>
          </div>
        )}
      </dl>

      {action.actions.length > 0 && (
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">{action.actions.map((key) => buttons[key]).filter(Boolean)}</div>
      )}
    </section>
  );
}

/** Care option card used on the Care & next steps page. */
export function FacilityCard({
  facility,
  recommended,
  onViewDetails,
  onGenerateReferral,
  selected,
  className,
}: {
  facility: Facility;
  recommended?: boolean;
  onViewDetails?: () => void;
  onGenerateReferral?: () => void;
  selected?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-card border bg-surface p-5 transition-colors duration-200",
        selected ? "border-primary/50 bg-primary-soft/40" : "border-border hover:border-primary/30",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-semibold text-foreground">{facility.name}</h4>
          <p className="text-xs text-muted-foreground">{ORG_TYPE_LABEL[facility.org_type] ?? facility.org_type}</p>
        </div>
        {recommended && <Badge tone="plum">Recommended</Badge>}
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex items-start gap-2.5">
          <MapPin className="mt-0.5 size-4 shrink-0 text-subtle" />
          <dd className="text-muted-foreground">{facility.address}</dd>
        </div>
        {facility.operating_hours && (
          <div className="flex items-start gap-2.5">
            <Clock className="mt-0.5 size-4 shrink-0 text-subtle" />
            <dd className="text-muted-foreground">{facility.operating_hours}</dd>
          </div>
        )}
      </dl>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {facility.services.slice(0, 3).map((s) => (
          <Badge key={s} tone="lavender">
            {SERVICE_LABEL[s] ?? s}
          </Badge>
        ))}
      </div>
      {(onViewDetails || onGenerateReferral) && (
        <div className="mt-5 flex flex-wrap gap-2">
          {onViewDetails && (
            <Button variant="outline" size="sm" onClick={onViewDetails}>
              View details
            </Button>
          )}
          {onGenerateReferral && (
            <Button size="sm" onClick={onGenerateReferral}>
              Generate referral
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function FacilityDialog({
  facility,
  open,
  onOpenChange,
  footer,
}: {
  facility: Facility | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  footer?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {facility && (
          <>
            <DialogHeader
              icon={<Building2 className="size-5" />}
              title={facility.name}
              description={ORG_TYPE_LABEL[facility.org_type] ?? facility.org_type}
            />
            <FacilityDetails facility={facility} />
            {footer}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function FacilityDetails({ facility }: { facility: Facility }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="flex items-start gap-2.5">
        <MapPin className="mt-0.5 size-4 shrink-0 text-subtle" />
        <span className="text-muted-foreground">{facility.address}</span>
      </p>
      {facility.operating_hours && (
        <p className="flex items-start gap-2.5">
          <Clock className="mt-0.5 size-4 shrink-0 text-subtle" />
          <span className="text-muted-foreground">{facility.operating_hours}</span>
        </p>
      )}
      {facility.phone && (
        <p className="flex items-start gap-2.5">
          <Phone className="mt-0.5 size-4 shrink-0 text-subtle" />
          <a className="font-medium text-primary hover:underline" href={`tel:${facility.phone}`}>
            {facility.phone}
          </a>
        </p>
      )}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {facility.services.map((s) => (
          <Badge key={s} tone="lavender">
            {SERVICE_LABEL[s] ?? s}
          </Badge>
        ))}
      </div>
      <p className="rounded-field bg-muted px-3 py-2 text-xs text-muted-foreground">Mock partner facility for this prototype.</p>
    </div>
  );
}
