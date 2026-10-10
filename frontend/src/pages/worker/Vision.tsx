import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BrainCircuit, CheckCircle2, ChevronRight, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { AssayViewer } from "@/components/kaia/AssayViewer";
import { DecisionSupportLabel, OutcomeBadge, ScreeningStatusBadge } from "@/components/kaia/badges";
import { Disclaimer, ErrorBlock, LoadingBlock, PageHeader, SectionTitle } from "@/components/kaia/layout-bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Select, Textarea } from "@/components/ui/form";
import { api } from "@/lib/api";
import { GENOTYPE_LABEL, OUTCOME_META, type Tone } from "@/lib/labels";
import type { Analysis, Outcome, VisionView } from "@/lib/types";
import { cn, formatDateTime, humanize } from "@/lib/utils";

const CHANNELS: { key: string; label: string }[] = [
  { key: "control", label: "Control line" },
  { key: "hpv", label: "High-risk HPV" },
  { key: "genotype", label: "HPV 16/18 channel" },
  { key: "secondary", label: "Secondary biomarker" },
];
const THRESHOLD = 0.25;

function SignalRow({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-bold uppercase tracking-wider", good === undefined ? "text-foreground" : good ? "text-success" : "text-warning")}>{value}</span>
    </div>
  );
}

/** Intensity meter: plum fill on a lighter plum track, with the detection threshold marked. */
function IntensityMeters({ analysis }: { analysis: Analysis }) {
  return (
    <div className="space-y-3">
      {CHANNELS.map(({ key, label }) => {
        const v = analysis.signal_intensity[key] ?? 0;
        return (
          <div key={key}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-muted-foreground">{label}</span>
              <span className="tabular font-semibold text-foreground">{v.toFixed(2)}</span>
            </div>
            <div className="relative h-2 rounded-full bg-primary-soft" title={`${label}: ${v.toFixed(3)}`}>
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, v * 100)}%` }} />
              <span className="absolute -top-1 h-4 w-px bg-charcoal/40" style={{ left: `${(key === "control" ? 0.35 : THRESHOLD) * 100}%` }} aria-hidden />
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-subtle">Tick marks show the detection threshold (control 0.35 · signals 0.25). Background {analysis.signal_intensity.background}.</p>
    </div>
  );
}

const OUTCOME_PANEL: Partial<Record<Tone, string>> = {
  success: "border-success-ring bg-success-soft text-success",
  warning: "border-warning-ring bg-warning-soft text-warning",
  priority: "border-priority-ring bg-priority-soft text-priority",
};

function MiniStat({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background px-3.5 py-3">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-[15px] font-semibold text-foreground">{value}</p>
      {children}
    </div>
  );
}

/** KAIA Risk Engine output as a decision-support summary: suggested outcome first, then why. Never a probability of disease. */
function AnalysisSummary({ data, analysis, pending }: { data: VisionView; analysis: Analysis; pending: boolean }) {
  const trace = data.decision_trace;
  const meta = data.outcome ? OUTCOME_META[data.outcome] : null;
  const confidence = Math.max(0, Math.min(1, analysis.confidence_score));
  return (
    <Card className="overflow-hidden bg-surface p-0">
      <div className="flex items-start gap-3 border-b border-border/70 px-5 py-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-burgundy text-white shadow-button">
          <BrainCircuit className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-sans text-[15px] font-semibold text-foreground">AI analysis summary</h2>
          <p className="text-xs text-muted-foreground">KAIA Risk Engine {trace?.engine_version ?? ""} · decision support, not a diagnosis</p>
        </div>
      </div>

      <div className="space-y-4 p-5">
        {trace?.quality_gate === "failed" ? (
          <p className="rounded-2xl border border-warning-ring bg-warning-soft p-4 text-sm text-warning">{trace.note}</p>
        ) : (
          <>
            {meta && (
              <div className={cn("rounded-2xl border p-4", OUTCOME_PANEL[meta.tone] ?? "border-border bg-muted text-foreground")}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-80">{pending ? "Suggested outcome" : "Released outcome"}</p>
                <p className="mt-1 font-serif text-[22px] leading-tight">{meta.label}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-foreground/80">{meta.nextStep}</p>
                {pending && <p className="mt-2 text-xs font-medium text-foreground/70">Awaiting your approval before the patient sees it.</p>}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2.5">
              <MiniStat label="Control" value={analysis.control_validity ? "Valid" : "Invalid"} />
              <MiniStat label="Confidence" value={humanize(analysis.confidence)}>
                <div className="mt-2 h-1.5 rounded-full bg-primary-soft" aria-hidden>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${confidence * 100}%` }} />
                </div>
              </MiniStat>
              <MiniStat label="Rules matched" value={`${trace?.matched_rules?.length ?? 0} of ${trace?.rules_evaluated ?? 0}`} />
            </div>

            {!!trace?.matched_rules?.length && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Why this outcome</p>
                <ul className="space-y-1.5">
                  {trace.matched_rules.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 rounded-xl bg-muted/70 px-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="mr-2 font-mono text-xs text-subtle">P{r.priority}</span>
                        {r.name}
                      </span>
                      <OutcomeBadge outcome={r.outcome} />
                    </li>
                  ))}
                </ul>
                {trace.rule_note && <p className="mt-2 text-xs text-muted-foreground">{trace.rule_note}</p>}
              </div>
            )}

            {trace?.model && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {trace.model.version}: prioritization score {trace.model.score.toFixed(2)} — {trace.model.escalated ? "escalated to priority" : "no escalation"}.
              </p>
            )}
            {trace?.clinician_override && (
              <p className="rounded-xl bg-info-soft px-3 py-2 text-xs text-info">
                Clinician changed outcome from {OUTCOME_META[trace.clinician_override.from].label} to {OUTCOME_META[trace.clinician_override.to].label}.
              </p>
            )}
          </>
        )}
        <DecisionSupportLabel />
      </div>
    </Card>
  );
}

