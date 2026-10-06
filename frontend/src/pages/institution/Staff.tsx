import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ErrorBlock, LoadingBlock, PageHeader } from "@/components/kaia/layout-bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useActiveOrg } from "@/lib/activeOrg";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/utils";

type Staff = { id: string; name: string; email: string; position: string; employee_code: string; active: boolean; last_login_at: string | null; screenings_reviewed: number };

export default function StaffPage() {
  const { orgId, org } = useActiveOrg();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", position: "", temporary_password: "" });
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["staff", orgId], queryFn: () => api<Staff[]>(`/organizations/${orgId}/staff`), enabled: !!orgId });
  const create = useMutation({
    mutationFn: () => api(`/organizations/${orgId}/staff`, { method: "POST", body: form }),
    onSuccess: () => {
      toast.success("Health worker added");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api(`/organizations/${orgId}/staff/${id}`, { method: "PATCH", body: { active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff"] }),
    onError: (e) => toast.error(e.message),
  });
  if (!orgId || isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={refetch} />;

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <div>
      <PageHeader
        eyebrow={org?.name}
        title="Health workers"
        description="Deactivating a health worker signs them out everywhere immediately."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus /> Add health worker
          </Button>
        }
      />
      <Card className="overflow-hidden">
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Position</TH>
              <TH>Employee code</TH>
              <TH>Results reviewed</TH>
              <TH>Last sign-in</TH>
              <TH>Active</TH>
            </TR>
          </THead>
          <TBody>
            {data.map((s) => (
              <TR key={s.id}>
                <TD>
                  <p className="font-medium text-foreground">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.email}</p>
                </TD>
                <TD className="text-sm">{s.position}</TD>
                <TD className="font-mono text-xs">{s.employee_code}</TD>
                <TD className="tabular text-sm">{s.screenings_reviewed}</TD>
                <TD className="text-sm text-muted-foreground">{relativeTime(s.last_login_at)}</TD>
                <TD>
                  <Switch checked={s.active} onCheckedChange={(active) => toggle.mutate({ id: s.id, active })} aria-label="Active" />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader icon={<UserPlus className="size-5" />} title="Add health worker" description={org?.name} />
          <form onSubmit={submit} className="space-y-4">
            <Field label="Full name">
              <Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Position">
              <Input required placeholder="Midwife, Nurse, Pharmacist…" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
            </Field>
            <Field label="Temporary password" hint="At least 10 characters with letters and numbers.">
              <Input type="password" required value={form.temporary_password} onChange={(e) => setForm({ ...form, temporary_password: e.target.value })} />
            </Field>
            <DialogFooter>
              <Button type="submit" disabled={create.isPending}>
                Add health worker
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
