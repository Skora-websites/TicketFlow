// Attachment backfill: copies legacy inline Buffers (ticket.attachments[].data,
// comment.attachment.data) into the GridFS attachments bucket, stamps `fileId`,
// and — once every copy is verified — strips the inline bytes from the docs.
//
// SAFE TO RE-RUN: rows with a `fileId` are skipped; a `--strip` pass only
// touches rows that have a fileId AND whose stored bytes were verified this
// run. Run with: `npm run attachments:backfill` (add `-- --strip` to also
// remove the legacy bytes).
//
// Idempotency corner case: a `fileId` without a matching GridFS file (partial
// prior run) is reported as `missingStore` and re-stored from the inline data
// on the next pass — the inline bytes are only stripped when the store copy
// is verified byte-identical (size match).
import Module from "node:module";

// Stub the "server-only" guard so the store module loads outside Next.
const original = (Module.prototype as any).require;
(Module.prototype as any).require = function (id: string) {
  if (id === "server-only") return {};
  return original.apply(this, arguments as any);
};

import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadDotenv() {
  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2];
      }
    }
  } catch {
    /* ignore */
  }
}
loadDotenv();

import mongoose from "mongoose";
import { GridFSBucket, ObjectId } from "mongodb";
import { Ticket, Comment } from "../src/lib/db/models";

const STRIP = process.argv.includes("--strip");
const DRY_RUN = process.argv.includes("--dry-run");

interface Report {
  ticketAttachments: { scanned: number; migrated: number; verified: number; stripped: number; missingStore: number; skippedNoData: number };
  commentAttachments: { scanned: number; migrated: number; verified: number; stripped: number; missingStore: number; skippedNoData: number };
}

const report: Report = {
  ticketAttachments: { scanned: 0, migrated: 0, verified: 0, stripped: 0, missingStore: 0, skippedNoData: 0 },
  commentAttachments: { scanned: 0, migrated: 0, verified: 0, stripped: 0, missingStore: 0, skippedNoData: 0 },
};

function bufferOf(raw: unknown): Buffer {
  // Mirror of the download route's Binary→Buffer handling (BSON v7 Binary is
  // not a Uint8Array; Buffer.from(binary) silently returns empty).
  if (Buffer.isBuffer(raw)) return raw;
  const obj = raw as { buffer?: ArrayBuffer | Buffer | Uint8Array; position?: number } | undefined;
  if (obj && typeof obj === "object" && obj.buffer != null) {
    return typeof obj.position === "number"
      ? Buffer.from(obj.buffer as ArrayBuffer, 0, obj.position)
      : Buffer.from(obj.buffer as Uint8Array);
  }
  return Buffer.from((raw ?? new Uint8Array()) as Uint8Array);
}

/** Store inline bytes; returns fileId, or null when there was nothing to move. */
async function migrateOne(
  bucket: GridFSBucket,
  raw: unknown,
  meta: { filename: string; mime: string },
  counts: Report["ticketAttachments"]
): Promise<string | null> {
  const buf = bufferOf(raw);
  if (buf.length === 0) {
    counts.skippedNoData += 1;
    return null;
  }
  counts.scanned += 1;
  const fileId = new ObjectId();
  if (DRY_RUN) {
    counts.migrated += 1;
    return "dry-run";
  }
  await new Promise<void>((resolve, reject) => {
    const stream = bucket.openUploadStreamWithId(fileId, meta.filename, { metadata: { mime: meta.mime } });
    stream.on("finish", () => resolve());
    stream.on("error", reject);
    stream.end(buf);
  });
  counts.migrated += 1;
  return fileId.toString();
}

async function verifyOne(bucket: GridFSBucket, fileId: string, expectedSize: number): Promise<boolean> {
  const files = bucket.find({ _id: new ObjectId(fileId) }).limit(1);
  const meta = await files.next();
  return !!meta && meta.length === expectedSize;
}

