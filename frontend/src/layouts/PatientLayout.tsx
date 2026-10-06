import { BookHeart, HeartHandshake, House, LogOut, ShieldCheck } from "lucide-react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { DemoGuide } from "@/components/kaia/DemoGuide";
import { KaiaLogo } from "@/components/kaia/Logo";
import { NotificationBell } from "@/components/kaia/NotificationBell";
import { UserMenu } from "@/layouts/UserMenu";
import { navItemClass } from "@/layouts/PortalLayout";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/app", label: "Overview", icon: House, end: true },
  { to: "/app/care", label: "Care", icon: HeartHandshake },
  { to: "/app/passport", label: "KAIA Passport", icon: BookHeart },
  { to: "/app/privacy", label: "Privacy", icon: ShieldCheck },
];

/** Patient shell: quiet side rail on desktop, thumb-reachable bottom bar on mobile. */
export function PatientLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh bg-background lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-16 items-center px-5">
          <Link to="/app" aria-label="KAIA home">
            <KaiaLogo />
          </Link>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 py-2">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => navItemClass(isActive)}>
              {({ isActive }) => (
                <>
                  <Icon className={cn("size-[18px]", isActive ? "text-primary" : "text-subtle")} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <div className="px-2 py-2">
            <p className="truncate text-[13px] font-semibold text-foreground">{user?.full_name}</p>
            <p className="truncate text-xs text-muted-foreground">Patient</p>
          </div>
          <button
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
            className="flex min-h-11 w-full items-center gap-3 rounded-btn px-3 text-sm text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-[18px] text-subtle" /> Sign out
          </button>
        </div>
      </aside>

      <header
        className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4 lg:max-w-none lg:px-8">
          <Link to="/app" aria-label="KAIA home" className="lg:hidden">
            <KaiaLogo size="sm" />
          </Link>
          <p className="hidden min-w-0 flex-1 truncate text-sm text-muted-foreground lg:block">
            Your screening journey, results and next steps in one place.
          </p>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <span className="lg:hidden">
              <UserMenu />
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-32 pt-6 lg:max-w-5xl lg:px-8 lg:pb-16">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-safe backdrop-blur-md lg:hidden" aria-label="Primary">
        <div className="mx-auto grid max-w-md grid-cols-4 px-2 pt-1.5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn("flex min-h-11 flex-col items-center gap-0.5 rounded-btn py-1.5 text-[11px] font-medium transition-colors duration-200",
                  isActive ? "text-primary" : "text-muted-foreground")
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors duration-200", isActive && "bg-secondary")}>
                    <Icon className="size-5" />
                  </span>
                  {label === "KAIA Passport" ? "Passport" : label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
      <DemoGuide />
    </div>
  );
}
