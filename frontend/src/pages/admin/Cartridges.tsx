import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, PackagePlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ErrorBlock, LoadingBlock, PageHeader } from "@/components/kaia/layout-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { api } from "@/lib/api";
import type { Tone } from "@/lib/labels";
import type { OrgRef } from "@/lib/types";
import { formatDate, humanize, todayISO } from "@/lib/utils";

type CartridgeList = {
  total: number;
  status_counts: Record<string, number>;
  items: { id: string; cartridge_code: string; status: string; lot_expiry: string; organization: OrgRef; sim_profile: string }[];
};

const STATUS_TONE: Record<string, Tone> = { in_stock: "lavender", assigned: "info", inserted: "plum", processed: "success", expired: "priority" };

export default function Cartridges() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(50);
  const [orgId, setOrgId] = useState("");
  const [expiry, setExpiry] = useState(todayISO(365));
  const [lastCodes, setLastCodes] = useState<string[] | null>(null);
  const { data: orgs = [] } = useQuery({ queryKey: ["organizations"], queryFn: () => api<OrgRef[]>("/organizations") });
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["cartridges", status, page],
    queryFn: () => api<CartridgeList>(`/admin/cartridges?page=${page}&page_size=25${status ? `&status=${status}` : ""}`),
    placeholderData: keepPreviousData,
  });
  const generate = useMutation({
    mutationFn: () =>
      api<{ batch_number: string; count: number; codes: string[] }>("/admin/cartridges/generate", {
        method: "POST",
        body: { organization_id: orgId || orgs[0]?.id, count, lot_expiry: expiry },
      }),
    onSuccess: (res) => {
      toast.success(`Provisioned ${res.count} cartridges in lot ${res.batch_number}`);
      setLastCodes(res.codes);
      qc.invalidateQueries({ queryKey: ["cartridges"] });
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={refetch} />;
  const pages = Math.max(1, Math.ceil(data.total / 25));

  return (
    <div>
      <PageHeader
        eyebrow="Consumables"
        title="Test cartridges"
        description="Every KAIA Cartridge is serialized and traceable from lot to result."
        actions={
          <Button onClick={() => setOpen(true)}>
            <PackagePlus /> Provision lot
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Button size="sm" variant={status === "" ? "default" : "outline"} onClick={() => { setStatus(""); setPage(1); }}>
          All
        </Button>
        {Object.entries(data.status_counts).map(([s, n]) => (
          <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => { setStatus(s); setPage(1); }}>
            {humanize(s)} <span className="tabular opacity-70">{n}</span>
          </Button>
        ))}
      </div>
      <Card className="overflow-hidden">
        <Table>
          <THead>
            <TR>
              <TH>Cartridge</TH>
              <TH>Organization</TH>
              <TH>Status</TH>
              <TH>Lot expiry</TH>
              <TH>Simulator profile</TH>
            </TR>
          </THead>
          <TBody>
            {data.items.map((c) => (
              <TR key={c.id}>
                <TD className="font-mono text-sm font-semibold text-foreground">{c.cartridge_code}</TD>
                <TD className="text-sm">{c.organization?.name}</TD>
                <TD>
                  <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>{humanize(c.status)}</Badge>
                </TD>
                <TD className="text-sm">{formatDate(c.lot_expiry)}</TD>
                <TD className="text-xs text-muted-foreground">{humanize(c.sim_profile)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm text-muted-foreground">
          <span>
            {data.total} cartridges · page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <Button size="icon-sm" variant="outline" onClick={() => setPage((p) => p - 1)} disabled={page <= 1} aria-label="Previous">
              <ChevronLeft />
            </Button>
            <Button size="icon-sm" variant="outline" onClick={() => setPage((p) => p + 1)} disabled={page >= pages} aria-label="Next">
              <ChevronRight />
            </Button>
          </div>
        </div>
      </Card>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setLastCodes(null); }}>
        <DialogContent>
          <DialogHeader icon={<PackagePlus className="size-5" />} title="Provision cartridge lot" description="Creates serialized cartridges and a matching inventory batch." />
          {lastCodes ? (
            <div>
              <p className="text-sm text-muted-foreground">First codes in this lot:</p>
              <div className="mt-2 grid grid-cols-2 gap-1.5 font-mono text-xs">
                {lastCodes.map((c) => (
                  <span key={c} className="rounded-lg bg-muted px-2 py-1">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Field label="Organization">
                <Select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Quantity">
                  <Input type="number" min={1} max={500} value={count} onChange={(e) => setCount(Number(e.target.value))} />
                </Field>
                <Field label="Lot expiry">
                  <Input type="date" min={todayISO(1)} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
                </Field>
              </div>
            </div>
          )}
          <DialogFooter>
            {lastCodes ? (
              <Button onClick={() => { setOpen(false); setLastCodes(null); }}>Done</Button>
            ) : (
              <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
                Provision
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
