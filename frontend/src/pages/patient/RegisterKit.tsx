import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, PackageCheck, ScanBarcode } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { ErrorBlock, LoadingBlock, PageHeader } from "@/components/kaia/layout-bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
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
    <div>
      <Link to="/app" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Home
      </Link>
      <PageHeader eyebrow="KAIA Collect" title="Register your KAIA Kit" description="Link your kit to your private KAIA account so your result comes back to you." />

      {!data.can_register_kit ? (
        <Card className="p-6 text-sm text-muted-foreground">You already have a screening in progress. You can register a new kit once it is complete.</Card>
      ) : (
        <Card className="p-5 sm:p-6">
          <div className="mb-6 flex items-center gap-4 rounded-field bg-secondary/70 p-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-field bg-surface text-primary">
              <ScanBarcode className="size-6" />
            </span>
            <p className="text-sm text-secondary-foreground">
              Find the <b>Kit ID</b> printed on the side of your KAIA Collect box. It looks like <span className="font-mono font-semibold">K26-00921</span>.
            </p>
          </div>
          <form onSubmit={onSubmit} className="space-y-5">
            <Field label="Kit ID" htmlFor="kit">
              <Input
                id="kit"
                required
                autoCapitalize="characters"
                placeholder="K26-00000"
                className="h-12 font-mono text-lg tracking-wider"
                value={kitCode}
                onChange={(e) => setKitCode(e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Where will you return your sample?" htmlFor="site">
              <Select id="site" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                {data.screening_sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <label className="flex items-start gap-3 rounded-field border border-border p-4 text-sm">
              <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span className="text-muted-foreground">
                I allow <b className="text-foreground">{site?.name ?? "the screening site"}</b> to access my screening information so they can analyze my sample and
                support my care. I can revoke this anytime in Privacy.
              </span>
            </label>
            <Button type="submit" size="lg" className="w-full" disabled={registerKit.isPending || !kitCode}>
              {registerKit.isPending ? <Loader2 className="animate-spin" /> : <PackageCheck />} Register kit
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
