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
  is_destroyed: boolean;
  destroyed_at: string | null;
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
    apiFetch<Summary>("/admin/summary", token).then((data) => setSummary(data)).catch(() => null);
    apiFetch<{ files?: FileRow[] }>("/admin/files", token)
      .then((data) => setFiles(data.files || []))
      .catch(() => null);
    apiFetch<Analytics>("/admin/analytics", token).then((data) => setAnalytics(data)).catch(() => null);
  }, [token]);

  if (!ready || !user) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading...</div>;
  }

  return (
    <AppShell
      title="Secured Health Records"
      subtitle="Machine learning-enhanced EHR sharing with ABAC, audit visibility, and one-time secure access"
      userName={user.full_name || user.email}
      userMeta={`Administrator | ${user.department} | Clearance ${user.clearance}`}
      onLogout={logout}
      nav={adminNav}
    >
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">Secured Health Records</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold text-slate-900">
            Machine Learning-Enhanced Secure Platform for Electronic Health Record Sharing with Proactive Threat Detection
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
            Attribute-based controls protect each record, while the XGBoost layer evaluates behavior and content in
            real time to stop anomalous access, malicious uploads, and risky authentication patterns before damage
            spreads.
          </p>
        </div>

        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">One-Time Sharing</p>
          <p className="mt-3 text-2xl font-semibold text-emerald-950">Files self-destruct after first shared access.</p>
          <p className="mt-3 text-sm leading-6 text-emerald-900">
            Owners can create only one active share per file. Once the recipient downloads it, the object is erased
            from AWS S3 and the file is marked destroyed in the platform ledger.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        {[
          { label: "Active Files", value: summary?.files ?? 0 },
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

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-lg font-semibold">System Flow</p>
          <div className="mt-4 grid gap-3">
            {[
              "1. User request enters via web app for login, upload, or download.",
              "2. Authentication validates credentials and logs denied attempts.",
              "3. ABAC checks role, department, and clearance against file policy.",
              "4. XGBoost evaluates behavior and file-content risk in parallel.",
              "5. Normal actions proceed; anomalous actions trigger alerts and shutdown.",
              "6. Audit and security events feed the continuous ML improvement loop.",
            ].map((step) => (
              <div key={step} className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600">
                {step}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-lg font-semibold">Architecture Highlights</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {[
              "Next.js frontend with unified /api surface",
              "PostgreSQL for users, files, shares, and security logs",
              "AWS S3 for encrypted document storage",
              "XGBoost-based ML service for anomaly and malware scoring",
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-slate-200 px-4 py-4 text-sm font-medium text-slate-700">
                {item}
              </div>
            ))}
          </div>
        </div>
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
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {files.slice(0, 8).map((file) => (
                <tr key={file.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-700">{file.filename}</td>
                  <td className="px-4 py-3 text-slate-500">{file.owner_email || "Unknown"}</td>
                  <td className="px-4 py-3 text-slate-500">{file.security_level}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        file.is_destroyed ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {file.is_destroyed ? "Destroyed" : "Active"}
                    </span>
                  </td>
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
