import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Terminal, Trash2 } from "lucide-react";
import { ViewShell } from "../components/ViewShell";
import { API_BASE, postJson } from "../lib/api";

interface LogEntry {
  timestampMs: number;
  level: "debug" | "info" | "warn" | "error";
  scope: string;
  message: string;
  details?: string;
}

const LEVEL_COLORS: Record<string, string> = {
  debug: "text-txt-muted",
  info:  "text-blue-400",
  warn:  "text-yellow-400",
  error: "text-red-400",
};

const MAX_RENDERED_LOGS = 200;

function fmt(ms: number) {
  return new Date(ms).toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function LogsView() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/logs`);
      const data = (await res.json()) as LogEntry[];
      setEntries(data.slice(-MAX_RENDERED_LOGS));
    } catch {
      // Keep the existing logs visible if a refresh fails.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => void refresh(), 2500);
    return () => window.clearInterval(id);
  }, [live, refresh]);

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [entries, autoScroll]);

  return (
    <ViewShell
      title="Logs"
      subtitle="Live event log from the Stats API and session tracker."
      icon={Terminal}
      headerAction={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLive((value) => !value)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-txt-muted hover:text-txt-primary hover:bg-surface-hover transition-all"
          >
            {live ? "Live On" : "Live Off"}
          </button>
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-txt-muted hover:text-txt-primary hover:bg-surface-hover transition-all disabled:opacity-40"
          >
            <RefreshCw size={12} /> Refresh
          </button>
          <button
            onClick={() => postJson("/api/logs/clear").then(() => setEntries([]))}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-txt-muted hover:text-txt-primary hover:bg-surface-hover transition-all"
          >
            <Trash2 size={12} /> Clear
          </button>
        </div>
      }
    >
      <div className="bg-surface-card/60 border border-txt-primary/10 rounded-xl overflow-hidden animate-in fade-in duration-300">
        <div className="flex items-center justify-between border-b border-txt-primary/10 px-3 py-2 text-[10px] font-mono text-txt-muted">
          <span>Showing latest {entries.length} entries. Live polling is {live ? "enabled" : "disabled"}.</span>
          {loading && <span>Refreshing…</span>}
        </div>
        <div
          className="h-[calc(100vh-220px)] overflow-y-auto font-mono text-[11px] p-3 space-y-0.5"
          onScroll={(e) => {
            const el = e.currentTarget;
            setAutoScroll(el.scrollTop + el.clientHeight >= el.scrollHeight - 10);
          }}
        >
          {entries.length === 0 && (
            <p className="text-txt-muted text-center py-8">No log entries yet.</p>
          )}
          {entries.map((e, i) => (
            <div key={i} className="flex gap-2 leading-relaxed">
              <span className="text-txt-muted shrink-0">{fmt(e.timestampMs)}</span>
              <span className={`shrink-0 uppercase font-bold w-10 ${LEVEL_COLORS[e.level] ?? "text-txt-muted"}`}>
                {e.level}
              </span>
              <span className="text-txt-muted shrink-0">[{e.scope}]</span>
              <span className="text-txt-primary break-all">{e.message}</span>
              {e.details && <span className="text-txt-muted break-all">{e.details}</span>}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </ViewShell>
  );
}
