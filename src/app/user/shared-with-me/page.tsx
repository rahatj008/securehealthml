"use client";

import { useEffect, useEffectEvent, useState } from "react";
import AppShell from "../../components/AppShell";
import { apiDownload, apiFetch } from "../../lib/api";
import { useAuthGuard } from "../../lib/auth";
import { userNav } from "../../lib/nav";

type ShareRow = {
  id: string;
  file_id: string;
  filename: string;
  security_level: string;
  owner_email: string | null;
  created_at: string;
  share_mode: string;
  max_access_count: number;
};

type IncomingSharesResponse = {
  shares?: ShareRow[];
};

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function SharedWithMePage() {
  const { token, user, ready, logout } = useAuthGuard("user");
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [message, setMessage] = useState("");
  const [workingShareId, setWorkingShareId] = useState<string | null>(null);

  async function loadShares() {
    const data = await apiFetch<IncomingSharesResponse>("/shares/incoming", token || undefined);
    setShares(data.shares || []);
  }

  const syncShares = useEffectEvent(async () => {
    await loadShares();
  });

  useEffect(() => {
    if (!token) return;
    syncShares().catch(() => null);
  }, [token]);

  async function handleAccess(share: ShareRow) {
    try {
      setWorkingShareId(share.id);
      const { blob, filename } = await apiDownload(`/files/download/${share.file_id}`, token || undefined);
      triggerDownload(blob, filename);
      setMessage("One-time record accessed. The shared file has now been erased from secure storage.");
      await loadShares();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setWorkingShareId(null);
    }
  }

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
            <p className="text-lg font-semibold">Shared With Me</p>
            <p className="text-sm text-slate-500">
              These records are one-time secure shares. Once you access one, it is destroyed immediately.
            </p>
          </div>
          <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
            Self-destruct after first access
          </span>
        </div>
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Security</th>
                <th className="px-4 py-3">Shared At</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {shares.map((share) => (
                <tr key={share.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-700">{share.filename}</td>
                  <td className="px-4 py-3 text-slate-500">{share.owner_email || "Unknown"}</td>
                  <td className="px-4 py-3 text-slate-500">{share.security_level}</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(share.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleAccess(share)}
                      className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      disabled={workingShareId === share.id}
                    >
                      {workingShareId === share.id ? "Accessing..." : "Access Once"}
                    </button>
                  </td>
                </tr>
              ))}
              {!shares.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                    No active one-time shares are waiting for you.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {message ? (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</div>
      ) : null}
    </AppShell>
  );
}
