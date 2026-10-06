import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarCheck, CheckCircle2, CircleDashed } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { FacilityDetails } from "@/components/kaia/CareCards";
import { ErrorBlock, LoadingBlock, PageHeader, SectionTitle } from "@/components/kaia/layout-bits";
import { ReferralQr } from "@/components/kaia/ReferralQr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { FOLLOW_UP_EVENT_LABEL } from "@/lib/labels";
import type { ReferralDetail } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { ScheduleDialog } from "@/pages/patient/Care";

export default function ReferralView() {
  const { referralId } = useParams();
  const qc = useQueryClient();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["referral", referralId],
    queryFn: () => api<ReferralDetail>(`/referrals/${referralId}`),
    refetchInterval: 15_000,
  });
  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <Link to={`/app/care/${data.screening.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> KAIA Care
      </Link>
      <PageHeader eyebrow="KAIA Care referral" title={data.referral_type_label} description={`To ${data.destination_org.name}`} />

      <ReferralQr referral={data} />

      {data.allowed_transitions.includes("scheduled") && (
        <Button size="lg" className="w-full sm:w-auto" onClick={() => setScheduleOpen(true)}>
          <CalendarCheck /> Mark Appointment Scheduled
        </Button>
      )}

      <section>
        <SectionTitle>Facility</SectionTitle>
        <Card className="p-5">
          <p className="mb-3 font-semibold text-foreground">{data.destination_facility.name}</p>
          <FacilityDetails facility={data.destination_facility} />
        </Card>
      </section>

      <section>
        <SectionTitle>Follow-up timeline</SectionTitle>
        <Card className="p-5">
          <ol className="space-y-4">
            {data.follow_ups.map((e) => (
              <li key={e.id} className="flex gap-3">
                {e.verified ? <CheckCircle2 className="mt-0.5 size-4 text-success" /> : <CircleDashed className="mt-0.5 size-4 text-subtle" />}
                <div>
                  <p className="text-sm font-semibold text-foreground">{FOLLOW_UP_EVENT_LABEL[e.event_type] ?? e.event_type}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(e.occurred_at)} · {e.verified ? "Verified" : "Self-reported, awaiting facility confirmation"}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </section>
      <ScheduleDialog
        referralId={data.id}
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        onDone={() => qc.invalidateQueries()}
      />
    </div>
  );
}
