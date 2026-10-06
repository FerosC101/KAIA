import { Eye, EyeOff, ScanLine } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Analysis, Region } from "@/lib/types";
import { cn } from "@/lib/utils";

const LINE_LETTER: Record<string, string> = { control: "C", hpv: "H", genotype: "G", secondary: "M" };

function regionStyle(region: Region): string {
  if (region.key === "membrane_window" || region.key === "sample_well") return "border-white/45 border-dashed";
  if (region.state === "valid") return "border-[#8dae9b] bg-[#8dae9b]/10";
  if (region.state === "invalid") return "border-[#c58b92] bg-[#c58b92]/10";
  if (region.state === "detected") return "border-[#d9b26a] bg-[#d9b26a]/15";
  if (region.state === "indeterminate") return "border-[#d9b26a] border-dashed";
  return "border-[#c9b7d9]/80";
}

/** Assay capture with KAIA Vision region overlays. Image is fetched via a short-lived signed URL. */
export function AssayViewer({ analysis, scanning = false, className }: { analysis: Analysis; scanning?: boolean; className?: string }) {
  const [overlay, setOverlay] = useState(true);
  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative overflow-hidden rounded-card bg-charcoal ring-1 ring-black/10">
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
                  <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-charcoal/85 px-1.5 py-0.5 font-mono text-[10px] text-white">
                    {LINE_LETTER[region.key]} {region.intensity?.toFixed(2)}
                  </span>
                )}
                {!isLine && (
                  <span className="absolute -top-5 left-0 whitespace-nowrap text-[10px] font-medium text-white/80">{region.label}</span>
                )}
              </div>
            );
          })}
        {scanning && (
          <div className="pointer-events-none absolute inset-0">
            <div className="h-1/3 w-full animate-scan bg-gradient-to-b from-transparent via-lavender/40 to-transparent" />
          </div>
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <ScanLine className="size-3.5" /> {analysis.regions.length} regions · {analysis.model_version}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setOverlay((v) => !v)}>
          {overlay ? <EyeOff /> : <Eye />} {overlay ? "Hide overlay" : "Show overlay"}
        </Button>
      </div>
    </div>
  );
}
