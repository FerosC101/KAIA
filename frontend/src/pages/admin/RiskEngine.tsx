import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Pencil, Plus, Route, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DecisionSupportLabel, OutcomeBadge } from "@/components/kaia/badges";
import { ErrorBlock, LoadingBlock, PageHeader } from "@/components/kaia/layout-bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import type { DecisionTrace, Outcome } from "@/lib/types";
import { humanize } from "@/lib/utils";

type FieldSpec = { label: string; type: "boolean" | "enum" | "number"; options?: string[] };
type Condition = { field: string; op: string; value: unknown };
type Rule = { id: string; name: string; description: string; priority: number; conditions: { all: Condition[] }; outcome: Outcome; active: boolean };
type RulesResponse = {
  label: string;
  engine_version: string;
  rules: Rule[];
  fields: Record<string, FieldSpec>;
  operators: Record<string, string>;
  outcomes: { value: Outcome; label: string }[];
  model_escalation_threshold: number;
};
type Pathway = {
  id: string;
  outcome: Outcome;
  outcome_label: string;
  recommended_action: string;
  timeframe_days: number;
  patient_message: string;
  next_step_message: string;
  required_service: string | null;
};

function describe(cond: Condition, fields: Record<string, FieldSpec>, operators: Record<string, string>) {
  const value = Array.isArray(cond.value) ? cond.value.map(String).join(", ") : typeof cond.value === "boolean" ? (cond.value ? "yes" : "no") : humanize(String(cond.value));
  return `${fields[cond.field]?.label ?? cond.field} ${operators[cond.op] ?? cond.op} ${value}`;
}

function ValueInput({ spec, value, onChange }: { spec: FieldSpec | undefined; value: unknown; onChange: (v: unknown) => void }) {
  if (!spec) return null;
  if (spec.type === "boolean")
    return (
      <Select value={String(value)} onChange={(e) => onChange(e.target.value === "true")} className="h-10">
        <option value="true">Yes</option>
        <option value="false">No</option>
      </Select>
    );
  if (spec.type === "number") return <Input type="number" step="0.01" className="h-10" value={Number(value)} onChange={(e) => onChange(Number(e.target.value))} />;
  return (
    <Select value={String(value)} onChange={(e) => onChange(e.target.value)} className="h-10">
      {spec.options?.map((o) => (
        <option key={o} value={o}>
          {humanize(o)}
        </option>
      ))}
    </Select>
  );
}

function defaultValue(spec: FieldSpec) {
  return spec.type === "boolean" ? true : spec.type === "number" ? 0.5 : spec.options?.[0];
}

