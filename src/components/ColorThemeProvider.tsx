"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type ColorTheme = "rose" | "purple" | "lime" | "brown";

interface ColorThemeContextType {
  colorTheme: ColorTheme;
  setColorTheme: (theme: ColorTheme) => void;
}

const ColorThemeContext = createContext<ColorThemeContextType>({
  colorTheme: "rose",
  setColorTheme: () => {},
});

interface ColorThemeProviderProps {
  children: React.ReactNode;
  isApp?: boolean;
}

export function ColorThemeProvider({ children, isApp = false }: ColorThemeProviderProps) {
  const [savedTheme, setSavedTheme] = useState<ColorTheme>("rose");

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
  };

  const activeColorTheme = isApp ? savedTheme : "purple";

  return (
    <ColorThemeContext.Provider value={{ colorTheme: activeColorTheme, setColorTheme }}>
      {children}
    </ColorThemeContext.Provider>
  );
}

export const useColorTheme = () => useContext(ColorThemeContext);
