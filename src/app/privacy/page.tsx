import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Privacy Policy - TicketFlow",
  description: "Privacy policy for TicketFlow",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to home
        </Link>
        <h1 className="text-3xl font-bold text-foreground mt-6 mb-8">Privacy Policy</h1>
        <div className="prose prose-neutral dark:prose-invert space-y-6 text-muted-foreground">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">1. Information We Collect</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong className="text-foreground">Account data:</strong> your name, email address, role, and department assignment.</li>
              <li><strong className="text-foreground">Authentication data:</strong> password hashes (bcrypt) or OAuth identity identifiers if you sign in with Google or GitHub.</li>
              <li><strong className="text-foreground">Content you submit:</strong> tickets, comments, and file attachments.</li>
              <li><strong className="text-foreground">Usage data:</strong> in-app notification and routing-rule statistics needed to operate the Service.</li>
            </ul>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">2. How We Use Information</h2>
            <p>
              Information is used to operate the ticketing workflow: creating and routing tickets, notifying
              you of assignment and status changes, displaying analytics to administrators, and securing the
              Service (rate limiting, session management, password reset).
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">3. What We Do Not Do</h2>
            <p>
              We do not sell your personal information, and we do not use your ticket content for advertising.
              When the Service is self-hosted, all data stays in the MongoDB instance configured by the operator.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">4. Cookies &amp; Sessions</h2>
            <p>
              The Service uses a session cookie required for authentication, and optionally a short-lived
              &ldquo;remember me&rdquo; cookie if you opt in on the sign-in page. No third-party advertising
              or tracking cookies are used.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">5. Third-Party Services</h2>
            <p>
              If enabled by the operator, sign-in may be delegated to Google or GitHub; those providers handle
              authentication under their own privacy policies. Password-reset emails are delivered through the
              SMTP provider configured by the operator.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">6. Data Retention &amp; Deletion</h2>
            <p>
              Tickets, comments, and attachments are retained until deleted by an authorized administrator.
              Deleting your account removes access to it; content you submitted as part of a shared workflow
              may be retained by the operator where required for record-keeping.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">7. Security</h2>
            <p>
              Passwords are stored as bcrypt hashes, sessions are signed JWTs, attachments are validated by
              size and content type, and access to tickets is restricted by role and department.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">8. Contact</h2>
            <p>
              For privacy questions or data-deletion requests, contact your Service administrator.
            </p>
          </section>
        </div>
        <Button asChild variant="outline" className="mt-10">
          <Link href="/">Back to TicketFlow</Link>
        </Button>
      </div>
    </div>
  );
}
