import { cn } from "@/lib/utils";

/**
 * KAIA symbol — an abstract organic form: petals opening around a figure.
 * Reads as growth, protection and reproductive health without anatomical illustration.
 */
export function KaiaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("size-9", className)} role="img" aria-label="KAIA">
      <path d="M23.2 43C11.6 36.6 6 25.8 7.9 13.9c11 3 16.2 12.7 15.3 29.1z" fill="var(--color-burgundy)" fillOpacity="0.9" />
      <path d="M24.8 43c11.6-6.4 17.2-17.2 15.3-29.1-11 3-16.2 12.7-15.3 29.1z" fill="var(--color-lavender)" />
      <path
        d="M24 43.6c-2.2-7.2-3.2-13.8-3-20 .2-4.2 1.2-7.9 3-11 1.8 3.1 2.8 6.8 3 11 .2 6.2-.8 12.8-3 20z"
        fill="var(--color-primary)"
      />
      <circle cx="24" cy="8.4" r="4.4" fill="var(--color-primary)" />
    </svg>
  );
}

export function KaiaLogo({
  className,
  light = false,
  subtitle,
  size = "default",
}: {
  className?: string;
  light?: boolean;
  subtitle?: string;
  size?: "sm" | "default";
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <KaiaMark className={size === "sm" ? "size-7" : "size-9"} />
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            "font-serif font-semibold tracking-[0.14em]",
            size === "sm" ? "text-lg" : "text-xl",
            light ? "text-white" : "text-primary",
          )}
        >
          KAIA
        </span>
        {subtitle && (
          <span className={cn("mt-1.5 text-[10px] font-medium uppercase tracking-[0.16em]", light ? "text-white/60" : "text-muted-foreground")}>
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
}
