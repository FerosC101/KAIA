import { useMutation } from "@tanstack/react-query";
import jsQR from "jsqr";
import { ArrowRight, Camera, CameraOff, Loader2, QrCode, ShieldCheck, ShieldX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { OutcomeBadge, ReferralStatusBadge } from "@/components/kaia/badges";
import { KeyValue, PageHeader } from "@/components/kaia/layout-bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { api } from "@/lib/api";
import type { ReferralDetail } from "@/lib/types";
import { formatDate } from "@/lib/utils";

function extractToken(raw: string): string {
  const value = raw.trim();
  try {
    const url = new URL(value);
    return url.searchParams.get("token") ?? value;
  } catch {
    return value;
  }
}

export default function ReferralScan() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [manual, setManual] = useState("");
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const verify = useMutation({
    mutationFn: (token: string) => api<ReferralDetail>("/referrals/verify", { method: "POST", body: { token } }),
  });

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  useEffect(() => {
    const token = params.get("token");
    if (token) verify.mutate(token);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCamera() {
    verify.reset();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setScanning(true);
      requestAnimationFrame(() => {
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        void videoRef.current.play();
        tick();
      });
    } catch {
      setScanning(false);
      verify.reset();
      alert("Camera unavailable. Paste the referral link or code instead.");
    }
  }

  function tick() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
        if (code?.data) {
          stop();
          verify.mutate(extractToken(code.data));
          return;
        }
      }
    }
    requestAnimationFrame(tick);
  }

  const referral = verify.data;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="KAIA Care" title="Scan referral QR" description="Retrieve an authorized referral. Only facilities named on the referral can open it — every scan is audit-logged." />

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-5">
          <div className="relative aspect-square overflow-hidden rounded-card bg-charcoal">
            {scanning ? (
              <>
                <video ref={videoRef} className="size-full object-cover" playsInline muted />
                <div className="pointer-events-none absolute inset-8 rounded-card border-2 border-white/70" />
              </>
            ) : (
              <div className="grid size-full place-items-center text-white/50">
                <QrCode className="size-20" />
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>
          <Button className="mt-4 w-full" variant={scanning ? "outline" : "default"} onClick={scanning ? stop : startCamera}>
            {scanning ? <CameraOff /> : <Camera />} {scanning ? "Stop camera" : "Start camera"}
          </Button>
          <div className="mt-5 border-t border-border pt-5">
            <p className="text-sm font-medium">Or paste the referral link / code</p>
            <div className="mt-2 flex gap-2">
              <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="https://…/portal/referrals/scan?token=…" />
              <Button variant="outline" onClick={() => verify.mutate(extractToken(manual))} disabled={!manual || verify.isPending}>
                Verify
              </Button>
            </div>
          </div>
        </Card>

        <div>
          {verify.isPending && (
            <Card className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Verifying referral…
            </Card>
          )}
          {verify.isError && (
            <Card className="flex items-start gap-3 border-priority/30 bg-priority-soft p-5">
              <ShieldX className="mt-0.5 size-5 text-priority" />
              <div>
                <p className="font-semibold text-priority">Referral not available</p>
                <p className="text-sm text-priority/80">{verify.error.message}</p>
              </div>
            </Card>
          )}
          {referral && (
            <Card className="overflow-hidden">
              <div className="flex items-center gap-2 bg-success-soft px-5 py-3 text-sm font-semibold text-success">
                <ShieldCheck className="size-4" /> Authorized referral verified
              </div>
              <div className="p-5">
                <p className="font-mono text-sm text-muted-foreground">{referral.referral_code}</p>
                <p className="text-xl font-bold text-foreground">{referral.patient.name ?? referral.patient.patient_code}</p>
                <div className="mt-3 divide-y divide-border">
                  <KeyValue label="Status" value={<ReferralStatusBadge status={referral.status} />} />
                  <KeyValue label="Type" value={referral.referral_type_label} />
                  <KeyValue label="From" value={referral.source_org.name} />
                  <KeyValue label="Screening" value={<OutcomeBadge outcome={referral.screening.outcome} />} />
                  <KeyValue label="Generated" value={formatDate(referral.generated_at)} />
                </div>
                <Button className="mt-4 w-full" onClick={() => navigate(`/portal/referrals/${referral.id}`)}>
                  Open referral <ArrowRight />
                </Button>
              </div>
            </Card>
          )}
          {!verify.isPending && !verify.isError && !referral && (
            <Card className="p-5 text-sm text-muted-foreground">Scan a KAIA referral QR code to see the authorized referral here.</Card>
          )}
        </div>
      </div>
    </div>
  );
}
