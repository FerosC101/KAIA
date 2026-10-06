import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, ArrowRight, CalendarDays, ClipboardList, Cpu, FlaskConical, QrCode, Search, Send, UserPlus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { OutcomeBadge, ScreeningStatusBadge } from "@/components/kaia/badges";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader, StatCard } from "@/components/kaia/layout-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { REFERRAL_STATUS_META } from "@/lib/labels";
import type { OrgRef, QueueRow, Reader } from "@/lib/types";
import { relativeTime } from "@/lib/utils";
import { NewScreeningDialog, RegisterCartridgeDialog, RestrictedName } from "@/pages/worker/dialogs";
import { ReaderStatusDot } from "@/pages/worker/Readers";

type WorkerDashboard = {
  organization: OrgRef;
  worker: { name: string; position: string | null };
  metrics: {
    todays_screenings: number;
    pending_analysis: number;
    awaiting_review: number;
    follow_up_required: number;
    priority_follow_up: number;
    unresolved_referrals: number;
    cartridges_in_stock: number;
  };
  readers: Reader[];
};

export default function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [scope, setScope] = useState("active");
  const [q, setQ] = useState("");
  const [walkIn, setWalkIn] = useState(false);
  const [cartridgeFor, setCartridgeFor] = useState<QueueRow | null>(null);

  const dash = useQuery({ queryKey: ["worker-dashboard"], queryFn: () => api<WorkerDashboard>("/worker/dashboard"), refetchInterval: 15_000 });
  const queue = useQuery({
    queryKey: ["queue", scope, q],
    queryFn: () => api<QueueRow[]>(`/worker/queue?scope=${scope}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });
  const receive = useMutation({
    mutationFn: (id: string) => api(`/screenings/${id}/sample-collected`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Sample marked as received");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e.message),
  });

  if (dash.isLoading) return <LoadingBlock />;
  if (dash.error || !dash.data) return <ErrorBlock error={dash.error} onRetry={dash.refetch} />;
  const m = dash.data.metrics;

  function actionFor(row: QueueRow) {
    if (row.access_restricted)
      return (
        <Button size="sm" variant="ghost" disabled>
          Restricted
        </Button>
      );
    switch (row.next_action) {
      case "receive_sample":
        return (
          <Button size="sm" variant="outline" onClick={() => receive.mutate(row.screening_id)}>
            Mark received
          </Button>
        );
      case "register_cartridge":
        return (
          <Button size="sm" onClick={() => setCartridgeFor(row)}>
            <Cpu /> Register cartridge
          </Button>
        );
      case "begin_analysis":
      case "view_reader":
        return (
          <Button size="sm" onClick={() => navigate(`/portal/readers/${row.reader_code}`)}>
            {row.next_action === "begin_analysis" ? "Begin analysis" : "View live"} <ArrowRight />
          </Button>
        );
      case "review":
        return (
          <Button size="sm" onClick={() => navigate(`/portal/vision/${row.screening_id}`)}>
            Review
          </Button>
        );
      case "create_referral":
        return (
          <Button size="sm" variant="subtle" onClick={() => navigate(`/portal/screenings/${row.screening_id}`)}>
            <Send /> Create referral
          </Button>
        );
      default:
        return (
          <Button size="sm" variant="ghost" onClick={() => navigate(`/portal/screenings/${row.screening_id}`)}>
            View
          </Button>
        );
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Screening centre"
        title="Screening Queue"
        description={`Manage screenings, review results and guide patients toward appropriate care. ${m.awaiting_review ? `${m.awaiting_review} result${m.awaiting_review > 1 ? "s" : ""} awaiting your review.` : "No results awaiting review."}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/portal/referrals/scan">
                <QrCode /> Scan referral
              </Link>
            </Button>
            <Button onClick={() => setWalkIn(true)}>
              <UserPlus /> Walk-in screening
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Today's screenings" value={m.todays_screenings} icon={<CalendarDays />} tone="plum" />
        <StatCard label="Pending analysis" value={m.pending_analysis} icon={<FlaskConical />} tone="lavender" sub={`${m.awaiting_review} awaiting review`} />
        <StatCard label="Follow-up required" value={m.follow_up_required} icon={<Activity />} tone="warning" />
        <StatCard label="Priority follow-up" value={m.priority_follow_up} icon={<AlertTriangle />} tone="priority" />
        <StatCard label="Unresolved referrals" value={m.unresolved_referrals} icon={<Send />} tone="info" className="col-span-2 md:col-span-1" />
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1">
        {dash.data.readers.map((r) => (
          <Link key={r.id} to={`/portal/readers/${r.reader_code}`} className="shrink-0">
            <Card className="flex items-center gap-3 px-4 py-3 transition hover:shadow-lift">
              <ReaderStatusDot status={r.status} />
              <div>
                <p className="font-mono text-sm font-semibold text-foreground">{r.reader_code}</p>
                <p className="text-xs text-muted-foreground">
                  {r.current_cartridge ? `Cartridge ${r.current_cartridge.cartridge_code}` : r.status === "online" ? "Ready" : r.status}
                </p>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Tabs value={scope} onValueChange={setScope}>
          <TabsList>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative sm:ml-auto sm:w-72">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input className="h-10 pl-10" placeholder="Patient code, kit or cartridge" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {queue.isLoading ? (
        <LoadingBlock />
      ) : queue.error || !queue.data ? (
        <ErrorBlock error={queue.error} onRetry={queue.refetch} />
      ) : queue.data.length === 0 ? (
        <EmptyState icon={<ClipboardList />} title="Queue is clear" description="New screenings will appear here as kits are registered." />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH>Patient code</TH>
                <TH>Kit ID</TH>
                <TH>Reader</TH>
                <TH>Status</TH>
                <TH>Result</TH>
                <TH>Referral</TH>
                <TH className="text-right">Action</TH>
              </TR>
            </THead>
            <TBody className={queue.isFetching && !queue.isLoading ? "opacity-70 transition-opacity" : undefined}>
              {queue.data.map((row) => (
                <TR key={row.screening_id}>
                  <TD>
                    <RestrictedName name={row.patient_name} code={row.patient_code} />
                  </TD>
                  <TD className="font-mono text-[13px]">{row.kit_code}</TD>
                  <TD className="font-mono text-[13px] text-muted-foreground">{row.reader_code?.replace("KAIA-RDR-", "Reader-") ?? "—"}</TD>
                  <TD>
                    <ScreeningStatusBadge status={row.status} label={row.status_label} />
                    <p className="mt-1 text-[11px] text-subtle">{relativeTime(row.updated_at)}</p>
                  </TD>
                  <TD>{row.outcome ? <OutcomeBadge outcome={row.outcome} pending={!row.outcome_released} /> : <span className="text-subtle">—</span>}</TD>
                  <TD>
                    {row.referral_status ? (
                      <Badge tone={REFERRAL_STATUS_META[row.referral_status].tone}>{row.referral_label}</Badge>
                    ) : row.referral_label === "Not Created" ? (
                      <Badge tone="warning">Not Created</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">{row.referral_label}</span>
                    )}
                  </TD>
                  <TD className="text-right">{actionFor(row)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <NewScreeningDialog open={walkIn} onOpenChange={setWalkIn} />
      <RegisterCartridgeDialog
        screeningId={cartridgeFor?.screening_id ?? null}
        patientCode={cartridgeFor?.patient_code}
        open={!!cartridgeFor}
        onOpenChange={(v) => !v && setCartridgeFor(null)}
      />
    </div>
  );
}
