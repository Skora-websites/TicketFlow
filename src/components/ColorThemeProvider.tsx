"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export type ColorTheme = "rose" | "purple" | "lime" | "brown";

interface ColorThemeContextType {
  colorTheme: ColorTheme;
  setColorTheme: (theme: ColorTheme) => void;
}

const ColorThemeContext = createContext<ColorThemeContextType>({
  colorTheme: "purple",
  setColorTheme: () => {},
});

interface ColorThemeProviderProps {
  children: React.ReactNode;
  isApp?: boolean;
}

export function ColorThemeProvider({ children, isApp = false }: ColorThemeProviderProps) {
  const { data: session, update: updateSession } = useSession();
  const [savedTheme, setSavedTheme] = useState<ColorTheme>("purple");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ticketflow-color-theme") as ColorTheme;
      if (saved && (saved === "rose" || saved === "purple" || saved === "lime" || saved === "brown")) {
        setSavedTheme(saved);
      }
    } catch {
      // LocalStorage access might fail in privacy-restricted contexts
    }
  }, []);

  // When user session loads, lock to account's saved preference
  useEffect(() => {
    const userColorTheme = session?.user?.colorTheme as ColorTheme | undefined;
    if (
      userColorTheme &&
      (userColorTheme === "rose" || userColorTheme === "purple" || userColorTheme === "lime" || userColorTheme === "brown")
    ) {
      setSavedTheme(userColorTheme);
      try {
        localStorage.setItem("ticketflow-color-theme", userColorTheme);
      } catch {}
      document.documentElement.setAttribute("data-color-theme", userColorTheme);
    }
  }, [session?.user?.id, session?.user?.colorTheme]);

  useEffect(() => {
    if (!isApp) {
      document.documentElement.setAttribute("data-color-theme", "purple");
    } else {
      document.documentElement.setAttribute("data-color-theme", savedTheme);
    }
  }, [isApp, savedTheme]);

  const setColorTheme = (theme: ColorTheme) => {
    setSavedTheme(theme);
    try {
      localStorage.setItem("ticketflow-color-theme", theme);
    } catch {}
    if (isApp) {
      document.documentElement.setAttribute("data-color-theme", theme);
    }

    // Lock to user account in database if logged in
    if (session?.user?.id) {
      fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ colorTheme: theme }),
      }).catch((err) => console.warn("Failed to lock colorTheme to account:", err));
      updateSession?.({ colorTheme: theme }).catch(() => {});
    }
  };

  const activeColorTheme = isApp ? savedTheme : "purple";

  return (
    <ColorThemeContext.Provider value={{ colorTheme: activeColorTheme, setColorTheme }}>
      {children}
    </ColorThemeContext.Provider>
  );
}

export const useColorTheme = () => useContext(ColorThemeContext);
