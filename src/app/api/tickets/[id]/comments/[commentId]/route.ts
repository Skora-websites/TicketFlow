import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongo";
import { Comment, Ticket } from "@/lib/db/models";
import { requireApiRole, canAccessTicket } from "@/lib/authz";
import { stripCommentAttachmentData } from "@/lib/attachments";
import { deleteAttachment } from "@/lib/attachments-store";

export const dynamic = "force-dynamic";

async function loadContext(params: Promise<{ id: string; commentId: string }>) {
  const authResult = await requireApiRole("client", "team", "manager", "super_admin");
  if (authResult instanceof NextResponse) return { error: authResult };
  const user = authResult;
  await connectDB();
  const { id, commentId } = await params;

  if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(commentId)) {
    return {
      error: NextResponse.json({ error: "Invalid ID" }, { status: 400 }),
    };
  }

  const ticket = await Ticket.findById(id).lean();
  if (!ticket) {
    return { error: NextResponse.json({ error: "Ticket not found" }, { status: 404 }) };
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
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const comment = await Comment.findOne({ _id: commentId, ticketId: id });
  if (!comment) {
    return { error: NextResponse.json({ error: "Comment not found" }, { status: 404 }) };
  }

  return { user, ticket, comment };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const ctx = await loadContext(params);
    if ("error" in ctx) return ctx.error;
    const { user, comment } = ctx;

    // Only the author may edit their own comment.
    if (comment.authorId.toString() !== user!.id) {
      return NextResponse.json({ error: "You can only edit your own comments" }, { status: 403 });
    }

    const bodySchema = (await request.json().catch(() => null)) as { body?: string } | null;
    const content = bodySchema?.body?.trim();
    if (!content) {
      return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
    }
    if (content.length > 5000) {
      return NextResponse.json({ error: "Comment is too long (max 5000 characters)" }, { status: 400 });
    }

    comment.body = content;
    comment.updatedAt = new Date();
    await comment.save();

    const populated = await Comment.findById(comment._id)
      .populate("authorId", "name email role")
      .lean();

    return NextResponse.json({ comment: stripCommentAttachmentData(populated) });
  } catch (error) {
    console.error("PATCH /api/tickets/[id]/comments/[commentId] error:", error);
    return NextResponse.json({ error: "Failed to update comment" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const ctx = await loadContext(params);
    if ("error" in ctx) return ctx.error;
    const { user, comment } = ctx;

    // Authors may delete their own comments; super admins may delete any.
    const isAuthor = comment.authorId.toString() === user!.id;
    if (!isAuthor && user!.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const fileId = (comment.attachment as { fileId?: string } | undefined)?.fileId;
    await Comment.deleteOne({ _id: comment._id });
    // Best-effort: free the stored bytes too (legacy inline rows have none).
    if (fileId) void deleteAttachment(fileId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/tickets/[id]/comments/[commentId] error:", error);
    return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 });
  }
}
