import { cp, mkdir, readFile, rm, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot    = path.resolve(__dirname, "..");
const exePath     = path.join(repoRoot, "src-tauri", "target", "release", "rocket-session-stats.exe");
const distSrc     = path.join(repoRoot, "dist");
const portableDir = path.join(repoRoot, "portable");
const legacyZipPath = path.join(repoRoot, "rocket-session-stats-portable.zip");
let zipPath = legacyZipPath;

async function ensureExists(target, label, hint) {
  try {
    await stat(target);
  } catch {
    throw new Error(`${label} not found at ${target}. ${hint}`);
  }
}

async function getAppVersion() {
  try {
    const versionFile = path.join(repoRoot, "VERSION");
    try {
      const v = (await readFile(versionFile, "utf8")).trim();
      if (v) return v;
    } catch { /* fall through */ }
    const pkg = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
    if (pkg?.version) return String(pkg.version).trim();
  } catch { /* fall through */ }
  return null;
}

async function zipWithPowerShell() {
  const portableGlob = path.join(portableDir, "*").replace(/'/g, "''");
  const zipTarget = zipPath.replace(/'/g, "''");
  const command = `Import-Module Microsoft.PowerShell.Archive -ErrorAction Stop; Compress-Archive -Force -Path '${portableGlob}' -DestinationPath '${zipTarget}'`;
  await execFileAsync("powershell", ["-NoProfile", "-Command", command]);
}

async function zipWithTar() {
  const entries = ["rocket-session-stats.exe", "dist"];
  await execFileAsync("tar", ["-a", "-c", "-f", zipPath, "-C", portableDir, ...entries]);
}

async function main() {
  const version = await getAppVersion();
  if (version) {
    zipPath = path.join(repoRoot, `rocket-session-stats-${version}.zip`);
  }

  await ensureExists(exePath, "Release binary",
    "Run `bun run tauri build -- --bundles none` first.");
  await ensureExists(distSrc, "Built UI (dist/)",
    "Run `bun run build` first.");

  await rm(portableDir, { recursive: true, force: true });
  await mkdir(portableDir, { recursive: true });

  // Copy main executable
  await cp(exePath, path.join(portableDir, "rocket-session-stats.exe"));

  // Copy built UI for OBS browser source serving
  await cp(distSrc, path.join(portableDir, "dist"), { recursive: true });

  if (zipPath !== legacyZipPath) {
    await rm(legacyZipPath, { force: true });
  }
  await rm(zipPath, { force: true });

  console.log(`Portable contents: ${portableDir}`);
  const exeStat = await stat(path.join(portableDir, "rocket-session-stats.exe"));
  console.log(` - [file] rocket-session-stats.exe (${Math.round(exeStat.size / 1024)} KB)`);
  console.log(` - [dir]  dist/`);

  if (process.platform === "win32") {
    try {
      await zipWithPowerShell();
    } catch {
      await zipWithTar();
    }
  } else {
    await zipWithTar();
  }

  console.log(`Portable zip created: ${zipPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
