import "server-only";
import mongoose from "mongoose";
import {
  RoutingRule,
  AgentAvailability,
  Ticket,
  User,
  Department,
  type IRoutingRule,
  type IRoutingCondition,
  type IRoutingAction,
} from "@/lib/db/models";

export interface RoutingInput {
  title: string;
  description: string;
  category: string;
  priority: string;
  requesterId: string;
}

export interface RoutingDecision {
  ruleId?: string;
  ruleName?: string;
  matchedConditions: number;
  totalConditions: number;
  actions: IRoutingAction[];
  assigneeId?: string;
  assigneeName?: string;
  departmentId?: string;
  departmentName?: string;
  reason: string;
  confidence: number; // 0–1
  evaluatedRules: number;
}

interface AgentScore {
  userId: string;
  name: string;
  score: number;
  load: number;
  capacity: number;
  matchedSkills: string[];
}

const STOPWORDS = new Set([
  "the","a","an","and","or","but","is","are","was","were","be","been","being","i","you","we","they",
  "my","our","your","this","that","it","of","to","in","on","at","for","with","as","by","from","up",
  "down","out","over","under","again","further","then","once","here","there","when","where","why",
  "how","all","any","both","each","few","more","most","other","some","such","no","not","only","own",
  "same","so","than","too","very","can","will","just","should","now","please","help","issue","problem",
]);

function extractKeywords(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    )
  );
}

function evaluateCondition(
  condition: IRoutingCondition,
  input: RoutingInput
): boolean {
  const { field, operator, value, caseSensitive } = condition;

  switch (field) {
    case "keyword": {
      const terms = Array.isArray(value) ? value : [value];
      const haystack = caseSensitive
        ? `${input.title} ${input.description}`
        : `${input.title} ${input.description}`.toLowerCase();
      const normalizedTerms = caseSensitive ? terms : terms.map((t) => t.toLowerCase());
      if (operator === "contains") {
        return normalizedTerms.some((term) => haystack.includes(term));
      }
      if (operator === "equals") {
        return normalizedTerms.some((term) => haystack.trim() === term);
      }
      return false;
    }

    case "category": {
      const allowed = Array.isArray(value) ? value : [value];
      if (operator === "equals" || operator === "in") {
        return allowed.includes(input.category);
      }
      if (operator === "not_in") {
        return !allowed.includes(input.category);
      }
      return false;
    }

    case "priority": {
      const allowed = Array.isArray(value) ? value : [value];
      if (operator === "equals" || operator === "in") {
        return allowed.includes(input.priority);
      }
      if (operator === "not_in") {
        return !allowed.includes(input.priority);
      }
      return false;
    }

    case "requester": {
      if (operator === "equals") {
        return input.requesterId === value;
      }
      return false;
    }

    default:
      return false;
  }
}

function evaluateRule(rule: IRoutingRule, input: RoutingInput) {
  const results = rule.conditions.map((c) => evaluateCondition(c, input));
  const matched = results.filter(Boolean).length;
  const total = results.length;

  let passed = false;
  if (total === 0) {
    passed = false;
  } else if (rule.matchType === "any") {
    passed = matched > 0;
  } else {
    passed = matched === total;
  }

  return { passed, matched, total };
}

/**
 * Check whether the agent's working-hours schedule (if configured) currently
 * covers `now`, evaluated in the schedule's timezone.
 * Returns null when no schedule is configured (treated as always on duty).
 */
function isWithinWorkingHours(
  availability: { workingHours?: { timezone: string; schedule: { day: number; start: string; end: string }[] } } | undefined,
  now: Date = new Date()
): boolean | null {
  const schedule = availability?.workingHours?.schedule;
  if (!schedule || schedule.length === 0) return null;

  const timezone = availability!.workingHours!.timezone || "UTC";
  let weekday: number;
  let hhmm: string;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    weekday = dayMap[get("weekday")] ?? now.getUTCDay();
    const hour = get("hour") === "24" ? "00" : get("hour");
    hhmm = `${hour}:${get("minute")}`;
  } catch {
    return null; // invalid timezone in config — don't penalise
  }

  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map((n) => parseInt(n, 10));
    return (h || 0) * 60 + (m || 0);
  };
  const nowMin = toMinutes(hhmm);

  return schedule.some(
    (s) => s.day === weekday && nowMin >= toMinutes(s.start) && nowMin < toMinutes(s.end)
  );
}

