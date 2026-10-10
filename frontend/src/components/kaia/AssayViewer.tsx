import { Eye, EyeOff, ScanLine } from "lucide-react";
import { useState } from "react";
import type { Analysis, Region } from "@/lib/types";
import { cn } from "@/lib/utils";

const LINE_LETTER: Record<string, string> = { control: "C", hpv: "H", genotype: "G", secondary: "M" };

const STATE_COLOR = {
  valid: "#8dae9b",
  detected: "#d9b26a",
  invalid: "#c58b92",
  neutral: "#c9b7d9",
};

function regionStyle(region: Region): string {
  if (region.key === "membrane_window" || region.key === "sample_well") return "border-white/40 border-dashed";
  if (region.state === "valid") return "border-[#8dae9b] bg-[#8dae9b]/10";
  if (region.state === "invalid") return "border-[#c58b92] bg-[#c58b92]/10";
  if (region.state === "detected") return "border-[#d9b26a] bg-[#d9b26a]/15";
  if (region.state === "indeterminate") return "border-[#d9b26a] border-dashed";
  return "border-[#c9b7d9]/80";
}

const LEGEND: [string, string][] = [
  ["Valid", STATE_COLOR.valid],
  ["Detected", STATE_COLOR.detected],
  ["Invalid", STATE_COLOR.invalid],
  ["Not detected", STATE_COLOR.neutral],
];

/** Assay capture with KAIA Vision region overlays, framed like an instrument panel. Image is fetched via a short-lived signed URL. */
export function AssayViewer({ analysis, scanning = false, className }: { analysis: Analysis; scanning?: boolean; className?: string }) {
  const [overlay, setOverlay] = useState(true);
  return (
    <figure className={cn("overflow-hidden rounded-card bg-sidebar text-sidebar-foreground shadow-soft ring-1 ring-black/10", className)}>
      <figcaption className="flex items-center justify-between gap-3 border-b border-sidebar-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="relative flex size-2">
            <span className={cn("absolute inline-flex size-full rounded-full bg-[#8dae9b]", scanning && "animate-ping opacity-75")} />
            <span className="relative inline-flex size-2 rounded-full bg-[#8dae9b]" />
          </span>
          <span className="text-[13px] font-semibold">Assay image</span>
          <span className="hidden truncate font-mono text-[11px] text-sidebar-muted sm:inline">{analysis.model_version}</span>
        </div>
        <button
          type="button"
          onClick={() => setOverlay((v) => !v)}
          aria-pressed={overlay}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/[0.07] px-3 text-xs font-medium text-sidebar-foreground transition-colors hover:bg-white/[0.12] [&_svg]:size-3.5"
        >
          {overlay ? <EyeOff /> : <Eye />} {overlay ? "Hide overlay" : "Show overlay"}
        </button>
      </figcaption>

      <div className="bg-[radial-gradient(circle_at_center,rgb(255_255_255/0.05)_1px,transparent_1px)] bg-[length:14px_14px] p-3 sm:p-4">
        <div className="relative overflow-hidden rounded-2xl bg-charcoal ring-1 ring-white/10">
          <img src={analysis.image_url} alt="Synthetic KAIA Cartridge assay capture" className="block w-full select-none" draggable={false} />
          {overlay &&
            analysis.regions.map((region) => {
              const isLine = region.key in LINE_LETTER;
              return (
                <div
                  key={region.key}
                  className={cn("absolute rounded-md border-2 transition-opacity", regionStyle(region))}
                  style={{
                    left: `${region.x * 100}%`,
                    top: `${region.y * 100}%`,
                    width: `${region.w * 100}%`,
                    height: `${region.h * 100}%`,
                  }}
                >
                  {isLine && (
                    <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-sidebar/90 px-1.5 py-0.5 font-mono text-[10px] text-white">
                      {LINE_LETTER[region.key]} {region.intensity?.toFixed(2)}
                    </span>
                  )}
                  {!isLine && <span className="absolute -top-5 left-0 whitespace-nowrap text-[10px] font-medium text-white/80">{region.label}</span>}
                </div>
              );
            })}
          {scanning && (
            <div className="pointer-events-none absolute inset-0">
              <div className="h-1/3 w-full animate-scan bg-gradient-to-b from-transparent via-lavender/40 to-transparent" />
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-sidebar-border px-4 py-3 text-[11px] text-sidebar-muted">
        <span className="flex items-center gap-1.5">
          <ScanLine className="size-3.5" /> {analysis.regions.length} regions detected
        </span>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Overlay legend">
          {LEGEND.map(([label, color]) => (
            <li key={label} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm border-2" style={{ borderColor: color }} aria-hidden />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
