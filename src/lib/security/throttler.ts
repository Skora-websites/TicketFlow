/**
 * Request Throttling:
 * - Active SSE Stream Concurrency Throttling (protects serverless / socket exhaustion)
 * - Burst Throttling (protects against rapid-fire script hammering)
 * - Heavy Action Concurrency Throttling (protects CPU & RAM on heavy aggregations)
 */

export const MAX_CONCURRENT_SSE_PER_USER = 3;
export const MAX_CONCURRENT_HEAVY_ACTIONS_PER_USER = 2;

interface ThrottlerState {
  activeStreams: Map<string, number>;
  activeHeavyActions: Map<string, number>;
  burstEntries: Map<string, { count: number; resetAt: number }>;
}

const g = globalThis as unknown as { __throttlerState?: ThrottlerState };

function getThrottlerState(): ThrottlerState {
  if (!g.__throttlerState) {
    g.__throttlerState = {
      activeStreams: new Map(),
      activeHeavyActions: new Map(),
      burstEntries: new Map(),
    };
  }
  return g.__throttlerState;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SSE Stream Concurrency Throttler
// ─────────────────────────────────────────────────────────────────────────────

export function acquireStreamSlot(
  userId: string,
  maxStreams = MAX_CONCURRENT_SSE_PER_USER
): { allowed: boolean; activeCount: number; release: () => void } {
  const state = getThrottlerState();
  const current = state.activeStreams.get(userId) || 0;

  if (current >= maxStreams) {
    return {
      allowed: false,
      activeCount: current,
      release: () => {},
    };
  }

  state.activeStreams.set(userId, current + 1);

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const now = state.activeStreams.get(userId) || 0;
    if (now <= 1) {
      state.activeStreams.delete(userId);
    } else {
      state.activeStreams.set(userId, now - 1);
    }
  };

  return {
    allowed: true,
    activeCount: current + 1,
    release,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Heavy Action Concurrency Throttler
// ─────────────────────────────────────────────────────────────────────────────

export function acquireHeavyActionSlot(
  userId: string,
  maxConcurrent = MAX_CONCURRENT_HEAVY_ACTIONS_PER_USER
): { allowed: boolean; release: () => void } {
  const state = getThrottlerState();
  const current = state.activeHeavyActions.get(userId) || 0;

  if (current >= maxConcurrent) {
    return {
      allowed: false,
      release: () => {},
    };
  }

  state.activeHeavyActions.set(userId, current + 1);

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const now = state.activeHeavyActions.get(userId) || 0;
    if (now <= 1) {
      state.activeHeavyActions.delete(userId);
    } else {
      state.activeHeavyActions.set(userId, now - 1);
    }
  };

  return {
    allowed: true,
    release,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Short-Window Burst Throttler (Token Bucket)
// ─────────────────────────────────────────────────────────────────────────────

export function checkBurstThrottle(
  key: string,
  maxBurst = 15,
  windowMs = 2000
): { throttled: boolean; retryAfter: number } {
  const state = getThrottlerState();
  const now = Date.now();

  if (state.burstEntries.size > 5000) {
    for (const [k, e] of state.burstEntries.entries()) {
      if (now > e.resetAt) {
        state.burstEntries.delete(k);
      }
    }
  }

  const entry = state.burstEntries.get(key);

  if (!entry || now > entry.resetAt) {
    state.burstEntries.set(key, { count: 1, resetAt: now + windowMs });
    return { throttled: false, retryAfter: 0 };
  }

  entry.count += 1;
  if (entry.count > maxBurst) {
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { throttled: true, retryAfter };
  }

  return { throttled: false, retryAfter: 0 };
}

export function getThrottleStats(): {
  activeStreamsTotal: number;
  activeHeavyActionsTotal: number;
} {
  const state = getThrottlerState();
  let streams = 0;
  for (const count of state.activeStreams.values()) streams += count;
  let heavy = 0;
  for (const count of state.activeHeavyActions.values()) heavy += count;
  return {
    activeStreamsTotal: streams,
    activeHeavyActionsTotal: heavy,
  };
}
