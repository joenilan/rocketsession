import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { SessionSnapshot, StatsApiConfigStatus } from "./types";
import "./styles.css";

const API_BASE = import.meta.env.VITE_SESSION_API_URL ?? "";

const initialSnapshot: SessionSnapshot = {
  app: "rocket-session-stats",
  connection: "connecting",
  connectionMessage: "Connecting...",
  statsApiAddress: "127.0.0.1:49123",
  lastEventAt: null,
  trackedPlayer: null,
  currentMatch: {
    active: false,
    context: "unknown",
    timeSeconds: 0,
    isOT: false,
    teams: [
      { name: "Blue", score: 0, color: "#0074ff" },
      { name: "Orange", score: 0, color: "#ff8b00" },
    ],
    players: [],
    trackedTeam: null,
  },
  totals: {
    games: 0,
    wins: 0,
    losses: 0,
    unknownResults: 0,
    streak: 0,
    goals: 0,
    assists: 0,
    saves: 0,
    shots: 0,
    demos: 0,
    touches: 0,
    ballHits: 0,
    strongestHit: 0,
  },
  lastMatch: null,
  rawEventCounts: {},
};

function formatClock(seconds: number, isOT: boolean) {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60).toString().padStart(2, "0");
  const secs = Math.floor(safe % 60).toString().padStart(2, "0");
  return `${isOT ? "+" : ""}${mins}:${secs}`;
}

function connectionLabel(connection: SessionSnapshot["connection"]) {
  switch (connection) {
    case "connected":
      return "Connected";
    case "error":
      return "Error";
    case "disconnected":
      return "Disconnected";
    default:
      return "Connecting";
  }
}

function useSessionSnapshot() {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(initialSnapshot);

  useEffect(() => {
    fetch(`${API_BASE}/api/session`)
      .then((res) => res.json())
      .then(setSnapshot)
      .catch(() => undefined);

    const source = new EventSource(`${API_BASE}/api/events`);
    source.onmessage = (event) => {
      setSnapshot(JSON.parse(event.data) as SessionSnapshot);
    };
    source.onerror = () => {
      setSnapshot((prev) => ({
        ...prev,
        connection: "disconnected",
        connectionMessage: "Lost connection to Rocket Session Stats service.",
      }));
    };
    return () => source.close();
  }, []);

  return snapshot;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

async function postJson(path: string, body?: unknown) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
}

