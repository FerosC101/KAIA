import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, BarChart3, CheckCircle2, CircleAlert, Cpu, Package, Radar, Users } from "lucide-react";
import { Link } from "react-router";
import { PrivacyNote } from "@/components/kaia/badges";
import { ErrorBlock, LoadingBlock, PageHeader, SectionTitle, StatCard } from "@/components/kaia/layout-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useActiveOrg } from "@/lib/activeOrg";
import { api } from "@/lib/api";
import { REFERRAL_STATUS_META } from "@/lib/labels";
import type { InventoryBatch, OrgRef, ProgramSummary, ReferralStatus } from "@/lib/types";
import { formatDate, num, pct } from "@/lib/utils";

type Overview = {
  organization: OrgRef;
  summary: ProgramSummary;
  screening_stats: { platform_screenings: number; this_month: number; pending_review: number; in_progress: number };
  referral_status_counts: Record<ReferralStatus, number>;
  continuity_risk: { HIGH: number; MEDIUM: number; LOW: number };
  devices: { id: string; reader_code: string; location_name: string; status: string; temperature_label: string; last_calibration: string; calibration_due: boolean }[];
  inventory_alerts: InventoryBatch[];
  staff_count: number;
  privacy_note: string;
};

export default function Overview() {
  const { orgId } = useActiveOrg();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["overview", orgId],
    queryFn: () => api<Overview>(`/organizations/${orgId}/overview`),
    enabled: !!orgId,
    refetchInterval: 20_000,
  });
  if (!orgId || isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={refetch} />;
  const s = data.summary;
  const totalReferrals = Object.values(data.referral_status_counts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Institution dashboard"
        title={data.organization.name}
        description="Has every woman been screened? Does she need follow-up? Did she receive it?"
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/institution/care-gaps">
                <Radar /> Care gaps
              </Link>
            </Button>
            <Button asChild>
              <Link to="/institution/population">
                <BarChart3 /> KAIA Population
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.1fr_2fr]">
        <Card className="flex flex-col justify-between bg-primary p-6 text-white">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Follow-up completion</p>
            <p className="mt-2 text-6xl font-semibold tracking-tight">{pct(s.follow_up_completion_rate)}</p>
            <p className="mt-2 text-sm text-white/75">
              {num(s.follow_up_completed)} of {num(s.follow_up_required)} women who needed follow-up completed care
            </p>
          </div>
          <div className="mt-6 flex items-center justify-between rounded-card bg-white/10 px-4 py-3 text-sm">
            <span>Unresolved</span>
            <span className="text-lg font-semibold">{num(s.unresolved)}</span>
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <StatCard label="Eligible population" value={num(s.eligible_population)} />
          <StatCard label="Valid screenings" value={num(s.valid_screenings)} sub={`${pct(s.participation_rate)} participation`} />
          <StatCard label="Follow-up required" value={num(s.follow_up_required)} tone="warning" />
          <StatCard label="Follow-up completed" value={num(s.follow_up_completed)} tone="success" />
          <StatCard label="Avg. days to follow-up" value={s.avg_days_to_follow_up ?? "—"} />
          <StatCard label="Awaiting clinician review" value={data.screening_stats.pending_review} sub={`${data.screening_stats.in_progress} screenings in progress`} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <SectionTitle action={<Link to="/institution/follow-ups" className="text-xs font-semibold text-primary">View all</Link>}>Continuity risk</SectionTitle>
          <p className="mb-3 text-xs text-muted-foreground">Active follow-ups tracked on the platform</p>
          {(
            [
              ["HIGH", "High", <CircleAlert key="h" className="size-4 text-priority" />],
              ["MEDIUM", "Medium", <AlertTriangle key="m" className="size-4 text-warning" />],
              ["LOW", "Low", <CheckCircle2 key="l" className="size-4 text-success" />],
            ] as const
          ).map(([key, label, icon]) => (
            <div key={key} className="flex items-center justify-between border-b border-border/60 py-2.5 last:border-0">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                {icon} {label} risk
              </span>
              <span className="tabular text-lg font-semibold text-foreground">{data.continuity_risk[key]}</span>
            </div>
          ))}
        </Card>

        <Card className="p-5">
          <SectionTitle>Referral completion</SectionTitle>
          <p className="mb-3 text-xs text-muted-foreground">{totalReferrals} platform referrals issued by this site</p>
          {(Object.keys(REFERRAL_STATUS_META) as ReferralStatus[]).map((status) => (
            <div key={status} className="flex items-center justify-between border-b border-border/60 py-2 last:border-0">
              <Badge tone={REFERRAL_STATUS_META[status].tone}>{REFERRAL_STATUS_META[status].label}</Badge>
              <span className="tabular text-sm font-semibold text-foreground">{data.referral_status_counts[status]}</span>
            </div>
          ))}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle action={<Link to="/institution/devices" className="text-xs font-semibold text-primary">Devices</Link>}>Device status</SectionTitle>
            {data.devices.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 border-b border-border/60 py-2 last:border-0">
                <span className="flex items-center gap-2 text-sm">
                  <Cpu className="size-4 text-muted-foreground" />
                  <span className="font-mono font-semibold text-foreground">{d.reader_code}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  {d.calibration_due && <Badge tone="warning">Calibration due</Badge>}
                  <Badge tone={d.status === "online" ? "success" : d.status === "offline" ? "neutral" : "warning"}>{d.status}</Badge>
                </span>
              </div>
            ))}
          </Card>
          <Card className="p-5">
            <SectionTitle action={<Link to="/institution/inventory" className="text-xs font-semibold text-primary">Inventory</Link>}>Inventory alerts</SectionTitle>
            {data.inventory_alerts.length === 0 && <p className="text-sm text-muted-foreground">Stock levels are healthy.</p>}
            {data.inventory_alerts.map((b) => (
              <div key={b.id} className="flex items-start gap-2 border-b border-border/60 py-2 text-sm last:border-0">
                <Package className="mt-0.5 size-4 text-warning" />
                <div>
                  <p className="font-mono font-semibold text-foreground">{b.batch_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {b.low_stock && `Low stock: ${b.quantity} left`} {b.expiring_soon && `· expires ${formatDate(b.expiry_date)}`}
                  </p>
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PrivacyNote>{data.privacy_note}</PrivacyNote>
        <Button asChild variant="ghost" size="sm">
          <Link to="/institution/staff">
            <Users /> {data.staff_count} active health workers <ArrowRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}
