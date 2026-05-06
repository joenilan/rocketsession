import type { SessionSnapshot, TextOverlayElement, TextStatKey } from "../types";

export const TEXT_STAT_OPTIONS: Array<{ key: TextStatKey; label: string; defaultLabel: string }> = [
  { key: "wins", label: "Wins", defaultLabel: "Wins:" },
  { key: "losses", label: "Losses", defaultLabel: "Losses:" },
  { key: "games", label: "Games", defaultLabel: "Games:" },
  { key: "streak", label: "Streak", defaultLabel: "Streak:" },
  { key: "winrate", label: "Win Rate", defaultLabel: "Win Rate:" },
  { key: "goals", label: "Goals", defaultLabel: "Goals:" },
  { key: "assists", label: "Assists", defaultLabel: "Assists:" },
  { key: "saves", label: "Saves", defaultLabel: "Saves:" },
  { key: "shots", label: "Shots", defaultLabel: "Shots:" },
  { key: "demos", label: "Demos", defaultLabel: "Demos:" },
  { key: "ballHits", label: "Ball Hits", defaultLabel: "Ball Hits:" },
  { key: "strongestHit", label: "Hardest Hit", defaultLabel: "Hardest Hit:" },
  { key: "trackedPlayer", label: "Tracked Player", defaultLabel: "Player:" },
];

export const DEFAULT_TEXT_OVERLAY_ELEMENT: TextOverlayElement = {
  id: "wins",
  label: "Wins:",
  stat: "wins",
  showLabel: true,
  showValue: true,
  x: 50,
  y: 50,
  fontFamily: "Rajdhani, Inter, sans-serif",
  fontSize: 72,
  fontWeight: 700,
  color: "#ffffff",
  align: "center",
  opacity: 100,
};

export function formatStreak(streak: number): string {
  if (streak > 0) return `W${streak}`;
  if (streak < 0) return `L${Math.abs(streak)}`;
  return "0";
}

export function formatStat(snapshot: SessionSnapshot, stat: TextStatKey): string {
  const { totals } = snapshot;
  switch (stat) {
    case "wins":
      return String(totals.wins);
    case "losses":
      return String(totals.losses);
    case "games":
      return String(totals.games);
    case "streak":
      return formatStreak(totals.streak);
    case "winrate":
      return totals.games > 0 ? `${Math.round((totals.wins / totals.games) * 100)}%` : "0%";
    case "goals":
      return String(totals.goals);
    case "assists":
      return String(totals.assists);
    case "saves":
      return String(totals.saves);
    case "shots":
      return String(totals.shots);
    case "demos":
      return String(totals.demos);
    case "ballHits":
      return String(totals.ballHits);
    case "strongestHit":
      return String(Math.round(totals.strongestHit));
    case "trackedPlayer":
      return snapshot.trackedPlayer?.name ?? "None";
  }
}

export function renderTextElement(snapshot: SessionSnapshot, element: TextOverlayElement): string {
  const parts = [];
  if (element.showLabel && element.label.trim()) parts.push(element.label.trim());
  if (element.showValue) parts.push(formatStat(snapshot, element.stat));
  return parts.join(" ");
}