function StatTile({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "win" | "loss" | "neutral" }) {
  return (
    <div className={`stat-tile ${tone ? `stat-tile-${tone}` : ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function OverlayView({ snapshot }: { snapshot: SessionSnapshot }) {
  const streakLabel =
    snapshot.totals.streak > 0
      ? `W${snapshot.totals.streak}`
      : snapshot.totals.streak < 0
        ? `L${Math.abs(snapshot.totals.streak)}`
        : "0";

  return (
    <main className="overlay-shell">
      <section className="overlay-card">
        <div className="overlay-topline">
          <span>{snapshot.trackedPlayer?.name ?? "Select Player"}</span>
          <span>{connectionLabel(snapshot.connection)}</span>
        </div>
        <div className="overlay-grid">
          <StatTile label="Wins" value={snapshot.totals.wins} tone="win" />
          <StatTile label="Losses" value={snapshot.totals.losses} tone="loss" />
          <StatTile label="Streak" value={streakLabel} tone="neutral" />
          <StatTile label="Games" value={snapshot.totals.games} />
        </div>
      </section>
    </main>
  );
}

function SetupSection() {
  const [status, setStatus] = useState<StatsApiConfigStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [manualPath, setManualPath] = useState("");

  const refresh = useCallback(async () => {
    try {
      const params = manualPath.trim() ? `?path=${encodeURIComponent(manualPath.trim())}` : "";
      const s = await getJson<StatsApiConfigStatus>(`/api/stats-api-config${params}`);
      setStatus(s);
    } catch {
      /* network not up yet */
    }
  }, [manualPath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function toggle(action: "enable" | "disable") {
    setLoading(true);
    setFeedback(null);
    try {
      const next = await fetch(`${API_BASE}/api/stats-api-config/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(manualPath.trim() ? { path: manualPath.trim() } : {}),
      });
      const body = (await next.json()) as StatsApiConfigStatus & { error?: string };
      if (!next.ok) {
        setFeedback({ ok: false, message: body.error ?? "Unknown error." });
      } else {
        setStatus(body);
        setFeedback({
          ok: true,
          message:
            action === "enable"
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

  const rlRunning = status?.rocketLeagueRunning ?? false;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Rocket League Setup</h2>
          <p>Enable the official Stats API so Rocket League broadcasts live data to this app.</p>
        </div>
        {status && (
          <div className={`connection-pill connection-${status.enabled ? "connected" : "disconnected"}`}>
            <span className="dot" />
            <span>{status.enabled ? `Enabled · ${status.packetSendRate}/s · port ${status.port}` : "Disabled"}</span>
          </div>
        )}
      </div>

      {status?.error && !status.found && (
        <div className="setup-row">
          <p className="setup-warning">{status.error}</p>
          <div className="path-row">
            <input
              className="path-input"
              placeholder="Paste Rocket League install folder path…"
              value={manualPath}
              onChange={(e) => setManualPath(e.currentTarget.value)}
            />
            <button className="secondary-button" onClick={() => void refresh()}>
              Check
            </button>
          </div>
        </div>
      )}

      {status?.found && (
        <div className="setup-row">
          <p className="setup-path">{status.path}</p>
          {rlRunning && (
            <p className="setup-warning">Close Rocket League before making changes, then restart it to apply.</p>
          )}
          <div className="button-row">
            {status.enabled ? (
              <button
                className="danger-button"
                disabled={loading || rlRunning}
                onClick={() => void toggle("disable")}
              >
                {loading ? "Disabling…" : "Disable Stats API"}
              </button>
            ) : (
              <button
                className="primary-button"
                disabled={loading || rlRunning}
                onClick={() => void toggle("enable")}
              >
                {loading ? "Enabling…" : "Enable Stats API"}
              </button>
            )}
          </div>
        </div>
      )}

      {feedback && (
        <p className={feedback.ok ? "setup-success" : "setup-warning"}>{feedback.message}</p>
      )}
    </section>
  );
}

function ControlView({ snapshot }: { snapshot: SessionSnapshot }) {
  const sortedPlayers = useMemo(
    () => [...snapshot.currentMatch.players].sort((a, b) => a.team - b.team || b.score - a.score),
    [snapshot.currentMatch.players],
  );
  const [blue, orange] = snapshot.currentMatch.teams;

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Rocket Session Stats</p>
          <h1>Session overlay stats without BakkesMod</h1>
          <p className="hero-copy">
            Track wins, losses, streaks, and match stats from Rocket League&apos;s official Stats API.
          </p>
        </div>
        <div className={`connection-pill connection-${snapshot.connection}`}>
          <span className="dot" />
          <span>{connectionLabel(snapshot.connection)}</span>
        </div>
      </header>

      <SetupSection />

      <section className="panel">
        <div className="panel-header">
          <div>
          <h2>Current Match</h2>
            <p>
              {snapshot.currentMatch.context === "freeplay" ? "Freeplay/training data active. " : ""}
              {snapshot.connectionMessage}
            </p>
          </div>
          <div className="scoreline">
            <span style={{ color: blue.color }}>{blue.name}</span>
            <strong>{blue.score}</strong>
            <span className="clock">{formatClock(snapshot.currentMatch.timeSeconds, snapshot.currentMatch.isOT)}</span>
            <strong>{orange.score}</strong>
            <span style={{ color: orange.color }}>{orange.name}</span>
          </div>
        </div>

        <div className="player-list">
          {sortedPlayers.length === 0 ? (
            <div className="empty-state">Waiting for Rocket League match data.</div>
          ) : (
            sortedPlayers.map((player) => (
              <button
                key={player.id}
                className={`player-row ${snapshot.trackedPlayer?.id === player.id ? "selected" : ""}`}
                onClick={() => void postJson("/api/tracked-player", { id: player.id })}
              >
                <span className="team-chip" data-team={player.team}>
                  {player.team === 0 ? "Blue" : "Orange"}
                </span>
                <strong>{player.name}</strong>
                <span>{player.score} pts</span>
                <span>{player.goals}G</span>
                <span>{player.saves}S</span>
                <span>{player.shots}SH</span>
                <span>{player.boost ?? "--"} boost</span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="stats-grid">
        <StatTile label="Wins" value={snapshot.totals.wins} tone="win" />
        <StatTile label="Losses" value={snapshot.totals.losses} tone="loss" />
        <StatTile label="Streak" value={snapshot.totals.streak} tone="neutral" />
        <StatTile label="Games" value={snapshot.totals.games} />
        <StatTile label="Goals" value={snapshot.totals.goals} />
        <StatTile label="Assists" value={snapshot.totals.assists} />
        <StatTile label="Saves" value={snapshot.totals.saves} />
        <StatTile label="Shots" value={snapshot.totals.shots} />
        <StatTile label="Ball Hits" value={snapshot.totals.ballHits} />
        <StatTile label="Hardest Hit" value={snapshot.totals.strongestHit} />
      </section>

      <section className="panel compact">
        <div>
          <h2>OBS</h2>
          <p>Use this as a browser source after the UI is running.</p>
          <code>http://127.0.0.1:49410/?overlay=1</code>
        </div>
        <button className="danger-button" onClick={() => void postJson("/api/session/reset")}>
          Reset Session
        </button>
      </section>
    </main>
  );
}

function App() {
  const snapshot = useSessionSnapshot();
  const overlay = new URLSearchParams(window.location.search).get("overlay") === "1";
  return overlay ? <OverlayView snapshot={snapshot} /> : <ControlView snapshot={snapshot} />;
}

createRoot(document.getElementById("root")!).render(<App />);
