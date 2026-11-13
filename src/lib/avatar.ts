import "server-only";

/**
 * Avatar validation.
 *
 * Avatar bytes are served from the application's own origin, so the stored
 * value must be an actual raster image. Without this check a user could store
 * `data:text/html;base64,...` or an SVG carrying a script payload and have the
 * avatar endpoint serve it with that type — stored XSS on the app origin.
 *
 * The MIME declared inside the data URL is therefore never trusted: the type
 * is derived from the bytes and only PNG/JPEG/WebP/GIF are accepted.
 */

export const MAX_AVATAR_BYTES = 512 * 1024;

const DATA_URL_RE = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/;

const SIGNATURES: { mime: string; matches: (b: Buffer) => boolean }[] = [
  {
    mime: "image/png",
    matches: (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  },
  {
    mime: "image/jpeg",
    matches: (b) => b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  },
  {
    mime: "image/gif",
    matches: (b) => b.subarray(0, 4).toString("ascii") === "GIF8",
  },
  {
    mime: "image/webp",
    matches: (b) =>
      b.subarray(0, 4).toString("ascii") === "RIFF" &&
      b.subarray(8, 12).toString("ascii") === "WEBP",
  },
];

/** Detect an allowlisted raster-image MIME from the leading bytes, or null. */
export function detectAvatarMime(data: Buffer): string | null {
  if (data.length < 12) return null;
  return SIGNATURES.find((s) => s.matches(data))?.mime ?? null;
}

/**
 * Validate a data-URL avatar. Returns a canonical `data:<verified mime>;base64`
 * string (re-encoded from the decoded bytes) or null when the value is not an
 * allowlisted image under the size cap.
 */
export function parseAvatarDataUrl(value: string): { dataUrl: string; mime: string } | null {
  const match = value.match(DATA_URL_RE);
  if (!match) return null;

  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0 || buffer.length > MAX_AVATAR_BYTES) return null;

  const detected = detectAvatarMime(buffer);
  // The declared type must match what the bytes actually are; a mismatch is a
  // spoofing attempt rather than something to silently "fix".
  if (!detected || detected !== match[1]) return null;

  return {
    dataUrl: `data:${detected};base64,${buffer.toString("base64")}`,
    mime: detected,
  };
}
