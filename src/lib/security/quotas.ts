import mongoose from "mongoose";

/**
 * Usage Quotas for Free-Tier Deployment:
 * - Email sending daily quota (protects Brevo / Resend / SendGrid daily caps)
 * - User ticket submission quota (prevents ticket floods)
 * - File storage quotas (protects MongoDB Atlas M0 512MB free tier)
 */

export const DEFAULT_DAILY_EMAIL_QUOTA = Number(process.env.EMAIL_DAILY_QUOTA) || 250;
export const DEFAULT_CLIENT_DAILY_TICKET_QUOTA = Number(process.env.DAILY_CLIENT_TICKET_QUOTA) || 25;

export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024; // 4 MB per file
export const MAX_ATTACHMENTS_PER_TICKET = 5;
export const DAILY_USER_UPLOAD_LIMIT_BYTES = 20 * 1024 * 1024; // 20 MB / day / user
export const STORAGE_SAFETY_LIMIT_BYTES = 350 * 1024 * 1024; // 350 MB ceiling for Atlas M0

interface QuotaState {
  emailDate: string;
  emailsSent: number;
  userTickets: Map<string, { date: string; count: number }>;
  userUploads: Map<string, { date: string; bytes: number }>;
  estimatedStorageBytes: number;
  lastStorageCheckAt: number;
}

const g = globalThis as unknown as { __quotaState?: QuotaState };

function getQuotaState(): QuotaState {
  if (!g.__quotaState) {
    g.__quotaState = {
      emailDate: getTodayKey(),
      emailsSent: 0,
      userTickets: new Map(),
      userUploads: new Map(),
      estimatedStorageBytes: 0,
      lastStorageCheckAt: 0,
    };
  }
  return g.__quotaState;
}

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Email Quotas
// ─────────────────────────────────────────────────────────────────────────────

export async function canSendEmail(
  type: "critical" | "notification" = "notification"
): Promise<{ allowed: boolean; remaining: number; reason?: string }> {
  const state = getQuotaState();
  const today = getTodayKey();
  if (state.emailDate !== today) {
    state.emailDate = today;
    state.emailsSent = 0;
  }

  const quota = DEFAULT_DAILY_EMAIL_QUOTA;
  const used = state.emailsSent;
  const remaining = Math.max(0, quota - used);

  if (used >= quota) {
    return {
      allowed: false,
      remaining: 0,
      reason: `Daily free email quota (${quota}) exhausted.`,
    };
  }

  // Reserve 15% of the daily quota for critical emails (account verification, password reset)
  const notificationCeiling = Math.floor(quota * 0.85);
  if (type === "notification" && used >= notificationCeiling) {
    return {
      allowed: false,
      remaining,
      reason: `Daily notification email threshold (${notificationCeiling}/${quota}) reached to preserve critical auth emails.`,
    };
  }

  return { allowed: true, remaining };
}

export async function recordEmailSent(): Promise<void> {
  const state = getQuotaState();
  const today = getTodayKey();
  if (state.emailDate !== today) {
    state.emailDate = today;
    state.emailsSent = 0;
  }
  state.emailsSent += 1;
}

export async function getEmailQuotaStatus(): Promise<{ used: number; quota: number; remaining: number }> {
  const state = getQuotaState();
  const today = getTodayKey();
  if (state.emailDate !== today) {
    state.emailDate = today;
    state.emailsSent = 0;
  }
  return {
    used: state.emailsSent,
    quota: DEFAULT_DAILY_EMAIL_QUOTA,
    remaining: Math.max(0, DEFAULT_DAILY_EMAIL_QUOTA - state.emailsSent),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Ticket Creation Quota
// ─────────────────────────────────────────────────────────────────────────────

export async function canCreateTicket(
  userId: string,
  role: string
): Promise<{ allowed: boolean; count: number; limit: number; remaining: number }> {
  // Staff (agents, managers, super admins) are not constrained by the client daily quota
  if (role !== "client") {
    return { allowed: true, count: 0, limit: 9999, remaining: 9999 };
  }

  const state = getQuotaState();
  const today = getTodayKey();
  const userEntry = state.userTickets.get(userId);

  let currentCount = 0;
  if (userEntry && userEntry.date === today) {
    currentCount = userEntry.count;
  } else {
    state.userTickets.set(userId, { date: today, count: 0 });
  }

  const limit = DEFAULT_CLIENT_DAILY_TICKET_QUOTA;
  const allowed = currentCount < limit;
  const remaining = Math.max(0, limit - currentCount);

  return { allowed, count: currentCount, limit, remaining };
}

export async function recordTicketCreated(userId: string): Promise<void> {
  const state = getQuotaState();
  const today = getTodayKey();
  const entry = state.userTickets.get(userId);
  if (entry && entry.date === today) {
    entry.count += 1;
  } else {
    state.userTickets.set(userId, { date: today, count: 1 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Storage & Attachment Quotas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculates current total GridFS storage in MongoDB.
 * Cached for 30 seconds to avoid querying GridFS chunks repeatedly.
 */
export async function getGridFSStorageUsage(): Promise<number> {
  const state = getQuotaState();
  const now = Date.now();
  if (state.lastStorageCheckAt && now - state.lastStorageCheckAt < 30_000) {
    return state.estimatedStorageBytes;
  }

  try {
    if (mongoose.connection.db) {
      const stats = await mongoose.connection.db.collection("attachments.files").aggregate([
        { $group: { _id: null, totalBytes: { $sum: "$length" } } },
      ]).toArray();
      const bytes = (stats[0]?.totalBytes as number) || 0;
      state.estimatedStorageBytes = bytes;
      state.lastStorageCheckAt = now;
      return bytes;
    }
  } catch {
    // If table doesn't exist yet, return cached or 0
  }

  return state.estimatedStorageBytes;
}

export async function canUploadAttachment(
  userId: string,
  newFileBytes: number
): Promise<{ allowed: boolean; reason?: string }> {
  if (newFileBytes > MAX_ATTACHMENT_BYTES) {
    return {
      allowed: false,
      reason: `Attachment exceeds 4MB limit (${(newFileBytes / (1024 * 1024)).toFixed(1)}MB).`,
    };
  }

  // Check user daily upload limit
  const state = getQuotaState();
  const today = getTodayKey();
  const uploadEntry = state.userUploads.get(userId);
  const currentDailyBytes = uploadEntry && uploadEntry.date === today ? uploadEntry.bytes : 0;

  if (currentDailyBytes + newFileBytes > DAILY_USER_UPLOAD_LIMIT_BYTES) {
    return {
      allowed: false,
      reason: `Daily upload quota (20MB) reached for today.`,
    };
  }

  // Check global storage safety ceiling
  const totalStorage = await getGridFSStorageUsage();
  if (totalStorage + newFileBytes > STORAGE_SAFETY_LIMIT_BYTES) {
    return {
      allowed: false,
      reason: "Storage capacity limit reached to preserve free database tier. Please remove older attachments.",
    };
  }

  return { allowed: true };
}

export async function recordAttachmentUploaded(userId: string, fileBytes: number): Promise<void> {
  const state = getQuotaState();
  const today = getTodayKey();
  const entry = state.userUploads.get(userId);
  if (entry && entry.date === today) {
    entry.bytes += fileBytes;
  } else {
    state.userUploads.set(userId, { date: today, bytes: fileBytes });
  }
  state.estimatedStorageBytes += fileBytes;
}

export async function recordAttachmentDeleted(fileBytes: number): Promise<void> {
  const state = getQuotaState();
  state.estimatedStorageBytes = Math.max(0, state.estimatedStorageBytes - fileBytes);
}
