import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { KaiaLogo } from "@/components/kaia/Logo";

/** Full-screen cream auth page: one centered column, no panels or cards. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-safe pt-[max(1.25rem,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between">
          <Link
            to="/"
            aria-label="Back to home"
            className="-ml-2 grid size-11 place-items-center rounded-full text-primary transition-colors hover:bg-primary-soft"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <Link to="/" aria-label="KAIA home">
            <KaiaLogo size="sm" />
          </Link>
          <span className="size-11" aria-hidden />
        </header>

        <main className="flex flex-1 flex-col pt-10 sm:justify-center sm:pt-0">
          <h1 className="text-[34px] leading-tight text-primary">{title}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </main>

        <p className="py-6 text-center text-[11px] leading-relaxed text-subtle">
          Prototype environment · synthetic data only · not for clinical use
        </p>
      </div>
    </div>
  );
}
