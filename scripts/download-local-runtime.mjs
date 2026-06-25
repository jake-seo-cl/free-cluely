import fs from "node:fs/promises"
import { createWriteStream } from "node:fs"
import path from "node:path"
import os from "node:os"
import { pipeline } from "node:stream/promises"
import { Readable } from "node:stream"
import { spawn } from "node:child_process"

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname)
const target = process.env.SIDEKICK_RUNTIME_TARGET || `${platformName()}-${archName()}`
const runtimeName = target.startsWith("windows") ? "ollama.exe" : "ollama"
const outputDir = path.join(repoRoot, "assets", "runtime", target)
const outputPath = path.join(outputDir, runtimeName)

function platformName() {
  if (process.platform === "darwin") return "macos"
  if (process.platform === "win32") return "windows"
  return "linux"
}

function archName() {
  return process.arch === "arm64" ? "arm64" : "x64"
}

function preferredAssetNames() {
  if (target.startsWith("macos")) return ["ollama-darwin.tgz"]
  if (target === "windows-arm64") return ["ollama-windows-arm64.zip"]
  if (target === "windows-x64") return ["ollama-windows-amd64.zip"]
  if (target === "linux-arm64") return ["ollama-linux-arm64.tar.zst"]
  return ["ollama-linux-amd64.tar.zst"]
}

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" })
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)))
    child.on("error", reject)
  })
}

async function fetchLatestRelease() {
  const response = await fetch("https://api.github.com/repos/ollama/ollama/releases/latest", {
    headers: { Accept: "application/vnd.github+json" }
  })
  if (!response.ok) {
    throw new Error(`Could not fetch Ollama release metadata: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

async function download(url, destination) {
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`)
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination))
}

async function extract(archivePath, destination) {
  await fs.mkdir(destination, { recursive: true })
  const lower = archivePath.toLowerCase()
  if (lower.endsWith(".zip")) {
    if (process.platform === "win32") {
      await run("powershell.exe", [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}' -Force`
      ])
    } else {
      await run("/usr/bin/ditto", ["-x", "-k", archivePath, destination])
    }
    return
  }

  if (lower.endsWith(".tar.zst")) {
    await run("tar", ["--zstd", "-xf", archivePath, "-C", destination])
    return
  }

  await run("tar", ["-xzf", archivePath, "-C", destination])
}

async function findRuntimeBinary(root) {
  const entries = await fs.readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      const nested = await findRuntimeBinary(entryPath)
      if (nested) return nested
    } else if (entry.name.toLowerCase() === runtimeName.toLowerCase()) {
      return entryPath
    }
  }
  return null
}

async function main() {
  if (await exists(outputPath)) {
    console.log(`Sidekick Local runtime already bundled at ${path.relative(repoRoot, outputPath)}`)
    return
  }

  const release = await fetchLatestRelease()
  const assetNames = preferredAssetNames()
  const asset = release.assets.find((item) => assetNames.includes(item.name))
  if (!asset) {
    throw new Error(`No supported Ollama runtime asset found for ${target}`)
  }

  console.log(`Downloading ${asset.name} from Ollama ${release.tag_name} for ${target}`)
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sidekick-runtime-bundle-"))
  const archivePath = path.join(tempRoot, asset.name)
  const extractPath = path.join(tempRoot, "extract")
  await download(asset.browser_download_url, archivePath)
  await extract(archivePath, extractPath)

  const binaryPath = await findRuntimeBinary(extractPath)
  if (!binaryPath) {
    throw new Error(`Could not find ${runtimeName} in ${asset.name}`)
  }

  await fs.mkdir(outputDir, { recursive: true })
  await fs.copyFile(binaryPath, outputPath)
  if (!target.startsWith("windows")) {
    await fs.chmod(outputPath, 0o755)
  }
  await fs.rm(tempRoot, { recursive: true, force: true })
  console.log(`Bundled Sidekick Local runtime at ${path.relative(repoRoot, outputPath)}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
