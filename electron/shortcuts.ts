import { app, globalShortcut } from "electron"
import { ShortcutAction } from "./AppSettings"
import { AppState } from "./main"

export class ShortcutsHelper {
  private appState: AppState
  private registeredAccelerators = new Set<string>()

  constructor(appState: AppState) {
    this.appState = appState
    app.on("will-quit", () => {
      this.unregisterGlobalShortcuts()
    })
  }

  private emitMeetingShortcut(action: string): void {
    const mainWindow = this.appState.getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("meeting-shortcut", action)
    }
  }

  private async takeScreenshot(): Promise<void> {
    const mainWindow = this.appState.getMainWindow()
    if (!mainWindow) return

    console.log("Taking screenshot...")
    try {
      const screenshotPath = await this.appState.takeScreenshot()
      const preview = await this.appState.getImagePreview(screenshotPath)
      mainWindow.webContents.send("screenshot-taken", {
        path: screenshotPath,
        preview
      })
    } catch (error) {
      console.error("Error capturing screenshot:", error)
    }
  }

  private resetSession(): void {
    console.log("Reset shortcut pressed. Canceling requests and resetting queues...")

    this.appState.processingHelper.cancelOngoingRequests()
    this.appState.clearQueues()
    this.appState.setView("queue")

    const mainWindow = this.appState.getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("reset-view")
    }
  }

  private registerShortcut(
    accelerator: string,
    action: ShortcutAction,
    handler: () => void | Promise<void>
  ): void {
    const normalized = accelerator.trim()
    if (!normalized) return
    if (this.registeredAccelerators.has(normalized)) {
      console.warn(`Duplicate shortcut skipped for ${action}: ${normalized}`)
      return
    }

    const didRegister = globalShortcut.register(normalized, handler) as unknown as boolean
    if (didRegister) {
      this.registeredAccelerators.add(normalized)
    } else {
      console.warn(`Could not register shortcut for ${action}: ${normalized}`)
    }
  }

  public unregisterGlobalShortcuts(): void {
    for (const accelerator of this.registeredAccelerators) {
      globalShortcut.unregister(accelerator)
    }
    this.registeredAccelerators.clear()
  }

  public registerGlobalShortcuts(): void {
    this.unregisterGlobalShortcuts()

    const settings = this.appState.getControlSettings()
    if (!settings.shortcuts.enabled) return

    const handlers: Record<ShortcutAction, () => void | Promise<void>> = {
      show_overlay: () => {
        console.log("Show overlay shortcut pressed...")
        this.appState.centerAndShowWindow()
      },
      toggle_overlay: () => {
        this.appState.toggleMainWindow()
        const mainWindow = this.appState.getMainWindow()
        if (mainWindow && this.appState.isVisible() && process.platform === "darwin") {
          mainWindow.setAlwaysOnTop(true, "normal")
          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.setAlwaysOnTop(true, "floating")
            }
          }, 100)
        }
      },
      reset_overlay_position: () => this.appState.resetWindowPosition(),
      take_screenshot: () => this.takeScreenshot(),
      manual_answer: () => this.emitMeetingShortcut("manual_answer"),
      recap: () => this.emitMeetingShortcut("recap"),
      follow_up_question: () => this.emitMeetingShortcut("follow_up_question"),
      action_items: () => this.emitMeetingShortcut("action_items"),
      reset_session: () => this.resetSession(),
      move_left: () => this.appState.moveWindowLeft(),
      move_right: () => this.appState.moveWindowRight(),
      move_up: () => this.appState.moveWindowUp(),
      move_down: () => this.appState.moveWindowDown()
    }

    for (const [action, accelerator] of Object.entries(settings.shortcuts.bindings)) {
      this.registerShortcut(
        accelerator,
        action as ShortcutAction,
        handlers[action as ShortcutAction]
      )
    }
  }
}
