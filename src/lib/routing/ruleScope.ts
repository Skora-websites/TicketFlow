import "server-only";
import { User, Department, type IRoutingRule } from "@/lib/db/models";

export interface ManagerScopePrincipal {
  departmentId?: string;
  id?: string;
}

export interface RuleScopeData {
  actions: { type: string; targetId?: string }[];
  fallbackAssigneeId?: string;
  fallbackDepartmentId?: string;
}

// Validates that every user/department a rule targets belongs to the
// manager's own department. Returns an error message, or null when in scope.
export async function validateManagerRuleScope(
  data: RuleScopeData,
  manager: ManagerScopePrincipal
): Promise<string | null> {
  if (!manager.departmentId) {
    return "Managers must belong to a department to manage routing rules";
  }
  const userIds: string[] = [];
  const deptIds: string[] = [];
  for (const a of data.actions) {
    if (!a.targetId) continue;
    if (a.type === "assign_user") userIds.push(a.targetId);
    else if (a.type === "assign_department") deptIds.push(a.targetId);
  }
  if (data.fallbackAssigneeId) userIds.push(data.fallbackAssigneeId);
  if (data.fallbackDepartmentId) deptIds.push(data.fallbackDepartmentId);

  if (userIds.length) {
    const users = await User.find({ _id: { $in: userIds } }, "departmentId").lean();
    if (users.some((u) => u.departmentId?.toString() !== manager.departmentId)) {
      return "Managers can only route to users in their own department";
    }
  }
  if (deptIds.length) {
    const depts = await Department.find({ _id: { $in: deptIds } }, "_id").lean();
    if (depts.some((d) => d._id.toString() !== manager.departmentId)) {
      return "Managers can only route to their own department";
    }
  }
  return null;
}

// Whether an existing rule is owned by (scoped to) the manager's department.
// Rules with no user/department targets are org-wide by nature (e.g. a
// super_admin's set_priority-only rule) and carry sensitive names/descriptions,
// so they are only in scope when the manager authored them (createdBy).
export async function isRuleInManagerScope(
  rule: IRoutingRule,
  manager: ManagerScopePrincipal
): Promise<boolean> {
  if (!manager.departmentId) return false;

  const hasTargets =
    (rule.actions ?? []).some((a) => a.targetId) ||
    !!rule.fallbackAssigneeId ||
    !!rule.fallbackDepartmentId;
  if (!hasTargets) {
    return !!rule.createdBy && rule.createdBy.toString() === manager.id;
  }

  const err = await validateManagerRuleScope(
    {
      actions: rule.actions ?? [],
      fallbackAssigneeId: rule.fallbackAssigneeId?.toString(),
      fallbackDepartmentId: rule.fallbackDepartmentId?.toString(),
    },
    manager
  );
  return err === null;
}

// Batched scope evaluation for rule lists: collects every user/department
// target across all rules, resolves them with two queries total, then checks
// each rule against the resulting maps (was 1–2 queries per rule).
export async function filterRulesInManagerScope<T extends IRoutingRule>(
  rules: T[],
  manager: ManagerScopePrincipal
): Promise<T[]> {
  if (!manager.departmentId) return [];

  const userIds = new Set<string>();
  const deptIds = new Set<string>();
  for (const rule of rules) {
    for (const a of rule.actions ?? []) {
      if (!a.targetId) continue;
      if (a.type === "assign_user") userIds.add(a.targetId);
      else if (a.type === "assign_department") deptIds.add(a.targetId);
    }
    if (rule.fallbackAssigneeId) userIds.add(rule.fallbackAssigneeId.toString());
    if (rule.fallbackDepartmentId) deptIds.add(rule.fallbackDepartmentId.toString());
  }

  const [outOfDeptUsers, foreignDepts] = await Promise.all([
    userIds.size
      ? User.find({ _id: { $in: [...userIds] }, departmentId: { $ne: manager.departmentId } }, "_id").lean()
      : Promise.resolve([]),
    deptIds.size
      ? Department.find({ _id: { $in: [...deptIds], $ne: manager.departmentId } }, "_id").lean()
      : Promise.resolve([]),
  ]);
  const outOfDeptUserSet = new Set(outOfDeptUsers.map((u) => u._id.toString()));
  const foreignDeptSet = new Set(foreignDepts.map((d) => d._id.toString()));

  const inScope = (rule: T): boolean => {
    // Targetless org-wide rules are only visible to their author.
    const hasTargets =
      (rule.actions ?? []).some((a) => a.targetId) ||
      !!rule.fallbackAssigneeId ||
      !!rule.fallbackDepartmentId;
    if (!hasTargets) {
      return !!rule.createdBy && rule.createdBy.toString() === manager.id;
    }
    for (const a of rule.actions ?? []) {
      if (!a.targetId) continue;
      if (a.type === "assign_user" && outOfDeptUserSet.has(a.targetId)) return false;
      if (a.type === "assign_department" && foreignDeptSet.has(a.targetId)) return false;
    }
    if (rule.fallbackAssigneeId && outOfDeptUserSet.has(rule.fallbackAssigneeId.toString())) return false;
    if (rule.fallbackDepartmentId && foreignDeptSet.has(rule.fallbackDepartmentId.toString())) return false;
    return true;
  };

  return rules.filter(inScope);
}
