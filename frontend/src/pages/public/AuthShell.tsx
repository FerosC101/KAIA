import type { ReactNode } from "react";
import { Link } from "react-router";
import { KaiaLogo } from "@/components/kaia/Logo";
import { BrandArtwork } from "@/components/kaia/ProductFlow";

export function AuthShell({ title, subtitle, children, aside }: { title: string; subtitle: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <div className="brand-veil relative hidden overflow-hidden border-r border-border bg-surface p-12 lg:flex lg:flex-col lg:justify-between">
        <Link to="/" className="relative">
          <KaiaLogo />
        </Link>
        <div className="relative">
          <BrandArtwork className="mx-auto w-[min(420px,80%)]" />
          <p className="display mt-8 text-[34px] leading-tight text-foreground">
            A healthier tomorrow
            <br />
            starts <span className="text-primary">earlier.</span>
          </p>
          <p className="mt-4 max-w-md leading-relaxed text-muted-foreground">
            KAIA follows every woman from sample collection to completed care — with privacy, clinician review and consent at every step.
          </p>
        </div>
        <div className="relative">{aside}</div>
      </div>
      <div className="flex flex-col justify-center px-5 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-md">
          <Link to="/" className="mb-10 inline-block lg:hidden">
            <KaiaLogo />
          </Link>
          <h1 className="display text-[32px] text-foreground">{title}</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
