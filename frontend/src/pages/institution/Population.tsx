/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "@tanstack/react-query";
import { Download, Radar } from "lucide-react";
import { Link } from "react-router";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { PrivacyNote } from "@/components/kaia/badges";
import { AXIS_TICK, ChartCard, DataTable, LegendItem, TooltipBox, VIZ } from "@/components/kaia/charts";
import { ErrorBlock, LoadingBlock, PageHeader, StatCard } from "@/components/kaia/layout-bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useActiveOrg } from "@/lib/activeOrg";
import { api, apiDownload } from "@/lib/api";
import type { BarangayRow, MonthlyRow, OrgRef, ProgramSummary } from "@/lib/types";
import { cn, formatMonth, num, pct, todayISO } from "@/lib/utils";

type Analytics = { organization: OrgRef; summary: ProgramSummary; barangays: BarangayRow[]; monthly: MonthlyRow[]; privacy_note: string };
type Funnel = { funnel: { key: string; label: string; value: number; pct_of_eligible: number | null; conversion_from_previous: number | null }[] };

const GAP_MARGIN = 0.15;

export default function Population() {
  const { orgId } = useActiveOrg();
  const analytics = useQuery({
    queryKey: ["analytics", orgId],
    queryFn: () => api<Analytics>(`/organizations/${orgId}/analytics`),
    enabled: !!orgId,
    refetchInterval: 15_000,
  });
  const funnel = useQuery({
    queryKey: ["funnel", orgId],
    queryFn: () => api<Funnel>(`/organizations/${orgId}/screening-funnel`),
    enabled: !!orgId,
    refetchInterval: 15_000,
  });

  if (!orgId || analytics.isLoading || funnel.isLoading) return <LoadingBlock label="Loading program analytics…" />;
  if (analytics.error || !analytics.data) return <ErrorBlock error={analytics.error} onRetry={analytics.refetch} />;
  if (funnel.error || !funnel.data) return <ErrorBlock error={funnel.error} onRetry={funnel.refetch} />;

  const { summary: s, barangays, monthly, privacy_note } = analytics.data;
  const cityAvg = s.participation_rate ?? 0;
  const coverage = [...barangays]
    .filter((b) => b.eligible_population > 0)
    .sort((a, b) => (b.coverage_rate ?? 0) - (a.coverage_rate ?? 0))
    .map((b) => ({ ...b, coverage: b.coverage_rate ?? 0, flagged: (b.coverage_rate ?? 0) < cityAvg - GAP_MARGIN }));
  // Small-cell suppression keeps rates honest and non-identifying: a rate over 1–4 women is not plotted.
  const months = monthly.map((m) => ({
    ...m,
    label: formatMonth(m.month),
    completion: m.follow_up_required >= 5 && m.referral_completion_rate !== null ? Math.round(m.referral_completion_rate * 100) : null,
    avg_days_to_follow_up: m.follow_up_completed >= 3 ? m.avg_days_to_follow_up : null,
  }));
  const funnelData = funnel.data.funnel.map((f, i) => ({ ...f, fill: VIZ.ordinal[i] }));

  async function exportCsv() {
    try {
      await apiDownload(`/organizations/${orgId}/reports/aggregate.csv`, `kaia-aggregate-${todayISO()}.csv`);
      toast.success("Aggregate report exported (small cells suppressed)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  }

  const tiles: [string, number, string?][] = [
    ["Eligible population", s.eligible_population],
    ["Kits distributed", s.kits_distributed],
    ["Samples returned", s.samples_returned],
    ["Valid screenings", s.valid_screenings],
    ["Follow-up required", s.follow_up_required, "text-warning"],
    ["Follow-up completed", s.follow_up_completed, "text-success"],
    ["Unresolved", s.unresolved, "text-priority"],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="KAIA Population"
        title="Population Health"
        description="Understand where screening programs are succeeding — and where women are being lost."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/institution/care-gaps">
                <Radar /> Care gaps
              </Link>
            </Button>
            <Button onClick={exportCsv}>
              <Download /> Export aggregate report
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {tiles.map(([label, value, accent], i) => (
          <StatCard
            key={label}
            label={label}
            value={<span className={cn(accent)}>{num(value)}</span>}
            className={i === tiles.length - 1 ? "col-span-2 md:col-span-1" : undefined}
          />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard
          title="Screening funnel"
          subtitle="Eligible → kit distributed → screened → follow-up required → follow-up completed"
          table={
            <DataTable
              columns={["Stage", "Count", "% of eligible", "From previous"]}
              rows={funnelData.map((f) => [f.label, num(f.value), pct(f.pct_of_eligible, 1), pct(f.conversion_from_previous, 1)])}
            />
          }
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={funnelData} layout="vertical" margin={{ top: 4, right: 96, left: 8, bottom: 4 }} barCategoryGap={10}>
              <CartesianGrid horizontal={false} stroke={VIZ.grid} />
              <XAxis type="number" tick={AXIS_TICK} axisLine={{ stroke: VIZ.axis }} tickLine={false} tickFormatter={(v) => num(v)} />
              <YAxis type="category" dataKey="label" width={128} tick={{ ...AXIS_TICK, fill: VIZ.ink, fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "rgba(94,39,80,0.05)" }}
                content={({ active, payload }: any) =>
                  active && payload?.length ? (
                    <TooltipBox
                      title={payload[0].payload.label}
                      rows={[
                        { color: payload[0].payload.fill, label: "women", value: num(payload[0].payload.value) },
                        { color: "transparent", label: "of eligible", value: pct(payload[0].payload.pct_of_eligible, 1) },
                      ]}
                    />
                  ) : null
                }
              />
              <Bar dataKey="value" barSize={22} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                {funnelData.map((f) => (
                  <Cell key={f.key} fill={f.fill} />
                ))}
                <LabelList
                  dataKey="value"
                  content={(p: any) => (
                    <text x={p.x + p.width + 8} y={p.y + p.height / 2} dominantBaseline="middle" fontSize={12} fill={VIZ.ink} fontWeight={600}>
                      {num(p.value)}
                      <tspan fill={VIZ.tick} fontWeight={400}>{`  ${pct(funnelData[p.index]?.pct_of_eligible, 1)}`}</tspan>
                    </text>
                  )}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Screening coverage by barangay"
          subtitle={`Valid screenings ÷ eligible women · city average ${pct(cityAvg)} · highlighted barangays are more than 15 points below`}
          legend={
            <>
              <LegendItem color={VIZ.series1} label="Coverage gap" />
              <LegendItem color={VIZ.muted} label="Within range" />
              <LegendItem color={VIZ.ink} label="City average" kind="line" />
            </>
          }
          table={
            <DataTable
              columns={["Barangay", "Eligible", "Screened", "Coverage"]}
              rows={coverage.map((b) => [b.barangay, num(b.eligible_population), num(b.valid_screenings), pct(b.coverage_rate)])}
            />
          }
        >
          <ResponsiveContainer width="100%" height={Math.max(260, coverage.length * 26 + 40)}>
            <BarChart data={coverage} layout="vertical" margin={{ top: 16, right: 40, left: 8, bottom: 4 }} barCategoryGap={4}>
              <CartesianGrid horizontal={false} stroke={VIZ.grid} />
              <XAxis type="number" domain={[0, 1]} tick={AXIS_TICK} axisLine={{ stroke: VIZ.axis }} tickLine={false} tickFormatter={(v) => pct(v)} />
              <YAxis type="category" dataKey="barangay" width={120} tick={{ ...AXIS_TICK, fill: VIZ.ink, fontSize: 12 }} axisLine={false} tickLine={false} />
              <ReferenceLine x={cityAvg} stroke={VIZ.ink} strokeWidth={1} label={{ value: `City ${pct(cityAvg)}`, position: "top", fontSize: 11, fill: VIZ.ink }} />
              <Tooltip
                cursor={{ fill: "rgba(94,39,80,0.05)" }}
                content={({ active, payload }: any) =>
                  active && payload?.length ? (
                    <TooltipBox
                      title={payload[0].payload.barangay}
                      rows={[
                        { color: payload[0].payload.flagged ? VIZ.series1 : VIZ.muted, label: "coverage", value: pct(payload[0].payload.coverage) },
                        { color: "transparent", label: "screened", value: `${num(payload[0].payload.valid_screenings)} / ${num(payload[0].payload.eligible_population)}` },
                      ]}
                    />
                  ) : null
                }
              />
              <Bar dataKey="coverage" barSize={16} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                {coverage.map((b) => (
                  <Cell key={b.barangay_id} fill={b.flagged ? VIZ.series1 : VIZ.muted} />
                ))}
                <LabelList
                  dataKey="coverage"
                  content={(p: any) =>
                    coverage[p.index]?.flagged ? (
                      <text x={p.x + p.width + 6} y={p.y + p.height / 2} dominantBaseline="middle" fontSize={11} fontWeight={600} fill={VIZ.ink}>
                        {pct(p.value)}
                      </text>
                    ) : null
                  }
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Referral completion rate"
          subtitle="Share of women needing follow-up who completed care, by month of result · recent months are still in progress"
          table={
            <DataTable
              columns={["Month", "Required", "Completed", "Rate"]}
              rows={months.map((m) => [m.label, m.follow_up_required, m.follow_up_completed, m.completion !== null ? `${m.completion}%` : "—"])}
            />
          }
        >
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={months} margin={{ top: 12, right: 44, left: -8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={VIZ.grid} />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: VIZ.axis }} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                cursor={{ stroke: VIZ.axis, strokeWidth: 1 }}
                content={({ active, payload, label }: any) =>
                  active && payload?.length ? (
                    <TooltipBox
                      title={label}
                      rows={[
                        { color: VIZ.series1, label: "completed", value: payload[0].value !== null ? `${payload[0].value}%` : "—" },
                        { color: "transparent", label: "required", value: String(payload[0].payload.follow_up_required) },
                      ]}
                    />
                  ) : null
                }
              />
              <Line
                type="linear"
                dataKey="completion"
                stroke={VIZ.series1}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, stroke: "#ffffff", strokeWidth: 2 }}
                connectNulls
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="completion"
                  content={(p: any) =>
                    p.index === months.length - 1 && p.value !== null ? (
                      <text x={p.x + 8} y={p.y} dominantBaseline="middle" fontSize={11} fontWeight={600} fill={VIZ.ink}>
                        {p.value}%
                      </text>
                    ) : null
                  }
                />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Average time to follow-up"
          subtitle={`Days from result to completed follow-up, by month of result · program average ${s.avg_days_to_follow_up ?? "—"} days`}
          table={
            <DataTable
              columns={["Month", "Completed", "Avg. days"]}
              rows={months.map((m) => [m.label, m.follow_up_completed, m.avg_days_to_follow_up ?? "—"])}
            />
          }
        >
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={months} margin={{ top: 12, right: 44, left: -8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={VIZ.grid} />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: VIZ.axis }} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                cursor={{ stroke: VIZ.axis, strokeWidth: 1 }}
                content={({ active, payload, label }: any) =>
                  active && payload?.length ? (
                    <TooltipBox title={label} rows={[{ color: VIZ.series1, label: "days on average", value: payload[0].value ?? "—" }]} />
                  ) : null
                }
              />
              <Line
                type="linear"
                dataKey="avg_days_to_follow_up"
                stroke={VIZ.series1}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, stroke: "#ffffff", strokeWidth: 2 }}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Screening activity over time"
          subtitle="Valid screenings released per month"
          table={<DataTable columns={["Month", "Kits distributed", "Valid screenings"]} rows={months.map((m) => [m.label, m.kits_distributed, m.valid_screenings])} />}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={months} margin={{ top: 16, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={VIZ.grid} />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: VIZ.axis }} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "rgba(94,39,80,0.05)" }}
                content={({ active, payload, label }: any) =>
                  active && payload?.length ? <TooltipBox title={label} rows={[{ color: VIZ.series1, label: "valid screenings", value: num(payload[0].value) }]} /> : null
                }
              />
              <Bar dataKey="valid_screenings" fill={VIZ.series1} barSize={18} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Follow-up required vs completed"
          subtitle="By month of screening result"
          legend={
            <>
              <LegendItem color={VIZ.series1} label="Follow-up required" />
              <LegendItem color={VIZ.series2} label="Follow-up completed" />
            </>
          }
          table={
            <DataTable columns={["Month", "Required", "Completed"]} rows={months.map((m) => [m.label, m.follow_up_required, m.follow_up_completed])} />
          }
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={months} margin={{ top: 16, right: 8, left: -8, bottom: 0 }} barGap={2}>
              <CartesianGrid vertical={false} stroke={VIZ.grid} />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: VIZ.axis }} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "rgba(94,39,80,0.05)" }}
                content={({ active, payload, label }: any) =>
                  active && payload?.length ? (
                    <TooltipBox
                      title={label}
                      rows={[
                        { color: VIZ.series1, label: "required", value: String(payload[0].payload.follow_up_required) },
                        { color: VIZ.series2, label: "completed", value: String(payload[0].payload.follow_up_completed) },
                      ]}
                    />
                  ) : null
                }
              />
              <Bar dataKey="follow_up_required" fill={VIZ.series1} barSize={9} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="follow_up_completed" fill={VIZ.series2} barSize={9} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <Card className="p-5 sm:p-6">
        <h3 className="font-semibold text-foreground">Barangay breakdown</h3>
        <p className="mb-4 mt-0.5 text-xs text-muted-foreground">De-identified counts and rates by barangay</p>
        <div className="overflow-x-auto">
          <DataTable
            columns={["Barangay", "Eligible", "Kits", "Returned", "Screened", "Coverage", "Follow-up req.", "Completed", "Completion", "Avg. days"]}
            rows={barangays.map((b) => [
              b.barangay,
              num(b.eligible_population),
              num(b.kits_distributed),
              num(b.samples_returned),
              num(b.valid_screenings),
              pct(b.coverage_rate),
              b.follow_up_required,
              b.follow_up_completed,
              pct(b.follow_up_completion_rate),
              b.avg_days_to_follow_up ?? "—",
            ])}
          />
        </div>
      </Card>

      <PrivacyNote>{privacy_note}</PrivacyNote>
    </div>
  );
}
