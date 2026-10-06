import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Gauge, Thermometer, Wrench } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ErrorBlock, LoadingBlock, PageHeader } from "@/components/kaia/layout-bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { Reader } from "@/lib/types";
import { cn, formatDate, relativeTime } from "@/lib/utils";

export function ReaderStatusDot({ status }: { status: Reader["status"] }) {
  const color = { online: "bg-success", analyzing: "bg-primary animate-pulse-soft", offline: "bg-subtle", maintenance: "bg-warning" }[status];
  return <span className={cn("inline-block size-2.5 rounded-full", color)} />;
}

export default function Readers() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["readers"], queryFn: () => api<Reader[]>("/readers"), refetchInterval: 5000 });
  const calibrate = useMutation({
    mutationFn: (code: string) => api<Reader>(`/readers/${code}/calibrate`, { method: "POST" }),
    onSuccess: (r) => {
      toast.success(`${r.reader_code} calibrated`);
      qc.invalidateQueries({ queryKey: ["readers"] });
    },
    onError: (e) => toast.error(e.message),
  });
  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={refetch} />;

  return (
    <div>
      <PageHeader eyebrow="Devices" title="KAIA Readers" description="Point-of-care readers connected to your site. Open a console to run an analysis." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.map((r) => (
          <Card key={r.id} className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-lg font-bold text-foreground">{r.reader_code}</p>
                <p className="text-sm text-muted-foreground">{r.location_name}</p>
              </div>
              <span className="flex items-center gap-2 rounded-full bg-muted px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-foreground">
                <ReaderStatusDot status={r.status} /> {r.status}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-xl bg-muted/70 p-2.5">
                <Thermometer className="size-3.5 text-muted-foreground" />
                <p className="mt-1 font-semibold text-foreground">{r.temperature_label}</p>
                <p className="text-muted-foreground">{r.temperature_c.toFixed(1)}°C</p>
              </div>
              <div className="rounded-xl bg-muted/70 p-2.5">
                <Wrench className="size-3.5 text-muted-foreground" />
                <p className="mt-1 font-semibold text-foreground">{formatDate(r.last_calibration, { year: undefined })}</p>
                <p className="text-muted-foreground">Calibrated</p>
              </div>
              <div className="rounded-xl bg-muted/70 p-2.5">
                <Gauge className="size-3.5 text-muted-foreground" />
                <p className="mt-1 font-semibold text-foreground">{r.firmware_version}</p>
                <p className="text-muted-foreground">{r.total_analyses} runs</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-dashed border-input px-3 py-2.5 text-sm">
              {r.current_cartridge ? (
                <span>
                  Cartridge inserted: <b className="font-mono">{r.current_cartridge.cartridge_code}</b>
                </span>
              ) : (
                <span className="text-muted-foreground">No cartridge inserted</span>
              )}
            </div>
            <p className="mt-2 text-xs text-subtle">Last heartbeat {relativeTime(r.last_heartbeat_at)}</p>
            <div className="mt-4 flex gap-2">
              <Button asChild className="flex-1">
                <Link to={`/portal/readers/${r.reader_code}`}>
                  Open console <ArrowRight />
                </Link>
              </Button>
              <Button variant="outline" onClick={() => calibrate.mutate(r.reader_code)} disabled={calibrate.isPending || r.status === "analyzing"}>
                Calibrate
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
