import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Package, PackagePlus, SlidersHorizontal } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ErrorBlock, LoadingBlock, PageHeader, SectionTitle } from "@/components/kaia/layout-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveOrg } from "@/lib/activeOrg";
import { api } from "@/lib/api";
import type { InventoryBatch } from "@/lib/types";
import { cn, formatDate, humanize, todayISO } from "@/lib/utils";

type Alert = InventoryBatch & { alert: string; message: string };
type Summary = Record<"kits" | "cartridges" | "readers", Record<string, number>>;

function StockMeter({ batch }: { batch: InventoryBatch }) {
  const ratio = batch.initial_quantity ? batch.quantity / batch.initial_quantity : 0;
  const low = batch.low_stock;
  return (
    <div className="w-36">
      <div className="mb-1 flex justify-between text-xs">
        <span className="tabular font-semibold text-foreground">{batch.quantity.toLocaleString()}</span>
        <span className="text-muted-foreground">of {batch.initial_quantity.toLocaleString()}</span>
      </div>
      <div className={cn("h-1.5 overflow-hidden rounded-full", low ? "bg-warning-soft" : "bg-primary-soft")} title={`${batch.quantity} remaining, reorder at ${batch.reorder_threshold}`}>
        <div className={cn("h-full rounded-full", low ? "bg-warning" : "bg-primary")} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
    </div>
  );
}

