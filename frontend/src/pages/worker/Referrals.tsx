import { useQuery } from "@tanstack/react-query";
import { ArrowRight, QrCode, Send } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { ContinuityBadge, ReferralStatusBadge } from "@/components/kaia/badges";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader } from "@/components/kaia/layout-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import type { Continuity, ReferralSummary } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { RestrictedName } from "@/pages/worker/dialogs";

type Row = ReferralSummary & {
  direction: "incoming" | "outgoing";
  patient_code: string;
  patient_name: string | null;
  access_restricted: boolean;
  continuity: Pick<Continuity, "risk_level" | "score" | "reason"> | null;
};

export default function Referrals() {
  const [direction, setDirection] = useState("all");
  const [status, setStatus] = useState("");
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["referrals", direction, status],
    queryFn: () => api<Row[]>(`/referrals?direction=${direction}${status ? `&status=${status}` : ""}`),
  });

  return (
    <div>
      <PageHeader
        eyebrow="KAIA Care"
        title="Referral management"
        description="Track every referral from creation to completed care."
        actions={
          <Button asChild variant="outline">
            <Link to="/portal/referrals/scan">
              <QrCode /> Scan referral QR
            </Link>
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={direction} onValueChange={setDirection}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="incoming">Incoming</TabsTrigger>
            <TabsTrigger value="outgoing">Outgoing</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 sm:w-48">
          <option value="">All statuses</option>
          {["created", "scheduled", "attended", "completed", "missed", "cancelled"].map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </Select>
      </div>
      {isLoading ? (
        <LoadingBlock />
      ) : error || !data ? (
        <ErrorBlock error={error} onRetry={refetch} />
      ) : data.length === 0 ? (
        <EmptyState icon={<Send />} title="No referrals" description="Referrals matching this filter will appear here." />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH>Referral</TH>
                <TH>Patient</TH>
                <TH>Type</TH>
                <TH>{direction === "outgoing" ? "Destination" : "From → To"}</TH>
                <TH>Status</TH>
                <TH>Appointment</TH>
                <TH>Continuity</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {data.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <p className="font-mono text-[13px] font-semibold">{r.referral_code}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(r.generated_at)}</p>
                  </TD>
                  <TD>
                    <RestrictedName name={r.patient_name} code={r.patient_code} />
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{r.referral_type_label}</span>
                      {r.priority === "priority" && <Badge tone="priority">Priority</Badge>}
                    </div>
                  </TD>
                  <TD className="text-xs text-muted-foreground">
                    {r.direction === "incoming" ? <Badge tone="info">Incoming</Badge> : null} {r.source_org.name} → {r.destination_org.name}
                  </TD>
                  <TD>
                    <ReferralStatusBadge status={r.status} />
                  </TD>
                  <TD className="text-sm">{r.appointment_at ? formatDate(r.appointment_at) : "—"}</TD>
                  <TD>
                    <ContinuityBadge risk={r.continuity?.risk_level} />
                  </TD>
                  <TD>
                    <Button asChild size="sm" variant="outline" disabled={r.access_restricted}>
                      <Link to={`/portal/referrals/${r.id}`}>
                        Open <ArrowRight />
                      </Link>
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
