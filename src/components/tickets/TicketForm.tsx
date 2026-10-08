"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { Loader2, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCategories } from "@/hooks/use-categories";

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
  const { categories } = useCategories();
  const [attachments, setAttachments] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");
  const [fileInputEl, setFileInputEl] = useState<HTMLInputElement | null>(null);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit ticket");
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onFormSubmit)} className={cn("space-y-6", className)}>
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
            {...form.register("category")}
            disabled={isLoading}
          >
            <SelectTrigger>
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
        </div>

        <div className="space-y-2">
          <Label htmlFor="priority">Priority</Label>
          <Select
            {...form.register("priority")}
            disabled={isLoading}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
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
          <div className="flex items-center gap-3">
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
            >
              <FileText className="w-4 h-4 mr-2" />
              {attachments.length ? "Add more files" : "Attach files"}
            </Button>

            {attachments.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Drag &amp; drop or click to attach (up to {MAX_FILES} files, max 4MB each)
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

      <div className="flex justify-end gap-3 pt-4 border-t border-border">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button type="submit" loading={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : submitLabel}
        </Button>
      </div>
    </form>
  );
}