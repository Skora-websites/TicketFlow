import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongo";
import { Ticket, Comment, TicketReadState, User } from "@/lib/db/models";
import { requireApiRole, canAccessTicket } from "@/lib/authz";
import { isConversationParticipant, toTransferRef } from "@/lib/transfer";
import { attachmentMimeAllowed, MAX_ATTACHMENT_BYTES, ALLOWED_ATTACHMENT_MIMES } from "@/lib/fileValidation";
import { notify } from "@/lib/notifications";
import { publishTicketEvent } from "@/lib/events";
import { stripCommentAttachmentData } from "@/lib/attachments";
import { putAttachment, deleteAttachment } from "@/lib/attachments-store";
import {
  checkRateLimit,
  rateLimitResponse,
  canUploadAttachment,
  recordAttachmentUploaded,
  DB_QUERY_MAX_TIME_MS,
} from "@/lib/security";
import { z } from "zod";
import mongoose from "mongoose";

const commentsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(50),
  before: z.string().optional(), // ISO cursor — comments created before this
  after: z.string().optional(), // ISO cursor — comments created after this (polling)
  order: z.enum(["asc", "desc"]).default("asc"),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiRole("client", "team", "manager", "super_admin");
    if (authResult instanceof NextResponse) return authResult;
    const user = authResult;
    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ticket ID" }, { status: 400 });
    }

    const ticket = await Ticket.findById(id).lean();
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const canAccess = canAccessTicket(
      user.role,
      user.id,
      ticket.requesterId.toString(),
      ticket.assigneeId?.toString(),
      ticket.departmentId?.toString(),
      user.departmentId,
      ticket.transfer,
      user.ticketAccess
    );

    if (!canAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const isClientViewer = user.role === "client";
    const { searchParams } = new URL(request.url);
    const query = commentsQuerySchema.parse(Object.fromEntries(searchParams));

    const commentFilter: Record<string, unknown> = { ticketId: id };
    // Clients never see internal notes — enforced in the QUERY, not by
    // post-filtering, so page counts and cursors stay consistent.
    if (isClientViewer) {
      commentFilter.visibility = "public";
    }
    const beforeDate = query.before ? new Date(query.before) : null;
    if (beforeDate && !Number.isNaN(beforeDate.getTime())) {
      commentFilter.createdAt = { ...(commentFilter.createdAt as object), $lt: beforeDate };
    }
    const afterDate = query.after ? new Date(query.after) : null;
    if (afterDate && !Number.isNaN(afterDate.getTime())) {
      commentFilter.createdAt = { ...(commentFilter.createdAt as object), $gt: afterDate };
    }

    // ?after=<cursor> polling mode: smallest possible ascending window —
    // everything newer than the cursor, oldest→newest, no reverse dance.
    if (afterDate && !Number.isNaN(afterDate.getTime())) {
      const newComments = await Comment.find(commentFilter)
        .sort({ createdAt: 1 })
        .limit(query.limit)
        .populate("authorId", "name email role avatar")
        .lean();

      // Reading the conversation advances this user's read marker and marks
      // messages from other participants as delivered. Fire-and-forget.
      const now = new Date();
      void TicketReadState.updateOne(
        { userId: user.id, ticketId: id },
        { $set: { lastReadAt: now } },
        { upsert: true }
      ).exec();
      void Comment.updateMany(
        { ticketId: id, authorId: { $ne: new mongoose.Types.ObjectId(user.id) }, deliveredAt: null },
        { $set: { deliveredAt: now } }
      ).exec().then((res) => {
        if (res.modifiedCount > 0) publishTicketEvent(id, "read");
      });

      return NextResponse.json({
        comments: (newComments as unknown as Record<string, unknown>[]).map(stripCommentAttachmentData),
        pagination: { total: null, limit: query.limit, hasMore: false, nextCursor: null },
        serverTime: new Date().toISOString(),
      });
    }

    // Bounded page with cursor-on-createdAt pagination. Without a cursor the
    // endpoint returns the LATEST window (newest `limit` comments, displayed
    // oldest→newest); `before=<cursor>` walks back to older pages as threads
    // grow. nextCursor is the oldest comment of the returned page.
    const comments = await Comment.find(commentFilter)
      .sort({ createdAt: -1 })
      .limit(query.limit)
      .maxTimeMS(DB_QUERY_MAX_TIME_MS)
      .populate("authorId", "name email role avatar")
      .lean();

    comments.reverse(); // display oldest→newest
    if (query.order === "desc") comments.reverse();

    const [total, filteredTotal] = await Promise.all([
      Comment.countDocuments({ ticketId: id, ...(isClientViewer ? { visibility: "public" } : {}) }).maxTimeMS(DB_QUERY_MAX_TIME_MS),
      Comment.countDocuments(commentFilter).maxTimeMS(DB_QUERY_MAX_TIME_MS),
    ]);
    const oldestReturned = comments.length ? (comments[0] as { createdAt: Date }).createdAt : null;
    const hasMore = filteredTotal > comments.length; // older comments exist

    // Initial load also advances the read marker and marks others' messages as delivered.
    const now = new Date();
    void TicketReadState.updateOne(
      { userId: user.id, ticketId: id },
      { $set: { lastReadAt: now } },
      { upsert: true }
    ).exec();
    void Comment.updateMany(
      { ticketId: id, authorId: { $ne: new mongoose.Types.ObjectId(user.id) }, deliveredAt: null },
      { $set: { deliveredAt: now } }
    ).exec().then((res) => {
      if (res.modifiedCount > 0) publishTicketEvent(id, "read");
    });

    return NextResponse.json({
      comments: (comments as unknown as Record<string, unknown>[]).map(stripCommentAttachmentData),
      pagination: {
        total,
        limit: query.limit,
        hasMore,
        nextCursor: comments.length && hasMore ? oldestReturned : null,
      },
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("GET /api/tickets/[id]/comments error:", error);
    return NextResponse.json({ error: "Failed to load comments" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiRole("client", "team", "manager", "super_admin");
    if (authResult instanceof NextResponse) return authResult;
    const user = authResult;
    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ticket ID" }, { status: 400 });
    }

    const ticket = await Ticket.findById(id).lean();
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const canAccess = canAccessTicket(
      user.role,
      user.id,
      ticket.requesterId.toString(),
      ticket.assigneeId?.toString(),
      ticket.departmentId?.toString(),
      user.departmentId,
      ticket.transfer,
      user.ticketAccess
    );

    if (!canAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Chat membership: posting is limited to the conversation's parties —
    // the sender of record, the owning/addressed manager, and the agent
    // working the ticket. Other staff (incl. super admins) have read-only
    // oversight. (GET above keeps the broader canAccessTicket visibility.)
    if (
      !isConversationParticipant(
        { id: user.id, role: user.role, departmentId: user.departmentId },
        ticket
      )
    ) {
      return NextResponse.json(
        { error: "Only the sender, the department manager, and the assigned agent can join this conversation" },
        { status: 403 }
      );
    }

    // Frozen at closed: no further messages once a ticket is closed. The
    // client can reopen it (which reopens the conversation). Documented
    // decision — see docs/FEATURE-PLAN.md decision log.
    if (ticket.status === "closed") {
      return NextResponse.json(
        { error: "This conversation is closed. Reopen the ticket to continue." },
        { status: 409 }
      );
    }

    // Per-user flood ceiling for conversation posts: 30/min/user across all tickets
    const rateCheck = await checkRateLimit(`comments:${user.id}`, 30, 60_000);
    if (rateCheck.limited) {
      return rateLimitResponse(rateCheck, "Too many messages. Slow down a little.");
    }

    // Internal notes: staff-only. Clients physically cannot set the flag —
    // it is read from the session role, never from the request body.
    const isStaff = ["team", "manager", "super_admin"].includes(user.role);

    // Client sends multipart/form-data (body + optional attachment File).
    const form = await request.formData();
    const body = ((form.get("body") as string) || "").trim();
    const visibility = isStaff && (form.get("visibility") as string) === "internal" ? "internal" : "public";

    // One attachment per comment (matches the schema's singular `attachment`
    // subdocument); multiple uploaded files are rejected rather than silently
    // dropped.
    const uploadedFiles = form
      .getAll("attachment")
      .filter((f): f is File => f instanceof File && f.size > 0);
    if (uploadedFiles.length > 1) {
      return NextResponse.json({ error: "Only one attachment per comment" }, { status: 400 });
    }
    const file = uploadedFiles[0] ?? null;

    if (!body && !file) {
      return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
    }
    if (body && body.length > 10000) {
      return NextResponse.json({ error: "Comment must be under 10000 characters" }, { status: 400 });
    }

    const commentData: Record<string, unknown> = {
      ticketId: new mongoose.Types.ObjectId(id),
      authorId: new mongoose.Types.ObjectId(user.id),
      body: body || `📎 ${file?.name ?? "attachment"}`,
      kind: "message",
      visibility,
    };

    // Guard against rapid duplicate submissions (e.g. double click or network retry)
    if (!file) {
      const recentDuplicate = await Comment.findOne({
        ticketId: new mongoose.Types.ObjectId(id),
        authorId: new mongoose.Types.ObjectId(user.id),
        body: commentData.body as string,
        visibility,
        createdAt: { $gt: new Date(Date.now() - 3000) },
      })
        .populate("authorId", "name email role avatar")
        .lean();

      if (recentDuplicate) {
        return NextResponse.json(
          { comment: stripCommentAttachmentData(recentDuplicate) },
          { status: 200 }
        );
      }
    }

    if (file && file.size > 0) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        return NextResponse.json({ error: "Attachment must be under 4MB" }, { status: 400 });
      }
      if (!ALLOWED_ATTACHMENT_MIMES.has(file.type)) {
        return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
      }
      // Storage Quota Guard: check daily upload quota and database safety ceiling
      const storageCheck = await canUploadAttachment(user.id, file.size);
      if (!storageCheck.allowed) {
        return NextResponse.json({ error: storageCheck.reason || "Storage quota exceeded" }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      if (!attachmentMimeAllowed(file.type, buffer)) {
        return NextResponse.json({ error: "File content does not match its type" }, { status: 400 });
      }
      // Bytes go to GridFS first; the comment doc carries metadata + fileId
      // only. If the doc write fails below, the already-stored file is
      // cleaned up so no orphaned chunks accumulate (file-first ordering
      // means a crash can only orphan a file, never dangle a fileId).
      try {
        const stored = await putAttachment(buffer, {
          filename: file.name.slice(0, 255),
          mime: file.type,
        });
        await recordAttachmentUploaded(user.id, file.size);
        commentData.attachment = {
          name: file.name.slice(0, 255),
          mime: file.type,
          size: file.size,
          fileId: stored.fileId.toString(),
        };
      } catch (storeErr) {
        console.error("attachment store write failed:", storeErr);
        return NextResponse.json({ error: "Failed to store attachment" }, { status: 500 });
      }
    }

    let comment: mongoose.Document;
    try {
      comment = await Comment.create(commentData);
    } catch (docErr) {
      // Doc write failed after the bytes were stored — remove the orphan.
      const fileId = (commentData.attachment as { fileId?: string } | undefined)?.fileId;
      if (fileId) void deleteAttachment(fileId);
      throw docErr;
    }

    // Real-time: wake every open SSE stream for this ticket.
    publishTicketEvent(id, "comment");

    // Delivery receipts are marked when recipients actively fetch the comment
    // via GET /api/tickets/[id]/comments or receive it through active SSE stream.

    // Notify the other chat participants (sender, manager, assignee) about
    // the new message — but never about internal notes (clients must not
    // learn they exist, and notes stay within the staff side).
    if (visibility === "public") {
      const actor: { id: string; role: string; departmentId?: string } = {
        id: user.id,
        role: user.role,
        departmentId: user.departmentId,
      };
      const participants = new Set<string>();
      const requesterId = ticket.requesterId.toString();
      const assigneeIdStr = ticket.assigneeId?.toString();
      const deptMgr = ticket.departmentId
        ? await User.findOne({ role: "manager", departmentId: ticket.departmentId, active: true })
            .select("_id")
            .lean()
        : null;
      for (const pid of [requesterId, assigneeIdStr, deptMgr?._id?.toString()]) {
        if (pid && pid !== user.id) participants.add(pid);
      }
      // Also include the receiving manager for transfers decided in-chat.
      if (ticket.transfer && isConversationParticipant(actor, ticket)) {
        const ref = toTransferRef(ticket.transfer);
        for (const pid of [ref?.toManagerId, ref?.toUserId].map((v) =>
          v == null ? undefined : String(v)
        )) {
          if (pid && pid !== user.id) participants.add(pid);
        }
      }
      if (participants.size) {
        await notify(
          [...participants].map((pid) => ({ id: pid })),
          {
            type: "comment_added",
            ticketId: id,
            ticketNumber: ticket.ticketNumber,
            title: `New comment on ${ticket.ticketNumber}`,
            body: body ? body.slice(0, 140) : "Attachment added",
          }
        );
      }
    }

    const populatedComment = await Comment.findById(comment._id)
      .populate("authorId", "name email role avatar")
      .lean();

    return NextResponse.json({ comment: stripCommentAttachmentData(populatedComment) }, { status: 201 });
  } catch (error) {
    console.error("POST /api/tickets/[id]/comments error:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to add comment" }, { status: 500 });
  }
}
