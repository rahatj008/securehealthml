"use client";

import { useEffect, useState } from "react";
import AppShell from "../../components/AppShell";
import { apiFetch } from "../../lib/api";
import { useAuthGuard } from "../../lib/auth";
import { adminNav } from "../../lib/nav";

type UserRow = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  department: string;
  clearance: number;
  is_active: boolean;
  mfa_enabled?: boolean;
  mfa_method?: string | null;
};

type UserDraft = {
  full_name: string;
  role: string;
  department: string;
  clearance: number;
  is_active: boolean;
  password: string;
};

type UsersResponse = {
  users?: UserRow[];
  departments?: string[];
  roleOptions?: string[];
  clearanceOptions?: number[];
};

type DepartmentListResponse = {
  departments?: Array<{ name?: string } | string>;
};

const DEFAULT_ROLE_OPTIONS = [
  "admin",
  "clinician",
  "radiology",
  "staff",
  "er",
  "pharmacist",
  "reporting-doctor",
];
const DEFAULT_CLEARANCE_OPTIONS = [1, 2, 3, 4, 5];

export default function UserManagementPage() {
  const { token, user, ready, logout } = useAuthGuard("admin");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});
  const [departments, setDepartments] = useState<string[]>([]);
  const [roleOptions, setRoleOptions] = useState<string[]>(DEFAULT_ROLE_OPTIONS);
  const [clearanceOptions, setClearanceOptions] = useState<number[]>(DEFAULT_CLEARANCE_OPTIONS);
  const [newDepartment, setNewDepartment] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    email: "",
    password: "",
    fullName: "",
    role: "clinician",
    department: "general",
    clearance: 1,
  });

  function toDraft(u: UserRow): UserDraft {
    return {
      full_name: u.full_name,
      role: u.role,
      department: u.department,
      clearance: u.clearance,
      is_active: u.is_active,
      password: "",
    };
  }

  async function loadUsers() {
    const data = await apiFetch<UsersResponse>("/admin/users", token || undefined);
    const list = (data.users || []) as UserRow[];
    setUsers(list);
    setDepartments(data.departments || []);
    setRoleOptions(data.roleOptions || DEFAULT_ROLE_OPTIONS);
    setClearanceOptions(data.clearanceOptions || DEFAULT_CLEARANCE_OPTIONS);

    const nextDrafts: Record<string, UserDraft> = {};
    list.forEach((u) => {
      nextDrafts[u.id] = drafts[u.id] ? { ...drafts[u.id], password: "" } : toDraft(u);
    });
    setDrafts(nextDrafts);
  }

  useEffect(() => {
    if (!token) return;
    loadUsers().catch((err) => setMessage((err as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function createDepartment(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    if (!newDepartment.trim()) {
      setMessage("Department name required.");
      return;
    }

    try {
      const data = await apiFetch<DepartmentListResponse>("/admin/departments", token || undefined, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newDepartment }),
      });
      setDepartments(
        (data.departments || [])
          .map((d: { name?: string } | string) => (typeof d === "string" ? d : d.name || ""))
          .filter(Boolean)
      );
      if (!form.department && data.departments?.[0]) {
        const first = typeof data.departments[0] === "string" ? data.departments[0] : data.departments[0].name || "";
        setForm((prev) => ({ ...prev, department: first }));
      }
      setNewDepartment("");
      setMessage("Department created.");
      await loadUsers();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    try {
      await apiFetch("/admin/users", token || undefined, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setForm({
        email: "",
        password: "",
        fullName: "",
        role: roleOptions[0] || "clinician",
        department: departments[0] || "general",
        clearance: clearanceOptions[0] || 1,
      });
      setMessage("User created.");
      await loadUsers();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  function patchDraft(id: string, patch: Partial<UserDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  }

  async function saveUser(id: string) {
    const draft = drafts[id];
    if (!draft) return;

    try {
      const payload: Record<string, unknown> = {
        fullName: draft.full_name,
        role: draft.role,
        department: draft.department,
        clearance: Number(draft.clearance),
        isActive: draft.is_active,
      };
      await apiFetch(`/admin/users/${id}`, token || undefined, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (draft.password.trim()) {
        await apiFetch(`/admin/users/${id}/reset-password`, token || undefined, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: draft.password.trim() }),
        });
        setMessage("User updated and password reset.");
      } else {
        setMessage("User updated.");
      }

      await loadUsers();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function resetMfa(id: string, email: string) {
    const confirmed = window.confirm(`Reset MFA for ${email}? They will be able to sign in with password only until MFA is re-enabled.`);
    if (!confirmed) {
      return;
    }

    try {
      await apiFetch(`/admin/users/${id}/mfa/reset`, token || undefined, {
        method: "POST",
      });
      setMessage(`MFA reset for ${email}.`);
      await loadUsers();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

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
            <p className="page-eyebrow text-blue-600">User management</p>
            <h1 className="page-title">
              Create users, manage departments, and edit trust attributes without losing mobile usability.
            </h1>
            <p className="page-copy">
              Administrators can change role, department, clearance, account status, and password resets from one
              workspace.
            </p>
          </div>
          <span className="hero-chip bg-blue-50 text-blue-700">Inline admin controls</span>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="section-card">
          <div className="section-header">
            <div>
              <p className="section-title">Department management</p>
              <p className="section-copy mt-1">Create departments used by policies and user assignments.</p>
            </div>
            <span className="status-pill bg-slate-100 text-slate-600">{departments.length} departments</span>
          </div>

          <form onSubmit={createDepartment} className="mt-5 flex flex-col gap-3 sm:flex-row">
            <input
              className="control-input flex-1"
              placeholder="Create department"
              value={newDepartment}
              onChange={(e) => setNewDepartment(e.target.value)}
            />
            <button className="button-primary">Add</button>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            {departments.map((d) => (
              <span key={d} className="status-pill bg-slate-100 text-slate-700">
                {d}
              </span>
            ))}
          </div>
        </section>

        <section className="section-card">
          <div className="section-header">
            <div>
              <p className="section-title">Create user</p>
              <p className="section-copy mt-1">Add a new account with its initial role and clearance.</p>
            </div>
            <span className="status-pill bg-emerald-50 text-emerald-700">Seeded for ABAC</span>
          </div>

          <form onSubmit={createUser} className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <input
              className="control-input"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <input
              className="control-input"
              placeholder="Full name"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
            <input
              type="password"
              className="control-input"
              placeholder="Password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />

            <select
              className="control-select"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>

            <select
              className="control-select"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            >
              {departments.map((dep) => (
                <option key={dep} value={dep}>
                  {dep}
                </option>
              ))}
            </select>

            <select
              className="control-select"
              value={form.clearance}
              onChange={(e) => setForm({ ...form, clearance: Number(e.target.value) })}
            >
              {clearanceOptions.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>

            <button className="button-primary md:col-span-2 xl:col-span-3">
              Create user
            </button>
          </form>
        </section>
      </div>

      <section className="section-card">
        <div className="section-header">
          <div>
            <p className="section-title">User directory</p>
            <p className="section-copy mt-1">Edit user details inline and save changes immediately.</p>
          </div>
          <span className="status-pill bg-slate-100 text-slate-600">{users.length} accounts</span>
        </div>

        <div className="mt-5 space-y-4 md:hidden">
          {users.length ? (
            users.map((u) => {
              const d = drafts[u.id] || toDraft(u);
              return (
                <div key={u.id} className="mobile-data-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-slate-900">{u.email}</p>
                      <p className="mt-1 text-sm text-slate-500">{u.full_name}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <button
                        onClick={() => patchDraft(u.id, { is_active: !d.is_active })}
                        className={`status-pill ${
                          d.is_active ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {d.is_active ? "Active" : "Disabled"}
                      </button>
                      <span
                        className={`status-pill ${
                          u.mfa_enabled ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {u.mfa_enabled ? "MFA on" : "MFA off"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3">
                    <input
                      className="control-input"
                      value={d.full_name}
                      onChange={(e) => patchDraft(u.id, { full_name: e.target.value })}
                    />
                    <select
                      className="control-select"
                      value={d.role}
                      onChange={(e) => patchDraft(u.id, { role: e.target.value })}
                    >
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <select
                      className="control-select"
                      value={d.department}
                      onChange={(e) => patchDraft(u.id, { department: e.target.value })}
                    >
                      {departments.map((dep) => (
                        <option key={dep} value={dep}>
                          {dep}
                        </option>
                      ))}
                    </select>
                    <select
                      className="control-select"
                      value={d.clearance}
                      onChange={(e) => patchDraft(u.id, { clearance: Number(e.target.value) })}
                    >
                      {clearanceOptions.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                    <input
                      type="password"
                      className="control-input"
                      placeholder="New password"
                      value={d.password}
                      onChange={(e) => patchDraft(u.id, { password: e.target.value })}
                    />
                    <button
                      onClick={() => saveUser(u.id)}
                      className="button-primary"
                    >
                      Save user
                    </button>
                    <button
                      onClick={() => resetMfa(u.id, u.email)}
                      className="button-warning-soft"
                    >
                      Reset MFA
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty-state text-sm">No users are available yet.</div>
          )}
        </div>

        <div className="table-shell mt-5 hidden overflow-x-auto md:block">
          <table className="table-base min-w-[980px]">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Dept</th>
                <th className="px-4 py-3">Clearance</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">MFA</th>
                <th className="px-4 py-3">Reset password</th>
                <th className="px-4 py-3">Recovery</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const d = drafts[u.id] || toDraft(u);
                return (
                <tr key={u.id} className="table-row">
                  <td className="px-4 py-3">
                    <input
                        className="control-input"
                        value={d.full_name}
                        onChange={(e) => patchDraft(u.id, { full_name: e.target.value })}
                      />
                    </td>
                    <td className="px-4 py-3 text-slate-500">{u.email}</td>
                    <td className="px-4 py-3">
                      <select
                        className="control-select"
                        value={d.role}
                        onChange={(e) => patchDraft(u.id, { role: e.target.value })}
                      >
                        {roleOptions.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className="control-select"
                        value={d.department}
                        onChange={(e) => patchDraft(u.id, { department: e.target.value })}
                      >
                        {departments.map((dep) => (
                          <option key={dep} value={dep}>
                            {dep}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className="control-select w-24"
                        value={d.clearance}
                        onChange={(e) => patchDraft(u.id, { clearance: Number(e.target.value) })}
                      >
                        {clearanceOptions.map((level) => (
                          <option key={level} value={level}>
                            {level}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => patchDraft(u.id, { is_active: !d.is_active })}
                        className={`status-pill ${
                          d.is_active ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {d.is_active ? "Active" : "Disabled"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`status-pill ${
                          u.mfa_enabled ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {u.mfa_enabled ? "Email OTP" : "Off"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="password"
                        className="control-input"
                        placeholder="New password"
                        value={d.password}
                        onChange={(e) => patchDraft(u.id, { password: e.target.value })}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => resetMfa(u.id, u.email)}
                        className="button-pill-warning"
                      >
                        Reset MFA
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => saveUser(u.id)}
                        className="button-primary"
                      >
                        Save
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {message ? (
        <div className="alert-card alert-info">{message}</div>
      ) : null}
    </AppShell>
  );
}
