import { Table2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * KAIA chart palette — derived from the brand ramps and validated against the warm
 * surface (categorical pair passes lightness, chroma, CVD and contrast checks; the
 * lavender→plum ordinal ramp passes monotone-lightness and light-end contrast).
 */
export const VIZ = {
  series1: "#85367a", // plum family — primary series
  series2: "#117f58", // green family — completion / second series
  ordinal: ["#bda7cf", "#a88cbe", "#8e6ba6", "#6d4a82", "#4b2848"],
  muted: "#8b8579", // de-emphasis (always paired with a table view)
  grid: "#ece5da",
  axis: "#ded5c7",
  tick: "#6b7280",
  ink: "#1f2937",
};

export const AXIS_TICK = { fill: VIZ.tick, fontSize: 11 };

export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  children,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  legend?: ReactNode;
  table: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <Card className={cn("p-5 sm:p-6", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>}
        </div>
        <button
          onClick={() => setShowTable((v) => !v)}
          className={cn(
            "flex min-h-9 shrink-0 items-center gap-1.5 rounded-[0.5rem] px-2.5 text-xs font-medium transition-colors duration-200",
            showTable ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-muted",
          )}
          aria-pressed={showTable}
        >
          <Table2 className="size-3.5" /> Table
        </button>
      </div>
      {legend && !showTable && <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">{legend}</div>}
      {showTable ? <div className="max-h-80 overflow-auto">{table}</div> : children}
    </Card>
  );
}

export function LegendItem({ color, label, kind = "rect" }: { color: string; label: string; kind?: "rect" | "line" }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={kind === "rect" ? "size-2.5 rounded-sm" : "h-0.5 w-4 rounded-full"} style={{ background: color }} />
      {label}
    </span>
  );
}

type TooltipRow = { color: string; label: string; value: string };

/** Values lead, labels follow; each series keyed by a short line in its colour. */
export function TooltipBox({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="min-w-40 rounded-field border border-border bg-surface px-3 py-2.5 shadow-lift">
      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">{title}</p>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2 py-0.5">
          <span className="h-0.5 w-3 rounded-full" style={{ background: row.color }} />
          <span className="tabular text-sm font-semibold text-foreground">{row.value}</span>
          <span className="text-xs text-muted-foreground">{row.label}</span>
        </div>
      ))}
    </div>
  );
}

export function DataTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border">
          {columns.map((c, i) => (
            <th
              key={c}
              className={cn(
                "py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground",
                i === 0 ? "text-left" : "text-right",
              )}
            >
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, r) => (
          <tr key={r} className="border-b border-border/60 last:border-0">
            {row.map((cell, i) => (
              <td key={i} className={cn("py-2.5", i === 0 ? "text-left text-foreground" : "tabular text-right text-muted-foreground")}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
