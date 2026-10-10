/**
 * Minimal API client.
 * - Access token lives in memory only (never localStorage).
 * - Refresh token is an httpOnly cookie handled by the browser; on 401 we refresh once and retry.
 * - Never logs request/response bodies (they may contain health data).
 */
import type { AuthSession } from "@/lib/types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let accessToken: string | null = null;
let refreshInFlight: Promise<AuthSession | null> | null = null;
let sessionExpiredHandler: (() => void) | null = null;

export const session = {
  token: () => accessToken,
  setToken: (token: string | null) => {
    accessToken = token;
  },
  onExpired: (handler: () => void) => {
    sessionExpiredHandler = handler;
  },
};

export function refreshSession(): Promise<AuthSession | null> {
  if (!refreshInFlight) {
    refreshInFlight = fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok || res.status === 204) return null;
        const data = (await res.json()) as AuthSession;
        accessToken = data.access_token;
        return data;
      })
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

function errorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((d) => {
          const item = d as { msg?: string; loc?: (string | number)[] };
          const field = item.loc?.filter((l) => l !== "body").join(".");
          return field ? `${field}: ${item.msg}` : item.msg;
        })
        .join("; ");
    }
  }
  if (status === 403) return "You don't have access to this information.";
  if (status >= 500) return "Something went wrong on our side. Please try again.";
  return "Request failed";
}

type Options = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
};

async function request(path: string, { method = "GET", body, signal }: Options): Promise<Response> {
  const run = () =>
    fetch(`/api${path}`, {
      method,
      signal,
      credentials: "same-origin",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res = await run();
  if (res.status === 401 && !path.startsWith("/auth/")) {
    const refreshed = await refreshSession();
    if (refreshed) {
      res = await run();
    } else {
      accessToken = null;
      sessionExpiredHandler?.();
    }
  }
  if (!res.ok) {
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, errorMessage(payload, res.status));
  }
  return res;
}

type MockHandler = (path: string, options: Options) => unknown;
let mockHandler: MockHandler | null = null;

/** Dev-only (TEMP, for the /ui-test playground): answer api() calls from mock data instead of the network. */
export function setApiMock(handler: MockHandler | null) {
  if (import.meta.env.DEV) mockHandler = handler;
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  if (mockHandler) return (await mockHandler(path, options)) as T;
  const res = await request(path, options);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function apiDownload(path: string, filename: string): Promise<void> {
  const res = await request(path, {});
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
