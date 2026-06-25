import { app } from "electron"
import { ChildProcess, spawn } from "child_process"
import fs from "fs"
import path from "path"
import { pipeline } from "stream/promises"
import { Readable } from "stream"
import os from "os"

type RuntimeSource = "bundled" | "managed" | "external" | "missing"

interface GitHubReleaseAsset {
  name: string
  browser_download_url: string
}

interface GitHubRelease {
  tag_name: string
  assets: GitHubReleaseAsset[]
}

export interface LocalRuntimeStatus {
  installed: boolean
  running: boolean
  source: RuntimeSource
  url: string
  binaryPath?: string
  modelDir: string
  message: string
}

export class LocalRuntimeManager {
  private process: ChildProcess | null = null
  private readonly host = "127.0.0.1"
  private readonly port = 11435
  private readonly runtimeName = process.platform === "win32" ? "ollama.exe" : "ollama"

  public getUrl(): string {
    return `http://${this.host}:${this.port}`
  }

  private getManagedRoot(): string {
    return path.join(app.getPath("userData"), "local-runtime")
  }

  private getManagedBinDir(): string {
    return path.join(this.getManagedRoot(), "bin")
  }

  private getManagedBinaryPath(): string {
    return path.join(this.getManagedBinDir(), this.runtimeName)
  }

  private getModelDir(): string {
    return path.join(app.getPath("userData"), "local-models")
  }

  private getPlatformKey(): string {
    const platform =
      process.platform === "darwin"
        ? "macos"
        : process.platform === "win32"
          ? "windows"
          : "linux"
    const arch = process.arch === "arm64" ? "arm64" : "x64"
    return `${platform}-${arch}`
  }

