"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Inbox,
  RotateCcw,
  Zap,
  Users,
  Clock,
  BarChart3,
  FileCheck,
  ShieldCheck,
  Search,
  LayoutDashboard,
  TicketCheck,
  Send,
  FolderKanban,
  Gauge,
  Cpu,
  Building2,
  MessageSquare,
  Paperclip,
  ArrowLeftRight,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLandingGsap } from "@/app/landing-gsap";

/* =====================================================================
   Landing page — dark only, cobalt accent, editorial-modular.
   Everything shown mirrors a real app surface: the unassigned queue,
   routing rules, role seats, and dashboard sections. No invented stats,
   no promised features — if it isn't in the product, it isn't on the page.
   ===================================================================== */

const NOISE = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")",
  backgroundSize: "200px 200px",
};

/* Section texture: faint blueprint grid on panels. */
const GRID_BG = {
  backgroundImage:
    "linear-gradient(to right, rgb(255 255 255 / 0.025) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.025) 1px, transparent 1px)",
  backgroundSize: "56px 56px",
};

/* Soft radial cobalt glow for hero / CTA. */
const GLOW_BG = {
  backgroundImage:
    "radial-gradient(ellipse 60% 50% at 70% 20%, rgb(79 144 248 / 0.09), transparent 70%)",
};

/* Dotted texture for feature folder panel. */
const DOTS_BG = {
  backgroundImage: "radial-gradient(rgb(255 255 255 / 0.045) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
};

const ACCENT = "#4F90F8";

/* ---------------- textures helper ---------------- */
function texture(kind: "noise" | "grid" | "dots" | "glow", extra?: string) {
  const map = { noise: NOISE, grid: GRID_BG, dots: DOTS_BG, glow: GLOW_BG };
  return cn("w-full", extra);
}

/* ---------------- shared section header ---------------- */
function SectionHeader({
  eyebrow,
  title,
  body,
  align = "left",
}: {
  eyebrow: string;
  title: string;
  body?: string;
  align?: "left" | "center";
}) {
  return (
    <div
      data-animate="header"
      className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}
    >
      <p data-animate="header-child" className="font-mono text-[0.8125rem] uppercase tracking-[0.16em] text-[#4F90F8]">
        {eyebrow}
      </p>
      <h2
        data-animate="header-child"
        className="mt-3 font-display text-[clamp(1.875rem,4vw,2.75rem)] font-bold leading-tight tracking-[-0.025em] text-zinc-100"
      >
        {title}
      </h2>
      {body && (
        <p data-animate="header-child" className="mt-4 text-[1.0625rem] leading-relaxed text-zinc-400">
          {body}
        </p>
      )}
    </div>
  );
}

/* ===================== header ===================== */
const NAV_SECTIONS = [
  { label: "How it works", short: "How", href: "#how" },
  { label: "Routing", short: "Routing", href: "#routing" },
  { label: "Features", short: "Features", href: "#features" },
  { label: "Roles", short: "Roles", href: "#roles" },
  { label: "Pricing", short: "Pricing", href: "#pricing" },
];

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800/70 bg-[#18181b]/90 backdrop-blur-xl" style={NOISE}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="TicketFlow home">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-[#4F90F8] font-display text-sm font-bold text-zinc-900">T</span>
          <span className="font-display text-[1.0625rem] font-bold tracking-tight text-zinc-100">TicketFlow</span>
        </Link>
        <nav className="flex min-w-0 items-center gap-3.5 text-[0.8125rem] text-zinc-400 sm:gap-7 sm:text-[0.9rem]" aria-label="Primary">
          {NAV_SECTIONS.map((s) => (
            <a key={s.href} className="whitespace-nowrap transition-colors hover:text-zinc-100" href={s.href}>
              <span className="sm:hidden">{s.short}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </a>
          ))}
          <Link className="hidden shrink-0 transition-colors hover:text-[#4F90F8] sm:inline" href="/login">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="group inline-flex shrink-0 items-center gap-1.5 rounded-md bg-zinc-100 px-3.5 py-2 text-[0.8125rem] font-semibold text-zinc-900 transition-colors hover:bg-white sm:px-4 sm:text-sm"
          >
            Get started
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </nav>
      </div>
    </header>
  );
}

