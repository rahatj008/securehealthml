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

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

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
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading...</div>;
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
      <section className="page-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="page-eyebrow text-blue-600">Anomaly events</p>
            <h1 className="page-title">
              Inspect behavioral anomalies surfaced by the security model.
            </h1>
            <p className="page-copy">
              These events capture suspicious patterns around users and file access, with a score attached to each one.
            </p>
          </div>
          <span className="hero-chip bg-amber-50 text-amber-700">ML behavior signals</span>
        </div>
      </section>

      <section className="section-card">
        {error ? (
          <div className="alert-card alert-warning">{error}</div>
        ) : null}

        <div className="mt-5 space-y-3 md:hidden">
          {loading ? (
            <div className="empty-state text-sm">Loading anomaly events...</div>
          ) : null}

          {!loading && !events.length ? (
            <div className="empty-state text-sm">No anomaly events have been recorded yet.</div>
          ) : null}

          {events.map((event) => (
            <div key={event.id} className="mobile-data-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-slate-900">{event.email || "Unknown user"}</p>
                  <p className="mt-1 text-sm text-slate-500">{event.filename || "No linked file"}</p>
                </div>
                <span className="status-pill bg-rose-50 text-rose-700">Score {Number(event.score).toFixed(2)}</span>
              </div>
              <p className="mt-4 text-sm text-slate-600">Time: {formatTimestamp(event.created_at)}</p>
            </div>
          ))}
        </div>

        <div className="table-shell mt-5 hidden md:block">
          <table className="table-base">
            <thead className="table-head">
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
                  <td colSpan={4} className="table-empty">
                    Loading anomaly events...
                  </td>
                </tr>
              ) : null}

              {!loading && !events.length ? (
                <tr>
                  <td colSpan={4} className="table-empty">
                    No anomaly events have been recorded yet.
                  </td>
                </tr>
              ) : null}

              {events.map((event) => (
                <tr key={event.id} className="table-row">
                  <td className="text-slate-500">{event.email || "Unknown"}</td>
                  <td className="text-slate-500">{event.filename || "-"}</td>
                  <td className="font-semibold text-rose-500">{Number(event.score).toFixed(2)}</td>
                  <td className="text-slate-500">{formatTimestamp(event.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
