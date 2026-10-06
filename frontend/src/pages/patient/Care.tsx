import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, FileText, HeartHandshake, Loader2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ReferralStatusBadge } from "@/components/kaia/badges";
import { FacilityCard, FacilityDialog, NextBestActionCard } from "@/components/kaia/CareCards";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader, SectionTitle } from "@/components/kaia/layout-bits";
import { PathwaySteps } from "@/components/kaia/Steps";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { ApiError, api } from "@/lib/api";
import { OUTCOME_META } from "@/lib/labels";
import type { CareView, Facility, PatientDashboard, ReferralDetail } from "@/lib/types";
import { formatDate, todayISO } from "@/lib/utils";

export function ScheduleDialog({
  referralId,
  open,
  onOpenChange,
  onDone,
}: {
  referralId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [date, setDate] = useState(todayISO(7));
  const [time, setTime] = useState("09:00");
  const schedule = useMutation({
    mutationFn: () =>
      api<ReferralDetail>(`/referrals/${referralId}`, {
        method: "PATCH",
        body: { status: "scheduled", scheduled_for: `${date}T${time}:00+08:00` },
      }),
    onSuccess: () => {
      toast.success("Appointment recorded");
      onOpenChange(false);
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader
          icon={<CalendarCheck className="size-5" />}
          title="Mark appointment scheduled"
          description="Enter the appointment date the facility gave you."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" htmlFor="appt-date">
            <Input id="appt-date" type="date" min={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Time" htmlFor="appt-time">
            <Input id="appt-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => schedule.mutate()} disabled={schedule.isPending || !date}>
            {schedule.isPending && <Loader2 className="animate-spin" />} Save appointment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReferralDialog({ care, open, onOpenChange }: { care: CareView; open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [destination, setDestination] = useState(care.recommended_facility_id ?? care.facility_options[0]?.id ?? "");
  const [preferred, setPreferred] = useState("");
  const [consent, setConsent] = useState(false);
  const facility = care.facility_options.find((f) => f.id === destination);
  const create = useMutation({
    mutationFn: () =>
      api<ReferralDetail>("/referrals", {
        method: "POST",
        body: {
          screening_id: care.screening.id,
          destination_org_id: destination,
          preferred_schedule: preferred || null,
          patient_consent_confirmed: true,
        },
      }),
    onSuccess: (referral) => {
      toast.success(`Referral ${referral.referral_code} generated`);
      qc.invalidateQueries();
      navigate(`/app/referrals/${referral.id}`);
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogHeader icon={<FileText className="size-5" />} title="Generate referral" description={care.pathway.recommended_action} />
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {care.facility_options.map((f) => (
              <button key={f.id} type="button" onClick={() => setDestination(f.id)} className="text-left">
                <FacilityCard facility={f} recommended={f.id === care.recommended_facility_id} selected={destination === f.id} />
              </button>
            ))}
          </div>
          <Field label="Preferred date (optional)" htmlFor="pref">
            <Input id="pref" type="date" min={todayISO()} value={preferred} onChange={(e) => setPreferred(e.target.value)} />
          </Field>
          <label className="flex items-start gap-3 rounded-field border border-border p-4 text-sm">
            <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span className="leading-relaxed text-muted-foreground">
              I allow <b className="text-foreground">{facility?.name ?? "this facility"}</b> to access my referral information for this follow-up.
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={!consent || !destination || create.isPending}>
            {create.isPending && <Loader2 className="animate-spin" />} Generate referral
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Care() {
  const params = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [facility, setFacility] = useState<Facility | null>(null);
  const [referralOpen, setReferralOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<PatientDashboard>("/patients/me/dashboard"),
    enabled: !params.screeningId,
  });
  const screeningId = params.screeningId ?? dashboard.data?.current_screening?.id;

  const care = useQuery({
    queryKey: ["care", screeningId],
    queryFn: () => api<CareView>(`/screenings/${screeningId}/care`),
    enabled: !!screeningId,
  });

  const attended = useMutation({
    mutationFn: (referralId: string) => api("/followups", { method: "POST", body: { referral_id: referralId, event_type: "attended" } }),
    onSuccess: () => {
      toast.success("Thank you. The facility will confirm your visit.");
      qc.invalidateQueries({ queryKey: ["care"] });
    },
    onError: (e) => toast.error(e.message),
  });

  if (!params.screeningId && dashboard.isLoading) return <LoadingBlock />;
  if (!screeningId)
    return (
      <>
        <PageHeader eyebrow="Your care path" title="Care & next steps" />
        <EmptyState
          icon={<HeartHandshake />}
          title="No care plan yet"
          description="Your care plan appears once a screening result is ready."
          action={
            <Button asChild>
              <Link to="/app/register-kit">Register a KAIA Kit</Link>
            </Button>
          }
        />
      </>
    );
  if (care.isLoading) return <LoadingBlock />;
  if (care.error instanceof ApiError && care.error.status === 409)
    return (
      <>
        <PageHeader eyebrow="Your care path" title="Care & next steps" />
        <EmptyState
          icon={<HeartHandshake />}
          title="Your care plan is on its way"
          description="KAIA Care will recommend your next step as soon as your result has been reviewed and released."
        />
      </>
    );
  if (care.error || !care.data) return <ErrorBlock error={care.error} onRetry={care.refetch} />;

  const view = care.data;
  const action = view.next_best_action;
  const refresh = () => qc.invalidateQueries();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Your care path"
        title="Care & next steps"
        description={`${OUTCOME_META[view.pathway.pathway_type].label} · result released ${formatDate(view.screening.released_at)}`}
      />

      <NextBestActionCard
        action={action}
        busy={attended.isPending}
        onViewFacility={() => setFacility(action.facility)}
        onGenerateReferral={() => setReferralOpen(true)}
        onMarkScheduled={() => setScheduleOpen(true)}
        onViewReferral={() => action.referral_id && navigate(`/app/referrals/${action.referral_id}`)}
        onReportAttended={() => action.referral_id && attended.mutate(action.referral_id)}
        onViewPassport={() => navigate("/app/passport")}
      />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <section>
          <SectionTitle>Your care path</SectionTitle>
          <Card className="p-5 sm:p-6">
            <PathwaySteps steps={view.steps} />
          </Card>
        </section>

        <div className="space-y-6">
          {view.facility_options.length > 0 && (
            <section>
              <SectionTitle>Where you can go</SectionTitle>
              <div className="grid gap-4 sm:grid-cols-2">
                {view.facility_options.map((f) => (
                  <FacilityCard
                    key={f.id}
                    facility={f}
                    recommended={f.id === view.recommended_facility_id}
                    onViewDetails={() => setFacility(f)}
                    onGenerateReferral={action.actions.includes("generate_referral") ? () => setReferralOpen(true) : undefined}
                  />
                ))}
              </div>
            </section>
          )}

          {view.referrals.length > 0 && (
            <section>
              <SectionTitle>Referrals</SectionTitle>
              <div className="space-y-2">
                {view.referrals.map((r) => (
                  <Link key={r.id} to={`/app/referrals/${r.id}`} className="block">
                    <Card className="flex items-center justify-between gap-3 p-4 transition-colors duration-200 hover:border-primary/30">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{r.destination_org.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.referral_code} · {r.referral_type_label} · {formatDate(r.generated_at)}
                        </p>
                      </div>
                      <ReferralStatusBadge status={r.status} />
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <FacilityDialog facility={facility} open={!!facility} onOpenChange={(v) => !v && setFacility(null)} />
      {referralOpen && <ReferralDialog care={view} open={referralOpen} onOpenChange={setReferralOpen} />}
      <ScheduleDialog referralId={action.referral_id} open={scheduleOpen} onOpenChange={setScheduleOpen} onDone={refresh} />
    </div>
  );
}
