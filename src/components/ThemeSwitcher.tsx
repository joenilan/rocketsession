import { twMerge } from "tailwind-merge";
import { useTheme, type Theme } from "../context/ThemeContext";

const THEMES: { id: Theme; label: string; color: string }[] = [
  { id: "modern",    label: "Modern",    color: "rgb(145,70,255)"  },
  { id: "terminal",  label: "Terminal",  color: "rgb(51,255,51)"   },
  { id: "amber",     label: "Amber",     color: "rgb(255,176,0)"   },
  { id: "cyberwave", label: "Cyberwave", color: "rgb(0,240,255)"   },
  { id: "glass",     label: "Glass",     color: "rgb(56,189,248)"  },
  { id: "crimson",   label: "Crimson",   color: "rgb(220,20,60)"   },
  { id: "orange",    label: "Orange",    color: "rgb(255,100,0)"   },
  { id: "ocean",     label: "Ocean",     color: "rgb(0,140,255)"   },
];

export function ThemeSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { theme, setTheme } = useTheme();

  if (collapsed) {
    // In collapsed sidebar: show only the active theme dot
    const active = THEMES.find((t) => t.id === theme)!;
    return (
      <div className="flex flex-col items-center gap-1.5 py-1">
        <span className="text-[9px] text-txt-muted uppercase tracking-widest font-mono">Theme</span>
        <div
          className="w-4 h-4 rounded-full border-2 border-txt-primary/30"
          style={{ backgroundColor: active.color }}
          title={active.label}
        />
      </div>
    );
  }

  return (
    <div className="px-2 py-2">
      <span className="text-[10px] text-txt-muted uppercase tracking-widest font-mono font-bold mb-2 block">Theme</span>
      <div className="flex flex-wrap gap-1.5">
        {THEMES.map((t) => (
          <button
            key={t.id}
            title={t.label}
            onClick={() => setTheme(t.id)}
            className={twMerge(
              "w-5 h-5 rounded-full border-2 transition-all duration-150 hover:scale-125",
              theme === t.id
                ? "border-txt-primary scale-110 shadow-lg"
                : "border-transparent hover:border-txt-primary/40"
            )}
            style={{ backgroundColor: t.color }}
          />
        ))}
      </div>
    </div>
  );
}
