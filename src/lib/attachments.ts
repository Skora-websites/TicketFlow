/**
 * Strip binary attachment payloads from ticket documents before they are
 * serialized into JSON responses. Without this, every list/detail response
 * would carry each attachment's raw bytes as base64 (up to ~5.3 MB per file).
 * Metadata (_id, name, mime, size) is preserved so the UI can still render
 * download links pointing at /api/tickets/[id]/attachments/[attachmentId].
 */
export function stripAttachmentData<T>(doc: T): T {
  if (!doc || typeof doc !== "object") return doc;
  const rec = doc as Record<string, unknown>;
  if (!Array.isArray(rec.attachments)) return doc;
  return {
    ...rec,
    attachments: rec.attachments.map((a) => {
      const { data: _data, ...meta } = a as Record<string, unknown>;
      return meta;
    }),
  } as unknown as T;
}

/**
 * Same treatment for comments, whose singular `attachment` subdocument also
 * carries raw bytes (name/mime/size/data).
 */
export function stripCommentAttachmentData<T>(doc: T): T {
  if (!doc || typeof doc !== "object") return doc;
  const rec = doc as Record<string, unknown>;
  if (!rec.attachment || typeof rec.attachment !== "object") return doc;
  const { data: _data, ...meta } = rec.attachment as Record<string, unknown>;
  return { ...rec, attachment: meta } as unknown as T;
}
