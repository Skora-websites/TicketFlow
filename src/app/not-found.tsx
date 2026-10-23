import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home, LayoutDashboard, LifeBuoy } from "lucide-react";

export const metadata = {
  title: "404 - Page Not Found · TicketFlow",
  description: "The page or desk you requested could not be found.",
};

const NOISE = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")",
  backgroundSize: "200px 200px",
};

const GLOW_BG = {
  backgroundImage:
    "radial-gradient(ellipse 60% 50% at 50% 30%, rgb(196 167 255 / 0.15), transparent 70%)",
};

export default function NotFound() {
  return (
    <div
      className="dark min-h-screen flex flex-col items-center justify-center bg-[#0E0A14] text-zinc-100 px-5 text-center relative overflow-hidden"
      data-color-theme="purple"
      style={NOISE}
    >
      {/* Background radial glow */}
      <div className="pointer-events-none absolute inset-0" style={GLOW_BG} aria-hidden />

      {/* Decorative Blueprint grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgb(255 255 255 / 0.03) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.03) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
        aria-hidden
      />

      <div className="relative z-10 max-w-lg mx-auto flex flex-col items-center">
        {/* Brand pill */}
        <Link href="/" className="inline-flex items-center gap-2 mb-8 group" aria-label="TicketFlow home">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#C4A7FF] font-display text-base font-bold text-[#120A20] shadow-sm">
            T
          </span>
          <span className="font-display text-lg font-bold tracking-tight text-zinc-100">
            TicketFlow
          </span>
        </Link>

        {/* 404 Status Pill */}
        <div className="inline-flex items-center gap-1.5 rounded-full border border-[#C4A7FF]/40 bg-[#C4A7FF]/10 px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-[#C4A7FF] mb-6 shadow-sm">
          <LifeBuoy className="h-3.5 w-3.5" aria-hidden />
          Error 404 · Unrouted
        </div>

        {/* Big Error Title */}
        <h1 className="font-display text-[clamp(2.5rem,6vw,4rem)] font-bold tracking-tight leading-none text-zinc-100">
          Page not found
        </h1>

        <p className="mt-4 text-base leading-relaxed text-zinc-400 max-w-md">
          The ticket, desk, or path you&apos;re looking for doesn&apos;t exist, has been moved, or is filed in a different department.
        </p>

        {/* Action buttons */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 w-full sm:w-auto">
          <Button
            asChild
            className="bg-[#C4A7FF] hover:bg-[#B593FF] text-[#120A20] font-semibold h-10 px-5 shadow-sm"
          >
            <Link href="/" className="inline-flex items-center gap-2">
              <Home className="h-4 w-4" aria-hidden />
              Back to Home
            </Link>
          </Button>

          <Button
            asChild
            variant="outline"
            className="border-zinc-700 bg-zinc-800/40 hover:bg-zinc-800 hover:border-zinc-600 text-zinc-100 font-semibold h-10 px-5"
          >
            <Link href="/dashboard/overview" className="inline-flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4" aria-hidden />
              Go to Workspace
            </Link>
          </Button>
        </div>

        <p className="mt-12 font-mono text-xs text-zinc-500">
          Every request becomes a ticket · Tickets go somewhere
        </p>
      </div>
    </div>
  );
}
