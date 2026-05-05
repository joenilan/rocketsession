import { useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { TrendingUp, RotateCcw } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { ViewShell } from "../components/ViewShell";
import { postJson } from "../lib/api";
import type { SessionSnapshot, HistoricalMatch } from "../types";

const WIN_COLOR = "#22c55e";
const LOSS_COLOR = "#ef4444";
const NEUTRAL_COLOR = "#6b7280";
const WINRATE_COLOR = "#818cf8";

interface ChartPoint {
  game: number;
  label: string;
  result: "win" | "loss" | "unknown";
  winRate: number;
  streak: number;
  scoreDiff: number;
}

function buildChartData(history: HistoricalMatch[]): ChartPoint[] {
  const games = [...history].reverse();
  let wins = 0;
  let streak = 0;

  return games.map((match, i) => {
    const isWin = match.result === "win";
    const isLoss = match.result === "loss";

    if (isWin) {
      wins++;
      streak = streak > 0 ? streak + 1 : 1;
    } else if (isLoss) {
      streak = streak < 0 ? streak - 1 : -1;
    } else {
      streak = 0;
    }

    const [blue, orange] = match.teams;
    const rawDiff = Math.abs(blue.score - orange.score);
    const scoreDiff = isWin ? rawDiff : isLoss ? -rawDiff : 0;

    return {
      game: i + 1,
      label: `G${i + 1}`,
      result: isWin ? "win" : isLoss ? "loss" : "unknown",
      winRate: Math.round((wins / (i + 1)) * 100),
      streak,
      scoreDiff,
    };
  });
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-txt-primary/15 bg-surface-card px-3 py-2 shadow-xl text-xs space-y-0.5">
      <p className="font-bold text-txt-primary mb-1 font-mono">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="tabular-nums font-mono">
          {p.name}: {typeof p.value === "number" && p.value > 0 && p.name !== "Win Rate" ? "+" : ""}{p.value}{p.name === "Win Rate" ? "%" : ""}
        </p>
      ))}
    </div>
  );
}

function StatTile({
  label, value, sub, tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "win" | "loss" | "neutral";
}) {
  const borderColor =
    tone === "win"     ? "border-green-500/30" :
    tone === "loss"    ? "border-red-500/30" :
    tone === "neutral" ? "border-accent/30" :
                         "border-txt-primary/10";
  return (
    <div className={twMerge("bg-surface-card/60 border rounded-xl p-3 backdrop-blur-sm", borderColor)}>
      <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-txt-muted mb-1">{label}</p>
      <p className="text-2xl font-mono font-bold text-txt-primary leading-none">{value}</p>
      {sub && <p className="text-[9px] font-mono text-txt-muted mt-1">{sub}</p>}
    </div>
  );
}

function ChartSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-card/60 border border-txt-primary/10 rounded-xl p-3 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
      <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-txt-muted mb-3">{title}</p>
      {children}
    </div>
  );
}

