"use client";

import { useEffect, useState } from "react";
import AppShell from "../../components/AppShell";
import { apiFetch } from "../../lib/api";
import { useAuthGuard } from "../../lib/auth";

type ShareRow = {
  id: string;
  filename: string;
  recipient_email: string | null;
  permission: string;
  created_at: string;
};

export default function SharedByMePage() {
  const { token, user, ready, logout } = useAuthGuard("user");
  const [shares, setShares] = useState<ShareRow[]>([]);

  useEffect(() => {
    if (!token) return;
    apiFetch("/shares/outgoing", token)
      .then((data) => setShares(data.shares || []))
      .catch(() => null);
  }, [token]);

  if (!ready || !user) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading...</div>;
  }

  return (
    <AppShell
      title="SecurHealth ML"
      subtitle="Clinician Workspace"
      userName={user.full_name || user.email}
      userMeta={`${user.role} • Clearance ${user.clearance}`}
      onLogout={logout}
      nav={[
        { label: "Dashboard", href: "/user/dashboard" },
        { label: "Shared With Me", href: "/user/shared-with-me" },
        { label: "Shared By Me", href: "/user/shared-by-me" },
      ]}
    >
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-lg font-semibold">Shared By Me</p>
        <p className="text-sm text-slate-500">Track files you have shared with other clinicians.</p>
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Permission</th>
                <th className="px-4 py-3">Shared At</th>
              </tr>
            </thead>
            <tbody>
              {shares.map((share) => (
                <tr key={share.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-700">{share.filename}</td>
                  <td className="px-4 py-3 text-slate-500">{share.recipient_email || "Unknown"}</td>
                  <td className="px-4 py-3 text-slate-500">{share.permission}</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(share.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
