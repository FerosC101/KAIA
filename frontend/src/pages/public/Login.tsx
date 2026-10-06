import { ArrowRight, Loader2, LockKeyhole } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/components/kaia/DemoGuide";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { ROLE_HOME, useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { AuthShell } from "@/pages/public/AuthShell";

function safeNext(next: string | null, role: Role): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return ROLE_HOME[role];
  const allowed = ROLE_HOME[role];
  if (role === "system_admin" && next.startsWith("/institution")) return next;
  return next.startsWith(allowed) ? next : allowed;
}

export default function Login() {
  const { user, status, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (status === "authenticated" && user && !submitting) return <Navigate to={safeNext(params.get("next"), user.role)} replace />;

  async function signIn(e: string, p: string) {
    setSubmitting(true);
    try {
      const u = await login(e, p);
      navigate(safeNext(params.get("next"), u.role), { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
      setSubmitting(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void signIn(email, password);
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your KAIA account."
      aside={<p className="text-xs text-white/50">Prototype environment · synthetic data only · not for clinical use</p>}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : <LockKeyhole />} Sign in
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        New to KAIA?{" "}
        <Link to="/register" className="font-semibold text-primary">
          Create an account
        </Link>
      </p>

      <div className="mt-10 rounded-card border border-border bg-surface p-4">
        <p className="px-1 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Demo accounts</p>
        <p className="mt-1 px-1 text-xs text-muted-foreground">
          Synthetic users · password <code className="rounded bg-muted px-1 font-mono">{DEMO_PASSWORD}</code>
        </p>
        <div className="mt-3 grid gap-1.5">
          {Object.values(DEMO_ACCOUNTS).map((account) => (
            <button
              key={account.email}
              type="button"
              disabled={submitting}
              onClick={() => signIn(account.email, DEMO_PASSWORD)}
              className="group flex items-center justify-between gap-3 rounded-btn px-3 py-2.5 text-left transition-colors duration-200 hover:bg-muted"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{account.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{account.role}</span>
              </span>
              <ArrowRight className="size-4 text-subtle transition group-hover:translate-x-0.5 group-hover:text-primary" />
            </button>
          ))}
        </div>
      </div>
    </AuthShell>
  );
}
