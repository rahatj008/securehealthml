"use client";

import { useEffect, useState } from "react";
import AppShell from "../../components/AppShell";
import { apiFetch } from "../../lib/api";
import { useAuthGuard } from "../../lib/auth";

type AnomalyEvent = {
  id: string;
  score: number;
  email: string | null;
  filename: string | null;
  created_at: string;
};

export default function AnomalyLogsPage() {
  const { token, user, ready, logout } = useAuthGuard("admin");
  const [events, setEvents] = useState<AnomalyEvent[]>([]);

  useEffect(() => {
    if (!token) return;
    apiFetch("/admin/logs/anomalies", token)
      .then((data) => setEvents(data.events || []))
      .catch(() => null);
  }, [token]);

  if (!ready || !user) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading...</div>;
  }

  return (
    <AppShell
      title="SecurHealth ML"
      subtitle="Administrator Security Console"
      userName={user.full_name || user.email}
      userMeta={`Admin • Clearance ${user.clearance}`}
      onLogout={logout}
      nav={[
        { label: "Dashboard", href: "/admin/dashboard" },
        { label: "Audit Logs", href: "/admin/audit-logs" },
        { label: "Anomaly Logs", href: "/admin/anomaly-logs" },
        { label: "Auth Logs", href: "/admin/auth-logs" },
        { label: "File Transfers", href: "/admin/file-transfers" },
      ]}
    >
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-lg font-semibold">Anomaly Events</p>
        <p className="text-sm text-slate-500">XGBoost detections with confidence scoring.</p>

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Time</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-500">{event.email || "Unknown"}</td>
                  <td className="px-4 py-3 text-slate-500">{event.filename || "-"}</td>
                  <td className="px-4 py-3 font-semibold text-rose-500">{event.score.toFixed(2)}</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(event.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
