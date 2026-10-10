import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, ScanBarcode } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { ErrorBlock, LoadingBlock } from "@/components/kaia/layout-bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Label, Select } from "@/components/ui/form";
import { api } from "@/lib/api";
import type { PatientDashboard, PatientScreening } from "@/lib/types";

export default function RegisterKit() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<PatientDashboard>("/patients/me/dashboard"),
  });
  const [kitCode, setKitCode] = useState("");
  const [siteId, setSiteId] = useState("");
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    if (data && !siteId && data.screening_sites.length) setSiteId(data.screening_sites[0].id);
  }, [data, siteId]);

  const registerKit = useMutation({
    mutationFn: () =>
      api<PatientScreening>("/kits/register", {
        method: "POST",
        body: { kit_code: kitCode.trim(), site_organization_id: siteId, consent_confirmed: true },
      }),
    onSuccess: (s) => {
      toast.success(`Kit ${s.kit_code} registered`);
      qc.invalidateQueries();
      navigate("/app");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock error={error} onRetry={refetch} />;
  const site = data.screening_sites.find((s) => s.id === siteId);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!consent) return toast.error("Please confirm consent to continue");
    registerKit.mutate();
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-14rem)] max-w-md flex-col lg:min-h-0">
      <Link
        to="/app"
        aria-label="Back to overview"
        className="-ml-2 grid size-11 place-items-center rounded-full text-primary transition-colors hover:bg-primary-soft"
      >
        <ArrowLeft className="size-5" />
      </Link>

      <h1 className="mt-4 text-[32px] leading-tight text-foreground">Register your kit</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">Link your KAIA Kit to your private account so your result comes back to you.</p>

      {/* Transparent cut-out: blends straight into the cream page, no frame. 280w for 1x screens, 560w for 2x+. */}
      <div className="mx-auto mb-2 mt-6 w-full max-w-[260px] sm:max-w-[280px]">
        <img
          src="/kaia-kit-560.webp"
          srcSet="/kaia-kit-280.webp 280w, /kaia-kit-560.webp 560w"
          sizes="(min-width: 640px) 280px, 260px"
          alt="KAIA Kit"
          width={560}
          height={485}
          decoding="async"
          className="mx-auto h-auto w-full drop-shadow-[0_18px_22px_rgb(92_48_66/0.14)]"
        />
      </div>

      {!data.can_register_kit ? (
        <Card className="mt-8 p-6 text-sm leading-relaxed text-muted-foreground">
          You already have a screening in progress. You can register a new kit once it is complete.
        </Card>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 flex flex-1 flex-col">
          <div className="space-y-6">
            <div>
              <Label htmlFor="kit">Kit code</Label>
              <div className="relative mt-2">
                <ScanBarcode aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-primary" />
                <Input
                  id="kit"
                  required
                  autoFocus
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="K26-00000"
                  aria-describedby="kit-hint"
                  className="h-16 px-12 text-center font-mono text-2xl tracking-[0.2em]"
                  value={kitCode}
                  onChange={(e) => setKitCode(e.target.value.toUpperCase())}
                />
              </div>
              <p id="kit-hint" className="mt-2.5 text-center text-[13px] leading-relaxed text-muted-foreground">
                Printed on the side of your KAIA box. It looks like <span className="font-mono font-semibold text-foreground">K26-00921</span>.
              </p>
            </div>

            <Field label="Where will you return your sample?" htmlFor="site">
              <Select id="site" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                {data.screening_sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-primary-soft/60 p-4 text-sm leading-relaxed">
              <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span className="text-muted-foreground">
                I allow <b className="text-foreground">{site?.name ?? "the screening site"}</b> to see my screening information so they can test my sample and
                support my care. I can change this anytime in Privacy.
              </span>
            </label>
          </div>

          <div className="mt-auto pt-10">
            <Button type="submit" size="lg" className="w-full rounded-full" disabled={registerKit.isPending || !kitCode}>
              {registerKit.isPending && <Loader2 className="animate-spin" />} Register kit
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
