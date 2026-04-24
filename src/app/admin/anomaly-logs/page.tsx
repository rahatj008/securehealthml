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
  features?: {
    type?: string;
    context?: string;
    reason?: string;
    ip?: string;
    user_agent?: string;
    observed_count?: number;
    threshold?: number;
    target_email?: string | null;
    recipient_email?: string | null;
    action?: string;
    decision?: string;
    security_level?: string | null;
    access_mode?: string | null;
    window_minutes?: number;
    window_days?: number;
    mime_type?: string | null;
  };
};

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

function formatRuleLabel(value?: string) {
  if (!value) return "Legacy anomaly";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildDetailSummary(event: SecurityEvent) {
  const features = event.features || {};
  const parts: string[] = [];

  if (
    typeof features.observed_count === "number" &&
    typeof features.threshold === "number"
  ) {
    parts.push(`Observed ${features.observed_count} of threshold ${features.threshold}`);
  }

  if (features.ip) {
    parts.push(`IP ${features.ip}`);
  }

  if (features.window_minutes) {
    parts.push(`Window ${features.window_minutes} min`);
  } else if (features.window_days) {
    parts.push(`Window ${features.window_days} days`);
  }

  return parts.join(" | ") || "No extra detail recorded";
}

function buildRelatedLabel(event: SecurityEvent) {
  if (event.filename) return event.filename;
  if (event.features?.target_email) return `Target ${event.features.target_email}`;
  if (event.features?.recipient_email) return `Recipient ${event.features.recipient_email}`;
  return "No linked file";
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
              Inspect rule-based login and file-behavior anomalies surfaced by the platform.
            </h1>
            <p className="page-copy">
              These events explain which rule fired, the observed count, threshold, IP context, and any linked file or account target.
            </p>
          </div>
          <span className="hero-chip bg-amber-50 text-amber-700">Rule-driven security signals</span>
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
                  <p className="text-base font-semibold text-slate-900">
                    {formatRuleLabel(event.features?.type)}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {event.email || event.features?.target_email || "Unknown user"}
                  </p>
                </div>
                <span className="status-pill bg-rose-50 text-rose-700">Score {Number(event.score).toFixed(2)}</span>
              </div>
              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <p>{event.features?.reason || "Suspicious behavior recorded."}</p>
                <p>Context: {event.features?.context || "unknown"}</p>
                <p>Related: {buildRelatedLabel(event)}</p>
                <p>{buildDetailSummary(event)}</p>
                <p>Time: {formatTimestamp(event.created_at)}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="table-shell mt-5 hidden md:block">
          <table className="table-base">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">Rule</th>
                <th className="px-4 py-3">Context</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Related</th>
                <th className="px-4 py-3">Details</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Time</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="table-empty">
                    Loading anomaly events...
                  </td>
                </tr>
              ) : null}

              {!loading && !events.length ? (
                <tr>
                  <td colSpan={7} className="table-empty">
                    No anomaly events have been recorded yet.
                  </td>
                </tr>
              ) : null}

              {events.map((event) => (
                <tr key={event.id} className="table-row">
                  <td className="font-semibold text-slate-700">{formatRuleLabel(event.features?.type)}</td>
                  <td className="text-slate-500">{event.features?.context || "-"}</td>
                  <td className="text-slate-500">{event.email || event.features?.target_email || "Unknown"}</td>
                  <td className="text-slate-500">{buildRelatedLabel(event)}</td>
                  <td className="max-w-xs text-slate-500">
                    <p className="font-medium text-slate-600">
                      {event.features?.reason || "Suspicious behavior recorded."}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{buildDetailSummary(event)}</p>
                  </td>
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
