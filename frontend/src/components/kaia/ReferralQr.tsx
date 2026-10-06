import { QRCodeSVG } from "qrcode.react";
import { KaiaMark } from "@/components/kaia/Logo";
import { ReferralStatusBadge } from "@/components/kaia/badges";
import type { ReferralDetail } from "@/lib/types";
import { formatDate } from "@/lib/utils";

/** Printable referral slip. The QR carries an opaque signed token — never health data. */
export function ReferralQr({ referral }: { referral: ReferralDetail }) {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
      <div className="flex items-center justify-between border-b border-border bg-muted/60 px-5 py-3">
        <div className="flex items-center gap-2">
          <KaiaMark className="size-6" />
          <span className="text-sm font-semibold text-foreground">KAIA Care referral</span>
        </div>
        <span className="font-mono text-xs text-muted-foreground">{referral.referral_code}</span>
      </div>
      <div className="flex flex-col items-center gap-5 p-5 sm:flex-row sm:items-start">
        <div className="rounded-field border border-border bg-white p-3">
          <QRCodeSVG value={referral.qr.url} size={160} level="M" fgColor="#1f2937" />
        </div>
        <div className="w-full min-w-0 flex-1 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Status</span>
            <ReferralStatusBadge status={referral.status} />
          </div>
          <Row label="Referral type" value={referral.referral_type_label} />
          <Row label="Destination" value={referral.destination_org.name} />
          <Row label="Priority" value={referral.priority === "priority" ? "Priority" : "Standard"} />
          <Row label="Generated" value={formatDate(referral.generated_at)} />
          {referral.appointment_at && <Row label="Appointment" value={formatDate(referral.appointment_at)} />}
          <p className="pt-1 text-xs leading-relaxed text-muted-foreground">
            Show this code at the facility. Only authorised staff at the destination can open it.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}
