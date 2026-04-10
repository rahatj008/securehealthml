"use client";

import { useEffect, useEffectEvent, useState } from "react";
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

type PolicyResponse = {
  policies?: PolicyRow[];
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

export default function PolicyEditorPage() {
  const { token, user, ready, logout } = useAuthGuard("admin");
  const [rows, setRows] = useState<PolicyRow[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [roleOptions, setRoleOptions] = useState<string[]>(DEFAULT_ROLE_OPTIONS);
  const [clearanceOptions, setClearanceOptions] = useState<number[]>(DEFAULT_CLEARANCE_OPTIONS);
  const [newDepartment, setNewDepartment] = useState("");
  const [message, setMessage] = useState("");

  async function fetchPoliciesData() {
    return apiFetch<PolicyResponse>("/admin/policies", token || undefined);
  }

  function applyPolicies(data: PolicyResponse) {
    setRows(data.policies || []);
    setDepartments(data.departments || []);
    setRoleOptions(data.roleOptions || DEFAULT_ROLE_OPTIONS);
    setClearanceOptions(data.clearanceOptions || DEFAULT_CLEARANCE_OPTIONS);
  }

  const syncPolicies = useEffectEvent(async () => {
    const data = await fetchPoliciesData();
    applyPolicies(data);
  });

  async function refreshPolicies() {
    const data = await fetchPoliciesData();
    applyPolicies(data);
  }

  useEffect(() => {
    if (!token) return;
    syncPolicies().catch((err) => setMessage((err as Error).message));
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
      setNewDepartment("");
      setMessage("Department created.");
      await refreshPolicies();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  function toggleRole(rowIndex: number, role: string) {
    setRows((prev) => {
      const next = [...prev];
      const current = next[rowIndex];
      const roleSet = new Set(current.policy.roles || []);
      if (roleSet.has(role)) {
        roleSet.delete(role);
      } else {
        roleSet.add(role);
      }
      next[rowIndex] = {
        ...current,
        policy: {
          ...current.policy,
          roles: [...roleSet],
        },
      };
      return next;
    });
  }

  function toggleDepartment(rowIndex: number, department: string) {
    setRows((prev) => {
      const next = [...prev];
      const current = next[rowIndex];
      const depSet = new Set(current.policy.departments || []);
      if (depSet.has(department)) {
        depSet.delete(department);
      } else {
        depSet.add(department);
      }
      next[rowIndex] = {
        ...current,
        policy: {
          ...current.policy,
          departments: [...depSet],
        },
      };
      return next;
    });
  }

  async function updatePolicy(row: PolicyRow) {
    if (!row.policy.roles.length || !row.policy.departments.length) {
      setMessage("Each policy needs at least one role and one department.");
      return;
    }

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
      <section className="surface-card-strong rounded-[2rem] p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-600">Policy editor</p>
            <h1 className="mt-3 text-2xl font-semibold text-slate-900 sm:text-3xl">
              Tune file-level ABAC rules so the right teams can access the right records.
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Each record can be updated with allowed roles, approved departments, and the minimum clearance required.
            </p>
          </div>
          <span className="status-pill bg-blue-50 text-blue-700">Role + department + clearance</span>
        </div>
      </section>

      <section className="surface-card rounded-[1.8rem] p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-semibold text-slate-900">Department management</p>
            <p className="mt-1 text-sm text-slate-500">Create departments that can be attached to file policies.</p>
          </div>
          <span className="status-pill bg-slate-100 text-slate-600">{departments.length} departments</span>
        </div>

        <form onSubmit={createDepartment} className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
            placeholder="Create department"
            value={newDepartment}
            onChange={(e) => setNewDepartment(e.target.value)}
          />
          <button className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-200">
            Add
          </button>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          {departments.map((d) => (
            <span key={d} className="status-pill bg-slate-100 text-slate-700">
              {d}
            </span>
          ))}
        </div>
      </section>

      <section className="surface-card rounded-[1.8rem] p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-semibold text-slate-900">ABAC policy editor</p>
            <p className="mt-1 text-sm text-slate-500">Define access for each uploaded file individually.</p>
          </div>
          <span className="status-pill bg-emerald-50 text-emerald-700">{rows.length} tracked files</span>
        </div>

        {!rows.length ? (
          <div className="mt-6 rounded-[1.4rem] border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            No files found. Upload at least one file to configure file-level ABAC policies.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {rows.map((row, idx) => (
              <div key={row.id} className="rounded-[1.5rem] border border-slate-100 bg-white px-4 py-4 sm:px-5 sm:py-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-base font-semibold text-slate-900">{row.filename}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Owner: {row.owner_email || "Unknown"} | {row.security_level}
                    </p>
                  </div>
                  <button
                    onClick={() => updatePolicy(row)}
                    className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-200"
                  >
                    Save policy
                  </button>
                </div>

                <div className="mt-5 grid gap-5 lg:grid-cols-3">
                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Roles</p>
                    <div className="flex flex-wrap gap-2">
                      {roleOptions.map((role) => {
                        const selected = row.policy.roles?.includes(role);
                        return (
                          <button
                            key={role}
                            type="button"
                            onClick={() => toggleRole(idx, role)}
                            className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                              selected ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            }`}
                          >
                            {role}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Departments</p>
                    <div className="flex flex-wrap gap-2">
                      {departments.map((dep) => {
                        const selected = row.policy.departments?.includes(dep);
                        return (
                          <button
                            key={dep}
                            type="button"
                            onClick={() => toggleDepartment(idx, dep)}
                            className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                              selected ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            }`}
                          >
                            {dep}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Min clearance</p>
                    <select
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                      value={row.policy.minClearance}
                      onChange={(e) => {
                        const minClearance = Number(e.target.value);
                        setRows((prev) => {
                          const next = [...prev];
                          next[idx] = { ...row, policy: { ...row.policy, minClearance } };
                          return next;
                        });
                      }}
                    >
                      {clearanceOptions.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {message ? (
        <div className="rounded-[1.5rem] border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {message}
        </div>
      ) : null}
    </AppShell>
  );
}
