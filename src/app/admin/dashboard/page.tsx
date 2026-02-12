"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "../../components/AppShell";
import { apiFetch } from "../../lib/api";
import { useAuthGuard } from "../../lib/auth";
import { adminNav } from "../../lib/nav";

type Summary = {
  files: number;
  users: number;
  anomalies: number;
  authDenied: number;
  malware: number;
};

type Point = {
  day: string;
  count: number;
};

type Analytics = {
  anomalyDetection: Point[];
  malwareDetection: Point[];
  authFailures: Point[];
};

type FileRow = {
  id: string;
  filename: string;
  security_level: string;
  owner_email: string | null;
  created_at: string;
};

function LineChart({ title, data, color }: { title: string; data: Point[]; color: string }) {
  const max = useMemo(() => Math.max(...data.map((d) => d.count), 1), [data]);
  const points = useMemo(() => {
    if (!data.length) return "";
    return data
      .map((d, idx) => {
        const x = (idx / Math.max(data.length - 1, 1)) * 100;
        const y = 100 - (d.count / max) * 90;
        return `${x},${y}`;
      })
      .join(" ");
  }, [data, max]);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      <svg viewBox="0 0 100 100" className="mt-4 h-36 w-full">
        <polyline points={points} fill="none" stroke={color} strokeWidth="2" />
        {data.map((d, idx) => {
          const x = (idx / Math.max(data.length - 1, 1)) * 100;
          const y = 100 - (d.count / max) * 90;
          return <circle key={`${d.day}-${idx}`} cx={x} cy={y} r="1.8" fill={color} />;
        })}
      </svg>
      <div className="mt-2 flex justify-between text-[11px] text-slate-400">
        <span>{data[0]?.day || "-"}</span>
        <span>{data[data.length - 1]?.day || "-"}</span>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { token, user, ready, logout } = useAuthGuard("admin");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [analytics, setAnalytics] = useState<Analytics>({
    anomalyDetection: [],
    malwareDetection: [],
    authFailures: [],
  });

  useEffect(() => {
    if (!token) return;
    apiFetch("/admin/summary", token).then(setSummary).catch(() => null);
    apiFetch("/admin/files", token).then((data) => setFiles(data.files || [])).catch(() => null);
    apiFetch("/admin/analytics", token).then(setAnalytics).catch(() => null);
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
      nav={adminNav}
    >
      <div className="grid gap-4 md:grid-cols-5">
        {[
          { label: "Total Files", value: summary?.files ?? 0 },
          { label: "Users", value: summary?.users ?? 0 },
          { label: "Anomalies", value: summary?.anomalies ?? 0 },
          { label: "Malware", value: summary?.malware ?? 0 },
          { label: "Auth Failures", value: summary?.authDenied ?? 0 },
        ].map((card) => (
          <div key={card.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-400">{card.label}</p>
            <p className="mt-3 text-3xl font-semibold text-slate-800">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <LineChart title="Anomaly Detection" data={analytics.anomalyDetection} color="#1d4ed8" />
        <LineChart title="Malware Detection" data={analytics.malwareDetection} color="#dc2626" />
        <LineChart title="Auth Failures" data={analytics.authFailures} color="#f59e0b" />
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-lg font-semibold">Recent Records</p>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Live Data</span>
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
              {files.slice(0, 8).map((file) => (
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
