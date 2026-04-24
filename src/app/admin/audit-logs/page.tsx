"use client";

import { useEffect, useState } from "react";
import AppShell from "../../components/AppShell";
import { apiFetch } from "../../lib/api";
import { useAuthGuard } from "../../lib/auth";
import { adminNav } from "../../lib/nav";

type AuditLog = {
  id: string;
  action: string;
  decision: string;
  reason: string | null;
  email: string | null;
  filename: string | null;
  created_at: string;
};

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

export default function AuditLogsPage() {
  const { token, user, ready, logout } = useAuthGuard("admin");
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;

    apiFetch<{ logs?: AuditLog[] }>("/admin/logs/audit", token)
      .then((data) => {
        setLogs(data.logs || []);
        setError("");
      })
      .catch((err) => setError((err as Error).message || "Failed to load audit logs."))
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
            <p className="page-eyebrow text-blue-600">Audit log</p>
            <h1 className="page-title">
              Review authenticated actions and the decisions the platform made around them.
            </h1>
            <p className="page-copy">
              This stream captures user actions, associated files, and the allow or deny decision recorded at the time.
            </p>
          </div>
          <span className="hero-chip bg-blue-50 text-blue-700">ABAC decision history</span>
        </div>
      </section>

      <section className="section-card">
        {error ? (
          <div className="alert-card alert-warning">{error}</div>
        ) : null}

        <div className="mt-5 space-y-3 md:hidden">
          {loading ? (
            <div className="empty-state text-sm">Loading audit logs...</div>
          ) : null}

          {!loading && !logs.length ? (
            <div className="empty-state text-sm">No audit logs are available yet.</div>
          ) : null}

          {logs.map((log) => (
            <div key={log.id} className="mobile-data-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold capitalize text-slate-900">{log.action}</p>
                  <p className="mt-1 text-sm text-slate-500">{log.email || "Unknown user"}</p>
                </div>
                <span
                  className={`status-pill ${
                    log.decision === "allowed" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                  }`}
                >
                  {log.decision}
                </span>
              </div>
              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <p>File: {log.filename || "-"}</p>
                <p>Reason: {log.reason || "-"}</p>
                <p>Time: {formatTimestamp(log.created_at)}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="table-shell mt-5 hidden md:block">
          <table className="table-base">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Decision</th>
                <th className="px-4 py-3">Time</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="table-empty">
                    Loading audit logs...
                  </td>
                </tr>
              ) : null}

              {!loading && !logs.length ? (
                <tr>
                  <td colSpan={5} className="table-empty">
                    No audit logs are available yet.
                  </td>
                </tr>
              ) : null}

              {logs.map((log) => (
                <tr key={log.id} className="table-row">
                  <td className="font-semibold capitalize text-slate-700">{log.action}</td>
                  <td className="text-slate-500">{log.email || "Unknown"}</td>
                  <td className="text-slate-500">{log.filename || "-"}</td>
                  <td className={`px-4 py-3 ${log.decision === "allowed" ? "text-emerald-600" : "text-rose-500"}`}>
                    {log.decision}
                  </td>
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