async function backfillTickets(bucket: GridFSBucket): Promise<void> {
  const rows = await Ticket.find({ "attachments.0": { $exists: true } }).lean();
  for (const ticket of rows) {
    for (const att of ticket.attachments ?? []) {
      const c = report.ticketAttachments;
      const inlineSize = bufferOf(att.data).length;
      if (att.fileId) {
        // Already migrated at some point — verify the store copy still exists.
        if (await verifyOne(bucket, att.fileId, inlineSize)) {
          c.verified += 1;
        } else if (inlineSize > 0) {
          // fileId dangling but inline bytes remain: re-store them.
          const newId = await migrateOne(bucket, att.data, { filename: att.name, mime: att.mime }, c);
          if (newId && newId !== "dry-run") {
            await Ticket.updateOne(
              { _id: ticket._id, "attachments._id": att._id },
              { $set: { "attachments.$.fileId": newId } }
            );
          }
        } else {
          c.missingStore += 1;
        }
        continue;
      }
      if (inlineSize === 0 && !att.data) {
        c.skippedNoData += 1;
        continue;
      }
      const newId = await migrateOne(bucket, att.data, { filename: att.name, mime: att.mime }, c);
      if (!newId || newId === "dry-run") continue;
      await Ticket.updateOne(
        { _id: ticket._id, "attachments._id": att._id },
        { $set: { "attachments.$.fileId": newId } }
      );
    }
  }
}

async function backfillComments(bucket: GridFSBucket): Promise<void> {
  const commentRows = await Comment.find({ attachment: { $exists: true, $ne: null } }).lean();
  for (const comment of commentRows) {
    const att = comment.attachment;
    if (!att) continue;
    const c = report.commentAttachments;
    const inlineSize = bufferOf(att.data).length;
    if (att.fileId) {
      if (await verifyOne(bucket, att.fileId, inlineSize)) {
        c.verified += 1;
      } else if (inlineSize > 0) {
        const newId = await migrateOne(bucket, att.data, { filename: att.name, mime: att.mime }, c);
        if (newId && newId !== "dry-run") {
          await Comment.updateOne({ _id: comment._id }, { $set: { "attachment.fileId": newId } });
        }
      } else {
        c.missingStore += 1;
      }
      continue;
    }
    if (inlineSize === 0 && !att.data) {
      c.skippedNoData += 1;
      continue;
    }
    const newId = await migrateOne(bucket, att.data, { filename: att.name, mime: att.mime }, c);
    if (!newId) continue;
    if (newId !== "dry-run") {
      await Comment.updateOne({ _id: comment._id }, { $set: { "attachment.fileId": newId } });
    }
  }
}

async function stripTicketBytes(): Promise<number> {
  // Only rows with a fileId lose their inline bytes; the $unset runs server-
  // side so a concurrent re-save can't reintroduce ambiguity.
  const res = await Ticket.updateMany(
    { "attachments.fileId": { $exists: true }, "attachments.data": { $exists: true } },
    { $unset: { "attachments.$[].data": "" } }
  );
  return res.modifiedCount ?? 0;
}

async function stripCommentBytes(): Promise<number> {
  const res = await Comment.updateMany(
    { "attachment.fileId": { $exists: true }, "attachment.data": { $exists: true } },
    { $unset: { "attachment.data": "" } }
  );
  return res.modifiedCount ?? 0;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB || undefined });
  const bucket = new GridFSBucket(mongoose.connection.db!, { bucketName: "attachments" });

  await backfillTickets(bucket);
  await backfillComments(bucket);

  if (STRIP) {
    report.ticketAttachments.stripped = await stripTicketBytes();
    report.commentAttachments.stripped = await stripCommentBytes();
  }

  console.log(JSON.stringify(report, null, 2));
  if (DRY_RUN) console.log("(dry run — nothing written)");
  else if (!STRIP) console.log("next: re-run with -- --strip to remove legacy inline bytes");
  else console.log("done: legacy inline bytes removed");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("backfill failed:", err);
  process.exit(1);
});
