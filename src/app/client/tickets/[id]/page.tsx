import { Metadata } from "next";
import { ClientTicketDetailPage } from "./ClientTicketDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Ticket ${id} - Client Portal`,
    description: `View ticket ${id}`,
  };
}

// Chrome (sidebar + header) comes from src/app/client/layout.tsx — wrapping in
// ClientLayout here too rendered the topbar twice.
export default function ClientTicketDetailPageWrapper({ params: _params }: Props) {
  // The client component reads the id itself via useParams().
  return <ClientTicketDetailPage />;
}
