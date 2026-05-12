# Repository Guidelines

## Project Identity
- Rocket Session Stats is a standalone Tauri v2 + React + Rust app for Rocket League session tracking.
- The app reads Rocket League's official Stats API TCP stream, tracks wins/losses/streaks/current match stats, and serves OBS/browser-source overlays.
- Treat this folder as its own product and release unit. Do not assume context from parent folders unless explicitly asked.

## Project Structure
- `src/` contains the React desktop UI, overlay runtime, shared types, frontend API helpers, and the local Node debug server.
- `src/views/` contains primary app pages: Session, History, Overlay, Logs, Settings, and About.
- `src/components/` contains reusable shell/UI/overlay components.
- `src/context/` contains app-wide providers such as theme and update state.
- `src/lib/` contains frontend data helpers and shared stat formatting/defaults.
- `src/server/index.mjs` is the standalone/debug HTTP + Stats API server path used during development and experimentation.
- `src-tauri/` contains the production Rust backend, Tauri setup, tray behavior, Stats API TCP handling, auto-skip, local HTTP server, updater plugins, and packaging config.
- `scripts/` contains versioning, packaging, and publishing scripts.
- `release/windows/` is generated release output. Do not hand-edit generated artifacts.
- `portable/`, `dist/`, and `src-tauri/target/` are generated build outputs.

## Runtime Architecture
- Rocket League emits a raw local TCP stream when `DefaultStatsAPI.ini` has `PacketSendRate > 0`.
- Default Stats API address is `127.0.0.1:49123`.
- Rocket Session's HTTP/overlay server listens on port `49410`.
- The OBS browser-source URL is normally `http://127.0.0.1:49410/`.
- Dual-PC mode exposes the app HTTP server on the game PC LAN IP; Rocket League Stats API still runs locally on the game PC.
- The app maintains one session snapshot and broadcasts live changes to the UI/overlays through IPC/SSE.
- Browser-source overlays must keep the full page background transparent unless a user-controlled widget surface intentionally has opacity.

## Build, Test, and Development Commands
- Install dependencies with `bun install`.
- Run the desktop app in development with `bun run dev`.
- Run UI-only Vite development with `bun run dev:ui`.
- Run the main non-packaging validation with `bun run build`.
- Build Tauri production artifacts with `bun run release:package`.
- Publish release artifacts and updater metadata with `bun run release:publish`.
- Check release notes for the current version with `bun run version:check-notes`.
- Use `node --check src/server/index.mjs` after editing the standalone Node server.
- Use `bun run tauri build` only when you need raw Tauri build behavior; prefer `release:package` for release artifacts.

## Release and Versioning
- `VERSION` is the app version source of truth.
- Version sync updates `VERSION`, `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json`.
- Use `bun run version:patch`, `bun run version:minor`, or `bun run version:major` instead of editing version files manually.
- Every publishable change must add a matching `## <version>` section to `PATCH_NOTES.md`.
- `bun run release:publish` runs the notes check before upload.
- Release artifacts are written under `release/windows/`.
- Published downloads and updater metadata are uploaded to `apps.zombie.digital/downloads/rocket-session`.
- Auto-update metadata is `updater.json`; download-page metadata is `latest.json`; full notes are `notes.md`.

## Signing and Publishing Rules
- Publishing uses `.env.raspi`; copy from `.env.raspi.example` when setting up a new machine.
- `.env.raspi` must win over any global shell Tauri signing variables.
- The expected signing key path is `C:\Users\ZOMBIEBOX\.tauri\rocket-session-stats.key`.
- Do not change updater public keys, signer env precedence, or publish paths casually. A wrong signing key breaks in-app updates with signature mismatch errors.
- If updater signature errors are reported, verify the release was signed with the Rocket Session key and republish metadata before bumping again.

## Coding Style
- TypeScript/React uses 2-space indentation, `camelCase`, functional components, and descriptive hooks/components.
- Rust follows `rustfmt` defaults, `snake_case` functions, and `CamelCase` structs/enums.
- Keep UI state centralized when multiple views need it; avoid duplicated polling/check logic in separate pages.
- Prefer small, focused components when they reduce page complexity.
- Use exact, narrow output filtering or logging changes; do not hide real warnings/errors.
- Keep comments rare and useful, mainly for non-obvious lifecycle, updater, networking, or packaging behavior.

## UI and Overlay Rules
- The app is an operator tool; keep controls compact, predictable, and stable.
- Dynamic button/status labels must not cause layout shifts in constrained rows.
- OBS overlay pages must remain transparent at the document/body/root level.
- Widget/card backgrounds are allowed only when controlled by overlay settings such as opacity.
- Theme changes and overlay motion should feel smooth, but avoid broad animation changes that affect readability in OBS.
- Logs must not spam-render in the background. Live log polling should remain opt-in or bounded.
- About/connect links should use Tauri opener APIs so links open in the system browser.

## Stats API Behavior
- The app should guide users to enable `DefaultStatsAPI.ini` safely while Rocket League is closed.
- Enabling writes `PacketSendRate` and `Port`; disabling writes `PacketSendRate=0`.
- Connection checks should target the configured host/port and treat closed Rocket League as a normal waiting state.
- Freeplay, casual, competitive, private matches, and other contexts may emit different payloads; preserve useful data when available and do not fake unavailable fields.
- Game mode/playlist/rank/MMR should not be assumed unless the official payload or local captures prove those fields exist.
- Auto-skip is experimental and should remain guarded by foreground-window checks and clear settings.

## HTTP/API Contracts
- Preserve existing endpoints unless intentionally migrating them:
- `/api/session` returns the full session snapshot.
- `/api/events` streams live session updates through SSE.
- `/api/session/reset` resets session totals.
- `/api/session/reset-history` clears match history.
- `/api/overlay-settings` updates stock overlay position/scale/opacity.
- `/api/overlay-config` updates selected overlay mode and text canvas elements.
- `/text/<stat>` returns raw text values for simple integrations.
- `/` serves the saved OBS overlay mode.

## Testing Guidelines
- At minimum, run `bun run build` before handing off code changes.
- For Rust/backend or Tauri capability changes, run `bun run release:package` when feasible.
- For publish-ready work, run `bun run release:package` followed by `bun run release:publish`.
- For server-only changes, run `node --check src/server/index.mjs`.
- Manually validate overlay transparency in OBS/browser after changes to `src/main.tsx`, `src/styles.css`, or overlay components.
- Manually validate update checks after changes to updater UI, `UpdateContext`, publish scripts, `.env.raspi`, or Tauri updater config.

## Git and Artifact Hygiene
- Do not commit generated release binaries, portable zips, `dist/`, `portable/`, or `src-tauri/target/`.
- Do not commit secrets from `.env.raspi`.
- Keep commits short and imperative.
- For notable user-facing changes, update `PATCH_NOTES.md` with the current version.
- Avoid reverting unrelated user or agent changes. If the worktree is dirty, inspect changes before editing overlapping files.

