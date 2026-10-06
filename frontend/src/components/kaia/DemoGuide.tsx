import { ArrowRight, Compass, LogIn, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const DEMO_PASSWORD = "KaiaDemo2026!";

export const DEMO_ACCOUNTS = {
  maria: { email: "maria.santos@demo.kaia.ph", name: "Maria Santos", role: "Patient" },
  ana: { email: "ana.reyes@demo.kaia.ph", name: "Ana Reyes", role: "Health worker · Batangas CHO" },
  liza: { email: "liza.cruz@demo.kaia.ph", name: "Dr. Liza Cruz", role: "Health worker · Women's Health Clinic" },
  ramon: { email: "ramon.bautista@demo.kaia.ph", name: "Dr. Ramon Bautista", role: "Institution admin · Batangas CHO" },
  sysadmin: { email: "sysadmin@demo.kaia.ph", name: "KAIA Operations", role: "KAIA system admin" },
} as const;

type Who = keyof typeof DEMO_ACCOUNTS;

const STEPS: { who: Who; title: string; detail: string; to: string }[] = [
  { who: "ramon", title: "Baseline: program dashboard", detail: "Note Follow-Up Required 184 and Completed 139.", to: "/institution/population" },
  { who: "maria", title: "Maria registers KAIA Kit K26-00921", detail: "Register kit → Batangas City Health Office.", to: "/app/register-kit" },
  { who: "maria", title: "Sample collected & returned", detail: "Home → “I've returned my sample”.", to: "/app" },
  { who: "ana", title: "Insert Cartridge KAIA-CAR-00921", detail: "Queue → Maria's row → Register cartridge → KAIA-RDR-003.", to: "/portal" },
  { who: "ana", title: "KAIA Reader processes the sample", detail: "Reader KAIA-RDR-003 → Begin Analysis.", to: "/portal/readers/KAIA-RDR-003" },
  { who: "ana", title: "KAIA Vision + Risk Engine → release", detail: "Review signals, then Approve & release result.", to: "/portal" },
  { who: "maria", title: "Maria sees her result & KAIA Care", detail: "View Next Steps → Generate Referral → Mark Appointment Scheduled.", to: "/app" },
  { who: "liza", title: "Clinic scans referral & completes care", detail: "Referrals → Maria's referral → Attended → Completed.", to: "/portal/referrals" },
  { who: "maria", title: "KAIA Passport updated", detail: "Referral and confirmatory screening now verified.", to: "/app/passport" },
  { who: "ramon", title: "Program dashboard changed", detail: "Follow-Up Required 185 · Completed 140.", to: "/institution/population" },
];

export function DemoGuide() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  if (import.meta.env.VITE_DEMO_MODE === "false") return null;
  if (user && !user.is_demo) return null;

  async function go(who: Who, to: string) {
    const account = DEMO_ACCOUNTS[who];
    try {
      setBusy(to + who);
      if (user?.email !== account.email) {
        if (user) await logout();
        await login(account.email, DEMO_PASSWORD);
        toast.success(`Signed in as ${account.name}`);
      }
      navigate(to);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not switch account");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-24 left-4 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-lift transition-colors duration-200 hover:bg-primary-hover md:bottom-6 md:left-6"
        aria-expanded={open}
      >
        <Compass className="size-4" /> Demo guide
      </button>
      {open && (
        <div className="fixed inset-x-3 bottom-40 z-40 max-h-[70dvh] overflow-hidden rounded-card border border-border bg-surface shadow-lift md:inset-x-auto md:bottom-20 md:left-6 md:w-[400px]">
          <div className="flex items-start justify-between gap-3 border-b border-border bg-primary px-5 py-4 text-white">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">End-to-end demo</p>
              <p className="font-semibold">From sample collection to completed care</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close demo guide" className="rounded-full p-1 hover:bg-white/10">
              <X className="size-4" />
            </button>
          </div>
          <ol className="max-h-[calc(70dvh-76px)] space-y-1 overflow-y-auto p-3">
            {STEPS.map((step, i) => {
              const account = DEMO_ACCOUNTS[step.who];
              const active = user?.email === account.email;
              return (
                <li key={i} className="group rounded-btn p-3 transition-colors duration-200 hover:bg-muted/70">
                  <div className="flex gap-3">
                    <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold", active ? "bg-primary text-white" : "bg-secondary text-secondary-foreground")}>
                      {i}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{step.title}</p>
                      <p className="text-xs text-muted-foreground">{step.detail}</p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] font-medium text-subtle">{account.name}</span>
                        <Button size="sm" variant={active ? "subtle" : "outline"} disabled={busy !== null} onClick={() => go(step.who, step.to)}>
                          {active ? <ArrowRight /> : <LogIn />} {active ? "Go" : "Sign in & go"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </>
  );
}
