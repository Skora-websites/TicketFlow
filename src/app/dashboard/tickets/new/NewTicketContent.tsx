"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { TicketForm } from "@/components/tickets";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export function NewTicketContent() {
  const router = useRouter();

  const handleSubmit = async (data: any, attachments?: File[]) => {
    const formData = new FormData();
    formData.append("title", data.title);
    formData.append("description", data.description);
    formData.append("category", data.category);
    formData.append("priority", data.priority);
    for (const file of attachments ?? []) {
      formData.append("attachment", file);
    }

    const res = await fetch("/api/tickets", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to create ticket");
    }

    const result = await res.json();
    router.push(`/dashboard/tickets/${result.ticket._id}`);
    router.refresh();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/tickets">
          <Button variant="ghost" size="icon" className="h-10 w-10">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="page-header-title">New Ticket</h1>
          <p className="page-header-sub">Create a new ticket for your team</p>
        </div>
      </div>

      <TicketForm onSubmit={handleSubmit} submitLabel="Create Ticket" />
    </div>
  );
}