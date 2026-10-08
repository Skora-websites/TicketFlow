"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { Loader2, Plus, Trash2, Tags, Building2 } from "lucide-react";

interface Category {
  _id: string;
  name: string;
  slug: string;
  color?: string;
  description?: string;
  departmentId?: { _id: string; name: string; color?: string } | null;
}

interface Department {
  _id: string;
  name: string;
}

export function CategoriesContent() {
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6B7280");
  const [newDeptId, setNewDeptId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [savingSlug, setSavingSlug] = useState<string | null>(null);

  const load = async () => {
    try {
      const [catRes, deptRes] = await Promise.all([fetch("/api/categories"), fetch("/api/departments")]);
      if (!catRes.ok) throw new Error();
      const data = await catRes.json();
      setCategories(data.categories ?? []);
      if (deptRes.ok) {
        const dData = await deptRes.json();
        setDepartments(dData.departments ?? []);
      }
    } catch {
      toast({ title: "Error", description: "Failed to load categories", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const deptNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of departments) map.set(d._id, d.name);
    return map;
  }, [departments]);

  const handleCreate = async () => {
    if (name.trim().length < 2) {
      toast({ title: "Name must be at least 2 characters", variant: "destructive" });
      return;
    }
    setIsCreating(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), color, departmentId: newDeptId || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to create category");
      toast({ title: "Category created", description: data.category?.name });
      setName("");
      setNewDeptId("");
      load();
    } catch (err) {
      toast({
        title: "Create failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  // Who receives this category's tickets: the manager of the linked department
  // approves/assigns. Unlinked categories can be sent to any department.
  const handleOwnerChange = async (slug: string, departmentId: string | null) => {
    setSavingSlug(slug);
    try {
      const res = await fetch(`/api/categories?slug=${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update category");
      const label =
        departmentId === null
          ? "Category unlinked — its tickets can be sent to any department"
          : `Category linked to ${deptNameById.get(departmentId) ?? "department"}`;
      toast({ title: "Owning department updated", description: label });
      load();
    } catch (err) {
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSavingSlug(null);
    }
  };

  const handleDelete = async (slug: string) => {
    setDeletingSlug(slug);
    try {
      const res = await fetch(`/api/categories?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      toast({ title: "Category deleted" });
      load();
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDeletingSlug(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="page-header-title">Ticket Categories</h1>
        <p className="page-header-sub">
          Shared by client tickets and agent tickets. Each category's owning department decides who
          receives its tickets for assignment or approval.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate();
            }}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="category-name">New category name</Label>
              <Input
                id="category-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Operations"
                maxLength={40}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category-color" className="block">
                Color
              </Label>
              <input
                id="category-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-16 cursor-pointer rounded-md border border-border bg-background p-1"
                aria-label="Category color"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="category-dept" className="block">
                Owning department
              </Label>
              <Select value={newDeptId || "__none__"} onValueChange={(v) => setNewDeptId(v === "__none__" ? "" : v)}>
                <SelectTrigger id="category-dept">
                  <SelectValue placeholder="Any department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Any department (no owner)</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d._id} value={d._id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" loading={isCreating}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center p-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : categories.length === 0 ? (
            <div className="p-10 text-center">
              <Tags className="mx-auto mb-3 h-10 w-10 text-muted-foreground" aria-hidden />
              <p className="text-muted-foreground">No categories yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {categories.map((c) => (
                <li key={c.slug} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: c.color ?? "#6B7280" }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{c.slug}</p>
                  </div>
                  <div className="w-44 shrink-0">
                    <Select
                      value={c.departmentId?._id ?? "__none__"}
                      onValueChange={(v) => handleOwnerChange(c.slug, v === "__none__" ? null : v)}
                      disabled={savingSlug === c.slug}
                    >
                      <SelectTrigger aria-label={`Owning department for ${c.name}`} className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Any department</SelectItem>
                        {departments.map((d) => (
                          <SelectItem key={d._id} value={d._id}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {savingSlug === c.slug && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
                  <Badge variant="secondary" className="capitalize">
                    {c.slug}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(c.slug)}
                    disabled={deletingSlug === c.slug}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Delete category ${c.name}`}
                  >
                    {deletingSlug === c.slug ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Building2 className="h-3.5 w-3.5" aria-hidden />
        Tickets in a linked category can only be transferred to its owning department — that
        department's manager approves and assigns them. Unlinked categories can be sent anywhere.
        Categories still referenced by tickets cannot be deleted.
      </p>
    </div>
  );
}