export function TrackerView({ snapshot }: { snapshot: SessionSnapshot }) {
  const [resetBusy, setResetBusy] = useState(false);
  const [clearHistoryBusy, setClearHistoryBusy] = useState(false);

  const history = snapshot.matchHistory;
  const totals = snapshot.totals;
  const hasData = history.length > 0;
  const chartData = hasData ? buildChartData(history) : [];

  const streakLabel = totals.streak > 0 ? `W${totals.streak}` : totals.streak < 0 ? `L${Math.abs(totals.streak)}` : "–";
  const streakTone: "win" | "loss" | "neutral" = totals.streak > 0 ? "win" : totals.streak < 0 ? "loss" : "neutral";
  const winRate = totals.games > 0 ? `${Math.round((totals.wins / totals.games) * 100)}%` : "–";

  const hasPersonalStats = totals.goals + totals.assists + totals.saves + totals.shots + totals.demos > 0;

  const headerAction = (
    <div className="flex items-center gap-1">
      <button
        disabled={resetBusy}
        onClick={async () => {
          setResetBusy(true);
          try { await postJson("/api/session/reset"); }
          finally { setResetBusy(false); }
        }}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-txt-primary/10 bg-surface-base/60 text-[10px] font-mono font-bold uppercase tracking-widest text-txt-muted hover:text-txt-primary hover:border-txt-primary/30 transition-all disabled:opacity-40"
        title="Reset session stats only"
      >
        <RotateCcw size={10} />
        Reset Stats
      </button>
      <button
        disabled={clearHistoryBusy}
        onClick={async () => {
          setClearHistoryBusy(true);
          try { await postJson("/api/session/reset-history"); }
          finally { setClearHistoryBusy(false); }
        }}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-txt-primary/10 bg-surface-base/60 text-[10px] font-mono font-bold uppercase tracking-widest text-txt-muted hover:text-destructive hover:border-destructive/30 transition-all disabled:opacity-40"
        title="Clear match history"
      >
        <RotateCcw size={10} />
        Clear History
      </button>
    </div>
  );

  return (
    <ViewShell
      title="Tracker"
      subtitle="Your session performance and trends"
      icon={TrendingUp}
      headerAction={headerAction}
    >
      {!hasData && (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
          <TrendingUp size={28} className="text-txt-muted opacity-30" />
          <p className="text-sm text-txt-muted">No games recorded yet.</p>
          <p className="text-xs text-txt-muted opacity-60">Play a game to see your performance trends.</p>
        </div>
      )}

      {hasData && (
        <>
          {/* W / L / Streak / Win Rate */}
          <div className="grid grid-cols-4 gap-2">
            <StatTile label="Games"  value={totals.games} />
            <StatTile label="Wins"   value={totals.wins}    sub={winRate}   tone="win" />
            <StatTile label="Losses" value={totals.losses}                  tone="loss" />
            <StatTile label="Streak" value={streakLabel}                    tone={streakTone} />
          </div>

          {/* Cumulative personal stats (only when tracking a player) */}
          {hasPersonalStats && (
            <div className="grid grid-cols-5 gap-2">
              <StatTile label="Goals"   value={totals.goals} />
              <StatTile label="Assists" value={totals.assists} />
              <StatTile label="Saves"   value={totals.saves} />
              <StatTile label="Shots"   value={totals.shots} />
              <StatTile label="Demos"   value={totals.demos} />
            </div>
          )}

          {/* Win Rate Trend */}
          <ChartSection title="Win Rate Trend">
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="rssWinRateGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={WINRATE_COLOR} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={WINRATE_COLOR} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#6b7280" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#6b7280" }} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={50} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
                <Area
                  type="monotone"
                  dataKey="winRate"
                  name="Win Rate"
                  stroke={WINRATE_COLOR}
                  strokeWidth={2}
                  fill="url(#rssWinRateGrad)"
                  dot={false}
                  activeDot={{ r: 3, fill: WINRATE_COLOR }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartSection>

          {/* Score Differential */}
          <ChartSection title="Score Differential">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#6b7280" }} />
                <YAxis tick={{ fontSize: 9, fill: "#6b7280" }} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                <Bar dataKey="scoreDiff" name="Score Diff" radius={[3, 3, 0, 0]}>
                  {chartData.map((pt, i) => (
                    <Cell
                      key={i}
                      fill={pt.result === "win" ? WIN_COLOR : pt.result === "loss" ? LOSS_COLOR : NEUTRAL_COLOR}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>

          {/* Streak Timeline */}
          <ChartSection title="Streak Timeline">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#6b7280" }} />
                <YAxis tick={{ fontSize: 9, fill: "#6b7280" }} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                <Bar dataKey="streak" name="Streak" radius={[3, 3, 0, 0]}>
                  {chartData.map((pt, i) => (
                    <Cell
                      key={i}
                      fill={pt.streak > 0 ? WIN_COLOR : pt.streak < 0 ? LOSS_COLOR : NEUTRAL_COLOR}
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
