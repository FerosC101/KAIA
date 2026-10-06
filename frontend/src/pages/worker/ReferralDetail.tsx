import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BadgeCheck, CalendarCheck, CheckCircle2, CircleDashed, ClipboardCheck, Loader2, MessageSquarePlus, UserCheck, UserX, XCircle } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { OutcomeBadge, ReferralStatusBadge } from "@/components/kaia/badges";
import { ContinuityPanel } from "@/components/kaia/ContinuityPanel";
import { ErrorBlock, KeyValue, LoadingBlock, PageHeader, SectionTitle } from "@/components/kaia/layout-bits";
import { ReferralQr } from "@/components/kaia/ReferralQr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/form";
import { api } from "@/lib/api";
import { FOLLOW_UP_EVENT_LABEL } from "@/lib/labels";
import type { ReferralDetail as Detail, ReferralStatus } from "@/lib/types";
import { formatDate, formatDateTime, humanize } from "@/lib/utils";
import { ScheduleDialog } from "@/pages/patient/Care";
import { OutreachDialog } from "@/pages/worker/dialogs";

const ACTIONS: Partial<Record<ReferralStatus, { label: string; icon: typeof UserCheck; variant: "default" | "outline" | "success" | "priority" }>> = {
  scheduled: { label: "Schedule appointment", icon: CalendarCheck, variant: "default" },
  attended: { label: "Mark attended", icon: UserCheck, variant: "default" },
  completed: { label: "Mark care completed", icon: ClipboardCheck, variant: "success" },
  missed: { label: "Mark missed", icon: UserX, variant: "outline" },
  cancelled: { label: "Cancel referral", icon: XCircle, variant: "outline" },
};

export default function ReferralDetail() {
  const { referralId } = useParams();
  const qc = useQueryClient();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [outreachOpen, setOutreachOpen] = useState(false);
  const [confirm, setConfirm] = useState<ReferralStatus | null>(null);
  const [notes, setNotes] = useState("");
  const [completion, setCompletion] = useState("return_to_routine_screening");

  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["referral", referralId], queryFn: () => api<Detail>(`/referrals/${referralId}`) });
  const transition = useMutation({
    mutationFn: (status: ReferralStatus) =>
      api<Detail>(`/referrals/${referralId}`, {
        method: "PATCH",
        body: { status, notes: notes || null, ...(status === "completed" ? { completion_outcome: completion } : {}) },
      }),
    onSuccess: (r) => {
      toast.success(`Referral ${r.status}`);
      setConfirm(null);
      setNotes("");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <Link to="/portal/referrals" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Referrals
      </Link>
      <PageHeader
        eyebrow={data.referral_code}
        title={data.patient.name ?? data.patient.patient_code}
        description={`${data.referral_type_label} · ${data.source_org.name} → ${data.destination_org.name}`}
        actions={
          <>
            <ReferralStatusBadge status={data.status} />
            {data.priority === "priority" && <Badge tone="priority">Priority</Badge>}
            {data.verified && (
              <Badge tone="success">
                <BadgeCheck className="size-3" /> QR verified
              </Badge>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card className="p-5">
            <SectionTitle>Record update</SectionTitle>
            {data.allowed_transitions.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-success" /> This referral is closed.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.allowed_transitions.map((status) => {
                  const a = ACTIONS[status];
                  if (!a) return null;
                  const Icon = a.icon;
                  return (
                    <Button key={status} variant={a.variant} onClick={() => (status === "scheduled" ? setScheduleOpen(true) : setConfirm(status))}>
                      <Icon /> {data.status === "scheduled" && status === "scheduled" ? "Reschedule" : a.label}
                    </Button>
                  );
                })}
                {!["completed", "cancelled"].includes(data.status) && (
                  <Button variant="ghost" onClick={() => setOutreachOpen(true)}>
                    <MessageSquarePlus /> Log outreach
                  </Button>
                )}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <SectionTitle>Follow-up events</SectionTitle>
            <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-[9px] before:top-2 before:w-0.5 before:bg-border">
              {data.follow_ups.map((e) => (
                <li key={e.id} className="relative flex gap-4">
                  <span className="relative z-10 grid size-5 place-items-center rounded-full bg-surface">
                    {e.verified ? <CheckCircle2 className="size-5 text-primary" /> : <CircleDashed className="size-5 text-subtle" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{FOLLOW_UP_EVENT_LABEL[e.event_type] ?? humanize(e.event_type)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(e.occurred_at)} · {humanize(e.source)} · {e.verified ? "verified" : "unverified"}
                    </p>
                    {e.notes && <p className="mt-1 rounded-xl bg-muted px-3 py-2 text-sm">{e.notes}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="divide-y divide-border">
              <KeyValue label="Patient code" value={data.patient.patient_code} mono />
              <KeyValue label="Age bracket" value={data.patient.age_bracket} />
              <KeyValue label="Screening result" value={<OutcomeBadge outcome={data.screening.outcome} />} />
              <KeyValue label="Result released" value={formatDate(data.screening.released_at)} />
              <KeyValue label="Preferred schedule" value={formatDate(data.preferred_schedule)} />
              <KeyValue label="Appointment" value={data.appointment_at ? formatDateTime(data.appointment_at) : "—"} />
            </div>
            {data.clinical_notes && <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-sm">{data.clinical_notes}</p>}
          </Card>
          {data.continuity && <ContinuityPanel continuity={data.continuity} />}
          <ReferralQr referral={data} />
        </div>
      </div>

      <ScheduleDialog referralId={data.id} open={scheduleOpen} onOpenChange={setScheduleOpen} onDone={() => qc.invalidateQueries()} />
      <OutreachDialog referralId={data.id} open={outreachOpen} onOpenChange={setOutreachOpen} />
      <Dialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <DialogContent>
          {confirm && (
            <>
              <DialogHeader title={ACTIONS[confirm]?.label ?? "Update referral"} description={`${data.referral_code} · ${data.patient.name ?? data.patient.patient_code}`} />
              <div className="space-y-4">
                {confirm === "completed" && (
                  <Field label="Care outcome" htmlFor="outcome" hint="Record the pathway outcome only — KAIA does not store diagnoses.">
                    <Select id="outcome" value={completion} onChange={(e) => setCompletion(e.target.value)}>
                      {Object.entries(data.completion_outcomes).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                <Field label="Notes (optional, encrypted)" htmlFor="tnotes">
                  <Textarea id="tnotes" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Field>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirm(null)}>
                  Back
                </Button>
                <Button onClick={() => transition.mutate(confirm)} disabled={transition.isPending}>
                  {transition.isPending && <Loader2 className="animate-spin" />} Confirm
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
