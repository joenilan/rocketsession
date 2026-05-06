# Rocket Session Stats

Track wins, losses, streaks, and per-match stats from Rocket League's official Stats API — no BakkesMod required.

Built with Tauri v2 + React + Rust.

---

## Download

Latest release: **https://apps.zombie.digital/downloads/rocket-session/latest.json**

The installer, portable ZIP, and patch notes are published there on every release.

---

## Features

- **Session totals** — wins, losses, win rate, current streak
- **Match history** — per-game result log with individual reset
- **Current match** — live player list; click any player to focus their full stats card (goals, assists, saves, shots, demos, touches, boost)
- **OBS overlay** — one transparent browser source with no background surface; renders the stock widget or a custom text canvas
- **Text Overlay Studio** — build a font-controlled stat canvas with labels, live values, position, color, size, and opacity controls
- **OBS text files** — plain-text files updated live for simple text-based overlays
- **HTTP API** — `http://127.0.0.1:49410` for custom integrations (also works on LAN for dual-PC setups)
- **Stats API setup assistant** — detects your RL install and writes `DefaultStatsAPI.ini` for you
- **System tray** — runs in the background, double-click to restore
- **Auto-update** — checks for updates via apps.zombie.digital, installs and relaunches in one click

---

## Setup

1. Install via the NSIS setup from the download page, or extract the portable ZIP.
2. Launch **Rocket Session Stats**.
3. Go to the **Session** tab → click **Enable Stats API** — it writes the required `DefaultStatsAPI.ini` for you.
4. Fully close and restart Rocket League.
5. Play — session stats appear automatically.

### OBS Browser Source

Add a browser source pointed at:

```
http://127.0.0.1:49410/
```

Size: `1920×1080` for the text canvas, or your preferred widget bounds for the stock overlay. The overlay background and widget surfaces are fully transparent — works with any scene.

For a dual-PC setup, enable **Dual PC Mode** on the Session tab to expose the API on your LAN IP, then use that IP on the streaming PC.

---

## API

The HTTP server runs on port `49410`. Key endpoints:

| Endpoint | Method | Description |
|---|---|---|
| `/api/session` | GET | Full session snapshot (JSON) |
| `/api/session/reset` | POST | Reset session totals |
| `/api/session/reset-history` | POST | Clear match history |
| `/api/events` | GET | SSE stream of session updates |
| `/api/overlay-settings` | POST | Update stock overlay position/scale/opacity |
| `/api/overlay-config` | POST | Update selected overlay mode and text canvas elements |
| `/text/<stat>` | GET | Raw text stat value, e.g. `/text/wins`, `/text/streak`, `/text/winrate` |
| `/` | GET | OBS-ready overlay page using the saved overlay mode |

---

## Development

**Prerequisites:** [Rust](https://rustup.rs), [Bun](https://bun.sh), [Tauri v2 prerequisites](https://tauri.app/start/prerequisites/)

```powershell
bun install
bun run dev        # starts Tauri dev mode (Vite + Rust hot reload)
```

UI-only (no native window):

```powershell
bun run dev:ui     # Vite on http://127.0.0.1:49411
```

Type + build check:

```powershell
bun run build
```

The Rust backend connects to Rocket League's Stats API at `127.0.0.1:49123`. Override with:

```powershell
$env:STATS_API_ADDR="127.0.0.1:49123"
```

---

## Release

Version bumping (updates `VERSION`, `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`):

```powershell
bun run version:patch   # 1.0.0 → 1.0.1
bun run version:minor   # 1.0.0 → 1.1.0
bun run version:major   # 1.0.0 → 2.0.0
```

Before publishing, add a `## <version>` section to `PATCH_NOTES.md`. Then:

```powershell
# 1. Build installer + package artifacts into release/windows/
bun run release:package

# 2. Sign, generate updater.json + latest.json, upload to apps.zombie.digital
bun run release:publish
```

`release:publish` reads credentials from `.env.raspi` (copy from `.env.raspi.example`, fill in `SSH_PASSWORD`).

The signing private key lives at `~/.tauri/rocket-session.key`.

---

## Site integration

The download page should read:

```
https://apps.zombie.digital/downloads/rocket-session/latest.json
```

**`latest.json` shape:**

```json
{
  "version": "1.0.0",
  "channel": "stable",
  "publishedAt": "2026-05-06T00:00:00.000Z",
  "file": "rocket-session_1.0.0_x64-setup.exe",
  "notes": "First bullet from patch notes",
  "notesFile": "notes.md",
  "files": {
    "setup": "rocket-session_1.0.0_x64-setup.exe",
    "portable": "rocket-session_1.0.0_x64_portable.zip"
  }
}
```

All files (installer, portable, SHA256 checksums, full `notes.md`, `updater.json`) are served from the same directory. SHA256 files follow the pattern `<filename>.sha256`.

---

## Credits

Built by **DREADEDZOMBIE** & **TOMLIT**