function RuleDialog({ meta, rule, onClose }: { meta: RulesResponse; rule: Rule | "new"; onClose: () => void }) {
  const qc = useQueryClient();
  const initial: Rule =
    rule === "new"
      ? { id: "", name: "", description: "", priority: 60, active: true, outcome: "follow_up_recommended", conditions: { all: [{ field: "hpv_signal", op: "eq", value: "detected" }] } }
      : rule;
  const [draft, setDraft] = useState<Rule>(initial);
  const save = useMutation({
    mutationFn: () => {
      const body = { name: draft.name, description: draft.description, priority: draft.priority, conditions: draft.conditions, outcome: draft.outcome, active: draft.active };
      return rule === "new" ? api("/admin/risk-rules", { method: "POST", body }) : api(`/admin/risk-rules/${draft.id}`, { method: "PATCH", body });
    },
    onSuccess: () => {
      toast.success("Rule saved");
      qc.invalidateQueries({ queryKey: ["risk-rules"] });
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const setCond = (i: number, patch: Partial<Condition>) =>
    setDraft({ ...draft, conditions: { all: draft.conditions.all.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) } });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent wide>
        <DialogHeader icon={<SlidersHorizontal className="size-5" />} title={rule === "new" ? "New decision-support rule" : "Edit rule"} description="All conditions must match. The most protective matching rule wins." />
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <Field label="Name">
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="Priority">
              <Input type="number" min={1} max={999} value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })} />
            </Field>
          </div>
          <Field label="Clinical rationale">
            <Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="min-h-16" />
          </Field>
          <div>
            <p className="mb-2 text-sm font-medium">Conditions</p>
            <div className="space-y-2">
              {draft.conditions.all.map((cond, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-card bg-muted/60 p-2 sm:grid-cols-[1.3fr_0.8fr_1fr_auto]">
                  <Select
                    className="h-10"
                    value={cond.field}
                    onChange={(e) => setCond(i, { field: e.target.value, op: "eq", value: defaultValue(meta.fields[e.target.value]) })}
                  >
                    {Object.entries(meta.fields).map(([key, spec]) => (
                      <option key={key} value={key}>
                        {spec.label}
                      </option>
                    ))}
                  </Select>
                  <Select className="h-10" value={cond.op} onChange={(e) => setCond(i, { op: e.target.value })}>
                    {Object.entries(meta.operators)
                      .filter(([op]) => (meta.fields[cond.field]?.type === "number" ? op !== "in" : !["gte", "lte", "in"].includes(op)))
                      .map(([op, label]) => (
                        <option key={op} value={op}>
                          {label}
                        </option>
                      ))}
                  </Select>
                  <ValueInput spec={meta.fields[cond.field]} value={cond.value} onChange={(value) => setCond(i, { value })} />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove condition"
                    onClick={() => setDraft({ ...draft, conditions: { all: draft.conditions.all.filter((_, idx) => idx !== i) } })}
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="link"
              className="mt-2"
              onClick={() => setDraft({ ...draft, conditions: { all: [...draft.conditions.all, { field: "secondary_marker", op: "eq", value: "detected" }] } })}
            >
              <Plus /> Add condition
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Outcome">
              <Select value={draft.outcome} onChange={(e) => setDraft({ ...draft, outcome: e.target.value as Outcome })}>
                {meta.outcomes.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <label className="flex items-center gap-3 pt-7 text-sm font-medium">
              <Switch checked={draft.active} onCheckedChange={(active) => setDraft({ ...draft, active })} /> Active
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !draft.name}>
            Save rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Tester({ meta }: { meta: RulesResponse }) {
  const [input, setInput] = useState<Record<string, unknown>>({
    control_valid: true,
    hpv_signal: "detected",
    hpv_genotype: "other_high_risk",
    secondary_marker: "not_detected",
    sample_quality: "good",
    hpv_signal_intensity: 0.58,
    prior_high_risk_result: false,
    prior_missed_follow_up: false,
    age_bracket: "30-39",
  });
  const test = useMutation({
    mutationFn: () => api<{ outcome: Outcome; outcome_label: string; trace: DecisionTrace }>("/admin/risk-rules/test", { method: "POST", body: input }),
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5">
        <p className="mb-4 text-sm font-semibold text-foreground">Hypothetical assay & history</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(meta.fields).map(([key, spec]) => (
            <Field key={key} label={spec.label}>
              <ValueInput spec={spec} value={input[key]} onChange={(v) => setInput({ ...input, [key]: v })} />
            </Field>
          ))}
        </div>
        <Button className="mt-5" onClick={() => test.mutate()} disabled={test.isPending}>
          <FlaskConical /> Run dry-run
        </Button>
      </Card>
      <Card className="p-5">
        <p className="mb-4 text-sm font-semibold text-foreground">Engine output</p>
        {!test.data ? (
          <p className="text-sm text-muted-foreground">Run a dry-run to see which rules match. Nothing is saved.</p>
        ) : (
          <div className="space-y-4">
            <OutcomeBadge outcome={test.data.outcome} className="px-3 py-1 text-sm" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Matched rules</p>
              <ul className="mt-2 space-y-1.5">
                {test.data.trace.matched_rules?.length ? (
                  test.data.trace.matched_rules.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 rounded-xl bg-muted/70 px-3 py-2 text-sm">
                      <span>{r.name}</span>
                      <OutcomeBadge outcome={r.outcome} />
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-muted-foreground">None</li>
                )}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">{test.data.trace.rule_note}</p>
            </div>
            {test.data.trace.model && (
              <div className="rounded-xl border border-border p-3 text-sm">
                <p className="font-semibold text-foreground">{test.data.trace.model.version ?? "No active model"}</p>
                <p className="text-xs text-muted-foreground">
                  Prioritization score {test.data.trace.model.score.toFixed(2)} (escalates at ≥ {test.data.trace.model.escalation_threshold}) ·{" "}
                  {test.data.trace.model.escalated ? "escalated" : "no escalation"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{test.data.trace.model.note}</p>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function PathwayEditor() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["pathways"], queryFn: () => api<Pathway[]>("/admin/pathways") });
  const [editing, setEditing] = useState<Pathway | null>(null);
  const save = useMutation({
    mutationFn: (p: Pathway) =>
      api(`/admin/pathways/${p.id}`, {
        method: "PATCH",
        body: { recommended_action: p.recommended_action, timeframe_days: p.timeframe_days, patient_message: p.patient_message, next_step_message: p.next_step_message },
      }),
    onSuccess: () => {
      toast.success("Pathway updated");
      qc.invalidateQueries({ queryKey: ["pathways"] });
      setEditing(null);
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {data.map((p) => (
        <Card key={p.id} className="flex flex-col p-5">
          <OutcomeBadge outcome={p.outcome} />
          <p className="mt-3 font-semibold text-foreground">{p.recommended_action}</p>
          <p className="text-xs text-muted-foreground">
            Timeframe {p.timeframe_days} days{p.required_service ? ` · requires ${humanize(p.required_service)}` : ""}
          </p>
          <p className="mt-3 flex-1 text-sm text-muted-foreground">“{p.patient_message}”</p>
          <Button size="sm" variant="outline" className="mt-4 self-start" onClick={() => setEditing(p)}>
            <Pencil /> Edit
          </Button>
        </Card>
      ))}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent wide>
          {editing && (
            <>
              <DialogHeader icon={<Route className="size-5" />} title={`${editing.outcome_label} pathway`} description="Patient messaging must never present results as a diagnosis." />
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                  <Field label="Recommended action">
                    <Input value={editing.recommended_action} onChange={(e) => setEditing({ ...editing, recommended_action: e.target.value })} />
                  </Field>
                  <Field label="Timeframe (days)">
                    <Input type="number" value={editing.timeframe_days} onChange={(e) => setEditing({ ...editing, timeframe_days: Number(e.target.value) })} />
                  </Field>
                </div>
                <Field label="Patient message">
                  <Textarea value={editing.patient_message} onChange={(e) => setEditing({ ...editing, patient_message: e.target.value })} />
                </Field>
                <Field label="Next step message">
                  <Input value={editing.next_step_message} onChange={(e) => setEditing({ ...editing, next_step_message: e.target.value })} />
                </Field>
              </div>
              <DialogFooter>
                <Button onClick={() => save.mutate(editing)} disabled={save.isPending}>
                  Save pathway
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function RiskEngine() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["risk-rules"], queryFn: () => api<RulesResponse>("/admin/risk-rules") });
  const toggle = useMutation({
    mutationFn: (r: Rule) => api(`/admin/risk-rules/${r.id}`, { method: "PATCH", body: { active: !r.active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["risk-rules"] }),
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/risk-rules/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Rule deleted");
      qc.invalidateQueries({ queryKey: ["risk-rules"] });
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={refetch} />;

  return (
    <div>
      <PageHeader
        eyebrow="KAIA Risk Engine"
        title="Rules & screening pathways"
        description={`${data.engine_version} · rules first, then a constrained model that may escalate follow-up but never lower it. Every result still requires clinician review.`}
        actions={<DecisionSupportLabel />}
      />
      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="test">Dry-run tester</TabsTrigger>
          <TabsTrigger value="pathways">Care pathways</TabsTrigger>
        </TabsList>
        <TabsContent value="rules">
          <div className="mb-3 flex justify-end">
            <Button onClick={() => setEditing("new")}>
              <Plus /> New rule
            </Button>
          </div>
          <div className="space-y-3">
            {data.rules.map((rule) => (
              <Card key={rule.id} className={rule.active ? "p-5" : "p-5 opacity-60"}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <span className="tabular grid size-10 shrink-0 place-items-center rounded-xl bg-muted font-mono text-sm font-bold text-foreground">{rule.priority}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground">{rule.name}</p>
                      <OutcomeBadge outcome={rule.outcome} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{rule.description}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {rule.conditions.all.map((c, i) => (
                        <code key={i} className="rounded-lg bg-secondary px-2 py-1 text-xs text-secondary-foreground">
                          {describe(c, data.fields, data.operators)}
                        </code>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Switch checked={rule.active} onCheckedChange={() => toggle.mutate(rule)} aria-label="Active" />
                    <Button variant="ghost" size="icon" onClick={() => setEditing(rule)} aria-label="Edit rule">
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => confirm(`Delete “${rule.name}”?`) && remove.mutate(rule.id)} aria-label="Delete rule">
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="test">
          <Tester meta={data} />
        </TabsContent>
        <TabsContent value="pathways">
          <PathwayEditor />
        </TabsContent>
      </Tabs>
      {editing && <RuleDialog meta={data} rule={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
