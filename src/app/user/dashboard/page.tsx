"use client";

import { useEffect, useEffectEvent, useState } from "react";
import AppShell from "../../components/AppShell";
import { apiDownload, apiFetch } from "../../lib/api";
import { useAuthGuard } from "../../lib/auth";
import { userNav } from "../../lib/nav";

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
  share_id: string;
  recipient_email?: string | null;
  share_mode?: string;
  access_count?: number;
  max_access_count?: number;
  shared_at?: string;
  last_accessed_at?: string | null;
  consumed_at?: string | null;
  is_destroyed?: boolean;
};

type UploadOptions = {
  roles: string[];
  departments: string[];
  clearances: number[];
  securityLevels: string[];
};

type UserFilesResponse = {
  owned?: FileRow[];
  sharedWithMe?: FileRow[];
  sharedByMe?: SharedFile[];
};

type UploadOptionsResponse = {
  roles?: string[];
  departments?: string[];
  clearances?: number[];
  securityLevels?: string[];
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

export default function UserDashboard() {
  const { token, user, ready, logout } = useAuthGuard("user");
  const [owned, setOwned] = useState<FileRow[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<FileRow[]>([]);
  const [sharedByMe, setSharedByMe] = useState<SharedFile[]>([]);
  const [message, setMessage] = useState("");
  const [workingFileId, setWorkingFileId] = useState<string | null>(null);
  const [shareForm, setShareForm] = useState({ fileId: "", recipientEmail: "" });
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [uploadOptions, setUploadOptions] = useState<UploadOptions>({
    roles: [],
    departments: [],
    clearances: [1, 2, 3, 4, 5],
    securityLevels: ["Restricted", "Confidential", "Highly Sensitive"],
  });
  const [uploadForm, setUploadForm] = useState({
    role: "",
    department: "",
    minClearance: 1,
    securityLevel: "Restricted",
  });

  async function loadFiles() {
    const data = await apiFetch<UserFilesResponse>("/user/files", token || undefined);
    setOwned(data.owned || []);
    setSharedWithMe(data.sharedWithMe || []);
    setSharedByMe(data.sharedByMe || []);
  }

  async function loadUploadOptions() {
    const data = await apiFetch<UploadOptionsResponse>("/abac/options", token || undefined);
    const roles = data.roles || [];
    const departments = data.departments || [];
    const clearances = data.clearances || [1, 2, 3, 4, 5];
    const securityLevels = data.securityLevels || ["Restricted", "Confidential", "Highly Sensitive"];

    setUploadOptions({ roles, departments, clearances, securityLevels });
    setUploadForm({
      role: user?.role || roles[0] || "",
      department: user?.department || departments[0] || "",
      minClearance: Number(user?.clearance || clearances[0] || 1),
      securityLevel: securityLevels[0] || "Restricted",
    });
  }

  const bootstrapDashboard = useEffectEvent(async () => {
    await Promise.all([loadFiles(), loadUploadOptions()]);
  });

  useEffect(() => {
    if (!token) return;
    bootstrapDashboard().catch((err) => setMessage((err as Error).message));
  }, [token, user?.role, user?.department, user?.clearance]);

  async function handleShare(e: React.FormEvent) {
    e.preventDefault();
    if (!shareForm.fileId || !shareForm.recipientEmail) {
      setMessage("Select a file and enter a recipient email.");
      return;
    }

    try {
      setWorkingFileId(shareForm.fileId);
      await apiFetch("/shares", token || undefined, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: shareForm.fileId, recipientEmail: shareForm.recipientEmail }),
      });
      setMessage("One-time secure share created. The record will self-destruct after first recipient access.");
      setShareForm({ fileId: "", recipientEmail: "" });
      await loadFiles();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setWorkingFileId(null);
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!fileToUpload) {
      setMessage("Select a file to upload.");
      return;
    }

    const formData = new FormData();
    formData.append("file", fileToUpload);
    if (uploadForm.role) formData.append("roles", uploadForm.role);
    if (uploadForm.department) formData.append("departments", uploadForm.department);
    formData.append("minClearance", String(uploadForm.minClearance));
    formData.append("securityLevel", uploadForm.securityLevel);

    try {
      setWorkingFileId("upload");
      await apiFetch("/files/upload", token || undefined, {
        method: "POST",
        body: formData,
      });
      setMessage("EHR uploaded and protected with policy-based access controls.");
      setFileToUpload(null);
      await loadFiles();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setWorkingFileId(null);
    }
  }

  async function handleDownload(fileId: string, successMessage: string) {
    try {
      setWorkingFileId(fileId);
      const { blob, filename } = await apiDownload(`/files/download/${fileId}`, token || undefined);
      triggerDownload(blob, filename);
      setMessage(successMessage);
      await loadFiles();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setWorkingFileId(null);
    }
  }

  if (!ready || !user) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading...</div>;
  }

  return (
    <AppShell
      title="Secured Health Records"
      subtitle="Clinical workspace with ABAC, S3-backed storage, and ML threat monitoring"
      userName={user.full_name || user.email}
      userMeta={`${user.role} | ${user.department} | Clearance ${user.clearance}`}
      onLogout={logout}
      nav={userNav}
    >
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "My Records", value: owned.length },
          { label: "Shared With Me", value: sharedWithMe.length },
          { label: "Active One-Time Shares", value: sharedByMe.filter((row) => !row.consumed_at).length },
        ].map((card) => (
          <div key={card.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-400">{card.label}</p>
            <p className="mt-3 text-3xl font-semibold text-slate-800">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-lg font-semibold">Secure Flow</p>
          <div className="mt-4 grid gap-3 md:grid-cols-5">
            {[
              "1. Authenticate",
              "2. Evaluate ABAC policy",
              "3. Inspect behavior and content",
              "4. Allow or block via XGBoost",
              "5. Self-destruct one-time shares after access",
            ].map((step) => (
              <div key={step} className="rounded-2xl bg-slate-50 px-4 py-4 text-sm font-medium text-slate-600">
                {step}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
          <p className="text-lg font-semibold text-emerald-900">One-Time Sharing</p>
          <p className="mt-2 text-sm text-emerald-800">
            Each file can have only one active share. When the recipient accesses it once, the object is erased from
            secure storage and the share is permanently consumed.
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-lg font-semibold">Upload Protected EHR</p>
        <form onSubmit={handleUpload} className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            type="file"
            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm"
            onChange={(e) => setFileToUpload(e.target.files?.[0] || null)}
          />

          <select
            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm"
            value={uploadForm.role}
            onChange={(e) => setUploadForm({ ...uploadForm, role: e.target.value })}
          >
            <option value="">Select role</option>
            {uploadOptions.roles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>

          <select
            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm"
            value={uploadForm.department}
            onChange={(e) => setUploadForm({ ...uploadForm, department: e.target.value })}
          >
            <option value="">Select department</option>
            {uploadOptions.departments.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </select>

          <select
            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm"
            value={uploadForm.minClearance}
            onChange={(e) => setUploadForm({ ...uploadForm, minClearance: Number(e.target.value) })}
          >
            {uploadOptions.clearances.map((clearance) => (
              <option key={clearance} value={clearance}>
                Clearance {clearance}
              </option>
            ))}
          </select>

          <select
            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm"
            value={uploadForm.securityLevel}
            onChange={(e) => setUploadForm({ ...uploadForm, securityLevel: e.target.value })}
          >
            {uploadOptions.securityLevels.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>

          <button
            className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white md:col-span-2 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!uploadOptions.roles.length || !uploadOptions.departments.length || workingFileId === "upload"}
          >
            {workingFileId === "upload" ? "Scanning and encrypting..." : "Upload Secure Record"}
          </button>
        </form>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-lg font-semibold">Create One-Time Share</p>
            <p className="text-sm text-slate-500">The recipient can access the shared record once. After that, it is erased.</p>
          </div>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
            One active share per file
          </span>
        </div>
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
          <button
            className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={!shareForm.fileId || !shareForm.recipientEmail || workingFileId === shareForm.fileId}
          >
            {workingFileId === shareForm.fileId ? "Creating..." : "Share Once"}
          </button>
        </form>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-lg font-semibold">My Records</p>
            <p className="text-sm text-slate-500">Owned records remain accessible to you unless consumed through a one-time share.</p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            S3 encrypted storage
          </span>
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Security</th>
                <th className="px-4 py-3">Policy</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {owned.map((file) => (
                <tr key={file.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-700">{file.filename}</td>
                  <td className="px-4 py-3 text-slate-500">{file.security_level}</td>
                  <td className="px-4 py-3 text-slate-500">
                    Roles: {file.policy?.roles?.join(", ")} | MinC: {file.policy?.minClearance}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{new Date(file.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() =>
                        handleDownload(file.id, "Secure record downloaded.")
                      }
                      className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      disabled={workingFileId === file.id}
                    >
                      {workingFileId === file.id ? "Preparing..." : "Download"}
                    </button>
                  </td>
                </tr>
              ))}
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
