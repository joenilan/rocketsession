import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { createReadStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve, dirname } from "node:path";
import { execSync } from "node:child_process";
import { RocketLeagueStatsClient } from "rocket-league-stats-api";

const DEFAULT_STATS_API_ADDR = "127.0.0.1:49123";
const PORT = Number.parseInt(process.env.SESSION_STATS_PORT ?? "49410", 10);
const STATS_API_ADDR = process.env.STATS_API_ADDR ?? DEFAULT_STATS_API_ADDR;
const DEBUG = process.env.SESSION_STATS_DEBUG === "1" || process.argv.includes("--debug");
const DEBUG_RAW = process.env.SESSION_STATS_DEBUG_RAW === "1" || process.argv.includes("--raw");
const DEBUG_UPDATE_INTERVAL = Math.max(
  1,
  Number.parseInt(process.env.SESSION_STATS_DEBUG_UPDATE_INTERVAL ?? "30", 10),
);
// When compiled with `bun build --compile`, argv[1] is absent (it's a native binary).
// When running as a script via bun/node, argv[1] is the script path.
const isDevScript = typeof process.argv[1] === "string" && /\.(m?js|ts)$/i.test(process.argv[1]);
const ROOT = isDevScript
  ? resolve(new URL("../../", import.meta.url).pathname)
  : dirname(resolve(process.argv[0]));
const DIST_DIR = join(ROOT, "dist");
const DATA_FILE = join(ROOT, "session-data.json");

// --- Stats API config helpers ---

function isRocketLeagueRunning() {
  if (process.platform !== "win32") return false;
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq RocketLeague.exe" /FO CSV /NH', {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    return out.toLowerCase().includes("rocketleague.exe");
  } catch {
    return false;
  }
}

