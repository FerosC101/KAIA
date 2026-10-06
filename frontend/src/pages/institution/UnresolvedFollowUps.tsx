import { useQuery } from "@tanstack/react-query";
import { HeartPulse } from "lucide-react";
import { useState } from "react";
import { ContinuityBadge, OutcomeBadge, PrivacyNote, ReferralStatusBadge } from "@/components/kaia/badges";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader } from "@/components/kaia/layout-bits";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveOrg } from "@/lib/activeOrg";
import { api } from "@/lib/api";
import type { Continuity, Outcome, ReferralStatus } from "@/lib/types";
import { cn, formatDate, humanize } from "@/lib/utils";

type Row = {
  pathway_id: string;
  patient_code: string;
  barangay: string | null;
  pathway_type: Outcome;
  current_stage: string;
  days_since_result: number;
  due_date: string;
  overdue: boolean;
  referral_status: ReferralStatus | null;
  destination: string | null;
  continuity: Continuity;
};
type Response = { items: Row[]; platform_tracked: number; historical_unresolved: number; model_version: string; note: string };

export default function UnresolvedFollowUps() {
  const { orgId } = useActiveOrg();
  const [risk, setRisk] = useState("all");
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["unresolved", orgId],
    queryFn: () => api<Response>(`/organizations/${orgId}/unresolved-follow-ups`),
    enabled: !!orgId,
  });
  if (!orgId || isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={refetch} />;
  const rows = data.items.filter((r) => risk === "all" || r.continuity.risk_level === risk);

  return (
    <div>
      <PageHeader
        eyebrow="KAIA Continuity Engine"
        title="Unresolved follow-ups"
        description={`${data.platform_tracked} tracked on the platform · ${data.historical_unresolved} more recorded in imported aggregate history. ${data.model_version}.`}
      />
      <Tabs value={risk} onValueChange={setRisk} className="mb-4">
        <TabsList>
          {["all", "HIGH", "MEDIUM", "LOW"].map((level) => (
            <TabsTrigger key={level} value={level}>
              {level === "all" ? "All" : `${humanize(level.toLowerCase())} risk`} ({level === "all" ? data.items.length : data.items.filter((r) => r.continuity.risk_level === level).length})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {rows.length === 0 ? (
        <EmptyState icon={<HeartPulse />} title="Nothing unresolved in this view" />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH>Patient code</TH>
                <TH>Barangay</TH>
                <TH>Result</TH>
                <TH>Days since result</TH>
                <TH>Referral</TH>
                <TH>Continuity risk</TH>
                <TH>Recommended intervention</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.pathway_id}>
                  <TD className="font-mono text-[13px] font-semibold text-foreground">{r.patient_code}</TD>
                  <TD className="text-sm">{r.barangay ?? "—"}</TD>
                  <TD>
                    <OutcomeBadge outcome={r.pathway_type} />
                  </TD>
                  <TD>
                    <span className="tabular text-sm font-semibold">{r.days_since_result}</span>
                    <span className={cn("block text-xs", r.overdue ? "font-semibold text-priority" : "text-muted-foreground")}>
                      {r.overdue ? "Past due" : `Due ${formatDate(r.due_date, { year: undefined })}`}
                    </span>
                  </TD>
                  <TD>
                    <ReferralStatusBadge status={r.referral_status} />
                    {r.destination && <p className="mt-1 text-xs text-muted-foreground">{r.destination}</p>}
                  </TD>
                  <TD className="max-w-72 whitespace-normal">
                    <ContinuityBadge risk={r.continuity.risk_level} />
                    <p className="mt-1 text-xs text-muted-foreground">{r.continuity.reason}</p>
                  </TD>
                  <TD className="whitespace-normal text-sm font-medium text-foreground">{r.continuity.recommended_intervention}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      <PrivacyNote className="mt-4">{data.note}</PrivacyNote>
    </div>
  );
}
