"use client";

import { useEffect, useState } from "react";
import AppShell from "../../components/AppShell";
import { apiFetch } from "../../lib/api";
import { useAuthGuard } from "../../lib/auth";
import { adminNav } from "../../lib/nav";

type TransferLog = {
  id: string;
  action: string;
  email: string | null;
  filename: string | null;
  decision: string;
  created_at: string;
};

export default function FileTransfersPage() {
  const { token, user, ready, logout } = useAuthGuard("admin");
  const [logs, setLogs] = useState<TransferLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;

    apiFetch<{ logs?: TransferLog[] }>("/admin/logs/transfers", token)
      .then((data) => {
        setLogs(data.logs || []);
        setError("");
      })
      .catch((err) => setError((err as Error).message || "Failed to load file transfer logs."))
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
        <p className="text-lg font-semibold">File Transfer Log</p>
        <p className="text-sm text-slate-500">Uploads, downloads, and sharing events.</p>

        {error ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {error}
          </div>
        ) : null}

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-400">
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
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                    Loading file transfer logs...
                  </td>
                </tr>
              ) : null}

              {!loading && !logs.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                    No file transfer logs are available yet.
                  </td>
                </tr>
              ) : null}

              {logs.map((log) => (
                <tr key={log.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-700">{log.action}</td>
                  <td className="px-4 py-3 text-slate-500">{log.email || "Unknown"}</td>
                  <td className="px-4 py-3 text-slate-500">{log.filename || "-"}</td>
                  <td className={`px-4 py-3 ${log.decision === "allowed" ? "text-emerald-600" : "text-rose-500"}`}>
                    {log.decision}
                  </td>
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
