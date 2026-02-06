"use client";

import { useEffect, useState } from "react";
import AppShell from "../../components/AppShell";
import { apiFetch } from "../../lib/api";
import { useAuthGuard } from "../../lib/auth";

type FileRow = {
  id: string;
  filename: string;
  security_level: string;
  created_at: string;
  policy: {
    roles: string[];
    departments: string[];
    minClearance: number;
  };
};

type SharedFile = FileRow & {
  recipient_email?: string;
};

export default function UserDashboard() {
  const { token, user, ready, logout } = useAuthGuard("user");
  const [owned, setOwned] = useState<FileRow[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<FileRow[]>([]);
  const [sharedByMe, setSharedByMe] = useState<SharedFile[]>([]);
  const [message, setMessage] = useState("");
  const [shareForm, setShareForm] = useState({ fileId: "", recipientEmail: "" });

  useEffect(() => {
    if (!token) return;
    apiFetch("/user/files", token)
      .then((data) => {
        setOwned(data.owned || []);
        setSharedWithMe(data.sharedWithMe || []);
        setSharedByMe(data.sharedByMe || []);
      })
      .catch((err) => setMessage(err.message));
  }, [token]);

  async function handleShare(e: React.FormEvent) {
    e.preventDefault();
    if (!shareForm.fileId || !shareForm.recipientEmail) {
      setMessage("Select a file and enter a recipient email.");
      return;
    }
    try {
      await apiFetch("/shares", token || undefined, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: shareForm.fileId,
          recipientEmail: shareForm.recipientEmail,
        }),
      });
      setMessage("File shared successfully.");
      setShareForm({ fileId: "", recipientEmail: "" });
      const data = await apiFetch("/user/files", token || undefined);
      setOwned(data.owned || []);
      setSharedWithMe(data.sharedWithMe || []);
      setSharedByMe(data.sharedByMe || []);
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

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
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "My Records", value: owned.length },
          { label: "Shared With Me", value: sharedWithMe.length },
          { label: "Shared By Me", value: sharedByMe.length },
        ].map((card) => (
          <div key={card.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-400">{card.label}</p>
            <p className="mt-3 text-3xl font-semibold text-slate-800">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-lg font-semibold">Share an EHR</p>
        <p className="text-sm text-slate-500">Share files with colleagues based on policy.</p>
        <form onSubmit={handleShare} className="mt-4 grid gap-3 md:grid-cols-[1.2fr_1fr_auto]">
          <select
            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm"
            value={shareForm.fileId}
            onChange={(e) => setShareForm({ ...shareForm, fileId: e.target.value })}
          >
            <option value="">Select file</option>
            {owned.map((file) => (
              <option key={file.id} value={file.id}>
                {file.filename}
              </option>
            ))}
          </select>
          <input
            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm"
            placeholder="Recipient email"
            value={shareForm.recipientEmail}
            onChange={(e) => setShareForm({ ...shareForm, recipientEmail: e.target.value })}
          />
          <button className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Share</button>
        </form>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-lg font-semibold">My Records</p>
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Security</th>
                <th className="px-4 py-3">Policy</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {owned.map((file) => (
                <tr key={file.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-700">{file.filename}</td>
                  <td className="px-4 py-3 text-slate-500">{file.security_level}</td>
                  <td className="px-4 py-3 text-slate-500">
                    Roles: {file.policy?.roles?.join(", ")} • MinC: {file.policy?.minClearance}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{new Date(file.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {message ? (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {message}
        </div>
      ) : null}
    </AppShell>
  );
}
