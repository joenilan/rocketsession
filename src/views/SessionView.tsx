import { useCallback, useEffect, useMemo, useState } from "react";
import { type ReactNode } from "react";
import { BarChart2, RotateCcw, Network } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { twMerge } from "tailwind-merge";
import { ViewShell } from "../components/ViewShell";
import { postJson, getJson, API_BASE } from "../lib/api";
import type { SessionSnapshot, HistoricalMatch, StatsApiConfigStatus } from "../types";

// ─── Chart colors ─────────────────────────────────────────────────────────────

const WIN_COLOR     = "#22c55e";
const LOSS_COLOR    = "#f43f5e";
const NEUTRAL_COLOR = "#52525b";
const WINRATE_COLOR = "#818cf8";
const SAVES_COLOR   = "#f59e0b";

// ─── Chart data ───────────────────────────────────────────────────────────────

interface ChartPoint {
  label: string;
  result: "win" | "loss" | "unknown";
  winRate: number;
  streak: number;
  scoreDiff: number;
}

interface PerfPoint {
  label: string;
  goals: number;
  assists: number;
  saves: number;
}

function buildChartData(history: HistoricalMatch[]): ChartPoint[] {
  const games = [...history].reverse();
  let wins = 0, streak = 0;
  return games.map((match, i) => {
    const isWin  = match.result === "win";
    const isLoss = match.result === "loss";
    if (isWin)       { wins++; streak = streak > 0 ? streak + 1 : 1;  }
    else if (isLoss) {          streak = streak < 0 ? streak - 1 : -1; }
    else             {          streak = 0; }
    const [blue, orange] = match.teams;
    const rawDiff = Math.abs(blue.score - orange.score);
    return {
      label:     `G${i + 1}`,
      result:    isWin ? "win" : isLoss ? "loss" : "unknown",
      winRate:   Math.round((wins / (i + 1)) * 100),
      streak,
      scoreDiff: isWin ? rawDiff : isLoss ? -rawDiff : 0,
    };
  });
}

function buildPerfData(history: HistoricalMatch[], trackedId?: string): PerfPoint[] {
  if (!trackedId) return [];
  return [...history].reverse().map((match, i) => {
    const p = match.players.find(pl => pl.id === trackedId);
    return {
      label:   `G${i + 1}`,
      goals:   p?.goals   ?? 0,
      assists: p?.assists  ?? 0,
      saves:   p?.saves    ?? 0,
    };
  });
}

