import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, ServerCog } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ErrorBlock, LoadingBlock, PageHeader, SectionTitle, StatCard } from "@/components/kaia/layout-bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { api } from "@/lib/api";
import { ROLE_LABEL, useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";
import { ReaderStatusDot } from "@/pages/worker/Readers";

type Health = {
  status: "operational" | "degraded";
  environment: string;
  version: string;
  uptime_seconds: number;
  checks: { name: string; status: "ok" | "degraded"; detail: string }[];
  counts: { users_by_role: Record<Role, number>; organizations: number; screenings: number; analyses_24h: number; audit_events_24h: number };
  readers: { reader_code: string; status: "online" | "offline" | "analyzing" | "maintenance"; organization: string; last_heartbeat_at: string | null; firmware_version: string }[];
};

export default function SystemHealth() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["system-health"], queryFn: () => api<Health>("/admin/system-health"), refetchInterval: 10_000 });
  const reset = useMutation({
    mutationFn: () => api<{ program_summary: { follow_up_required: number; follow_up_completed: number } }>("/admin/demo/reset", { method: "POST" }),
    onSuccess: async () => {
      toast.success("Demo data reset. Please sign in again.");
      await logout().catch(() => undefined);
      navigate("/login");
    },
    onError: (e) => toast.error(e.message),
  });
  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={refetch} />;
  const hours = Math.floor(data.uptime_seconds / 3600);
  const minutes = Math.floor((data.uptime_seconds % 3600) / 60);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="KAIA platform" title="System health" description={`API v${data.version} · ${data.environment} · up ${hours}h ${minutes}m`} />

      <Card className={cn("flex items-center gap-4 p-5", data.status === "operational" ? "border-success/30 bg-success-soft" : "border-warning/30 bg-warning-soft")}>
        {data.status === "operational" ? <CheckCircle2 className="size-7 text-success" /> : <AlertTriangle className="size-7 text-warning" />}
        <div>
          <p className={cn("text-lg font-semibold", data.status === "operational" ? "text-success" : "text-warning")}>
            {data.status === "operational" ? "All systems operational" : "Some services degraded"}
          </p>
          <p className="text-sm text-muted-foreground">{data.checks.filter((c) => c.status === "ok").length} of {data.checks.length} checks passing</p>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Organizations" value={data.counts.organizations} />
        <StatCard label="Screenings" value={data.counts.screenings} />
        <StatCard label="Analyses (24 h)" value={data.counts.analyses_24h} />
        <StatCard label="Audit events (24 h)" value={data.counts.audit_events_24h} />
        <StatCard label="Patients" value={data.counts.users_by_role.patient ?? 0} className="col-span-2 lg:col-span-1" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle>Service checks</SectionTitle>
          <ul className="divide-y divide-border">
            {data.checks.map((c) => (
              <li key={c.name} className="flex items-start justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.detail}</p>
                </div>
                <span className={cn("flex items-center gap-1.5 text-xs font-semibold", c.status === "ok" ? "text-success" : "text-warning")}>
                  {c.status === "ok" ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
                  {c.status === "ok" ? "Healthy" : "Degraded"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="px-5 pt-5">
              <SectionTitle>Reader fleet</SectionTitle>
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>Reader</TH>
                  <TH>Organization</TH>
                  <TH>Status</TH>
                  <TH>Heartbeat</TH>
                </TR>
              </THead>
              <TBody>
                {data.readers.map((r) => (
                  <TR key={r.reader_code}>
                    <TD className="font-mono text-sm font-semibold">{r.reader_code}</TD>
                    <TD className="text-sm">{r.organization}</TD>
                    <TD>
                      <span className="flex items-center gap-2 text-sm capitalize">
                        <ReaderStatusDot status={r.status} /> {r.status}
                      </span>
                    </TD>
                    <TD className="text-sm text-muted-foreground">{relativeTime(r.last_heartbeat_at)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Card className="p-5">
            <SectionTitle>Accounts by role</SectionTitle>
            {(Object.keys(ROLE_LABEL) as Role[]).map((role) => (
              <div key={role} className="flex justify-between border-b border-border/60 py-2 text-sm last:border-0">
                <span className="text-muted-foreground">{ROLE_LABEL[role]}</span>
                <span className="tabular font-semibold text-foreground">{data.counts.users_by_role[role] ?? 0}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>

      <Card className="flex flex-col gap-4 border-dashed p-5 sm:flex-row sm:items-center">
        <ServerCog className="size-6 text-primary" />
        <div className="flex-1">
          <p className="font-semibold text-foreground">Reset synthetic demo</p>
          <p className="text-sm text-muted-foreground">Restores all demo data to its starting state so the Maria Santos scenario can be run again. Prototype environments only.</p>
        </div>
        <Button variant="outline" onClick={() => setConfirm(true)}>
          <RotateCcw /> Reset demo data
        </Button>
      </Card>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader icon={<RotateCcw className="size-5" />} title="Reset all demo data?" description="Every change made during the demo will be erased and synthetic data re-seeded. You will be signed out." />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="priority" onClick={() => reset.mutate()} disabled={reset.isPending}>
              {reset.isPending && <Loader2 className="animate-spin" />} Reset demo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
