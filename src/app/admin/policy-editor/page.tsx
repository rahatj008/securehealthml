"use client";

import { useEffect, useState } from "react";
import AppShell from "../../components/AppShell";
import { apiFetch } from "../../lib/api";
import { useAuthGuard } from "../../lib/auth";
import { adminNav } from "../../lib/nav";

type PolicyRow = {
  id: string;
  filename: string;
  security_level: string;
  owner_email: string | null;
  policy: {
    roles: string[];
    departments: string[];
    minClearance: number;
  };
};

export default function PolicyEditorPage() {
  const { token, user, ready, logout } = useAuthGuard("admin");
  const [rows, setRows] = useState<PolicyRow[]>([]);
  const [message, setMessage] = useState("");

  async function loadPolicies() {
    const data = await apiFetch("/admin/policies", token || undefined);
    setRows(data.policies || []);
  }

  useEffect(() => {
    if (!token) return;
    loadPolicies().catch(() => null);
  }, [token]);

  async function updatePolicy(row: PolicyRow) {
    try {
      await apiFetch(`/admin/policies/${row.id}`, token || undefined, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row.policy),
      });
      setMessage(`Policy saved for ${row.filename}`);
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
        <p className="text-lg font-semibold">ABAC Policy Editor</p>
        <p className="text-sm text-slate-500">Edit per-file access roles, departments, and minimum clearance.</p>

        <div className="mt-6 space-y-4">
          {rows.map((row, idx) => (
            <div key={row.id} className="rounded-2xl border border-slate-100 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-800">{row.filename}</p>
                  <p className="text-xs text-slate-500">Owner: {row.owner_email || "Unknown"} • {row.security_level}</p>
                </div>
                <button onClick={() => updatePolicy(row)} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white">
                  Save Policy
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <input
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={row.policy.roles.join(",")}
                  onChange={(e) => {
                    const roles = e.target.value.split(",").map((x) => x.trim()).filter(Boolean);
                    setRows((prev) => {
                      const next = [...prev];
                      next[idx] = { ...row, policy: { ...row.policy, roles } };
                      return next;
                    });
                  }}
                  placeholder="roles (comma-separated)"
                />
                <input
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={row.policy.departments.join(",")}
                  onChange={(e) => {
                    const departments = e.target.value.split(",").map((x) => x.trim()).filter(Boolean);
                    setRows((prev) => {
                      const next = [...prev];
                      next[idx] = { ...row, policy: { ...row.policy, departments } };
                      return next;
                    });
                  }}
                  placeholder="departments (comma-separated)"
                />
                <input
                  type="number"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={row.policy.minClearance}
                  onChange={(e) => {
                    const minClearance = Number(e.target.value);
                    setRows((prev) => {
                      const next = [...prev];
                      next[idx] = { ...row, policy: { ...row.policy, minClearance } };
                      return next;
                    });
                  }}
                  placeholder="min clearance"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {message ? <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</div> : null}
    </AppShell>
  );
}
