import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongo";
import { RoutingRule } from "@/lib/db/models";
import { requireApiRole } from "@/lib/authz";
import { validateManagerRuleScope, filterRulesInManagerScope } from "@/lib/routing/ruleScope";

const conditionSchema = z.object({
  field: z.enum(["keyword", "category", "priority", "requester"]),
  operator: z.enum(["contains", "equals", "in", "not_in"]),
  value: z.union([z.string(), z.array(z.string())]),
  caseSensitive: z.boolean().optional(),
});

const actionSchema = z.object({
  type: z.enum(["assign_user", "assign_department", "set_priority", "set_status"]),
  targetId: z.string().optional(),
  value: z.string().optional(),
});

const ruleSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  priority: z.number().int().min(0).max(9999).default(100),
  matchType: z.enum(["any", "all"]).default("all"),
  conditions: z.array(conditionSchema).min(1, "At least one condition is required"),
  actions: z.array(actionSchema).min(1, "At least one action is required"),
  fallbackAssigneeId: z.string().optional(),
  fallbackDepartmentId: z.string().optional(),
  status: z.enum(["active", "paused", "draft"]).default("draft"),
});

// Validates list-query params (?limit=abc previously produced NaN limits).
const rulesQuerySchema = z.object({
  status: z.enum(["active", "paused", "draft"]).optional(),
  limit: z.coerce.number().int().positive().max(500).default(100),
});

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiRole("super_admin", "manager");
    if (authResult instanceof NextResponse) return authResult;
    const user = authResult;
    await connectDB();

    const { searchParams } = new URL(request.url);
    const query = rulesQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!query.success) {
      return NextResponse.json({ error: query.error.issues[0].message }, { status: 400 });
    }
    const { status, limit } = query.data;

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;

    let rules = await RoutingRule.find(filter)
      .sort({ priority: 1, createdAt: -1 })
      .limit(limit)
      .lean();

    // Managers only see rules scoped to their own department (batched lookups).
    if (user.role === "manager") {
      rules = await filterRulesInManagerScope(rules, user);
    }

    return NextResponse.json({ rules });
  } catch (error) {
    console.error("GET /api/routing/rules error:", error);
    return NextResponse.json({ error: "Failed to fetch routing rules" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiRole("super_admin", "manager");
    if (authResult instanceof NextResponse) return authResult;
    const user = authResult;
    await connectDB();

    const body = await request.json();
    const parsed = ruleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    const data = parsed.data;

    if (user.role === "manager") {
      const scopeErr = await validateManagerRuleScope(data, user);
      if (scopeErr) {
        return NextResponse.json({ error: scopeErr }, { status: 403 });
      }
    }

    if (data.fallbackAssigneeId && !mongoose.Types.ObjectId.isValid(data.fallbackAssigneeId)) {
      return NextResponse.json({ error: "Invalid fallback assignee" }, { status: 400 });
    }
    if (data.fallbackDepartmentId && !mongoose.Types.ObjectId.isValid(data.fallbackDepartmentId)) {
      return NextResponse.json({ error: "Invalid fallback department" }, { status: 400 });
    }

    const rule = await RoutingRule.create({
      name: data.name,
      description: data.description,
      priority: data.priority,
      matchType: data.matchType,
      conditions: data.conditions,
      actions: data.actions,
      fallbackAssigneeId: data.fallbackAssigneeId
        ? new mongoose.Types.ObjectId(data.fallbackAssigneeId)
        : undefined,
      fallbackDepartmentId: data.fallbackDepartmentId
        ? new mongoose.Types.ObjectId(data.fallbackDepartmentId)
        : undefined,
      status: data.status,
      stats: { matchCount: 0 },
      createdBy: new mongoose.Types.ObjectId(user.id),
    });

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    console.error("POST /api/routing/rules error:", error);
    return NextResponse.json({ error: "Failed to create routing rule" }, { status: 500 });
  }
}
