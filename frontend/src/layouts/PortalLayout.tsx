import {
  Activity,
  BarChart3,
  BrainCircuit,
  Building2,
  ClipboardList,
  Cpu,
  FileSearch,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  QrCode,
  Radar,
  ScrollText,
  Send,
  ServerCog,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { DemoGuide } from "@/components/kaia/DemoGuide";
import { KaiaLogo } from "@/components/kaia/Logo";
import { NotificationBell } from "@/components/kaia/NotificationBell";
import { Select } from "@/components/ui/form";
import { useActiveOrg } from "@/lib/activeOrg";
import { ROLE_LABEL, useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: ComponentType<{ className?: string }>; end?: boolean };
type NavSection = { title: string; items: NavItem[] };

const PROGRAM: NavSection = {
  title: "Program",
  items: [
    { to: "/institution", label: "Overview", icon: LayoutDashboard, end: true },
    { to: "/institution/population", label: "Population Health", icon: BarChart3 },
    { to: "/institution/care-gaps", label: "Care Gaps", icon: Radar },
    { to: "/institution/follow-ups", label: "Care Outcomes", icon: HeartPulse },
  ],
};

const NAV: Record<Role, NavSection[]> = {
  patient: [],
  health_worker: [
    {
      title: "Screening centre",
      items: [
        { to: "/portal", label: "Screening Queue", icon: ClipboardList, end: true },
        { to: "/portal/readers", label: "KAIA Reader", icon: Cpu },
        { to: "/portal/referrals", label: "Referrals", icon: Send },
        { to: "/portal/follow-ups", label: "Follow-ups", icon: Activity },
        { to: "/portal/referrals/scan", label: "Scan Referral", icon: QrCode },
      ],
    },
  ],
  institution_admin: [
    PROGRAM,
    {
      title: "Operations",
      items: [
        { to: "/institution/devices", label: "Readers", icon: Cpu },
        { to: "/institution/inventory", label: "Inventory", icon: Package },
        { to: "/institution/staff", label: "Team", icon: Users },
        { to: "/institution/audit", label: "Reports", icon: ScrollText },
      ],
    },
  ],
  system_admin: [
    {
      title: "Platform",
      items: [
        { to: "/admin", label: "System Health", icon: ServerCog, end: true },
        { to: "/admin/organizations", label: "Organizations", icon: Building2 },
        { to: "/admin/users", label: "Users", icon: Users },
        { to: "/admin/readers", label: "Readers", icon: Cpu },
        { to: "/admin/cartridges", label: "Cartridges", icon: Package },
        { to: "/admin/models", label: "AI Models", icon: BrainCircuit },
        { to: "/admin/risk-engine", label: "Risk Engine", icon: SlidersHorizontal },
        { to: "/admin/audit", label: "Audit Logs", icon: FileSearch },
      ],
    },
    { ...PROGRAM, title: "Program analytics" },
    {
      title: "Operations",
      items: [
        { to: "/institution/devices", label: "Devices", icon: Cpu },
        { to: "/institution/inventory", label: "Inventory", icon: Package },
      ],
    },
  ],
};

export function navItemClass(isActive: boolean) {
  return cn(
    "flex min-h-11 items-center gap-3 rounded-btn px-3 py-2 text-sm transition-colors duration-200",
    isActive ? "bg-secondary font-semibold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { orgs, orgId, canSwitch, select } = useActiveOrg();
  const location = useLocation();
  if (!user) return null;
  const inProgramArea = location.pathname.startsWith("/institution");
  const initials = user.full_name.replace(/^Dr\.\s*/, "").split(" ").map((p) => p[0]).slice(0, 2).join("");

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex h-16 items-center px-5">
        <Link to="/" onClick={onNavigate} aria-label="KAIA home">
          <KaiaLogo />
        </Link>
      </div>

      {canSwitch && inProgramArea && orgs.length > 0 && (
        <div className="px-4 pb-3">
          <label htmlFor="org-switch" className="eyebrow mb-1.5 block">
            Organization
          </label>
          <Select id="org-switch" value={orgId} onChange={(e) => select(e.target.value)} className="h-10 text-[13px]">
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
        {NAV[user.role].map((section) => (
          <div key={section.title}>
            <p className="eyebrow px-3 pb-2">{section.title}</p>
            <ul className="space-y-0.5">
              {section.items.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink to={to} end={end} onClick={onNavigate} className={({ isActive }) => navItemClass(isActive)}>
                    {({ isActive }) => (
                      <>
                        <Icon className={cn("size-[18px]", isActive ? "text-primary" : "text-subtle")} />
                        {label}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-btn px-2 py-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-[13px] font-semibold text-primary">{initials}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-foreground">{user.full_name}</p>
            <p className="truncate text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</p>
          </div>
        </div>
        <button
          onClick={async () => {
            await logout();
            navigate("/login");
          }}
          className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-btn px-3 text-sm text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
        >
          <LogOut className="size-[18px] text-subtle" /> Sign out
        </button>
      </div>
    </div>
  );
}

/** Provider / institution / admin shell: light sidebar + workspace, 1440px max width. */
export function PortalLayout() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { org } = useActiveOrg();
  useEffect(() => setOpen(false), [location.pathname]);

  const context = location.pathname.startsWith("/institution") ? org?.name : (user?.organization?.name ?? "KAIA Platform");

  return (
    <div className="min-h-dvh bg-background lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-border lg:block">
        <Sidebar />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-charcoal/35" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-border shadow-lift">
            <button
              className="absolute right-3 top-4 rounded-[0.5rem] p-2 text-muted-foreground hover:bg-muted"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="flex h-16 items-center gap-3 px-4 lg:px-8">
          <button
            className="grid size-11 place-items-center rounded-btn text-foreground hover:bg-muted lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{context}</p>
            <p className="truncate text-xs text-muted-foreground">Synthetic demo environment · no real patient data</p>
          </div>
          <NotificationBell />
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 pb-24 pt-7 lg:px-8">
        <Outlet />
      </main>
      <DemoGuide />
    </div>
  );
}
