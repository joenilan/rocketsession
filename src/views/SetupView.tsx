import { useCallback, useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { ViewShell } from "../components/ViewShell";
import { getJson, API_BASE } from "../lib/api";
import type { StatsApiConfigStatus } from "../types";

export function SetupView() {
  const [status, setStatus] = useState<StatsApiConfigStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [manualPath, setManualPath] = useState("");

  const refresh = useCallback(async () => {
    try {
      const params = manualPath.trim() ? `?path=${encodeURIComponent(manualPath.trim())}` : "";
      const s = await getJson<StatsApiConfigStatus>(`/api/stats-api-config${params}`);
      setStatus(s);
    } catch { /* network not up yet */ }
  }, [manualPath]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function toggle(action: "enable" | "disable") {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(`${API_BASE}/api/stats-api-config/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(manualPath.trim() ? { path: manualPath.trim() } : {}),
      });
      const body = (await res.json()) as StatsApiConfigStatus & { error?: string };
      if (!res.ok) {
        setFeedback({ ok: false, message: body.error ?? "Unknown error." });
      } else {
        setStatus(body);
        setFeedback({
          ok: true,
          message: action === "enable"
            ? "Stats API enabled. Restart Rocket League to apply."
            : "Stats API disabled. Restart Rocket League to apply.",
        });
      }
    } catch (err) {
      setFeedback({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  }

  const statusBadge = status ? (
    <div className={twMerge(
      "flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-mono font-bold uppercase tracking-widest",
      status.enabled
        ? "border-green-500/30 bg-green-500/10 text-green-400"
        : "border-red-500/30 bg-red-500/10 text-red-400",
    )}>
      <span className={twMerge("w-2 h-2 rounded-full shrink-0", status.enabled ? "bg-green-500" : "bg-red-500")} />
      {status.enabled ? `Enabled · ${status.packetSendRate}/s · port ${status.port}` : "Disabled"}
    </div>
  ) : undefined;

  return (
    <ViewShell
      title="RL Setup"
      subtitle="Enable the official Stats API so Rocket League broadcasts live data to this app."
      icon={Settings}
      headerAction={statusBadge}
    >
      <div className="bg-surface-card/60 border border-txt-primary/10 rounded-xl p-4 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-3">

        {/* Loading */}
        {!status && (
          <div className="flex items-center gap-3 text-txt-muted text-sm py-2">
            <div className="w-4 h-4 border-2 border-txt-muted/30 border-t-accent rounded-full animate-spin" />
            Checking Rocket League installation…
          </div>
        )}

        {/* Not found — manual path entry */}
        {status && !status.found && (
          <div className="space-y-3">
            {status.error && <p className="text-sm text-red-400">{status.error}</p>}
            <div className="flex gap-2">
              <input
                className="flex-1 bg-surface-base/60 border border-txt-primary/15 rounded-lg px-3 py-2 text-sm font-mono text-txt-primary placeholder:text-txt-muted focus:outline-none focus:border-accent/50 transition-all"
                placeholder="Paste Rocket League install folder path…"
                value={manualPath}
                onChange={(e) => setManualPath(e.currentTarget.value)}
              />
              <button
                onClick={() => void refresh()}
                className="px-4 py-2 rounded-lg border border-txt-primary/15 bg-txt-primary/5 text-txt-secondary text-sm font-semibold hover:text-txt-primary hover:border-txt-primary/30 transition-all"
              >
                Check
              </button>
            </div>
          </div>
        )}

        {/* Found */}
        {status?.found && (
          <div className="space-y-4">
            <p className="text-xs font-mono text-txt-muted break-all leading-relaxed">{status.path}</p>

            <div>
              {status.enabled ? (
                <button
                  className="px-5 py-2.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm font-semibold hover:bg-red-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={loading}
                  onClick={() => void toggle("disable")}
                >
                  {loading ? "Disabling…" : "Disable Stats API"}
                </button>
              ) : (
                <button
                  className="px-5 py-2.5 rounded-lg border border-green-500/30 bg-green-500/10 text-green-300 text-sm font-semibold hover:bg-green-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={loading}
                  onClick={() => void toggle("enable")}
                >
                  {loading ? "Enabling…" : "Enable Stats API"}
                </button>
              )}
            </div>
          </div>
        )}

        {feedback && (
          <p className={twMerge("text-sm", feedback.ok ? "text-green-400" : "text-red-400")}>
            {feedback.message}
          </p>
        )}
      </div>

      <div className="bg-surface-card/40 border border-txt-primary/[0.08] rounded-xl p-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-txt-muted mb-2">How it works</p>
        <ol className="space-y-1.5 text-xs text-txt-secondary list-decimal list-inside">
          <li>Click <span className="text-txt-primary font-semibold">Enable Stats API</span> to patch your Rocket League config</li>
          <li>Close and relaunch Rocket League</li>
          <li>The app starts receiving live stats automatically on port {status?.port ?? 49123}</li>
        </ol>
      </div>
    </ViewShell>
  );
}
