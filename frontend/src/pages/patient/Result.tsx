import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Clock3, Stethoscope } from "lucide-react";
import { Link, useParams } from "react-router";
import { FacilityCard } from "@/components/kaia/CareCards";
import { Disclaimer, ErrorBlock, KeyValue, LoadingBlock, SectionTitle } from "@/components/kaia/layout-bits";
import { ResultHero } from "@/components/kaia/ResultHero";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ApiError, api } from "@/lib/api";
import type { CareView, Outcome, ResultCard } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type ResultResponse = {
  screening_id: string;
  screening_code: string;
  kit_code: string;
  site: string;
  status: string;
  status_label: string;
  ready: boolean;
  result: ResultCard | null;
  invalid_message?: string;
};

/** Plain-language explanations — never a laboratory report. */
const EXPLAINERS: Record<Outcome, { means: string; next: string }> = {
  routine_screening: {
    means: "The test didn't find the warning signs it looks for. It's still worth screening regularly, because health can change over time.",
    next: "Nothing more is needed right now. KAIA will remind you when your next screening is due.",
  },
  follow_up_recommended: {
    means:
      "The test found something worth a closer look. It does not mean you have cervical cancer. A second test gives your clinic a clearer picture.",
    next: "Book your follow-up test soon. KAIA helps you find a clinic and keeps track of your appointment.",
  },
  priority_follow_up: {
    means: "The test found more than one sign that a clinician should check soon. It does not mean you have cervical cancer.",
    next: "Please visit a clinic as soon as you can. KAIA can send a priority referral to a partner clinic for you.",
  },
};

export default function Result() {
  const { screeningId } = useParams();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["result", screeningId],
    queryFn: () => api<ResultResponse>(`/screenings/${screeningId}/result`),
  });
  const care = useQuery({
    queryKey: ["care", screeningId],
    queryFn: () => api<CareView>(`/screenings/${screeningId}/care`),
    enabled: !!data?.ready,
    retry: (count, err) => !(err instanceof ApiError) && count < 2,
  });

  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={refetch} />;

  const explainer = data.result ? EXPLAINERS[data.result.outcome] : null;
  const options = (care.data?.facility_options ?? []).slice(0, 2);

  return (
    <div className="space-y-6">
      <Link to="/app" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
        <ArrowLeft className="size-4" /> Overview
      </Link>

      {!data.ready || !data.result ? (
        <Card className="px-6 py-10 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary-soft text-primary">
            <Clock3 className="size-6" />
          </span>
          <div>
            <h1 className="mt-5 text-[26px] text-foreground">{data.status_label}</h1>
            <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
              {data.invalid_message ?? "Your result will appear here after a clinician has reviewed it. We'll send you a notification."}
            </p>
          </div>
        </Card>
      ) : (
        <>
          <ResultHero outcome={data.result.outcome} />

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-5 sm:p-6">
              <SectionTitle>What this means</SectionTitle>
              <p className="text-[15px] leading-relaxed text-muted-foreground">{explainer?.means}</p>
            </Card>
            <Card className="p-5 sm:p-6">
              <SectionTitle>What happens next</SectionTitle>
              <p className="text-[15px] leading-relaxed text-muted-foreground">{explainer?.next}</p>
            </Card>
          </div>

          {options.length > 0 && (
            <section>
              <SectionTitle action={<Link to={`/app/care/${data.screening_id}`} className="text-xs font-semibold text-primary hover:underline">All care options</Link>}>
                Your care options
              </SectionTitle>
              <div className="grid gap-4 md:grid-cols-2">
                {options.map((f) => (
                  <FacilityCard key={f.id} facility={f} recommended={f.id === care.data?.recommended_facility_id} />
                ))}
              </div>
            </section>
          )}

          <Card className="divide-y divide-border px-5">
            <KeyValue label="Result shared" value={formatDate(data.result.released_at)} />
            <KeyValue
              label="Reviewed by"
              value={
                <span className="flex items-center gap-1.5">
                  <Stethoscope className="size-4 text-primary" /> Clinician at {data.site}
                </span>
              }
            />
            <KeyValue label="Screening ID" value={data.screening_code} mono />
          </Card>

          <Disclaimer text={data.result.disclaimer} />

          <Button asChild size="lg" className="w-full rounded-full sm:w-auto">
            <Link to={`/app/care/${data.screening_id}`}>
              View care options <ArrowRight />
            </Link>
          </Button>
        </>
      )}
    </div>
  );
}
