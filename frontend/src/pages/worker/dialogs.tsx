import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, Cpu, FileText, Loader2, Lock, MessageSquarePlus, Search, UserPlus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { api } from "@/lib/api";
import { SIM_PROFILES } from "@/lib/labels";
import type { CareView, Reader, ReferralDetail, ScreeningDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

export function RegisterCartridgeDialog({
  screeningId,
  patientCode,
  open,
  onOpenChange,
}: {
  screeningId: string | null;
  patientCode?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: readers = [] } = useQuery({ queryKey: ["readers"], queryFn: () => api<Reader[]>("/readers"), enabled: open });
  const available = readers.filter((r) => r.status === "online" && !r.current_cartridge);
  const [cartridge, setCartridge] = useState("KAIA-CAR-");
  const [reader, setReader] = useState("");
  const [profile, setProfile] = useState("");
  const [showSim, setShowSim] = useState(false);
  const readerCode = reader || (available.find((r) => r.reader_code === "KAIA-RDR-003") ?? available[0])?.reader_code || "";

  const register = useMutation({
    mutationFn: () =>
      api<ScreeningDetail>(`/screenings/${screeningId}/cartridge`, {
        method: "POST",
        body: { cartridge_code: cartridge.trim(), reader_code: readerCode, ...(profile ? { sim_profile: profile } : {}) },
      }),
    onSuccess: () => {
      toast.success(`Cartridge inserted into ${readerCode}`);
      qc.invalidateQueries();
      onOpenChange(false);
      navigate(`/portal/readers/${readerCode}`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader
          icon={<Cpu className="size-5" />}
          title="Register cartridge"
          description={patientCode ? `Associate a sealed KAIA Cartridge with ${patientCode} and insert it into a reader.` : undefined}
        />
        <div className="space-y-4">
          <Field label="Cartridge ID" htmlFor="cartridge" hint="Scan or type the code printed on the cartridge label.">
            <Input id="cartridge" className="font-mono tracking-wider" value={cartridge} onChange={(e) => setCartridge(e.target.value.toUpperCase())} />
          </Field>
          <Field label="KAIA Reader" htmlFor="reader">
            <Select id="reader" value={readerCode} onChange={(e) => setReader(e.target.value)}>
              {available.length === 0 && <option value="">No available readers</option>}
              {available.map((r) => (
                <option key={r.id} value={r.reader_code}>
                  {r.reader_code} — {r.location_name}
                </option>
              ))}
            </Select>
          </Field>
          <button type="button" className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground" onClick={() => setShowSim((v) => !v)}>
            <ChevronDown className={cn("size-3.5 transition", showSim && "rotate-180")} /> Simulator settings (prototype only)
          </button>
          {showSim && (
            <Field label="Synthetic assay profile" htmlFor="sim" hint="Controls what the simulated reader produces. Ignored when physical hardware is connected.">
              <Select id="sim" value={profile} onChange={(e) => setProfile(e.target.value)}>
                <option value="">Use cartridge's configured profile</option>
                {SIM_PROFILES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => register.mutate()} disabled={register.isPending || !readerCode || cartridge.length < 10}>
            {register.isPending && <Loader2 className="animate-spin" />} Insert & open reader
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Lookup = { patient_code: string; has_consent: boolean; name: string | null; age_bracket: string | null; has_screening_in_progress: boolean };

export function NewScreeningDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [code, setCode] = useState("KAIA-USER-");
  const [kit, setKit] = useState("K26-");
  const [consent, setConsent] = useState(false);
  const [collected, setCollected] = useState(true);
  const [patient, setPatient] = useState<Lookup | null>(null);
  const lookup = useMutation({
    mutationFn: () => api<Lookup>(`/worker/patients/lookup?code=${encodeURIComponent(code.trim())}`),
    onSuccess: setPatient,
    onError: (e) => {
      setPatient(null);
      toast.error(e.message);
    },
  });
  const create = useMutation({
    mutationFn: () =>
      api("/screenings", {
        method: "POST",
        body: { patient_code: code.trim(), kit_code: kit.trim(), sample_collected: collected, patient_consent_confirmed: true },
      }),
    onSuccess: () => {
      toast.success("Screening registered");
      qc.invalidateQueries();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader icon={<UserPlus className="size-5" />} title="Walk-in screening" description="Register a kit for a patient who already has a KAIA account." />
        <div className="space-y-4">
          <Field label="Patient code" htmlFor="pcode">
            <div className="flex gap-2">
              <Input id="pcode" className="font-mono" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
              <Button variant="outline" onClick={() => lookup.mutate()} disabled={lookup.isPending}>
                <Search /> Find
              </Button>
            </div>
          </Field>
          {patient && (
            <div className="rounded-card bg-muted p-3 text-sm">
              <p className="font-semibold text-foreground">{patient.name ?? patient.patient_code}</p>
              <p className="text-xs text-muted-foreground">
                {patient.has_consent ? `Existing consent · age ${patient.age_bracket}` : "No consent on file — confirm in person below"}
                {patient.has_screening_in_progress && " · has a screening in progress"}
              </p>
            </div>
          )}
          <Field label="Kit ID" htmlFor="kit">
            <Input id="kit" className="font-mono" value={kit} onChange={(e) => setKit(e.target.value.toUpperCase())} />
          </Field>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={collected} onChange={(e) => setCollected(e.target.checked)} />
            <span>Sample already collected and received</span>
          </label>
          <label className="flex items-start gap-3 rounded-card border border-border p-3 text-sm">
            <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span className="text-muted-foreground">The patient gave informed consent in person for this site to access her screening information.</span>
          </label>
        </div>
        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={!consent || !patient || create.isPending}>
            {create.isPending && <Loader2 className="animate-spin" />} Register screening
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WorkerReferralDialog({ care, open, onOpenChange }: { care: CareView; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [destination, setDestination] = useState(care.recommended_facility_id ?? care.facility_options[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const create = useMutation({
    mutationFn: () =>
      api<ReferralDetail>("/referrals", {
        method: "POST",
        body: { screening_id: care.screening.id, destination_org_id: destination, notes: notes || null, patient_consent_confirmed: true },
      }),
    onSuccess: (r) => {
      toast.success(`Referral ${r.referral_code} issued`);
      qc.invalidateQueries();
      navigate(`/portal/referrals/${r.id}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const facility = care.facility_options.find((f) => f.id === destination);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader icon={<FileText className="size-5" />} title="Issue referral" description={care.pathway.recommended_action} />
        <div className="space-y-4">
          <Field label="Destination facility" htmlFor="dest">
            <Select id="dest" value={destination} onChange={(e) => setDestination(e.target.value)}>
              {care.facility_options.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                  {f.id === care.recommended_facility_id ? " (recommended)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Clinical notes for receiving facility (encrypted)" htmlFor="notes">
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <label className="flex items-start gap-3 rounded-card border border-border p-3 text-sm">
            <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span className="text-muted-foreground">
              The patient agreed to share referral information with <b className="text-foreground">{facility?.name}</b>.
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={!consent || create.isPending}>
            {create.isPending && <Loader2 className="animate-spin" />} Issue referral
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OutreachDialog({ referralId, open, onOpenChange }: { referralId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [type, setType] = useState("outreach_contact");
  const [notes, setNotes] = useState("");
  const record = useMutation({
    mutationFn: () => api(`/followups`, { method: "POST", body: { referral_id: referralId, event_type: type, notes: notes || null } }),
    onSuccess: () => {
      toast.success("Follow-up event recorded");
      qc.invalidateQueries();
      onOpenChange(false);
      setNotes("");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader icon={<MessageSquarePlus className="size-5" />} title="Record follow-up event" />
        <div className="space-y-4">
          <Field label="Event" htmlFor="etype">
            <Select id="etype" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="outreach_contact">Community health worker outreach</option>
              <option value="reminder_sent">Reminder sent (SMS / call)</option>
            </Select>
          </Field>
          <Field label="Notes (encrypted)" htmlFor="enotes">
            <Textarea id="enotes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Home visit — patient will call clinic this week" />
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={() => record.mutate()} disabled={record.isPending}>
            Save event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RestrictedName({ name, code }: { name: string | null; code: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[13px] font-semibold text-foreground">{code}</p>
      {name ? (
        <p className="truncate text-xs text-muted-foreground">{name}</p>
      ) : (
        <p className="flex items-center gap-1 text-xs text-subtle">
          <Lock className="size-3" /> Access restricted
        </p>
      )}
    </div>
  );
}

export function ConsentOk() {
  return (
    <Badge tone="success">
      <CheckCircle2 className="size-3" /> Consent on file
    </Badge>
  );
}
