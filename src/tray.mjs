import { createRequire } from "node:module";
import { existsSync, mkdirSync, copyFileSync, appendFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

const SESSION_URL = "http://127.0.0.1:49410";
const LOG_FILE = join(homedir(), "rocket-session-tray.log");

const ICON_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAIDSURBVFhH7Za/S0JRFMf9D9pUxEQkxSyagoiIQAiKKIggGoJqiQiKQBoc2toaHNpahBYb+w/Epa3RrUXaampU0xNfQbvvnPvjvVfU4oXP4vPc+7nnnnvei0zECvSfRPgPf81YILRAcSZH63NZD/w/fggkgEXvt1P0dhandikq+LiI0sNOkvbmp0SsCV8C2XSeHneTYkEb9f0kLU3nxFwcpwB2/Xqq37ELZORwwZ4NqwDOdThZt0nO0a9vCQlgkzAKzGbynp37ERiMZlkIIBOm4zAK8DP3LUAt+qzILDwfJcQaRgE19VKgQV1Nmjv11kjBdBTHixmxllYAV4kHuwTalSr1HQJPBzILQiCWKAzOjAe7BNQM9Gry+RDUllUA144HeQVcQy84hN8IIYAuxoOCCNh2Dy5XvHUgBM6XMyLILaCvfB3Xq2m7AFLEg7wCSoqVwsNw7R5cFR0CuitoFBAS7kzwqygEUpN5EWQVALXGSIHeq9ThzxV4RxQCAG8yHmgVYDVi6gMvJ3GxllZAV4gugXapTL1vB2093Kx5z98oANC7+QQ/AS82NDm+jlHAVIxh4cXnFABoGnyiMNxupMTcvgQA7i2fMAh3m+bFfQkAHEfQzzJ8uKKY+VwcXwIABYRs4CrxxVQgipSjn/A5dPgWUEEzgQz6ugrepPy/LkIJ/CZjgS9txfPkHRHLFwAAAABJRU5ErkJggg==";

// Must match systray@1.0.5's internal cache path logic
const SYSTRAY_CACHE_VERSION = "1.0.5";
const TRAY_BIN_NAME = "tray_windows_release.exe";

const IDX_STATUS = 0;
const IDX_OPEN = 2;
const IDX_RESET = 3;
const IDX_QUIT = 5;

function trayLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { appendFileSync(LOG_FILE, line); } catch { /* ignore */ }
  console.log("[tray]", msg);
}

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
      trayLog(`Copied tray binary from ${bundled}`);
    } else {
      trayLog(`No bundled tray binary at ${bundled} — relying on node_modules path`);
    }
  }
}

export function initTray({ root, initialTotals, onReset, onQuit }) {
  if (process.platform !== "win32") return null;

  try {
    trayLog("Initializing tray...");
    ensureTrayBinary(root);

    // systray is CJS; require gives reliable interop under Bun's ESM runtime.
    // Keep this INSIDE the try/catch so any load failure is non-fatal.
    const _require = createRequire(import.meta.url);
    trayLog("Loading systray module...");
    const systrayMod = _require("systray");
    trayLog(`systray module keys: ${Object.keys(systrayMod).join(", ")}`);
    const SysTray = systrayMod.default ?? systrayMod;
    trayLog(`SysTray type: ${typeof SysTray}`);

    const tray = new SysTray({
      menu: {
        icon: ICON_BASE64,
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
      trayLog(`error: ${err?.message ?? err}`);
    });

    trayLog("System tray icon active.");
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
    const msg = err?.stack ?? err?.message ?? String(err);
    try { appendFileSync(LOG_FILE, `[${new Date().toISOString()}] TRAY INIT FAILED:\n${msg}\n`); } catch { /* ignore */ }
    console.warn("[tray] Could not initialize system tray:", err?.message ?? err);
    return null;
  }
}
