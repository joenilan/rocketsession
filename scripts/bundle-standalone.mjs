import { cp, mkdir, rm, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = resolve(fileURLToPath(import.meta.url), "../../");
const distDir = join(ROOT, "dist");
const outDir = join(ROOT, "standalone");
const exeName = "rocket-session-stats.exe";
const exeOut = join(ROOT, exeName);
const trayBin = join(ROOT, "node_modules", "systray", "traybin", "tray_windows_release.exe");
const zipPath = join(ROOT, "rocket-session-stats-standalone.zip");

async function ensureExists(p, label) {
  try {
    await stat(p);
  } catch {
    throw new Error(`${label} not found at ${p}`);
  }
}

async function zipWithPowerShell() {
  const srcGlob = join(outDir, "*").replace(/'/g, "''");
  const dest = zipPath.replace(/'/g, "''");
  const cmd = `Import-Module Microsoft.PowerShell.Archive -ErrorAction Stop; Compress-Archive -Force -Path '${srcGlob}' -DestinationPath '${dest}'`;
  await execFileAsync("powershell", ["-NoProfile", "-Command", cmd]);
}

async function zipWithTar() {
  await execFileAsync("tar", ["-a", "-c", "-f", zipPath, "-C", outDir, "."]);
}

async function main() {
  console.log("Building UI...");
  await execFileAsync(process.platform === "win32" ? "bun.exe" : "bun", ["run", "build"], {
    cwd: ROOT,
    stdio: "inherit",
  }).catch(() =>
    execFileAsync("bunx", ["vite", "build"], { cwd: ROOT })
  );

  console.log("Compiling standalone binary...");
  await execFileAsync(
    process.platform === "win32" ? "bun.exe" : "bun",
    ["build", "--compile", "--target=bun-windows-x64", "src/server/index.mjs", "--outfile", exeName],
    { cwd: ROOT }
  );

  await ensureExists(distDir, "dist/");
  await ensureExists(exeOut, exeName);

  console.log(`Assembling standalone package → ${outDir}`);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await cp(exeOut, join(outDir, exeName));
  await cp(distDir, join(outDir, "dist"), { recursive: true });
  // Tray binary must live next to the exe so the server can pre-populate
  // systray's cache on first launch (compiled binaries can't read node_modules)
  try {
    await cp(trayBin, join(outDir, "tray_windows_release.exe"));
  } catch {
    console.warn("systray tray binary not found — tray icon will not work in standalone mode.");
  }

  await rm(zipPath, { force: true });
  console.log(`Zipping → ${zipPath}`);
  try {
    await zipWithPowerShell();
  } catch {
    await zipWithTar();
  }

  console.log(`Done: ${zipPath}`);
  console.log(`  ${outDir}/`);
  console.log(`    ${exeName}`);
  console.log(`    dist/   ← required alongside the exe`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
