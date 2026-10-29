"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Plus, Building2, Edit, Trash2 } from "lucide-react";
import { IDepartment } from "@/lib/db/models";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

const deptFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format (use #RRGGBB)"),
  description: z.string().max(500).optional(),
});

type DeptFormData = z.infer<typeof deptFormSchema>;

export function DepartmentsContent() {
  const { toast } = useToast();

  const [departments, setDepartments] = useState<IDepartment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingDept, setEditingDept] = useState<IDepartment | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IDepartment | null>(null);

  const form = useForm<DeptFormData>({
    resolver: zodResolver(deptFormSchema),
    defaultValues: {
      name: "",
      color: "#4F46E5",
      description: "",
    },
  });

  useEffect(() => {
    async function fetchDepartments() {
      try {
        const res = await fetch("/api/departments?limit=100");
        if (!res.ok) throw new Error("Failed to fetch departments");
        const data = await res.json();
        setDepartments(data.departments);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load departments");
      } finally {
        setIsLoading(false);
      }
    }
    fetchDepartments();
  }, []);

  const openCreateDialog = () => {
    form.reset({ name: "", color: "#4F46E5", description: "" });
    setEditingDept(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (dept: IDepartment) => {
    form.reset({ name: dept.name, color: dept.color, description: dept.description || "" });
    setEditingDept(dept);
    setIsDialogOpen(true);
  };

  const handleSubmit = async (data: DeptFormData) => {
    setIsSubmitting(true);
    const prevDepartments = departments;
    const isEdit = !!editingDept;
    const editId = editingDept?._id?.toString();

    // Optimistically update if editing
    if (isEdit && editId) {
      setDepartments((prev) =>
        prev.map((d) => (d._id.toString() === editId ? ({ ...d, ...data } as IDepartment) : d))
      );
      setIsDialogOpen(false);
      setEditingDept(null);
    }

    try {
      const url = isEdit ? `/api/departments/${editId}` : "/api/departments";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save department");
      }

      const resData = await res.json().catch(() => ({}));
      toast({ title: isEdit ? "Department updated" : "Department created" });
      if (!isEdit) {
        setIsDialogOpen(false);
        if (resData.department) {
          setDepartments((prev) => [...prev, resData.department]);
        } else {
          const res2 = await fetch("/api/departments?limit=100");
          const data2 = await res2.json();
          setDepartments(data2.departments);
        }
      }
    } catch (err) {
      if (isEdit) {
        setDepartments(prevDepartments);
      }
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to save department", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (dept: IDepartment) => {
    setDeleteTarget(dept);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const prevDepartments = departments;
    // Optimistically remove and close confirmation modal immediately
    setDepartments((prev) => prev.filter((d) => d._id.toString() !== target._id.toString()));
    setDeleteTarget(null);
    toast({ title: "Department deleted" });

    try {
      const res = await fetch(`/api/departments/${target._id}`, { method: "DELETE" });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete department");
      }
    } catch (err) {
      setDepartments(prevDepartments);
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to delete department", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6" aria-label="Loading departments" aria-busy="true">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Skeleton className="h-8 w-44 rounded-md mb-1.5" />
            <Skeleton className="h-4 w-72 rounded-md" />
          </div>
          <Skeleton className="w-full sm:w-36 h-9.5 sm:h-8.5 rounded-lg" />
        </div>

        {/* Departments Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="card-elevated">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-12 h-12 rounded-xl flex-shrink-0" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-5 w-28 rounded" />
                      <Skeleton className="h-3 w-16 rounded font-mono" />
                    </div>
                  </div>
                </div>

                <Skeleton className="h-4 w-4/5 rounded mb-4" />

                <div className="flex items-center gap-2 pt-4 border-t border-border">
                  <Skeleton className="h-8 flex-1 rounded-md" />
                  <Skeleton className="h-8 flex-1 rounded-md" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <Building2 className="w-12 h-12 text-destructive mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Failed to load departments</h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-header-title">Departments</h1>
          <p className="page-header-sub">
            Manage departments and their color themes
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog} className="w-full sm:w-auto h-9.5 sm:h-8.5 font-bold">
              <Plus className="w-4 h-4 mr-2" />
              Add Department
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingDept ? "Edit Department" : "Create Department"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" {...form.register("name")} placeholder="Engineering" disabled={isSubmitting} />
                {form.formState.errors.name && <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="color">Color</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    id="color"
                    {...form.register("color")}
                    className="w-10 h-10 rounded-lg border border-border cursor-pointer"
                    disabled={isSubmitting}
                  />
                  <Input
                    type="text"
                    {...form.register("color")}
                    placeholder="#RRGGBB"
                    className="flex-1 font-mono"
                    disabled={isSubmitting}
                  />
                </div>
                {form.formState.errors.color && <p className="text-sm text-destructive">{form.formState.errors.color.message}</p>}
                <p className="text-xs text-muted-foreground">Used for badges, accents, and charts</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Input id="description" {...form.register("description")} placeholder="Department description" disabled={isSubmitting} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" loading={isSubmitting}>
                  {editingDept ? "Save Changes" : "Create Department"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Departments Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {departments.map((dept) => (
          <Card key={dept._id.toString()} className="card-elevated">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: dept.color }}
                  >
                    <Building2 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{dept.name}</h3>
                    <p className="text-sm text-muted-foreground font-mono">{dept.color}</p>
                  </div>
                </div>
              </div>

              {dept.description && (
                <p className="text-sm text-muted-foreground mb-4">{dept.description}</p>
              )}

              <div className="flex items-center gap-2 pt-4 border-t border-border">
                <Button variant="outline" size="sm" onClick={() => openEditDialog(dept)} className="gap-2 flex-1">
                  <Edit className="w-4 h-4" />
                  Edit
                </Button>
                <Button variant="destructive-outline" size="sm" onClick={() => handleDelete(dept)} className="gap-2 flex-1">
                  <Trash2 className="w-4 h-4" />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Empty state */}
        {departments.length === 0 && (
          <Card className="card-elevated col-span-full">
            <CardContent className="p-12 text-center">
              <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">No departments yet</h3>
              <p className="text-muted-foreground mb-4">Create your first department to organize teams</p>
              <Button onClick={openCreateDialog}>
                <Plus className="w-4 h-4 mr-2" />
                Create Department
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete department</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="destructive" onClick={confirmDelete}>Delete department</Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}