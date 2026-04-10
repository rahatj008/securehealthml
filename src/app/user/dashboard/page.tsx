"use client";

import { useEffect, useEffectEvent, useState } from "react";
import AppShell from "../../components/AppShell";
import { apiDownload, apiFetch, isApiError } from "../../lib/api";
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

type AccessibleFile = {
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

type UploadOptions = {
  roles: string[];
  departments: string[];
  clearances: number[];
  securityLevels: string[];
};

type UserFilesResponse = {
  owned?: FileRow[];
  sharedWithMe?: AccessibleFile[];
  sharedByMe?: SharedFile[];
};

type UploadOptionsResponse = {
  roles?: string[];
  departments?: string[];
  clearances?: number[];
  securityLevels?: string[];
};

type UploadAlert = {
  title: string;
  reasons: string[];
  score?: number | null;
};

type UploadErrorPayload = {
  blockedBy?: string;
  score?: number;
  reasons?: string[];
  error?: string;
};

type DeleteFileResponse = {
  message?: string;
  fileId: string;
  destroyed: boolean;
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

function policySummary(file: FileRow) {
  return `Roles: ${(file.policy?.roles || []).join(", ")} | Departments: ${(file.policy?.departments || []).join(", ")} | Min clearance: ${file.policy?.minClearance}`;
}

export default function UserDashboard() {
  const { token, user, ready, logout } = useAuthGuard("user");
  const [owned, setOwned] = useState<FileRow[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<AccessibleFile[]>([]);
  const [sharedByMe, setSharedByMe] = useState<SharedFile[]>([]);
  const [message, setMessage] = useState("");
  const [workingFileId, setWorkingFileId] = useState<string | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
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
  const [uploadAlert, setUploadAlert] = useState<UploadAlert | null>(null);

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
      setUploadAlert(null);
      await apiFetch("/files/upload", token || undefined, {
        method: "POST",
        body: formData,
      });
      setMessage("EHR uploaded and protected with policy-based access controls.");
      setFileToUpload(null);
      await loadFiles();
    } catch (err) {
      if (isApiError<UploadErrorPayload>(err) && err.data?.blockedBy === "malware") {
        setMessage("");
        setUploadAlert({
          title: err.message || "Upload blocked by the malware scanner.",
          score: typeof err.data.score === "number" ? err.data.score : null,
          reasons: Array.isArray(err.data.reasons) ? err.data.reasons.slice(0, 3) : [],
        });
      } else {
        setUploadAlert(null);
        setMessage((err as Error).message);
      }
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

  async function handleDeleteFile(file: FileRow) {
    const confirmed = window.confirm(
      `Delete "${file.filename}" permanently? Any active one-time shares for this file will be revoked.`
    );
    if (!confirmed) {
      return;
    }

    try {
      setDeletingFileId(file.id);
      const result = await apiFetch<DeleteFileResponse>(`/files/${file.id}`, token || undefined, {
        method: "DELETE",
      });
      setUploadAlert(null);
      setMessage(result.message || "File deleted permanently.");
      await loadFiles();
    } catch (err) {
      setMessage((err as Error).message);
      if (isApiError(err) && err.status === 410) {
        await loadFiles();
      }
    } finally {
      setDeletingFileId(null);
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
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-600">Clinical workspace</p>
            <h1 className="mt-3 text-2xl font-semibold text-slate-900 sm:text-3xl">
              Securely upload, share, and access records from a mobile-friendly command center.
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
              Every record is wrapped in ABAC policy checks, then monitored by the malware and anomaly layer before
              access is granted.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:w-[23rem] xl:grid-cols-1">
            <div className="rounded-[1.5rem] bg-blue-50 px-4 py-4 text-sm text-blue-900">
              <p className="font-semibold">Live policy protection</p>
              <p className="mt-1 text-blue-700">Role, department, and clearance are enforced for every record.</p>
            </div>
            <div className="rounded-[1.5rem] bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
              <p className="font-semibold">One-time shares armed</p>
              <p className="mt-1 text-emerald-700">Shared records self-destruct after the first secure access.</p>
            </div>
          </div>
        </div>
      </section>

      {message ? (
        <div className="rounded-[1.5rem] border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {message}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { label: "My Records", value: owned.length, tone: "bg-blue-50 text-blue-700" },
          { label: "Shared With Me", value: sharedWithMe.length, tone: "bg-emerald-50 text-emerald-700" },
          {
            label: "Active One-Time Shares",
            value: sharedByMe.filter((row) => !row.consumed_at).length,
            tone: "bg-amber-50 text-amber-700",
          },
        ].map((card) => (
          <div key={card.label} className="surface-card rounded-[1.7rem] p-5">
            <span className={`status-pill ${card.tone}`}>{card.label}</span>
            <p className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="surface-card rounded-[1.8rem] p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-lg font-semibold text-slate-900">Secure flow</p>
              <p className="mt-1 text-sm text-slate-500">What happens before a record is released or blocked.</p>
            </div>
            <span className="status-pill bg-slate-100 text-slate-700">5-step protection chain</span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              "Authenticate the request",
              "Match ABAC policy to role and department",
              "Inspect behavior and file content",
              "Allow or block through the security layer",
              "Self-destruct one-time shares after access",
            ].map((step, index) => (
              <div key={step} className="rounded-[1.4rem] bg-slate-50 px-4 py-4 text-sm text-slate-700">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Step {index + 1}</p>
                <p className="mt-2 font-medium">{step}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="surface-card rounded-[1.8rem] border border-emerald-200 p-5 sm:p-6">
          <p className="text-lg font-semibold text-emerald-950">One-time sharing</p>
          <p className="mt-3 text-sm leading-6 text-emerald-900">
            Each file can have only one live share. Once the recipient accesses it, the file is erased from secure
            storage and the share is consumed permanently.
          </p>
        </div>
      </div>

      <section className="surface-card rounded-[1.8rem] p-5 sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-lg font-semibold text-slate-900">Upload protected EHR</p>
            <p className="mt-1 text-sm text-slate-500">
              Upload a supported file type and bind it to the minimum role, department, and clearance required.
            </p>
          </div>
          <span className="status-pill bg-blue-50 text-blue-700">PDF, DOCX, PNG, JPEG</span>
        </div>

        {uploadAlert ? (
          <div className="mt-4 rounded-[1.4rem] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800">
            <p className="font-semibold">{uploadAlert.title}</p>
            {typeof uploadAlert.score === "number" ? (
              <p className="mt-1 text-xs uppercase tracking-[0.22em] text-rose-700">
                Detection score {uploadAlert.score.toFixed(2)}
              </p>
            ) : null}
            {uploadAlert.reasons.length ? (
              <p className="mt-2 leading-6">Indicators: {uploadAlert.reasons.join(", ")}</p>
            ) : null}
          </div>
        ) : null}

        <form onSubmit={handleUpload} className="mt-5 grid gap-3 md:grid-cols-2">
          <input
            type="file"
            accept=".pdf,.docx,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg"
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
            onChange={(e) => setFileToUpload(e.target.files?.[0] || null)}
          />

          <select
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
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
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
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
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
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
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
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
            className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 md:col-span-2 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!uploadOptions.roles.length || !uploadOptions.departments.length || workingFileId === "upload"}
          >
            {workingFileId === "upload" ? "Scanning and encrypting..." : "Upload secure record"}
          </button>
        </form>
      </section>

      <section className="surface-card rounded-[1.8rem] p-5 sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-lg font-semibold text-slate-900">Accessible to me</p>
            <p className="mt-1 text-sm text-slate-500">
              Non-owned files appear here when they are shared with you directly or when your ABAC policy matches.
            </p>
          </div>
          <span className="status-pill bg-emerald-50 text-emerald-700">Policy + share access</span>
        </div>

        <div className="mt-5 space-y-3 md:hidden">
          {sharedWithMe.length ? (
            sharedWithMe.map((file) => (
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
                  onClick={() =>
                    handleDownload(
                      file.file_id,
                      file.access_type === "one_time_share"
                        ? "One-time shared record accessed."
                        : "Policy-accessible record downloaded."
                    )
                  }
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
            <div className="mobile-data-card text-sm text-slate-500">No non-owned files are currently available.</div>
          )}
        </div>

        <div className="mt-5 hidden overflow-hidden rounded-[1.5rem] border border-slate-100 md:block">
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
              {sharedWithMe.map((file) => (
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
                      onClick={() =>
                        handleDownload(
                          file.file_id,
                          file.access_type === "one_time_share"
                            ? "One-time shared record accessed."
                            : "Policy-accessible record downloaded."
                        )
                      }
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
              {!sharedWithMe.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                    No non-owned files are currently available to you.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="surface-card rounded-[1.8rem] p-5 sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-lg font-semibold text-slate-900">Create one-time share</p>
            <p className="mt-1 text-sm text-slate-500">
              The recipient can access the record once. After that, the file is erased automatically.
            </p>
          </div>
          <span className="status-pill bg-amber-50 text-amber-700">One active share per file</span>
        </div>

        <form onSubmit={handleShare} className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <select
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
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
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
            placeholder="Recipient email"
            value={shareForm.recipientEmail}
            onChange={(e) => setShareForm({ ...shareForm, recipientEmail: e.target.value })}
          />
          <button
            className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:opacity-60"
            disabled={!shareForm.fileId || !shareForm.recipientEmail || workingFileId === shareForm.fileId}
          >
            {workingFileId === shareForm.fileId ? "Creating..." : "Share once"}
          </button>
        </form>
      </section>

      <section className="surface-card rounded-[1.8rem] p-5 sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-lg font-semibold text-slate-900">My records</p>
            <p className="mt-1 text-sm text-slate-500">
              Owned records remain available to you unless they are consumed through a one-time share or deleted.
            </p>
          </div>
          <span className="status-pill bg-blue-50 text-blue-700">Secure encrypted storage</span>
        </div>

        <div className="mt-5 space-y-3 md:hidden">
          {owned.length ? (
            owned.map((file) => (
              <div key={file.id} className="mobile-data-card">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-base font-semibold text-slate-900">{file.filename}</p>
                    <p className="mt-1 text-sm text-slate-500">Security: {file.security_level}</p>
                  </div>
                  <span className="status-pill bg-slate-100 text-slate-700">
                    Clearance {file.policy?.minClearance}
                  </span>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">{policySummary(file)}</p>
                <p className="mt-3 text-sm text-slate-500">Created: {formatTimestamp(file.created_at)}</p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    onClick={() => handleDownload(file.id, "Secure record downloaded.")}
                    className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                    disabled={workingFileId === file.id || deletingFileId === file.id}
                  >
                    {workingFileId === file.id ? "Preparing..." : "Download"}
                  </button>
                  <button
                    onClick={() => handleDeleteFile(file)}
                    className="flex-1 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                    disabled={workingFileId === file.id || deletingFileId === file.id}
                  >
                    {deletingFileId === file.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="mobile-data-card text-sm text-slate-500">You have not uploaded any records yet.</div>
          )}
        </div>

        <div className="mt-5 hidden overflow-hidden rounded-[1.5rem] border border-slate-100 md:block">
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
                  <td className="px-4 py-3 text-slate-500">{policySummary(file)}</td>
                  <td className="px-4 py-3 text-slate-500">{formatTimestamp(file.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleDownload(file.id, "Secure record downloaded.")}
                        className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                        disabled={workingFileId === file.id || deletingFileId === file.id}
                      >
                        {workingFileId === file.id ? "Preparing..." : "Download"}
                      </button>
                      <button
                        onClick={() => handleDeleteFile(file)}
                        className="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                        disabled={workingFileId === file.id || deletingFileId === file.id}
                      >
                        {deletingFileId === file.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!owned.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                    You have not uploaded any records yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
