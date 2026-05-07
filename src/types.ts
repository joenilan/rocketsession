export type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

export type TrackedPlayer = {
  id: string;
  name: string;
  team: number;
} | null;

export type SessionPlayer = {
  id: string;
  name: string;
  team: number;
  score: number;
  goals: number;
  assists: number;
  saves: number;
  shots: number;
  demos: number;
  touches: number;
  boost?: number | null;
};

export type SessionTeam = {
  name: string;
  score: number;
  color: string;
};

export type CurrentMatch = {
  active: boolean;
  context: "unknown" | "match" | "freeplay";
  timeSeconds: number;
  isOT: boolean;
  teams: [SessionTeam, SessionTeam];
  players: SessionPlayer[];
  trackedTeam?: number | null;
};

export type SessionTotals = {
  games: number;
  wins: number;
  losses: number;
  unknownResults: number;
  streak: number;
  goals: number;
  assists: number;
  saves: number;
  shots: number;
  demos: number;
  touches: number;
  ballHits: number;
  strongestHit: number;
};

export type LastMatch = {
  result: "win" | "loss" | "unknown";
  winnerTeam: number | null;
  trackedTeam: number | null;
  endedAt: string;
} | null;

export type StatsApiConfigStatus = {
  found: boolean;
  enabled: boolean;
  path: string | null;
  installDir: string | null;
  packetSendRate: number;
  port: number;
  error: string | null;
};

export type HistoricalMatch = {
  id: string;
  endedAt: string;
  result: "win" | "loss" | "neutral" | "unknown";
  teams: [SessionTeam, SessionTeam];
  players: SessionPlayer[];
};

export type OverlaySettings = {
  x: number;
  y: number;
  scale: number;
  opacity: number;
};

export type AppSettings = {
  statsApiPort: number;
  autoSkipReplays: boolean;
  autoSkipDelayMs: number;
};

export type OverlayMode = "stock" | "textCanvas";

export type TextStatKey =
  | "wins"
  | "losses"
  | "games"
  | "streak"
  | "winrate"
  | "goals"
  | "assists"
  | "saves"
  | "shots"
  | "demos"
  | "ballHits"
  | "strongestHit"
  | "trackedPlayer";

export type TextOverlayElement = {
  id: string;
  label: string;
  stat: TextStatKey;
  showLabel: boolean;
  showValue: boolean;
  x: number;
  y: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  align: "left" | "center" | "right";
  opacity: number;
};

export type SessionSnapshot = {
  app: "rocket-session-stats";
  connection: ConnectionState;
  connectionMessage: string;
  statsApiAddress: string;
  allowDualPC: boolean;
  lastEventAt: string | null;
  trackedPlayer: TrackedPlayer;
  currentMatch: CurrentMatch;
  totals: SessionTotals;
  lastMatch: LastMatch;
  matchHistory: HistoricalMatch[];
  rawEventCounts: Record<string, number>;
  overlaySettings: OverlaySettings;
  overlayMode: OverlayMode;
  textOverlayElements: TextOverlayElement[];
};
