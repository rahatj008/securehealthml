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

export default function SharedByMePage() {
  const { token, user, ready, logout } = useAuthGuard("user");
  const [shares, setShares] = useState<ShareRow[]>([]);

  useEffect(() => {
    if (!token) return;
    apiFetch<OutgoingSharesResponse>("/shares/outgoing", token)
      .then((data) => setShares(data.shares || []))
      .catch(() => null);
  }, [token]);

  if (!ready || !user) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading...</div>;
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
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-lg font-semibold">Shared By Me</p>
            <p className="text-sm text-slate-500">
              Track which one-time shares are still pending and which have already been consumed.
            </p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            One-time access ledger
          </span>
        </div>
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Shared At</th>
              </tr>
            </thead>
            <tbody>
              {shares.map((share) => (
                <tr key={share.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-700">{share.filename}</td>
                  <td className="px-4 py-3 text-slate-500">{share.recipient_email || "Unknown"}</td>
                  <td className="px-4 py-3 text-slate-500">{share.share_mode.replace("_", " ")}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        shareStatus(share) === "Consumed"
                          ? "bg-rose-50 text-rose-700"
                          : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {shareStatus(share)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{new Date(share.created_at).toLocaleString()}</td>
                </tr>
              ))}
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
      </div>
    </AppShell>
  );
}
