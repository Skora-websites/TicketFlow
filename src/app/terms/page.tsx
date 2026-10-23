import Link from "next/link";
import {
  Scale,
  ShieldAlert,
  Users,
  FileCheck,
  AlertTriangle,
  Server,
  ArrowLeft,
  ArrowRight,
  Clock,
  Lock,
  Layers,
  HelpCircle,
  FileText,
  BadgeCheck,
  Ban,
} from "lucide-react";

export const metadata = {
  title: "Terms of Service · TicketFlow",
  description: "Terms of service, user roles, acceptable use, and operational agreements for TicketFlow.",
};

const NOISE = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")",
  backgroundSize: "200px 200px",
};

const GLOW_BG = {
  backgroundImage:
    "radial-gradient(ellipse 60% 45% at 50% 10%, rgb(196 167 255 / 0.12), transparent 70%)",
};

const SECTIONS = [
  { id: "acceptance", title: "Acceptance of Terms", icon: FileCheck },
  { id: "roles", title: "Accounts & Role Matrix", icon: Users },
  { id: "acceptable-use", title: "Acceptable Use", icon: Ban },
  { id: "content", title: "Content & Ownership", icon: FileText },
  { id: "availability", title: "System Availability", icon: Server },
  { id: "termination", title: "Suspension & Exit", icon: ShieldAlert },
  { id: "liability", title: "Limitation of Liability", icon: AlertTriangle },
  { id: "changes", title: "Updates & Contact", icon: HelpCircle },
];

