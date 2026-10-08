import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongo";
import { RoutingRule } from "@/lib/db/models";
import { requireApiRole } from "@/lib/authz";
import { validateManagerRuleScope, isRuleInManagerScope } from "@/lib/routing/ruleScope";

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

const ruleUpdateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(500).optional(),
  priority: z.number().int().min(0).max(9999).optional(),
  matchType: z.enum(["any", "all"]).optional(),
  conditions: z.array(conditionSchema).optional(),
  actions: z.array(actionSchema).optional(),
  fallbackAssigneeId: z.string().nullable().optional(),
  fallbackDepartmentId: z.string().nullable().optional(),
  status: z.enum(["active", "paused", "draft"]).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiRole("super_admin", "manager");
    if (authResult instanceof NextResponse) return authResult;
    const user = authResult;
    await connectDB();
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid rule id" }, { status: 400 });
    }
    const rule = await RoutingRule.findById(id).lean();
    if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (user.role === "manager" && !(await isRuleInManagerScope(rule, user))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ rule });
  } catch (error) {
    console.error("GET /api/routing/rules/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch rule" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiRole("super_admin", "manager");
    if (authResult instanceof NextResponse) return authResult;
    const user = authResult;
    await connectDB();
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid rule id" }, { status: 400 });
    }
    // Existing rule must be in the manager's scope — even for status-only
    // changes, which otherwise bypass action-target validation.
    const existingRule = await RoutingRule.findById(id).lean();
    if (!existingRule) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (user.role === "manager" && !(await isRuleInManagerScope(existingRule, user))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await request.json();
    const parsed = ruleUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      );
    }

    if (user.role === "manager") {
      const scopeErr = await validateManagerRuleScope(
        {
          actions: parsed.data.actions ?? [],
          fallbackAssigneeId: parsed.data.fallbackAssigneeId ?? undefined,
          fallbackDepartmentId: parsed.data.fallbackDepartmentId ?? undefined,
        },
        user
      );
      if (scopeErr) {
        return NextResponse.json({ error: scopeErr }, { status: 403 });
      }
    }

    const update: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.fallbackAssigneeId) {
      update.fallbackAssigneeId = new mongoose.Types.ObjectId(parsed.data.fallbackAssigneeId);
    }
    if (parsed.data.fallbackDepartmentId) {
      update.fallbackDepartmentId = new mongoose.Types.ObjectId(parsed.data.fallbackDepartmentId);
    }
    const rule = await RoutingRule.findByIdAndUpdate(id, update, { returnDocument: "after" }).lean();
    if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ rule });
  } catch (error) {
    console.error("PATCH /api/routing/rules/[id] error:", error);
    return NextResponse.json({ error: "Failed to update rule" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiRole("super_admin", "manager");
    if (authResult instanceof NextResponse) return authResult;
    const user = authResult;
    await connectDB();
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid rule id" }, { status: 400 });
    }
    const existingRule = await RoutingRule.findById(id).lean();
    if (!existingRule) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (user.role === "manager" && !(await isRuleInManagerScope(existingRule, user))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await RoutingRule.findByIdAndDelete(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/routing/rules/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete rule" }, { status: 500 });
  }
}
