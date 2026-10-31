"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, FileText, X, Minimize2, RotateCcw, Clock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCategories } from "@/hooks/use-categories";
import { useDraftResume } from "@/lib/drafts/context";
import { Badge } from "@/components/ui/badge";

// Categories are dynamic (validated server-side against the Category
// collection); the client accepts any slug-shaped value.
const ticketSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  category: z.string().min(1, "Category is required").regex(/^[a-z0-9-]+$/, "Invalid category"),
  priority: z.enum(["low", "medium", "high", "urgent"]),
});

type TicketFormData = z.infer<typeof ticketSchema>;

interface TicketFormProps {
  initialData?: Partial<TicketFormData>;
  onSubmit: (data: TicketFormData, attachments?: File[]) => Promise<void>;
  isLoading?: boolean;
  submitLabel?: string;
  className?: string;
}

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_FILES = 5;

export function TicketForm({
  initialData,
  onSubmit,
  isLoading = false,
  submitLabel = "Create Ticket",
  className,
}: TicketFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { categories } = useCategories();
  const { saveDraft, getDraft, discardDraft, minimizeDraft } = useDraftResume();
  const draftId = pathname?.includes("client") ? "ticket:new:client" : "ticket:new:staff";

  const [attachments, setAttachments] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");
  const [fileInputEl, setFileInputEl] = useState<HTMLInputElement | null>(null);
  const [restoredDraft, setRestoredDraft] = useState<boolean>(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);

  const form = useForm<TicketFormData>({
    resolver: zodResolver(ticketSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "other",
      priority: "medium",
      ...initialData,
    },
  });

  // Restore draft if available
  useEffect(() => {
    if (initialData?.title) return;
    const existing = getDraft<TicketFormData>(draftId);
    if (existing?.data && (existing.data.title || existing.data.description)) {
      form.reset({
        title: existing.data.title || "",
        description: existing.data.description || "",
        category: existing.data.category || "other",
        priority: existing.data.priority || "medium",
      });
      setRestoredDraft(true);
      setDraftSavedAt(existing.updatedAt);
    }
  }, [draftId, form, getDraft, initialData]);

  // Debounced auto-save draft on changes
  useEffect(() => {
    const subscription = form.watch((values) => {
      if (!values.title && !values.description) return;
      const timeout = setTimeout(() => {
        saveDraft<TicketFormData>({
          id: draftId,
          type: "ticket",
          title: values.title ? `Draft: ${values.title}` : "Untitled Ticket Draft",
          subtitle: values.description ? values.description.slice(0, 50) + "..." : "New ticket in progress",
          path: pathname || (draftId.includes("client") ? "/client/tickets/new" : "/dashboard/tickets/new"),
          data: {
            title: values.title || "",
            description: values.description || "",
            category: values.category || "other",
            priority: (values.priority as any) || "medium",
          },
          isMinimized: false,
        });
        setDraftSavedAt(Date.now());
      }, 600);
      return () => clearTimeout(timeout);
    });
    return () => subscription.unsubscribe();
  }, [draftId, form, pathname, saveDraft]);

  // Warn on accidental tab close when form has uncommitted content
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const { title, description } = form.getValues();
      if (title || description) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [form]);

  const handleMinimize = () => {
    const values = form.getValues();
    saveDraft<TicketFormData>({
      id: draftId,
      type: "ticket",
      title: values.title ? `Draft: ${values.title}` : "Untitled Ticket Draft",
      subtitle: values.description ? values.description.slice(0, 50) + "..." : "Ticket composition in progress",
      path: pathname || (draftId.includes("client") ? "/client/tickets/new" : "/dashboard/tickets/new"),
      data: values,
      isMinimized: true,
    });
    minimizeDraft(draftId);
    const returnPath = pathname?.includes("client") ? "/client/tickets" : "/dashboard/tickets";
    router.push(returnPath);
  };

  const handleDiscardDraft = () => {
    discardDraft(draftId);
    setRestoredDraft(false);
    setDraftSavedAt(null);
    form.reset({
      title: "",
      description: "",
      category: "other",
      priority: "medium",
    });
  };

  const addFiles = (files: File[]) => {
    setAttachments((prev) => {
      const next = [...prev];
      for (const file of files) {
        if (next.length >= MAX_FILES) {
          setError(`Maximum ${MAX_FILES} attachments`);
          break;
        }
        if (file.size > MAX_FILE_BYTES) {
          setError(`"${file.name}" must be under 4MB`);
          continue;
        }
        next.push(file);
        setError("");
      }
      return next;
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
      e.target.value = ""; // allow re-picking the same file
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
    setError("");
  };

  const onFormSubmit = async (data: TicketFormData) => {
    setError("");
    try {
      await onSubmit(data, attachments.length ? attachments : undefined);
      discardDraft(draftId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit ticket");
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onFormSubmit)} className={cn("space-y-6", className)}>
      {/* Draft restore & auto-save status banner */}
      {(restoredDraft || draftSavedAt) && (
        <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-xs text-foreground">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
            <span>
              {restoredDraft
                ? "Restored unsaved draft"
                : "Draft automatically saved locally"}
            </span>
            {draftSavedAt && (
              <span className="text-muted-foreground hidden sm:inline">
                • last saved {new Date(draftSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDiscardDraft}
            className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive gap-1"
          >
            <RotateCcw className="h-3 w-3" />
            Discard draft
          </Button>
        </div>
      )}

      {error && (
        <Alert variant="destructive" className="border-destructive/20">
          <AlertDescription className="flex items-center gap-2">{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          placeholder="Brief summary of the issue or request"
          {...form.register("title")}
          disabled={isLoading}
        />
        {form.formState.errors.title && (
          <p className="text-sm text-destructive">{form.formState.errors.title.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Provide details, steps to reproduce, expected behavior, etc."
          rows={6}
          {...form.register("description")}
          disabled={isLoading}
        />
        {form.formState.errors.description && (
          <p className="text-sm text-destructive">{form.formState.errors.description.message}</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Select
            value={form.watch("category") || "other"}
            onValueChange={(val) => form.setValue("category", val, { shouldValidate: true })}
            disabled={isLoading}
          >
            <SelectTrigger id="category">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.slug} value={c.slug}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.formState.errors.category && (
            <p className="text-sm text-destructive">{form.formState.errors.category.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="priority">Priority</Label>
          <Select
            value={form.watch("priority") || "medium"}
            onValueChange={(val) => form.setValue("priority", val as "low" | "medium" | "high" | "urgent", { shouldValidate: true })}
            disabled={isLoading}
          >
            <SelectTrigger id="priority">
              <SelectValue placeholder="Select priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
          {form.formState.errors.priority && (
            <p className="text-sm text-destructive">{form.formState.errors.priority.message}</p>
          )}
        </div>
      </div>

      {/* Attachments */}
      <div className="space-y-2">
        <Label>Attachments (optional)</Label>
        <div
          className={cn(
            "border-2 rounded-xl p-4 transition-colors",
            dragActive
              ? "border-primary bg-primary/5"
              : "border-border"
          )}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
            <input
              ref={(el) => { setFileInputEl(el); }}
              type="file"
              multiple
              onChange={handleFileChange}
              className="hidden"
              accept="image/*,application/pdf,.doc,.docx,.txt,.csv,.zip"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputEl?.click()}
              disabled={attachments.length >= MAX_FILES || isLoading}
              className="w-full sm:w-auto"
            >
              <FileText className="w-4 h-4 mr-2" />
              {attachments.length ? "Add more files" : "Attach files"}
            </Button>

            {attachments.length === 0 && (
              <p className="text-xs sm:text-sm text-muted-foreground">
                Drag &amp; drop or tap to attach (up to {MAX_FILES} files, max 4MB each)
              </p>
            )}
          </div>
          {attachments.length > 0 && (
            <ul className="mt-3 space-y-2">
              {attachments.map((file, index) => (
                <li key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded flex items-center justify-center bg-primary/10 text-primary flex-shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeAttachment(index)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3 pt-4 border-t border-border">
        <Button
          type="button"
          variant="ghost"
          onClick={handleMinimize}
          disabled={isLoading}
          className="w-full sm:w-auto h-9.5 sm:h-8.5 gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted"
          title="Minimize form to dock and resume later without losing data"
        >
          <Minimize2 className="w-4 h-4 text-primary" />
          Minimize to dock
        </Button>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2.5 sm:gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isLoading}
            className="w-full sm:w-auto h-9.5 sm:h-8.5"
          >
            Cancel
          </Button>
          <Button type="submit" loading={isLoading} className="w-full sm:w-auto h-9.5 sm:h-8.5 font-bold">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}