import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Terms of Service - TicketFlow",
  description: "Terms of service for using TicketFlow",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to home
        </Link>
        <h1 className="text-3xl font-bold text-foreground mt-6 mb-8">Terms of Service</h1>
        <div className="prose prose-neutral dark:prose-invert space-y-6 text-muted-foreground">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">1. Acceptance of Terms</h2>
            <p>
              By accessing or using TicketFlow (&ldquo;the Service&rdquo;), you agree to be bound by these
              Terms of Service. If you do not agree with any part of these terms, you may not use the Service.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">2. Accounts &amp; Roles</h2>
            <p>
              You must provide accurate registration information. Accounts are issued with one of four roles
              (Super Admin, Manager, Team, Client), and each role carries different permissions. You are
              responsible for maintaining the confidentiality of your credentials and for all activity that
              occurs under your account.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">3. Acceptable Use</h2>
            <p>
              You agree not to use the Service to submit unlawful, harmful, or infringing content; to attempt
              unauthorized access to other users&rsquo; tickets or data; or to interfere with the operation of
              the Service. Attachments you upload must comply with the documented size and type limits.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">4. Content &amp; Data</h2>
            <p>
              You retain ownership of the tickets, comments, and attachments you submit. You grant the
              Service operator the limited rights needed to store, display, and process that content in
              order to operate the ticketing workflow (for example, routing tickets and notifying assignees).
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">5. Availability</h2>
            <p>
              The Service is provided &ldquo;as is&rdquo; without warranties of any kind. When self-hosted,
              availability, backups, and maintenance are the responsibility of the operator deploying the
              Service.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">6. Termination</h2>
            <p>
              We may suspend or terminate accounts that violate these terms. You may stop using the Service
              at any time; administrators can deactivate or delete accounts from the user management area.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">7. Changes to These Terms</h2>
            <p>
              These terms may be updated from time to time. Continued use of the Service after changes are
              posted constitutes acceptance of the revised terms.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">8. Contact</h2>
            <p>
              Questions about these terms can be directed to your Service administrator.
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
