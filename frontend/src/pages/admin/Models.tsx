import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BrainCircuit, Plus, Rocket } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ErrorBlock, LoadingBlock, PageHeader, SectionTitle } from "@/components/kaia/layout-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { api } from "@/lib/api";
import type { Tone } from "@/lib/labels";
import { formatDate, humanize } from "@/lib/utils";

type Model = {
  id: string;
  name: string;
  model_type: "vision" | "risk" | "continuity";
  version: string;
  status: "active" | "shadow" | "retired";
  description: string;
  metrics: Record<string, number>;
  released_at: string;
  activated_at: string | null;
  analyses: number;
};

const TYPE_LABEL = { vision: "KAIA Vision", risk: "KAIA Risk Engine model", continuity: "KAIA Continuity Engine" };
const STATUS_TONE: Record<Model["status"], Tone> = { active: "success", shadow: "info", retired: "neutral" };

export default function Models() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "kaia-vision-sim", model_type: "vision", version: "", description: "" });
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["models"], queryFn: () => api<Model[]>("/admin/model-versions") });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["models"] });
  const activate = useMutation({
    mutationFn: (id: string) => api<Model>(`/admin/model-versions/${id}/activate`, { method: "POST" }),
    onSuccess: (m) => {
      toast.success(`${m.version} is now active`);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api(`/admin/model-versions/${id}/status?status=${status}`, { method: "POST" }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });
  const register = useMutation({
    mutationFn: () => api("/admin/model-versions", { method: "POST", body: { ...form, metrics: {}, status: "shadow" } }),
    onSuccess: () => {
      toast.success("Model registered in shadow mode");
      setOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={refetch} />;

  function submit(e: FormEvent) {
    e.preventDefault();
    register.mutate();
  }

  return (
    <div>
      <PageHeader
        eyebrow="AI governance"
        title="Model versions"
        description="AI modules are isolated services. New versions run in shadow mode before promotion; every analysis records the version that produced it."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus /> Register version
          </Button>
        }
      />
      <div className="space-y-8">
        {(["vision", "risk", "continuity"] as const).map((type) => (
          <section key={type}>
            <SectionTitle>{TYPE_LABEL[type]}</SectionTitle>
            <div className="grid gap-4 lg:grid-cols-3">
              {data
                .filter((m) => m.model_type === type)
                .map((m) => (
                  <Card key={m.id} className={m.status === "active" ? "p-5 ring-2 ring-success/30" : "p-5"}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <BrainCircuit className="size-4 text-primary" />
                        <p className="font-mono text-sm font-semibold text-foreground">{m.version}</p>
                      </div>
                      <Badge tone={STATUS_TONE[m.status]} dot>
                        {humanize(m.status)}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{m.description}</p>
                    <dl className="mt-4 space-y-1.5 text-xs">
                      {Object.entries(m.metrics).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">{humanize(k)}</dt>
                          <dd className="tabular font-semibold text-foreground">{v}</dd>
                        </div>
                      ))}
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Released</dt>
                        <dd className="font-semibold text-foreground">{formatDate(m.released_at)}</dd>
                      </div>
                      {type === "vision" && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Analyses recorded</dt>
                          <dd className="tabular font-semibold text-foreground">{m.analyses}</dd>
                        </div>
                      )}
                    </dl>
                    {m.status !== "active" && (
                      <div className="mt-4 flex gap-2">
                        <Button size="sm" onClick={() => activate.mutate(m.id)} disabled={activate.isPending}>
                          <Rocket /> Promote to active
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: m.id, status: m.status === "shadow" ? "retired" : "shadow" })}>
                          {m.status === "shadow" ? "Retire" : "Move to shadow"}
                        </Button>
                      </div>
                    )}
                  </Card>
                ))}
            </div>
          </section>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader icon={<BrainCircuit className="size-5" />} title="Register model version" description="New versions start in shadow mode." />
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Model type">
                <Select value={form.model_type} onChange={(e) => setForm({ ...form, model_type: e.target.value })}>
                  <option value="vision">Vision</option>
                  <option value="risk">Risk</option>
                  <option value="continuity">Continuity</option>
                </Select>
              </Field>
              <Field label="Version">
                <Input required className="font-mono" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
              </Field>
            </div>
            <Field label="Name">
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Description / validation notes">
              <Textarea required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <DialogFooter>
              <Button type="submit" disabled={register.isPending}>
                Register
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
