import { Metadata } from "next";
import { ClientTicketsContent } from "./ClientTicketsContent";

export const metadata: Metadata = {
  title: "My Tickets - Client Portal",
  description: "View and manage your tickets",
};

// Chrome (sidebar + header) comes from src/app/client/layout.tsx — wrapping in
// ClientLayout here too rendered the topbar twice.
export default function ClientTicketsPage() {
  return <ClientTicketsContent />;
}