  private candidateBundledPaths(): string[] {
    const platformKey = this.getPlatformKey()
    const resourceRoots = [
      path.join(process.resourcesPath || "", "assets", "runtime"),
      path.join(app.getAppPath(), "assets", "runtime"),
      path.join(__dirname, "..", "assets", "runtime")
    ]

    return resourceRoots.flatMap((root) => [
      path.join(root, platformKey, this.runtimeName),
      path.join(root, this.runtimeName)
    ])
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath, fs.constants.X_OK)
      return true
    } catch {
      return false
    }
  }

  private async findBinary(): Promise<{ source: RuntimeSource; binaryPath?: string }> {
    const explicitPath = process.env.SIDEKICK_LOCAL_RUNTIME_PATH
    if (explicitPath && await this.pathExists(explicitPath)) {
      return { source: "managed", binaryPath: explicitPath }
    }

    for (const bundledPath of this.candidateBundledPaths()) {
      if (await this.pathExists(bundledPath)) {
        return { source: "bundled", binaryPath: bundledPath }
      }
    }

    const managedPath = this.getManagedBinaryPath()
    if (await this.pathExists(managedPath)) {
      return { source: "managed", binaryPath: managedPath }
    }

    return { source: "missing" }
  }

  private async isApiRunning(): Promise<boolean> {
    try {
      const response = await fetch(`${this.getUrl()}/api/tags`)
      return response.ok
    } catch {
      return false
    }
  }

  public async getStatus(): Promise<LocalRuntimeStatus> {
    const binary = await this.findBinary()
    const running = await this.isApiRunning()
    return {
      installed: Boolean(binary.binaryPath),
      running,
      source: binary.source,
      url: this.getUrl(),
      binaryPath: binary.binaryPath,
      modelDir: this.getModelDir(),
      message: binary.binaryPath
        ? running
          ? "Sidekick Local is ready"
          : "Sidekick Local is installed but stopped"
        : "Sidekick Local runtime is not installed"
    }
  }

  public async ensureStarted(): Promise<LocalRuntimeStatus> {
    const status = await this.getStatus()
    if (status.running) return status
    if (!status.binaryPath) return status

    await fs.promises.mkdir(this.getModelDir(), { recursive: true })
    this.process = spawn(status.binaryPath, ["serve"], {
      env: {
        ...process.env,
        OLLAMA_HOST: `${this.host}:${this.port}`,
        OLLAMA_MODELS: this.getModelDir()
      },
      stdio: "ignore",
      windowsHide: true
    })
    this.process.unref()

    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (await this.isApiRunning()) {
        return this.getStatus()
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    return {
      ...(await this.getStatus()),
      message: "Sidekick Local started, but the API did not become ready"
    }
  }

  private assetMatchesCurrentPlatform(assetName: string): boolean {
    const name = assetName.toLowerCase()
    const isArm = process.arch === "arm64"
    const isX64 = process.arch === "x64"

    if (process.platform === "darwin") {
      return (
        /(darwin|mac|macos|apple)/.test(name) &&
        ((isArm && /(arm64|aarch64|universal)/.test(name)) ||
          (isX64 && /(amd64|x64|x86_64|universal)/.test(name))) &&
        /\.(zip|tgz|tar\.gz)$/.test(name)
      )
    }

    if (process.platform === "win32") {
      return (
        /(windows|win)/.test(name) &&
        ((isArm && /(arm64|aarch64)/.test(name)) || (isX64 && /(amd64|x64|x86_64)/.test(name))) &&
        /\.(zip|tgz|tar\.gz)$/.test(name)
      )
    }

    return (
      /linux/.test(name) &&
      ((isArm && /(arm64|aarch64)/.test(name)) || (isX64 && /(amd64|x64|x86_64)/.test(name))) &&
      /\.(zip|tgz|tar\.gz)$/.test(name)
    )
  }

  private async getLatestRuntimeAsset(): Promise<GitHubReleaseAsset | null> {
    const response = await fetch("https://api.github.com/repos/ollama/ollama/releases/latest", {
      headers: {
        Accept: "application/vnd.github+json"
      }
    })
    if (!response.ok) {
      throw new Error(`Could not check runtime release: ${response.status} ${response.statusText}`)
    }
    const release = (await response.json()) as GitHubRelease
    return release.assets.find((asset) => this.assetMatchesCurrentPlatform(asset.name)) || null
  }

  private async downloadFile(url: string, destination: string): Promise<void> {
    const response = await fetch(url)
    if (!response.ok || !response.body) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`)
    }
    await fs.promises.mkdir(path.dirname(destination), { recursive: true })
    await pipeline(Readable.fromWeb(response.body as any), fs.createWriteStream(destination))
  }

  private async extractArchive(archivePath: string, destination: string): Promise<void> {
    await fs.promises.mkdir(destination, { recursive: true })
    const lowerPath = archivePath.toLowerCase()

    if (lowerPath.endsWith(".zip")) {
      if (process.platform === "win32") {
        await new Promise<void>((resolve, reject) => {
          const child = spawn("powershell.exe", [
            "-NoProfile",
            "-Command",
            `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}' -Force`
          ], { windowsHide: true })
          child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Expand-Archive exited with ${code}`)))
          child.on("error", reject)
        })
        return
      }

      await new Promise<void>((resolve, reject) => {
        const child = spawn("/usr/bin/ditto", ["-x", "-k", archivePath, destination])
        child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`ditto exited with ${code}`)))
        child.on("error", reject)
      })
      return
    }

    await new Promise<void>((resolve, reject) => {
      const child = spawn("tar", ["-xzf", archivePath, "-C", destination])
      child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`tar exited with ${code}`)))
      child.on("error", reject)
    })
  }

  private async findExtractedBinary(root: string): Promise<string | null> {
    const entries = await fs.promises.readdir(root, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = path.join(root, entry.name)
      if (entry.isDirectory()) {
        const nested = await this.findExtractedBinary(entryPath)
        if (nested) return nested
      } else if (entry.name === this.runtimeName || entry.name.toLowerCase() === this.runtimeName.toLowerCase()) {
        return entryPath
      }
    }
    return null
  }

  public async installManagedRuntime(): Promise<LocalRuntimeStatus> {
    const existing = await this.findBinary()
    if (existing.binaryPath) return this.ensureStarted()

    const asset = await this.getLatestRuntimeAsset()
    if (!asset) {
      throw new Error("No compatible Sidekick Local runtime asset was found for this platform.")
    }

    const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "sidekick-runtime-"))
    const archivePath = path.join(tempRoot, asset.name)
    const extractPath = path.join(tempRoot, "extract")
    await this.downloadFile(asset.browser_download_url, archivePath)
    await this.extractArchive(archivePath, extractPath)
    const binaryPath = await this.findExtractedBinary(extractPath)
    if (!binaryPath) {
      throw new Error("Downloaded runtime did not contain a compatible binary.")
    }

    await fs.promises.mkdir(this.getManagedBinDir(), { recursive: true })
    await fs.promises.copyFile(binaryPath, this.getManagedBinaryPath())
    if (process.platform !== "win32") {
      await fs.promises.chmod(this.getManagedBinaryPath(), 0o755)
    }
    await fs.promises.rm(tempRoot, { recursive: true, force: true })

    return this.ensureStarted()
  }

  public async ensureInstalledAndStarted(): Promise<LocalRuntimeStatus> {
    const binary = await this.findBinary()
    if (!binary.binaryPath) {
      return this.installManagedRuntime()
    }
    return this.ensureStarted()
  }

  public async stop(): Promise<void> {
    if (this.process && !this.process.killed) {
      this.process.kill()
    }
    this.process = null
  }
}