/**
 * Score agents based on:
 * - Skill/keyword overlap with the ticket content
 * - Availability status (offline/busy penalised)
 * - Working hours (outside scheduled hours penalised)
 * - Capacity headroom (lower load = higher score)
 * - Round-robin tie-breaking using lastSeenAt
 */
async function pickBestAgent(
  ticketKeywords: string[],
  departmentId?: string
): Promise<AgentScore | null> {
  const filter: Record<string, unknown> = { active: true };
  if (departmentId) {
    filter.departmentId = new mongoose.Types.ObjectId(departmentId);
  }
  const candidates = await User.find({
    ...filter,
    role: { $in: ["team", "manager"] },
  })
    .select("_id name email departmentId role")
    .lean();

  if (candidates.length === 0) return null;

  const candidateIds = candidates.map((c) => c._id);
  const availabilityDocs = await AgentAvailability.find({
    userId: { $in: candidateIds },
  }).lean();

  const availabilityMap = new Map<string, (typeof availabilityDocs)[number]>();
  for (const a of availabilityDocs) {
    availabilityMap.set(a.userId.toString(), a);
  }

  // ponytail: AgentAvailability.currentLoad is only a seed-time cache and is never
  // recomputed, so derive real load from assigned open tickets instead.
  const loadAgg = await Ticket.aggregate([
    { $match: { assigneeId: { $in: candidateIds }, status: { $in: ["open", "in_progress", "on_hold"] } } },
    { $group: { _id: "$assigneeId", count: { $sum: 1 } } },
  ]);
  const loadMap = new Map(loadAgg.map((l: { _id: mongoose.Types.ObjectId; count: number }) => [l._id.toString(), l.count]));

  const scores: AgentScore[] = candidates.map((c) => {
    const availability = availabilityMap.get(c._id.toString());
    const status = availability?.status ?? "available";
    const load = loadMap.get(c._id.toString()) ?? 0;
    const capacity = availability?.capacity ?? 10;
    const skills = availability?.skills ?? [];

    const skillMatches = ticketKeywords.filter((kw) =>
      skills.some((s) => s.toLowerCase().includes(kw) || kw.includes(s.toLowerCase()))
    );

    let score = 0;
    // Skills bonus (weighted heavily)
    score += skillMatches.length * 10;

    // Status bonus
    if (status === "available") score += 25;
    else if (status === "busy") score += 5;
    else if (status === "away") score += 1;
    else score -= 50; // offline heavily penalised

    // Outside configured working hours: deprioritise but keep assignable
    if (isWithinWorkingHours(availability) === false) score -= 25;

    // Capacity headroom (max 20 pts at zero load)
    const headroom = Math.max(0, capacity - load);
    score += Math.min(20, headroom * 4);

    // Penalise overloaded
    if (load >= capacity) score -= 30;

    return {
      userId: c._id.toString(),
      name: c.name,
      score,
      load,
      capacity,
      matchedSkills: skillMatches,
    };
  });

  // Highest score wins. Tie-break by lowest current load, then most recent activity.
  const top = scores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.load !== b.load) return a.load - b.load;
    return 0;
  })[0];

  return top && top.score > 0 ? top : null; // no suitable (available, score>0) agent → leave unassigned
}

/**
 * Apply the matching rule's actions to a draft ticket and pick a concrete assignee.
 */
