import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, CircleAlert, Loader2, Play, Radio, Wifi, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ErrorBlock, LoadingBlock, PageHeader } from "@/components/kaia/layout-bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { api, session } from "@/lib/api";
import { SIM_PROFILES } from "@/lib/labels";
import type { Reader, ReaderEvent } from "@/lib/types";
import { cn, formatLongDate } from "@/lib/utils";
import { ReaderStatusDot } from "@/pages/worker/Readers";

type StageState = { state: "pending" | "running" | "done"; message?: string };

function useReaderSocket(code: string | undefined, onEvent: (e: ReaderEvent) => void) {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onEvent);
  handler.current = onEvent;
  useEffect(() => {
    if (!code) return;
    let socket: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${protocol}://${window.location.host}/api/ws/readers/${code}`);
      socket.onopen = () => socket?.send(JSON.stringify({ token: session.token() }));
      socket.onmessage = (msg) => {
        const event = JSON.parse(msg.data) as ReaderEvent;
        if (event.type === "subscribed") setConnected(true);
        handler.current(event);
      };
      socket.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, [code]);
  return connected;
}

export default function ReaderConsole() {
  const { readerCode } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [stages, setStages] = useState<Record<number, StageState>>({});
  const [phase, setPhase] = useState<"idle" | "running" | "complete" | "failed">("idle");
  const [completedScreening, setCompletedScreening] = useState<string | null>(null);

  const reader = useQuery({
    queryKey: ["reader", readerCode],
    queryFn: () => api<Reader>(`/readers/${readerCode}/status`),
    refetchInterval: phase === "running" ? 1500 : 5000,
  });

  // Polling fallback: reconstruct progress from persisted stage if the socket is unavailable.
  useEffect(() => {
    const active = reader.data?.active_screening;
    if (reader.data?.status === "analyzing" && active && phase !== "complete") {
      setPhase("running");
      setStages((prev) => {
        const next = { ...prev };
        for (let i = 1; i <= active.analysis_stage; i++) if (next[i]?.state !== "done") next[i] = { state: "done", message: next[i]?.message };
        if (active.analysis_stage < 7 && next[active.analysis_stage + 1]?.state !== "done") next[active.analysis_stage + 1] = { state: "running" };
        return next;
      });
    }
  }, [reader.data, phase]);

  const onEvent = useCallback(
    (event: ReaderEvent) => {
      if (event.type === "analysis_started") {
        setStages({});
        setPhase("running");
      } else if (event.type === "stage_started" && event.stage) {
        setPhase("running");
        setStages((s) => ({ ...s, [event.stage!]: { state: "running" } }));
      } else if (event.type === "stage_completed" && event.stage) {
        setStages((s) => ({ ...s, [event.stage!]: { state: "done", message: event.detail?.message } }));
      } else if (event.type === "analysis_complete") {
        setPhase("complete");
        setCompletedScreening(event.screening_id ?? null);
        qc.invalidateQueries();
        toast.success("Analysis complete — result awaiting clinician review");
      } else if (event.type === "analysis_failed") {
        setPhase("failed");
        toast.error(event.message ?? "Analysis failed");
        qc.invalidateQueries({ queryKey: ["reader", readerCode] });
      }
    },
    [qc, readerCode],
  );
  const connected = useReaderSocket(readerCode, onEvent);

  const start = useMutation({
    mutationFn: (screeningId: string) =>
      api(`/readers/${readerCode}/start-analysis`, { method: "POST", body: { screening_id: screeningId } }),
    onMutate: () => {
      setStages({});
      setPhase("running");
      setCompletedScreening(null);
    },
    onError: (e) => {
      setPhase("idle");
      toast.error(e.message);
    },
  });

  if (reader.isLoading) return <LoadingBlock />;
  if (reader.error || !reader.data) return <ErrorBlock error={reader.error} onRetry={reader.refetch} />;
  const r = reader.data;
  const list = r.stages ?? [];
  const doneCount = Object.values(stages).filter((s) => s.state === "done").length;
  const canStart = r.status === "online" && r.active_screening?.status === "cartridge_registered" && phase !== "running";
  const profile = SIM_PROFILES.find((p) => p.value === r.active_screening?.sim_profile);
  const screeningForResult = completedScreening ?? (phase === "complete" ? r.active_screening?.id : null);

  return (
    <div className="space-y-6">
      <Link to="/portal/readers" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Readers
      </Link>
      <PageHeader
        eyebrow="KAIA Reader interface"
        title={r.reader_code}
        description={r.location_name}
        actions={
          <span className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold", connected ? "bg-success-soft text-success" : "bg-muted text-muted-foreground")}>
            {connected ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />} {connected ? "Live connection" : "Polling"}
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        {/* Device panel */}
        <div className="overflow-hidden rounded-card bg-charcoal p-2 shadow-lift">
          <div className="rounded-[1.6rem] border border-white/10 bg-gradient-to-b from-[#2b3442] to-charcoal p-6 text-white">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">KAIA Reader</span>
              <Radio className={cn("size-4", r.status === "offline" ? "text-white/30" : "text-[#7fd1a2]")} />
            </div>
            <dl className="mt-5 space-y-3.5 text-sm">
              {[
                ["Reader ID", <span className="font-mono">{r.reader_code}</span>],
                ["Location", r.location_name],
                [
                  "Status",
                  <span className="flex items-center gap-2 font-bold uppercase tracking-wider">
                    <ReaderStatusDot status={r.status} /> {r.status}
                  </span>,
                ],
                ["Temperature", `${r.temperature_label} · ${r.temperature_c.toFixed(1)}°C`],
                ["Firmware", r.firmware_version],
                ["Last Calibration", formatLongDate(r.last_calibration)],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex items-start justify-between gap-4">
                  <dt className="text-white/50">{label}</dt>
                  <dd className="text-right font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 rounded-card border border-white/10 bg-black/20 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">Cartridge Inserted</p>
              {r.current_cartridge ? (
                <>
                  <p className="mt-1 font-mono text-xl font-bold tracking-wide">{r.current_cartridge.cartridge_code}</p>
                  {r.active_screening && (
                    <p className="mt-1 text-xs text-white/60">
                      {r.active_screening.patient_code} · {r.active_screening.screening_code}
                    </p>
                  )}
                  {profile && <p className="mt-2 text-[11px] text-lavender">Simulator profile: {profile.label}</p>}
                </>
              ) : (
                <p className="mt-1 text-white/60">{phase === "complete" ? "Cartridge ejected" : "No cartridge inserted"}</p>
              )}
            </div>
            <Button
              size="lg"
              className="mt-6 w-full bg-white text-foreground hover:bg-white/90"
              disabled={!canStart || start.isPending}
              onClick={() => r.active_screening && start.mutate(r.active_screening.id)}
            >
              {phase === "running" ? <Loader2 className="animate-spin" /> : <Play />}
              {phase === "running" ? "Analyzing…" : "Begin Analysis"}
            </Button>
            {!canStart && phase === "idle" && (
              <p className="mt-3 text-center text-xs text-white/50">
                {r.status !== "online" ? `Reader is ${r.status}.` : "Register a cartridge to a screening to begin."}
              </p>
            )}
          </div>
        </div>

        {/* Progress */}
        <Card className="p-5 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Analysis progress</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {phase === "idle" && "Ready"}
                {phase === "running" && `Stage ${Math.min(doneCount + 1, list.length)} of ${list.length}`}
                {phase === "complete" && "Result generated"}
                {phase === "failed" && "Analysis interrupted"}
              </p>
            </div>
            <span className="tabular text-2xl font-bold text-primary">{Math.round((doneCount / (list.length || 7)) * 100)}%</span>
          </div>
          <Progress value={(doneCount / (list.length || 7)) * 100} className="mt-4 h-2.5" />

          <ol className="mt-6 space-y-2">
            {list.map((stage) => {
              const st = stages[stage.stage]?.state ?? "pending";
              return (
                <li
                  key={stage.stage}
                  className={cn(
                    "flex items-start gap-3 rounded-card border px-4 py-3 transition-all duration-500",
                    st === "running" && "border-primary/40 bg-primary-soft/60 shadow-soft",
                    st === "done" && "border-border bg-surface",
                    st === "pending" && "border-transparent bg-muted/50 opacity-70",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold",
                      st === "done" && "bg-primary text-white",
                      st === "running" && "bg-surface text-primary ring-2 ring-primary",
                      st === "pending" && "bg-surface text-subtle",
                    )}
                  >
                    {st === "done" ? <Check className="size-4" strokeWidth={3} /> : st === "running" ? <Loader2 className="size-4 animate-spin" /> : stage.stage}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("font-semibold", st === "pending" ? "text-muted-foreground" : "text-foreground")}>{stage.label}</p>
                    {stages[stage.stage]?.message && <p className="text-xs text-muted-foreground">{stages[stage.stage]?.message}</p>}
                    {st === "running" && !stages[stage.stage]?.message && <p className="text-xs text-primary">Processing…</p>}
                  </div>
                </li>
              );
            })}
          </ol>

          {phase === "complete" && screeningForResult && (
            <div className="mt-6 flex flex-col items-start gap-3 rounded-card bg-success-soft p-4 sm:flex-row sm:items-center">
              <Check className="size-5 text-success" />
              <p className="flex-1 text-sm font-medium text-success">KAIA Vision and the Risk Engine finished. A clinician must review before release.</p>
              <Button onClick={() => navigate(`/portal/vision/${screeningForResult}`)}>
                Open KAIA Vision <ArrowRight />
              </Button>
            </div>
          )}
          {phase === "failed" && (
            <div className="mt-6 flex items-center gap-3 rounded-card bg-priority-soft p-4 text-sm text-priority">
              <CircleAlert className="size-5" /> The cartridge remains registered. Check the reader and try again.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
