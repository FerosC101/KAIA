import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, refreshSession, session } from "@/lib/api";
import type { AuthSession, Role, User } from "@/lib/types";

type Status = "loading" | "authenticated" | "anonymous";

type RegisterInput = {
  email: string;
  password: string;
  full_name: string;
  birth_date: string;
  phone?: string | null;
  barangay_id?: string | null;
  privacy_notice_accepted: true;
};

type AuthContextValue = {
  user: User | null;
  status: Status;
  login: (email: string, password: string) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const ROLE_HOME: Record<Role, string> = {
  patient: "/app",
  health_worker: "/portal",
  institution_admin: "/institution",
  system_admin: "/admin",
};

export const ROLE_LABEL: Record<Role, string> = {
  patient: "Patient",
  health_worker: "Health worker",
  institution_admin: "Institution admin",
  system_admin: "KAIA system admin",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  const clear = useCallback(() => {
    session.setToken(null);
    queryClient.clear();
    setUser(null);
    setStatus("anonymous");
  }, [queryClient]);

  useEffect(() => {
    session.onExpired(clear);
    refreshSession().then((s) => {
      if (s) {
        setUser(s.user);
        setStatus("authenticated");
      } else {
        setStatus("anonymous");
      }
    });
  }, [clear]);

  const accept = useCallback(
    (s: AuthSession) => {
      queryClient.clear();
      session.setToken(s.access_token);
      setUser(s.user);
      setStatus("authenticated");
      return s.user;
    },
    [queryClient],
  );

  const login = useCallback(
    async (email: string, password: string) =>
      accept(await api<AuthSession>("/auth/login", { method: "POST", body: { email, password } })),
    [accept],
  );

  const register = useCallback(
    async (input: RegisterInput) => accept(await api<AuthSession>("/auth/register", { method: "POST", body: input })),
    [accept],
  );

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      clear();
    }
  }, [clear]);

  const value = useMemo(() => ({ user, status, login, register, logout }), [user, status, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
