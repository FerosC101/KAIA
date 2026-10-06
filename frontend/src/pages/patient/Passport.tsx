import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CircleDashed, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { DemoBadge } from "@/components/kaia/badges";
import { ErrorBlock, LoadingBlock, PageHeader } from "@/components/kaia/layout-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Tone } from "@/lib/labels";
import type { PassportEntry } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

type PassportResponse = { patient_code: string; full_name: string; age_bracket: string; entries: PassportEntry[]; scope_note: string };

const SOURCE_LABEL: Record<string, string> = {
  kaia_platform: "KAIA platform",
  facility_record: "Facility record",
  self_reported: "Self-reported",
};

const RESULT_TYPES = new Set(["kaia_screening", "routine_screening", "other_screening", "hpv_vaccination", "routine_recall"]);

function statusTone(status: string): Tone {
  const s = status.toLowerCase();
  if (s.includes("priority") || s.includes("multiple") || s.includes("missed")) return "priority";
  if (s.includes("follow-up") || s.includes("marker") || s.includes("could not")) return "warning";
  if (s.startsWith("completed") || s.includes("no high-risk")) return "success";
  if (s.includes("scheduled") || s.includes("progress") || s.includes("attended")) return "info";
  if (s.includes("cancelled")) return "neutral";
  return "lavender";
}

function Timeline({ entries }: { entries: PassportEntry[] }) {
  if (entries.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">Nothing recorded here yet.</p>;
  const byYear = new Map<string, PassportEntry[]>();
  for (const entry of entries) {
    const year = entry.event_date.slice(0, 4);
    byYear.set(year, [...(byYear.get(year) ?? []), entry]);
  }
  return (
    <div>
      {[...byYear.entries()].map(([year, items]) => (
        <section key={year} className="relative pl-14">
          <h3 className="absolute left-0 top-0 text-sm font-semibold tabular text-primary">{year}</h3>
          <span aria-hidden className="absolute bottom-0 left-[41px] top-2 w-px bg-border" />
          <div className="space-y-3 pb-7">
            {items.map((entry) => (
              <article key={entry.id} className="relative">
                <span
                  aria-hidden
                  className={cn(
                    "absolute -left-[17px] top-6 size-2.5 rounded-full ring-4 ring-background",
                    entry.verified ? "bg-primary" : "bg-lavender",
                  )}
                />
                <Card className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h4 className="font-semibold text-foreground">{entry.title}</h4>
                      {entry.detail && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{entry.detail}</p>}
                    </div>
                    <Badge tone={statusTone(entry.status)} className="whitespace-normal text-left">
                      {entry.status}
                    </Badge>
                  </div>
                  <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{formatDate(entry.event_date)}</span>
                    <span>{entry.institution_name}</span>
                    <span>{SOURCE_LABEL[entry.source] ?? entry.source}</span>
                    <span className={cn("flex items-center gap-1 font-medium", entry.verified ? "text-success" : "text-subtle")}>
                      {entry.verified ? <BadgeCheck className="size-3.5" /> : <CircleDashed className="size-3.5" />}
                      {entry.verified ? "Verified" : "Unverified"}
                    </span>
                  </div>
                </Card>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function AddRecordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    event_type: "hpv_vaccination",
    title: "HPV Vaccination",
    event_date: "",
    institution_name: "",
    status: "Completed",
  });
  const add = useMutation({
    mutationFn: () => api("/patients/me/passport", { method: "POST", body: form }),
    onSuccess: () => {
      toast.success("Record added to your KAIA Passport");
      qc.invalidateQueries({ queryKey: ["passport"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const titles: Record<string, string> = {
    hpv_vaccination: "HPV Vaccination",
    routine_screening: "Routine Screening",
    other_screening: "Cervical-health Screening",
  };
  function submit(e: FormEvent) {
    e.preventDefault();
    add.mutate();
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader
          icon={<Plus className="size-5" />}
          title="Add a past record"
          description="Self-reported records stay marked unverified until a facility confirms them."
        />
        <form onSubmit={submit} className="space-y-4">
          <Field label="Type" htmlFor="type">
            <Select id="type" value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value, title: titles[e.target.value] })}>
              <option value="hpv_vaccination">HPV vaccination</option>
              <option value="routine_screening">Routine screening (e.g. Pap smear, VIA)</option>
              <option value="other_screening">Other cervical-health screening</option>
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date" htmlFor="date">
              <Input id="date" type="date" required value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
            </Field>
            <Field label="Status" htmlFor="status">
              <Select id="status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option>Completed</option>
                <option>Scheduled</option>
                <option>Pending</option>
              </Select>
            </Field>
          </div>
          <Field label="Institution" htmlFor="inst">
            <Input id="inst" required value={form.institution_name} onChange={(e) => setForm({ ...form, institution_name: e.target.value })} />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={add.isPending}>
              Add record
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Passport() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["passport"], queryFn: () => api<PassportResponse>("/patients/me/passport") });
  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={refetch} />;

  const results = data.entries.filter((e) => RESULT_TYPES.has(e.event_type));
  const careEvents = data.entries.filter((e) => !RESULT_TYPES.has(e.event_type));

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="KAIA Passport"
        title="Your screening record"
        description="A personal timeline of your reproductive-health screening journey."
        actions={
          <Button variant="outline" onClick={() => setOpen(true)}>
            <Plus /> Add past record
          </Button>
        }
      />

      <Card className="brand-veil flex items-center gap-4 p-5">
        <span className="grid size-12 shrink-0 place-items-center rounded-field bg-secondary text-primary">
          <BadgeCheck className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold text-foreground">{data.full_name}</p>
            {user?.is_demo && <DemoBadge />}
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            {data.patient_code} · age {data.age_bracket}
          </p>
        </div>
      </Card>

      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="care">Care</TabsTrigger>
        </TabsList>
        <TabsContent value="timeline">
          <Timeline entries={data.entries} />
        </TabsContent>
        <TabsContent value="results">
          <Timeline entries={results} />
        </TabsContent>
        <TabsContent value="care">
          <Timeline entries={careEvents} />
        </TabsContent>
      </Tabs>

      <p className="rounded-field border border-border bg-muted/60 px-4 py-3 text-xs leading-relaxed text-muted-foreground">{data.scope_note}</p>
      <AddRecordDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
