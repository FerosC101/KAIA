import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Eye, FlaskConical, KeyRound, Lock, Plus, ShieldCheck, ShieldOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ErrorBlock, LoadingBlock, PageHeader, SectionTitle } from "@/components/kaia/layout-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/form";
import { api } from "@/lib/api";
import type { Consent, OrgRef } from "@/lib/types";
import { formatDate, relativeTime } from "@/lib/utils";

type AccessEntry = { id: string; timestamp: string; institution_name: string; role: string; action_label: string };

function GrantDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { data: orgs = [] } = useQuery({ queryKey: ["grantees"], queryFn: () => api<OrgRef[]>("/consents/grantees"), enabled: open });
  const [target, setTarget] = useState("research");
  const [scope, setScope] = useState("screening");
  const grant = useMutation({
    mutationFn: () =>
      api("/consents", {
        method: "POST",
        body: target === "research" ? { scope: "anonymous_statistics" } : { scope, organization_id: target },
      }),
    onSuccess: () => {
      toast.success("Access granted");
      qc.invalidateQueries({ queryKey: ["consents"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader icon={<KeyRound className="size-5" />} title="Grant access" description="Choose who can see which part of your screening information." />
        <div className="space-y-4">
          <Field label="Who" htmlFor="who">
            <Select id="who" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="research">KAIA Research Program (anonymous statistics only)</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
          {target !== "research" && (
            <Field label="What" htmlFor="scope">
              <Select id="scope" value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="screening">Screening information</option>
                <option value="referral">Referral information</option>
                <option value="passport">KAIA Passport history</option>
              </Select>
            </Field>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => grant.mutate()} disabled={grant.isPending}>
            Grant Access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Privacy() {
  const qc = useQueryClient();
  const [grantOpen, setGrantOpen] = useState(false);
  const [confirm, setConfirm] = useState<Consent | null>(null);
  const consents = useQuery({ queryKey: ["consents"], queryFn: () => api<Consent[]>("/consents") });
  const log = useQuery({ queryKey: ["access-log"], queryFn: () => api<AccessEntry[]>("/patients/me/access-log") });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/consents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Access revoked");
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ["consents"] });
    },
    onError: (e) => toast.error(e.message),
  });

  if (consents.isLoading) return <LoadingBlock />;
  if (consents.error || !consents.data) return <ErrorBlock error={consents.error} onRetry={consents.refetch} />;

  const active = consents.data.filter((c) => c.status === "granted");
  const revoked = consents.data.filter((c) => c.status === "revoked");

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Privacy & consent"
        title="Who can access my data?"
        description="You decide which facilities can see your screening information. Revoking access takes effect immediately."
        actions={
          <Button onClick={() => setGrantOpen(true)}>
            <Plus /> Grant Access
          </Button>
        }
      />

      <div className="space-y-3">
        {active.map((c) => (
          <Card key={c.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <span className="grid size-11 shrink-0 place-items-center rounded-field bg-secondary text-secondary-foreground">
              {c.scope === "anonymous_statistics" ? <FlaskConical className="size-5" /> : <Building2 className="size-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">{c.grantee_name}</p>
              <p className="text-sm text-muted-foreground">{c.scope_label}</p>
              <p className="text-xs text-subtle">Since {formatDate(c.granted_at)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={c.scope === "anonymous_statistics" ? "lavender" : "success"} dot>
                {c.scope === "anonymous_statistics" ? "Anonymous only" : "Access granted"}
              </Badge>
              <Button size="sm" variant="outline" onClick={() => setConfirm(c)}>
                <ShieldOff /> Revoke
              </Button>
            </div>
          </Card>
        ))}
        {active.length === 0 && <Card className="p-5 text-sm text-muted-foreground">No organization currently has access to your data.</Card>}
      </div>

      {revoked.length > 0 && (
        <section>
          <SectionTitle>Revoked</SectionTitle>
          <div className="space-y-2">
            {revoked.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-field border border-dashed border-input px-4 py-3 text-sm">
                <span className="text-muted-foreground">
                  <b className="text-foreground">{c.grantee_name}</b> · {c.scope_label}
                </span>
                <span className="text-xs text-subtle">Revoked {formatDate(c.revoked_at)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle>Recent access to your data</SectionTitle>
        <Card className="divide-y divide-border">
          {(log.data ?? []).slice(0, 12).map((entry) => (
            <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
              <Eye className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{entry.action_label}</p>
                <p className="truncate text-xs text-muted-foreground">{entry.institution_name}</p>
              </div>
              <span className="shrink-0 text-xs text-subtle">{relativeTime(entry.timestamp)}</span>
            </div>
          ))}
          {log.data?.length === 0 && <p className="p-4 text-sm text-muted-foreground">No one else has accessed your records yet.</p>}
        </Card>
      </section>

      <Card className="grid gap-4 p-5 sm:grid-cols-3">
        {[
          { icon: Lock, title: "Encrypted", text: "Your name, birth date and contact details are encrypted at rest." },
          { icon: ShieldCheck, title: "Consent-based", text: "Facilities can only open your records while you allow it." },
          { icon: FlaskConical, title: "De-identified analytics", text: "Program dashboards only ever see counts — never your identity." },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title}>
            <Icon className="size-5 text-primary" />
            <p className="mt-2 text-sm font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">{text}</p>
          </div>
        ))}
      </Card>

      <GrantDialog open={grantOpen} onOpenChange={setGrantOpen} />
      <Dialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <DialogContent>
          <DialogHeader icon={<ShieldOff className="size-5" />} title="Revoke access?" description={confirm ? `${confirm.grantee_name} will no longer be able to open your ${confirm.scope_label.toLowerCase()}.` : ""} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Keep access
            </Button>
            <Button variant="priority" onClick={() => confirm && revoke.mutate(confirm.id)} disabled={revoke.isPending}>
              Revoke Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
