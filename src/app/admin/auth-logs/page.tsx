"use client";

import { useEffect, useState } from "react";
import AppShell from "../../components/AppShell";
import { apiFetch } from "../../lib/api";
import { useAuthGuard } from "../../lib/auth";
import { adminNav } from "../../lib/nav";

type AuthLog = {
  id: string;
  email: string | null;
  decision: string;
  reason: string | null;
  created_at: string;
};

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

export default function AuthLogsPage() {
  const { token, user, ready, logout } = useAuthGuard("admin");
  const [logs, setLogs] = useState<AuthLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;

    apiFetch<{ logs?: AuthLog[] }>("/admin/logs/auth", token)
      .then((data) => {
        setLogs(data.logs || []);
        setError("");
      })
      .catch((err) => setError((err as Error).message || "Failed to load authentication logs."))
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
            <p className="page-eyebrow text-blue-600">Authentication log</p>
            <h1 className="page-title">
              Review successful and failed sign-in attempts across the platform.
            </h1>
            <p className="page-copy">
              This view highlights login decisions and the reason attached to each deny event.
            </p>
          </div>
          <span className="hero-chip bg-blue-50 text-blue-700">Login decision feed</span>
        </div>
      </section>

      <section className="section-card">
        {error ? (
          <div className="alert-card alert-warning">{error}</div>
        ) : null}

        <div className="mt-5 space-y-3 md:hidden">
          {loading ? (
            <div className="empty-state text-sm">Loading authentication logs...</div>
          ) : null}

          {!loading && !logs.length ? (
            <div className="empty-state text-sm">No authentication logs are available yet.</div>
          ) : null}

          {logs.map((log) => (
            <div key={log.id} className="mobile-data-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-slate-900">{log.email || "Unknown user"}</p>
                  <p className="mt-1 text-sm text-slate-500">Time: {formatTimestamp(log.created_at)}</p>
                </div>
                <span
                  className={`status-pill ${
                    log.decision === "allowed" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                  }`}
                >
                  {log.decision}
                </span>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">Reason: {log.reason || "-"}</p>
            </div>
          ))}
        </div>

        <div className="table-shell mt-5 hidden md:block">
          <table className="table-base">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Decision</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Time</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="table-empty">
                    Loading authentication logs...
                  </td>
                </tr>
              ) : null}

              {!loading && !logs.length ? (
                <tr>
                  <td colSpan={4} className="table-empty">
                    No authentication logs are available yet.
                  </td>
                </tr>
              ) : null}

              {logs.map((log) => (
                <tr key={log.id} className="table-row">
                  <td className="text-slate-500">{log.email || "Unknown"}</td>
                  <td className={`px-4 py-3 font-semibold ${log.decision === "allowed" ? "text-emerald-600" : "text-rose-500"}`}>
                    {log.decision}
                  </td>
                  <td className="text-slate-500">{log.reason || "-"}</td>
                  <td className="text-slate-500">{formatTimestamp(log.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
