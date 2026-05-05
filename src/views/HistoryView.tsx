import { useState, useMemo } from "react";
import { History, ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { postJson } from "../lib/api";
import { twMerge } from "tailwind-merge";
import { ViewShell } from "../components/ViewShell";
import type { SessionSnapshot, HistoricalMatch, SessionPlayer } from "../types";

function timeAgo(dateString: string) {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function PlayerRow({
  player,
  teamColor,
  teamLabel,
  isActive,
  onClick,
}: {
  player: SessionPlayer;
  teamColor: string;
  teamLabel: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <div>
      <button
        onClick={onClick}
        className={twMerge(
          "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs transition-all text-left",
          isActive
            ? "border-accent/40 bg-accent/10 text-txt-primary"
            : "border-txt-primary/[0.08] bg-txt-primary/[0.02] text-txt-secondary hover:border-txt-primary/20 hover:bg-surface-base/40 hover:text-txt-primary",
        )}
      >
        <span
          className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest"
          style={{ backgroundColor: `${teamColor}25`, color: teamColor }}
        >
          {teamLabel}
        </span>
        <span className="flex-1 font-semibold truncate">{player.name}</span>
        <span className="font-mono text-txt-muted shrink-0">{player.score}pts</span>
        <ChevronDown
          size={11}
          className={twMerge(
            "shrink-0 text-txt-muted transition-transform",
            isActive && "rotate-180",
          )}
        />
      </button>

      {isActive && (
        <div className="mx-1 mb-1.5 mt-0.5 grid grid-cols-6 gap-x-2 gap-y-1.5 rounded-lg bg-surface-base/50 border border-txt-primary/[0.06] px-3 py-2.5">
          {([
            ["Goals",   player.goals],
            ["Assists", player.assists],
            ["Saves",   player.saves],
            ["Shots",   player.shots],
            ["Demos",   player.demos],
            ["Touches", player.touches],
          ] as [string, number][]).map(([label, val]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <span className="text-[8px] font-mono font-bold uppercase tracking-widest text-txt-muted">{label}</span>
              <span className="text-base font-mono font-bold text-txt-primary leading-none">{val}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryCard({ match }: { match: HistoricalMatch }) {
  const [expanded, setExpanded] = useState(false);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);

  const [blue, orange] = match.teams;
  const sortedPlayers = useMemo(
    () => [...match.players].sort((a, b) => a.team - b.team || b.score - a.score),
    [match.players],
  );

  const resultClass =
    match.result === "win"  ? "bg-green-500/15 text-green-400 border-green-500/30" :
    match.result === "loss" ? "bg-red-500/15 text-red-400 border-red-500/30" :
                              "bg-txt-muted/15 text-txt-muted border-txt-muted/30";

  function togglePlayer(id: string) {
    setActivePlayerId((prev) => (prev === id ? null : id));
  }

  function toggleExpand() {
    setExpanded((v) => !v);
    if (expanded) setActivePlayerId(null);
  }

  return (
    <div className={twMerge(
      "bg-surface-card/60 border rounded-xl overflow-hidden backdrop-blur-sm transition-all",
      expanded ? "border-txt-primary/20" : "border-txt-primary/10 hover:border-txt-primary/20",
    )}>
      <button
        onClick={toggleExpand}
        className="w-full flex items-center justify-between p-3 outline-none hover:bg-surface-base/40 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={twMerge("shrink-0 text-[9px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-lg border", resultClass)}>
            {match.result === "unknown" || match.result === "neutral" ? "–" : match.result}
          </span>
          <div className="flex items-center gap-2 text-sm font-bold font-mono min-w-0">
            <span className="truncate" style={{ color: blue.color }}>{blue.name}</span>
            <span className="text-txt-primary shrink-0">{blue.score}</span>
            <span className="text-txt-muted text-[10px] shrink-0">–</span>
            <span className="text-txt-primary shrink-0">{orange.score}</span>
            <span className="truncate" style={{ color: orange.color }}>{orange.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-txt-muted shrink-0 ml-2">
          <span className="text-[9px] font-mono uppercase tracking-widest">{timeAgo(match.endedAt)}</span>
          <ChevronRight size={13} className={twMerge("transition-transform", expanded && "rotate-90")} />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-txt-primary/5 px-2 pb-2 pt-1.5 space-y-1">
          {sortedPlayers.length === 0 ? (
            <p className="text-xs text-txt-muted text-center py-4">No player data for this match.</p>
          ) : (
            sortedPlayers.map((player) => (
              <PlayerRow
                key={player.id}
                player={player}
                teamColor={player.team === 0 ? blue.color : orange.color}
                teamLabel={player.team === 0 ? "Blue" : "Org"}
                isActive={activePlayerId === player.id}
                onClick={() => togglePlayer(player.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function HistoryView({ snapshot }: { snapshot: SessionSnapshot }) {
  const count = snapshot.matchHistory.length;
  const [clearing, setClearing] = useState(false);

  const headerAction = count > 0 ? (
    <button
      disabled={clearing}
      onClick={async () => {
        setClearing(true);
        try { await postJson("/api/session/reset-history"); }
        finally { setClearing(false); }
      }}
      className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-txt-primary/10 bg-surface-base/60 text-[10px] font-mono font-bold uppercase tracking-widest text-txt-muted hover:text-destructive hover:border-destructive/30 transition-all disabled:opacity-40"
    >
      <RotateCcw size={10} />
      Clear
    </button>
  ) : undefined;

  return (
    <ViewShell
      title="History"
      subtitle={count > 0 ? `${count} match${count === 1 ? "" : "es"} this session` : "Past matches from this session."}
      icon={History}
      headerAction={headerAction}
    >
      <div className="space-y-2">
        {count === 0 ? (
          <div className="border border-dashed border-txt-primary/10 rounded-xl p-8 text-center text-txt-muted text-xs">
            No matches recorded yet this session.
          </div>
        ) : (
          snapshot.matchHistory.map((match) => (
            <HistoryCard key={match.id} match={match} />
          ))
        )}
      </div>
    </ViewShell>
  );
}
