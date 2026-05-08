## 1.0.8

- Simplified the sidebar updater UI so the version line itself shows update state
- Removed the extra update badge under the version
- Kept refresh/install action directly beside the version number

## 1.0.7

- Added compact update status under the sidebar logo/version
- Added sidebar refresh and install actions so updates are visible without opening About
- Centralized updater state so the sidebar and About page stay in sync
- Added silent startup, focus, and periodic background update checks

## 1.0.6

- Fixed About page Connect links so livestreaming.tools and Buy Me a Coffee open in the system browser

## 1.0.5

- Added an experimental replay auto-skip setting for Rocket League goal replays
- Added a configurable auto-skip delay for replay skip timing tests
- Fixed auto-skip settings serialization so saved delay values load correctly in the UI
- Added replay auto-skip diagnostic logs and a delayed test input button
- Uses Rocket League's default right-click replay skip bind
- Added replay detection fallback from `UpdateState` replay mode when explicit replay-start events are not emitted
- Stopped Logs from polling/rendering while hidden and made live log polling opt-in
- Removed per-event TCP debug logging to prevent gameplay log spam and background UI lag

## 1.0.4

- Restored the stock widget card background while keeping the full OBS/browser-source canvas transparent
- Stock widget opacity now controls the card background again

## 1.0.3

- Removed the stock OBS overlay card background, blur, border, and shadow so browser-source overlays stay transparent
- Stock overlay opacity now controls the widget text/group opacity instead of a gray card surface
- Removed the full-page boot/root dark background from OBS/browser-source overlay mode

## 1.0.2

- OBS now uses one root browser-source URL that renders the saved overlay mode
- Added Text Overlay Studio for custom stat labels/values with font, color, size, opacity, and position controls
- Added raw `/text/<stat>` HTTP endpoints for wins, losses, streak, win rate, and other session values
- Fixed the release notes check so patch verification works before publishing

## 1.0.1

- Stats API port is now configurable in Settings for users who have port 49123 in use
- Removed broken port field that wrote the INI without updating the app connection
- Port preference persists across restarts via settings.json in app data dir

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
