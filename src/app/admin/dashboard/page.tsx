"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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

type MalwareEvent = {
  id: string;
  score: number;
  email: string | null;
  filename: string | null;
  reasons: string[];
  created_at: string;
  context?: string | null;
  mime_type?: string | null;
};

type DeleteFileResponse = {
  message?: string;
  fileId: string;
  destroyed: boolean;
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
    <div className="surface-card rounded-[1.7rem] p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        <span className="status-pill bg-slate-100 text-slate-600">7 days</span>
      </div>
      <svg viewBox="0 0 100 100" className="mt-4 h-36 w-full overflow-visible">
        <polyline points={points} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
        {data.map((d, idx) => {
          const x = (idx / Math.max(data.length - 1, 1)) * 100;
          const y = 100 - (d.count / max) * 90;
          return <circle key={`${d.day}-${idx}`} cx={x} cy={y} r="2" fill={color} />;
        })}
      </svg>
      <div className="mt-2 flex justify-between text-[11px] text-slate-400">
        <span>{data[0]?.day || "-"}</span>
        <span>{data[data.length - 1]?.day || "-"}</span>
      </div>
    </div>
  );
}

function formatClock(value: string | null) {
  if (!value) return "Not updated yet";
  return new Date(value).toLocaleTimeString();
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

export default function AdminDashboard() {
  const { token, user, ready, logout } = useAuthGuard("admin");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [recentMalware, setRecentMalware] = useState<MalwareEvent[]>([]);
  const [analytics, setAnalytics] = useState<Analytics>({
    anomalyDetection: [],
    malwareDetection: [],
    authFailures: [],
  });
  const [actionMessage, setActionMessage] = useState("");
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const authToken = token || undefined;

  const loadDashboard = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      if (!background) {
        setLoading(true);
      }

      try {
        const [summaryData, fileData, analyticsData, malwareData] = await Promise.all([
          apiFetch<Summary>("/admin/summary", authToken),
          apiFetch<{ files?: FileRow[] }>("/admin/files", authToken),
          apiFetch<Analytics>("/admin/analytics", authToken),
          apiFetch<{ events?: MalwareEvent[] }>("/admin/logs/malware?limit=5", authToken),
        ]);

        setSummary(summaryData);
        setFiles(fileData.files || []);
        setAnalytics(analyticsData);
        setRecentMalware(malwareData.events || []);
        setLastUpdatedAt(new Date().toISOString());
        setError("");
      } catch (err) {
        setError((err as Error).message || "Failed to load dashboard data.");
      } finally {
        setLoading(false);
      }
    },
    [authToken]
  );

  async function handleDeleteFile(file: FileRow) {
    const confirmed = window.confirm(
      `Delete "${file.filename}" permanently? Any active one-time shares for this file will be revoked.`
    );
    if (!confirmed) {
      return;
    }

    try {
      setDeletingFileId(file.id);
      const result = await apiFetch<DeleteFileResponse>(`/files/${file.id}`, authToken, {
        method: "DELETE",
      });
      setActionMessage(result.message || "File deleted permanently.");
      setError("");
      await loadDashboard();
    } catch (err) {
      setError((err as Error).message || "Failed to delete file.");
      await loadDashboard({ background: true });
    } finally {
      setDeletingFileId(null);
    }
  }

  useEffect(() => {
    if (!token) return;

    loadDashboard();
    const intervalId = window.setInterval(() => {
      loadDashboard({ background: true });
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [token, loadDashboard]);

  if (!ready || !user) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading...</div>;
  }

  const metricCards = [
    { label: "Active files", value: summary?.files, tone: "bg-blue-50 text-blue-700" },
    { label: "Users", value: summary?.users, tone: "bg-slate-100 text-slate-700" },
    { label: "Anomalies", value: summary?.anomalies, tone: "bg-amber-50 text-amber-700" },
    { label: "Malware", value: summary?.malware, tone: "bg-rose-50 text-rose-700" },
    { label: "Auth failures", value: summary?.authDenied, tone: "bg-emerald-50 text-emerald-700" },
  ];

  return (
    <AppShell
      title="Secured Health Records"
      subtitle="Machine learning-enhanced EHR sharing with ABAC, audit visibility, and one-time secure access"
      userName={user.full_name || user.email}
      userMeta={`Administrator | ${user.department} | Clearance ${user.clearance}`}
      onLogout={logout}
      nav={adminNav}
    >
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.8fr)]">
        <div className="page-hero">
          <p className="page-eyebrow text-blue-600">Admin command center</p>
          <h1 className="page-title">
            Monitor live file risk, policy activity, and user behavior from a single responsive dashboard.
          </h1>
          <p className="page-copy">
            Malware blocks, anomaly detections, authentication failures, and record status changes are collected into
            one stream so administrators can react quickly on desktop or mobile.
          </p>
        </div>

        <div className="section-card border border-emerald-200">
          <p className="page-eyebrow text-emerald-700">Security monitoring</p>
          <p className="mt-3 text-xl font-semibold text-emerald-950">
            Malware detections flow straight into the graph, logs, and summary counters.
          </p>
          <p className="mt-3 text-sm leading-6 text-emerald-900">
            Upload blocks are logged immediately and reflected without requiring a full page reload.
          </p>
        </div>
      </section>

      <div className="section-card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-700">Security telemetry</p>
          <p className="text-xs text-slate-500">
            {loading && !lastUpdatedAt ? "Loading latest dashboard data..." : `Last updated at ${formatClock(lastUpdatedAt)}`}
          </p>
        </div>
        <span className="status-pill bg-slate-100 text-slate-600">Auto refresh every 15 seconds</span>
      </div>

      {error ? (
        <div className="alert-card alert-warning">{error}</div>
      ) : null}

      {actionMessage ? (
        <div className="alert-card alert-info">{actionMessage}</div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metricCards.map((card) => (
          <div key={card.label} className="metric-card">
            <span className={`status-pill ${card.tone}`}>{card.label}</span>
            <p className="metric-value">
              {card.value ?? (loading ? "..." : 0)}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <LineChart title="Anomaly detection" data={analytics.anomalyDetection} color="#1d4ed8" />
        <LineChart title="Malware detection" data={analytics.malwareDetection} color="#dc2626" />
        <LineChart title="Auth failures" data={analytics.authFailures} color="#f59e0b" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)]">
        <div className="section-card">
          <div className="section-header">
            <div>
              <p className="section-title">System flow</p>
              <p className="section-copy mt-1">The platform steps before a file is allowed, blocked, or destroyed.</p>
            </div>
            <span className="status-pill bg-slate-100 text-slate-600">Live enforcement path</span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              "User requests enter through the unified web app and API layer.",
              "Authentication validates credentials and logs denied attempts.",
              "ABAC checks role, department, and clearance against the file policy.",
              "The ML service evaluates behavior and file-content risk in parallel.",
              "Suspicious uploads and risky actions are blocked immediately.",
              "Audit and security events feed the ongoing monitoring loop.",
            ].map((step, index) => (
              <div key={step} className="rounded-[1.4rem] bg-slate-50 px-4 py-4 text-sm text-slate-700">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Step {index + 1}</p>
                <p className="mt-2">{step}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="section-card">
          <div className="section-header">
            <div>
              <p className="section-title">Recent malware detections</p>
              <p className="section-copy mt-1">Latest blocked uploads from the scanner service.</p>
            </div>
            <Link href="/admin/malware-logs" className="status-pill bg-rose-50 text-rose-700">
              View all logs
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {loading && !recentMalware.length ? (
              <div className="empty-state text-sm">Loading malware detections...</div>
            ) : null}

            {!loading && !recentMalware.length ? (
              <div className="empty-state text-sm">No malware detections have been recorded yet.</div>
            ) : null}

            {recentMalware.map((event) => (
              <div key={event.id} className="rounded-[1.4rem] border border-rose-100 bg-rose-50 px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{event.filename || "Unknown file"}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {event.email || "Unknown user"} | {formatTimestamp(event.created_at)}
                    </p>
                  </div>
                  <span className="status-pill bg-white text-rose-700">Score {Number(event.score).toFixed(2)}</span>
                </div>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.22em] text-rose-700">Indicators</p>
                <p className="mt-1 text-sm leading-6 text-slate-700">
                  {(event.reasons || []).slice(0, 3).join(", ") || "Malware detection signals present."}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="section-card">
        <div className="section-header">
          <div>
            <p className="section-title">Recent records</p>
            <p className="section-copy mt-1">The latest file activity across the system.</p>
          </div>
          <span className="status-pill bg-blue-50 text-blue-700">Live data</span>
        </div>

        <div className="mt-5 space-y-3 md:hidden">
          {loading && !files.length ? (
            <div className="empty-state text-sm">Loading recent records...</div>
          ) : null}

          {!loading && !files.length ? (
            <div className="empty-state text-sm">No recent records are available.</div>
          ) : null}

          {files.slice(0, 8).map((file) => (
            <div key={file.id} className="mobile-data-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-slate-900">{file.filename}</p>
                  <p className="mt-1 text-sm text-slate-500">{file.owner_email || "Unknown owner"}</p>
                </div>
                <span
                  className={`status-pill ${
                    file.is_destroyed ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {file.is_destroyed ? "Destroyed" : "Active"}
                </span>
              </div>
              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <p>Security: {file.security_level}</p>
                <p>Created: {formatTimestamp(file.created_at)}</p>
              </div>
              {file.is_destroyed ? (
                <div className="mt-4 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-500">
                  Removed
                </div>
              ) : (
                <button
                  onClick={() => handleDeleteFile(file)}
                  className="button-danger mt-4 w-full"
                  disabled={deletingFileId === file.id}
                >
                  {deletingFileId === file.id ? "Deleting..." : "Delete"}
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="table-shell mt-5 hidden md:block">
          <table className="table-base">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Security</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && !files.length ? (
                <tr>
                  <td colSpan={6} className="table-empty">
                    Loading recent records...
                  </td>
                </tr>
              ) : null}

              {!loading && !files.length ? (
                <tr>
                  <td colSpan={6} className="table-empty">
                    No recent records are available.
                  </td>
                </tr>
              ) : null}

              {files.slice(0, 8).map((file) => (
                <tr key={file.id} className="table-row">
                  <td className="font-semibold text-slate-700">{file.filename}</td>
                  <td className="text-slate-500">{file.owner_email || "Unknown"}</td>
                  <td className="text-slate-500">{file.security_level}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`status-pill ${
                        file.is_destroyed ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {file.is_destroyed ? "Destroyed" : "Active"}
                    </span>
                  </td>
                  <td className="text-slate-500">{formatTimestamp(file.created_at)}</td>
                  <td className="px-4 py-3">
                    {file.is_destroyed ? (
                      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Removed</span>
                    ) : (
                      <button
                        onClick={() => handleDeleteFile(file)}
                        className="button-pill-danger"
                        disabled={deletingFileId === file.id}
                      >
                        {deletingFileId === file.id ? "Deleting..." : "Delete"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
