import { HeartHandshake, Microscope, Route, Sparkles, TestTube } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "collect", name: "Collect", caption: "Private at-home sample collection", icon: TestTube },
  { key: "analyze", name: "Analyze", caption: "Point-of-care KAIA Reader", icon: Microscope },
  { key: "understand", name: "Understand", caption: "AI-assisted interpretation, clinician reviewed", icon: Sparkles },
  { key: "connect", name: "Connect", caption: "Referral to a partner facility", icon: Route },
  { key: "follow", name: "Follow Through", caption: "Tracked until care is complete", icon: HeartHandshake },
];

/** The KAIA pathway — one continuous line from sample to completed care. */
export function ProductFlow({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <svg className="pointer-events-none absolute inset-x-[10%] top-9 hidden h-2 w-[80%] md:block" preserveAspectRatio="none" viewBox="0 0 100 2" aria-hidden>
        <line x1="0" y1="1" x2="100" y2="1" stroke="var(--color-lavender)" strokeWidth="2" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
      </svg>
      <ol className="relative grid grid-cols-1 gap-5 md:grid-cols-5 md:gap-4">
        {STEPS.map((step, i) => (
          <li key={step.key} className="relative flex items-start gap-4 md:flex-col md:text-center">
            {i < STEPS.length - 1 && (
              <span aria-hidden className="absolute left-[23px] top-14 h-[calc(100%-2.5rem)] w-px border-l border-dashed border-lavender md:hidden" />
            )}
            <span className="relative z-10 grid size-12 shrink-0 place-items-center rounded-full border border-border bg-surface text-primary md:mx-auto">
              <step.icon className="size-5" />
            </span>
            <div className="md:mt-3">
              <p className="text-sm font-semibold text-foreground">{step.name}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{step.caption}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Abstract brand artwork — petals and flow lines.
 * Organic language for flow, continuity and progress; never over data.
 */
export function BrandArtwork({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 420" className={cn("size-full", className)} role="img" aria-label="KAIA">
      <defs>
        <linearGradient id="kaia-petal-a" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="var(--color-primary)" />
          <stop offset="1" stopColor="var(--color-burgundy)" />
        </linearGradient>
        <linearGradient id="kaia-petal-b" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="var(--color-lavender)" />
          <stop offset="1" stopColor="#e3d8ec" />
        </linearGradient>
      </defs>

      {/* flow lines — continuity */}
      {[0, 1, 2, 3].map((i) => (
        <path
          key={i}
          d={`M-10 ${250 + i * 26}C90 ${190 + i * 24} 190 ${300 + i * 20} 430 ${150 + i * 28}`}
          fill="none"
          stroke={i % 2 === 0 ? "var(--color-lavender)" : "var(--color-green)"}
          strokeOpacity={0.45 - i * 0.07}
          strokeWidth="1.5"
        />
      ))}

      {/* petals opening around the figure */}
      <path d="M205 330C128 290 95 211 112 122c80 24 117 96 93 208z" fill="url(#kaia-petal-a)" fillOpacity="0.92" />
      <path d="M215 330c77-40 110-119 93-208-80 24-117 96-93 208z" fill="url(#kaia-petal-b)" />
      <path
        d="M210 338c-16-54-23-102-21-148 2-31 9-58 21-81 12 23 19 50 21 81 2 46-5 94-21 148z"
        fill="var(--color-primary)"
      />
      <circle cx="210" cy="78" r="26" fill="var(--color-primary)" />
      <circle cx="210" cy="78" r="26" fill="var(--color-lavender)" fillOpacity="0.25" />
    </svg>
  );
}
