import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ErrorBlock, LoadingBlock, PageHeader } from "@/components/kaia/layout-bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { api } from "@/lib/api";
import type { OrgRef, Reader } from "@/lib/types";
import { formatDate, relativeTime } from "@/lib/utils";
import { ReaderStatusDot } from "@/pages/worker/Readers";

function RegisterReaderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { data: orgs = [] } = useQuery({ queryKey: ["organizations"], queryFn: () => api<OrgRef[]>("/organizations"), enabled: open });
  const [form, setForm] = useState({ reader_code: "KAIA-RDR-", serial_number: "SN-", organization_id: "", location_name: "", firmware_version: "v1.2.3" });
  const create = useMutation({
    mutationFn: () => api("/readers", { method: "POST", body: { ...form, organization_id: form.organization_id || orgs[0]?.id } }),
    onSuccess: () => {
      toast.success("Reader registered (offline until first heartbeat)");
      qc.invalidateQueries({ queryKey: ["readers"] });
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
        <DialogHeader icon={<Cpu className="size-5" />} title="Register KAIA Reader" />
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Reader ID">
              <Input required className="font-mono" value={form.reader_code} onChange={(e) => setForm({ ...form, reader_code: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Serial number">
              <Input required className="font-mono" value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value.toUpperCase() })} />
            </Field>
          </div>
          <Field label="Organization">
            <Select value={form.organization_id} onChange={set("organization_id")}>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Location">
            <Input required value={form.location_name} onChange={set("location_name")} />
          </Field>
          <Field label="Firmware">
            <Input required value={form.firmware_version} onChange={set("firmware_version")} />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              Register reader
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminReaders() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["readers"], queryFn: () => api<Reader[]>("/readers"), refetchInterval: 10_000 });
  const update = useMutation({
    mutationFn: ({ code, status }: { code: string; status: string }) => api(`/readers/${code}`, { method: "PATCH", body: { status } }),
    onSuccess: () => {
      toast.success("Reader updated");
      qc.invalidateQueries({ queryKey: ["readers"] });
    },
    onError: (e) => toast.error(e.message),
  });
  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={refetch} />;
  return (
    <div>
      <PageHeader
        eyebrow="Devices"
        title="KAIA Readers"
        description="Fleet of point-of-care readers across all organizations."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus /> Register reader
          </Button>
        }
      />
      <Card className="overflow-hidden">
        <Table>
          <THead>
            <TR>
              <TH>Reader</TH>
              <TH>Organization</TH>
              <TH>Status</TH>
              <TH>Firmware</TH>
              <TH>Calibration</TH>
              <TH>Heartbeat</TH>
              <TH>Analyses</TH>
              <TH>Set status</TH>
            </TR>
          </THead>
          <TBody>
            {data.map((r) => (
              <TR key={r.id}>
                <TD>
                  <p className="font-mono font-semibold text-foreground">{r.reader_code}</p>
                  <p className="text-xs text-muted-foreground">{r.location_name}</p>
                </TD>
                <TD className="text-sm">{r.organization.name}</TD>
                <TD>
                  <span className="flex items-center gap-2 text-sm font-medium capitalize">
                    <ReaderStatusDot status={r.status} /> {r.status}
                  </span>
                </TD>
                <TD className="font-mono text-xs">{r.firmware_version}</TD>
                <TD className="text-sm">{formatDate(r.last_calibration)}</TD>
                <TD className="text-sm text-muted-foreground">{relativeTime(r.last_heartbeat_at)}</TD>
                <TD className="tabular text-sm">{r.total_analyses}</TD>
                <TD>
                  <Select
                    value={r.status === "analyzing" ? "online" : r.status}
                    disabled={r.status === "analyzing"}
                    onChange={(e) => update.mutate({ code: r.reader_code, status: e.target.value })}
                    className="h-9 w-36"
                  >
                    <option value="online">Online</option>
                    <option value="offline">Offline</option>
                    <option value="maintenance">Maintenance</option>
                  </Select>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <RegisterReaderDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
