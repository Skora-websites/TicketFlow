"use client";

/**
 * Lightweight in-memory client-side cache for deduplicating API requests
 * and enabling instant progressive renders across route navigations.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const pendingRequests = new Map<string, Promise<unknown>>();

export interface FetchCachedOptions {
  /** Time-to-live in milliseconds during which cached data is considered fresh (default: 30s) */
  ttlMs?: number;
  /** If true, bypasses the cache and forces a network fetch */
  force?: boolean;
}

/**
 * Fetch JSON with deduplication and in-memory TTL caching.
 * Multiple concurrent callers for the same key share a single in-flight promise.
 */
export async function fetchWithCache<T>(
  url: string,
  options?: RequestInit,
  cacheOptions?: FetchCachedOptions
): Promise<T> {
  const ttl = cacheOptions?.ttlMs ?? 30_000;
  const force = cacheOptions?.force ?? false;
  const now = Date.now();

  const cached = cache.get(url) as CacheEntry<T> | undefined;
  if (!force && cached && now - cached.timestamp < ttl) {
    return cached.data;
  }

  // Deduplicate in-flight requests for the exact same URL
  if (pendingRequests.has(url)) {
    return pendingRequests.get(url) as Promise<T>;
  }

  const requestPromise = (async () => {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }
      const data = (await res.json()) as T;
      cache.set(url, { data, timestamp: Date.now() });
      return data;
    } finally {
      pendingRequests.delete(url);
    }
  })();

  pendingRequests.set(url, requestPromise);
  return requestPromise;
}

/**
 * Peek at cache without fetching. Returns cached value if present (even if slightly stale).
 */
export function getCached<T>(url: string): T | undefined {
  const entry = cache.get(url) as CacheEntry<T> | undefined;
  return entry?.data;
}

/**
 * Invalidate a specific URL or prefix in the cache (e.g. after a mutation).
 */
export function invalidateCache(urlOrPrefix?: string): void {
  if (!urlOrPrefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key === urlOrPrefix || key.startsWith(urlOrPrefix)) {
      cache.delete(key);
    }
  }
}
