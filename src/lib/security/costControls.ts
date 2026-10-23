import { getEmailQuotaStatus, getGridFSStorageUsage, STORAGE_SAFETY_LIMIT_BYTES } from "./quotas";
import { getThrottleStats } from "./throttler";

export const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024; // 10 MB payload ceiling
export const MAX_PAGINATION_LIMIT = 50; // Max items per page
export const DB_QUERY_MAX_TIME_MS = 5000; // 5s timeout on Mongoose queries

/**
 * Validates Content-Length header against max allowed payload bytes.
 */
export function isPayloadTooLarge(
  contentLength: string | null | undefined,
  maxBytes = MAX_PAYLOAD_BYTES
): boolean {
  if (!contentLength) return false;
  const length = parseInt(contentLength, 10);
  return !isNaN(length) && length > maxBytes;
}

/**
 * Safely clamps pagination limits to prevent memory exhaustion attacks.
 */
export function clampPaginationLimit(
  rawLimit: unknown,
  defaultLimit = 20,
  maxLimit = MAX_PAGINATION_LIMIT
): number {
  let val: number;
  if (typeof rawLimit === "number") {
    val = rawLimit;
  } else if (typeof rawLimit === "string") {
    val = parseInt(rawLimit, 10);
  } else {
    return defaultLimit;
  }

  if (isNaN(val) || val <= 0) return defaultLimit;
  return Math.min(val, maxLimit);
}

export interface SecurityAndCostStatus {
  email: {
    usedToday: number;
    dailyQuota: number;
    remaining: number;
  };
  storage: {
    usedBytes: number;
    usedMB: number;
    safetyLimitBytes: number;
    safetyLimitMB: number;
    percentUsed: number;
  };
  throttling: {
    activeStreams: number;
    activeHeavyActions: number;
  };
}

/**
 * Collects a unified report of free-tier resource consumption.
 */
export async function getSecurityAndCostStatus(): Promise<SecurityAndCostStatus> {
  const emailStatus = await getEmailQuotaStatus();
  const storageBytes = await getGridFSStorageUsage();
  const throttleStats = getThrottleStats();

  const usedMB = Number((storageBytes / (1024 * 1024)).toFixed(2));
  const safetyLimitMB = Number((STORAGE_SAFETY_LIMIT_BYTES / (1024 * 1024)).toFixed(2));
  const percentUsed = Number(((storageBytes / STORAGE_SAFETY_LIMIT_BYTES) * 100).toFixed(1));

  return {
    email: {
      usedToday: emailStatus.used,
      dailyQuota: emailStatus.quota,
      remaining: emailStatus.remaining,
    },
    storage: {
      usedBytes: storageBytes,
      usedMB,
      safetyLimitBytes: STORAGE_SAFETY_LIMIT_BYTES,
      safetyLimitMB,
      percentUsed,
    },
    throttling: {
      activeStreams: throttleStats.activeStreamsTotal,
      activeHeavyActions: throttleStats.activeHeavyActionsTotal,
    },
  };
}
