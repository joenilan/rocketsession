import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

const SESSION_URL = "http://127.0.0.1:49410";
const BIN_NAME = "tray_windows_release.exe";
const CACHE_BIN = join(homedir(), ".cache", "node-systray", "1.0.5", BIN_NAME);

const ICON_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAIDSURBVFhH7Za/S0JRFMf9D9pUxEQkxSyagoiIQAiKKIggGoJqiQiKQBoc2toaHNpahBYb+w/Epa3RrUXaampU0xNfQbvvnPvjvVfU4oXP4vPc+7nnnnvei0zECvSfRPgPf81YILRAcSZH63NZD/w/fggkgEXvt1P0dhandikq+LiI0sNOkvbmp0SsCV8C2XSeHneTYkEb9f0kLU3nxFwcpwB2/Xqq37ELZORwwZ4NqwDOdThZt0nO0a9vCQlgkzAKzGbynp37ERiMZlkIIBOm4zAK8DP3LUAt+qzILDwfJcQaRgE19VKgQV1Nmjv11kjBdBTHixmxllYAV4kHuwTalSr1HQJPBzILQiCWKAzOjAe7BNQM9Gry+RDUllUA144HeQVcQy84hN8IIYAuxoOCCNh2Dy5XvHUgBM6XMyLILaCvfB3Xq2m7AFLEg7wCSoqVwsNw7R5cFR0CuitoFBAS7kzwqygEUpN5EWQVALXGSIHeq9ThzxV4RxQCAG8yHmgVYDVi6gMvJ3GxllZAV4gugXapTL1vB2093Kx5z98oANC7+QQ/AS82NDm+jlHAVIxh4cXnFABoGnyiMNxupMTcvgQA7i2fMAh3m+bFfQkAHEfQzzJ8uKKY+VwcXwIABYRs4CrxxVQgipSjn/A5dPgWUEEzgQz6ugrepPy/LkIJ/CZjgS9txfPkHRHLFwAAAABJRU5ErkJggg==";

const IDX_STATUS = 0;
const IDX_OPEN = 2;
const IDX_RESET = 3;
const IDX_QUIT = 5;

function formatStatus(totals) {
  const streak =
    totals.streak > 0 ? `W${totals.streak}` :
    totals.streak < 0 ? `L${Math.abs(totals.streak)}` : "-";
  return `W: ${totals.wins}   L: ${totals.losses}   Streak: ${streak}`;
}

function locateBin(root) {
  const candidates = [
    join(root, BIN_NAME),                                              // next to .exe in standalone bundle
    CACHE_BIN,                                                         // user cache (populated below)
    join(root, "node_modules", "systray", "traybin", BIN_NAME),       // dev mode
  ];
  return candidates.find(existsSync) ?? null;
}

function populateCache(root) {
  if (existsSync(CACHE_BIN)) return;
  const src = [
    join(root, BIN_NAME),
    join(root, "node_modules", "systray", "traybin", BIN_NAME),
  ].find(existsSync);
  if (src) {
    mkdirSync(join(homedir(), ".cache", "node-systray", "1.0.5"), { recursive: true });
    copyFileSync(src, CACHE_BIN);
  }
}

export function initTray({ root, initialTotals, onReset, onQuit }) {
  if (process.platform !== "win32") return null;

  try {
    populateCache(root);
    const binPath = locateBin(root);
    if (!binPath) throw new Error(`${BIN_NAME} not found (checked next-to-exe, cache, and node_modules)`);

    const proc = spawn(binPath, [], { windowsHide: true });
    const rl = createInterface({ input: proc.stdout });

    const menu = {
      icon: ICON_BASE64,
      title: "Rocket Session",
      tooltip: "Rocket Session Stats",
      items: [
        { title: formatStatus(initialTotals), tooltip: "Session stats", checked: false, enabled: false },
        { title: "──────────────", tooltip: "", checked: false, enabled: false },
        { title: "Open Control Panel", tooltip: SESSION_URL, checked: false, enabled: true },
        { title: "Reset Session", tooltip: "Reset all session data", checked: false, enabled: true },
        { title: "──────────────", tooltip: "", checked: false, enabled: false },
        { title: "Quit", tooltip: "Stop server and quit", checked: false, enabled: true },
      ],
    };

    function send(obj) {
      try { proc.stdin.write(JSON.stringify(obj) + "\n"); } catch { /* pipe closed */ }
    }

    rl.on("line", (line) => {
      try {
        const action = JSON.parse(line);
        if (action.type === "ready") {
          send(menu);
        } else if (action.type === "clicked" && action.item?.enabled) {
          switch (action.seq_id) {
            case IDX_OPEN:
              try { execSync(`cmd /c start "" "${SESSION_URL}"`); } catch { /* ignore */ }
              break;
            case IDX_RESET:
              onReset();
              break;
            case IDX_QUIT:
              try { proc.kill(); } catch { /* ignore */ }
              onQuit();
              break;
          }
        }
      } catch { /* malformed line */ }
    });

    proc.on("error", (err) => console.error("[tray] process error:", err.message));

    console.log("[tray] System tray icon active.");
    return {
      update(totals) {
        send({
          type: "update-item",
          item: { title: formatStatus(totals), tooltip: "Session stats", checked: false, enabled: false },
          seq_id: IDX_STATUS,
        });
      },
      kill() {
        try { proc.kill(); } catch { /* ignore */ }
      },
    };
  } catch (err) {
    console.warn("[tray] Could not initialize system tray:", err?.message ?? err);
    return null;
  }
}
