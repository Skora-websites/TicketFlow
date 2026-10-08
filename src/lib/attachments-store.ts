import "server-only";

import { GridFSBucket, ObjectId } from "mongodb";
import type { Readable } from "stream";
import mongoose from "mongoose";

/**
 * Attachment bytes live OUTSIDE ticket/comment documents. Two reasons this
 * exists: (1) inline Buffers march documents toward Mongo's 16MB BSON limit
 * (the ticket.attachments array accumulates) and force every comments-page
 * query to haul bytes out of storage only to strip them before responding;
 * (2) GridFS gives streaming + dedupe-ability that inline Buffers never can.
 *
 * GridFS is two ordinary collections (bucket.files / bucket.chunks) in the
 * SAME database, so the backup/restore story is unchanged — mongodump covers
 * it. A disk/S3 driver can slot behind this same surface later; write paths
 * must order operations file-FIRST, doc-second (see callers) so a crash
 * between the two leaves an orphan file, never a dangling fileId.
 *
 * Uploads are written with chunkSizeBytes aligned to 255KB (the Wire-safe
 * multiple of 16KB that keeps mongodump/restore fast and GridFS indexes
 * exactly as the driver's own defaults would).
 */
export const ATTACHMENTS_BUCKET = "attachments";
const CHUNK_SIZE_BYTES = 255 * 1024;

/**
 * Opaque per-bucket handle. Cache one bucket per connection so repeated
 * uploads don't re-instantiate (cheap, but pointless).
 */
let cachedBucket: GridFSBucket | null = null;
let cachedConnKey: string | null = null;

export function getAttachmentsBucket(): GridFSBucket {
  const conn = mongoose.connection;
  if (!conn.db) {
    throw new Error("getAttachmentsBucket called before connectDB()");
  }
  const key = conn.name ?? "default";
  if (cachedBucket && cachedConnKey === key) return cachedBucket;
  cachedBucket = new GridFSBucket(conn.db, {
    bucketName: ATTACHMENTS_BUCKET,
    chunkSizeBytes: CHUNK_SIZE_BYTES,
  });
  cachedConnKey = key;
  return cachedBucket;
}

export interface StoredFile {
  /** GridFS _id — persisted on the parent subdocument as `fileId`. */
  fileId: ObjectId;
  length: number;
}

/**
 * Store bytes. Callers persist `fileId.toString()` on the parent subdoc
 * AFTER this resolves, alongside the pre-existing metadata (name/mime/size).
 */
export async function putAttachment(
  data: Buffer | Uint8Array,
  meta: { filename: string; mime: string }
): Promise<StoredFile> {
  const bucket = getAttachmentsBucket();
  const fileId = new ObjectId();
  // The driver's typed options carry `metadata` (contentType is not part of
  // the v7 typings) — mime is stored under metadata.mime and read back in
  // openAttachmentStream, though download routes serve the parent doc's mime.
  const stream = bucket.openUploadStreamWithId(fileId, meta.filename, {
    chunkSizeBytes: CHUNK_SIZE_BYTES,
    metadata: { mime: meta.mime },
  });
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", reject);
    stream.end(Buffer.from(data));
  });
  return { fileId, length: stream.length };
}

/**
 * Open a readable stream for the stored bytes. Streaming keeps memory flat
 * regardless of file size and is the reason inline Buffers had to go.
 * Returns null when the fileId is absent (never the case for rows written
 * by putAttachment — a null check guards legacy-shaped callers only).
 */
export async function openAttachmentStream(
  fileId: string
): Promise<{ stream: Readable; length: number; mime: string | null; filename: string } | null> {
  if (!mongoose.connection.db) return null;
  const bucket = getAttachmentsBucket();
  const files = bucket.find({ _id: new ObjectId(fileId) }).limit(1);
  const meta = await files.next();
  if (!meta) return null;
  return {
    stream: bucket.openDownloadStream(meta._id),
    length: meta.length,
    mime:
      (meta.metadata && typeof meta.metadata === "object" && (meta.metadata as { mime?: string }).mime) ||
      (meta as unknown as { contentType?: string }).contentType ||
      null,
    filename: meta.filename,
  };
}

/**
 * Best-effort removal. GridFS delete wipes chunks as well as the file entry.
 * Fire-and-forget callers (comment deletion) swallow errors on purpose:
 * a leftover chunked file is a janitorial concern, never a user-facing one.
 */
export async function deleteAttachment(fileId: string): Promise<void> {
  if (!mongoose.connection.db) return;
  try {
    await getAttachmentsBucket().delete(new ObjectId(fileId));
  } catch {
    // File already gone (double delete, backfill race) — nothing to do.
  }
}

export function isValidStoredFileId(value: unknown): value is string {
  return typeof value === "string" && ObjectId.isValid(value);
}
