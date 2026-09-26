import { Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import Overview from "@/pages/Overview";
import LiveMonitor from "@/pages/LiveMonitor";
import Drowsiness from "@/pages/Drowsiness";
import TripPlanner from "@/pages/TripPlanner";
import RestManagement from "@/pages/RestManagement";
import AlertsPage from "@/pages/Alerts";
import HistoryPage from "@/pages/HistoryPage";
import SleepRecovery from "@/pages/SleepRecovery";
import Reports from "@/pages/Reports";
import SettingsPage from "@/pages/Settings";
import NotFound from "@/pages/NotFound";
import Register from "@/pages/Register";
import Login from "@/pages/Login";
import DatabaseRequired from "@/pages/DatabaseRequired";
import HomePage from "@/pages/HomePage";
import { useAuthSession } from "@/lib/auth";
import { SmartSenseProvider } from "@/lib/smartsense";

function AuthLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">
      <div className="glass-panel flex items-center gap-3 rounded-2xl px-5 py-4 shadow-[var(--shadow-soft-lg)]">
        <Loader2 size={20} className="animate-spin text-primary" />
        <span className="text-sm font-medium">Loading SmartSense…</span>
      </div>
    </div>
  );
}

export default function App() {
  const { status } = useAuthSession();

  // Resolving whatever session (if any) the browser already has.
  if (status === "loading") return <AuthLoading />;

  // No Supabase project connected at all:
  // Root "/" always serves the redesigned Homepage!
  // Auth/dashboard routes show DatabaseRequired.
  if (status === "unconfigured") {
    return (
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/overview" element={<DatabaseRequired />} />
        <Route path="/dashboard" element={<DatabaseRequired />} />
        <Route path="/login" element={<DatabaseRequired />} />
        <Route path="/register" element={<DatabaseRequired />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // Not signed in:
  // Root "/" serves the redesigned HomePage!
  // /login and /register serve their auth forms.
  // /overview and /dashboard redirect to /login.
  if (status === "signed-out") {
    return (
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/overview" element={<Navigate to="/login" replace />} />
        <Route path="/dashboard" element={<Navigate to="/login" replace />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // Signed in:
  // Root "/" serves the redesigned HomePage.
  // /overview and /dashboard serve the driver dashboard Overview.
  // All other routes remain completely functional and protected.
  return (
    <SmartSenseProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/overview" element={<Overview />} />
        <Route path="/dashboard" element={<Navigate to="/overview" replace />} />
        <Route path="/live-monitor" element={<LiveMonitor />} />
        <Route path="/drowsiness" element={<Drowsiness />} />
        <Route path="/trip-planner" element={<TripPlanner />} />
        <Route path="/rest" element={<RestManagement />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/sleep-recovery" element={<SleepRecovery />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/login" element={<Navigate to="/overview" replace />} />
        <Route path="/register" element={<Navigate to="/overview" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </SmartSenseProvider>
  );
}
