import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { OrgRef } from "@/lib/types";

const KEY = "kaia.activeOrg";
const listeners = new Set<() => void>();
let current: string | null = (() => {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
})();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function selectOrg(id: string) {
  current = id;
  try {
    sessionStorage.setItem(KEY, id);
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}

/** Institution admins are pinned to their organization; system admins can switch. */
export function useActiveOrg() {
  const { user } = useAuth();
  const selected = useSyncExternalStore(subscribe, () => current);
  const isSystemAdmin = user?.role === "system_admin";
  const { data: orgs = [] } = useQuery({
    queryKey: ["organizations"],
    queryFn: () => api<OrgRef[]>("/organizations"),
    enabled: user?.role === "institution_admin" || isSystemAdmin,
    staleTime: 5 * 60_000,
  });
  let orgId: string | undefined;
  if (isSystemAdmin) {
    orgId = selected && orgs.some((o) => o.id === selected) ? selected : (orgs.find((o) => o.org_type === "lgu_health_office") ?? orgs[0])?.id;
  } else {
    orgId = user?.organization?.id;
  }
  const org = orgs.find((o) => o.id === orgId) ?? user?.organization ?? undefined;
  return { orgId, org, orgs, canSwitch: isSystemAdmin, select: selectOrg };
}
