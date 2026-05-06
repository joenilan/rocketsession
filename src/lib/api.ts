import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { SessionSnapshot } from "../types";
import { DEFAULT_TEXT_OVERLAY_ELEMENT } from "./stats";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// Browser sources (OBS, 2nd PC) load directly from Axum and use relative URLs.
// The Tauri window uses Tauri IPC (invoke/listen) — no HTTP needed.
// For any remaining HTTP calls from the Tauri window, use the absolute address.
export const API_BASE: string =
  import.meta.env.VITE_SESSION_API_URL ||
  (isTauri ? "http://localhost:49410" : "");

const initialSnapshot: SessionSnapshot = {
  app: "rocket-session-stats",
  connection: "connecting",
  connectionMessage: "Connecting...",
  statsApiAddress: "127.0.0.1:49123",
  allowDualPC: false,
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
  matchHistory: [],
  rawEventCounts: {},
  overlaySettings: { x: 50, y: 50, scale: 100, opacity: 90 },
  overlayMode: "stock",
  textOverlayElements: [DEFAULT_TEXT_OVERLAY_ELEMENT],
};

export function useSessionSnapshot() {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(initialSnapshot);

  useEffect(() => {
    if (isTauri) {
      // Tauri window: use IPC — invoke for initial load, listen for live updates
      invoke<SessionSnapshot>("cmd_get_session").then(setSnapshot).catch(() => undefined);

      let active = true;
      let unlisten: (() => void) | null = null;
      listen<SessionSnapshot>("session:state", (e) => setSnapshot(e.payload)).then((fn) => {
        if (active) {
          unlisten = fn;
        } else {
          fn(); // already unmounted, clean up immediately
        }
      });
      return () => {
        active = false;
        unlisten?.();
      };
    }

    // Browser (OBS / 2nd PC): SSE
    fetch(`${API_BASE}/api/session`)
      .then((res) => res.json())
      .then(setSnapshot)
      .catch(() => undefined);

    const source = new EventSource(`${API_BASE}/api/events`);
    source.onmessage = (event) => {
      try {
        setSnapshot(JSON.parse(event.data) as SessionSnapshot);
      } catch {
        // ignore non-JSON keep-alive frames
      }
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

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export async function postJson(path: string, body?: unknown) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(await res.text());
}
