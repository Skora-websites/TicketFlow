import Link from "next/link";
import {
  ShieldCheck,
  Lock,
  Database,
  Cookie,
  Users,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Clock,
  Server,
  FileText,
  EyeOff,
  HardDrive,
  KeyRound,
  Mail,
} from "lucide-react";

export const metadata = {
  title: "Privacy Policy · TicketFlow",
  description: "Privacy policy, data practices, and security safeguards for TicketFlow.",
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
  { id: "collection", title: "Information We Collect", icon: Database },
  { id: "usage", title: "How We Use Data", icon: CheckCircle2 },
  { id: "guarantees", title: "What We Never Do", icon: EyeOff },
  { id: "cookies", title: "Cookies & Sessions", icon: Cookie },
  { id: "third-parties", title: "Third-Party Services", icon: Server },
  { id: "retention", title: "Retention & Deletion", icon: HardDrive },
  { id: "security", title: "Security Architecture", icon: KeyRound },
  { id: "contact", title: "Contact & Requests", icon: Mail },
];

export default function PrivacyPage() {
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
                className="rounded-md bg-[#C4A7FF] px-3 py-1 font-semibold text-[#120A20] shadow-xs"
              >
                Privacy Policy
              </Link>
              <Link
                href="/terms"
                className="rounded-md px-3 py-1 font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
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
              <ShieldCheck className="h-3.5 w-3.5" />
              Privacy &amp; Data Safeguards
            </div>
            <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-zinc-100 leading-[1.1]">
              Privacy Policy
            </h1>
            <p className="mt-4 text-base sm:text-lg text-zinc-400 leading-relaxed max-w-2xl">
              Support requests carry sensitive business context. We build TicketFlow so your data stays
              isolated, encrypted, and governed by role-level permissions — never mined or shared.
            </p>

            {/* Quick Metadata Chips */}
            <div className="mt-8 flex flex-wrap items-center gap-4 text-xs font-mono text-zinc-400 border-t border-[#261836] pt-6">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-[#C4A7FF]" />
                <span>Last updated: October 2026</span>
              </div>
              <span className="text-zinc-700 hidden sm:inline">•</span>
              <div className="flex items-center gap-1.5">
                <Server className="h-3.5 w-3.5 text-[#C4A7FF]" />
                <span>Self-hosted &amp; Cloud Ready</span>
              </div>
              <span className="text-zinc-700 hidden sm:inline">•</span>
              <div className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-[#C4A7FF]" />
                <span>Role-based isolation</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Layout */}
      <main className="mx-auto max-w-6xl px-5 sm:px-6 py-12 sm:py-16">
        <div className="grid gap-12 lg:grid-cols-[240px_1fr]">
          {/* Left Column: Sticky Table of Contents & Guarantees */}
          <aside className="hidden lg:block space-y-6">
            <div className="sticky top-24 space-y-6">
              <div className="rounded-xl border border-[#2A1B3D] bg-[#160E24]/60 p-4 backdrop-blur-sm">
                <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-[#C4A7FF] mb-3">
                  Contents
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

              {/* Trust Badge Card */}
              <div className="rounded-xl border border-[#C4A7FF]/20 bg-[#C4A7FF]/[0.03] p-4 text-xs space-y-2">
                <p className="font-semibold text-zinc-200 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-[#C4A7FF]" />
                  Self-Hosted Guarantee
                </p>
                <p className="text-zinc-400 leading-relaxed">
                  When deployed on your own infrastructure, all tickets, credentials, and attachments remain strictly in your MongoDB database.
                </p>
              </div>

              {/* View Terms link */}
              <div className="pt-2">
                <Link
                  href="/terms"
                  className="group flex items-center justify-between text-xs font-medium text-zinc-400 hover:text-[#C4A7FF] transition-colors"
                >
                  <span>Read Terms of Service</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </div>
          </aside>

          {/* Right Column: Policy Cards */}
          <div className="space-y-8">
            {/* Section 1: Information We Collect */}
            <article
              id="collection"
              className="scroll-mt-24 rounded-2xl border border-[#2A1B3D] bg-[#160E24]/40 p-6 sm:p-8 backdrop-blur-sm"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="grid h-9 w-9 place-items-center rounded-lg border border-[#C4A7FF]/30 bg-[#C4A7FF]/10 text-[#C4A7FF]">
                  <Database className="h-4.5 w-4.5" />
                </div>
                <div>
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#C4A7FF]">
                    Section 01
                  </span>
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-zinc-100">
                    Information We Collect
                  </h2>
                </div>
              </div>

              <div className="space-y-4 text-sm leading-relaxed text-zinc-300">
                <p>
                  To route tickets and manage team communication, TicketFlow records minimal operational data:
                </p>

                <div className="grid gap-3 sm:grid-cols-2 pt-2">
                  <div className="rounded-lg border border-[#2A1B3D] bg-[#110A1A]/60 p-4">
                    <h4 className="font-semibold text-zinc-100 flex items-center gap-2 mb-1.5">
                      <Users className="h-4 w-4 text-[#C4A7FF]" /> Account Profile
                    </h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Your full name, corporate email address, assigned department (e.g. Development, Marketing, Sales), and role credentials.
                    </p>
                  </div>

                  <div className="rounded-lg border border-[#2A1B3D] bg-[#110A1A]/60 p-4">
                    <h4 className="font-semibold text-zinc-100 flex items-center gap-2 mb-1.5">
                      <Lock className="h-4 w-4 text-[#C4A7FF]" /> Authentication Data
                    </h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      One-way bcrypt hashes for internal passwords. If OAuth is used (Google or GitHub), we store only provider IDs and verified emails.
                    </p>
                  </div>

                  <div className="rounded-lg border border-[#2A1B3D] bg-[#110A1A]/60 p-4">
                    <h4 className="font-semibold text-zinc-100 flex items-center gap-2 mb-1.5">
                      <FileText className="h-4 w-4 text-[#C4A7FF]" /> Ticket Content
                    </h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Subject lines, descriptions, priorities, internal notes, and file attachments up to 4MB (validated via binary magic bytes).
                    </p>
                  </div>

                  <div className="rounded-lg border border-[#2A1B3D] bg-[#110A1A]/60 p-4">
                    <h4 className="font-semibold text-zinc-100 flex items-center gap-2 mb-1.5">
                      <CheckCircle2 className="h-4 w-4 text-[#C4A7FF]" /> Routing Statistics
                    </h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Rule match counts, assignee round-robin indexes, and timeline audit timestamps needed for ticket history verification.
                    </p>
                  </div>
                </div>
              </div>
            </article>

            {/* Section 2: How We Use Information */}
            <article
              id="usage"
              className="scroll-mt-24 rounded-2xl border border-[#2A1B3D] bg-[#160E24]/40 p-6 sm:p-8 backdrop-blur-sm"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="grid h-9 w-9 place-items-center rounded-lg border border-[#C4A7FF]/30 bg-[#C4A7FF]/10 text-[#C4A7FF]">
                  <CheckCircle2 className="h-4.5 w-4.5" />
                </div>
                <div>
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#C4A7FF]">
                    Section 02
                  </span>
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-zinc-100">
                    How We Use Information
                  </h2>
                </div>
              </div>

              <div className="space-y-4 text-sm leading-relaxed text-zinc-300">
                <p>
                  Information entered into TicketFlow serves strictly operational desk purposes:
                </p>
                <ul className="space-y-2.5 pt-1">
                  <li className="flex items-start gap-2.5 text-zinc-300">
                    <span className="mt-1 flex h-2 w-2 rounded-full bg-[#C4A7FF]" />
                    <span>
                      <strong className="text-zinc-100">Intelligent Routing:</strong> Evaluating incoming tickets against configured rules to assign them to the optimal on-call agent based on department, skills, and live workload.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5 text-zinc-300">
                    <span className="mt-1 flex h-2 w-2 rounded-full bg-[#C4A7FF]" />
                    <span>
                      <strong className="text-zinc-100">Notifications &amp; Alerts:</strong> Dispatching real-time updates and transactional emails when tickets are assigned, transferred, or resolved.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5 text-zinc-300">
                    <span className="mt-1 flex h-2 w-2 rounded-full bg-[#C4A7FF]" />
                    <span>
                      <strong className="text-zinc-100">Access Control &amp; Authorization:</strong> Restricting tickets so clients only see their own tickets, team members view their department queue, and managers oversee assigned groups.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5 text-zinc-300">
                    <span className="mt-1 flex h-2 w-2 rounded-full bg-[#C4A7FF]" />
                    <span>
                      <strong className="text-zinc-100">Security &amp; Rate Limiting:</strong> Enforcing API thresholds (15 requests/min on auth endpoints) to prevent credential brute-forcing and denial-of-service attempts.
                    </span>
                  </li>
                </ul>
              </div>
            </article>

            {/* Section 3: What We Never Do */}
            <article
              id="guarantees"
              className="scroll-mt-24 rounded-2xl border border-[#2A1B3D] bg-[#160E24]/40 p-6 sm:p-8 backdrop-blur-sm"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="grid h-9 w-9 place-items-center rounded-lg border border-[#C4A7FF]/30 bg-[#C4A7FF]/10 text-[#C4A7FF]">
                  <EyeOff className="h-4.5 w-4.5" />
                </div>
                <div>
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#C4A7FF]">
                    Section 03
                  </span>
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-zinc-100">
                    What We Never Do
                  </h2>
                </div>
              </div>

              <div className="space-y-4 text-sm leading-relaxed text-zinc-300">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-emerald-200">
                  <p className="font-semibold text-sm">Our Data Isolation Pledge</p>
                  <p className="text-xs text-emerald-300/80 mt-1">
                    We treat ticket data as privileged internal correspondence. We have no advertising model and sell zero telemetry.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 pt-2 text-xs">
                  <div className="rounded-lg border border-[#2A1B3D] bg-[#110A1A]/60 p-3.5">
                    <p className="font-semibold text-zinc-100 mb-1">No Data Brokers</p>
                    <p className="text-zinc-400">We do not sell, rent, monetize, or license your team or client lists to third parties.</p>
                  </div>
                  <div className="rounded-lg border border-[#2A1B3D] bg-[#110A1A]/60 p-3.5">
                    <p className="font-semibold text-zinc-100 mb-1">No AI Model Training</p>
                    <p className="text-zinc-400">Customer ticket contents are never harvested to train public foundation models.</p>
                  </div>
                  <div className="rounded-lg border border-[#2A1B3D] bg-[#110A1A]/60 p-3.5">
                    <p className="font-semibold text-zinc-100 mb-1">No Cross-Tenant Leaks</p>
                    <p className="text-zinc-400">Data boundaries are enforced at the database query level with strict owner checks.</p>
                  </div>
                </div>
              </div>
            </article>

            {/* Section 4: Cookies & Sessions */}
            <article
              id="cookies"
              className="scroll-mt-24 rounded-2xl border border-[#2A1B3D] bg-[#160E24]/40 p-6 sm:p-8 backdrop-blur-sm"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="grid h-9 w-9 place-items-center rounded-lg border border-[#C4A7FF]/30 bg-[#C4A7FF]/10 text-[#C4A7FF]">
                  <Cookie className="h-4.5 w-4.5" />
                </div>
                <div>
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#C4A7FF]">
                    Section 04
                  </span>
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-zinc-100">
                    Cookies &amp; Sessions
                  </h2>
                </div>
              </div>

              <div className="space-y-4 text-sm leading-relaxed text-zinc-300">
                <p>
                  TicketFlow uses only essential cookies required for session authentication:
                </p>
                <div className="overflow-hidden rounded-xl border border-[#2A1B3D] bg-[#110A1A]/80">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#2A1B3D] bg-[#1A1028] text-zinc-400 font-mono">
                        <th className="p-3">Cookie Name</th>
                        <th className="p-3">Purpose</th>
                        <th className="p-3">Lifespan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2A1B3D] text-zinc-300">
                      <tr>
                        <td className="p-3 font-mono text-[#C4A7FF]">authjs.session-token</td>
                        <td className="p-3">Encrypted JWT verifying authenticated account session</td>
                        <td className="p-3">Session / 30 Days</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-mono text-[#C4A7FF]">rm</td>
                        <td className="p-3">Optional &ldquo;Remember me&rdquo; flag chosen on the login screen</td>
                        <td className="p-3">24 Hours</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-mono text-[#C4A7FF]">ticketflow-color-theme</td>
                        <td className="p-3">Local browser preference for workspace theme accent</td>
                        <td className="p-3">Persistent (localStorage)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-zinc-400">
                  No advertising, tracking, or fingerprinting scripts are injected into any page.
                </p>
              </div>
            </article>

            {/* Section 5: Third-Party Services */}
            <article
              id="third-parties"
              className="scroll-mt-24 rounded-2xl border border-[#2A1B3D] bg-[#160E24]/40 p-6 sm:p-8 backdrop-blur-sm"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="grid h-9 w-9 place-items-center rounded-lg border border-[#C4A7FF]/30 bg-[#C4A7FF]/10 text-[#C4A7FF]">
                  <Server className="h-4.5 w-4.5" />
                </div>
                <div>
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#C4A7FF]">
                    Section 05
                  </span>
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-zinc-100">
                    Third-Party Services
                  </h2>
                </div>
              </div>

              <div className="space-y-4 text-sm leading-relaxed text-zinc-300">
                <p>
                  Depending on how your organization configures TicketFlow, the following external processors may be engaged:
                </p>
                <div className="grid gap-3 sm:grid-cols-2 pt-1 text-xs">
                  <div className="rounded-lg border border-[#2A1B3D] bg-[#110A1A]/60 p-4">
                    <p className="font-semibold text-zinc-100 mb-1">OAuth Identity Providers</p>
                    <p className="text-zinc-400">
                      When logging in via Google or GitHub, identity verification is handled under their respective privacy policies without sharing TicketFlow passwords.
                    </p>
                  </div>
                  <div className="rounded-lg border border-[#2A1B3D] bg-[#110A1A]/60 p-4">
                    <p className="font-semibold text-zinc-100 mb-1">SMTP Email Transports</p>
                    <p className="text-zinc-400">
                      Password reset and invite notifications are transmitted through your operator-configured SMTP gateway (e.g. Amazon SES, Postmark, SendGrid).
                    </p>
                  </div>
                </div>
              </div>
            </article>

            {/* Section 6: Retention & Deletion */}
            <article
              id="retention"
              className="scroll-mt-24 rounded-2xl border border-[#2A1B3D] bg-[#160E24]/40 p-6 sm:p-8 backdrop-blur-sm"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="grid h-9 w-9 place-items-center rounded-lg border border-[#C4A7FF]/30 bg-[#C4A7FF]/10 text-[#C4A7FF]">
                  <HardDrive className="h-4.5 w-4.5" />
                </div>
                <div>
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#C4A7FF]">
                    Section 06
                  </span>
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-zinc-100">
                    Data Retention &amp; Deletion
                  </h2>
                </div>
              </div>

              <div className="space-y-4 text-sm leading-relaxed text-zinc-300">
                <p>
                  Ticket history and associated media are maintained according to your administrator&apos;s data retention schedule:
                </p>
                <ul className="space-y-2 text-xs">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#C4A7FF] shrink-0 mt-0.5" />
                    <span><strong className="text-zinc-100">User Account Deletion:</strong> Removing a user deactivates their credentials and invalidates active session tokens instantly.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#C4A7FF] shrink-0 mt-0.5" />
                    <span><strong className="text-zinc-100">Ticket Lifecycle:</strong> Closed tickets remain indexed for audit compliance until explicitly purged by a super administrator.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#C4A7FF] shrink-0 mt-0.5" />
                    <span><strong className="text-zinc-100">Attachment Purging:</strong> Administrators can backfill or purge binary attachment payloads from database storage.</span>
                  </li>
                </ul>
              </div>
            </article>

            {/* Section 7: Security Architecture */}
            <article
              id="security"
              className="scroll-mt-24 rounded-2xl border border-[#2A1B3D] bg-[#160E24]/40 p-6 sm:p-8 backdrop-blur-sm"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="grid h-9 w-9 place-items-center rounded-lg border border-[#C4A7FF]/30 bg-[#C4A7FF]/10 text-[#C4A7FF]">
                  <KeyRound className="h-4.5 w-4.5" />
                </div>
                <div>
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#C4A7FF]">
                    Section 07
                  </span>
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-zinc-100">
                    Security Architecture
                  </h2>
                </div>
              </div>

              <div className="space-y-3 text-sm leading-relaxed text-zinc-300">
                <p>
                  Security is engineered into the system through defense-in-depth principles:
                </p>
                <div className="grid gap-2.5 sm:grid-cols-2 pt-1 text-xs">
                  <div className="rounded-lg border border-[#2A1B3D] bg-[#110A1A]/60 p-3.5">
                    <p className="font-semibold text-zinc-100 mb-1">Magic-Byte Upload Validation</p>
                    <p className="text-zinc-400">File headers are inspected byte-by-byte to prevent malicious script uploads masked as images.</p>
                  </div>
                  <div className="rounded-lg border border-[#2A1B3D] bg-[#110A1A]/60 p-3.5">
                    <p className="font-semibold text-zinc-100 mb-1">Instant Session Invalidation</p>
                    <p className="text-zinc-400">Password changes bump the database session version, killing active sessions within 60 seconds.</p>
                  </div>
                  <div className="rounded-lg border border-[#2A1B3D] bg-[#110A1A]/60 p-3.5">
                    <p className="font-semibold text-zinc-100 mb-1">Regex Injection Protection</p>
                    <p className="text-zinc-400">Search queries are sanitized against MongoDB ReDoS patterns and dangerous regex meta-tokens.</p>
                  </div>
                  <div className="rounded-lg border border-[#2A1B3D] bg-[#110A1A]/60 p-3.5">
                    <p className="font-semibold text-zinc-100 mb-1">Role Matrix Enforcement</p>
                    <p className="text-zinc-400">Every single API document query runs through server-side authorization guards.</p>
                  </div>
                </div>
              </div>
            </article>

            {/* Section 8: Contact */}
            <article
              id="contact"
              className="scroll-mt-24 rounded-2xl border border-[#2A1B3D] bg-[#160E24]/40 p-6 sm:p-8 backdrop-blur-sm"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="grid h-9 w-9 place-items-center rounded-lg border border-[#C4A7FF]/30 bg-[#C4A7FF]/10 text-[#C4A7FF]">
                  <Mail className="h-4.5 w-4.5" />
                </div>
                <div>
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#C4A7FF]">
                    Section 08
                  </span>
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-zinc-100">
                    Contact &amp; Data Inquiries
                  </h2>
                </div>
              </div>

              <div className="space-y-4 text-sm leading-relaxed text-zinc-300">
                <p>
                  For privacy questions, data-deletion requests, or security vulnerability disclosures:
                </p>
                <div className="rounded-xl border border-[#2A1B3D] bg-[#110A1A]/80 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-zinc-100">Internal Workspace Questions</p>
                    <p className="text-xs text-zinc-400 mt-0.5">Contact your system administrator directly from the users panel.</p>
                  </div>
                  <Link
                    href="/dashboard/overview"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[#C4A7FF] px-4 py-2 text-xs font-semibold text-[#120A20] hover:bg-[#B593FF] transition-colors"
                  >
                    Open Workspace
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
            <span>Privacy Policy</span>
          </div>
          <nav className="flex gap-4">
            <Link href="/" className="hover:text-zinc-200 transition-colors">Home</Link>
            <Link href="/terms" className="hover:text-zinc-200 transition-colors">Terms of Service</Link>
            <Link href="/login" className="hover:text-zinc-200 transition-colors">Sign in</Link>
          </nav>
          <p className="font-mono text-zinc-500">© 2026 TicketFlow System</p>
        </div>
      </footer>
    </div>
  );
}
