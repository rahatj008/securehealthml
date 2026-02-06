"use client";

import { useEffect, useState } from "react";
import AppShell from "../../components/AppShell";
import { apiFetch } from "../../lib/api";
import { useAuthGuard } from "../../lib/auth";

type Summary = {
  files: number;
  users: number;
  anomalies: number;
  authDenied: number;
};

type FileRow = {
  id: string;
  filename: string;
  security_level: string;
  owner_email: string | null;
  created_at: string;
};

export default function AdminDashboard() {
  const { token, user, ready, logout } = useAuthGuard("admin");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);

  useEffect(() => {
    if (!token) return;
    apiFetch("/admin/summary", token).then(setSummary).catch(() => null);
    apiFetch("/admin/files", token)
      .then((data) => setFiles(data.files || []))
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
        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-semibold">Security Status: Elevated Monitoring</p>
            <p className="text-sm text-slate-500">
              Full visibility into records, authentication, and threat response signals.
            </p>
          </div>
          <button className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-200">
            View Live Audit
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Total Files", value: summary?.files ?? 0 },
          { label: "Registered Users", value: summary?.users ?? 0 },
          { label: "Anomalies Detected", value: summary?.anomalies ?? 0 },
          { label: "Denied Logins", value: summary?.authDenied ?? 0 },
        ].map((card) => (
          <div key={card.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-400">{card.label}</p>
            <p className="mt-3 text-3xl font-semibold text-slate-800">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-lg font-semibold">All Records</p>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            Policy + ABE enforced
          </span>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Security</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {files.slice(0, 6).map((file) => (
                <tr key={file.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-700">{file.filename}</td>
                  <td className="px-4 py-3 text-slate-500">{file.owner_email || "Unknown"}</td>
                  <td className="px-4 py-3 text-slate-500">{file.security_level}</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(file.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
