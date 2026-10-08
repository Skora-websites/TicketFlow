import mongoose, { Document, Schema, Model } from "mongoose";

export type UserRole = "super_admin" | "manager" | "team" | "client";

/** Staff ticket visibility: department-wide, or only tickets assigned to them. */
export type TicketAccess = "department" | "assigned";
export type RoutingMatchType = "any" | "all";
export type RoutingConditionField = "keyword" | "category" | "priority" | "requester";
export type RoutingActionType = "assign_user" | "assign_department" | "set_priority" | "set_status";
export type RoutingRuleStatus = "active" | "paused" | "draft";
export type TicketStatus = "open" | "in_progress" | "on_hold" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "urgent";
// Categories are dynamic since the inter-department panel: the four defaults
// (marketing, development, sales, other) are seeded, but super admins can add
// more at runtime. The union keeps autocomplete for the defaults while still
// accepting dynamically-added names.
export type TicketCategory = "marketing" | "development" | "sales" | "other" | (string & {});
export const DEFAULT_CATEGORIES = ["marketing", "development", "sales", "other"] as const;

// Inter-department transfer lifecycle. The sender (an agent or the manager of
// another team) picks the target department + recipient and SETS the priority;
// the receiving side can read it but never change it. A transfer addressed to
// an agent must be approved by the target department's manager before the
// ticket lands on the agent's dashboard; a transfer addressed to the manager
// puts the assignment decision in the manager's hands directly.
export type TransferDirection = "agent" | "manager";
export type TransferStatus = "pending" | "approved" | "rejected";

export interface ITicketTransfer {
  fromId: mongoose.Types.ObjectId; // sender (agent or manager)
  toDepartmentId: mongoose.Types.ObjectId;
  toUserId?: mongoose.Types.ObjectId | null; // target agent (direction=agent)
  toManagerId?: mongoose.Types.ObjectId | null; // target manager (direction=manager)
  direction: TransferDirection;
  priority: TicketPriority; // set by the sender, read-only for everyone else
  status: TransferStatus;
  approvedBy?: mongoose.Types.ObjectId | null;
  approvedAt?: Date | null;
  rejectedBy?: mongoose.Types.ObjectId | null;
  rejectedAt?: Date | null;
  /** Why the receiving manager denied the transfer (optional, sender-facing). */
  rejectionReason?: string;
  sentAt: Date;
  readAt?: Date | null;
  note?: string;
}
// Conversation entries: regular messages vs auto-generated system events
// ("status → in_progress"). Internal notes are staff-only messages.
export type CommentKind = "message" | "system";
export type CommentVisibility = "public" | "internal";

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  departmentId?: mongoose.Types.ObjectId;
  /** Team-role ticket visibility chosen at creation time (manager option).
   *  Managers always read department-wide regardless of this flag. */
  ticketAccess?: TicketAccess;
  /** The manager this staff member reports to (optional, set by superadmin). */
  reportingManagerId?: mongoose.Types.ObjectId;
  active: boolean;
  createdAt: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  // Bumped on every password change; JWTs carrying an older version are
  // rejected by the session re-validation pass, killing stolen sessions.
  sessionVersion: number;
  // Client self-registration creates the account inactive until the email
  // address is proven via the verification link.
  emailVerified?: Date;
  emailVerifyToken?: string; // sha256 hex of the emailed token
  emailVerifyExpires?: Date;
  // Admin-issued staff invite: the account is created with an unusable random
  // password and the invitee sets their own via a single-use emailed link.
  // Pending invite => no password the holder didn't choose is ever in transit.
  inviteToken?: string; // legacy: sha256 hex token from the removed invite-link flow; inert
  inviteExpires?: Date;
}

export interface IDepartment extends Document {
  name: string;
  color: string;
  description?: string;
  createdAt: Date;
}

/**
 * Attachment metadata. Bytes live in GridFS (see src/lib/attachments-store.ts):
 * `fileId` points at the stored file; `data` remains ONLY on legacy rows
 * written before the GridFS migration (backfill copies them out, then strips
 * it). Strict-mode schema note: `data` is declared so Mongoose doesn't
 * silently drop it on re-saves of legacy docs; new writes never set it.
 */
export interface ITicketAttachment {
  _id?: mongoose.Types.ObjectId;
  name: string;
  mime: string;
  size: number;
  fileId?: string;
  data?: Buffer;
  uploadedAt: Date;
}