/* ===================== hero + interactive demo board ===================== */
type DemoTicket = {
  id: string;
  title: string;
  requester: string;
  priority: "High" | "Medium" | "Low";
  assignee: string | null;
  done: boolean;
};

const INITIAL_QUEUE: DemoTicket[] = [
  { id: "TK-0042", title: "Login page not loading on mobile", requester: "Alex D.", priority: "High", assignee: null, done: false },
  { id: "TK-0038", title: "Add dark mode toggle to settings", requester: "Jordan C.", priority: "Medium", assignee: null, done: false },
  { id: "TK-0067", title: "CRM data sync issues", requester: "Morgan S.", priority: "High", assignee: null, done: false },
  { id: "TK-0035", title: "Email notifications not sending", requester: "Priya S.", priority: "Low", assignee: null, done: false },
];
const ON_CALL = ["Priya S.", "Devon A.", "June K.", "Sam R."];

const PRIORITY_STYLES: Record<string, string> = {
  High: "bg-red-500/15 text-red-300",
  Medium: "bg-amber-500/15 text-amber-300",
  Low: "bg-zinc-800/70 text-zinc-400",
};

function DemoBoard() {
  const [tickets, setTickets] = useState<DemoTicket[]>(INITIAL_QUEUE);
  const [pointer, setPointer] = useState(0);

  const cleared = tickets.filter((t) => t.done).length;
  const pct = Math.round((cleared / tickets.length) * 100);

  const assignNext = () => {
    const next = tickets.find((t) => !t.done);
    if (!next) return;
    const who = ON_CALL[pointer % ON_CALL.length];
    setPointer((p) => p + 1);
    setTickets((ts) => ts.map((t) => (t.id === next.id ? { ...t, assignee: who, done: true } : t)));
  };

  const reset = () => {
    setTickets(INITIAL_QUEUE);
    setPointer(0);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800/40" role="region" aria-label="Example desk queue">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-700/60 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-zinc-100 text-zinc-900">
            <Inbox className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h2 className="text-[0.9375rem] font-semibold text-zinc-100">This morning&apos;s queue</h2>
            <p className="font-mono text-xs text-zinc-400">
              {cleared === tickets.length ? "Queue clear" : `${tickets.length - cleared} waiting · ${pct}% cleared`}
            </p>
          </div>
        </div>
        {cleared === tickets.length ? (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-100 transition-colors hover:border-zinc-500"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Replay
          </button>
        ) : (
          <button
            type="button"
            onClick={assignNext}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#4F90F8] px-3 py-1.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-[#6FA6FA]"
          >
            <Zap className="h-3.5 w-3.5" aria-hidden />
            Assign next
          </button>
        )}
      </div>

      <div className="h-0.5 bg-zinc-800" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Queue cleared">
        <div className="h-full bg-[#4F90F8] transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>

      <ul className="divide-y divide-zinc-800/80">
        {tickets.map((t) => (
          <li
            key={t.id}
            className={cn(
              "grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-3.5 transition-colors sm:grid-cols-[88px_1fr_auto_auto]",
              t.done && "bg-zinc-900/40"
            )}
          >
            <span className="hidden font-mono text-[0.8125rem] text-zinc-400 sm:block">{t.id}</span>
            <span className={cn("text-[0.9375rem] font-medium text-zinc-100", t.done && "text-zinc-500 line-through decoration-zinc-600")}>
              {t.title}
              <span className="block text-[0.8125rem] font-normal text-zinc-400 sm:hidden">{t.requester}</span>
            </span>
            <span className="hidden text-sm text-zinc-400 sm:block">
              {t.done ? (
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-[#4F90F8]" aria-hidden />
                  {t.assignee}
                </span>
              ) : (
                t.requester
              )}
            </span>
            <span className="col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto">
              {t.done ? (
                <span className="inline-block whitespace-nowrap rounded border border-[#4F90F8]/60 px-2 py-px font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[#4F90F8] motion-safe:animate-stamp-in">
                  Routed
                </span>
              ) : (
                <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", PRIORITY_STYLES[t.priority])}>
                  {t.priority}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-zinc-800 px-5 py-3 font-mono text-xs text-zinc-400">
        Every request becomes a ticket. Tickets go somewhere — try it.
      </p>
    </div>
  );
}

function Hero() {
  return (
    <section data-animate="hero" className="relative overflow-hidden" style={GLOW_BG}>
      <div className="pointer-events-none absolute inset-0" style={GRID_BG} aria-hidden />
      <div className="mx-auto max-w-6xl px-5 pb-20 pt-16 sm:px-6 sm:pt-24">
        <div className="max-w-3xl">
          <h1 data-animate="hero-line" className="font-display text-[clamp(2.75rem,7vw,4.75rem)] font-bold leading-[1.0] tracking-[-0.035em] text-zinc-100">
            Every request,
            <br />
            one queue.
            <span className="text-[#4F90F8]"> Work it.</span>
          </h1>
          <p data-animate="hero-line" className="mt-7 max-w-[38rem] text-[1.1875rem] leading-relaxed text-zinc-400">
            Requests die in inboxes. TicketFlow is the desk they land on instead —
            routed to the right person, tracked to done, visible to exactly the
            people who need the answer.
          </p>
          <div data-animate="hero-cta" className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className="group inline-flex items-center gap-2 rounded-md bg-[#4F90F8] px-5 py-3 text-[0.9375rem] font-semibold text-zinc-900 transition-colors hover:bg-[#6FA6FA]"
            >
              Create your desk
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-5 py-3 text-[0.9375rem] font-semibold text-zinc-100 transition-colors hover:border-zinc-500"
            >
              Sign in
            </Link>
            <p className="ml-1 hidden font-mono text-xs text-zinc-400 sm:block">free while you evaluate</p>
          </div>
        </div>

        <div data-animate="hero-demo" className="mt-16 max-w-4xl">
          <DemoBoard />
        </div>
      </div>
    </section>
  );
}

/* ===================== how it works ===================== */
const steps = [
  { n: "01", title: "Capture", body: "Email, form, or API — every request lands in one queue with its history attached. Nothing lives in someone's inbox.", when: "on arrival" },
  { n: "02", title: "Route", body: "Rules match on category, priority, keywords, or requester. Tickets skip triage and land assigned, or wait in one visible pile.", when: "before triage" },
  { n: "03", title: "Resolve", body: "Comments, files, and status stay on the ticket. The requester sees progress; everyone else sees nothing they shouldn't.", when: "to done" },
];

function HowItWorks() {
  return (
    <section id="how" className="border-y border-zinc-800 bg-zinc-800/25" style={NOISE}>
      <div className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:px-6 sm:py-28">
        <SectionHeader eyebrow="How it works" title="Three verbs. That's the whole product." />
        <ol data-animate="steps" className="mt-14">
          {steps.map((s) => (
            <li key={s.n} data-animate="step" className="grid gap-x-8 gap-y-2 border-t border-zinc-800 py-8 last:border-b sm:grid-cols-[64px_1fr_2fr] sm:items-baseline">
              <p className="font-mono text-sm text-zinc-500" aria-hidden>{s.n}</p>
              <div>
                <h3 className="font-display text-2xl font-semibold tracking-tight text-zinc-100">{s.title}</h3>
                <p className="mt-1 font-mono text-xs text-zinc-400">{s.when}</p>
              </div>
              <p className="max-w-[54ch] text-[1.0625rem] leading-relaxed text-zinc-400">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ===================== routing (visual, replaces Permissions) =====================
   A live-feeling rules panel: each rule is a real shape the engine supports
   (category / priority / keyword / requester → assign user or department),
   with an incoming-ticket feed on the left showing which rule fired. */

const ROUTING_RULES = [
  { when: "Category is Billing", then: "Finance · Priya S.", active: true },
  { when: "Priority is Urgent", then: "On-call engineer", active: true },
  { when: "Keywords: invoice, refund", then: "Finance · unassigned queue", active: true },
  { when: "Requester is a client", then: "Support tier 1", active: false },
];

const INCOMING = [
  { tn: "TK-0104", text: "Refund not processed for order #8821", rule: "Keywords: invoice, refund", to: "Finance · unassigned queue" },
  { tn: "TK-0105", text: "Checkout button broken on Safari", rule: "Priority is Urgent", to: "On-call engineer" },
  { tn: "TK-0106", text: "Update invoice address", rule: "Category is Billing", to: "Finance · Priya S." },
];

function RoutingVisual() {
  const [selected, setSelected] = useState(0);

  return (
    <section id="routing" className="relative mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:px-6 sm:py-28">
      {/* Blueprint grid behind the interactive demo panel — mirrors the hero. */}
      <div className="pointer-events-none absolute inset-x-0 -top-10 bottom-0" style={GRID_BG} aria-hidden />
      <div className="relative">
      <SectionHeader
        eyebrow="Routing"
        title="Most tickets already know where they belong"
        body="Write rules once. New tickets skip the triage pile and land in the right queue, already assigned. What's left is one honest pile everyone can see."
      />

      <div className="mt-14 grid gap-10 lg:grid-cols-[1fr_1.3fr] lg:gap-14">
        {/* Incoming feed — click a ticket to see which rule catches it */}
        <div data-animate="routing-feed" className="space-y-3">
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-zinc-500">Incoming tickets</p>
          {INCOMING.map((t, i) => (
            <button
              key={t.tn}
              type="button"
              onClick={() => setSelected(i)}
              aria-pressed={selected === i}
              className={cn(
                "w-full rounded-lg border p-3.5 text-left transition-colors",
                selected === i
                  ? "border-[#4F90F8]/40 bg-[#4F90F8]/[0.06]"
                  : "border-zinc-800 bg-zinc-800/20 hover:border-zinc-700"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs text-zinc-400">{t.tn}</span>
                {selected === i && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#4F90F8]/15 px-2 py-0.5 font-mono text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-[#4F90F8]">
                    <Zap className="h-2.5 w-2.5" aria-hidden /> Routed
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm font-medium text-zinc-100">{t.text}</p>
            </button>
          ))}
          <p className="pt-2 font-mono text-xs text-zinc-500">
            Click a ticket to see how routing handles it.
          </p>
        </div>

        {/* Rule engine panel */}
        <div className="space-y-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-800/40 p-5" style={GRID_BG}>
            <div className="flex items-center justify-between gap-3 border-b border-zinc-700/60 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-7 w-7 place-items-center rounded-md bg-[#4F90F8]/15 text-[#4F90F8]">
                  <Cpu className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <h3 className="text-[0.9375rem] font-semibold text-zinc-100">Rule engine</h3>
                  <p className="font-mono text-xs text-zinc-400">3 active · 1 paused</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 font-mono text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden /> Online
              </span>
            </div>

            {/* Selected ticket routing trail */}
            <div className="border-b border-zinc-800 py-4">
              <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-zinc-500">Matched</p>
              <p className="mt-1 text-sm font-medium text-zinc-100">{INCOMING[selected].rule}</p>
              <div className="mt-3 flex items-center gap-2 font-mono text-xs">
                <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-300">{INCOMING[selected].tn}</span>
                <ArrowRight className="h-3.5 w-3.5 text-zinc-600" aria-hidden />
                <span className="rounded border border-[#4F90F8]/40 bg-[#4F90F8]/10 px-2 py-1 text-[#4F90F8]">{INCOMING[selected].to}</span>
              </div>
            </div>

            {/* Rule list */}
            <dl className="pt-2">
              {ROUTING_RULES.map((r) => (
                <div key={r.when} className="grid grid-cols-[1fr_auto] items-baseline gap-x-5 gap-y-1 py-3 text-[0.9375rem] sm:grid-cols-[1fr_auto_1fr_auto]">
                  <dt className="font-medium text-zinc-200">if {r.when.charAt(0).toLowerCase() + r.when.slice(1)}</dt>
                  <dd aria-hidden="true" className="hidden font-bold text-zinc-600 sm:block">→</dd>
                  <dd className="col-start-1 text-zinc-400 sm:col-start-auto">{r.then}</dd>
                  <dd
                    className={cn(
                      "col-start-2 row-span-2 justify-self-end whitespace-nowrap rounded-full px-2.5 py-0.5 font-mono text-xs font-medium sm:col-start-auto sm:row-span-1",
                      r.active ? "bg-[#4F90F8]/15 text-[#4F90F8]" : "bg-zinc-800/70 text-zinc-400"
                    )}
                  >
                    {r.active ? "on" : "off"}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
      </div>
    </section>
  );
}

/* ===================== features — folder-slot interactive cards =====================
   Each card sits in a "folder slot" (tabbed manila folder silhouette).
   Hovering/clicking a slot pulls the card up like a file being retrieved.
   Content = real dashboard surfaces, no invented claims. */

const FEATURE_FOLDERS = [
  {
    id: "queue",
    tab: "Unassigned Queue",
    icon: Inbox,
    title: "One pile, fully visible",
    body: "Unassigned tickets wait in a single queue with priority, requester, and age on every row. Assign to yourself or anyone on the team in one click — with undo.",
    chips: ["Priority & age on every row", "Assign to me · one click", "Optimistic UI with undo"],
  },
  {
    id: "detail",
    tab: "Ticket Detail",
    icon: MessageSquare,
    title: "The whole thread stays on the ticket",
    body: "Comments, attachments, status changes, and a full event timeline live in one place. Viewers are announced in real time so two people never answer blindly.",
    chips: ["Comments & attachments", "Status timeline events", "Live viewer presence"],
  },
  {
    id: "workload",
    tab: "Team Workload",
    icon: Gauge,
    title: "See who's carrying what",
    body: "Open, in-progress, and on-hold counts per teammate. The routing engine reads live capacity, so heavy loads stop receiving new work before anyone burns out.",
    chips: ["Per-member load counts", "Live capacity for routing", "Manager + admin views"],
  },
  {
    id: "analytics",
    tab: "Analytics",
    icon: BarChart3,
    title: "Where work actually sits",
    body: "Tickets by status, priority, and department; weekly trend; average resolution time. Aggregated queries, department-scoped to what you're allowed to see.",
    chips: ["Status · priority · department", "Weekly trend & resolution", "Department-scoped"],
  },
  {
    id: "search",
    tab: "Full-text Search",
    icon: Search,
    title: "Find the ticket, not the needle",
    body: "Mongo text index across titles and descriptions, plus exact ticket-number lookup. Paste TK-1024 and land on the ticket — no page scrolling.",
    chips: ["$text index, no collection scan", "Exact number lookup", "Status & priority filters"],
  },
  {
    id: "routing",
    tab: "Routing Rules",
    icon: SlidersHorizontal,
    title: "Rules that do the triage for you",
    body: "Match on category, priority, keywords, or requester — assign to a person, a department pool, or set priority on the way in. Live preview shows the decision before you save.",
    chips: ["Keyword · category · priority", "Dry-run live preview", "Pause & activate per rule"],
  },
];

function FeatureFolder({ f, index }: { f: (typeof FEATURE_FOLDERS)[number]; index: number }) {
  const [open, setOpen] = useState(index === 0);
  const Icon = f.icon;

  return (
    <div data-animate="feature-card" className="group relative">
      {/* Folder tab */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "relative z-10 inline-flex items-center gap-2 rounded-t-lg border border-b-0 px-4 py-2 font-mono text-xs font-medium transition-colors",
          open
            ? "border-zinc-700 bg-zinc-800/80 text-zinc-100"
            : "border-zinc-800 bg-zinc-900/60 text-zinc-500 hover:text-zinc-300"
        )}
      >
        <Icon className="h-3.5 w-3.5 text-[#4F90F8]" aria-hidden />
        {f.tab}
      </button>

      {/* Folder body — the card slides up out of the slot */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div
            className={cn(
              "rounded-lg rounded-tl-none border border-zinc-700 bg-zinc-800/80 p-5 shadow-lg shadow-black/20 transition-colors",
              "group-hover:border-[#4F90F8]/30"
            )}
          >
            <h3 className="font-display text-lg font-semibold tracking-tight text-zinc-100">{f.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{f.body}</p>
            <ul className="mt-3 space-y-1.5">
              {f.chips.map((c) => (
                <li key={c} className="flex items-start gap-2 text-sm text-zinc-300">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4F90F8]" aria-hidden />
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Slot base */}
      <div aria-hidden className={cn("h-1 rounded-b-lg bg-zinc-800/80 transition-colors", !open && "mt-0")} />
    </div>
  );
}

function Features() {
  return (
    <section id="features" className="border-y border-zinc-800 bg-zinc-800/25" style={DOTS_BG}>
      <div className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:px-6 sm:py-28">
        <SectionHeader
          eyebrow="Features"
          title="Built for the way work actually gets done"
          body="Every panel below is a real surface in the app — click a tab to open the folder."
        />
        <div data-animate="feature-grid" className="mt-12 grid gap-x-8 gap-y-2 md:grid-cols-2 lg:grid-cols-3">
          {FEATURE_FOLDERS.map((f, i) => (
            <FeatureFolder key={f.id} f={f} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ===================== roles (text, honest) ===================== */
const roles = [
  { role: "Super admin", gets: ["All departments", "Global analytics", "System configuration"] },
  { role: "Manager", gets: ["Own department", "Team workload board", "Routing rules"] },
  { role: "Team member", gets: ["Assigned queue", "Ticket updates", "Comments & files"] },
  { role: "Client", gets: ["Their own tickets", "Status timeline", "Direct replies"] },
];

function RolesSection() {
  return (
    <section id="roles" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:px-6 sm:py-28" style={GLOW_BG}>
      <SectionHeader
        eyebrow="Permissions"
        title="Four seats. Everyone sees their own desk."
        body="Access is scoped before a page renders — not hidden after. A client never learns another client's ticket exists."
      />
      <div data-animate="roles-list" className="mt-14">
        {roles.map((r) => (
          <div key={r.role} data-animate="role-row" className="grid gap-x-8 gap-y-2 border-t border-zinc-800 py-6 last:border-b sm:grid-cols-[220px_1fr] sm:items-baseline">
            <h3 className="font-display text-xl font-semibold tracking-tight text-zinc-100">{r.role}</h3>
            <ul className="flex flex-wrap gap-x-6 gap-y-1.5 text-[0.9375rem] text-zinc-400">
              {r.gets.map((g) => (
                <li key={g} className="flex gap-2">
                  <span aria-hidden="true" className="text-[#4F90F8]">—</span>
                  {g}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ===================== pricing ===================== */
const plans = [
  {
    name: "Starter",
    price: "$0",
    period: "forever",
    list: ["Up to 3 users", "Unlimited tickets", "Basic routing rules", "Email notifications"],
    cta: "Start free",
    featured: false,
  },
  {
    name: "Office",
    price: "$29",
    period: "per user / month",
    list: ["Unlimited users", "Advanced routing & preview", "Per-department analytics", "File attachments", "Priority support"],
    cta: "Start trial",
    featured: true,
  },
];

function Pricing() {
  return (
    <section id="pricing" className="border-y border-zinc-800 bg-zinc-800/25" style={NOISE}>
      <div className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:px-6 sm:py-28">
        <SectionHeader
          eyebrow="Pricing"
          title="Free while you evaluate"
          body="Two plans. No credit card, no seat minimums — if it doesn't stick, deleting your desk is the whole offboarding."
        />
        <div data-animate="price-grid" className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-2">
          {plans.map((p) => (
            <div
              key={p.name}
              data-animate="price-card"
              className={cn(
                "rounded-xl border p-6",
                p.featured ? "border-[#4F90F8]/30 bg-[#4F90F8]/[0.04]" : "border-zinc-800 bg-zinc-800/20"
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display text-lg font-semibold text-zinc-100">{p.name}</h3>
                <p className="font-display text-3xl font-bold tracking-tight text-zinc-100">
                  {p.price}
                  <span className="ml-1 font-mono text-sm font-normal text-zinc-500">{p.period}</span>
                </p>
              </div>
              <ul className="mt-5 space-y-2 text-sm text-zinc-300">
                {p.list.map((l) => (
                  <li key={l} className="flex gap-2">
                    <Check className="h-3.5 w-3.5 shrink-0 text-[#4F90F8]" aria-hidden />
                    {l}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className={cn(
                  "mt-6 inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold transition-colors",
                  p.featured
                    ? "bg-[#4F90F8] text-zinc-900 hover:bg-[#6FA6FA]"
                    : "border border-zinc-700 text-zinc-100 hover:border-zinc-500"
                )}
              >
                {p.cta}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ===================== CTA ===================== */
function Cta() {
  return (
    <section id="start" className="relative overflow-hidden" style={GLOW_BG}>
      <div className="pointer-events-none absolute inset-0" style={GRID_BG} aria-hidden />
      <div className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:px-6 sm:py-28">
        <div data-animate="cta-block" className="max-w-[38rem]">
          <p data-animate="cta-block" className="font-mono text-[0.8125rem] uppercase tracking-[0.16em] text-[#4F90F8]">Get started</p>
          <h2 data-animate="cta-block" className="mt-3 font-display text-[clamp(2rem,4.5vw,3rem)] font-bold leading-tight tracking-[-0.025em] text-zinc-100">
            Open your desk before the coffee cools
          </h2>
          <p data-animate="cta-block" className="mt-5 text-[1.0625rem] leading-relaxed text-zinc-400">
            Invite the team, write two routing rules, answer your first ticket.
          </p>
          <div data-animate="cta-block" className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="group inline-flex items-center gap-2 rounded-md bg-[#4F90F8] px-5 py-3 text-[0.9375rem] font-semibold text-zinc-900 transition-colors hover:bg-[#6FA6FA]"
            >
              Create your desk
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-5 py-3 text-[0.9375rem] font-semibold text-zinc-100 transition-colors hover:border-zinc-500"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ===================== footer ===================== */
function Footer() {
  return (
    <footer className="border-t border-zinc-800">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-4 px-5 py-8 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="grid h-[22px] w-[22px] place-items-center rounded-md bg-[#4F90F8] font-display text-[11px] font-bold text-zinc-900">T</span>
          <span className="font-display text-[0.9375rem] font-semibold text-zinc-100">TicketFlow</span>
        </div>
        <nav className="flex gap-6 text-sm text-zinc-400" aria-label="Footer">
          <Link className="transition-colors hover:text-zinc-100" href="/privacy">Privacy</Link>
          <Link className="transition-colors hover:text-zinc-100" href="/terms">Terms</Link>
          <Link className="transition-colors hover:text-zinc-100" href="/login">Sign in</Link>
        </nav>
        <p className="font-mono text-xs text-zinc-400">© 2026 TicketFlow</p>
      </div>
    </footer>
  );
}

/* ===================== page ===================== */
export default function Landing() {
  useLandingGsap();
  return (
    <div className="min-h-screen bg-[#18181b] font-sans text-zinc-100 antialiased" style={NOISE}>
      <Header />
      <main>
        <Hero />
        <HowItWorks />
        <RoutingVisual />
        <Features />
        <RolesSection />
        <Pricing />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
