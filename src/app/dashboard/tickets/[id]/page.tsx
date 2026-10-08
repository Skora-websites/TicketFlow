import { Metadata } from "next";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { requireRole } from "@/lib/authz";
import { TicketDetailPage } from "./TicketDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Ticket ${id} - Dashboard`,
    description: `View ticket ${id}`,
  };
}

export default async function TicketDetailPageWrapper({ params: _params }: Props) {
  await requireRole("super_admin", "manager", "team");
  return (
    <DashboardLayout>
      {/* The client component reads the id itself via useParams(). */}
      <TicketDetailPage />
    </DashboardLayout>
  );
}