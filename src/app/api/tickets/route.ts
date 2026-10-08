import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongo";
import { Ticket, Category } from "@/lib/db/models";
import { requireApiRole, getUser } from "@/lib/authz";
import { buildTicketSearchFilter } from "@/lib/search";
import { z } from "zod";
import mongoose from "mongoose";
import { routeTicket } from "@/lib/routing/engine";
import { notify } from "@/lib/notifications";
import { attachmentMimeAllowed, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_TICKET, ALLOWED_ATTACHMENT_MIMES } from "@/lib/fileValidation";
import { stripAttachmentData } from "@/lib/attachments";
import { putAttachment, deleteAttachment } from "@/lib/attachments-store";

const ticketQuerySchema = z.object({
  page: z.coerce.number().positive().default(1),
  limit: z.coerce.number().positive().max(100).default(20),
  status: z.enum(["open", "in_progress", "on_hold", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  // Categories are dynamic (super admins can add more) — validated loosely
  // here; an unknown value simply matches nothing.
  category: z.string().min(1).max(40).regex(/^[a-z0-9-]+$/).optional(),
  departmentId: z.string().optional(),
  assigneeId: z.string().optional(),
  search: z.string().optional(),
  // "sent" = inter-department transfers this user dispatched.
  view: z.enum(["all", "mine", "unassigned", "sent"]).optional(),
});

const ticketCreateSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  category: z.string().min(1).max(40).regex(/^[a-z0-9-]+$/, "Invalid category").default("other"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
});

// Shared populates so transfer sender/recipient names resolve in list + detail.
const TRANSFER_POPULATE = [
  "transfer.fromId",
  "transfer.toUserId",
  "transfer.toManagerId",
  "transfer.toDepartmentId",
  "transfer.approvedBy",
];

export async function GET(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const query = ticketQuerySchema.parse(Object.fromEntries(searchParams));

    const { page, limit, status, priority, category, departmentId, assigneeId, search, view } = query;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};

    if (user.role === "client") {
      filter.requesterId = user.id;
    } else if (view === "sent") {
      // Inter-department transfers this user dispatched (agents and managers).
      filter["transfer.fromId"] = new mongoose.Types.ObjectId(user.id);
    } else if (user.role === "team") {
      if (view === "mine") {
        filter.assigneeId = user.id;
      } else {
        // Agent scope = assigned-to-me + tickets I filed, PLUS the whole
        // department only when a manager granted "department" access at
        // creation time ("assigned"-scoped agents never browse the dept).
        const scope: Record<string, unknown>[] = [
          { assigneeId: user.id },
          { requesterId: user.id },
        ];
        if (user.departmentId && (user.ticketAccess ?? "department") === "department") {
          scope.push({ departmentId: user.departmentId });
        }
        filter.$and = [{ $or: scope }];
      }
    } else if (user.role === "manager") {
      if (view === "unassigned") {
        // `null` matches both missing and explicitly-null assigneeId (PATCH
        // unassign stores null); $exists:false would miss the latter.
        // Pending incoming transfers (manager-directed) surface here too —
        // they are, by definition, waiting for this manager's action. Orphaned
        // tickets (no department, routing never matched) appear for triage:
        // with department-based scoping they would otherwise be invisible to
        // every manager forever.
        filter.assigneeId = null;
        if (user.departmentId) {
          filter.$or = [
            { departmentId: user.departmentId },
            { departmentId: null },
            { "transfer.status": "pending", "transfer.toDepartmentId": user.departmentId },
          ];
        } else {
          // Dept-less manager: only orphaned (department-less) unassigned
          // tickets — there is no department of their own to triage.
          filter.departmentId = null;
        }
      } else if (view === "mine") {
        filter.assigneeId = user.id;
      } else if (user.departmentId) {
        // Department tickets PLUS pending transfers addressed to this
        // department (the manager approval queue) — the receiving manager must
        // see them even though the ticket is not yet in their department.
        // Orphaned tickets ride along only while unassigned (triage); once
        // assigned they belong to the assignee, not the whole department.
        filter.$or = [
          { departmentId: user.departmentId },
          { assigneeId: null, departmentId: null },
          { "transfer.status": "pending", "transfer.toDepartmentId": user.departmentId },
        ];
      } else {
        // Manager without a department may only see tickets assigned to them.
        filter.assigneeId = user.id;
      }
    } else if (user.role === "super_admin") {
      if (view === "unassigned") {
        // See comment above: match missing OR null assigneeId.
        filter.assigneeId = null;
      } else if (view === "mine") {
        filter.assigneeId = user.id;
      }
    }

    // Role scoping is authoritative. Client-supplied departmentId/assigneeId
    // must never override it — otherwise a team user could read another
    // agent's tickets or a manager another department's tickets (IDOR).
    // Only super_admin may filter freely by these fields.
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (category) filter.category = category;
    if (user.role === "super_admin") {
      if (departmentId) filter.departmentId = departmentId;
      if (assigneeId) filter.assigneeId = assigneeId;
    }

    // Full-text search (index-backed — was a $regex collection scan). The
    // builder returns $text + optional ticketNumber tail-match; $text must
    // live at top level or inside $and (never inside $or), and the same
    // nesting rule as before applies: never overwrite/widen an existing scope.
    const searchClause = buildTicketSearchFilter(search);
    if (searchClause) {
      if (Array.isArray(filter.$and)) {
        filter.$and.push(searchClause);
      } else if (filter.$or) {
        filter.$and = [{ $or: filter.$or as unknown[] }, searchClause];
        delete filter.$or;
      } else {
        Object.assign(filter, searchClause);
      }
    }

    const [tickets, total] = await Promise.all([
      Ticket.find(filter)
        .populate("requesterId", "name email")
        .populate("assigneeId", "name email")
        .populate("departmentId", "name color")
        .populate("transfer.fromId", "name email role")
        .populate("transfer.toUserId", "name email")
        .populate("transfer.toManagerId", "name email")
        .populate("transfer.toDepartmentId", "name color")
        .populate("transfer.approvedBy", "name")
      .populate("transfer.rejectedBy", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Ticket.countDocuments(filter),
    ]);

    // Never serialize binary attachment payloads into list responses.
    const sanitizedTickets = (tickets as unknown as Record<string, unknown>[]).map(stripAttachmentData);

    return NextResponse.json({
      tickets: sanitizedTickets,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/tickets error:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to fetch tickets" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiRole("client", "team", "manager", "super_admin");
    if (authResult instanceof NextResponse) return authResult;
    const user = authResult;
    await connectDB();

    const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
    const STATUSES = ["open", "in_progress", "on_hold", "resolved", "closed"] as const;

    const contentType = request.headers.get("content-type") || "";
    let title: string;
    let description: string;
    let category: string;
    let priority: string;
    let attachmentFiles: File[] = [];

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      title = (form.get("title") as string) || "";
      description = (form.get("description") as string) || "";
      category = (form.get("category") as string) || "other";
      priority = (form.get("priority") as string) || "medium";
      // Multiple "attachment" fields are accepted; a bare string value from a
      // malformed client is ignored.
      attachmentFiles = form
        .getAll("attachment")
        .filter((f): f is File => f instanceof File && f.size > 0);
    } else {
      const body = await request.json();
      title = body.title;
      description = body.description;
      category = body.category;
      priority = body.priority;
    }

    const parsed = ticketCreateSchema.safeParse({ title, description, category, priority });

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    ({ title, description, category, priority } = parsed.data);

    // Dynamic categories: the value must exist in the Category collection
    // (defaults are seeded, super admins can add more). Legacy slugs from old
    // clients are rejected with a clear message instead of silently creating
    // tickets outside the managed category list.
    const categoryDoc = await Category.findOne({ slug: category }).lean();
    if (!categoryDoc) {
      return NextResponse.json(
        { error: `Unknown category "${category}"` },
        { status: 400 }
      );
    }

    // Run automated routing engine on creation
    let assigneeId: mongoose.Types.ObjectId | undefined;
    let departmentId: mongoose.Types.ObjectId | undefined;
    let assignedBy: mongoose.Types.ObjectId | undefined;
    let resolvedStatus = "open";
    let routingApplied = false;

    try {
      const decision = await routeTicket({
        title,
        description,
        category,
        priority,
        requesterId: user.id,
      });

      if (decision.assigneeId) {
        assigneeId = new mongoose.Types.ObjectId(decision.assigneeId);
        // Auto-routing is performed by the system, not the requester; leave assignedBy unset.
        assignedBy = undefined;
        routingApplied = true;
      }
      if (decision.departmentId) {
        departmentId = new mongoose.Types.ObjectId(decision.departmentId);
      }
      // Apply rule actions (set_priority / set_status) to the new ticket.
      for (const action of decision.actions ?? []) {
        if (action.type === "set_priority" && typeof action.value === "string" && (PRIORITIES as readonly string[]).includes(action.value)) {
          priority = action.value as typeof priority;
          routingApplied = true;
        } else if (action.type === "set_status" && typeof action.value === "string" && (STATUSES as readonly string[]).includes(action.value)) {
          resolvedStatus = action.value;
          routingApplied = true;
        }
      }
    } catch (routingError) {
      // Routing failure should never block ticket creation — log and continue
      console.error("Auto-routing failed for ticket:", routingError);
    }

    // Fall back to legacy behaviour when routing didn't apply
    if (!routingApplied) {
      if (user.role !== "client" && user.departmentId) {
        departmentId = new mongoose.Types.ObjectId(user.departmentId);
      }
      if (user.role !== "client") {
        assigneeId = new mongoose.Types.ObjectId(user.id);
        assignedBy = new mongoose.Types.ObjectId(user.id);
      }
    }

    const ticketDoc: Record<string, unknown> = {
      title,
      description,
      category,
      priority,
      status: resolvedStatus,
      requesterId: new mongoose.Types.ObjectId(user.id),
      departmentId,
      assigneeId,
      assignedBy,
    };

    // Stored-file bookkeeping lives OUTSIDE the `if` so the create-failure
    // cleanup below can always see it (empty when no attachments).
    const storedFileIds: mongoose.Types.ObjectId[] = [];
    if (attachmentFiles.length > 0) {
      if (attachmentFiles.length > MAX_ATTACHMENTS_PER_TICKET) {
        return NextResponse.json(
          { error: `Maximum ${MAX_ATTACHMENTS_PER_TICKET} attachments per ticket` },
          { status: 400 }
        );
      }
      const attachments = [];
      for (const file of attachmentFiles) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          return NextResponse.json({ error: `Attachment "${file.name}" must be under 4MB` }, { status: 400 });
        }
        if (!ALLOWED_ATTACHMENT_MIMES.has(file.type)) {
          return NextResponse.json({ error: `Unsupported file type: ${file.name}` }, { status: 400 });
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        if (!attachmentMimeAllowed(file.type, buffer)) {
          return NextResponse.json({ error: `File content does not match its type: ${file.name}` }, { status: 400 });
        }
        // Bytes go to GridFS; the ticket doc carries metadata + fileId only.
        // Files stored here are cleaned up if the ticket create ultimately
        // fails (file-first ordering, orphan cleanup below).
        let stored: { fileId: mongoose.Types.ObjectId; length: number };
        try {
          stored = await putAttachment(buffer, {
            filename: file.name.slice(0, 255),
            mime: file.type,
          });
        } catch (storeErr) {
          console.error("attachment store write failed:", storeErr);
          return NextResponse.json({ error: "Failed to store attachment" }, { status: 500 });
        }
        storedFileIds.push(stored.fileId);
        attachments.push({
          name: file.name.slice(0, 255),
          mime: file.type,
          size: file.size,
          fileId: stored.fileId.toString(),
          uploadedAt: new Date(),
        });
      }
      ticketDoc.attachments = attachments;
    }

    // Ticket numbers are derived from the current max; retry on the rare
    // unique-index collision caused by concurrent creation.
    let created: any = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      // Sort by the ticket number itself with numeric ordering (so TK-10000
      // ranks above TK-9999). Sorting by createdAt breaks when tickets are
      // backdated (seeds, imports, clock skew) and hands out duplicate numbers.
      const last = await Ticket.findOne()
        .collation({ locale: "en", numericOrdering: true })
        .sort({ ticketNumber: -1 })
        .select("ticketNumber")
        .lean();
      const nextNum = last?.ticketNumber
        ? (parseInt(((last.ticketNumber.match(/TK-(\d+)/) as RegExpMatchArray | null) || [])[1] || "0", 10) || 0) + 1
        : 1;
      ticketDoc.ticketNumber = `TK-${String(nextNum).padStart(4, "0")}`;
      try {
        created = await Ticket.create(ticketDoc);
        break;
      } catch (createErr: any) {
        if (createErr?.code === 11000 && attempt < 4) continue;
        // Real failure: free any files already stored for this ticket.
        for (const fid of storedFileIds) void deleteAttachment(fid.toString());
        throw createErr;
      }
    }
    if (!created) {
      for (const fid of storedFileIds) void deleteAttachment(fid.toString());
    }

    // Notify the assigned agent that a ticket landed on them.
    if (assigneeId) {
      await notify(
        [{ id: assigneeId.toString() }],
        {
          type: "ticket_assigned",
          ticketId: created._id.toString(),
          ticketNumber: created.ticketNumber,
          title: `New ticket assigned: ${created.ticketNumber}`,
          body: title,
        }
      );
    }

    const populatedTicket = await Ticket.findById(created._id)
      .populate("requesterId", "name email")
      .populate("assigneeId", "name email")
      .populate("departmentId", "name color")
      .populate(TRANSFER_POPULATE)
      .lean();

    return NextResponse.json({ ticket: stripAttachmentData(populatedTicket), routingApplied }, { status: 201 });
  } catch (error) {
    console.error("POST /api/tickets error:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create ticket" }, { status: 500 });
  }
}