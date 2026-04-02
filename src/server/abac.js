function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export function evaluatePolicy(user, policy) {
  if (!policy) return { allowed: false, reason: "Policy missing" };

  const userRole = normalize(user.role);
  const userDepartment = normalize(user.department);
  const roles = (policy.roles || []).map(normalize);
  const departments = (policy.departments || []).map(normalize);
  const minClearance = Number(policy.minClearance ?? 0);

  const roleOk = roles.length ? roles.includes(userRole) : true;
  const deptOk = departments.length ? departments.includes(userDepartment) : true;
  const clearanceOk = Number.isFinite(minClearance)
    ? Number(user.clearance) >= minClearance
    : true;

  const allowed = roleOk && deptOk && clearanceOk;
  const reason = allowed ? "ABAC policy satisfied" : "ABAC policy mismatch";

  return { allowed, reason };
}
