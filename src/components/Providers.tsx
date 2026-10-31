"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { ReactNode, useEffect } from "react";

import { usePathname } from "next/navigation";

import { ColorThemeProvider } from "@/components/ColorThemeProvider";
import { DraftResumeProvider } from "@/lib/drafts/context";
import { MinimizedWorkflowDock } from "@/components/drafts/MinimizedWorkflowDock";

function AccountThemeSync() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const accountTheme = session?.user?.theme;
    if (accountTheme && (accountTheme === "dark" || accountTheme === "light" || accountTheme === "system")) {
      if (theme !== accountTheme) {
        setTheme(accountTheme);
      }
    }
  }, [session?.user?.id, session?.user?.theme, setTheme, theme]);

  return null;
}

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
          <DraftResumeProvider>
            <AccountThemeSync />
            {children}
            {isApp && <MinimizedWorkflowDock />}
            <Toaster />
          </DraftResumeProvider>
        </ColorThemeProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}