export interface ITicket extends Document {
  ticketNumber: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  requesterId: mongoose.Types.ObjectId;
  departmentId?: mongoose.Types.ObjectId;
  assigneeId?: mongoose.Types.ObjectId;
  assignedBy?: mongoose.Types.ObjectId;
  transfer?: ITicketTransfer | null;
  attachments?: ITicketAttachment[];
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
}

export interface IComment extends Document {
  ticketId: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  body: string;
  // "message" = human post; "system" = auto event rendered as a divider.
  kind: CommentKind;
  // "public" = visible to the client; "internal" = staff-only note. Existing
  // comments default to public (additive migration: no backfill needed).
  visibility: CommentVisibility;
  // WhatsApp-style delivery receipt (author's own bubbles): null = not yet
  // delivered to every other party (✓); set = all parties got it (✓✓ grey).
  // Read state comes from TicketReadState comparisons, not this field.
  deliveredAt?: Date | null;
  attachment?: {
    name: string;
    mime: string;
    size: number;
    /** GridFS file id (attachments bucket). New writes set this, not data. */
    fileId?: string;
    /** Legacy inline bytes — pre-GridFS rows only; backfilled then stripped. */
    data?: Buffer;
  };
  createdAt: Date;
  updatedAt?: Date;
}

const UserSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { 
    type: String, 
    enum: ["super_admin", "manager", "team", "client"], 
    required: true,
    default: "client"
  },
  // Team-role ticket scope: "department" (all of the dept's tickets) or
  // "assigned" (only tickets assigned to them). Additive + defaulted so
  // existing agents read as department-wide (previous behavior).
  ticketAccess: {
    type: String,
    enum: ["department", "assigned"],
    default: "department",
  },
  reportingManagerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  departmentId: { type: Schema.Types.ObjectId, ref: "Department" },
  active: { type: Boolean, default: true },
  passwordResetToken: { type: String },
  passwordResetExpires: { type: Date },
  sessionVersion: { type: Number, default: 0 },
  emailVerified: { type: Date },
  emailVerifyToken: { type: String },
  emailVerifyExpires: { type: Date },
  inviteToken: { type: String }, // legacy, flow removed 2026-09-30; kept so old rows still load
  inviteExpires: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

// `unique: true` on the email field already creates this index — a separate
// schema.index() here would trigger Mongoose duplicate-index warnings.

const DepartmentSchema = new Schema<IDepartment>({
  name: { type: String, required: true, unique: true, trim: true },
  color: { type: String, required: true },
  description: { type: String },
  createdAt: { type: Date, default: Date.now },
});

const TransferSchema = new Schema<ITicketTransfer>(
  {
    fromId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    toDepartmentId: { type: Schema.Types.ObjectId, ref: "Department", required: true },
    toUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    toManagerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    direction: { type: String, enum: ["agent", "manager"], required: true },
    priority: { type: String, enum: ["low", "medium", "high", "urgent"], required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      required: true,
    },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    approvedAt: { type: Date, default: null },
    rejectedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: "" },
    sentAt: { type: Date, default: Date.now, required: true },
    readAt: { type: Date, default: null },
    note: { type: String, default: "" },
  },
  { _id: true }
);

