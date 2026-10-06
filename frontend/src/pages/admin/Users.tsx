import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { DemoBadge } from "@/components/kaia/badges";
import { ErrorBlock, LoadingBlock, PageHeader } from "@/components/kaia/layout-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { api } from "@/lib/api";
import { ROLE_LABEL, useAuth } from "@/lib/auth";
import type { OrgRef, Role, User } from "@/lib/types";
import { relativeTime } from "@/lib/utils";

function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { data: orgs = [] } = useQuery({ queryKey: ["organizations"], queryFn: () => api<OrgRef[]>("/organizations"), enabled: open });
  const [form, setForm] = useState({ email: "", full_name: "", role: "health_worker", organization_id: "", position: "", temporary_password: "" });
  const create = useMutation({
    mutationFn: () =>
      api("/admin/users", {
        method: "POST",
        body: { ...form, organization_id: form.organization_id || null, position: form.position || null },
      }),
    onSuccess: () => {
      toast.success("User created");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader icon={<UserPlus className="size-5" />} title="Create staff account" description="Patients self-register. Staff accounts are provisioned here." />
        <form onSubmit={submit} className="space-y-4">
          <Field label="Full name">
            <Input required value={form.full_name} onChange={set("full_name")} />
          </Field>
          <Field label="Email">
            <Input type="email" required value={form.email} onChange={set("email")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role">
              <Select value={form.role} onChange={set("role")}>
                <option value="health_worker">Health worker</option>
                <option value="institution_admin">Institution admin</option>
                <option value="system_admin">KAIA system admin</option>
              </Select>
            </Field>
            <Field label="Organization">
              <Select value={form.organization_id} onChange={set("organization_id")} disabled={form.role === "system_admin"}>
                <option value="">—</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {form.role === "health_worker" && (
            <Field label="Position">
              <Input value={form.position} onChange={set("position")} placeholder="Midwife, Nurse, Pharmacist…" />
            </Field>
          )}
          <Field label="Temporary password" hint="At least 10 characters with letters and numbers.">
            <Input type="password" required value={form.temporary_password} onChange={set("temporary_password")} />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              Create account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Users() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [role, setRole] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-users", role, q],
    queryFn: () => api<User[]>(`/admin/users?${new URLSearchParams({ ...(role ? { role } : {}), ...(q ? { q } : {}) })}`),
  });
  const toggle = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => api(`/admin/users/${id}`, { method: "PATCH", body: { is_active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
    onError: (e) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Access"
        title="Users"
        description="Deactivating an account revokes its sessions immediately."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus /> Create staff account
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input className="pl-10" placeholder="Search by email" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={role} onChange={(e) => setRole(e.target.value)} className="sm:w-56">
          <option value="">All roles</option>
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>
      </div>
      {isLoading ? (
        <LoadingBlock />
      ) : error || !data ? (
        <ErrorBlock error={error} onRetry={refetch} />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH>User</TH>
                <TH>Role</TH>
                <TH>Organization</TH>
                <TH>Last sign-in</TH>
                <TH>Active</TH>
              </TR>
            </THead>
            <TBody>
              {data.map((u) => (
                <TR key={u.id}>
                  <TD>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{u.full_name}</p>
                      {u.is_demo && <DemoBadge />}
                    </div>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </TD>
                  <TD>
                    <Badge tone={u.role === "patient" ? "lavender" : u.role === "system_admin" ? "plum" : "info"}>{ROLE_LABEL[u.role]}</Badge>
                  </TD>
                  <TD className="text-sm">{u.organization?.name ?? "—"}</TD>
                  <TD className="text-sm text-muted-foreground">{relativeTime(u.last_login_at)}</TD>
                  <TD>
                    <Switch checked={u.is_active} disabled={u.id === me?.id} onCheckedChange={(is_active) => toggle.mutate({ id: u.id, is_active })} aria-label="Active" />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      <CreateUserDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
