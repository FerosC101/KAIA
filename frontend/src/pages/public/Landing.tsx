import { ArrowRight, Building2, HeartHandshake, Lock, Menu, Microscope, Route, ShieldCheck, Sparkles, TestTube, Users, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { KaiaLogo } from "@/components/kaia/Logo";
import { BrandArtwork, ProductFlow } from "@/components/kaia/ProductFlow";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { ROLE_HOME, useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const NAV = [
  ["#how", "How it Works"],
  ["#patients", "For Patients"],
  ["#workers", "For Health Workers"],
  ["#communities", "For Communities"],
  ["#about", "About"],
];

function Section({
  id,
  eyebrow,
  title,
  intro,
  children,
  className,
}: {
  id?: string;
  eyebrow: string;
  title: ReactNode;
  intro?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-20 px-5 py-20 sm:py-24", className)}>
      <div className="mx-auto max-w-[1200px]">
        <p className="eyebrow text-primary">{eyebrow}</p>
        <h2 className="display mt-3 max-w-3xl text-balance text-[32px] text-foreground sm:text-[42px]">{title}</h2>
        {intro && <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">{intro}</p>}
        {children && <div className="mt-12">{children}</div>}
      </div>
    </section>
  );
}

function PartnerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [form, setForm] = useState({ name: "", organization: "", type: "LGU / Rural Health Unit", message: "" });
  function submit(e: FormEvent) {
    e.preventDefault();
    const body = `Name: ${form.name}\nOrganization: ${form.organization}\nType: ${form.type}\n\n${form.message}`;
    window.location.href = `mailto:partners@kaia.health?subject=${encodeURIComponent(`KAIA partnership — ${form.organization}`)}&body=${encodeURIComponent(body)}`;
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader
          icon={<Building2 className="size-5" />}
          title="Partner with KAIA"
          description="Bring screening that leads to care to your community, clinic or pharmacy network."
        />
        <form onSubmit={submit} className="space-y-4">
          <Field label="Your name" htmlFor="p-name">
            <Input id="p-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Organization" htmlFor="p-org">
            <Input id="p-org" required value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} />
          </Field>
          <Field label="Partner type" htmlFor="p-type">
            <Select id="p-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option>LGU / Rural Health Unit</option>
              <option>Clinic or hospital</option>
              <option>Pharmacy network</option>
              <option>Research or NGO</option>
            </Select>
          </Field>
          <Field label="How would you like to work together?" htmlFor="p-msg">
            <Textarea id="p-msg" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          </Field>
          <DialogFooter>
            <Button type="submit">
              Compose email <ArrowRight />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Landing() {
  const { user } = useAuth();
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-18 max-w-[1200px] items-center justify-between gap-4 px-5 py-3">
          <a href="#top" aria-label="KAIA">
            <KaiaLogo />
          </a>
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground lg:flex">
            {NAV.map(([href, label]) => (
              <a key={href} href={href} className="transition-colors duration-200 hover:text-primary">
                {label}
              </a>
            ))}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            {user ? (
              <Button asChild>
                <Link to={ROLE_HOME[user.role]}>Open KAIA</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost">
                  <Link to="/login">Sign In</Link>
                </Button>
                <Button asChild>
                  <Link to="/register">Get Started</Link>
                </Button>
              </>
            )}
          </div>
          <button className="grid size-11 place-items-center rounded-btn lg:hidden" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu">
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
        {menuOpen && (
          <div className="border-t border-border bg-surface px-5 py-4 lg:hidden">
            <div className="flex flex-col gap-4 text-sm">
              {NAV.map(([href, label]) => (
                <a key={href} href={href} onClick={() => setMenuOpen(false)} className="text-muted-foreground">
                  {label}
                </a>
              ))}
              <div className="flex gap-2 pt-2">
                <Button asChild variant="outline" className="flex-1">
                  <Link to="/login">Sign In</Link>
                </Button>
                <Button asChild className="flex-1">
                  <Link to={user ? ROLE_HOME[user.role] : "/register"}>{user ? "Open KAIA" : "Get Started"}</Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* HERO */}
      <section id="top" className="brand-veil relative overflow-hidden px-5 pb-20 pt-16 sm:pt-24">
        <div className="mx-auto grid max-w-[1200px] items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-success" /> Cervical-health screening · Philippines pilot prototype
            </span>
            <h1 className="display mt-7 text-[44px] leading-[1.06] text-foreground sm:text-[60px]">
              Screen earlier.
              <br />
              Understand better.
              <br />
              <span className="text-primary">Reach care.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-muted-foreground">
              KAIA combines accessible reproductive-health screening with intelligent care pathways — helping women move from screening to the care
              they need.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link to="/register">
                  Get started <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#how">See how KAIA works</a>
              </Button>
            </div>
            <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Lock className="size-4 text-primary" /> Private by design
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" /> Clinician reviewed
              </div>
              <div className="flex items-center gap-2">
                <HeartHandshake className="size-4 text-primary" /> Care tracked to completion
              </div>
            </dl>
          </div>
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <BrandArtwork className="w-full" />
          </div>
        </div>
      </section>

      {/* THE PROBLEM */}
      <Section
        id="about"
        eyebrow="The problem"
        title="Screening only works when women can reach it."
        intro="Cervical-health programs lose women at two points. KAIA is designed around both."
        className="border-y border-border bg-surface"
      >
        <div className="grid gap-5 md:grid-cols-2">
          {[
            {
              n: "01",
              title: "Women never enter the pathway",
              text: "Distance, cost, time away from work and discomfort keep many women from ever being screened. A pelvic exam at a distant clinic is a barrier, not an invitation.",
              fix: "KAIA brings private sample collection and point-of-care analysis closer to home.",
            },
            {
              n: "02",
              title: "Women are lost after a result",
              text: "A result that needs follow-up is where care should begin — yet referrals go unscheduled, appointments are missed, and no one knows whether follow-up ever happened.",
              fix: "KAIA Care tracks every referral until confirmatory care is complete.",
            },
          ].map((item) => (
            <article key={item.n} className="rounded-card border border-border bg-background p-7">
              <span className="font-mono text-sm text-lavender">{item.n}</span>
              <h3 className="display mt-3 text-[22px] text-foreground">{item.title}</h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">{item.text}</p>
              <p className="mt-5 border-l-2 border-primary/30 pl-4 text-sm font-medium text-primary">{item.fix}</p>
            </article>
          ))}
        </div>
      </Section>

      {/* HOW KAIA WORKS */}
      <Section id="how" eyebrow="How KAIA works" title="From a sample at home to care that is completed.">
        <ProductFlow />
      </Section>

      {/* WHY KAIA */}
      <Section
        id="patients"
        eyebrow="Why KAIA"
        title="A screening journey that stays with her."
        className="border-y border-border bg-surface"
      >
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: TestTube, title: "Accessible screening", text: "Private sample collection, analysed at a nearby health centre or pharmacy." },
            { icon: Sparkles, title: "Clear next steps", text: "Plain-language results that always answer: what should I do next?" },
            { icon: Lock, title: "Private health journey", text: "Encrypted records, and consent you can grant or revoke at any time." },
            { icon: Route, title: "Connected care", text: "Referrals, appointments and follow-up tracked until care is complete." },
          ].map(({ icon: Icon, title, text }) => (
            <article key={title} className="rounded-card border border-border bg-background p-6">
              <span className="grid size-11 place-items-center rounded-field bg-secondary text-primary">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-5 font-semibold text-foreground">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </article>
          ))}
        </div>
      </Section>

      {/* FOR HEALTH SYSTEMS */}
      <Section
        id="workers"
        eyebrow="For health systems"
        title="See where the care pathway holds — and where it breaks."
        intro="Health workers manage screening and referrals in one queue. Programs see de-identified coverage, follow-up completion and the barangays that need outreach."
      >
        <div className="grid gap-5 lg:grid-cols-3">
          {[
            {
              icon: Microscope,
              title: "For health workers",
              points: ["Screening queue and live reader status", "AI-assisted review with clinician sign-off", "QR referrals between facilities"],
            },
            {
              icon: Users,
              title: "For communities",
              points: ["Screening funnel from eligible to completed care", "Coverage by barangay", "Automatic care-gap detection"],
            },
            {
              icon: ShieldCheck,
              title: "For every woman",
              points: ["Results in plain language", "One clear next step", "A personal KAIA Passport"],
            },
          ].map(({ icon: Icon, title, points }) => (
            <article key={title} id={title.includes("communities") ? "communities" : undefined} className="rounded-card border border-border bg-surface p-7">
              <span className="grid size-11 place-items-center rounded-field bg-primary-soft text-primary">
                <Icon className="size-5" />
              </span>
              <h3 className="display mt-5 text-xl text-foreground">{title}</h3>
              <ul className="mt-4 space-y-2.5">
                {points.map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-lavender" />
                    {p}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </Section>

      {/* FINAL CTA */}
      <section className="px-5 pb-24">
        <div className="brand-veil mx-auto max-w-[1200px] overflow-hidden rounded-card border border-border bg-surface px-8 py-16 text-center sm:px-16">
          <p className="display mx-auto max-w-2xl text-balance text-[32px] leading-tight text-foreground sm:text-[44px]">
            A healthier tomorrow starts earlier.
          </p>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            KAIA does not stop at screening. It follows the woman from sample collection to completed care.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link to="/login">
                Explore KAIA <ArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="outline" onClick={() => setPartnerOpen(true)}>
              Partner with KAIA
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border px-5 py-10">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <KaiaLogo subtitle="Screen earlier. Understand better. Reach care." />
          <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
            KAIA is a prototype screening and care-navigation platform. It does not diagnose cervical cancer. All results require clinical review.
            This demonstration uses synthetic data only — no real patient information.
          </p>
        </div>
      </footer>
      <PartnerDialog open={partnerOpen} onOpenChange={setPartnerOpen} />
    </div>
  );
}
