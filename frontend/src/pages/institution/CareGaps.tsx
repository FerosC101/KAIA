import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CircleAlert, Lightbulb, MapPin, Radar } from "lucide-react";
import { PrivacyNote } from "@/components/kaia/badges";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader, StatCard } from "@/components/kaia/layout-bits";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useActiveOrg } from "@/lib/activeOrg";
import { api } from "@/lib/api";
import type { GapAlert } from "@/lib/types";
import { pct } from "@/lib/utils";

type CareGapsResponse = { city_participation_rate: number; city_follow_up_completion_rate: number; alerts: GapAlert[]; privacy_note: string };

const STAGES = ["Screening participation", "Sample return", "Follow-up completion", "Time to follow-up"];

function formatMetric(m: GapAlert["metrics"][number]) {
  if (m.value === null) return "—";
  if (m.format === "percent") return pct(m.value);
  if (m.format === "days") return `${m.value} days`;
  return m.value.toLocaleString();
}

export default function CareGaps() {
  const { orgId } = useActiveOrg();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["care-gaps", orgId],
    queryFn: () => api<CareGapsResponse>(`/organizations/${orgId}/care-gaps`),
    enabled: !!orgId,
  });
  if (!orgId || isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={refetch} />;

  const byStage = (stage: string) => data.alerts.filter((a) => a.stage === stage).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Program gap detection"
        title="Where is the care pathway breaking?"
        description="KAIA doesn't just collect health data — it shows exactly which communities are not entering screening, and where women are lost after a result."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="City screening participation" value={pct(data.city_participation_rate)} />
        <StatCard label="City follow-up completion" value={pct(data.city_follow_up_completion_rate)} />
        <StatCard label="High-severity gaps" value={data.alerts.filter((a) => a.severity === "high").length} tone="priority" icon={<CircleAlert />} />
        <StatCard label="Barangays flagged" value={new Set(data.alerts.map((a) => a.barangay)).size} tone="warning" icon={<MapPin />} />
      </div>

      <Card className="overflow-x-auto p-4">
        <ol className="flex min-w-max items-stretch gap-2">
          {STAGES.map((stage, i) => (
            <li key={stage} className="flex items-center gap-2">
              <div className={`rounded-card border px-4 py-2.5 ${byStage(stage) ? "border-warning/40 bg-warning-soft" : "border-border bg-background"}`}>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stage {i + 1}</p>
                <p className="text-sm font-semibold text-foreground">{stage}</p>
                <p className="text-xs text-muted-foreground">{byStage(stage) ? `${byStage(stage)} alert${byStage(stage) > 1 ? "s" : ""}` : "No gaps detected"}</p>
              </div>
              {i < STAGES.length - 1 && <span className="h-0.5 w-6 bg-border" />}
            </li>
          ))}
        </ol>
      </Card>

      {data.alerts.length === 0 ? (
        <EmptyState icon={<Radar />} title="No program gaps detected" description="Participation and follow-up completion are within range across all barangays." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.alerts.map((alert) => (
            <Card key={alert.id} className="flex flex-col p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Barangay</p>
                  <p className="text-xl font-bold text-foreground">{alert.barangay}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <Badge tone={alert.severity === "high" ? "priority" : "warning"}>
                    {alert.severity === "high" ? <CircleAlert className="size-3" /> : <AlertTriangle className="size-3" />}
                    {alert.severity === "high" ? "High severity" : "Medium severity"}
                  </Badge>
                  <Badge tone="lavender">{alert.stage}</Badge>
                </div>
              </div>
              <p className="mt-3 font-semibold text-foreground">{alert.headline}</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {alert.metrics.map((m) => (
                  <div key={m.label} className="rounded-card bg-muted/70 px-4 py-3">
                    <p className="text-xs text-muted-foreground">{m.label}</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{formatMetric(m)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-start gap-2.5 rounded-card bg-secondary/80 px-4 py-3">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-secondary-foreground" />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-secondary-foreground/80">Recommendation</p>
                  <p className="font-semibold text-secondary-foreground">{alert.recommendation}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <PrivacyNote>{data.privacy_note}</PrivacyNote>
    </div>
  );
}
