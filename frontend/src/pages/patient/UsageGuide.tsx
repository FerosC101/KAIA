import { ArrowLeft, CalendarHeart, PackageCheck, Timer, type LucideIcon } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: CalendarHeart, title: "Attach", text: "Place the KAIA insert on your pad." },
  { icon: Timer, title: "Use", text: "Go about your normal day." },
  { icon: PackageCheck, title: "Seal", text: "After use, seal the insert in the cartridge." },
];

/** How to use the KAIA Collect insert — mobile flow with the confirm action anchored at the bottom. */
export default function UsageGuide() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-14rem)] max-w-md flex-col lg:min-h-0">
      <Link
        to="/app"
        aria-label="Back to overview"
        className="-ml-2 grid size-11 place-items-center rounded-full text-primary transition-colors hover:bg-primary-soft"
      >
        <ArrowLeft className="size-5" />
      </Link>

      <header className="mt-2 text-center">
        <h1 className="text-[32px] leading-tight text-primary">How to Use KAIA</h1>
        <p className="mx-auto mt-2 max-w-sm font-serif text-[16px] leading-relaxed text-primary/75">
          Attach the KAIA insert to your normal sanitary pad and use it during your menstruation.
        </p>
      </header>

      {/* Transparent cut-out on the cream page. 280w for 1x screens, 560w for 2x+. */}
      <img
        src="/kaia-usage-insert-560.webp"
        srcSet="/kaia-usage-insert-280.webp 280w, /kaia-usage-insert-560.webp 560w"
        sizes="(min-width: 768px) 280px, 240px"
        alt="Usage Insert"
        width={560}
        height={394}
        decoding="async"
        className="pointer-events-none mx-auto mb-6 mt-6 h-auto w-full max-w-[240px] md:max-w-[280px]"
      />

      <ol className="rounded-card border border-border/70 bg-card p-2 shadow-card">
        {STEPS.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="relative flex items-center gap-4 rounded-2xl px-3 py-3.5">
            {i < STEPS.length - 1 && <span aria-hidden className="absolute bottom-0 left-[4.25rem] right-3 h-px bg-border/70" />}
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
              <Icon className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
                <span className="grid size-5 place-items-center rounded-full bg-primary text-[11px] font-semibold text-white">{i + 1}</span>
                {title}
              </p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-auto pt-8">
        <Button size="lg" className="w-full rounded-full" onClick={() => navigate("/app")}>
          I Understand
        </Button>
      </div>
    </div>
  );
}
