import { NextResponse } from "next/server";
import { checkRate } from "@/lib/runtime";

export interface RateLimitResult {
  limited: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfter: number;
}

interface BucketEntry {
  count: number;
  resetAt: number;
}

// Bounded state for detailed in-process rate limiting (edge and route layer).
const MAX_ENTRIES = 10_000;
const g = globalThis as unknown as { __rateLimitBuckets?: Map<string, BucketEntry> };

function getBuckets(): Map<string, BucketEntry> {
  if (!g.__rateLimitBuckets) {
    g.__rateLimitBuckets = new Map();
  }
  return g.__rateLimitBuckets;
}

/**
 * Extracts a hardened client IP address from request headers.
 * Uses the rightmost X-Forwarded-For IP (appended by closest trusted reverse proxy)
 * or falls back to X-Real-IP or a fallback identifier.
 */
export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const ips = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (ips.length > 0) {
      return ips[ips.length - 1]; // closest trusted proxy
    }
  }
  return request.headers.get("x-real-ip") || "127.0.0.1";
}

/**
 * Performs fixed-window rate limit check with detailed remaining/reset calculations.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const buckets = getBuckets();

  // Periodic eviction if map gets large
  if (buckets.size > MAX_ENTRIES / 2) {
    for (const [k, entry] of buckets) {
      if (now > entry.resetAt) buckets.delete(k);
    }
  }
  if (buckets.size >= MAX_ENTRIES) {
    buckets.clear();
  }

  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    // Also update runtime checkRate to stay in sync
    void checkRate(key, limit, windowMs);
    return {
      limited: false,
      limit,
      remaining: Math.max(0, limit - 1),
      resetAt,
      retryAfter: Math.ceil(windowMs / 1000),
    };
  }

  entry.count += 1;
  void checkRate(key, limit, windowMs);
  const isLimited = entry.count > limit;
  const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  const remaining = Math.max(0, limit - entry.count);

  return {
    limited: isLimited,
    limit,
    remaining,
    resetAt: entry.resetAt,
    retryAfter,
  };
}

/**
 * Creates a standard RFC-compliant 429 Too Many Requests response with standard headers.
 */
export function rateLimitResponse(
  result: RateLimitResult,
  customMessage = "Too many requests. Please try again later."
): NextResponse {
  return NextResponse.json(
    {
      error: customMessage,
      retryAfter: result.retryAfter,
    },
    {
      status: 429,
      headers: {
        "Retry-After": result.retryAfter.toString(),
        "X-RateLimit-Limit": result.limit.toString(),
        "X-RateLimit-Remaining": result.remaining.toString(),
        "X-RateLimit-Reset": Math.ceil(result.resetAt / 1000).toString(),
      },
    }
  );
}

/**
 * Route-level guard: returns a 429 NextResponse if rate limit is exceeded, or null if allowed.
 */
export async function enforceRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  customMessage?: string
): Promise<NextResponse | null> {
  const result = await checkRateLimit(key, limit, windowMs);
  if (result.limited) {
    return rateLimitResponse(result, customMessage);
  }
  return null;
}
