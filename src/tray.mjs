import SysTray from "systray";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

const SESSION_URL = "http://127.0.0.1:49410";

// Must match systray@1.0.5's internal cache path logic
const SYSTRAY_CACHE_VERSION = "1.0.5";
const TRAY_BIN_NAME = "tray_windows_release.exe";

const IDX_STATUS = 0;
const IDX_OPEN = 2;
const IDX_RESET = 3;
const IDX_QUIT = 5;

function formatStatus(totals) {
  const streak =
    totals.streak > 0
      ? `W${totals.streak}`
      : totals.streak < 0
        ? `L${Math.abs(totals.streak)}`
        : "-";
  return `W: ${totals.wins}   L: ${totals.losses}   Streak: ${streak}`;
}

// In compiled binary mode, node_modules won't exist so systray can't find its
// tray_windows_release.exe. We bundle it alongside our exe and pre-populate
// systray's expected cache location so the package finds it on first run.
function ensureTrayBinary(root) {
  const cacheDir = join(homedir(), ".cache", "node-systray", SYSTRAY_CACHE_VERSION);
  const cacheBin = join(cacheDir, TRAY_BIN_NAME);
  if (!existsSync(cacheBin)) {
    const bundled = join(root, TRAY_BIN_NAME);
    if (existsSync(bundled)) {
      mkdirSync(cacheDir, { recursive: true });
      copyFileSync(bundled, cacheBin);
    }
  }
}

export function initTray({ root, initialTotals, onReset, onQuit }) {
  if (process.platform !== "win32") return null;

  try {
    ensureTrayBinary(root);

    const tray = new SysTray({
      menu: {
        icon: "",
        title: "Rocket Session",
        tooltip: "Rocket Session Stats",
        items: [
          {
            title: formatStatus(initialTotals),
            tooltip: "Session stats",
            checked: false,
            enabled: false,
          },
          { title: "──────────────", tooltip: "", checked: false, enabled: false },
          {
            title: "Open Control Panel",
            tooltip: SESSION_URL,
            checked: false,
            enabled: true,
          },
          {
            title: "Reset Session",
            tooltip: "Reset all session data",
            checked: false,
            enabled: true,
          },
          { title: "──────────────", tooltip: "", checked: false, enabled: false },
          {
            title: "Quit",
            tooltip: "Stop server and quit",
            checked: false,
            enabled: true,
          },
        ],
      },
      debug: false,
      copyDir: true,
    });

    tray.onClick((action) => {
      if (!action.item.enabled) return;
      switch (action.seq_id) {
        case IDX_OPEN:
          try { execSync(`cmd /c start "" "${SESSION_URL}"`); } catch { /* ignore */ }
          break;
        case IDX_RESET:
          onReset();
          break;
        case IDX_QUIT:
          tray.kill(false);
          onQuit();
          break;
      }
    });

    tray.onError((err) => {
      console.error("[tray] error:", err.message ?? err);
    });

    console.log("[tray] System tray icon active.");
    return {
      update(totals) {
        try {
          tray.sendAction({
            type: "update-item",
            item: {
              title: formatStatus(totals),
              tooltip: "Session stats",
              checked: false,
              enabled: false,
            },
            seq_id: IDX_STATUS,
          });
        } catch { /* tray process may have exited */ }
      },
      kill() {
        try { tray.kill(false); } catch { /* ignore */ }
      },
    };
  } catch (err) {
    console.warn("[tray] Could not initialize system tray:", err?.message ?? err);
    return null;
  }
}
