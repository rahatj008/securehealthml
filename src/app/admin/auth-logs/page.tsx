"use client";

import { useEffect, useState } from "react";
import AppShell from "../../components/AppShell";
import { apiFetch } from "../../lib/api";
import { useAuthGuard } from "../../lib/auth";

type AuthLog = {
  id: string;
  email: string | null;
  decision: string;
  reason: string | null;
  created_at: string;
};

export default function AuthLogsPage() {
  const { token, user, ready, logout } = useAuthGuard("admin");
  const [logs, setLogs] = useState<AuthLog[]>([]);

  useEffect(() => {
    if (!token) return;
    apiFetch("/admin/logs/auth", token)
      .then((data) => setLogs(data.logs || []))
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
        <p className="text-lg font-semibold">Authentication Log</p>
        <p className="text-sm text-slate-500">Successful and failed login attempts.</p>

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Decision</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Time</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-500">{log.email || "Unknown"}</td>
                  <td className={`px-4 py-3 font-semibold ${log.decision === "allowed" ? "text-emerald-600" : "text-rose-500"}`}>
                    {log.decision}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{log.reason || "-"}</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(log.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
