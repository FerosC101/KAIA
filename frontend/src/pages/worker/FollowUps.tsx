import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight, MessageSquarePlus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { ContinuityBadge, OutcomeBadge, ReferralStatusBadge } from "@/components/kaia/badges";
import { ContinuityPanel } from "@/components/kaia/ContinuityPanel";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader } from "@/components/kaia/layout-bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import type { Continuity, Outcome, ReferralStatus } from "@/lib/types";
import { cn, formatDate, humanize } from "@/lib/utils";
import { OutreachDialog, RestrictedName } from "@/pages/worker/dialogs";

type Row = {
  pathway_id: string;
  screening_id: string;
  patient_code: string;
  patient_name: string | null;
  access_restricted: boolean;
  pathway_type: Outcome;
  current_stage: string;
  days_since_result: number;
  due_date: string;
  overdue: boolean;
  referral: { id: string; referral_code: string; status: ReferralStatus; destination: string; appointment_at: string | null } | null;
  role: "screening_site" | "receiving_facility";
  continuity: Continuity | null;
};

export default function FollowUps() {
  const [risk, setRisk] = useState("all");
  const [selected, setSelected] = useState<Row | null>(null);
  const [outreach, setOutreach] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["worker-follow-ups"], queryFn: () => api<Row[]>("/worker/follow-ups") });

  const rows = (data ?? []).filter((r) => risk === "all" || r.continuity?.risk_level === risk);
  const count = (level: string) => (data ?? []).filter((r) => r.continuity?.risk_level === level).length;

  return (
    <div>
      <PageHeader
        eyebrow="KAIA Continuity Engine"
        title="Follow-up tracking"
        description="Women who need follow-up, ranked by risk of not completing care. The engine predicts drop-off — never disease."
      />
      <Tabs value={risk} onValueChange={setRisk} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">All ({data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="HIGH">High risk ({count("HIGH")})</TabsTrigger>
          <TabsTrigger value="MEDIUM">Medium ({count("MEDIUM")})</TabsTrigger>
          <TabsTrigger value="LOW">Low ({count("LOW")})</TabsTrigger>
        </TabsList>
      </Tabs>
      {isLoading ? (
        <LoadingBlock />
      ) : error || !data ? (
        <ErrorBlock error={error} onRetry={refetch} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Activity />} title="No follow-ups in this view" />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH>Patient</TH>
                <TH>Result</TH>
                <TH>Stage</TH>
                <TH>Days since result</TH>
                <TH>Referral</TH>
                <TH>Continuity risk</TH>
                <TH>Recommended intervention</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.pathway_id} className="cursor-pointer" onClick={() => !r.access_restricted && setSelected(r)}>
                  <TD>
                    <RestrictedName name={r.patient_name} code={r.patient_code} />
                  </TD>
                  <TD>
                    <OutcomeBadge outcome={r.pathway_type} />
                  </TD>
                  <TD className="text-sm">{humanize(r.current_stage)}</TD>
                  <TD>
                    <span className="tabular text-sm font-semibold text-foreground">{r.days_since_result}</span>
                    <span className={cn("block text-xs", r.overdue ? "font-semibold text-priority" : "text-muted-foreground")}>
                      {r.overdue ? "Past due" : `Due ${formatDate(r.due_date, { year: undefined })}`}
                    </span>
                  </TD>
                  <TD>{r.referral ? <ReferralStatusBadge status={r.referral.status} /> : <ReferralStatusBadge status={null} />}</TD>
                  <TD className="max-w-64 whitespace-normal">
                    <ContinuityBadge risk={r.continuity?.risk_level} />
                    {r.continuity && <p className="mt-1 text-xs text-muted-foreground">{r.continuity.reason}</p>}
                  </TD>
                  <TD className="whitespace-normal text-sm font-medium text-foreground">{r.continuity?.recommended_intervention ?? "—"}</TD>
                  <TD>
                    <ArrowRight className="size-4 text-subtle" />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent>
          {selected && (
            <>
              <DialogHeader title={selected.patient_name ?? selected.patient_code} description={`${selected.patient_code} · ${humanize(selected.current_stage)}`} />
              {selected.continuity && <ContinuityPanel continuity={selected.continuity} />}
              <DialogFooter>
                {selected.referral && (
                  <Button variant="outline" onClick={() => setOutreach(selected.referral!.id)}>
                    <MessageSquarePlus /> Log outreach
                  </Button>
                )}
                <Button asChild>
                  <Link to={selected.referral ? `/portal/referrals/${selected.referral.id}` : `/portal/screenings/${selected.screening_id}`}>
                    {selected.referral ? "Open referral" : "Open screening"} <ArrowRight />
                  </Link>
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      {outreach && <OutreachDialog referralId={outreach} open onOpenChange={(v) => !v && setOutreach(null)} />}
    </div>
  );
}