export default function Vision() {
  const { screeningId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [override, setOverride] = useState<Outcome | "">("");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<number | null>(null);

  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["vision", screeningId], queryFn: () => api<VisionView>(`/screenings/${screeningId}/vision`) });
  const release = useMutation({
    mutationFn: () => api(`/screenings/${screeningId}/review`, { method: "POST", body: { override_outcome: override || null, notes: notes || null } }),
    onSuccess: () => {
      toast.success("Result approved and released to the patient");
      qc.invalidateQueries();
      navigate(`/portal/screenings/${screeningId}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const rerun = useMutation({
    mutationFn: (assayId: string) => api<VisionView>(`/assays/${assayId}/analyze`, { method: "POST" }),
    onSuccess: () => {
      toast.success("KAIA Vision re-analysis recorded");
      setSelected(null);
      qc.invalidateQueries({ queryKey: ["vision", screeningId] });
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={refetch} />;
  const assay = data.assay;
  if (!assay) return <ErrorBlock error={new Error("No assay captured yet")} />;
  const analyses = assay.analyses;
  const analysis = analyses[selected ?? analyses.length - 1];
  const pending = data.status === "pending_review";

  return (
    <div className="space-y-6">
      <Link to={`/portal/screenings/${data.screening_id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {data.patient_code}
      </Link>
      <PageHeader
        eyebrow="KAIA Vision"
        title="AI-assisted assay interpretation"
        description={`${data.screening_code} · ${data.cartridge_code} · ${data.reader_code}`}
        actions={
          <>
            <ScreeningStatusBadge status={data.status} label={data.status_label} />
            <Button variant="outline" size="sm" onClick={() => rerun.mutate(assay.id)} disabled={rerun.isPending}>
              {rerun.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Re-run with active model
            </Button>
          </>
        }
      />

      {/* Pipeline */}
      <Card className="overflow-x-auto bg-surface p-3 sm:p-4">
        <ol className="flex min-w-max items-center gap-2">
          {analysis.pipeline.map((step, i) => (
            <li key={step.key} className="flex items-center gap-2">
              <div className="rounded-2xl bg-background px-4 py-2.5 ring-1 ring-border/70">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <CheckCircle2 className="size-4 text-success" /> {step.label}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {step.summary} · {step.duration_ms} ms
                </p>
              </div>
              {i < analysis.pipeline.length - 1 && <ChevronRight className="size-4 text-subtle" />}
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <div className="space-y-4">
          <AssayViewer analysis={analysis} />
          {analyses.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {analyses.map((a, i) => (
                <Button key={a.id} size="sm" variant={a.id === analysis.id ? "default" : "outline"} onClick={() => setSelected(i)}>
                  {a.model_version} · {formatDateTime(a.timestamp)}
                </Button>
              ))}
            </div>
          )}
          <Card className="bg-surface p-5">
            <SectionTitle>Stored analysis record</SectionTitle>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {[
                ["Model version", analysis.model_version],
                ["Prediction", humanize(analysis.prediction).replace(/\bhpv\b/gi, "HPV")],
                ["Control validity", analysis.control_validity ? "Valid" : "Invalid"],
                ["Confidence", `${humanize(analysis.confidence)} (${analysis.confidence_score.toFixed(2)})`],
                ["Timestamp", formatDateTime(analysis.timestamp)],
                ["Image URL", "Signed · expires in 5 min"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-border/60 py-1.5">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right font-medium text-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="bg-surface p-5">
            <SectionTitle>Assay signals</SectionTitle>
            <div className="divide-y divide-border">
              <SignalRow label="Control Signal" value={assay.control_valid ? "Valid" : "Invalid"} good={assay.control_valid} />
              <SignalRow label="HPV Signal" value={humanize(assay.hpv_signal)} good={assay.hpv_signal === "not_detected"} />
              {assay.hpv_genotype && <SignalRow label="HPV genotype channel" value={GENOTYPE_LABEL[assay.hpv_genotype]} />}
              <SignalRow label="Secondary Biomarker" value={humanize(assay.secondary_marker)} good={assay.secondary_marker === "not_detected"} />
              <SignalRow label="Sample Quality" value={assay.sample_quality} good={assay.sample_quality !== "poor"} />
              <SignalRow label="Assay Confidence" value={assay.assay_confidence} />
            </div>
            <div className="mt-4 border-t border-border pt-4">
              <IntensityMeters analysis={analysis} />
            </div>
          </Card>

          <AnalysisSummary data={data} analysis={analysis} pending={pending} />

          {pending && (
            <Card className="border-primary/30 p-5 ring-1 ring-primary/20">
              <p className="flex items-center gap-2 font-semibold text-foreground">
                <ShieldCheck className="size-4 text-primary" /> Clinician review
              </p>
              <p className="mt-1 text-sm text-muted-foreground">The result is released to the patient only after you approve it.</p>
              <div className="mt-4 space-y-3">
                <Field label="Outcome" htmlFor="override">
                  <Select id="override" value={override} onChange={(e) => setOverride(e.target.value as Outcome | "")}>
                    <option value="">Approve suggested: {data.outcome ? OUTCOME_META[data.outcome].label : "—"}</option>
                    {(Object.keys(OUTCOME_META) as Outcome[])
                      .filter((o) => o !== data.outcome)
                      .map((o) => (
                        <option key={o} value={o}>
                          Change to: {OUTCOME_META[o].label}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Field label={override ? "Clinical justification (required)" : "Review notes (optional)"} htmlFor="notes">
                  <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-20" />
                </Field>
                <Button size="lg" className="w-full" onClick={() => release.mutate()} disabled={release.isPending || (!!override && notes.trim().length < 10)}>
                  {release.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Approve & release result
                </Button>
              </div>
            </Card>
          )}
          {!pending && data.released_at && (
            <Button variant="outline" className="w-full" onClick={() => navigate(`/portal/screenings/${data.screening_id}`)}>
              Released {formatDateTime(data.released_at)} · open care pathway <ArrowRight />
            </Button>
          )}
          <Disclaimer />
        </div>
      </div>
    </div>
  );
}