function parseSteamLibraryPaths(vdfPath) {
  try {
    const contents = readFileSync(vdfPath, "utf8");
    return contents
      .split(/\r?\n/)
      .filter((line) => line.trim().toLowerCase().startsWith('"path"'))
      .map((line) => {
        const parts = line.trim().split('"');
        return parts[3]?.replace(/\\\\/g, "\\") ?? null;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function candidateInstallDirs() {
  const seen = new Set();
  const dirs = [];
  function push(p) {
    const norm = resolve(p);
    if (!seen.has(norm)) { seen.add(norm); dirs.push(norm); }
  }
  if (process.env.ROCKET_LEAGUE_INSTALL_DIR) push(process.env.ROCKET_LEAGUE_INSTALL_DIR);
  if (process.platform === "win32") {
    const pf86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
    const pf   = process.env.ProgramFiles ?? "C:\\Program Files";
    push(join(pf,   "Epic Games", "rocketleague"));
    push(join(pf86, "Epic Games", "rocketleague"));
    for (const steamRoot of [join(pf86, "Steam"), join(pf, "Steam")]) {
      push(join(steamRoot, "steamapps", "common", "rocketleague"));
      for (const lib of parseSteamLibraryPaths(join(steamRoot, "steamapps", "libraryfolders.vdf"))) {
        push(join(lib, "steamapps", "common", "rocketleague"));
      }
    }
  }
  return dirs;
}

function isValidInstallDir(p) {
  return existsSync(join(p, "TAGame", "Config"));
}

function iniPathFromInstallDir(installDir) {
  return join(installDir, "TAGame", "Config", "DefaultStatsAPI.ini");
}

function resolveIniPath(manualPath) {
  if (manualPath && String(manualPath).trim()) {
    const p = resolve(String(manualPath).trim());
    if (p.toLowerCase().endsWith("defaultstatsapi.ini")) return { path: p, error: null };
    if (isValidInstallDir(p)) return { path: iniPathFromInstallDir(p), error: null };
    const direct = join(p, "DefaultStatsAPI.ini");
    if (existsSync(direct) || p.toLowerCase().endsWith("config")) return { path: direct, error: null };
    return { path: null, error: "Select the Rocket League install folder or DefaultStatsAPI.ini." };
  }
  const found = candidateInstallDirs().find(isValidInstallDir);
  if (found) return { path: iniPathFromInstallDir(found), error: null };
  return { path: null, error: "Rocket League install folder not found. Set the path manually." };
}

function readIniValues(configPath) {
  let packetSendRate = 0;
  let port = 49123;
  try {
    for (const line of readFileSync(configPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || trimmed.startsWith(";")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim().toLowerCase();
      const val = trimmed.slice(eq + 1).trim();
      if (key === "packetsendrate") packetSendRate = parseFloat(val) || 0;
      else if (key === "port") port = parseInt(val, 10) || 49123;
    }
  } catch { /* file missing or unreadable */ }
  return { packetSendRate, port };
}

function upsertIniValue(contents, key, value) {
  let replaced = false;
  const lines = contents.split(/\r?\n/).map((line) => {
    const trimmed = line.trimStart();
    if (!trimmed.startsWith("#") && !trimmed.startsWith(";")) {
      const eq = trimmed.indexOf("=");
      if (eq !== -1 && trimmed.slice(0, eq).trim().toLowerCase() === key.toLowerCase()) {
        replaced = true;
        return `${key}=${value}`;
      }
    }
    return line;
  });
  if (!replaced) lines.push(`${key}=${value}`);
  const joined = lines.join("\n");
  return joined.endsWith("\n") ? joined : joined + "\n";
}

function buildConfigStatus(configPath, error = null) {
  if (!configPath) {
    return { found: false, enabled: false, path: null, installDir: null, packetSendRate: 0, port: 49123, rocketLeagueRunning: isRocketLeagueRunning(), error };
  }
  const found = existsSync(configPath) || existsSync(dirname(configPath));
  const { packetSendRate, port } = existsSync(configPath)
    ? readIniValues(configPath)
    : { packetSendRate: 0, port: 49123 };
  const installDir = resolve(configPath, "../../..");
  return { found, enabled: packetSendRate > 0, path: configPath, installDir, packetSendRate, port, rocketLeagueRunning: isRocketLeagueRunning(), error };
}

// --- End Stats API config helpers ---

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function parseAddress(input) {
  const trimmed = String(input).trim().replace(/^(?:tcp|ws|wss):\/\//, "").replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf(":");
  if (idx <= 0) return { host: "127.0.0.1", port: 49123 };
  return {
    host: trimmed.slice(0, idx),
    port: Number.parseInt(trimmed.slice(idx + 1), 10),
  };
}

const zeroTotals = () => ({
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
});

const fallbackTeams = () => [
  { name: "Blue", score: 0, color: "#0074ff" },
  { name: "Orange", score: 0, color: "#ff8b00" },
];

async function saveSession() {
  try {
    await writeFile(
      DATA_FILE,
      JSON.stringify({ totals: state.totals, trackedPlayer: state.trackedPlayer, lastMatch: state.lastMatch }, null, 2),
      "utf8",
    );
  } catch (err) {
    console.error("[session] Failed to save:", err?.message ?? err);
  }
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveSession().catch(() => undefined), 2000);
}

async function loadSession() {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      if (parsed.totals && typeof parsed.totals === "object") {
        state.totals = { ...zeroTotals(), ...parsed.totals };
      }
      if (parsed.trackedPlayer && typeof parsed.trackedPlayer === "object") {
        state.trackedPlayer = parsed.trackedPlayer;
      }
      if (parsed.lastMatch && typeof parsed.lastMatch === "object") {
        state.lastMatch = parsed.lastMatch;
      }
      console.log("[session] Restored session from disk.");
    }
  } catch (err) {
    if (err?.code !== "ENOENT") {
      console.error("[session] Failed to load session:", err?.message ?? err);
    }
  }
}

const state = {
  app: "rocket-session-stats",
  connection: "connecting",
  connectionMessage: "Connecting to Rocket League Stats API...",
  statsApiAddress: STATS_API_ADDR,
  lastEventAt: null,
  trackedPlayer: null,
  currentMatch: {
    active: false,
    context: "unknown",
    timeSeconds: 0,
    isOT: false,
    teams: fallbackTeams(),
    players: [],
    trackedTeam: null,
  },
  totals: zeroTotals(),
  lastMatch: null,
  rawEventCounts: {},
};

const clients = new Set();
let updateStateDebugCount = 0;
let currentContext = "unknown";

function timestamp() {
  return new Date().toLocaleTimeString();
}

function debugLog(message, details) {
  if (!DEBUG) return;
  console.log(`[${timestamp()}] ${message}`);
  if (details !== undefined) {
    console.log(typeof details === "string" ? details : JSON.stringify(details, null, 2));
  }
}

function rawLog(event, data) {
  if (!DEBUG_RAW) return;
  console.log(`[${timestamp()}] RAW ${event}`);
  console.log(JSON.stringify(data, null, 2));
}

function emit() {
  const payload = `data: ${JSON.stringify(state)}\n\n`;
  for (const res of clients) {
    res.write(payload);
  }
}

function setConnection(connection, message) {
  state.connection = connection;
  state.connectionMessage = message;
  debugLog(`connection:${connection} ${message}`);
  emit();
}

function bumpEvent(event) {
  state.lastEventAt = new Date().toISOString();
  state.rawEventCounts[event] = (state.rawEventCounts[event] ?? 0) + 1;
}

function numberField(source, key, fallback = 0) {
  const value = source?.[key];
  return Number.isFinite(value) ? value : fallback;
}

function boolField(source, key, fallback = false) {
  const value = source?.[key];
  return typeof value === "boolean" ? value : fallback;
}

function stringField(source, key, fallback = "") {
  const value = source?.[key];
  return typeof value === "string" ? value : fallback;
}

function playerId(player) {
  const primary = player?.PrimaryId;
  const primaryId =
    typeof primary === "string"
      ? primary
      : typeof primary?.Id === "string"
        ? primary.Id
        : typeof primary?.EpicAccountId === "string"
          ? primary.EpicAccountId
          : "";
  const shortcut = Number.isFinite(player?.Shortcut) ? String(player.Shortcut) : "";
  const name = stringField(player, "Name", "Unknown");
  const team = numberField(player, "TeamNum", -1);
  return primaryId || `${team}:${shortcut || name}`;
}

function normalizePlayer(player) {
  return {
    id: playerId(player),
    name: stringField(player, "Name", "Unknown"),
    team: numberField(player, "TeamNum", -1),
    score: numberField(player, "Score"),
    goals: numberField(player, "Goals"),
    assists: numberField(player, "Assists"),
    saves: numberField(player, "Saves"),
    shots: numberField(player, "Shots"),
    demos: numberField(player, "Demos"),
    touches: numberField(player, "Touches"),
    boost: Number.isFinite(player?.Boost) ? player.Boost : null,
  };
}

function normalizeTeams(game) {
  const teams = Array.isArray(game?.Teams) ? game.Teams : [];
  const blue = teams[0] ?? {};
  const orange = teams[1] ?? {};
  return [
    {
      name: stringField(blue, "Name", "Blue"),
      score: numberField(blue, "Score"),
      color: stringField(blue, "ColorPrimary", "#0074ff"),
    },
    {
      name: stringField(orange, "Name", "Orange"),
      score: numberField(orange, "Score"),
      color: stringField(orange, "ColorPrimary", "#ff8b00"),
    },
  ];
}

function resolveTrackedPlayer(players) {
  if (!state.trackedPlayer) return null;
  return (
    players.find((player) => player.id === state.trackedPlayer.id) ??
    players.find((player) => player.name.toLowerCase() === state.trackedPlayer.name.toLowerCase()) ??
    null
  );
}

function maybeAutoTrackOnlyPlayer(players) {
  if (state.trackedPlayer || players.length !== 1) return;
  const [player] = players;
  state.trackedPlayer = {
    id: player.id,
    name: player.name,
    team: player.team,
  };
  debugLog("Auto-tracked only visible player", state.trackedPlayer);
}

function applyTrackedPlayerStats(player) {
  state.totals.goals += player.goals;
  state.totals.assists += player.assists;
  state.totals.saves += player.saves;
  state.totals.shots += player.shots;
  state.totals.demos += player.demos;
  state.totals.touches += player.touches;
}

function handleUpdateState(data) {
  const players = Array.isArray(data?.Players)
    ? data.Players.map(normalizePlayer).filter((player) => player.team === 0 || player.team === 1)
    : [];
  const game = data?.Game ?? {};
  maybeAutoTrackOnlyPlayer(players);
  const tracked = resolveTrackedPlayer(players);

  if (tracked) {
    state.trackedPlayer = {
      id: tracked.id,
      name: tracked.name,
      team: tracked.team,
    };
  }

  state.currentMatch = {
    active: true,
    context: currentContext,
    timeSeconds: numberField(game, "TimeSeconds"),
    isOT: boolField(game, "bOvertime"),
    teams: normalizeTeams(game),
    players,
    trackedTeam: tracked?.team ?? state.trackedPlayer?.team ?? null,
  };

  updateStateDebugCount += 1;
  if (DEBUG && updateStateDebugCount % DEBUG_UPDATE_INTERVAL === 1) {
    const [blue, orange] = state.currentMatch.teams;
    debugLog(
      `UpdateState players=${players.length} score=${blue.score}-${orange.score} clock=${state.currentMatch.timeSeconds}s tracked=${tracked?.name ?? state.trackedPlayer?.name ?? "none"}`,
      players.map((player) => ({
        team: player.team,
        name: player.name,
        score: player.score,
        goals: player.goals,
        saves: player.saves,
        shots: player.shots,
        boost: player.boost,
      })),
    );
  }
}

function handleBallHit(data) {
  const players = Array.isArray(data?.Players)
    ? data.Players.map(normalizePlayer).filter((player) => player.team === 0 || player.team === 1)
    : [];
  maybeAutoTrackOnlyPlayer(players);

  const tracked = resolveTrackedPlayer(players);
  const shouldCount =
    players.length === 0 ||
    !state.trackedPlayer ||
    Boolean(tracked) ||
    players.some((player) => player.name.toLowerCase() === state.trackedPlayer?.name.toLowerCase());

  if (!shouldCount) return;

  const postHitSpeed = Number.isFinite(data?.Ball?.PostHitSpeed) ? data.Ball.PostHitSpeed : 0;
  state.totals.ballHits += 1;
  state.totals.strongestHit = Math.max(state.totals.strongestHit, Math.round(postHitSpeed));
  debugLog("BallHit", {
    hits: state.totals.ballHits,
    strongestHit: state.totals.strongestHit,
    postHitSpeed,
  });
  scheduleSave();
}

function handleMatchEnded(data) {
  const winnerTeam = Number.isFinite(data?.WinnerTeamNum) ? data.WinnerTeamNum : null;
  const trackedTeam = state.currentMatch.trackedTeam ?? state.trackedPlayer?.team ?? null;
  const tracked = resolveTrackedPlayer(state.currentMatch.players);
  let result = "unknown";

  state.totals.games += 1;
  if (tracked) {
    applyTrackedPlayerStats(tracked);
  }

  if (winnerTeam !== null && trackedTeam !== null) {
    if (winnerTeam === trackedTeam) {
      result = "win";
      state.totals.wins += 1;
      state.totals.streak = Math.max(0, state.totals.streak) + 1;
    } else {
      result = "loss";
      state.totals.losses += 1;
      state.totals.streak = Math.min(0, state.totals.streak) - 1;
    }
  } else {
    state.totals.unknownResults += 1;
  }

  state.lastMatch = {
    result,
    winnerTeam,
    trackedTeam,
    endedAt: new Date().toISOString(),
  };

  debugLog("MatchEnded", {
    winnerTeam,
    trackedTeam,
    result,
    totals: state.totals,
    raw: data,
  });
  saveSession().catch(() => undefined);
}

function handleMatchDestroyed() {
  debugLog("MatchDestroyed");
  currentContext = "unknown";
  state.currentMatch = {
    active: false,
    context: "unknown",
    timeSeconds: 0,
    isOT: false,
    teams: fallbackTeams(),
    players: [],
    trackedTeam: state.trackedPlayer?.team ?? null,
  };
}

function handleStatsEvent(event, data) {
  bumpEvent(event);
  rawLog(event, data);
  if (event !== "UpdateState") {
    debugLog(`event:${event}`, data);
  }
  switch (event) {
    case "UpdateState":
      handleUpdateState(data);
      break;
    case "MatchCreated":
      currentContext = stringField(data, "MatchGuid") ? "match" : "freeplay";
      state.currentMatch.context = currentContext;
      state.currentMatch.active = true;
      break;
    case "MatchInitialized":
      state.currentMatch.active = true;
      state.currentMatch.context = currentContext;
      break;
    case "BallHit":
      handleBallHit(data);
      break;
    case "MatchEnded":
      handleMatchEnded(data);
      break;
    case "MatchDestroyed":
      handleMatchDestroyed();
      break;
    default:
      break;
  }
  emit();
}

function writeJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
  });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function serveStatic(req, res) {
  const rawPath = new URL(req.url, "http://localhost").pathname;
  const filePath = rawPath === "/" ? join(DIST_DIR, "index.html") : join(DIST_DIR, rawPath);
  const safePath = resolve(filePath);
  if (!safePath.startsWith(DIST_DIR) || !existsSync(safePath)) {
    res.writeHead(404);
    res.end("Not found. Run `bun run build` or use `bun run dev:ui`.");
    return;
  }
  res.writeHead(200, { "content-type": MIME_TYPES[extname(safePath)] ?? "application/octet-stream" });
  createReadStream(safePath).pipe(res);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/session") {
    writeJson(res, 200, state);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "connection": "keep-alive",
      "access-control-allow-origin": "*",
    });
    clients.add(res);
    res.write(`data: ${JSON.stringify(state)}\n\n`);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/session/reset") {
    state.totals = zeroTotals();
    state.lastMatch = null;
    state.rawEventCounts = {};
    debugLog("Session reset from UI");
    saveSession().catch(() => undefined);
    emit();
    writeJson(res, 200, state);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/tracked-player") {
    const body = await readJson(req);
    const id = typeof body.id === "string" ? body.id : "";
    const player = state.currentMatch.players.find((entry) => entry.id === id);
    if (!player) {
      writeJson(res, 404, { error: "Player not found in current match." });
      return;
    }
    state.trackedPlayer = {
      id: player.id,
      name: player.name,
      team: player.team,
    };
    state.currentMatch.trackedTeam = player.team;
    debugLog("Tracked player selected", state.trackedPlayer);
    saveSession().catch(() => undefined);
    emit();
    writeJson(res, 200, state);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/stats-api-config") {
    const manualPath = url.searchParams.get("path");
    const { path: configPath, error } = resolveIniPath(manualPath);
    writeJson(res, 200, buildConfigStatus(configPath, error));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/stats-api-config/enable") {
    const body = await readJson(req);
    if (isRocketLeagueRunning()) {
      writeJson(res, 409, { error: "Close Rocket League first, then restart it after enabling." });
      return;
    }
    const { path: configPath, error } = resolveIniPath(body?.path);
    if (!configPath) { writeJson(res, 400, { error }); return; }
    if (!existsSync(dirname(configPath))) { writeJson(res, 400, { error: "Rocket League TAGame\\Config folder not found." }); return; }
    const rate = typeof body?.packetSendRate === "number" ? body.packetSendRate : 30;
    const port = typeof body?.port === "number" ? body.port : 49123;
    let contents = "";
    try { contents = readFileSync(configPath, "utf8"); } catch { /* new file */ }
    contents = upsertIniValue(contents, "PacketSendRate", String(rate));
    contents = upsertIniValue(contents, "Port", String(port));
    writeFileSync(configPath, contents, "utf8");
    writeJson(res, 200, buildConfigStatus(configPath));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/stats-api-config/disable") {
    const body = await readJson(req);
    if (isRocketLeagueRunning()) {
      writeJson(res, 409, { error: "Close Rocket League first, then restart it after disabling." });
      return;
    }
    const { path: configPath, error } = resolveIniPath(body?.path);
    if (!configPath) { writeJson(res, 400, { error }); return; }
    if (!existsSync(configPath)) { writeJson(res, 400, { error: "DefaultStatsAPI.ini not found." }); return; }
    let contents = readFileSync(configPath, "utf8");
    contents = upsertIniValue(contents, "PacketSendRate", "0");
    writeFileSync(configPath, contents, "utf8");
    writeJson(res, 200, buildConfigStatus(configPath));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    writeJson(res, 404, { error: "Unknown API route." });
    return;
  }

  serveStatic(req, res);
});

await loadSession();

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Rocket Session Stats server: http://127.0.0.1:${PORT}`);
  console.log(`Stats API target: ${STATS_API_ADDR}`);
  if (DEBUG) {
    console.log("Debug logging enabled. Use SESSION_STATS_DEBUG_RAW=1 for full payload dumps.");
    console.log(`UpdateState summaries print every ${DEBUG_UPDATE_INTERVAL} message(s).`);
  }
});

const { host, port } = parseAddress(STATS_API_ADDR);
const client = new RocketLeagueStatsClient({ host, port });

client.on("connected", () => setConnection("connected", "Connected to Rocket League Stats API."));
client.on("disconnected", ({ reason }) => setConnection("disconnected", `Disconnected: ${reason}`));
client.on("error", (error) => setConnection("error", error.message));
client.on("message", ({ event, data }) => handleStatsEvent(event, data));

try {
  await client.connect();
} catch (error) {
  setConnection("error", error instanceof Error ? error.message : String(error));
}

process.on("SIGINT", () => {
  client.disconnect();
  server.close(() => process.exit(0));
});
