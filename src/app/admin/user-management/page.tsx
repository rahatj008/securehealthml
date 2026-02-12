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
};

type UserDraft = {
  full_name: string;
  role: string;
  department: string;
  clearance: number;
  is_active: boolean;
  password: string;
};

export default function UserManagementPage() {
  const { token, user, ready, logout } = useAuthGuard("admin");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});
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
    const data = await apiFetch("/admin/users", token || undefined);
    const list = (data.users || []) as UserRow[];
    setUsers(list);

    const nextDrafts: Record<string, UserDraft> = {};
    list.forEach((u) => {
      nextDrafts[u.id] = drafts[u.id] ? { ...drafts[u.id], password: "" } : toDraft(u);
    });
    setDrafts(nextDrafts);
  }

  useEffect(() => {
    if (!token) return;
    loadUsers().catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    try {
      await apiFetch("/admin/users", token || undefined, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setForm({ email: "", password: "", fullName: "", role: "clinician", department: "general", clearance: 1 });
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
      if (draft.password.trim()) {
        payload.password = draft.password.trim();
      }

      await apiFetch(`/admin/users/${id}`, token || undefined, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setMessage("User updated.");
      await loadUsers();
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
      subtitle="Administrator Security Console"
      userName={user.full_name || user.email}
      userMeta={`Admin • Clearance ${user.clearance}`}
      onLogout={logout}
      nav={adminNav}
    >
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-lg font-semibold">Create User</p>
        <form onSubmit={createUser} className="mt-4 grid gap-3 md:grid-cols-3">
          <input className="rounded-2xl border border-slate-200 px-4 py-2 text-sm" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="rounded-2xl border border-slate-200 px-4 py-2 text-sm" placeholder="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          <input type="password" className="rounded-2xl border border-slate-200 px-4 py-2 text-sm" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <input className="rounded-2xl border border-slate-200 px-4 py-2 text-sm" placeholder="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
          <input className="rounded-2xl border border-slate-200 px-4 py-2 text-sm" placeholder="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          <input type="number" className="rounded-2xl border border-slate-200 px-4 py-2 text-sm" placeholder="Clearance" value={form.clearance} onChange={(e) => setForm({ ...form, clearance: Number(e.target.value) })} />
          <button className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white md:col-span-3">Create User</button>
        </form>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-lg font-semibold">User Directory (Inline Editable)</p>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-100">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Dept</th>
                <th className="px-4 py-3">Clearance</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Reset Password</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const d = drafts[u.id] || toDraft(u);
                return (
                  <tr key={u.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={d.full_name} onChange={(e) => patchDraft(u.id, { full_name: e.target.value })} />
                    </td>
                    <td className="px-4 py-3 text-slate-500">{u.email}</td>
                    <td className="px-4 py-3">
                      <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={d.role} onChange={(e) => patchDraft(u.id, { role: e.target.value })} />
                    </td>
                    <td className="px-4 py-3">
                      <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={d.department} onChange={(e) => patchDraft(u.id, { department: e.target.value })} />
                    </td>
                    <td className="px-4 py-3">
                      <input type="number" className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm" value={d.clearance} onChange={(e) => patchDraft(u.id, { clearance: Number(e.target.value) })} />
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => patchDraft(u.id, { is_active: !d.is_active })} className={`rounded-full px-3 py-1 text-xs font-semibold ${d.is_active ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                        {d.is_active ? "Active" : "Disabled"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <input type="password" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="new password" value={d.password} onChange={(e) => patchDraft(u.id, { password: e.target.value })} />
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => saveUser(u.id)} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Save</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {message ? <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</div> : null}
    </AppShell>
  );
}
