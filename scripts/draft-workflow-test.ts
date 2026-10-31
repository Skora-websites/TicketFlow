import assert from "node:assert";

// Mock localStorage in Node environment
const store = new Map<string, string>();
(globalThis as any).window = {
  localStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => store.set(key, val),
    removeItem: (key: string) => store.delete(key),
    get length() {
      return store.size;
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
  },
};

import {
  saveDraftToStorage,
  loadDraftFromStorage,
  removeDraftFromStorage,
  loadAllDraftsFromStorage,
} from "../src/lib/drafts/storage";
import { BaseDraft, TicketDraftData, CommentDraftData, RuleDraftData } from "../src/lib/drafts/types";

console.log("Draft & Minimize Workflow Test Suite");

// 1. Save and Load Ticket Draft
{
  const ticketDraft: BaseDraft<TicketDraftData> = {
    id: "ticket:new:staff",
    type: "ticket",
    title: "Draft: Database connection timeout",
    subtitle: "Investigating Atlas cluster",
    path: "/dashboard/tickets/new",
    data: {
      title: "Database connection timeout",
      description: "Getting connection drops every 5 minutes",
      category: "database",
      priority: "high",
    },
    isMinimized: true,
    updatedAt: Date.now(),
  };

  const saved = saveDraftToStorage(ticketDraft);
  assert.strictEqual(saved, true, "Saves ticket draft to storage");

  const loaded = loadDraftFromStorage<TicketDraftData>("ticket:new:staff");
  assert.ok(loaded, "Loads saved ticket draft");
  assert.strictEqual(loaded.data.title, "Database connection timeout");
  assert.strictEqual(loaded.isMinimized, true);
  console.log("  ok - ticket draft save and load");
}

// 2. Save and Load Comment Draft
{
  const commentDraft: BaseDraft<CommentDraftData> = {
    id: "comment:TK-0042",
    type: "comment",
    title: "Reply to TK-0042",
    subtitle: "I checked the logs...",
    path: "/dashboard/tickets/68f12a...",
    data: {
      ticketId: "68f12a...",
      body: "I checked the logs and identified the replica set issue.",
      internal: true,
    },
    isMinimized: false,
    updatedAt: Date.now(),
  };

  saveDraftToStorage(commentDraft);
  const loaded = loadDraftFromStorage<CommentDraftData>("comment:TK-0042");
  assert.ok(loaded, "Loads comment draft");
  assert.strictEqual(loaded.data.internal, true);
  console.log("  ok - comment draft save and load with internal flag");
}

// 3. Save and Load Rule Draft
{
  const ruleDraft: BaseDraft<RuleDraftData> = {
    id: "rule:builder",
    type: "rule",
    title: "Rule: VIP Customer Routing",
    path: "/dashboard/routing",
    data: {
      name: "VIP Customer Routing",
      description: "Route tier-1 accounts directly to senior team",
      priority: 10,
      matchType: "all",
      status: "active",
      conditions: [
        { id: "c1", field: "priority", operator: "equals", value: "urgent", caseSensitive: false },
      ],
      actions: [
        { id: "a1", type: "assign_department", targetId: "d1", value: "" },
      ],
      fallbackAssigneeId: "",
      fallbackDepartmentId: "",
    },
    isMinimized: true,
    updatedAt: Date.now(),
  };

  saveDraftToStorage(ruleDraft);
  const loaded = loadDraftFromStorage<RuleDraftData>("rule:builder");
  assert.ok(loaded, "Loads rule draft");
  assert.strictEqual(loaded.data.conditions.length, 1);
  console.log("  ok - rule builder draft preserves conditions and actions");
}

// 4. Listing all active drafts
{
  const all = loadAllDraftsFromStorage();
  assert.strictEqual(all.length, 3, "Loads all 3 drafts sorted by updatedAt");
  console.log("  ok - loadAllDraftsFromStorage retrieves all active drafts");
}

// 5. Remove Draft
{
  removeDraftFromStorage("comment:TK-0042");
  const loaded = loadDraftFromStorage("comment:TK-0042");
  assert.strictEqual(loaded, null, "Successfully discards removed draft");

  const remaining = loadAllDraftsFromStorage();
  assert.strictEqual(remaining.length, 2, "Remaining count matches after discard");
  console.log("  ok - discard and remove draft");
}

// 6. Expired Draft Handling
{
  const expiredDraft: BaseDraft = {
    id: "ticket:expired",
    type: "ticket",
    title: "Old Draft",
    path: "/dashboard/tickets/new",
    data: {},
    isMinimized: false,
    updatedAt: Date.now() - (8 * 24 * 60 * 60 * 1000), // 8 days ago (> 7 day TTL)
  };

  saveDraftToStorage(expiredDraft);
  const loaded = loadDraftFromStorage("ticket:expired");
  assert.strictEqual(loaded, null, "Expired draft is discarded on read");
  console.log("  ok - expired drafts automatically discarded by TTL");
}

console.log("All draft & minimize workflow tests passed!");
