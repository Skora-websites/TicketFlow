/**
 * Server configuration access.
 *
 * Every required value is read in exactly one place so a missing variable
 * fails loudly instead of silently falling back to a checked-in default. The
 * previous behaviour left a public JWT signing key and a live database
 * credential in the source tree.
 */

const MIN_SECRET_LENGTH = 32;

const g = globalThis as unknown as { __devAuthSecret?: string };

function isProduction(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}

export function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Configure it in the deployment environment (or .env.local for development)."
    );
  }
  return uri;
}

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= MIN_SECRET_LENGTH) return secret;

  if (isProduction()) {
    throw new Error(
      `AUTH_SECRET must be set to a random value of at least ${MIN_SECRET_LENGTH} characters. ` +
        "Generate one with `openssl rand -base64 32` and set it in the deployment environment."
    );
  }

  // Development/test only: an ephemeral per-process key, never persisted and
  // never checked in. Restarting the dev server signs everyone out, which is
  // the correct trade-off against shipping a known signing key in the repo.
  if (!g.__devAuthSecret) {
    g.__devAuthSecret = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    console.warn(
      "[env] AUTH_SECRET is not set — using an ephemeral development secret. Sessions reset when the server restarts."
    );
  }
  return g.__devAuthSecret;
}
