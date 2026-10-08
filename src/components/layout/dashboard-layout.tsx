"use client";

import { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
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
        <Sidebar />
        <div className="lg:pl-64">
          <Header />
          <main className="relative px-4 py-6 sm:px-6 lg:px-8">
            <div className="page-shell">{children}</div>
          </main>
        </div>
      </div>
    </KeyboardLayerProvider>
  );
}
