import { useEffect, useRef, useState } from "react";
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
import { OVERLAY_DEFAULTS } from "./hooks/useOverlaySettings";
import type { SessionSnapshot } from "./types";
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

  const cardRef = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState({ w: 260, h: 80 });

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setCardSize({ w: r.width, h: r.height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const s = settings.scale / 100;
  const halfWpct = (cardSize.w * s) / 2 / window.innerWidth * 100;
  const halfHpct = (cardSize.h * s) / 2 / window.innerHeight * 100;
  const cx = Math.min(100 - halfWpct, Math.max(halfWpct, settings.x));
  const cy = Math.min(100 - halfHpct, Math.max(halfHpct, settings.y));

  if (connection !== "connected") return null;

  return (
    <div className="ov-shell">
      <div
        ref={cardRef}
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

  if (new URLSearchParams(window.location.search).get("overlay") === "1") {
    document.body.style.background = "transparent";
    return <OverlayView snapshot={snapshot} />;
  }

  return (
    <Layout currentView={currentView} setCurrentView={setCurrentView}>
      {currentView === "session"  && <SessionView snapshot={snapshot} />}
      {currentView === "history"  && <HistoryView snapshot={snapshot} />}
      {currentView === "overlay"  && <OBSView snapshot={snapshot} />}
      {currentView === "logs"     && <LogsView />}
      {currentView === "settings" && <SettingsView />}
      {currentView === "about"    && <AboutView />}
    </Layout>
  );
}

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <AppContent />
  </ThemeProvider>,
);
