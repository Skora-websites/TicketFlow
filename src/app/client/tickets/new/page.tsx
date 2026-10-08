import { Metadata } from "next";
import { ClientNewTicketContent } from "./ClientNewTicketContent";

export const metadata: Metadata = {
  title: "Create Ticket - Client Portal",
  description: "Submit a new support ticket",
};

// Chrome (sidebar + header) comes from src/app/client/layout.tsx — wrapping in
// ClientLayout here too rendered the topbar twice.
export default function ClientNewTicketPage() {
  return <ClientNewTicketContent />;
}
