import { useRef } from "react";
import { postJson } from "../lib/api";
import type { OverlaySettings } from "../types";

export type { OverlaySettings };

const DEFAULTS: OverlaySettings = { x: 50, y: 50, scale: 100, opacity: 90 };

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export function buildOverlayUrl(baseUrl: string): string {
  return `${baseUrl}/?overlay=1`;
}

// rAF-batched poster — call as many times as you want, only one POST per frame
export function useOverlayPoster() {
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<OverlaySettings | null>(null);

  return function post(settings: OverlaySettings) {
    pendingRef.current = settings;
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (pendingRef.current) {
        void postJson("/api/overlay-settings", pendingRef.current);
        pendingRef.current = null;
      }
    });
  };
}

export { DEFAULTS as OVERLAY_DEFAULTS, clamp as clampOverlay };
