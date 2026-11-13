import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/authz";
import { enforceRateLimit } from "@/lib/security";
import { applyTicketPatch, type TicketFieldChanged } from "@/lib/ticketPatch";
import { z } from "zod";

/**
 * POST /api/tickets/bulk
 *
 * Applies the SAME per-ticket pipeline as `PATCH /api/tickets/[id]` to up to
 * 100 tickets. Every id goes through `applyTicketPatch`, so authorization is
 * enforced per document (no second permission path, no "all or nothing" batch
 * that could widen access). Partial success is normal and reported per id:
 * the UI offers Undo from the returned `previous` snapshot.
 *
 * Body: { updates: [{ id, status?, priority?, assigneeId? }] }
 */

const updateSchema = z
  .object({
    id: z.string().min(1),
    status: z.enum(["open", "in_progress", "on_hold", "resolved", "closed"]).optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    assigneeId: z.string().nullable().optional(),
  })
  .refine((u) => u.status !== undefined || u.priority !== undefined || u.assigneeId !== undefined, {
    message: "Each update needs at least one field",
  });

const bulkSchema = z.object({
  updates: z.array(updateSchema).min(1).max(100),
});

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiRole("team", "manager", "super_admin");
    if (authResult instanceof NextResponse) return authResult;
    const user = authResult;

    const rateCheck = await enforceRateLimit(
      `tickets:bulk:${user.id}`,
      20,
      60_000,
      "Too many bulk actions. Please wait a minute."
    );
    if (rateCheck) return rateCheck;

    const body = await request.json().catch(() => null);
    const parsed = bulkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const updated: {
      id: string;
      ticketNumber: string;
      previous: { status: string; priority: string; assigneeId: string | null };
      changed: TicketFieldChanged[];
    }[] = [];
    const failed: { id: string; error: string }[] = [];

    // Sequential on purpose: each call runs DB reads (ticket, assignee,
    // category) plus notifications, and 100 is the hard cap.
    for (const update of parsed.data.updates) {
      const { id, ...patch } = update;
      const result = await applyTicketPatch(user, id, patch);
      if (result.ok) {
        updated.push({
          id,
          ticketNumber: result.ticketNumber,
          previous: result.previous,
          changed: result.changed,
        });
      } else {
        failed.push({ id, error: result.error });
      }
    }

    return NextResponse.json({ updated, failed, total: parsed.data.updates.length });
  } catch (error) {
    console.error("POST /api/tickets/bulk error:", error);
    return NextResponse.json({ error: "Failed to apply bulk update" }, { status: 500 });
  }
}