const TicketSchema = new Schema<ITicket>({
  ticketNumber: { type: String, required: true, unique: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  // Dynamic categories (see Category model). Validated against the DB in the
  // API layer so super-admin-added categories are accepted immediately.
  category: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    default: "other",
  },
  priority: { 
    type: String, 
    enum: ["low", "medium", "high", "urgent"], 
    required: true,
    default: "medium"
  },
  status: { 
    type: String, 
    enum: ["open", "in_progress", "on_hold", "resolved", "closed"], 
    required: true,
    default: "open"
  },
  requesterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  departmentId: { type: Schema.Types.ObjectId, ref: "Department" },
  assigneeId: { type: Schema.Types.ObjectId, ref: "User" },
  assignedBy: { type: Schema.Types.ObjectId, ref: "User" },
  transfer: { type: TransferSchema, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  closedAt: { type: Date },
  // ponytail resolved 2026-10-03: bytes moved to GridFS (attachments-store.ts);
  // `fileId` set on new writes, legacy rows carry inline `data` until backfilled.
  attachments: [
    {
      name: String,
      mime: String,
      size: Number,
      fileId: String,
      data: Buffer,
      uploadedAt: { type: Date, default: Date.now },
    },
  ],
});

TicketSchema.index({ requesterId: 1 });
TicketSchema.index({ assigneeId: 1 });
TicketSchema.index({ departmentId: 1 });
TicketSchema.index({ status: 1 });
// Inter-department transfer queries: "sent" list + manager approval queue.
TicketSchema.index({ "transfer.fromId": 1 });
TicketSchema.index({ "transfer.status": 1, "transfer.toManagerId": 1 });
TicketSchema.index({ departmentId: 1, "transfer.status": 1 });

/* ------------------------------ Categories ------------------------------ */

// Ticket categories used by BOTH client tickets and agent tickets. The four
// defaults are seeded; super admins can add more from the dashboard. Stored
// lowercase with a unique slug for stable API values.
export interface ICategory extends Document {
  name: string;
  slug: string;
  color?: string;
  description?: string;
  // The department that owns this category: inter-department transfers of a
  // ticket may only target this department (its manager approves/assigns).
  departmentId?: mongoose.Types.ObjectId | null;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    color: { type: String },
    description: { type: String },
    departmentId: { type: Schema.Types.ObjectId, ref: "Department", default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const Category: Model<ICategory> =
  (mongoose.models.Category as Model<ICategory>) ||
  mongoose.model<ICategory>("Category", CategorySchema);
// Compound index for the hottest aggregates (agent-load scoring on every
// unassigned ticket creation, stats workload, capacity board). ticketNumber's
// unique index comes from the field definition (unique: true).
TicketSchema.index({ assigneeId: 1, status: 1 });

// Full-text search over titles + descriptions (src/lib/search.ts). ONE text
// index per collection — keep it here and nowhere else. Token-stemmed, so
// substring fragments don't match; exact ticket numbers go through the
// ticketNumber regex branch instead.
TicketSchema.index({ title: "text", description: "text" });

const CommentSchema = new Schema<IComment>({
  ticketId: { type: Schema.Types.ObjectId, ref: "Ticket", required: true },
  authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  body: { type: String, required: true },
  kind: { type: String, enum: ["message", "system"], default: "message", required: true },
  visibility: { type: String, enum: ["public", "internal"], default: "public", required: true },
  // WhatsApp-style receipts on the author's own bubbles: null = not yet
  // pushed to every other party (✓), set = everyone got it (✓✓ grey) — read
  // receipts come from TicketReadState comparisons, not this field.
  deliveredAt: { type: Date, default: null },
  attachment: {
    name: String,
    mime: String,
    size: Number,
    fileId: String,
    data: Buffer,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
});

CommentSchema.index({ ticketId: 1, createdAt: 1 });

/* ------------------------- Ticket Read State ------------------------- */

// One row per (user, ticket): tracks when each participant last viewed the
// conversation. Powers unread badges and ✓✓ read receipts. Rows are created
// lazily on first read — no backfill needed.
export interface ITicketReadState extends Document {
  userId: mongoose.Types.ObjectId;
  ticketId: mongoose.Types.ObjectId;
  lastReadAt: Date;
  /** Latest time this user was DELIVERED a live event for this ticket. */
  deliveredAt?: Date | null;
}

const TicketReadStateSchema = new Schema<ITicketReadState>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  ticketId: { type: Schema.Types.ObjectId, ref: "Ticket", required: true },
  lastReadAt: { type: Date, required: true },
  deliveredAt: { type: Date, default: null },
});

TicketReadStateSchema.index({ userId: 1, ticketId: 1 }, { unique: true });

export const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
export const Department: Model<IDepartment> = mongoose.models.Department || mongoose.model<IDepartment>("Department", DepartmentSchema);
export const Ticket: Model<ITicket> = mongoose.models.Ticket || mongoose.model<ITicket>("Ticket", TicketSchema);
export const Comment: Model<IComment> = mongoose.models.Comment || mongoose.model<IComment>("Comment", CommentSchema);
export const TicketReadState: Model<ITicketReadState> =
  (mongoose.models.TicketReadState as Model<ITicketReadState>) ||
  mongoose.model<ITicketReadState>("TicketReadState", TicketReadStateSchema);

/* ------------------------- Notification Schema ------------------------- */

export type NotificationType =
  | "ticket_assigned"
  | "status_changed"
  | "comment_added"
  | "transfer_sent"
  | "transfer_approved"
  | "transfer_rejected";

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId; // recipient
  type: NotificationType;
  ticketId: mongoose.Types.ObjectId;
  ticketNumber: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },    type: {
      type: String,
      enum: ["ticket_assigned", "status_changed", "comment_added", "transfer_sent", "transfer_approved", "transfer_rejected"],
      required: true,
    },
  ticketId: { type: Schema.Types.ObjectId, ref: "Ticket", required: true, index: true },
  ticketNumber: { type: String, required: true },
  title: { type: String, required: true },
  body: { type: String, required: true },
  read: { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now },
});

NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export const Notification: Model<INotification> =
  (mongoose.models.Notification as Model<INotification>) ||
  mongoose.model<INotification>("Notification", NotificationSchema);

/* ------------------------- Routing Rules Schema ------------------------- */

export interface IRoutingCondition {
  field: RoutingConditionField;
  operator: "contains" | "equals" | "in" | "not_in";
  value: string | string[];
  caseSensitive?: boolean;
}

export interface IRoutingAction {
  type: RoutingActionType;
  targetId?: string; // user id or department id
  value?: string; // for set_priority / set_status
}

export interface IRoutingRule extends Document {
  name: string;
  description?: string;
  priority: number; // lower number = higher priority in evaluation order
  matchType: RoutingMatchType; // any/all conditions must match
  conditions: IRoutingCondition[];
  actions: IRoutingAction[];
  fallbackAssigneeId?: mongoose.Types.ObjectId; // user to assign if rule matches but no assignee action
  fallbackDepartmentId?: mongoose.Types.ObjectId;
  status: RoutingRuleStatus;
  stats: {
    matchCount: number;
    lastMatchedAt?: Date;
  };
  // Author of the rule. Managers may only see rules targeting their own
  // department OR rules they created themselves (targetless org-wide rules
  // authored by super_admins carry sensitive names/descriptions).
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const RoutingRuleSchema = new Schema<IRoutingRule>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    priority: { type: Number, default: 100, index: true },
    matchType: {
      type: String,
      enum: ["any", "all"],
      default: "all",
      required: true,
    },
    conditions: [
      {
        field: {
          type: String,
          enum: ["keyword", "category", "priority", "requester"],
          required: true,
        },
        operator: {
          type: String,
          enum: ["contains", "equals", "in", "not_in"],
          default: "contains",
          required: true,
        },
        value: { type: Schema.Types.Mixed, required: true },
        caseSensitive: { type: Boolean, default: false },
      },
    ],
    actions: [
      {
        type: {
          type: String,
          enum: ["assign_user", "assign_department", "set_priority", "set_status"],
          required: true,
        },
        targetId: { type: String },
        value: { type: String },
      },
    ],
    fallbackAssigneeId: { type: Schema.Types.ObjectId, ref: "User" },
    fallbackDepartmentId: { type: Schema.Types.ObjectId, ref: "Department" },
    status: {
      type: String,
      enum: ["active", "paused", "draft"],
      default: "draft",
      required: true,
    },
    stats: {
      matchCount: { type: Number, default: 0 },
      lastMatchedAt: { type: Date },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

RoutingRuleSchema.index({ status: 1, priority: 1 });

export const RoutingRule: Model<IRoutingRule> =
  (mongoose.models.RoutingRule as Model<IRoutingRule>) ||
  mongoose.model<IRoutingRule>("RoutingRule", RoutingRuleSchema);

/* ------------------- Agent Availability / Capacity Schema ----------------- */

export interface IAgentAvailability extends Document {
  userId: mongoose.Types.ObjectId;
  status: "available" | "busy" | "away" | "offline";
  capacity: number; // max open tickets they should hold
  currentLoad: number; // computed cache
  skills: string[]; // tags/keywords this agent specializes in
  workingHours?: {
    timezone: string;
    schedule: {
      day: number; // 0–6, Sun–Sat
      start: string; // "09:00"
      end: string; // "18:00"
    }[];
  };
  lastSeenAt: Date;
  updatedAt: Date;
}

const AgentAvailabilitySchema = new Schema<IAgentAvailability>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    status: {
      type: String,
      enum: ["available", "busy", "away", "offline"],
      default: "available",
      required: true,
    },
    capacity: { type: Number, default: 10 },
    currentLoad: { type: Number, default: 0 },
    skills: [{ type: String }],
    workingHours: {
      timezone: { type: String, default: "UTC" },
      schedule: [
        {
          day: { type: Number },
          start: { type: String },
          end: { type: String },
        },
      ],
    },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const AgentAvailability: Model<IAgentAvailability> =
  (mongoose.models.AgentAvailability as Model<IAgentAvailability>) ||
  mongoose.model<IAgentAvailability>("AgentAvailability", AgentAvailabilitySchema);