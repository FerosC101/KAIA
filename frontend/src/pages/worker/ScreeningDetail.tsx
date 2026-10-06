import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Cpu, Eye, PackageCheck, UserRound } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { OutcomeBadge, ReferralStatusBadge, ScreeningStatusBadge } from "@/components/kaia/badges";
import { FacilityDialog, NextBestActionCard } from "@/components/kaia/CareCards";
import { ContinuityPanel } from "@/components/kaia/ContinuityPanel";
import { ErrorBlock, KeyValue, LoadingBlock, PageHeader, SectionTitle } from "@/components/kaia/layout-bits";
import { JourneyTracker, PathwaySteps } from "@/components/kaia/Steps";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { CareView, Facility, ScreeningDetail as Detail } from "@/lib/types";
import { formatDate, humanize } from "@/lib/utils";
import { ScheduleDialog } from "@/pages/patient/Care";
import { RegisterCartridgeDialog, WorkerReferralDialog } from "@/pages/worker/dialogs";

export default function ScreeningDetail() {
  const { screeningId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [cartridgeOpen, setCartridgeOpen] = useState(false);
  const [referralOpen, setReferralOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [facility, setFacility] = useState<Facility | null>(null);

  const detail = useQuery({ queryKey: ["screening", screeningId], queryFn: () => api<Detail>(`/screenings/${screeningId}`), refetchInterval: 10_000 });
  const care = useQuery({
    queryKey: ["care", screeningId],
    queryFn: () => api<CareView>(`/screenings/${screeningId}/care`),
    enabled: detail.data?.status === "result_ready",
  });
  const received = useMutation({
    mutationFn: () => api(`/screenings/${screeningId}/sample-collected`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Sample marked as received");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e.message),
  });

  if (detail.isLoading) return <LoadingBlock />;
  if (detail.error || !detail.data) return <ErrorBlock error={detail.error} onRetry={detail.refetch} />;
  const s = detail.data;
  const action = care.data?.next_best_action;

  return (
    <div className="space-y-6">
      <Link to="/portal" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Screening queue
      </Link>
      <PageHeader
        eyebrow={s.screening_code}
        title={s.patient.name}
        description={`${s.patient.patient_code} · Kit ${s.kit_code}${s.cartridge_code ? ` · ${s.cartridge_code}` : ""}`}
        actions={
          <>
            {s.next_action === "receive_sample" && (
              <Button onClick={() => received.mutate()} disabled={received.isPending}>
                <PackageCheck /> Mark sample received
              </Button>
            )}
            {s.next_action === "register_cartridge" && (
              <Button onClick={() => setCartridgeOpen(true)}>
                <Cpu /> Register cartridge
              </Button>
            )}
            {(s.next_action === "begin_analysis" || s.next_action === "view_reader") && s.reader_code && (
              <Button onClick={() => navigate(`/portal/readers/${s.reader_code}`)}>
                <Cpu /> Open {s.reader_code}
              </Button>
            )}
            {s.has_assay && (
              <Button variant={s.next_action === "review" ? "default" : "outline"} onClick={() => navigate(`/portal/vision/${s.id}`)}>
                <Eye /> {s.next_action === "review" ? "Review result" : "KAIA Vision"}
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <ScreeningStatusBadge status={s.status} label={s.status_label} />
              {s.outcome && <OutcomeBadge outcome={s.outcome} pending={s.status === "pending_review"} />}
            </div>
            <JourneyTracker steps={s.journey} />
          </Card>

          {care.data && action && (
            <>
              <NextBestActionCard
                action={{ ...action, title: action.stage === "find_care" ? care.data.pathway.recommended_action : action.title }}
                onViewFacility={() => setFacility(action.facility)}
                onGenerateReferral={() => setReferralOpen(true)}
                onMarkScheduled={() => setScheduleOpen(true)}
                onViewReferral={() => action.referral_id && navigate(`/portal/referrals/${action.referral_id}`)}
              />
              <div className="grid gap-6 md:grid-cols-2">
                <Card className="p-5">
                  <SectionTitle>KAIA Care pathway</SectionTitle>
                  <PathwaySteps steps={care.data.steps} />
                </Card>
                <div className="space-y-3">
                  <SectionTitle>Referrals</SectionTitle>
                  {care.data.referrals.length === 0 && <Card className="p-4 text-sm text-muted-foreground">No referral issued yet.</Card>}
                  {care.data.referrals.map((r) => (
                    <Link key={r.id} to={`/portal/referrals/${r.id}`}>
                      <Card className="flex items-center justify-between gap-3 p-4 transition hover:shadow-lift">
                        <div>
                          <p className="font-mono text-sm font-semibold text-foreground">{r.referral_code}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.destination_org.name} · {formatDate(r.generated_at)}
                          </p>
                        </div>
                        <ReferralStatusBadge status={r.status} />
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <UserRound className="size-4 text-primary" /> Patient
            </div>
            <div className="divide-y divide-border">
              <KeyValue label="Patient code" value={s.patient.patient_code} mono />
              <KeyValue label="Age bracket" value={s.patient.age_bracket} />
              <KeyValue label="Barangay" value={s.patient.barangay ?? "—"} />
              <KeyValue label="Distance to care" value={humanize(s.patient.distance_category)} />
            </div>
          </Card>
          <Card className="p-5">
            <div className="divide-y divide-border">
              <KeyValue label="Site" value={s.site.name} />
              <KeyValue label="Registered" value={formatDate(s.registered_at)} />
              <KeyValue label="Reader" value={s.reader_code ?? "—"} mono />
              <KeyValue label="Released" value={formatDate(s.released_at)} />
            </div>
          </Card>
          {care.data?.continuity && <ContinuityPanel continuity={care.data.continuity} />}
          {s.status === "pending_review" && (
            <Button className="w-full" size="lg" onClick={() => navigate(`/portal/vision/${s.id}`)}>
              Review & release <ArrowRight />
            </Button>
          )}
        </div>
      </div>

      <RegisterCartridgeDialog screeningId={s.id} patientCode={s.patient.patient_code} open={cartridgeOpen} onOpenChange={setCartridgeOpen} />
      {care.data && referralOpen && <WorkerReferralDialog care={care.data} open={referralOpen} onOpenChange={setReferralOpen} />}
      <ScheduleDialog referralId={action?.referral_id ?? null} open={scheduleOpen} onOpenChange={setScheduleOpen} onDone={() => qc.invalidateQueries()} />
      <FacilityDialog facility={facility} open={!!facility} onOpenChange={(v) => !v && setFacility(null)} />
    </div>
  );
}
