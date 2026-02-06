export function evaluatePolicy(user, policy) {
  if (!policy) return { allowed: false, reason: "Policy missing" };

  const roleOk = policy.roles?.length ? policy.roles.includes(user.role) : true;
  const deptOk = policy.departments?.length
    ? policy.departments.includes(user.department)
    : true;
  const clearanceOk =
    typeof policy.minClearance === "number"
      ? user.clearance >= policy.minClearance
      : true;

  const allowed = roleOk && deptOk && clearanceOk;
  const reason = allowed
    ? "ABAC policy satisfied"
    : "ABAC policy mismatch";

  return { allowed, reason };
}
