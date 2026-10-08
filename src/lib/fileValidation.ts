// Magic-byte validation for uploads: the client-declared MIME type is not
// trusted on its own — file contents must match the declared/allowlisted type.

// Shared upload limits — single source of truth for every upload endpoint and
// the client-side pre-checks.
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_TICKET = 5;

export const ALLOWED_ATTACHMENT_MIMES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
  "application/x-zip-compressed",
]);

const MAGIC_SIGNATURES: { mime: string; bytes: number[][] }[] = [
  { mime: "image/png", bytes: [[0x89, 0x50, 0x4e, 0x47]] },
  { mime: "image/jpeg", bytes: [[0xff, 0xd8, 0xff]] },
  { mime: "image/gif", bytes: [[0x47, 0x49, 0x46, 0x38]] }, // GIF8
  { mime: "image/webp", bytes: [[0x52, 0x49, 0x46, 0x46]] }, // RIFF....
  { mime: "application/pdf", bytes: [[0x25, 0x50, 0x44, 0x46]] }, // %PDF
  { mime: "application/zip", bytes: [[0x50, 0x4b, 0x03, 0x04], [0x50, 0x4b, 0x05, 0x06], [0x50, 0x4b, 0x07, 0x08]] },
];

// Text-based types (text/plain, text/csv, office docs) have no reliable magic
// bytes; they are accepted without sniffing (served as attachments with
// nosniff, so no rendering risk).
const TEXT_LIKE = new Set(["text/plain", "text/csv"]);
const OFFICE_DOC_MIMES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export function attachmentMimeAllowed(declaredMime: string, data: Buffer): boolean {
  if (TEXT_LIKE.has(declaredMime)) return true;
  if (OFFICE_DOC_MIMES.has(declaredMime)) {
    // OOXML files are zip containers; legacy .doc (msword) is OLE2 (D0 CF 11 E0).
    if (declaredMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      return MAGIC_SIGNATURES[5].bytes.some((sig) => data.subarray(0, sig.length).equals(Buffer.from(sig)));
    }
    return data.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));
  }

  const sigs = MAGIC_SIGNATURES.filter((s) => s.mime === declaredMime).flatMap((s) => s.bytes);
  if (sigs.length === 0) return false; // unknown binary type — reject

  if (declaredMime === "image/webp") {
    // RIFF header + "WEBP" at offset 8
    return (
      data.subarray(0, 4).equals(Buffer.from([0x52, 0x49, 0x46, 0x46])) &&
      data.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  return sigs.some((sig) => data.subarray(0, sig.length).equals(Buffer.from(sig)));
}