export async function routeTicket(
  input: RoutingInput,
  options: { dryRun?: boolean } = {}
): Promise<RoutingDecision> {
  const keywords = extractKeywords(`${input.title} ${input.description}`);

  const rules = await RoutingRule.find({ status: "active" })
    .sort({ priority: 1, createdAt: 1 })
    .lean();

  let decision: RoutingDecision = {
    matchedConditions: 0,
    totalConditions: 0,
    actions: [],
    reason: "No active routing rule matched. Awaiting manual assignment.",
    confidence: 0,
    evaluatedRules: rules.length,
  };

  for (const rule of rules) {
    const { passed, matched, total } = evaluateRule(rule as unknown as IRoutingRule, input);
    if (!passed) continue;

    let resolvedAssigneeId: string | undefined;
    let resolvedDepartmentId: string | undefined;
    let assigneeName: string | undefined;
    let departmentName: string | undefined;

    // Collect every user/department target the matching rule references so
    // names resolve in two bulk queries instead of one findById per action.
    const actionUserIds = new Set<string>();
    const actionDeptIds = new Set<string>();
    for (const action of rule.actions) {
      if (action.type === "assign_user" && action.targetId) actionUserIds.add(action.targetId);
      else if (action.type === "assign_department" && action.targetId) actionDeptIds.add(action.targetId);
    }
    if (!resolvedAssigneeId && rule.fallbackAssigneeId) actionUserIds.add(rule.fallbackAssigneeId.toString());
    if (!resolvedDepartmentId && rule.fallbackDepartmentId) actionDeptIds.add(rule.fallbackDepartmentId.toString());

    const [actionUsers, actionDepts] = await Promise.all([
      actionUserIds.size ? User.find({ _id: { $in: [...actionUserIds] } }).select("_id name").lean() : Promise.resolve([]),
      actionDeptIds.size ? Department.find({ _id: { $in: [...actionDeptIds] } }).select("_id name").lean() : Promise.resolve([]),
    ]);
    const userNameMap = new Map(actionUsers.map((u) => [u._id.toString(), u.name]));
    const deptNameMap = new Map(actionDepts.map((d) => [d._id.toString(), d.name]));

    for (const action of rule.actions) {
      if (action.type === "assign_user" && action.targetId) {
        resolvedAssigneeId = action.targetId;
        assigneeName = userNameMap.get(action.targetId);
      } else if (action.type === "assign_department" && action.targetId) {
        resolvedDepartmentId = action.targetId;
        departmentName = deptNameMap.get(action.targetId);
        if (!resolvedAssigneeId) {
          const best = await pickBestAgent(keywords, resolvedDepartmentId);
          if (best) {
            resolvedAssigneeId = best.userId;
            assigneeName = best.name;
          }
        }
      }
    }

    // If no explicit assignee from actions, try fallback
    if (!resolvedAssigneeId && rule.fallbackAssigneeId) {
      const id = rule.fallbackAssigneeId.toString();
      resolvedAssigneeId = id;
      assigneeName = userNameMap.get(id);
    }
    if (!resolvedDepartmentId && rule.fallbackDepartmentId) {
      const id = rule.fallbackDepartmentId.toString();
      resolvedDepartmentId = id;
      departmentName = deptNameMap.get(id);
    }

    // Final fallback: pick best available agent across the org
    if (!resolvedAssigneeId) {
      const best = await pickBestAgent(keywords);
      if (best) {
        resolvedAssigneeId = best.userId;
        assigneeName = best.name;
      }
    }

    // Bump rule stats (skipped for dry runs such as the live preview simulator)
    if (!options.dryRun) {
      await RoutingRule.updateOne(
        { _id: rule._id },
        { $inc: { "stats.matchCount": 1 }, $set: { "stats.lastMatchedAt": new Date() } }
      );
    }

    decision = {
      ruleId: rule._id.toString(),
      ruleName: rule.name,
      matchedConditions: matched,
      totalConditions: total,
      actions: rule.actions,
      assigneeId: resolvedAssigneeId,
      assigneeName,
      departmentId: resolvedDepartmentId,
      departmentName,
      reason: `Matched rule "${rule.name}" (${matched}/${total} conditions). ${
        assigneeName
          ? `Routed to ${assigneeName}${departmentName ? ` in ${departmentName}` : ""}.`
          : departmentName
            ? `Routed to ${departmentName} team.`
            : "Awaiting manual assignment."
      }`,
      confidence: total === 0 ? 0.5 : matched / total,
      evaluatedRules: rules.length,
    };
    break;
  }

  return decision;
}

export async function previewRouting(input: RoutingInput) {
  return routeTicket(input, { dryRun: true });
}
