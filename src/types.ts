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
  rocketLeagueRunning: boolean;
  error: string | null;
};

export type SessionSnapshot = {
  app: "rocket-session-stats";
  connection: ConnectionState;
  connectionMessage: string;
  statsApiAddress: string;
  lastEventAt: string | null;
  trackedPlayer: TrackedPlayer;
  currentMatch: CurrentMatch;
  totals: SessionTotals;
  lastMatch: LastMatch;
  rawEventCounts: Record<string, number>;
};
