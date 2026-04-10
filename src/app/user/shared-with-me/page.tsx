"use client";

import { useEffect, useEffectEvent, useState } from "react";
import AppShell from "../../components/AppShell";
import { apiDownload, apiFetch } from "../../lib/api";
import { useAuthGuard } from "../../lib/auth";
import { userNav } from "../../lib/nav";

type AccessibleFileRow = {
  file_id: string;
  filename: string;
  security_level: string;
  owner_email: string | null;
  created_at: string;
  access_type: "one_time_share" | "policy";
  share_id?: string;
  shared_at?: string;
  share_mode?: string;
  max_access_count?: number;
};

type AccessibleFilesResponse = {
  files?: AccessibleFileRow[];
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

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

export default function SharedWithMePage() {
  const { token, user, ready, logout } = useAuthGuard("user");
  const [files, setFiles] = useState<AccessibleFileRow[]>([]);
  const [message, setMessage] = useState("");
  const [workingFileId, setWorkingFileId] = useState<string | null>(null);

  async function loadShares() {
    const data = await apiFetch<AccessibleFilesResponse>("/user/accessible/files", token || undefined);
    setFiles(data.files || []);
  }

  const syncShares = useEffectEvent(async () => {
    await loadShares();
  });

  useEffect(() => {
    if (!token) return;
    syncShares().catch((err) => setMessage((err as Error).message));
  }, [token]);

  async function handleAccess(file: AccessibleFileRow) {
    try {
      setWorkingFileId(file.file_id);
      const { blob, filename } = await apiDownload(`/files/download/${file.file_id}`, token || undefined);
      triggerDownload(blob, filename);
      setMessage(
        file.access_type === "one_time_share"
          ? "One-time record accessed. The shared file has now been erased from secure storage."
          : "Policy-accessible record downloaded successfully."
      );
      await loadShares();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setWorkingFileId(null);
    }
  }

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
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-600">Shared with me</p>
            <h1 className="mt-3 text-2xl font-semibold text-slate-900 sm:text-3xl">
              Access records shared directly with you or exposed through matching policy.
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              One-time share rows self-destruct after download. Policy-accessible rows remain available as long as the
              file stays active and your ABAC attributes still match.
            </p>
          </div>
          <span className="status-pill bg-blue-50 text-blue-700">Mixed access sources</span>
        </div>
      </section>

      <section className="surface-card rounded-[1.8rem] p-5 sm:p-6">
        <div className="space-y-3 md:hidden">
          {files.length ? (
            files.map((file) => (
              <div key={`${file.access_type}-${file.file_id}`} className="mobile-data-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-slate-900">{file.filename}</p>
                    <p className="mt-1 text-sm text-slate-500">{file.owner_email || "Unknown owner"}</p>
                  </div>
                  <span
                    className={`status-pill ${
                      file.access_type === "one_time_share"
                        ? "bg-rose-50 text-rose-700"
                        : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {file.access_type === "one_time_share" ? "One-time share" : "Policy access"}
                  </span>
                </div>
                <div className="mt-4 space-y-2 text-sm text-slate-600">
                  <p>Security: {file.security_level}</p>
                  <p>Available since: {formatTimestamp(file.shared_at || file.created_at)}</p>
                </div>
                <button
                  onClick={() => handleAccess(file)}
                  className="mt-4 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={workingFileId === file.file_id}
                >
                  {workingFileId === file.file_id
                    ? "Preparing..."
                    : file.access_type === "one_time_share"
                      ? "Access once"
                      : "Download"}
                </button>
              </div>
            ))
          ) : (
            <div className="mobile-data-card text-sm text-slate-500">
              No accessible files are available for you right now.
            </div>
          )}
        </div>

        <div className="hidden overflow-hidden rounded-[1.5rem] border border-slate-100 md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Access</th>
                <th className="px-4 py-3">Security</th>
                <th className="px-4 py-3">Available since</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={`${file.access_type}-${file.file_id}`} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-700">{file.filename}</td>
                  <td className="px-4 py-3 text-slate-500">{file.owner_email || "Unknown"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`status-pill ${
                        file.access_type === "one_time_share"
                          ? "bg-rose-50 text-rose-700"
                          : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {file.access_type === "one_time_share" ? "One-time share" : "Policy access"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{file.security_level}</td>
                  <td className="px-4 py-3 text-slate-500">{formatTimestamp(file.shared_at || file.created_at)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleAccess(file)}
                      className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      disabled={workingFileId === file.file_id}
                    >
                      {workingFileId === file.file_id
                        ? "Preparing..."
                        : file.access_type === "one_time_share"
                          ? "Access once"
                          : "Download"}
                    </button>
                  </td>
                </tr>
              ))}
              {!files.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                    No accessible files are available for you right now.
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
