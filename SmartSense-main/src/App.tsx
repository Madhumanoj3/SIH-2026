import { Routes, Route, Navigate } from "react-router-dom";
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
import HomePage from "@/pages/HomePage";
import { SmartSenseProvider } from "@/lib/smartsense";

// Evaluation deployment: the dashboard never gates on Supabase auth status
// (no sign-in, no account, no dependency on whichever database happens to
// be configured — or not — for this deploy). Root "/" serves the Homepage;
// every dashboard route, plus /login and /register, all lead straight into
// the driver dashboard. SmartSenseProvider runs entirely on its own local
// reducer/simulated data either way — any Supabase writes deeper in the app
// (see dbSession.ts) already no-op safely when there's no real session.
export default function App() {
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
