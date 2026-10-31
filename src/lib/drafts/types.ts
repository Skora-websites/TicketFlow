export type DraftWorkflowType = "ticket" | "comment" | "rule";

export interface BaseDraft<T = Record<string, any>> {
  id: string; // e.g., "ticket:new:staff", "ticket:new:client", "comment:TK-0001", "rule:builder"
  type: DraftWorkflowType;
  title: string;
  subtitle?: string;
  path: string; // URL path to resume the workflow
  data: T;
  isMinimized: boolean;
  updatedAt: number; // timestamp in ms
}

export interface TicketDraftData {
  title: string;
  description: string;
  category: string;
  priority: "low" | "medium" | "high" | "urgent";
  departmentId?: string;
  assigneeId?: string;
  attachmentNames?: string[];
}

export interface CommentDraftData {
  ticketId: string;
  ticketNumber?: string;
  body: string;
  internal: boolean;
  attachmentName?: string;
}

export interface RuleDraftData {
  ruleId?: string;
  name: string;
  description: string;
  priority: number;
  matchType: "any" | "all";
  status: "active" | "paused" | "draft";
  conditions: Array<{
    id: string;
    field: "keyword" | "category" | "priority" | "requester";
    operator: "contains" | "equals" | "in" | "not_in";
    value: string;
    caseSensitive: boolean;
  }>;
  actions: Array<{
    id: string;
    type: "assign_user" | "assign_department" | "set_priority" | "set_status";
    targetId: string;
    value: string;
  }>;
  fallbackAssigneeId: string;
  fallbackDepartmentId: string;
}
