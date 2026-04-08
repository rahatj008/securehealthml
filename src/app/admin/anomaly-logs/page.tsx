"use client";

import { useEffect, useState } from "react";
import AppShell from "../../components/AppShell";
import { apiFetch } from "../../lib/api";
import { useAuthGuard } from "../../lib/auth";
import { adminNav } from "../../lib/nav";

type SecurityEvent = {
  id: string;
  score: number;
  email: string | null;
  filename: string | null;
  created_at: string;
};

export default function AnomalyLogsPage() {
  const { token, user, ready, logout } = useAuthGuard("admin");
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;

    apiFetch<{ events?: SecurityEvent[] }>("/admin/logs/anomalies", token)
      .then((data) => {
        setEvents(data.events || []);
        setError("");
      })
      .catch((err) => setError((err as Error).message || "Failed to load anomaly events."))
      .finally(() => setLoading(false));
  }, [token]);

  if (!ready || !user) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading...</div>;
  }

  return (
    <AppShell
      title="Secured Health Records"
      subtitle="Administrator security console"
      userName={user.full_name || user.email}
      userMeta={`Admin | Clearance ${user.clearance}`}
      onLogout={logout}
      nav={adminNav}
    >
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-lg font-semibold">Anomaly Events</p>
        <p className="text-sm text-slate-500">Behavioral and access anomalies scored by the ML security layer.</p>

        {error ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {error}
          </div>
        ) : null}

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
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                    Loading anomaly events...
                  </td>
                </tr>
              ) : null}

              {!loading && !events.length ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                    No anomaly events have been recorded yet.
                  </td>
                </tr>
              ) : null}

              {events.map((event) => (
                <tr key={event.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-500">{event.email || "Unknown"}</td>
                  <td className="px-4 py-3 text-slate-500">{event.filename || "-"}</td>
                  <td className="px-4 py-3 font-semibold text-rose-500">{Number(event.score).toFixed(2)}</td>
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
