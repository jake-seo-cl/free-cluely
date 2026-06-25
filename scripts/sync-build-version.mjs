import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const packagePath = path.join(repoRoot, "package.json")
const packageLockPath = path.join(repoRoot, "package-lock.json")
const generatedPath = path.join(repoRoot, "src", "generated", "buildVersion.ts")
const shouldDryRun = process.argv.includes("--dry-run")
const shouldSyncOnly = process.argv.includes("--sync-only")

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"))
const writeJson = (filePath, value) => {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

const parseVersion = (version) => {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) {
    throw new Error(`Expected package version to use x.y.z format, got "${version}"`)
  }

  const [, major, minor, patch] = match
  return {
    major: Number.parseInt(major, 10),
    minor: Number.parseInt(minor, 10),
    patch: Number.parseInt(patch, 10)
  }
}

const bumpVersion = (version) => {
  const next = { ...version, patch: version.patch + 1 }
  if (next.patch > 999) {
    next.patch = 0
    next.minor += 1
  }

  if (next.minor > 99) {
    next.minor = 0
    next.major += 1
  }

  return next
}

const formatSemver = ({ major, minor, patch }) => `${major}.${minor}.${patch}`
const formatDisplay = ({ major, minor, patch }) =>
  `v${major}.${String(minor).padStart(2, "0")}.${String(patch).padStart(3, "0")}`

const renderGeneratedVersion = (version) => {
  const semver = formatSemver(version)
  const display = formatDisplay(version)

  return [
    `export const BUILD_VERSION = "${display}"`,
    `export const BUILD_SEMVER = "${semver}"`,
    "export const BUILD_VERSION_PARTS = {",
    `  major: ${version.major},`,
    `  minor: ${version.minor},`,
    `  patch: ${version.patch}`,
    "} as const",
    ""
  ].join("\n")
}

const syncPackageLockVersion = (semver) => {
  if (!fs.existsSync(packageLockPath)) return

  const packageLock = readJson(packageLockPath)
  packageLock.version = semver
  if (packageLock.packages?.[""]) {
    packageLock.packages[""].version = semver
  }
  writeJson(packageLockPath, packageLock)
}

const writeGeneratedVersion = (version) => {
  const source = renderGeneratedVersion(version)
  fs.mkdirSync(path.dirname(generatedPath), { recursive: true })

  if (!fs.existsSync(generatedPath) || fs.readFileSync(generatedPath, "utf8") !== source) {
    fs.writeFileSync(generatedPath, source)
  }
}

const packageJson = readJson(packagePath)
const current = parseVersion(packageJson.version || "0.0.0")
const next = shouldSyncOnly ? current : bumpVersion(current)
const currentDisplay = formatDisplay(current)
const currentSemver = formatSemver(current)
const nextDisplay = formatDisplay(next)
const nextSemver = formatSemver(next)

if (shouldDryRun) {
  console.log(
    shouldSyncOnly
      ? `Current build version is ${currentDisplay} (${currentSemver}); sync-only would keep this version.`
      : `Current build version is ${currentDisplay} (${currentSemver}); next build will be ${nextDisplay} (${nextSemver}).`
  )
  process.exit(0)
}

packageJson.version = nextSemver
writeJson(packagePath, packageJson)
syncPackageLockVersion(nextSemver)
writeGeneratedVersion(next)

console.log(
  shouldSyncOnly
    ? `Synced build version ${nextDisplay} (${nextSemver}).`
    : `Bumped build version to ${nextDisplay} (${nextSemver}).`
)
