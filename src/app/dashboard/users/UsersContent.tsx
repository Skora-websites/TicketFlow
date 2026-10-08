"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserAvatar, DepartmentBadge } from "@/components/tickets";
import {
  Search,
  Users,
  UserPlus,
  Edit,
  Trash2,
  Power,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { IDepartment } from "@/lib/db/models";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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

const userFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  role: z.enum(["super_admin", "manager", "team", "client"]),
  departmentId: z.string().optional(),
  // Team-role ticket scope: all dept tickets vs assigned-only.
  ticketAccess: z.enum(["department", "assigned"]).default("department"),
  // Superadmin-only: the new user's reporting manager.
  reportingManagerId: z.string().optional(),
  // Optional: blank = the system generates a strong password; either way
  // username + password are emailed to the new user.
  password: z.string().min(8, "Password must be at least 8 characters").optional().or(z.literal("")),
});

// Form values = the schema's INPUT type (before .default() fills ticketAccess).
type UserFormData = z.input<typeof userFormSchema>;

interface UserWithDept {
  _id: string;
  name: string;
  email: string;
  role: string;
  departmentId?: IDepartment;
  ticketAccess?: "department" | "assigned";
  reportingManagerId?: string;
  active: boolean;
  createdAt: Date;
}

export function UsersContent() {
  const { toast } = useToast();

  const [users, setUsers] = useState<UserWithDept[]>([]);
  const [departments, setDepartments] = useState<IDepartment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [filters, setFilters] = useState({
    role: "all",
    departmentId: "all",
    search: "",
  });
  const [searchInput, setSearchInput] = useState("");
  const [editingUser, setEditingUser] = useState<UserWithDept | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserWithDept | null>(null);
  // Reporting-manager options (superadmin only).
  const [managers, setManagers] = useState<UserWithDept[]>([]);

  const form = useForm<UserFormData>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      name: "",
      email: "",
      role: "team",
      departmentId: "",
      ticketAccess: "department" as const,
      reportingManagerId: "none",
      password: "",
    },
  });

  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.role === "super_admin";
  const watchRole = form.watch("role");

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(pagination.page),
          limit: String(pagination.limit),
        });
        if (filters.role !== "all") params.set("role", filters.role);
        if (filters.departmentId !== "all") params.set("departmentId", filters.departmentId);
        if (filters.search) params.set("search", filters.search);
        const [usersRes, deptsRes] = await Promise.all([
          fetch(`/api/users?${params.toString()}`),
          fetch("/api/departments?limit=100"),
        ]);

        if (!usersRes.ok) throw new Error("Failed to fetch users");
        if (!deptsRes.ok) throw new Error("Failed to fetch departments");

        const usersData = await usersRes.json();
        const deptsData = await deptsRes.json();

        setUsers(usersData.users);
        setPagination(usersData.pagination);
        setDepartments(deptsData.departments);
        // Reporting-manager dropdown options (superadmin only).
        if (isSuperAdmin) {
          const mgrRes = await fetch("/api/users?role=manager&limit=100");
          if (mgrRes.ok) setManagers((await mgrRes.json()).users ?? []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load users");
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [pagination.page, filters]);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: searchInput }));
      setPagination((prev) => ({ ...prev, page: 1 }));
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
  };

  const openCreateDialog = () => {
    form.reset({ name: "", email: "", role: "team", departmentId: "none", ticketAccess: "department", reportingManagerId: "none", password: "" });
    setEditingUser(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (user: UserWithDept) => {
    form.reset({
      name: user.name,
      email: user.email,
      role: user.role as "super_admin" | "manager" | "team" | "client",
      departmentId: user.departmentId?._id?.toString() || "none",
      ticketAccess: (user as { ticketAccess?: "department" | "assigned" }).ticketAccess ?? "department",
      reportingManagerId: user.reportingManagerId?.toString() || "none",
      password: "",
    });
    setEditingUser(user);
    setIsDialogOpen(true);
  };

  const handleSubmit = async (data: UserFormData) => {
    setIsSubmitting(true);
    try {
      const url = editingUser ? `/api/users/${editingUser._id}` : "/api/users";
      const method = editingUser ? "PATCH" : "POST";

      const payload = {
        ...data,
        departmentId: data.departmentId === "none" ? undefined : data.departmentId,
        // "none" → undefined on create (no field), null on edit (clears it).
        reportingManagerId:
          data.reportingManagerId && data.reportingManagerId !== "none"
            ? data.reportingManagerId
            : editingUser
              ? null
              : undefined,
        // Ticket access is an agent-only setting; never send it for other roles.
        ticketAccess: data.role === "team" ? data.ticketAccess : undefined,
        // Blank password = server generates one; credentials are emailed either way.
        password: data.password ? data.password : undefined,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save user");
      }

      const result = await res.json();
      toast({
        title: editingUser ? "User updated" : "User created",
        description: editingUser
          ? "Changes have been saved"
          : result.devCredentials
            ? "SMTP not configured — credentials shown once below (dev mode)"
            : "Username and password were emailed to the new user",
      });
      if (result.devCredentials) {
        toast({
          title: "Dev credentials",
          description: `${result.devCredentials.email} / ${result.devCredentials.password}`,
        });
      }
      setIsDialogOpen(false);
      setEditingUser(null);

      // Refresh
      const res2 = await fetch(`/api/users?page=${pagination.page}&limit=${pagination.limit}`);
      const data2 = await res2.json();
      setUsers(data2.users);
      setPagination(data2.pagination);
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to save user", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (userId: string) => {
    setDeleteTarget(users.find(u => u._id === userId) ?? null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/users/${deleteTarget._id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete user");
      toast({ title: "User deleted" });
      setUsers((prev) => prev.filter((u) => u._id !== deleteTarget._id));
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to delete user", variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleToggleActive = async (user: UserWithDept) => {
    try {
      const res = await fetch(`/api/users/${user._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !user.active }),
      });
      if (!res.ok) throw new Error("Failed to update user");
      setUsers((prev) => prev.map((u) => (u._id === user._id ? { ...u, active: !user.active } : u)));
      toast({ title: "User updated" });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to update user", variant: "destructive" });
    }
  };

  const roleLabels: Record<string, string> = {
    super_admin: "Super Admin",
    manager: "Manager",
    team: "Team Member",
    client: "Client",
  };

  const roleColors: Record<string, string> = {
    super_admin: "bg-accent-muted text-accent border-accent/20",
    manager: "bg-info-muted text-info border-info/20",
    team: "bg-success-muted text-success border-success/20",
    client: "bg-warning-muted text-warning border-warning/20",
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse" aria-label="Loading users" aria-busy="true">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 bg-muted rounded w-1/4 mb-2" />
            <div className="h-4 bg-muted rounded w-1/3" />
          </div>
        </div>
        <Card className="card-elevated">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-wrap gap-4">
              <div className="relative flex-1 min-w-[200px]">
                <div className="h-10 w-full bg-muted rounded-lg" />
              </div>
              <div className="w-48">
                <div className="h-10 w-full bg-muted rounded-lg" />
              </div>
              <div className="w-48">
                <div className="h-10 w-full bg-muted rounded-lg" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardContent className="p-0">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 p-4 border-b border-border">
                  <div className="w-10 h-10 rounded-full bg-muted flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-1/4" />
                    <div className="h-3 bg-muted rounded w-1/3" />
                  </div>
                  <div className="w-24 h-6 bg-muted rounded" />
                  <div className="w-24 h-6 bg-muted rounded" />
                  <div className="w-24 h-6 bg-muted rounded" />
                  <div className="w-24 h-8 bg-muted rounded" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <Users className="w-12 h-12 text-destructive mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Failed to load users</h2>
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
          <h1 className="page-header-title">Users</h1>
          <p className="page-header-sub">
            Manage team members and their roles
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}>
              <UserPlus className="w-4 h-4 mr-2" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingUser ? "Edit User" : "Create New User"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" {...form.register("name")} placeholder="John Doe" disabled={isSubmitting} />
                {form.formState.errors.name && <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...form.register("email")} placeholder="user@company.com" disabled={isSubmitting} />
                {form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select {...form.register("role")} disabled={isSubmitting || watchRole === "manager"}>
                  <SelectTrigger id="role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Managers add agents only; superadmin adds managers + agents. */}
                    {(watchRole === "manager" ? [
                      <SelectItem key="team" value="team">Team Member (Agent)</SelectItem>,
                    ] : [
                      <SelectItem key="manager" value="manager">Manager</SelectItem>,
                      <SelectItem key="team" value="team">Team Member (Agent)</SelectItem>,
                      <SelectItem key="client" value="client">Client</SelectItem>,
                    ])}
                  </SelectContent>
                </Select>
                {watchRole === "manager" && (
                  <p className="text-xs text-muted-foreground">Managers add agents to their own department.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="departmentId">Department</Label>
                <Select {...form.register("departmentId")} disabled={isSubmitting || watchRole === "manager"}>
                  <SelectTrigger id="departmentId">
                    <SelectValue placeholder="Select department (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No Department</SelectItem>
                    {departments.map((dept) => (
<SelectItem key={dept._id.toString()} value={dept._id.toString()}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {watchRole === "manager" && (
                  <p className="text-xs text-muted-foreground">Agents are added to your own department.</p>
                )}
              </div>
              {watchRole === "team" && (
                <div className="space-y-2">
                  <Label htmlFor="ticketAccess">Ticket access</Label>
                  <Select {...form.register("ticketAccess")} disabled={isSubmitting}>
                    <SelectTrigger id="ticketAccess">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="department">All tickets in the department</SelectItem>
                      <SelectItem value="assigned">Only tickets assigned to them</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Controls whether the agent sees just their work or the whole department queue.
                  </p>
                </div>
              )}
              {isSuperAdmin && (
                <div className="space-y-2">
                  <Label htmlFor="reportingManagerId">Reporting manager (optional)</Label>
                  <Select {...form.register("reportingManagerId")} disabled={isSubmitting}>
                    <SelectTrigger id="reportingManagerId">
                      <SelectValue placeholder="Select reporting manager (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {managers.map((m) => (
                        <SelectItem key={m._id.toString()} value={m._id.toString()}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="password">Password {editingUser ? "(leave blank to keep current)" : "(optional)"}</Label>
                <Input id="password" type="password" {...form.register("password")} placeholder="••••••••" disabled={isSubmitting} minLength={8} />
                {form.formState.errors.password && <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>}
                {editingUser ? (
                  <p className="text-xs text-muted-foreground">Leave blank to keep the current password</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Leave blank and a strong password is generated. Username + password are emailed to the user either way.
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" loading={isSubmitting}>
                  {editingUser ? "Save Changes" : "Create User"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card className="card-elevated">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="w-48">
              <Select value={filters.role} onValueChange={(v) => handleFilterChange("role", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="team">Team Member</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-48">
              <Select value={filters.departmentId} onValueChange={(v) => handleFilterChange("departmentId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept._id.toString()} value={dept._id.toString()}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className="card-elevated">
        <CardContent className="p-0">
          {users.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">No users found</h3>
              <p className="text-muted-foreground">Get started by adding a new user</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {users.map((user) => (
                <div key={user._id} className="p-4 flex items-center gap-4 hover:bg-muted/50 transition-colors">
                  <UserAvatar name={user.name} email={user.email} role={user.role as any} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{user.name}</p>
                    <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                  </div>
                  <Badge variant="outline" className={cn(roleColors[user.role])}>
                    {roleLabels[user.role] || user.role}
                  </Badge>
                  {user.departmentId && (
                    <DepartmentBadge name={user.departmentId.name} color={user.departmentId.color} />
                  )}
                  <Badge variant={user.active ? "success" : "secondary"} className="gap-1">
                    {user.active ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-success" />
                        Active
                      </>
                    ) : (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                        Inactive
                      </>
                    )}
                  </Badge>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(user)}
                      className="h-8 w-8"
                      aria-label={`Edit ${user.name}`}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleToggleActive(user)}
                      className="h-8 w-8"
                      aria-label={user.active ? `Deactivate ${user.name}` : `Activate ${user.name}`}
                    >
                      {user.active ? <Power className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(user._id)}
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      aria-label={`Delete ${user.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="p-4 border-t border-border flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                    {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
                    {pagination.total} users
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))} disabled={pagination.page === 1}>
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))} disabled={pagination.page === pagination.totalPages}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}