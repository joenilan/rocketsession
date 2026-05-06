## 1.0.1

- Stats API port is now configurable in Settings for users who have port 49123 in use
- Removed broken port field that wrote the INI without updating the app connection
- Port preference persists across restarts via settings.json in app data dir
- OBS now uses one root browser-source URL that renders the saved overlay mode
- Added Text Overlay Studio for custom stat labels/values with font, color, size, opacity, and position controls
- Added raw `/text/<stat>` HTTP endpoints for wins, losses, streak, win rate, and other session values

## 1.0.0

- Initial public release
- Live session tracking: wins, losses, streak, win rate across the current play session
- Current match player cards with boost bar, goals, assists, saves, shots, demos, and touch count
- Match history with per-game result and MMR delta
- OBS overlay (browser source) with transparent background and position/scale controls
- OBS text file output for simple text-based overlays
- HTTP API on port 49410 for custom integrations
- Dual-PC mode: serve overlay and API on LAN IP for a dedicated streaming PC
- System tray with session reset shortcut; window hides to tray on close/minimize
- Purple bar-chart icon matching the app's dark theme
- Auto-update support via apps.zombie.digital
