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
    means:
      "The test did not find a high-risk screening signal in your sample. Screening regularly still matters, because health can change over time.",
    next: "Nothing more is needed right now. KAIA will remind you when your next routine screening is due.",
  },
  follow_up_recommended: {
    means:
      "A screening marker was found that deserves a closer look. This result does not mean that you have cervical cancer — a confirmatory screening gives your provider clearer information.",
    next: "Book a confirmatory screening within the recommended timeframe. KAIA Care helps you find a facility and keeps track of your referral.",
  },
  priority_follow_up: {
    means:
      "More than one screening signal was found, so a clinical evaluation should be arranged sooner. This result does not mean that you have cervical cancer.",
    next: "Please complete your clinical follow-up as soon as practical. KAIA Care can generate a priority referral to a partner facility.",
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
        <Card className="flex items-start gap-3 p-6">
          <Clock3 className="mt-0.5 size-5 text-primary" />
          <div>
            <p className="display text-xl text-foreground">{data.status_label}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {data.invalid_message ?? "Your result will appear here after a clinician has reviewed it. We'll send you a notification."}
            </p>
          </div>
        </Card>
      ) : (
        <>
          <ResultHero outcome={data.result.outcome} message={data.result.message} nextStep={data.result.next_step} />

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
            <KeyValue label="Result released" value={formatDate(data.result.released_at)} />
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

          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link to={`/app/care/${data.screening_id}`}>
              View care options <ArrowRight />
            </Link>
          </Button>
        </>
      )}
    </div>
  );
}
