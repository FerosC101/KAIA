import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { useState } from "react";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader } from "@/components/kaia/layout-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { api } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

type Log = {
  id: string;
  timestamp: string;
  user: string;
  role: Role | "system";
  institution: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  subject: string | null;
  ip_address: string | null;
  detail: Record<string, unknown>;
};

const ACTION_GROUPS = ["auth", "screening", "reader", "assay", "referral", "followup", "care", "consent", "passport", "analytics", "inventory", "staff", "risk_rule", "model", "user", "organization"];

export default function AuditLogs() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["audit-logs", action, page],
    queryFn: () => api<{ total: number; items: Log[] }>(`/audit-logs?page=${page}&page_size=${pageSize}${action ? `&action=${action}` : ""}`),
    placeholderData: keepPreviousData,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <div>
      <PageHeader
        eyebrow="Accountability"
        title="Audit log"
        description="Every access to patient data records the user, institution, action, resource and time. Health values are never written to the log."
        actions={
          <Select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            className="h-10 w-52"
          >
            <option value="">All actions</option>
            {ACTION_GROUPS.map((a) => (
              <option key={a} value={a}>
                {a.replace("_", " ")}
              </option>
            ))}
          </Select>
        }
      />
      {isLoading ? (
        <LoadingBlock />
      ) : error || !data ? (
        <ErrorBlock error={error} onRetry={refetch} />
      ) : data.items.length === 0 ? (
        <EmptyState icon={<ScrollText />} title="No audit events" />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH>Timestamp</TH>
                <TH>User</TH>
                <TH>Institution</TH>
                <TH>Action</TH>
                <TH>Resource</TH>
                <TH>Subject</TH>
                <TH>IP</TH>
              </TR>
            </THead>
            <TBody className={isFetching ? "opacity-60" : undefined}>
              {data.items.map((log) => (
                <TR key={log.id}>
                  <TD className="tabular text-xs text-muted-foreground">{formatDateTime(log.timestamp)}</TD>
                  <TD>
                    <p className="text-sm font-medium text-foreground">{log.user}</p>
                    <p className="text-xs text-muted-foreground">{log.role === "system" ? "System" : ROLE_LABEL[log.role]}</p>
                  </TD>
                  <TD className="text-sm">{log.institution ?? "—"}</TD>
                  <TD>
                    <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{log.action}</code>
                  </TD>
                  <TD className="text-xs text-muted-foreground">
                    {log.resource_type}
                    {log.resource_id && <span className="block font-mono text-[11px] text-subtle">{log.resource_id.slice(0, 8)}…</span>}
                  </TD>
                  <TD>{log.subject ? <Badge tone="plum">Patient record</Badge> : <span className="text-subtle">—</span>}</TD>
                  <TD className="font-mono text-xs text-muted-foreground">{log.ip_address ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm text-muted-foreground">
            <span>
              {data.total.toLocaleString()} events · page {page} of {pages}
            </span>
            <div className="flex gap-2">
              <Button size="icon-sm" variant="outline" onClick={() => setPage((p) => p - 1)} disabled={page <= 1} aria-label="Previous page">
                <ChevronLeft />
              </Button>
              <Button size="icon-sm" variant="outline" onClick={() => setPage((p) => p + 1)} disabled={page >= pages} aria-label="Next page">
                <ChevronRight />
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
