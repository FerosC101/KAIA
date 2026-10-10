import { useQuery } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AuthShell } from "@/pages/public/AuthShell";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const { data: barangays = [] } = useQuery({
    queryKey: ["public-barangays"],
    queryFn: () => api<{ id: string; name: string; city: string }[]>("/public/barangays"),
  });
  const [form, setForm] = useState({ full_name: "", email: "", birth_date: "", phone: "", barangay_id: "", password: "" });
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!accepted) return toast.error("Please accept the privacy notice to continue");
    setSubmitting(true);
    try {
      await register({
        ...form,
        phone: form.phone || null,
        barangay_id: form.barangay_id || null,
        privacy_notice_accepted: true,
      });
      toast.success("Account created");
      navigate("/app/register-kit", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="Your screening journey, private and in your control.">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Full name" htmlFor="full_name">
          <Input id="full_name" required autoComplete="name" value={form.full_name} onChange={set("full_name")} />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" required autoComplete="email" value={form.email} onChange={set("email")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date of birth" htmlFor="birth_date">
            <Input id="birth_date" type="date" required value={form.birth_date} onChange={set("birth_date")} />
          </Field>
          <Field label="Mobile (optional)" htmlFor="phone">
            <Input id="phone" type="tel" placeholder="+63 9xx xxx xxxx" value={form.phone} onChange={set("phone")} />
          </Field>
        </div>
        <Field label="Barangay (optional)" htmlFor="barangay" hint="Used only for de-identified program statistics.">
          <Select id="barangay" value={form.barangay_id} onChange={set("barangay_id")}>
            <option value="">Prefer not to say</option>
            {barangays.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}, {b.city}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 10 characters with letters and numbers.">
          <Input id="password" type="password" required minLength={10} autoComplete="new-password" value={form.password} onChange={set("password")} />
        </Field>
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-primary-soft/60 p-4 text-sm">
          <Checkbox checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          <span>
            <span className="flex items-center gap-1.5 font-semibold text-foreground">
              <ShieldCheck className="size-4 text-success" /> Privacy notice
            </span>
            <span className="mt-1 block text-muted-foreground">
              KAIA encrypts your personal information, only shares it with facilities you allow, and uses de-identified data for program statistics. You
              can review or revoke access at any time.
            </span>
          </span>
        </label>
        <Button type="submit" size="lg" className="mt-2 w-full rounded-full" disabled={submitting}>
          {submitting && <Loader2 className="animate-spin" />} Create Account
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="font-semibold text-primary">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
