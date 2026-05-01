# Rocket Session Stats

Standalone experiment for rebuilding the useful parts of RocketStats without BakkesMod.

## Goal

Track session-level stats from Rocket League's official Stats API:

- wins
- losses
- streak
- game count
- tracked-player goals/saves/shots/assists/demos/touches
- freeplay/training ball-hit count and strongest hit
- current match score and player list

Rank/MMR is intentionally not part of the first version because the official Stats API does not publish rank, division, playlist MMR, or MMR delta.

## Run

From this folder:

```powershell
bun install
bun run dev
```

This starts both:

- API/session service: `http://127.0.0.1:49410`
- Control UI: `http://127.0.0.1:49411`

If you want separate terminals:

```powershell
bun run dev:server
bun run dev:ui
```

For casual/competitive data testing with terminal logs:

```powershell
bun run debug
```

For full raw payload dumps:

```powershell
bun run debug:raw
```

Useful debug env vars:

```powershell
$env:SESSION_STATS_DEBUG="1"
$env:SESSION_STATS_DEBUG_RAW="1"
$env:SESSION_STATS_DEBUG_UPDATE_INTERVAL="1"
```

`SESSION_STATS_DEBUG_UPDATE_INTERVAL=1` prints every `UpdateState`; the default prints every 30th update so the terminal stays readable.

Open:

- Control view: `http://127.0.0.1:49411`
- OBS overlay view: `http://127.0.0.1:49411/?overlay=1`

The server expects Rocket League's Stats API at `127.0.0.1:49123`.

Override with:

```powershell
$env:STATS_API_ADDR="127.0.0.1:49123"
$env:SESSION_STATS_PORT="49410"
bun run dev
```

## Testing Unknowns

Verified so far:

- Casual games emit `UpdateState`, players, score, clock, live boost, `MatchCreated`, `MatchEnded`, and `MatchDestroyed`.
- Freeplay/training emits `UpdateState`, one local player, live boost, clock, pause/unpause, `BallHit`, and lifecycle events even with an empty `MatchGuid`.
- The app auto-selects the only visible player so freeplay/training data is useful without a manual player click.

Use more real casual/competitive games to verify:

- whether `MatchEnded.WinnerTeamNum` is present
- whether `MatchEnded.WinnerTeamNum` matches blue/orange correctly in competitive
- whether any hidden playlist/ranked metadata appears in raw payloads
