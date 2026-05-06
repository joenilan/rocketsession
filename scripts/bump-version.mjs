import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Usage: node scripts/bump-version.mjs [patch|minor|major|sync]
const type = process.argv[2] || "patch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, "..");

const VERSION_FILE = path.join(APP_ROOT, "VERSION");
const ROOT_PKG    = path.join(APP_ROOT, "package.json");
const TAURI_CONF  = path.join(APP_ROOT, "src-tauri", "tauri.conf.json");
const CARGO_TOML  = path.join(APP_ROOT, "src-tauri", "Cargo.toml");
const CARGO_LOCK  = path.join(APP_ROOT, "src-tauri", "Cargo.lock");

function validateSemver(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Invalid version "${version}". Expected format: major.minor.patch`);
  }
}

function updateFile(filePath, regex, replacement) {
  if (!fs.existsSync(filePath)) { console.warn(`File not found: ${filePath}`); return; }
  const content = fs.readFileSync(filePath, "utf8");
  const newContent = content.replace(regex, replacement);
  fs.writeFileSync(filePath, newContent, "utf8");
  console.log(`Updated ${filePath}`);
}

function updateCargoLock(filePath, version) {
  if (!fs.existsSync(filePath)) { console.warn(`File not found: ${filePath}`); return; }
  const content = fs.readFileSync(filePath, "utf8");
  const regex = /(name\s*=\s*"rocket-session-stats"\s*[\r\n]+version\s*=\s*")[^"]*(")/;
  const newContent = content.replace(regex, `$1${version}$2`);
  if (newContent === content) { console.warn(`No rocket-session-stats entry found in ${filePath}`); return; }
  fs.writeFileSync(filePath, newContent, "utf8");
  console.log(`Updated ${filePath}`);
}

function bumpVersion(current, bumpType) {
  const base = current.split("-")[0];
  let [major, minor, patch] = base.split(".").map(Number);
  if (bumpType === "major") { major++; minor = 0; patch = 0; }
  else if (bumpType === "minor") { minor++; patch = 0; }
  else if (bumpType === "patch") { patch++; }
  return `${major}.${minor}.${patch}`;
}

if (type === "check-notes") {
  const PATCH_NOTES = path.join(APP_ROOT, "PATCH_NOTES.md");
  const patchNotesSource = fs.existsSync(PATCH_NOTES) ? fs.readFileSync(PATCH_NOTES, "utf8") : "";
  const versionPattern = new RegExp(`^##\\s+${oldVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m");
  if (!versionPattern.test(patchNotesSource)) {
    console.error(`PATCH_NOTES.md is missing a "## ${oldVersion}" section.`);
    process.exit(1);
  }
  console.log(`PATCH_NOTES.md includes ${oldVersion}.`);
  process.exit(0);
}

if (!["patch", "minor", "major", "sync"].includes(type)) {
  console.error(`Unknown version command "${type}". Use patch, minor, major, sync, or check-notes.`);
  process.exit(1);
}

let oldVersion = null;
if (fs.existsSync(VERSION_FILE)) {
  oldVersion = fs.readFileSync(VERSION_FILE, "utf8").trim();
}
if (!oldVersion) {
  const pkg = JSON.parse(fs.readFileSync(ROOT_PKG, "utf8"));
  oldVersion = String(pkg.version || "").trim();
}
validateSemver(oldVersion);

const newVersion = type === "sync" ? oldVersion : bumpVersion(oldVersion, type);
console.log(`Bumping version ${oldVersion} -> ${newVersion} (${type})`);

fs.writeFileSync(VERSION_FILE, `${newVersion}\n`, "utf8");
console.log(`Updated ${VERSION_FILE}`);

updateFile(ROOT_PKG,   /"version":\s*"[^"]*"/, `"version": "${newVersion}"`);
updateFile(TAURI_CONF, /"version":\s*"[^"]*"/, `"version": "${newVersion}"`);
updateFile(CARGO_TOML, /^version\s*=\s*"[^"]*"/m, `version = "${newVersion}"`);
updateCargoLock(CARGO_LOCK, newVersion);

console.log("Done!");
