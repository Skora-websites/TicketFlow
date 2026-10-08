import { Metadata } from "next";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { requireRole } from "@/lib/authz";
import { RoutingAwareTicketForm } from "@/components/tickets/RoutingAwareTicketForm";

export const metadata: Metadata = {
  title: "New Ticket - Dashboard",
  description: "Create a new ticket with automated routing",
};

export default async function NewTicketPage() {
  await requireRole("super_admin", "manager", "team");
  return (
    <DashboardLayout>
      <RoutingAwareTicketForm />
    </DashboardLayout>
  );
}
