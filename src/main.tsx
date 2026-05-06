import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./context/ThemeContext";
import { Layout, type View } from "./components/Layout";
import { SessionView } from "./views/SessionView";
import { OBSView } from "./views/OBSView";
import { SettingsView } from "./views/SettingsView";
import { HistoryView } from "./views/HistoryView";
import { AboutView } from "./views/AboutView";
import { LogsView } from "./views/LogsView";
import { useSessionSnapshot } from "./lib/api";
import { isTauri } from "./lib/api";
import { OVERLAY_DEFAULTS } from "./hooks/useOverlaySettings";
import type { SessionSnapshot } from "./types";
import { TextCanvasOverlay } from "./components/TextCanvasOverlay";
import "./styles.css";

function OverlayView({ snapshot }: { snapshot: SessionSnapshot }) {
  const { totals, connection } = snapshot;

  const settings = snapshot.overlaySettings ?? OVERLAY_DEFAULTS;

  const streak =
    totals.streak > 0 ? `W${totals.streak}` :
    totals.streak < 0 ? `L${Math.abs(totals.streak)}` : "–";
  const streakClass =
    totals.streak > 0 ? "ov-value ov-value-win" :
    totals.streak < 0 ? "ov-value ov-value-loss" : "ov-value";

  const winRate = totals.games > 0
    ? `${Math.round((totals.wins / totals.games) * 100)}% WR`
    : null;

  const accentColor =
    totals.streak > 0 ? "#22c55e" :
    totals.streak < 0 ? "#f43f5e" :
    "rgb(var(--color-accent-primary))";

  const s = settings.scale / 100;
  const cx = settings.x;
  const cy = settings.y;

  if (connection !== "connected") return null;

  return (
    <div className="ov-shell">
      <div
        className="ov-card"
        style={{
          left: `${cx}%`,
          top: `${cy}%`,
          transform: `translate(-50%, -50%) scale(${s})`,
          "--ov-bg-alpha": String(settings.opacity / 100),
        } as React.CSSProperties}
      >
        <div className="ov-accent-bar" style={{ "--ov-accent": accentColor } as React.CSSProperties} />

        <div className="ov-tiles">
          <div className="ov-tile">
            <span className="ov-label">Wins</span>
            <span className="ov-value ov-value-win">{totals.wins}</span>
          </div>
          <div className="ov-sep" />
          <div className="ov-tile">
            <span className="ov-label">Losses</span>
            <span className="ov-value ov-value-loss">{totals.losses}</span>
          </div>
          <div className="ov-sep" />
          <div className="ov-tile">
            <span className="ov-label">Streak</span>
            <span className={streakClass}>{streak}</span>
          </div>
          <div className="ov-sep" />
          <div className="ov-tile">
            <span className="ov-label">Games</span>
            <span className="ov-value">{totals.games}</span>
          </div>
        </div>

        {winRate && (
          <div className="ov-footer">
            <span className="ov-winrate">{winRate}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function AppContent() {
  const snapshot = useSessionSnapshot();
  const [currentView, setCurrentView] = useState<View>("session");
  const params = new URLSearchParams(window.location.search);

  if (!isTauri || params.get("overlay") === "1") {
    document.documentElement.classList.add("overlay-runtime");
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    if (params.get("overlay") !== "1" && snapshot.overlayMode === "textCanvas") {
      return <TextCanvasOverlay snapshot={snapshot} />;
    }
    return <OverlayView snapshot={snapshot} />;
  }

  return (
    <Layout currentView={currentView} setCurrentView={setCurrentView}>
      <div className={currentView === "session"  ? "h-full" : "hidden"}><SessionView  snapshot={snapshot} /></div>
      <div className={currentView === "history"  ? "h-full" : "hidden"}><HistoryView  snapshot={snapshot} /></div>
      <div className={currentView === "overlay"  ? "h-full" : "hidden"}><OBSView      snapshot={snapshot} /></div>
      <div className={currentView === "logs"     ? "h-full" : "hidden"}><LogsView /></div>
      <div className={currentView === "settings" ? "h-full" : "hidden"}><SettingsView /></div>
      <div className={currentView === "about"    ? "h-full" : "hidden"}><AboutView /></div>
    </Layout>
  );
}

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <AppContent />
  </ThemeProvider>,
);

const bootSplash = document.getElementById("boot-splash");
if (bootSplash) {
  requestAnimationFrame(() => {
    bootSplash.classList.add("boot-splash-hide");
    const removeSplash = () => bootSplash.remove();
    bootSplash.addEventListener("transitionend", removeSplash, { once: true });
    setTimeout(removeSplash, 500);
  });
}
