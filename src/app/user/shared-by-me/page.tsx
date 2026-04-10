"use client";

import { useEffect, useState } from "react";
import AppShell from "../../components/AppShell";
import { apiFetch } from "../../lib/api";
import { useAuthGuard } from "../../lib/auth";
import { userNav } from "../../lib/nav";

type ShareRow = {
  id: string;
  filename: string;
  recipient_email: string | null;
  permission: string;
  share_mode: string;
  access_count: number;
  max_access_count: number;
  created_at: string;
  consumed_at: string | null;
  destroyed_at: string | null;
};

type OutgoingSharesResponse = {
  shares?: ShareRow[];
};

function shareStatus(share: ShareRow) {
  if (share.consumed_at || share.destroyed_at) {
    return "Consumed";
  }
  return "Pending";
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

export default function SharedByMePage() {
  const { token, user, ready, logout } = useAuthGuard("user");
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    apiFetch<OutgoingSharesResponse>("/shares/outgoing", token)
      .then((data) => setShares(data.shares || []))
      .catch((err) => setMessage((err as Error).message));
  }, [token]);

  if (!ready || !user) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading...</div>;
  }

  return (
    <AppShell
      title="Secured Health Records"
      subtitle="Clinical workspace with ABAC, secure storage, and ML threat monitoring"
      userName={user.full_name || user.email}
      userMeta={`${user.role} | ${user.department} | Clearance ${user.clearance}`}
      onLogout={logout}
      nav={userNav}
    >
      <section className="surface-card-strong rounded-[2rem] p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-600">Shared by me</p>
            <h1 className="mt-3 text-2xl font-semibold text-slate-900 sm:text-3xl">
              Track every outgoing one-time share and see when secure access has been consumed.
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Once a recipient opens a shared file, the share becomes consumed and the linked record is destroyed.
            </p>
          </div>
          <span className="status-pill bg-blue-50 text-blue-700">One-time access ledger</span>
        </div>
      </section>

      <section className="surface-card rounded-[1.8rem] p-5 sm:p-6">
        <div className="space-y-3 md:hidden">
          {shares.length ? (
            shares.map((share) => {
              const status = shareStatus(share);
              return (
                <div key={share.id} className="mobile-data-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-slate-900">{share.filename}</p>
                      <p className="mt-1 text-sm text-slate-500">{share.recipient_email || "Unknown recipient"}</p>
                    </div>
                    <span
                      className={`status-pill ${
                        status === "Consumed" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {status}
                    </span>
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-slate-600">
                    <p>Mode: {share.share_mode.replace("_", " ")}</p>
                    <p>Shared at: {formatTimestamp(share.created_at)}</p>
                    <p>
                      Access count: {share.access_count} / {share.max_access_count}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="mobile-data-card text-sm text-slate-500">You have not created any one-time shares yet.</div>
          )}
        </div>

        <div className="hidden overflow-hidden rounded-[1.5rem] border border-slate-100 md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Shared at</th>
              </tr>
            </thead>
            <tbody>
              {shares.map((share) => {
                const status = shareStatus(share);
                return (
                  <tr key={share.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-semibold text-slate-700">{share.filename}</td>
                    <td className="px-4 py-3 text-slate-500">{share.recipient_email || "Unknown"}</td>
                    <td className="px-4 py-3 text-slate-500">{share.share_mode.replace("_", " ")}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`status-pill ${
                          status === "Consumed" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatTimestamp(share.created_at)}</td>
                  </tr>
                );
              })}
              {!shares.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                    You have not created any one-time shares yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {message ? (
        <div className="rounded-[1.5rem] border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {message}
        </div>
      ) : null}
    </AppShell>
  );
}