// ─── Chart UI components ──────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/[0.08] bg-surface-card/[0.97] backdrop-blur-md px-3 py-2 shadow-2xl text-xs space-y-1.5">
      <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-txt-muted">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2.5 min-w-[110px]">
          <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-txt-secondary font-mono flex-1">{p.name}</span>
          <span className="font-mono font-bold tabular-nums" style={{ color: p.color ?? "inherit" }}>
            {typeof p.value === "number" && p.value > 0 && p.name !== "Win Rate" ? "+" : ""}
            {p.value}{p.name === "Win Rate" ? "%" : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function MiniLegend({ items }: { items: Array<{ color: string; label: string }> }) {
  return (
    <div className="flex items-center gap-3">
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-1.5">
          <div className="w-5 h-[2px] rounded-full opacity-80" style={{ backgroundColor: item.color }} />
          <span className="text-[9px] font-mono text-txt-muted uppercase tracking-widest">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function ChartSection({ title, children, legend }: { title: string; children: ReactNode; legend?: ReactNode }) {
  return (
    <div className="bg-surface-card/60 border border-txt-primary/10 rounded-xl p-3 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-txt-muted">{title}</p>
        {legend}
      </div>
      {children}
    </div>
  );
}

// ─── App sub-components ───────────────────────────────────────────────────────

function ConnectionBadge({ connection }: { connection: SessionSnapshot["connection"] }) {
  const states: Record<SessionSnapshot["connection"], { dot: string; label: string }> = {
    connected:    { dot: "bg-green-500",  label: "Connected"    },
    disconnected: { dot: "bg-red-500",    label: "Disconnected" },
    error:        { dot: "bg-red-500",    label: "Error"        },
    connecting:   { dot: "bg-yellow-400", label: "Connecting"   },
  };
  const { dot, label } = states[connection];
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-txt-primary/10 bg-surface-base/60 text-[10px] font-mono font-bold uppercase tracking-widest text-txt-secondary">
      <span className={twMerge("w-1.5 h-1.5 rounded-full shrink-0", dot)} />
      {label}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: ReactNode; tone?: "win" | "loss" | "neutral" }) {
  const border =
    tone === "win"     ? "border-green-500/30" :
    tone === "loss"    ? "border-red-500/30"   :
    tone === "neutral" ? "border-accent/30"    :
                         "border-txt-primary/10";
  const glow =
    tone === "win"  ? "shadow-[0_0_16px_-4px_rgba(34,197,94,0.25)]" :
    tone === "loss" ? "shadow-[0_0_16px_-4px_rgba(244,63,94,0.25)]" : "";
  return (
    <div className={twMerge("bg-surface-card/60 border rounded-xl p-3 backdrop-blur-sm", border, glow)}>
      <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-txt-muted mb-1.5">{label}</p>
      <p className="text-3xl font-mono font-bold text-txt-primary leading-none">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-mono uppercase tracking-widest text-txt-muted">{label}</span>
      <span className="text-xl font-mono font-bold text-txt-primary leading-none">{value}</span>
    </div>
  );
}

function StatsApiCard() {
  const [status, setStatus] = useState<StatsApiConfigStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [manualPath, setManualPath] = useState("");
  const [showPath, setShowPath] = useState(false);

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
    try {
      const res = await fetch(`${API_BASE}/api/stats-api-config/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(manualPath.trim() ? { path: manualPath.trim() } : {}),
      });
      if (res.ok) setStatus((await res.json()) as StatsApiConfigStatus);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-surface-card/60 border border-txt-primary/10 rounded-xl p-3 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-txt-muted shrink-0">Stats API</p>
          {status ? (
            <span className={twMerge(
              "text-[9px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-full",
              status.enabled
                ? "bg-green-500/15 text-green-400"
                : !status.found
                  ? "bg-yellow-500/15 text-yellow-400"
                  : "bg-red-500/15 text-red-400",
            )}>
              {status.enabled ? `Enabled · ${status.packetSendRate}/s` : !status.found ? "Not found" : "Disabled"}
            </span>
          ) : (
            <span className="text-[9px] text-txt-muted font-mono">checking…</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {status && !status.found && (
            <button
              onClick={() => setShowPath((v) => !v)}
              className="px-2 py-1 rounded-lg border border-txt-primary/10 bg-txt-primary/5 text-[10px] font-mono text-txt-muted hover:text-txt-primary transition-all"
            >
              Set path
            </button>
          )}
          {status?.found && (
            status.enabled ? (
              <button disabled={loading} onClick={() => void toggle("disable")}
                className="px-2.5 py-1 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-[10px] font-mono font-bold disabled:opacity-40 hover:bg-red-500/20 transition-all">
                {loading ? "…" : "Disable"}
              </button>
            ) : (
              <button disabled={loading} onClick={() => void toggle("enable")}
                className="px-2.5 py-1 rounded-lg border border-green-500/30 bg-green-500/10 text-green-300 text-[10px] font-mono font-bold disabled:opacity-40 hover:bg-green-500/20 transition-all">
                {loading ? "…" : "Enable"}
              </button>
            )
          )}
        </div>
      </div>
      {showPath && (
        <div className="flex gap-2 mt-2.5">
          <input
            className="flex-1 bg-surface-base/60 border border-txt-primary/15 rounded-lg px-2.5 py-1.5 text-xs font-mono text-txt-primary placeholder:text-txt-muted focus:outline-none focus:border-accent/50 transition-all"
            placeholder="Rocket League install folder path…"
            value={manualPath}
            onChange={(e) => setManualPath(e.currentTarget.value)}
          />
          <button onClick={() => void refresh()}
            className="px-3 py-1.5 rounded-lg border border-txt-primary/15 bg-txt-primary/5 text-txt-secondary text-xs font-semibold hover:text-txt-primary transition-all">
            Check
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function SessionView({ snapshot }: { snapshot: SessionSnapshot }) {
  const sortedPlayers = useMemo(
    () => [...snapshot.currentMatch.players].sort((a, b) => a.team - b.team || b.score - a.score),
    [snapshot.currentMatch.players],
  );
  const [blue, orange] = snapshot.currentMatch.teams;
  const { streak } = snapshot.totals;
  const streakLabel = streak > 0 ? `W${streak}` : streak < 0 ? `L${Math.abs(streak)}` : "–";
  const streakTone: "win" | "loss" | "neutral" = streak > 0 ? "win" : streak < 0 ? "loss" : "neutral";
  const winRate = snapshot.totals.games > 0
    ? Math.round((snapshot.totals.wins / snapshot.totals.games) * 100)
    : null;

  const [togglingNetwork, setTogglingNetwork] = useState(false);

  const hasHistory = snapshot.matchHistory.length > 0;
  const chartData  = useMemo(() => hasHistory ? buildChartData(snapshot.matchHistory) : [], [snapshot.matchHistory, hasHistory]);
  const perfData   = useMemo(() => hasHistory ? buildPerfData(snapshot.matchHistory, snapshot.trackedPlayer?.id) : [], [snapshot.matchHistory, snapshot.trackedPlayer, hasHistory]);

  const hasPersonalStats = snapshot.totals.goals + snapshot.totals.assists + snapshot.totals.saves + snapshot.totals.shots + snapshot.totals.demos > 0;
  const hasPerfData = perfData.length > 0 && perfData.some(d => d.goals + d.assists + d.saves > 0);

  const axisProps = { fontSize: 9, fill: "#71717a", fontFamily: "JetBrains Mono, monospace" };
  const gridProps = { strokeDasharray: "3 3" as const, stroke: "rgba(255,255,255,0.05)", vertical: false };
  const cursorProps = { stroke: "rgba(255,255,255,0.07)", strokeWidth: 1 };

  const headerAction = (
    <div className="flex items-center gap-2">
      <ConnectionBadge connection={snapshot.connection} />
      <button
        disabled={togglingNetwork}
        onClick={async () => {
          setTogglingNetwork(true);
          try { await postJson("/api/network-access", { allowDualPC: !snapshot.allowDualPC }); }
          catch (err) { console.error(err); }
          finally { setTogglingNetwork(false); }
        }}
        className={twMerge(
          "flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-mono font-bold uppercase tracking-widest transition-all disabled:opacity-40",
          snapshot.allowDualPC
            ? "border-accent/30 bg-accent/10 text-accent hover:bg-accent/20"
            : "border-txt-primary/10 bg-surface-base/60 text-txt-muted hover:text-txt-primary hover:border-txt-primary/30",
        )}
      >
        <Network size={10} />
        Dual PC
      </button>
      <button
        onClick={() => void postJson("/api/session/reset")}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-txt-primary/10 bg-surface-base/60 text-[10px] font-mono font-bold uppercase tracking-widest text-txt-muted hover:text-txt-primary hover:border-txt-primary/30 transition-all"
      >
        <RotateCcw size={10} />
        Reset
      </button>
    </div>
  );

  return (
    <ViewShell
      title="Session"
      subtitle={snapshot.connectionMessage}
      icon={BarChart2}
      headerAction={headerAction}
    >
      {/* Stats API */}
      <StatsApiCard />

      {/* W / L / Streak / Games */}
      <div className="grid grid-cols-4 gap-2">
        <StatCard label="Wins"   value={snapshot.totals.wins}   tone="win" />
        <StatCard label="Losses" value={snapshot.totals.losses} tone="loss" />
        <StatCard label="Streak" value={streakLabel}            tone={streakTone} />
        <StatCard label="Games"  value={snapshot.totals.games} />
      </div>

      {/* Personal stat totals */}
      {hasPersonalStats && (
        <div className="bg-surface-card/60 border border-txt-primary/10 rounded-xl p-3 backdrop-blur-sm">
          <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-txt-muted mb-3">
            Session Stats{winRate !== null ? ` · ${winRate}% Win Rate` : ""}
          </p>
          <div className="grid grid-cols-4 gap-x-4 gap-y-4">
            <MiniStat label="Goals"       value={snapshot.totals.goals} />
            <MiniStat label="Assists"     value={snapshot.totals.assists} />
            <MiniStat label="Saves"       value={snapshot.totals.saves} />
            <MiniStat label="Shots"       value={snapshot.totals.shots} />
            <MiniStat label="Demos"       value={snapshot.totals.demos} />
            <MiniStat label="Ball Hits"   value={snapshot.totals.ballHits} />
            <MiniStat label="Hardest Hit" value={snapshot.totals.strongestHit} />
          </div>
        </div>
      )}

      {/* Current match */}
      <div className="bg-surface-card/60 border border-txt-primary/10 rounded-xl p-3 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-txt-muted">Current Match</p>
          <div className="flex items-center gap-2 text-xs font-bold font-mono">
            <span style={{ color: blue.color }}>{blue.name}</span>
            <span className="text-lg text-txt-primary">{blue.score}</span>
            <span className="text-txt-muted text-[10px] px-1">
              {snapshot.currentMatch.isOT ? "+" : ""}
              {String(Math.floor(snapshot.currentMatch.timeSeconds / 60)).padStart(2, "0")}:
              {String(Math.floor(snapshot.currentMatch.timeSeconds % 60)).padStart(2, "0")}
            </span>
            <span className="text-lg text-txt-primary">{orange.score}</span>
            <span style={{ color: orange.color }}>{orange.name}</span>
          </div>
        </div>
        <div className="space-y-1">
          {sortedPlayers.length === 0 ? (
            <div className="border border-dashed border-txt-primary/10 rounded-lg p-3 text-center text-txt-muted text-xs">
              Waiting for match data…
            </div>
          ) : (
            sortedPlayers.map((player) => (
              <button
                key={player.id}
                onClick={() => void postJson("/api/tracked-player", { id: player.id })}
                className={twMerge(
                  "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-all text-left",
                  snapshot.trackedPlayer?.id === player.id
                    ? "border-accent/50 bg-accent/10 text-txt-primary"
                    : "border-txt-primary/[0.08] bg-txt-primary/[0.02] text-txt-secondary hover:border-accent/30 hover:bg-accent/5 hover:text-txt-primary",
                )}
              >
                <span className={twMerge(
                  "text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full shrink-0",
                  player.team === 0 ? "bg-blue-500/20 text-blue-300" : "bg-orange-500/20 text-orange-300",
                )}>
                  {player.team === 0 ? "Blue" : "Org"}
                </span>
                <span className="font-semibold flex-1 truncate">{player.name}</span>
                <span className="font-mono text-txt-muted">{player.score}pts</span>
                <span className="font-mono text-txt-muted">{player.goals}G</span>
                <span className="font-mono text-txt-muted">{player.saves}S</span>
                <span className="font-mono text-txt-muted">{player.shots}SH</span>
                {player.boost != null && <span className="font-mono text-txt-muted">{player.boost}%</span>}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Charts — only once there's history */}
      {hasHistory && (
        <>
          {/* Win Rate — area chart */}
          <ChartSection title="Win Rate">
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={chartData} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="rssWinRateGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={WINRATE_COLOR} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={WINRATE_COLOR} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" tick={axisProps} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={axisProps} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<ChartTooltip />} cursor={cursorProps} />
                <ReferenceLine y={50} stroke="rgba(255,255,255,0.12)" strokeDasharray="5 5" />
                <Area
                  type="monotone"
                  dataKey="winRate"
                  name="Win Rate"
                  stroke={WINRATE_COLOR}
                  strokeWidth={2}
                  fill="url(#rssWinRateGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: WINRATE_COLOR, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartSection>

          {/* Per-game stats — line chart (only when tracked player has data) */}
          {hasPerfData && (
            <ChartSection
              title="Per-Game Stats"
              legend={
                <MiniLegend items={[
                  { color: WIN_COLOR,     label: "Goals"   },
                  { color: WINRATE_COLOR, label: "Assists" },
                  { color: SAVES_COLOR,   label: "Saves"   },
                ]} />
              }
            >
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={perfData} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="label" tick={axisProps} axisLine={false} tickLine={false} />
                  <YAxis tick={axisProps} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} cursor={cursorProps} />
                  <Line type="monotone" dataKey="goals"   name="Goals"   stroke={WIN_COLOR}     strokeWidth={2} dot={false} activeDot={{ r: 3, fill: WIN_COLOR,     strokeWidth: 0 }} />
                  <Line type="monotone" dataKey="assists" name="Assists" stroke={WINRATE_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 3, fill: WINRATE_COLOR, strokeWidth: 0 }} />
                  <Line type="monotone" dataKey="saves"   name="Saves"   stroke={SAVES_COLOR}   strokeWidth={2} dot={false} activeDot={{ r: 3, fill: SAVES_COLOR,   strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartSection>
          )}

          {/* Streak — line chart (much cleaner than bar chart) */}
          <ChartSection title="Streak Timeline">
            <ResponsiveContainer width="100%" height={130}>
              <LineChart data={chartData} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" tick={axisProps} axisLine={false} tickLine={false} />
                <YAxis tick={axisProps} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={cursorProps} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" strokeDasharray="5 5" />
                <Line
                  type="monotone"
                  dataKey="streak"
                  name="Streak"
                  stroke={WINRATE_COLOR}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, fill: WINRATE_COLOR, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartSection>

          {/* Score differential — bar chart */}
          <ChartSection title="Score Differential">
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={chartData} margin={{ top: 6, right: 8, left: -20, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" tick={axisProps} axisLine={false} tickLine={false} />
                <YAxis tick={axisProps} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
                <Bar dataKey="scoreDiff" name="Score Diff" radius={[3, 3, 0, 0]}>
                  {chartData.map((pt, i) => (
                    <Cell
                      key={i}
                      fill={pt.result === "win" ? WIN_COLOR : pt.result === "loss" ? LOSS_COLOR : NEUTRAL_COLOR}
                      fillOpacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>
        </>
      )}
    </ViewShell>
  );
}