export default function Inventory() {
  const { orgId, org } = useActiveOrg();
  const qc = useQueryClient();
  const [type, setType] = useState("all");
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [adjust, setAdjust] = useState<InventoryBatch | null>(null);
  const [delta, setDelta] = useState(0);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({ item_type: "kit", batch_number: "", manufacture_date: todayISO(-7), expiry_date: todayISO(365), quantity: 200, reorder_threshold: 50, location: "" });

  const scope = orgId ? `organization_id=${orgId}` : "";
  const batches = useQuery({ queryKey: ["inventory", orgId], queryFn: () => api<InventoryBatch[]>(`/inventory?${scope}`), enabled: !!orgId });
  const alerts = useQuery({ queryKey: ["inventory-alerts", orgId], queryFn: () => api<Alert[]>(`/inventory/alerts?${scope}`), enabled: !!orgId });
  const summary = useQuery({ queryKey: ["inventory-summary", orgId], queryFn: () => api<Summary>(`/inventory/summary?${scope}`), enabled: !!orgId });
  const invalidate = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("inventory") });

  const receive = useMutation({
    mutationFn: () => api("/inventory", { method: "POST", body: { ...form, organization_id: orgId, location: form.location || org?.name } }),
    onSuccess: () => {
      toast.success("Batch received");
      setReceiveOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: () => api(`/inventory/${adjust?.id}`, { method: "PATCH", body: { ...(delta ? { quantity_delta: delta } : {}), ...(status ? { status } : {}) } }),
    onSuccess: () => {
      toast.success("Inventory updated");
      setAdjust(null);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!orgId || batches.isLoading) return <LoadingBlock />;
  if (batches.error || !batches.data) return <ErrorBlock error={batches.error} onRetry={batches.refetch} />;
  const rows = batches.data.filter((b) => type === "all" || b.item_type === type);

  function submit(e: FormEvent) {
    e.preventDefault();
    receive.mutate();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Inventory"
        description="KAIA Kits, Cartridges and Readers by batch — with low-stock and expiry alerts."
        actions={
          <Button onClick={() => setReceiveOpen(true)}>
            <PackagePlus /> Receive batch
          </Button>
        }
      />

      {(alerts.data ?? []).length > 0 && (
        <section>
          <SectionTitle>Alerts</SectionTitle>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {alerts.data!.map((a) => (
              <Card key={a.id + a.alert} className="flex items-start gap-3 border-warning/30 p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-warning-soft text-warning">
                  <AlertTriangle className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-semibold text-foreground">{a.batch_number}</p>
                  <p className="text-sm text-muted-foreground">{a.message}</p>
                  <p className="text-xs text-subtle">
                    {humanize(a.item_type)} · {a.location}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setAdjust(a); setDelta(0); setStatus(""); }}>
                  Adjust
                </Button>
              </Card>
            ))}
          </div>
        </section>
      )}

      {summary.data && (
        <div className="grid gap-3 md:grid-cols-3">
          {(["kits", "cartridges", "readers"] as const).map((k) => (
            <Card key={k} className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tracked {k}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(summary.data[k]).map(([s, n]) => (
                  <Badge key={s} tone="lavender">
                    {humanize(s)} · {n}
                  </Badge>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Tabs value={type} onValueChange={setType}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="kit">KAIA Kits</TabsTrigger>
          <TabsTrigger value="cartridge">KAIA Cartridges</TabsTrigger>
          <TabsTrigger value="reader">KAIA Readers</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="overflow-hidden">
        <Table>
          <THead>
            <TR>
              <TH>Batch number</TH>
              <TH>Item</TH>
              <TH>Quantity</TH>
              <TH>Manufactured</TH>
              <TH>Expiry</TH>
              <TH>Location</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {rows.map((b) => (
              <TR key={b.id}>
                <TD className="font-mono text-[13px] font-semibold text-foreground">{b.batch_number}</TD>
                <TD>
                  <span className="flex items-center gap-2 text-sm">
                    <Package className="size-4 text-muted-foreground" /> {humanize(b.item_type)}
                  </span>
                </TD>
                <TD>
                  <StockMeter batch={b} />
                </TD>
                <TD className="text-sm">{formatDate(b.manufacture_date)}</TD>
                <TD className={cn("text-sm", (b.expiring_soon || b.expired) && "font-semibold text-warning")}>
                  {formatDate(b.expiry_date)}
                  {b.expiring_soon && <span className="block text-xs">in {b.days_to_expiry} days</span>}
                </TD>
                <TD className="text-sm text-muted-foreground">{b.location}</TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    <Badge tone={b.status === "available" ? "success" : "neutral"}>{humanize(b.status)}</Badge>
                    {b.low_stock && (
                      <Badge tone="warning">
                        <AlertTriangle className="size-3" /> Low stock
                      </Badge>
                    )}
                  </div>
                </TD>
                <TD>
                  <Button size="icon-sm" variant="ghost" aria-label="Adjust batch" onClick={() => { setAdjust(b); setDelta(0); setStatus(""); }}>
                    <SlidersHorizontal />
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
        <DialogContent>
          <DialogHeader icon={<PackagePlus className="size-5" />} title="Receive inventory batch" description={org?.name} />
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <Field label="Item">
              <Select value={form.item_type} onChange={(e) => setForm({ ...form, item_type: e.target.value })}>
                <option value="kit">KAIA Kit</option>
                <option value="cartridge">KAIA Cartridge</option>
                <option value="reader">KAIA Reader</option>
              </Select>
            </Field>
            <Field label="Batch number">
              <Input required className="font-mono" value={form.batch_number} onChange={(e) => setForm({ ...form, batch_number: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Manufacture date">
              <Input type="date" required value={form.manufacture_date} onChange={(e) => setForm({ ...form, manufacture_date: e.target.value })} />
            </Field>
            <Field label="Expiry date">
              <Input type="date" required value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
            </Field>
            <Field label="Quantity">
              <Input type="number" min={0} required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
            </Field>
            <Field label="Reorder threshold">
              <Input type="number" min={0} required value={form.reorder_threshold} onChange={(e) => setForm({ ...form, reorder_threshold: Number(e.target.value) })} />
            </Field>
            <Field label="Storage location" className="sm:col-span-2">
              <Input value={form.location} placeholder={org?.name} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </Field>
            <DialogFooter className="sm:col-span-2">
              <Button type="submit" disabled={receive.isPending}>
                Receive batch
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!adjust} onOpenChange={(v) => !v && setAdjust(null)}>
        <DialogContent>
          {adjust && (
            <>
              <DialogHeader title={`Adjust ${adjust.batch_number}`} description={`${adjust.quantity} in stock · reorder at ${adjust.reorder_threshold}`} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Quantity change" hint="Negative to distribute or write off.">
                  <Input type="number" value={delta} onChange={(e) => setDelta(Number(e.target.value))} />
                </Field>
                <Field label="Status">
                  <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="">Keep {humanize(adjust.status)}</option>
                    <option value="available">Available</option>
                    <option value="quarantined">Quarantined</option>
                    <option value="expired">Expired</option>
                  </Select>
                </Field>
              </div>
              <DialogFooter>
                <Button onClick={() => update.mutate()} disabled={update.isPending || (!delta && !status)}>
                  Save
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
