"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Check, Zap } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCategories } from "@/hooks/use-categories";
import { cn } from "@/lib/utils";

interface DepartmentLite { id: string; name: string; color: string }
interface UserLite { userId: string; name: string; email: string; role: string; department: DepartmentLite | null }

interface RuleFormState {
  name: string;
  description: string;
  priority: number;
  matchType: "any" | "all";
  status: "active" | "paused" | "draft";
  conditions: ConditionFormState[];
  actions: ActionFormState[];
  fallbackAssigneeId: string;
  fallbackDepartmentId: string;
}

interface ConditionFormState {
  id: string;
  field: "keyword" | "category" | "priority" | "requester";
  operator: "contains" | "equals" | "in" | "not_in";
  value: string; // comma-separated for multi
  caseSensitive: boolean;
}

interface ActionFormState {
  id: string;
  type: "assign_user" | "assign_department" | "set_priority" | "set_status";
  targetId: string;
  value: string;
}

interface RuleBuilderProps {
  open: boolean;
  onClose: () => void;
  initial?: Partial<RuleFormState>;
  ruleId?: string;
  departments: DepartmentLite[];
  users: UserLite[];
  onSaved: () => void;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const NONE = "none";

const DEFAULT_STATE: RuleFormState = {
  name: "",
  description: "",
  priority: 100,
  matchType: "all",
  status: "draft",
  conditions: [
    { id: uid(), field: "keyword", operator: "contains", value: "", caseSensitive: false },
  ],
  actions: [
    { id: uid(), type: "assign_department", targetId: "", value: "" },
  ],
  fallbackAssigneeId: "",
  fallbackDepartmentId: "",
};

export function RuleBuilder({ open, onClose, initial, ruleId, departments, users, onSaved }: RuleBuilderProps) {
  const { toast } = useToast();
  const { categories } = useCategories();
  const [state, setState] = useState<RuleFormState>({ ...DEFAULT_STATE, ...initial });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setState({ ...DEFAULT_STATE, ...initial });
      setErrors({});
    }
  }, [open, initial]);

  const addCondition = () =>
    setState((s) => ({
      ...s,
      conditions: [...s.conditions, { id: uid(), field: "keyword", operator: "contains", value: "", caseSensitive: false }],
    }));

  const updateCondition = (id: string, patch: Partial<ConditionFormState>) =>
    setState((s) => ({
      ...s,
      conditions: s.conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));

  const removeCondition = (id: string) =>
    setState((s) => ({ ...s, conditions: s.conditions.filter((c) => c.id !== id) }));

  const addAction = () =>
    setState((s) => ({
      ...s,
      actions: [...s.actions, { id: uid(), type: "assign_department", targetId: "", value: "" }],
    }));

  const updateAction = (id: string, patch: Partial<ActionFormState>) =>
    setState((s) => ({
      ...s,
      actions: s.actions.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));

  const removeAction = (id: string) =>
    setState((s) => ({ ...s, actions: s.actions.filter((a) => a.id !== id) }));

  const submit = async () => {
    setErrors({});
    const newErrors: Record<string, string> = {};
    if (state.name.trim().length < 2) newErrors.name = "Name must be at least 2 characters";
    if (state.conditions.length === 0) newErrors.conditions = "At least one condition is required";
    state.conditions.forEach((c, i) => {
      if (!String(c.value).trim()) newErrors[`condition-${c.id}`] = `Condition ${i + 1} value required`;
    });
    if (state.actions.length === 0) newErrors.actions = "At least one action is required";
    state.actions.forEach((a, i) => {
      if (a.type === "assign_user" || a.type === "assign_department") {
        if (!a.targetId) newErrors[`action-${a.id}`] = `Action ${i + 1} target required`;
      } else {
        if (!a.value) newErrors[`action-${a.id}`] = `Action ${i + 1} value required`;
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: state.name,
        description: state.description,
        priority: state.priority,
        matchType: state.matchType,
        status: state.status,
        conditions: state.conditions.map((c) => ({
          field: c.field,
          operator: c.operator,
          value:
            c.field === "keyword" || c.operator === "contains" || c.operator === "equals"
              ? c.value
              : c.value.split(",").map((x) => x.trim()).filter(Boolean),
          caseSensitive: c.caseSensitive,
        })),
        actions: state.actions.map((a) => ({
          type: a.type,
          targetId: a.targetId || undefined,
          value: a.value || undefined,
        })),
        fallbackAssigneeId: state.fallbackAssigneeId || undefined,
        fallbackDepartmentId: state.fallbackDepartmentId || undefined,
      };

      const res = await fetch(ruleId ? `/api/routing/rules/${ruleId}` : "/api/routing/rules", {
        method: ruleId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to save rule");
      }
      toast({ title: ruleId ? "Rule updated" : "Rule created" });
      onSaved();
      onClose();
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" aria-hidden />
            {ruleId ? "Edit Rule" : "New Routing Rule"}
          </DialogTitle>
          <DialogDescription>
            Match incoming tickets on conditions, then route them to the right team or agent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Meta */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="rule-name" className="mb-1.5 block">Rule name</Label>
              <Input
                id="rule-name"
                placeholder="e.g. Route billing bugs to Finance"
                value={state.name}
                onChange={(e) => setState({ ...state, name: e.target.value })}
              />
              {errors.name && <p className="mt-1 text-xs text-destructive" role="alert">{errors.name}</p>}
            </div>
            <div>
              <Label className="mb-1.5 block">Status</Label>
              <div className="flex gap-1.5" role="group" aria-label="Rule status">
                {(["active", "paused", "draft"] as const).map((s) => (
                  <Button
                    key={s}
                    type="button"
                    variant={state.status === s ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setState({ ...state, status: s })}
                    className="flex-1 capitalize"
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_140px]">
            <div>
              <Label htmlFor="rule-description" className="mb-1.5 block">Description</Label>
              <Input
                id="rule-description"
                placeholder="What this rule does"
                value={state.description}
                onChange={(e) => setState({ ...state, description: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="rule-priority" className="mb-1.5 block">Priority</Label>
              <Input
                id="rule-priority"
                type="number"
                value={state.priority}
                min={0}
                max={9999}
                onChange={(e) => setState({ ...state, priority: Number(e.target.value) })}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Lower = evaluated first</p>
            </div>
          </div>

          {/* Conditions */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Conditions</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Match{" "}
                  <Select
                    value={state.matchType}
                    onValueChange={(v) => setState({ ...state, matchType: v as "any" | "all" })}
                  >
                    <SelectTrigger className="mx-1 inline-flex h-7 w-20 px-2 font-mono text-xs" aria-label="Match type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">ALL</SelectItem>
                      <SelectItem value="any">ANY</SelectItem>
                    </SelectContent>
                  </Select>{" "}
                  of the conditions below.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={addCondition}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> Condition
              </Button>
            </div>
            {errors.conditions && <p className="mb-2 text-xs text-destructive" role="alert">{errors.conditions}</p>}
            <div className="space-y-2">
              {state.conditions.map((c, idx) => (
                <div key={c.id} className="rounded-lg border border-border bg-muted/40 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-6 shrink-0 font-mono text-[11px] text-muted-foreground">#{idx + 1}</span>
                    <Select
                      value={c.field}
                      onValueChange={(v) => updateCondition(c.id, { field: v as ConditionFormState["field"] })}
                    >
                      <SelectTrigger className="w-[130px] font-mono text-xs" aria-label="Condition field">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="keyword">keyword</SelectItem>
                        <SelectItem value="category">category</SelectItem>
                        <SelectItem value="priority">priority</SelectItem>
                        <SelectItem value="requester">requester</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={c.operator}
                      onValueChange={(v) => updateCondition(c.id, { operator: v as ConditionFormState["operator"] })}
                    >
                      <SelectTrigger className="w-[120px] font-mono text-xs" aria-label="Condition operator">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {c.field === "keyword" ? (
                          <>
                            <SelectItem value="contains">contains</SelectItem>
                            <SelectItem value="equals">equals</SelectItem>
                          </>
                        ) : (
                          <>
                            <SelectItem value="equals">equals</SelectItem>
                            <SelectItem value="in">in</SelectItem>
                            <SelectItem value="not_in">not_in</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                    {c.field === "requester" ? (
                      <Select
                        value={c.value || NONE}
                        onValueChange={(v) => updateCondition(c.id, { value: v === NONE ? "" : v })}
                      >
                        <SelectTrigger className="min-w-[160px] flex-1" aria-label="Requester">
                          <SelectValue placeholder="Select requester…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Select requester…</SelectItem>
                          {users.map((u) => (
                            <SelectItem key={u.userId} value={u.userId}>
                              {u.name} ({u.role})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        className="min-w-[160px] flex-1 font-mono text-xs"
                        placeholder={
                          c.field === "keyword"
                            ? "billing, refund, charge"
                            : c.field === "category"
                              ? categories.map((cat) => cat.slug).join(", ")
                              : "low, medium, high, urgent"
                        }
                        value={c.value}
                        onChange={(e) => updateCondition(c.id, { value: e.target.value })}
                        aria-label={`Condition ${idx + 1} value`}
                      />
                    )}
                    {c.field === "keyword" && (
                      <Label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                        <Checkbox
                          checked={c.caseSensitive}
                          onCheckedChange={(v) => updateCondition(c.id, { caseSensitive: v === true })}
                          aria-label="Case sensitive"
                        />
                        Aa
                      </Label>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeCondition(c.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Remove condition ${idx + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </div>
                  {errors[`condition-${c.id}`] && (
                    <p className="mt-1.5 w-full pl-8 text-xs text-destructive" role="alert">
                      {errors[`condition-${c.id}`]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Actions</p>
                <p className="mt-0.5 text-xs text-muted-foreground">What happens when this rule matches.</p>
              </div>
              <Button variant="outline" size="sm" onClick={addAction}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> Action
              </Button>
            </div>
            {errors.actions && <p className="mb-2 text-xs text-destructive" role="alert">{errors.actions}</p>}
            <div className="space-y-2">
              {state.actions.map((a, idx) => (
                <div key={a.id} className="rounded-lg border border-border bg-muted/40 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-6 shrink-0 font-mono text-[11px] text-muted-foreground">#{idx + 1}</span>
                    <Select
                      value={a.type}
                      onValueChange={(v) => updateAction(a.id, { type: v as ActionFormState["type"], targetId: "", value: "" })}
                    >
                      <SelectTrigger className="w-[170px] font-mono text-xs" aria-label="Action type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="assign_department">assign_department</SelectItem>
                        <SelectItem value="assign_user">assign_user</SelectItem>
                        <SelectItem value="set_priority">set_priority</SelectItem>
                        <SelectItem value="set_status">set_status</SelectItem>
                      </SelectContent>
                    </Select>
                    {(a.type === "assign_user" || a.type === "assign_department") && (
                      <Select
                        value={a.targetId || NONE}
                        onValueChange={(v) => updateAction(a.id, { targetId: v === NONE ? "" : v })}
                      >
                        <SelectTrigger className="min-w-[180px] flex-1" aria-label="Action target">
                          <SelectValue placeholder={`Select ${a.type === "assign_user" ? "agent" : "department"}…`} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>
                            Select {a.type === "assign_user" ? "agent" : "department"}…
                          </SelectItem>
                          {a.type === "assign_department" &&
                            departments.map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.name}
                              </SelectItem>
                            ))}
                          {a.type === "assign_user" &&
                            users.map((u) => (
                              <SelectItem key={u.userId} value={u.userId}>
                                {u.name} {u.department ? `· ${u.department.name}` : ""}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                    {a.type === "set_priority" && (
                      <Select
                        value={a.value || NONE}
                        onValueChange={(v) => updateAction(a.id, { value: v === NONE ? "" : v })}
                      >
                        <SelectTrigger className="min-w-[160px] flex-1 font-mono text-xs" aria-label="Priority value">
                          <SelectValue placeholder="Priority…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Priority…</SelectItem>
                          <SelectItem value="low">low</SelectItem>
                          <SelectItem value="medium">medium</SelectItem>
                          <SelectItem value="high">high</SelectItem>
                          <SelectItem value="urgent">urgent</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {a.type === "set_status" && (
                      <Select
                        value={a.value || NONE}
                        onValueChange={(v) => updateAction(a.id, { value: v === NONE ? "" : v })}
                      >
                        <SelectTrigger className="min-w-[160px] flex-1 font-mono text-xs" aria-label="Status value">
                          <SelectValue placeholder="Status…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Status…</SelectItem>
                          <SelectItem value="open">open</SelectItem>
                          <SelectItem value="in_progress">in_progress</SelectItem>
                          <SelectItem value="on_hold">on_hold</SelectItem>
                          <SelectItem value="resolved">resolved</SelectItem>
                          <SelectItem value="closed">closed</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeAction(a.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Remove action ${idx + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </div>
                  {errors[`action-${a.id}`] && (
                    <p className="mt-1.5 w-full pl-8 text-xs text-destructive" role="alert">
                      {errors[`action-${a.id}`]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Fallbacks */}
          <div>
            <p className="mb-2 text-sm font-medium">Fallback</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Select
                value={state.fallbackDepartmentId || NONE}
                onValueChange={(v) => setState({ ...state, fallbackDepartmentId: v === NONE ? "" : v })}
              >
                <SelectTrigger aria-label="Fallback department">
                  <SelectValue placeholder="No department fallback" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No department fallback</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={state.fallbackAssigneeId || NONE}
                onValueChange={(v) => setState({ ...state, fallbackAssigneeId: v === NONE ? "" : v })}
              >
                <SelectTrigger aria-label="Fallback agent">
                  <SelectValue placeholder="No agent fallback" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No agent fallback</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.userId} value={u.userId}>
                      {u.name} {u.department ? `· ${u.department.name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className={cn("mt-1.5 text-[11px] text-muted-foreground")}>
              Used if the rule matches but no assignee is determined by actions.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            {!saving && <Check className="h-3.5 w-3.5" aria-hidden />}
            {ruleId ? "Save Changes" : "Create Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
