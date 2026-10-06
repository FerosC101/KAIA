import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Cpu, Wrench } from "lucide-react";
import { toast } from "sonner";
import { ErrorBlock, LoadingBlock, PageHeader } from "@/components/kaia/layout-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useActiveOrg } from "@/lib/activeOrg";
import { api } from "@/lib/api";
import type { Reader } from "@/lib/types";
import { formatDate, relativeTime } from "@/lib/utils";
import { ReaderStatusDot } from "@/pages/worker/Readers";

export default function Devices() {
  const { orgId, org } = useActiveOrg();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["readers", "org", orgId],
    queryFn: () => api<Reader[]>(`/readers?organization_id=${orgId}`),
    enabled: !!orgId,
    refetchInterval: 10_000,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["readers"] });
  const calibrate = useMutation({
    mutationFn: (code: string) => api(`/readers/${code}/calibrate`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Calibration recorded");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const setStatus = useMutation({
    mutationFn: ({ code, status }: { code: string; status: string }) => api(`/readers/${code}`, { method: "PATCH", body: { status } }),
    onSuccess: () => {
      toast.success("Reader status updated");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  if (!orgId || isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={refetch} />;
  const due = (r: Reader) => (Date.now() - new Date(r.last_calibration).getTime()) / 86400000 > 30;

  return (
    <div>
      <PageHeader eyebrow={org?.name} title="Device status" description="KAIA Reader health, calibration and connectivity." />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {(["online", "analyzing", "maintenance", "offline"] as const).map((s) => (
          <Card key={s} className="flex items-center gap-3 p-4">
            <ReaderStatusDot status={s} />
            <div>
              <p className="text-2xl font-semibold text-foreground">{data.filter((r) => r.status === s).length}</p>
              <p className="text-xs capitalize text-muted-foreground">{s}</p>
            </div>
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden">
        <Table>
          <THead>
            <TR>
              <TH>Reader</TH>
              <TH>Status</TH>
              <TH>Temperature</TH>
              <TH>Firmware</TH>
              <TH>Last calibration</TH>
              <TH>Heartbeat</TH>
              <TH>Analyses</TH>
              <TH>Actions</TH>
            </TR>
          </THead>
          <TBody>
            {data.map((r) => (
              <TR key={r.id}>
                <TD>
                  <p className="flex items-center gap-2 font-mono font-semibold text-foreground">
                    <Cpu className="size-4 text-muted-foreground" /> {r.reader_code}
                  </p>
                  <p className="text-xs text-muted-foreground">{r.location_name}</p>
                </TD>
                <TD>
                  <span className="flex items-center gap-2 text-sm capitalize">
                    <ReaderStatusDot status={r.status} /> {r.status}
                  </span>
                </TD>
                <TD className="text-sm">
                  {r.temperature_label} · {r.temperature_c.toFixed(1)}°C
                </TD>
                <TD className="font-mono text-xs">{r.firmware_version}</TD>
                <TD>
                  <span className="text-sm">{formatDate(r.last_calibration)}</span>
                  {due(r) && (
                    <Badge tone="warning" className="ml-2">
                      <AlertTriangle className="size-3" /> Due
                    </Badge>
                  )}
                </TD>
                <TD className="text-sm text-muted-foreground">{relativeTime(r.last_heartbeat_at)}</TD>
                <TD className="tabular text-sm">{r.total_analyses}</TD>
                <TD>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => calibrate.mutate(r.reader_code)} disabled={r.status === "analyzing"}>
                      <Wrench /> Calibrate
                    </Button>
                    <Select
                      className="h-8 w-36 text-xs"
                      value={r.status === "analyzing" ? "online" : r.status}
                      disabled={r.status === "analyzing"}
                      onChange={(e) => setStatus.mutate({ code: r.reader_code, status: e.target.value })}
                    >
                      <option value="online">Online</option>
                      <option value="maintenance">Maintenance</option>
                      <option value="offline">Offline</option>
                    </Select>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
