import { createContext, useContext, useEffect, useState } from "react";

export type Theme =
  | "modern"
  | "zinc"
  | "terminal"
  | "amber"
  | "cyberwave"
  | "glass"
  | "crimson"
  | "orange"
  | "ocean";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const ALL_THEMES: Theme[] = ["zinc", "terminal", "amber", "cyberwave", "glass", "crimson", "orange", "ocean"];

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem("rss_theme") as Theme) ?? "modern";
  });

  useEffect(() => {
    document.body.classList.remove(...ALL_THEMES.map((t) => `theme-${t}`));
    if (theme !== "modern") {
      document.body.classList.add(`theme-${theme}`);
    }
    localStorage.setItem("rss_theme", theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