export default function TermsPage() {
  return (
    <div
      className="dark min-h-screen bg-[#0E0A14] text-zinc-100 font-sans antialiased selection:bg-[#C4A7FF]/30 selection:text-[#C4A7FF]"
      data-color-theme="purple"
      style={NOISE}
    >
      {/* Ambient background glow */}
      <div className="pointer-events-none fixed inset-0" style={GLOW_BG} aria-hidden />

      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-[#261836] bg-[#0E0A14]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2.5" aria-label="TicketFlow home">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-[#C4A7FF] font-display text-sm font-bold text-[#120A20]">
                T
              </span>
              <span className="font-display text-[1.0625rem] font-bold tracking-tight text-zinc-100">
                TicketFlow
              </span>
            </Link>
            <span className="text-zinc-600 hidden sm:inline">/</span>
            <span className="font-mono text-xs uppercase tracking-wider text-[#C4A7FF] hidden sm:inline">
              Legal Documents
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center rounded-lg border border-[#2A1B3D] bg-[#160E24]/60 p-1 text-xs">
              <Link
                href="/privacy"
                className="rounded-md px-3 py-1 font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                href="/terms"
                className="rounded-md bg-[#C4A7FF] px-3 py-1 font-semibold text-[#120A20] shadow-xs"
              >
                Terms of Service
              </Link>
            </div>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-md border border-[#2A1B3D] bg-[#160E24]/80 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:border-[#C4A7FF]/40 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5 text-[#C4A7FF]" />
              Back to Home
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Banner */}
      <section className="relative border-b border-[#261836] py-16 sm:py-20 px-5 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#C4A7FF]/30 bg-[#C4A7FF]/10 px-3 py-1 text-xs font-mono font-semibold uppercase tracking-wider text-[#C4A7FF] mb-5">
              <Scale className="h-3.5 w-3.5" />
              Rights &amp; Responsibilities
            </div>
            <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-zinc-100 leading-[1.1]">
              Terms of Service
            </h1>
            <p className="mt-4 text-base sm:text-lg text-zinc-400 leading-relaxed max-w-2xl">
              These terms establish the rules governing your use of TicketFlow. We prioritize clear
              language, full data ownership for customers, and transparent self-hosted boundaries.
            </p>

            {/* Quick Metadata Chips */}
            <div className="mt-8 flex flex-wrap items-center gap-4 text-xs font-mono text-zinc-400 border-t border-[#261836] pt-6">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-[#C4A7FF]" />
                <span>Effective: October 2026</span>
              </div>
              <span className="text-zinc-700 hidden sm:inline">•</span>
              <div className="flex items-center gap-1.5">
                <BadgeCheck className="h-3.5 w-3.5 text-[#C4A7FF]" />
                <span>Standard Software License</span>
              </div>
              <span className="text-zinc-700 hidden sm:inline">•</span>
              <div className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-[#C4A7FF]" />
                <span>Four-Seat Role Matrix</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Layout */}
      <main className="mx-auto max-w-6xl px-5 sm:px-6 py-12 sm:py-16">
        <div className="grid gap-12 lg:grid-cols-[240px_1fr]">
          {/* Left Column: Sticky Table of Contents */}
          <aside className="hidden lg:block space-y-6">
            <div className="sticky top-24 space-y-6">
              <div className="rounded-xl border border-[#2A1B3D] bg-[#160E24]/60 p-4 backdrop-blur-sm">
                <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-[#C4A7FF] mb-3">
                  Articles
                </h3>
                <nav className="space-y-1 text-sm">
                  {SECTIONS.map((s, idx) => (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      className="group flex items-center justify-between rounded-md px-2.5 py-1.5 text-zinc-400 hover:bg-[#C4A7FF]/10 hover:text-[#C4A7FF] transition-colors"
                    >
                      <span className="truncate">{s.title}</span>
                      <span className="font-mono text-[10px] text-zinc-600 group-hover:text-[#C4A7FF]">
                        0{idx + 1}
                      </span>
                    </a>
                  ))}
                </nav>
              </div>

              {/* Ownership Card */}
              <div className="rounded-xl border border-[#C4A7FF]/20 bg-[#C4A7FF]/[0.03] p-4 text-xs space-y-2">
                <p className="font-semibold text-zinc-200 flex items-center gap-1.5">
                  <BadgeCheck className="h-4 w-4 text-[#C4A7FF]" />
                  Content Ownership
                </p>
                <p className="text-zinc-400 leading-relaxed">
                  You retain complete intellectual property rights over all tickets, internal remarks, and file attachments submitted through your desk.
                </p>
              </div>

              {/* View Privacy link */}
              <div className="pt-2">
                <Link
                  href="/privacy"
                  className="group flex items-center justify-between text-xs font-medium text-zinc-400 hover:text-[#C4A7FF] transition-colors"
                >
                  <span>Read Privacy Policy</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </div>
          </aside>

          {/* Right Column: Policy Cards */}
          <div className="space-y-8">
            {/* Section 1: Acceptance */}
            <article
              id="acceptance"
              className="scroll-mt-24 rounded-2xl border border-[#2A1B3D] bg-[#160E24]/40 p-6 sm:p-8 backdrop-blur-sm"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="grid h-9 w-9 place-items-center rounded-lg border border-[#C4A7FF]/30 bg-[#C4A7FF]/10 text-[#C4A7FF]">
                  <FileCheck className="h-4.5 w-4.5" />
                </div>
                <div>
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#C4A7FF]">
                    Article 01
                  </span>
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-zinc-100">
                    Acceptance of Terms
                  </h2>
                </div>
              </div>

              <div className="space-y-4 text-sm leading-relaxed text-zinc-300">
                <p>
                  By accessing, creating an account on, or interacting with TicketFlow (&ldquo;the Service&rdquo;),
                  you confirm that you have read, understood, and agreed to be legally bound by these Terms of Service.
                </p>
                <p>
                  If you are using the Service on behalf of a company, organization, or other legal entity, you represent
                  and warrant that you have the legal authority to bind that entity to these Terms. If you do not agree
                  with any part of these Terms, you may not access or use the application.
                </p>
              </div>
            </article>

            {/* Section 2: Accounts & Role Matrix */}
            <article
              id="roles"
              className="scroll-mt-24 rounded-2xl border border-[#2A1B3D] bg-[#160E24]/40 p-6 sm:p-8 backdrop-blur-sm"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="grid h-9 w-9 place-items-center rounded-lg border border-[#C4A7FF]/30 bg-[#C4A7FF]/10 text-[#C4A7FF]">
                  <Users className="h-4.5 w-4.5" />
                </div>
                <div>
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#C4A7FF]">
                    Article 02
                  </span>
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-zinc-100">
                    Accounts &amp; Role Matrix
                  </h2>
                </div>
              </div>

              <div className="space-y-4 text-sm leading-relaxed text-zinc-300">
                <p>
                  TicketFlow enforces access boundaries through four distinct user roles. Each account is granted
                  explicit capabilities and must not attempt unauthorized escalation:
                </p>

                <div className="grid gap-3 sm:grid-cols-2 pt-1 text-xs">
                  <div className="rounded-lg border border-[#2A1B3D] bg-[#110A1A]/60 p-4">
                    <p className="font-semibold text-zinc-100 mb-1 flex items-center justify-between">
                      <span>Super Admin</span>
                      <span className="font-mono text-[10px] text-[#C4A7FF] uppercase">System Scope</span>
                    </p>
                    <p className="text-zinc-400">
                      Full authority across all departments, user provisioning, global analytics, SMTP configurations, and database backfills.
                    </p>
                  </div>

                  <div className="rounded-lg border border-[#2A1B3D] bg-[#110A1A]/60 p-4">
                    <p className="font-semibold text-zinc-100 mb-1 flex items-center justify-between">
                      <span>Manager</span>
                      <span className="font-mono text-[10px] text-[#C4A7FF] uppercase">Department Scope</span>
                    </p>
                    <p className="text-zinc-400">
                      Oversees their assigned department queue, decides inter-department ticket transfers, reviews workload, and configures routing rules.
                    </p>
                  </div>

                  <div className="rounded-lg border border-[#2A1B3D] bg-[#110A1A]/60 p-4">
                    <p className="font-semibold text-zinc-100 mb-1 flex items-center justify-between">
                      <span>Team Member (Agent)</span>
                      <span className="font-mono text-[10px] text-[#C4A7FF] uppercase">Assigned Scope</span>
                    </p>
                    <p className="text-zinc-400">
                      Works on assigned tickets, adds comments, uploads files, transitions statuses, and participates in internal ticket chats.
                    </p>
                  </div>

                  <div className="rounded-lg border border-[#2A1B3D] bg-[#110A1A]/60 p-4">
                    <p className="font-semibold text-zinc-100 mb-1 flex items-center justify-between">
                      <span>Client Portal</span>
                      <span className="font-mono text-[10px] text-[#C4A7FF] uppercase">Self Scope</span>
                    </p>
                    <p className="text-zinc-400">
                      Dedicated portal at <code className="text-[#C4A7FF] font-mono">/client</code> where external requesters file tickets, view status timelines, and receive resolutions.
                    </p>
                  </div>
                </div>

                <p className="text-xs text-zinc-400 pt-1">
                  You are solely responsible for keeping your login credentials confidential. Session tokens are invalidated when passwords change.
                </p>
              </div>
            </article>

            {/* Section 3: Acceptable Use */}
            <article
              id="acceptable-use"
              className="scroll-mt-24 rounded-2xl border border-[#2A1B3D] bg-[#160E24]/40 p-6 sm:p-8 backdrop-blur-sm"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="grid h-9 w-9 place-items-center rounded-lg border border-[#C4A7FF]/30 bg-[#C4A7FF]/10 text-[#C4A7FF]">
                  <Ban className="h-4.5 w-4.5" />
                </div>
                <div>
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#C4A7FF]">
                    Article 03
                  </span>
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-zinc-100">
                    Acceptable Use &amp; File Limits
                  </h2>
                </div>
              </div>

              <div className="space-y-4 text-sm leading-relaxed text-zinc-300">
                <p>
                  To maintain the reliability and security of the desk, you agree that you will not:
                </p>

                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-red-200">
                    <span className="font-semibold text-red-300 shrink-0">Prohibited:</span>
                    <span>Submit malicious scripts, ransomware, defamatory material, or unlawful payloads through ticket descriptions or attachments.</span>
                  </div>
                  <div className="flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-red-200">
                    <span className="font-semibold text-red-300 shrink-0">Prohibited:</span>
                    <span>Attempt to bypass document authorization guards, probe API rate limiters, or inject MongoDB query operators.</span>
                  </div>
                  <div className="flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-red-200">
                    <span className="font-semibold text-red-300 shrink-0">Prohibited:</span>
                    <span>Circumvent file attachment limits: all files must conform to the 4MB limit, up to 5 files per ticket, and pass binary sniffing (PNG, JPEG, GIF, WebP, PDF, TXT, CSV, ZIP).</span>
                  </div>
                </div>
              </div>
            </article>

            {/* Section 4: Content & Ownership */}
            <article
              id="content"
              className="scroll-mt-24 rounded-2xl border border-[#2A1B3D] bg-[#160E24]/40 p-6 sm:p-8 backdrop-blur-sm"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="grid h-9 w-9 place-items-center rounded-lg border border-[#C4A7FF]/30 bg-[#C4A7FF]/10 text-[#C4A7FF]">
                  <FileText className="h-4.5 w-4.5" />
                </div>
                <div>
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#C4A7FF]">
                    Article 04
                  </span>
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-zinc-100">
                    Content &amp; Ownership
                  </h2>
                </div>
              </div>

              <div className="space-y-4 text-sm leading-relaxed text-zinc-300">
                <p>
                  You retain full, exclusive ownership of all tickets, descriptions, comments, and files submitted into TicketFlow.
                </p>
                <div className="rounded-xl border border-[#2A1B3D] bg-[#110A1A]/60 p-4 text-xs leading-relaxed">
                  <p className="text-zinc-300">
                    <strong className="text-zinc-100">Limited License:</strong> By posting ticket data, you grant your deployment operator
                    only the strictly limited license required to process, display, route, and store that content to deliver the ticketing service
                    to assigned team members and requesters.
                  </p>
                </div>
              </div>
            </article>

            {/* Section 5: Availability */}
            <article
              id="availability"
              className="scroll-mt-24 rounded-2xl border border-[#2A1B3D] bg-[#160E24]/40 p-6 sm:p-8 backdrop-blur-sm"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="grid h-9 w-9 place-items-center rounded-lg border border-[#C4A7FF]/30 bg-[#C4A7FF]/10 text-[#C4A7FF]">
                  <Server className="h-4.5 w-4.5" />
                </div>
                <div>
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#C4A7FF]">
                    Article 05
                  </span>
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-zinc-100">
                    System Availability &amp; Self-Hosting
                  </h2>
                </div>
              </div>

              <div className="space-y-4 text-sm leading-relaxed text-zinc-300">
                <p>
                  When TicketFlow is deployed as a self-hosted installation (e.g. running on local Node.js and MongoDB instances),
                  high availability, database replication, backup retention, and disaster recovery remain the sole operational
                  responsibility of the deploying entity.
                </p>
                <p className="text-xs text-zinc-400">
                  The software is provided &ldquo;as is&rdquo;, without express or implied warranty regarding uninterrupted operation or zero-latency throughput under peak concurrency.
                </p>
              </div>
            </article>

            {/* Section 6: Termination */}
            <article
              id="termination"
              className="scroll-mt-24 rounded-2xl border border-[#2A1B3D] bg-[#160E24]/40 p-6 sm:p-8 backdrop-blur-sm"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="grid h-9 w-9 place-items-center rounded-lg border border-[#C4A7FF]/30 bg-[#C4A7FF]/10 text-[#C4A7FF]">
                  <ShieldAlert className="h-4.5 w-4.5" />
                </div>
                <div>
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#C4A7FF]">
                    Article 06
                  </span>
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-zinc-100">
                    Suspension &amp; Account Exit
                  </h2>
                </div>
              </div>

              <div className="space-y-4 text-sm leading-relaxed text-zinc-300">
                <p>
                  Workspace administrators may suspend, deactivate, or delete user accounts at any time through the administrative user panel.
                </p>
                <p className="text-xs text-zinc-400">
                  Upon account deactivation, access to active tickets is immediately blocked. Ticket history filed under that account
                  remains visible in audit trails to maintain continuity for remaining assignees and clients.
                </p>
              </div>
            </article>

            {/* Section 7: Limitation of Liability */}
            <article
              id="liability"
              className="scroll-mt-24 rounded-2xl border border-[#2A1B3D] bg-[#160E24]/40 p-6 sm:p-8 backdrop-blur-sm"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="grid h-9 w-9 place-items-center rounded-lg border border-[#C4A7FF]/30 bg-[#C4A7FF]/10 text-[#C4A7FF]">
                  <AlertTriangle className="h-4.5 w-4.5" />
                </div>
                <div>
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#C4A7FF]">
                    Article 07
                  </span>
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-zinc-100">
                    Limitation of Liability
                  </h2>
                </div>
              </div>

              <div className="space-y-3 text-sm leading-relaxed text-zinc-300">
                <p>
                  To the maximum extent permitted by applicable law, in no event shall TicketFlow, its contributors,
                  or licensors be liable for any indirect, incidental, punitive, or consequential damages arising from
                  unauthorized database access, lost tickets, or delivery delays.
                </p>
              </div>
            </article>

            {/* Section 8: Changes & Contact */}
            <article
              id="changes"
              className="scroll-mt-24 rounded-2xl border border-[#2A1B3D] bg-[#160E24]/40 p-6 sm:p-8 backdrop-blur-sm"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="grid h-9 w-9 place-items-center rounded-lg border border-[#C4A7FF]/30 bg-[#C4A7FF]/10 text-[#C4A7FF]">
                  <HelpCircle className="h-4.5 w-4.5" />
                </div>
                <div>
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#C4A7FF]">
                    Article 08
                  </span>
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-zinc-100">
                    Modifications &amp; Administrator Contact
                  </h2>
                </div>
              </div>

              <div className="space-y-4 text-sm leading-relaxed text-zinc-300">
                <p>
                  These Terms may be updated periodically. Notice of substantive amendments will be reflected in the updated
                  effective date at the top of this page.
                </p>
                <div className="rounded-xl border border-[#2A1B3D] bg-[#110A1A]/80 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-zinc-100">Questions about Terms or Agreements?</p>
                    <p className="text-xs text-zinc-400 mt-0.5">Contact your system administrator or open a request in the desk.</p>
                  </div>
                  <Link
                    href="/"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[#C4A7FF] px-4 py-2 text-xs font-semibold text-[#120A20] hover:bg-[#B593FF] transition-colors"
                  >
                    Return to Home
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </article>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#261836] bg-[#0E0A14] py-8 text-xs text-zinc-400">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="grid h-5 w-5 place-items-center rounded bg-[#C4A7FF] font-display text-[10px] font-bold text-[#120A20]">
              T
            </span>
            <span className="font-semibold text-zinc-200">TicketFlow</span>
            <span className="text-zinc-600">·</span>
            <span>Terms of Service</span>
          </div>
          <nav className="flex gap-4">
            <Link href="/" className="hover:text-zinc-200 transition-colors">Home</Link>
            <Link href="/privacy" className="hover:text-zinc-200 transition-colors">Privacy Policy</Link>
            <Link href="/login" className="hover:text-zinc-200 transition-colors">Sign in</Link>
          </nav>
          <p className="font-mono text-zinc-500">© 2026 TicketFlow System</p>
        </div>
      </footer>
    </div>
  );
}
