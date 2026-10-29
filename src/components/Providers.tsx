"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { ReactNode } from "react";

import { usePathname } from "next/navigation";

import { ColorThemeProvider } from "@/components/ColorThemeProvider";

export function Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isApp = pathname?.startsWith("/dashboard") || pathname?.startsWith("/client");

  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem={false}
        forcedTheme={isApp ? undefined : "dark"}
      >
        <ColorThemeProvider isApp={Boolean(isApp)}>
          {children}
          <Toaster />
        </ColorThemeProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}