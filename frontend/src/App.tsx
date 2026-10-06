import { Loader2 } from "lucide-react";
import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { PatientLayout } from "@/layouts/PatientLayout";
import { PortalLayout } from "@/layouts/PortalLayout";
import { ROLE_HOME, useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";

const Landing = lazy(() => import("@/pages/public/Landing"));
const Login = lazy(() => import("@/pages/public/Login"));
const Register = lazy(() => import("@/pages/public/Register"));
const NotFound = lazy(() => import("@/pages/public/NotFound"));

const PatientHome = lazy(() => import("@/pages/patient/Home"));
const RegisterKit = lazy(() => import("@/pages/patient/RegisterKit"));
const Result = lazy(() => import("@/pages/patient/Result"));
const Care = lazy(() => import("@/pages/patient/Care"));
const PatientReferral = lazy(() => import("@/pages/patient/ReferralView"));
const Passport = lazy(() => import("@/pages/patient/Passport"));
const Privacy = lazy(() => import("@/pages/patient/Privacy"));

const WorkerDashboard = lazy(() => import("@/pages/worker/Dashboard"));
const ScreeningDetail = lazy(() => import("@/pages/worker/ScreeningDetail"));
const Readers = lazy(() => import("@/pages/worker/Readers"));
const ReaderConsole = lazy(() => import("@/pages/worker/ReaderConsole"));
const Vision = lazy(() => import("@/pages/worker/Vision"));
const Referrals = lazy(() => import("@/pages/worker/Referrals"));
const ReferralDetail = lazy(() => import("@/pages/worker/ReferralDetail"));
const ReferralScan = lazy(() => import("@/pages/worker/ReferralScan"));
const FollowUps = lazy(() => import("@/pages/worker/FollowUps"));

const Overview = lazy(() => import("@/pages/institution/Overview"));
const Population = lazy(() => import("@/pages/institution/Population"));
const CareGaps = lazy(() => import("@/pages/institution/CareGaps"));
const Unresolved = lazy(() => import("@/pages/institution/UnresolvedFollowUps"));
const Inventory = lazy(() => import("@/pages/institution/Inventory"));
const Staff = lazy(() => import("@/pages/institution/Staff"));
const Devices = lazy(() => import("@/pages/institution/Devices"));
const AuditLogs = lazy(() => import("@/pages/shared/AuditLogs"));

const SystemHealth = lazy(() => import("@/pages/admin/SystemHealth"));
const Organizations = lazy(() => import("@/pages/admin/Organizations"));
const Users = lazy(() => import("@/pages/admin/Users"));
const AdminReaders = lazy(() => import("@/pages/admin/AdminReaders"));
const Cartridges = lazy(() => import("@/pages/admin/Cartridges"));
const Models = lazy(() => import("@/pages/admin/Models"));
const RiskEngine = lazy(() => import("@/pages/admin/RiskEngine"));

function FullPageSpinner() {
  return (
    <div className="grid min-h-[60dvh] place-items-center text-muted-foreground">
      <Loader2 className="size-6 animate-spin" />
    </div>
  );
}

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <FullPageSpinner />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (!roles.includes(user.role)) return <Navigate to={ROLE_HOME[user.role]} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route path="/app" element={<RequireRole roles={["patient"]}><PatientLayout /></RequireRole>}>
          <Route index element={<PatientHome />} />
          <Route path="register-kit" element={<RegisterKit />} />
          <Route path="results/:screeningId" element={<Result />} />
          <Route path="care" element={<Care />} />
          <Route path="care/:screeningId" element={<Care />} />
          <Route path="referrals/:referralId" element={<PatientReferral />} />
          <Route path="passport" element={<Passport />} />
          <Route path="privacy" element={<Privacy />} />
        </Route>

        <Route path="/portal" element={<RequireRole roles={["health_worker"]}><PortalLayout /></RequireRole>}>
          <Route index element={<WorkerDashboard />} />
          <Route path="queue" element={<WorkerDashboard />} />
          <Route path="screenings/:screeningId" element={<ScreeningDetail />} />
          <Route path="readers" element={<Readers />} />
          <Route path="readers/:readerCode" element={<ReaderConsole />} />
          <Route path="vision/:screeningId" element={<Vision />} />
          <Route path="referrals" element={<Referrals />} />
          <Route path="referrals/scan" element={<ReferralScan />} />
          <Route path="referrals/:referralId" element={<ReferralDetail />} />
          <Route path="follow-ups" element={<FollowUps />} />
        </Route>

        <Route path="/institution" element={<RequireRole roles={["institution_admin", "system_admin"]}><PortalLayout /></RequireRole>}>
          <Route index element={<Overview />} />
          <Route path="population" element={<Population />} />
          <Route path="care-gaps" element={<CareGaps />} />
          <Route path="follow-ups" element={<Unresolved />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="staff" element={<Staff />} />
          <Route path="devices" element={<Devices />} />
          <Route path="audit" element={<AuditLogs />} />
        </Route>

        <Route path="/admin" element={<RequireRole roles={["system_admin"]}><PortalLayout /></RequireRole>}>
          <Route index element={<SystemHealth />} />
          <Route path="organizations" element={<Organizations />} />
          <Route path="users" element={<Users />} />
          <Route path="readers" element={<AdminReaders />} />
          <Route path="cartridges" element={<Cartridges />} />
          <Route path="models" element={<Models />} />
          <Route path="risk-engine" element={<RiskEngine />} />
          <Route path="audit" element={<AuditLogs />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
