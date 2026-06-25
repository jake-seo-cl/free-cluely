import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const sourcePath = path.join(repoRoot, "native", "macos-system-audio-capture", "main.swift")
const outputDir = path.join(repoRoot, "native", "bin")
const outputPath = path.join(outputDir, "macos-system-audio-capture")
const moduleCachePath = path.join(repoRoot, "node_modules", ".cache", "swift-module-cache")

if (process.platform !== "darwin") {
  console.log("Skipping native macOS audio helper build on this platform.")
  process.exit(0)
}

fs.mkdirSync(outputDir, { recursive: true })
fs.mkdirSync(moduleCachePath, { recursive: true })

const result = spawnSync(
  "xcrun",
  [
    "swiftc",
    "-O",
    "-target",
    "arm64-apple-macos13.0",
    sourcePath,
    "-o",
    outputPath,
    "-framework",
    "ScreenCaptureKit",
    "-framework",
    "AVFoundation",
    "-framework",
    "CoreMedia"
  ],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      CLANG_MODULE_CACHE_PATH: moduleCachePath
    },
    stdio: "inherit"
  }
)

if (result.status !== 0) {
  process.exit(result.status || 1)
}
