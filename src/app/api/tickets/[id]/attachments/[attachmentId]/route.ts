import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { connectDB } from "@/lib/db/mongo";
import { Ticket, Comment } from "@/lib/db/models";
import { getUser, requireApiRole, canAccessTicket } from "@/lib/authz";
import { openAttachmentStream, deleteAttachment, isValidStoredFileId } from "@/lib/attachments-store";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

// Serves either a comment attachment (stored on the Comment doc) or a
// ticket-level attachment (stored on the Ticket doc) by its subdocument id.
// Endpoint shape is shared: /api/tickets/[id]/attachments/[attachmentId]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id, attachmentId } = await params;

    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(attachmentId)
    ) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
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

    // prefer comment attachment
    type AttachMeta = { name: string; mime: string; fileId?: string; data?: unknown; _id?: mongoose.Types.ObjectId };
    let attach: AttachMeta | null = null;
    const comment = await Comment.findById(attachmentId).lean();
    if (comment && comment.ticketId.toString() === id && comment.attachment) {
      attach = comment.attachment as unknown as AttachMeta;
    } else if (ticket.attachments) {
      const found = (ticket.attachments as unknown as AttachMeta[]).find(
        (a) => a._id?.toString() === attachmentId
      );
      if (found) attach = found;
    }

    if (!attach) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    const safeName = attach.name.replace(/[^\w.-]+/g, "_");
    const baseHeaders: Record<string, string> = {
      "Content-Type": attach.mime || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "private, max-age=0, no-store",
      "X-Content-Type-Options": "nosniff",
    };

    // GridFS-stored bytes: stream them through — memory stays flat regardless
    // of file size, and large downloads no longer round-trip a full Buffer.
    if (isValidStoredFileId(attach.fileId)) {
      const stored = await openAttachmentStream(attach.fileId);
      if (!stored) {
        // Metadata exists but the store lost the bytes (restored-from-backup
        // edge) — fail loudly rather than serve a zero-byte file.
        console.error("Attachment fileId present but missing in store", { attachmentId, fileId: attach.fileId });
        return NextResponse.json({ error: "Attachment file missing" }, { status: 404 });
      }
      return new NextResponse(Readable.toWeb(stored.stream) as unknown as BodyInit, {
        status: 200,
        headers: { ...baseHeaders, "Content-Length": String(stored.length) },
      });
    }

    // Legacy inline bytes (pre-GridFS rows, until the backfill strips them).
    // BSON v7 Binary is NOT a Uint8Array and Buffer.from(binary) silently
    // returns an EMPTY buffer — the correct conversion goes through the
    // underlying buffer/ArrayBuffer using Binary.position as the byte count.
    const raw = attach.data as {
      buffer?: ArrayBuffer | Buffer | Uint8Array;
      position?: number;
    } | Buffer | Uint8Array | undefined;
    let buf: Buffer;
    if (Buffer.isBuffer(raw)) {
      buf = raw;
    } else if (raw && typeof raw === "object" && "buffer" in (raw as Record<string, unknown>) && (raw as Record<string, unknown>).buffer != null) {
      const obj = raw as { buffer: ArrayBuffer | Uint8Array; position?: number };
      const underlying = obj.buffer;
      buf =
        typeof obj.position === "number"
          ? Buffer.from(underlying as ArrayBuffer, 0, obj.position)
          : Buffer.from(underlying as Uint8Array);
    } else {
      buf = Buffer.from((raw ?? new Uint8Array()) as Uint8Array);
    }
    if (buf.length === 0) {
      console.error("Attachment served empty — data conversion failed", {
        attachmentId,
        storedType: (attach.data as unknown as { constructor?: { name?: string } })?.constructor?.name,
      });
    }

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: { ...baseHeaders, "Content-Length": String(buf.length) },
    });
  } catch (error) {
    console.error("GET /api/tickets/[id]/attachments/[attachmentId] error:", error);
    return NextResponse.json({ error: "Failed to fetch attachment" }, { status: 500 });
  }
}

// DELETE removes an attachment. Ticket-level attachments: managers (of the
// ticket's department) and super admins. Comment attachments: the comment's
// author, the ticket's manager/super admin — never other participants.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const authResult = await requireApiRole("client", "team", "manager", "super_admin");
    if (authResult instanceof NextResponse) return authResult;
    const user = authResult;

    await connectDB();
    const { id, attachmentId } = await params;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(attachmentId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const ticket = await Ticket.findById(id).lean();
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    if (!canAccessTicket(user.role, user.id, ticket.requesterId.toString(), ticket.assigneeId?.toString(), ticket.departmentId?.toString(), user.departmentId, ticket.transfer, user.ticketAccess)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const isManager = user.role === "super_admin" ||
      (user.role === "manager" && !!user.departmentId && ticket.departmentId?.toString() === user.departmentId);

    // Comment attachment (lookup by comment id, matching GET's precedence).
    const comment = await Comment.findById(attachmentId).lean();
    const isCommentAttachment = !!comment && comment.ticketId.toString() === id && !!comment.attachment;

    if (isCommentAttachment) {
      const isAuthor = comment!.authorId.toString() === user.id;
      if (!isAuthor && !isManager) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const fileId = (comment!.attachment as { fileId?: string } | undefined)?.fileId;
      await Comment.updateOne({ _id: attachmentId }, { $unset: { attachment: 1 } });
      // Best-effort: drop the stored bytes too (legacy inline rows have none).
      if (isValidStoredFileId(fileId)) void deleteAttachment(fileId);
      return NextResponse.json({ success: true });
    }

    // Ticket-level attachment.
    const foundAtt = (ticket.attachments as { _id: mongoose.Types.ObjectId; fileId?: string }[] | undefined)?.find(
      (a) => a._id.toString() === attachmentId
    );
    if (!foundAtt) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }
    if (!isManager) {
      return NextResponse.json({ error: "Only managers can remove ticket attachments" }, { status: 403 });
    }

    await Ticket.updateOne({ _id: id }, { $pull: { attachments: { _id: new mongoose.Types.ObjectId(attachmentId) } } });
    if (isValidStoredFileId(foundAtt.fileId)) void deleteAttachment(foundAtt.fileId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/tickets/[id]/attachments/[attachmentId] error:", error);
    return NextResponse.json({ error: "Failed to delete attachment" }, { status: 500 });
  }
}
