import { app, BrowserWindow } from "electron"
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import readline from "node:readline"

type NativeAudioMessage =
  | { type: "ready" }
  | { type: "chunk"; data: string; mimeType: string }
  | { type: "error"; message: string }

export class MacSystemAudioCapture {
  private process: ChildProcessWithoutNullStreams | null = null
  private isStopping = false

  constructor(private readonly getMainWindow: () => BrowserWindow | null) {}

  public isAvailable(): boolean {
    return process.platform === "darwin" && fs.existsSync(this.getBinaryPath())
  }

  public async start(chunkSeconds: number): Promise<{ success: boolean; error?: string }> {
    if (process.platform !== "darwin") {
      return { success: false, error: "Native system audio capture is macOS-only." }
    }

    if (this.process) {
      return { success: true }
    }

    const binaryPath = this.getBinaryPath()
    if (!fs.existsSync(binaryPath)) {
      return { success: false, error: "Native system audio helper is not built." }
    }

    return new Promise((resolve) => {
      const child = spawn(binaryPath, ["--chunk-seconds", String(Math.max(1, chunkSeconds))], {
        stdio: ["pipe", "pipe", "pipe"]
      })
      this.process = child
      this.isStopping = false

      let settled = false
      const settle = (result: { success: boolean; error?: string }) => {
        if (settled) return
        settled = true
        resolve(result)
      }

      const timeout = setTimeout(() => {
        settle({ success: false, error: "Native system audio helper did not become ready." })
        this.stop()
      }, 15_000)

      const lines = readline.createInterface({ input: child.stdout })
      lines.on("line", (line) => {
        const message = this.parseMessage(line)
        if (!message) return

        if (message.type === "ready") {
          clearTimeout(timeout)
          settle({ success: true })
          return
        }

        if (message.type === "chunk") {
          this.getMainWindow()?.webContents.send("native-system-audio-chunk", {
            data: message.data,
            mimeType: message.mimeType
          })
          return
        }

        clearTimeout(timeout)
        if (!settled) {
          settle({ success: false, error: message.message })
        } else {
          this.getMainWindow()?.webContents.send("native-system-audio-error", message.message)
        }
      })

      child.stderr.on("data", (data) => {
        console.error("[MacSystemAudioCapture]", String(data).trim())
      })

      child.on("exit", (code, signal) => {
        clearTimeout(timeout)
        lines.close()
        const wasStopping = this.isStopping
        this.isStopping = false
        if (this.process === child) {
          this.process = null
        }
        if (wasStopping) return

        if (!settled && code !== 0) {
          settle({
            success: false,
            error: `Native system audio helper exited with ${signal || code}.`
          })
        } else if (settled && code !== 0) {
          this.getMainWindow()?.webContents.send(
            "native-system-audio-error",
            `Native system audio helper exited with ${signal || code}.`
          )
        }
      })
    })
  }

  public async stop(): Promise<void> {
    const child = this.process
    if (!child) return

    this.process = null
    this.isStopping = true
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL")
        resolve()
      }, 2_000)

      child.once("exit", () => {
        clearTimeout(timeout)
        resolve()
      })

      if (child.stdin?.writable) {
        child.stdin.write("stop\n")
        child.stdin.end()
      } else {
        child.kill("SIGTERM")
      }
    })
  }

  private getBinaryPath(): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, "native", "macos-system-audio-capture")
      : path.join(app.getAppPath(), "native", "bin", "macos-system-audio-capture")
  }

  private parseMessage(line: string): NativeAudioMessage | null {
    try {
      const value = JSON.parse(line) as NativeAudioMessage
      if (!value || typeof value.type !== "string") return null
      return value
    } catch {
      console.warn("[MacSystemAudioCapture] Ignoring non-JSON output:", line)
      return null
    }
  }
}
