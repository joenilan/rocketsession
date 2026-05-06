import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync, cpSync } from 'node:fs'
import { resolve, join } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const version = readFileSync(resolve(appRoot, 'VERSION'), 'utf8').trim()
const nsisDir = resolve(appRoot, 'src-tauri', 'target', 'release', 'bundle', 'nsis')
const portableExe = resolve(appRoot, 'src-tauri', 'target', 'release', 'rocket-session-stats.exe')
const distDir = resolve(appRoot, 'dist')
const releaseRoot = resolve(appRoot, 'release', 'windows')
const releaseSlug = 'rocket-session'

rmSync(releaseRoot, { recursive: true, force: true })
mkdirSync(releaseRoot, { recursive: true })

const packagedArtifacts = []

// NSIS installer
const setupSource = findArtifact(nsisDir, '.exe')
const setupName = `${releaseSlug}_${version}_x64-setup.exe`
const setupTarget = join(releaseRoot, setupName)
copyFileSync(setupSource, setupTarget)
const setupSha256 = sha256File(setupTarget)
writeFileSync(`${setupTarget}.sha256`, `${setupSha256}  ${setupName}\n`)
packagedArtifacts.push({ kind: 'setup', file: setupName, size: statSync(setupTarget).size, sha256: setupSha256 })

// Portable ZIP — exe + dist folder (needed to serve the OBS overlay)
const portableName = `${releaseSlug}_${version}_x64_portable.zip`
const portableTarget = join(releaseRoot, portableName)
const portableExeEscaped = portableExe.replace(/\\/g, '\\\\')
const distDirEscaped = distDir.replace(/\\/g, '\\\\')
const portableTargetEscaped = portableTarget.replace(/\\/g, '\\\\')
const psScript = `
  $tmp = Join-Path $env:TEMP "rss_portable_${version}"
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Path $tmp | Out-Null
  Copy-Item '${portableExeEscaped}' -Destination $tmp
  Copy-Item '${distDirEscaped}' -Destination "$tmp\\dist" -Recurse
  Compress-Archive -Path "$tmp\\*" -DestinationPath '${portableTargetEscaped}' -Force
  Remove-Item $tmp -Recurse -Force
`.trim().replace(/\n\s+/g, '; ')
execSync(`powershell -NoProfile -Command "${psScript}"`, { stdio: 'inherit' })
const portableSha256 = sha256File(portableTarget)
writeFileSync(`${portableTarget}.sha256`, `${portableSha256}  ${portableName}\n`)
packagedArtifacts.push({ kind: 'portable', file: portableName, size: statSync(portableTarget).size, sha256: portableSha256 })

const manifest = {
  version,
  generatedAt: new Date().toISOString(),
  artifacts: packagedArtifacts,
}

writeFileSync(resolve(releaseRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

console.log(`Packaged Windows release artifacts for ${version}:`)
for (const artifact of packagedArtifacts) {
  console.log(`- ${artifact.file}`)
}

function findArtifact(directory, suffix) {
  const entries = readdirSync(directory, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(suffix) && !e.name.endsWith('.sha256'))
    .map((e) => join(directory, e.name))

  if (entries.length === 0) {
    throw new Error(`No artifact with suffix "${suffix}" found in ${directory}`)
  }

  if (entries.length > 1) {
    entries.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    for (const stale of entries.slice(1)) {
      rmSync(stale)
    }
  }

  return entries[0]
}

function sha256File(filePath) {
  const buffer = readFileSync(filePath)
  return createHash('sha256').update(buffer).digest('hex')
}
