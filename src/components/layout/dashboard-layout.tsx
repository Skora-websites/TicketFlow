"use client";

import { ReactNode, Suspense } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { BottomNav } from "./BottomNav";
import { KeyboardLayerProvider } from "./keyboard-layer";

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <KeyboardLayerProvider>
      {/* Subtle dot-grid + top-glow texture behind every dashboard page. The
          header's translucent backdrop keeps the texture visible above the
          fold; cards stay solid so text contrast is untouched. */}
      <div className="app-texture min-h-screen">
        <Suspense fallback={<aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-[215px] lg:flex-col border-r border-border bg-sidebar" />}>
          <Sidebar />
        </Suspense>
        <div className="lg:pl-[215px]">
          <Header />
          <main className="relative px-3.5 py-4 pb-24 sm:px-6 sm:py-6 lg:pb-8 lg:px-8">
            <div className="page-shell">{children}</div>
          </main>
          <Suspense fallback={null}>
            <BottomNav />
          </Suspense>
        </div>
      </div>
    </KeyboardLayerProvider>
  );
}
