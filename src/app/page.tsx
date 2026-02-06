"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type User = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  department: string;
  clearance: number;
};

type FileRow = {
  id: string;
  filename: string;
  security_level: string;
  size_bytes: number;
  created_at: string;
  policy: {
    roles: string[];
    departments: string[];
    minClearance: number;
  };
};

type AuditLog = {
  id: string;
  action: string;
  decision: string;
  reason: string | null;
  email: string | null;
  filename: string | null;
  created_at: string;
};

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [message, setMessage] = useState<string>("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  const [authForm, setAuthForm] = useState({
    email: "",
    password: "",
    fullName: "",
    role: "clinician",
    department: "radiology",
    clearance: 2,
  });

  const [uploadForm, setUploadForm] = useState({
    roles: "clinician,admin",
    departments: "radiology",
    minClearance: "2",
    securityLevel: "Restricted",
  });

  const [fileToUpload, setFileToUpload] = useState<File | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("securhealth_token");
    const storedUser = localStorage.getItem("securhealth_user");
    if (stored) setToken(stored);
    if (storedUser) setUser(JSON.parse(storedUser));
  }, []);

  useEffect(() => {
    if (token) {
      fetchFiles();
      fetchAudit();
    }
  }, [token]);

  const authHeaders: HeadersInit | undefined = token
    ? { Authorization: `Bearer ${token}` }
    : undefined;

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    const endpoint = authMode === "login" ? "/auth/login" : "/auth/register";
    const payload =
      authMode === "login"
        ? { email: authForm.email, password: authForm.password }
        : {
            email: authForm.email,
            password: authForm.password,
            fullName: authForm.fullName,
            role: authForm.role,
            department: authForm.department,
            clearance: Number(authForm.clearance),
          };

    const res = await fetch(`${API_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Authentication failed");
      return;
    }

    setToken(data.token);
    setUser(data.user);
    localStorage.setItem("securhealth_token", data.token);
    localStorage.setItem("securhealth_user", JSON.stringify(data.user));
  }

  async function fetchFiles() {
    const res = await fetch(`${API_URL}/files`, {
      headers: authHeaders,
    });
    const data = await res.json();
    if (res.ok) setFiles(data.files || []);
  }

  async function fetchAudit() {
    const res = await fetch(`${API_URL}/audit`, {
      headers: authHeaders,
    });
    const data = await res.json();
    if (res.ok) setLogs(data.logs || []);
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!fileToUpload) {
      setMessage("Please choose a file.");
      return;
    }
    const formData = new FormData();
    formData.append("file", fileToUpload);
    formData.append("roles", uploadForm.roles);
    formData.append("departments", uploadForm.departments);
    formData.append("minClearance", uploadForm.minClearance);
    formData.append("securityLevel", uploadForm.securityLevel);

    const res = await fetch(`${API_URL}/files/upload`, {
      method: "POST",
      headers: authHeaders,
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Upload failed");
      return;
    }
    setMessage("Upload successful.");
    setFileToUpload(null);
    fetchFiles();
    fetchAudit();
  }

  async function handleDownload(id: string) {
    const res = await fetch(`${API_URL}/files/download/${id}`, {
      headers: authHeaders,
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Download denied");
      return;
    }
    window.open(data.url, "_blank");
  }

  function handleLogout() {
    setToken(null);
    setUser(null);
    localStorage.removeItem("securhealth_token");
    localStorage.removeItem("securhealth_user");
  }

  return (
    <div className="min-h-screen bg-grid text-slate-900">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-slate-50" />
      <div className="relative">
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M12 2l7 4v6c0 5-3.8 9-7 10-3.2-1-7-5-7-10V6l7-4z" />
                <path d="M9.5 12l1.8 1.8 3.7-3.7" />
              </svg>
            </div>
            <div>
              <p className="text-lg font-semibold">SecurHealth ML</p>
              <p className="text-xs text-slate-500">EHR Sharing with Proactive Threat Detection</p>
            </div>
          </div>
          <div className="hidden max-w-xl flex-1 items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm md:flex">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input className="w-full bg-transparent text-sm text-slate-600 outline-none" placeholder="Search patients, files, or owners..." />
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                  {user.full_name?.slice(0, 2).toUpperCase() || "US"}
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold">{user.full_name || user.email}</p>
                  <p className="text-xs text-slate-500">{user.role} • Clearance {user.clearance}</p>
                </div>
                <button onClick={handleLogout} className="ml-3 text-xs font-semibold text-rose-500">Logout</button>
              </div>
            ) : null}
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pb-16">
          <section className="grid gap-6 lg:grid-cols-[260px_1fr]">
            <aside className="flex h-fit flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <button className="flex items-center gap-3 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
                Dashboard
              </button>
              <nav className="flex flex-col gap-2 text-sm font-medium text-slate-500">
                {[
                  "My Records",
                  "Shared with Me",
                  "Department Folders",
                  "Access Requests",
                  "Compliance Reports",
                  "Settings",
                ].map((item) => (
                  <button key={item} className="flex items-center justify-between rounded-2xl px-4 py-3 text-left hover:bg-slate-50">
                    <span>{item}</span>
                    {item === "Access Requests" ? (
                      <span className="rounded-full bg-rose-500 px-2 py-0.5 text-xs text-white">15</span>
                    ) : null}
                  </button>
                ))}
              </nav>
              <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
                System Secure
                <span className="mt-1 block text-[11px] text-emerald-600">Last audit: 12m ago</span>
              </div>
            </aside>

            <div className="flex flex-col gap-6">
              {!token ? (
                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-semibold">Secure Login</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setAuthMode("login")}
                        className={`rounded-full px-4 py-2 text-sm font-semibold ${authMode === "login" ? "bg-blue-600 text-white" : "border border-slate-200 text-slate-600"}`}
                      >
                        Login
                      </button>
                      <button
                        onClick={() => setAuthMode("register")}
                        className={`rounded-full px-4 py-2 text-sm font-semibold ${authMode === "register" ? "bg-blue-600 text-white" : "border border-slate-200 text-slate-600"}`}
                      >
                        Register
                      </button>
                    </div>
                  </div>

                  <form onSubmit={handleAuthSubmit} className="mt-4 grid gap-3 md:grid-cols-2">
                    <input
                      className="rounded-2xl border border-slate-200 px-4 py-2 text-sm"
                      placeholder="Email"
                      value={authForm.email}
                      onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                    />
                    <input
                      type="password"
                      className="rounded-2xl border border-slate-200 px-4 py-2 text-sm"
                      placeholder="Password"
                      value={authForm.password}
                      onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                    />
                    {authMode === "register" ? (
                      <>
                        <input
                          className="rounded-2xl border border-slate-200 px-4 py-2 text-sm"
                          placeholder="Full name"
                          value={authForm.fullName}
                          onChange={(e) => setAuthForm({ ...authForm, fullName: e.target.value })}
                        />
                        <input
                          className="rounded-2xl border border-slate-200 px-4 py-2 text-sm"
                          placeholder="Role (clinician/admin)"
                          value={authForm.role}
                          onChange={(e) => setAuthForm({ ...authForm, role: e.target.value })}
                        />
                        <input
                          className="rounded-2xl border border-slate-200 px-4 py-2 text-sm"
                          placeholder="Department"
                          value={authForm.department}
                          onChange={(e) => setAuthForm({ ...authForm, department: e.target.value })}
                        />
                        <input
                          type="number"
                          className="rounded-2xl border border-slate-200 px-4 py-2 text-sm"
                          placeholder="Clearance"
                          value={authForm.clearance}
                          onChange={(e) => setAuthForm({ ...authForm, clearance: Number(e.target.value) })}
                        />
                      </>
                    ) : null}
                    <button className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white md:col-span-2">
                      {authMode === "login" ? "Authenticate" : "Create Account"}
                    </button>
                  </form>
                </div>
              ) : (
                <>
                  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-start gap-4">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.7">
                            <path d="M12 2l7 4v6c0 5-3.8 9-7 10-3.2-1-7-5-7-10V6l7-4z" />
                            <path d="M9.5 12l1.8 1.8 3.7-3.7" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-lg font-semibold">Security Status: Authenticated</p>
                          <p className="text-sm text-slate-500">
                            ABE + ABAC enforced with XGBoost real-time anomaly detection.
                          </p>
                        </div>
                      </div>
                      <button onClick={fetchAudit} className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-200">
                        Refresh Audit Log
                      </button>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-lg font-semibold">Upload Secure EHR</p>
                        <p className="text-sm text-slate-500">Upload triggers ABAC + ML threat detection before storage.</p>
                      </div>
                    </div>

                    <form onSubmit={handleUpload} className="mt-4 grid gap-3 md:grid-cols-2">
                      <input type="file" onChange={(e) => setFileToUpload(e.target.files?.[0] || null)} />
                      <input
                        className="rounded-2xl border border-slate-200 px-4 py-2 text-sm"
                        placeholder="Roles allowed (comma-separated)"
                        value={uploadForm.roles}
                        onChange={(e) => setUploadForm({ ...uploadForm, roles: e.target.value })}
                      />
                      <input
                        className="rounded-2xl border border-slate-200 px-4 py-2 text-sm"
                        placeholder="Departments allowed"
                        value={uploadForm.departments}
                        onChange={(e) => setUploadForm({ ...uploadForm, departments: e.target.value })}
                      />
                      <input
                        className="rounded-2xl border border-slate-200 px-4 py-2 text-sm"
                        placeholder="Minimum clearance"
                        value={uploadForm.minClearance}
                        onChange={(e) => setUploadForm({ ...uploadForm, minClearance: e.target.value })}
                      />
                      <input
                        className="rounded-2xl border border-slate-200 px-4 py-2 text-sm"
                        placeholder="Security level"
                        value={uploadForm.securityLevel}
                        onChange={(e) => setUploadForm({ ...uploadForm, securityLevel: e.target.value })}
                      />
                      <button className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white md:col-span-2">
                        Upload & Evaluate
                      </button>
                    </form>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                      <p className="text-lg font-semibold">Document Repository</p>
                      <button onClick={fetchFiles} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">
                        Refresh
                      </button>
                    </div>

                    <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase text-slate-400">
                          <tr>
                            <th className="px-4 py-3">File Name</th>
                            <th className="px-4 py-3">Security Level</th>
                            <th className="px-4 py-3">Policy</th>
                            <th className="px-4 py-3">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {files.map((file) => (
                            <tr key={file.id} className="border-t border-slate-100">
                              <td className="px-4 py-4">
                                <p className="font-semibold text-slate-700">{file.filename}</p>
                                <p className="text-xs text-slate-400">{new Date(file.created_at).toLocaleString()}</p>
                              </td>
                              <td className="px-4 py-4 text-slate-500">{file.security_level}</td>
                              <td className="px-4 py-4 text-slate-500">
                                Role: {file.policy?.roles?.join(", ")} • Dept: {file.policy?.departments?.join(", ")} • MinC: {file.policy?.minClearance}
                              </td>
                              <td className="px-4 py-4">
                                <button
                                  onClick={() => handleDownload(file.id)}
                                  className="rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white"
                                >
                                  Download
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-lg font-semibold">Audit & Threat Log</p>
                    <p className="text-sm text-slate-500">Every decision feeds the ML feedback loop.</p>
                    <div className="mt-4 space-y-3">
                      {logs.slice(0, 8).map((log) => (
                        <div key={log.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                          <p className="font-semibold text-slate-700">
                            {log.action.toUpperCase()} • {log.decision.toUpperCase()}
                          </p>
                          <p className="text-xs text-slate-500">
                            {log.email || "Unknown"} • {log.filename || "No file"} • {new Date(log.created_at).toLocaleString()}
                          </p>
                          {log.reason ? <p className="text-xs text-slate-500">Reason: {log.reason}</p> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {message ? (
                <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                  {message}
                </div>
              ) : null}
            </div>
          </section>

          <section className="grid gap-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-500">System Flow</p>
              <h2 className="mt-3 text-3xl font-semibold">Proactive Security Lifecycle</h2>
              <p className="mt-3 text-sm text-slate-500">
                Authentication, ABAC policy evaluation, and XGBoost anomaly detection are executed for every action.
              </p>

              <div className="mt-6 space-y-5">
                {[
                  "User Request Initiation: Login, upload, or download via the web portal",
                  "Authentication Phase: Credential validation and logging of failed attempts",
                  "Authorization Phase: ABAC policy evaluation for role, department, clearance",
                  "Real-Time ML Detection: Behavioral + content analytics feed the XGBoost engine",
                  "Threat Decision Point: Normal or anomalous classification in milliseconds",
                  "Normal Path: Encrypted storage and retrieval with immutable audit logging",
                  "Anomaly Path: Alerts, session termination, and administrator notification",
                  "Feedback Loop: Activity logs continuously update the ML dataset",
                ].map((item, index) => (
                  <div key={item} className="relative flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-sm font-semibold text-blue-700">
                        {index + 1}
                      </div>
                      {index < 7 ? <div className="h-full w-px bg-blue-100" /> : null}
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      {item}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
                <p className="text-sm font-semibold text-blue-700">Real-Time ML Threat Detection Layer</p>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3">
                    <p className="text-sm font-semibold">Behavioral Analysis</p>
                    <p className="text-xs text-slate-500">Session patterns, timing, access volume</p>
                  </div>
                  <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3">
                    <p className="text-sm font-semibold">Content Analysis</p>
                    <p className="text-xs text-slate-500">File headers, metadata, structure</p>
                  </div>
                  <div className="rounded-2xl border border-blue-200 bg-white px-4 py-3">
                    <p className="text-sm font-semibold">XGBoost Anomaly Detection Engine</p>
                    <p className="text-xs text-slate-500">Real-time classification and confidence scoring</p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
                <p className="text-sm font-semibold text-emerald-700">Secure File Management Core</p>
                <ul className="mt-3 space-y-2 text-sm text-emerald-700">
                  <li className="rounded-xl bg-white px-3 py-2">Secure Upload & Encryption (AES-256 + ABE)</li>
                  <li className="rounded-xl bg-white px-3 py-2">Secure Storage with Policy-Based Access Logs</li>
                  <li className="rounded-xl bg-white px-3 py-2">Secure Download & Decryption with ABAC Enforcement</li>
                </ul>
                <p className="mt-3 text-xs text-emerald-700">
                  AWS S3 backs encrypted object storage with server-side encryption and lifecycle governance.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-500">System Architecture</p>
            <h2 className="mt-3 text-3xl font-semibold">Clinical Workflow to Threat Intelligence</h2>
            <p className="mt-3 text-sm text-slate-500">
              The running architecture routes every action through secure gateways, ML threat scoring, and immutable audit pipelines.
            </p>

            <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_auto_1fr]">
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold">Clinical Users</p>
                  <p className="mt-1 text-xs text-slate-500">Physicians, nurses, on-call clinicians</p>
                  <p className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">SSO + MFA</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold">User Interface & API Gateway</p>
                  <p className="mt-1 text-xs text-slate-500">Next.js UI + Express API</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold">Upload Gateway</p>
                  <p className="mt-1 text-xs text-slate-500">Pre-validation and metadata extraction</p>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center gap-6 text-slate-300">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <svg key={idx} viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.4">
                    <path d="M4 12h16" />
                    <path d="M14 6l6 6-6 6" />
                  </svg>
                ))}
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm font-semibold text-blue-700">ML Threat Engine (XGBoost)</p>
                  <ul className="mt-2 space-y-1 text-xs text-blue-700">
                    <li>Ransomware detection</li>
                    <li>Data exfiltration anomalies</li>
                    <li>Fake medical document spotting</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-semibold text-emerald-700">Secure Storage</p>
                  <p className="mt-1 text-xs text-emerald-700">AES-256 encrypted S3 buckets + audit logs</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold">Access Audit & Reports</p>
                  <p className="mt-1 text-xs text-slate-500">HIPAA compliance dashboards and role-based logs</p>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
