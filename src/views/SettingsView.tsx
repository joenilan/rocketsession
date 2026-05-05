import { useCallback, useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { ViewShell } from "../components/ViewShell";
import { useTheme, type Theme } from "../context/ThemeContext";
import { getJson, API_BASE } from "../lib/api";
import type { StatsApiConfigStatus } from "../types";

const THEMES: { id: Theme; label: string; color: string }[] = [
  { id: "modern",    label: "Modern",    color: "rgb(145,70,255)"  },
  { id: "zinc",      label: "Zinc",      color: "rgb(124,58,237)"  },
  { id: "terminal",  label: "Terminal",  color: "rgb(51,255,51)"   },
  { id: "amber",     label: "Amber",     color: "rgb(255,176,0)"   },
  { id: "cyberwave", label: "Cyberwave", color: "rgb(0,240,255)"   },
  { id: "glass",     label: "Glass",     color: "rgb(56,189,248)"  },
  { id: "crimson",   label: "Crimson",   color: "rgb(220,20,60)"   },
  { id: "orange",    label: "Orange",    color: "rgb(255,100,0)"   },
  { id: "ocean",     label: "Ocean",     color: "rgb(0,140,255)"   },
];

function ThemeSection() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="bg-surface-card/60 border border-txt-primary/10 rounded-xl p-4 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
      <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-txt-muted mb-3">Theme</p>
      <div className="grid grid-cols-4 gap-2">
        {THEMES.map((t) => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={twMerge(
              "flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs transition-all",
              theme === t.id
                ? "border-txt-primary/40 bg-txt-primary/5 text-txt-primary"
                : "border-txt-primary/[0.08] text-txt-muted hover:text-txt-primary hover:border-txt-primary/20",
            )}
          >
            <span
              className={twMerge("w-3 h-3 rounded-full shrink-0", theme === t.id && "ring-2 ring-txt-primary/40 ring-offset-1 ring-offset-surface-card")}
              style={{ backgroundColor: t.color }}
            />
            <span className="font-mono truncate">{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}


function StatsApiSettings() {
  const [status, setStatus] = useState<StatsApiConfigStatus | null>(null);
  const [rate, setRate] = useState("30");
  const [port, setPort] = useState("49123");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await getJson<StatsApiConfigStatus>("/api/stats-api-config");
      setStatus(s);
      if (s.packetSendRate > 0) setRate(String(s.packetSendRate));
      if (s.port) setPort(String(s.port));
    } catch { /* network not ready */ }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function apply() {
    const rateNum = parseFloat(rate);
    const portNum = parseInt(port, 10);
    if (!isFinite(rateNum) || rateNum <= 0) {
      setFeedback({ ok: false, message: "Packet send rate must be a positive number." });
      return;
    }
    if (!isFinite(portNum) || portNum < 1024 || portNum > 65535) {
      setFeedback({ ok: false, message: "Port must be between 1024 and 65535." });
      return;
    }
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(`${API_BASE}/api/stats-api-config/enable`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ packetSendRate: rateNum, port: portNum }),
      });
      const body = (await res.json()) as StatsApiConfigStatus & { error?: string };
      if (!res.ok) {
        setFeedback({ ok: false, message: body.error ?? "Failed to apply." });
      } else {
        setStatus(body);
        setFeedback({ ok: true, message: "Settings applied. Restart Rocket League to take effect." });
      }
    } catch (err) {
      setFeedback({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-surface-card/60 border border-txt-primary/10 rounded-xl p-4 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-txt-muted">Stats API Configuration</p>
        {status && (
          <span className={twMerge(
            "text-[9px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-full",
            status.enabled ? "bg-green-500/15 text-green-400" : !status.found ? "bg-yellow-500/15 text-yellow-400" : "bg-red-500/15 text-red-400",
          )}>
            {status.enabled ? "Enabled" : !status.found ? "Not found" : "Disabled"}
          </span>
        )}
      </div>

      {!status && (
        <p className="text-xs text-txt-muted font-mono">Loading…</p>
      )}

      {status && !status.found && (
        <p className="text-xs text-yellow-400">
          Rocket League installation not found. Use the Session page to set the path first.
        </p>
      )}

      {status?.found && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[9px] font-mono font-bold uppercase tracking-widest text-txt-muted block">
                Packet Send Rate <span className="normal-case tracking-normal text-txt-muted/60">(per second)</span>
              </label>
              <input
                type="number"
                min="1"
                max="120"
                step="1"
                value={rate}
                onChange={(e) => setRate(e.currentTarget.value)}
                disabled={!status?.enabled}
                className="w-full bg-surface-base/60 border border-txt-primary/15 rounded-lg px-3 py-2 text-sm font-mono text-txt-primary focus:outline-none focus:border-accent/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <p className="text-[9px] text-txt-muted font-mono">Default: 30. Higher = more CPU.</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-mono font-bold uppercase tracking-widest text-txt-muted block">
                Port
              </label>
              <input
                type="number"
                min="1024"
                max="65535"
                step="1"
                value={port}
                onChange={(e) => setPort(e.currentTarget.value)}
                disabled={!status?.enabled}
                className="w-full bg-surface-base/60 border border-txt-primary/15 rounded-lg px-3 py-2 text-sm font-mono text-txt-primary focus:outline-none focus:border-accent/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <p className="text-[9px] text-txt-muted font-mono">Default: 49123.</p>
            </div>
          </div>

          <button
            disabled={loading || !status?.enabled}
            onClick={() => void apply()}
            className="px-4 py-2 rounded-lg border border-accent/30 bg-accent/10 text-accent text-xs font-mono font-bold hover:bg-accent/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Applying…" : "Apply Changes"}
          </button>
        </>
      )}

      {feedback && (
        <p className={twMerge("text-xs font-mono", feedback.ok ? "text-green-400" : "text-red-400")}>
          {feedback.message}
        </p>
      )}
    </div>
  );
}

export function SettingsView() {
  return (
    <ViewShell
      title="Settings"
      subtitle="Theme and Stats API configuration."
      icon={Settings}
    >
      <ThemeSection />
      <StatsApiSettings />
    </ViewShell>
  );
}
