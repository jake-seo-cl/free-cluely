import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const packagePath = path.join(repoRoot, "package.json")
const generatedPath = path.join(repoRoot, "src", "generated", "buildVersion.ts")

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"))

const parseVersion = (version) => {
  const [major = "0", minor = "0", patch = "0"] = version.split(".")
  return {
    major: Number.parseInt(major, 10) || 0,
    minor: Number.parseInt(minor, 10) || 0,
    patch: Number.parseInt(patch, 10) || 0
  }
}

const formatDisplay = ({ major, minor, patch }) =>
  `v${major}.${String(minor).padStart(2, "0")}.${String(patch).padStart(3, "0")}`

const packageJson = readJson(packagePath)
const semver = String(packageJson.version || "0.0.0")
const version = parseVersion(semver)
const display = formatDisplay(version)
const source = [
  `export const BUILD_VERSION = "${display}"`,
  `export const BUILD_SEMVER = "${semver}"`,
  "export const BUILD_VERSION_PARTS = {",
  `  major: ${version.major},`,
  `  minor: ${version.minor},`,
  `  patch: ${version.patch}`,
  "} as const",
  ""
].join("\n")

fs.mkdirSync(path.dirname(generatedPath), { recursive: true })

if (!fs.existsSync(generatedPath) || fs.readFileSync(generatedPath, "utf8") !== source) {
  fs.writeFileSync(generatedPath, source)
}
