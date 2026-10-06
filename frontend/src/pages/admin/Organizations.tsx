import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ErrorBlock, LoadingBlock, PageHeader } from "@/components/kaia/layout-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { ORG_TYPE_LABEL, SERVICE_LABEL } from "@/lib/labels";

type Org = {
  id: string;
  name: string;
  org_type: string;
  code: string;
  city: string;
  address: string;
  phone: string | null;
  operating_hours: string | null;
  services: string[];
  is_referral_partner: boolean;
  active: boolean;
  health_workers: number;
  readers: number;
  screenings: number;
};

function CreateOrgDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", code: "", org_type: "clinic", city: "Batangas City", province: "Batangas", address: "", phone: "", operating_hours: "" });
  const [services, setServices] = useState<string[]>(["kaia_screening"]);
  const create = useMutation({
    mutationFn: () => api("/admin/organizations", { method: "POST", body: { ...form, phone: form.phone || null, operating_hours: form.operating_hours || null, services } }),
    onSuccess: () => {
      toast.success("Organization created");
      qc.invalidateQueries({ queryKey: ["admin-orgs"] });
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
      <DialogContent wide>
        <DialogHeader icon={<Building2 className="size-5" />} title="Add organization" description="RHU, clinic, pharmacy or screening center joining the KAIA network." />
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2">
            <Input required value={form.name} onChange={set("name")} />
          </Field>
          <Field label="Code">
            <Input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Type">
            <Select value={form.org_type} onChange={set("org_type")}>
              {Object.entries(ORG_TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input required value={form.address} onChange={set("address")} />
          </Field>
          <Field label="City">
            <Input required value={form.city} onChange={set("city")} />
          </Field>
          <Field label="Province">
            <Input required value={form.province} onChange={set("province")} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={set("phone")} />
          </Field>
          <Field label="Operating hours">
            <Input value={form.operating_hours} onChange={set("operating_hours")} />
          </Field>
          <div className="sm:col-span-2">
            <p className="mb-2 text-sm font-medium">Services</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(SERVICE_LABEL).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={services.includes(value)}
                    onChange={(e) => setServices(e.target.checked ? [...services, value] : services.filter((s) => s !== value))}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={create.isPending}>
              Create organization
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Organizations() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["admin-orgs"], queryFn: () => api<Org[]>("/admin/organizations") });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api(`/admin/organizations/${id}`, { method: "PATCH", body: { active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-orgs"] }),
    onError: (e) => toast.error(e.message),
  });
  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={refetch} />;
  return (
    <div>
      <PageHeader
        eyebrow="Network"
        title="Organizations"
        description="Screening sites and referral partners in the KAIA network."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus /> Add organization
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {data.map((o) => (
          <Card key={o.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">{o.name}</p>
                <p className="text-xs text-muted-foreground">
                  {ORG_TYPE_LABEL[o.org_type]} · <span className="font-mono">{o.code}</span>
                </p>
              </div>
              <Switch checked={o.active} onCheckedChange={(active) => toggle.mutate({ id: o.id, active })} aria-label="Active" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{o.address}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[
                ["Workers", o.health_workers],
                ["Readers", o.readers],
                ["Screenings", o.screenings],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-muted/70 py-2">
                  <p className="tabular text-lg font-bold text-foreground">{value}</p>
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {o.services.map((s) => (
                <Badge key={s} tone="lavender">
                  {SERVICE_LABEL[s] ?? s}
                </Badge>
              ))}
            </div>
          </Card>
        ))}
      </div>
      <CreateOrgDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
