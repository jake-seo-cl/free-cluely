import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  desktopCapturer,
  session,
  shell,
  systemPreferences
} from "electron"
import { initializeIpcHandlers } from "./ipcHandlers"
import { WindowHelper } from "./WindowHelper"
import { ScreenshotHelper } from "./ScreenshotHelper"
import { ShortcutsHelper } from "./shortcuts"
import { ProcessingHelper } from "./ProcessingHelper"
import { LocalRuntimeManager } from "./LocalRuntimeManager"
import { MacSystemAudioCapture } from "./MacSystemAudioCapture"
import path from "node:path"
import {
  AppSettingsStore,
  ControlSettings,
  ControlSettingsPatch
} from "./AppSettings"

const getAssetPath = (...parts: string[]) =>
  app.isPackaged
    ? path.join(process.resourcesPath, "assets", ...parts)
    : path.join(app.getAppPath(), "assets", ...parts)

export type AudioCaptureCapabilities = {
  platform: NodeJS.Platform
  supportsSystemAudio: boolean
  systemAudioCapturePath: "loopback" | "system-picker" | "unsupported"
  requiresUserPrompt: boolean
  screenPermission: "not-determined" | "granted" | "denied" | "restricted" | "unknown"
  nativeSystemAudioAvailable: boolean
  unsupportedReason?: string
}

function getScreenPermissionStatus(): AudioCaptureCapabilities["screenPermission"] {
  if (process.platform !== "darwin" && process.platform !== "win32") {
    return "unknown"
  }

  return systemPreferences.getMediaAccessStatus("screen")
}

function getAudioCaptureCapabilities(): AudioCaptureCapabilities {
  const screenPermission = getScreenPermissionStatus()

  if (process.platform === "win32") {
    return {
      platform: process.platform,
      supportsSystemAudio: true,
      systemAudioCapturePath: "loopback",
      requiresUserPrompt: false,
      screenPermission,
      nativeSystemAudioAvailable: false
    }
  }

  if (process.platform === "darwin") {
    return {
      platform: process.platform,
      supportsSystemAudio: true,
      systemAudioCapturePath: "system-picker",
      requiresUserPrompt: true,
      screenPermission,
      nativeSystemAudioAvailable: false,
      unsupportedReason:
        screenPermission === "denied" || screenPermission === "restricted"
          ? "Screen Recording permission is required for system audio capture."
          : undefined
    }
  }

  return {
    platform: process.platform,
    supportsSystemAudio: false,
    systemAudioCapturePath: "unsupported",
    requiresUserPrompt: false,
    screenPermission,
    nativeSystemAudioAvailable: false,
    unsupportedReason: "System audio capture is not available on this platform."
  }
}

function registerSystemAudioCapture(): void {
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 0, height: 0 }
      })
      const screen = sources[0]
      if (!screen) {
        callback({})
        return
      }

      const streams: Electron.Streams = { video: screen }
      if (process.platform === "win32") {
        streams.audio = "loopback"
      }

      callback(streams)
    } catch (error) {
      console.error("Unable to resolve display media source:", error)
      callback({})
    }
  }, { useSystemPicker: process.platform === "darwin" })
}

function createTrayImage() {
  const image = nativeImage
    .createFromPath(getAssetPath("icons", "tray", "sidekickTemplate.png"))
    .resize({ width: 18, height: 18 })
  image.setTemplateImage(true)
  return image
}

export class AppState {
  private static instance: AppState | null = null

  private windowHelper: WindowHelper
  private screenshotHelper: ScreenshotHelper
  public shortcutsHelper: ShortcutsHelper
  public processingHelper: ProcessingHelper
  public localRuntimeManager: LocalRuntimeManager
  private macSystemAudioCapture: MacSystemAudioCapture
  private settingsStore: AppSettingsStore
  private tray: Tray | null = null

  // View management
  private view: "queue" | "solutions" = "queue"

  private problemInfo: {
    problem_statement: string
    input_format: Record<string, any>
    output_format: Record<string, any>
    constraints: Array<Record<string, any>>
    test_cases: Array<Record<string, any>>
  } | null = null // Allow null

  private hasDebugged: boolean = false

  // Processing events
  public readonly PROCESSING_EVENTS = {
    //global states
    UNAUTHORIZED: "procesing-unauthorized",
    NO_SCREENSHOTS: "processing-no-screenshots",

    //states for generating the initial solution
    INITIAL_START: "initial-start",
    PROBLEM_EXTRACTED: "problem-extracted",
    SOLUTION_SUCCESS: "solution-success",
    INITIAL_SOLUTION_ERROR: "solution-error",

    //states for processing the debugging
    DEBUG_START: "debug-start",
    DEBUG_SUCCESS: "debug-success",
    DEBUG_ERROR: "debug-error"
  } as const

  constructor() {
    // Initialize WindowHelper with this
    this.windowHelper = new WindowHelper(this)

    // Initialize ScreenshotHelper
    this.screenshotHelper = new ScreenshotHelper(this.view)

    // Initialize ProcessingHelper
    this.processingHelper = new ProcessingHelper(this)

    // Initialize managed local model runtime
    this.localRuntimeManager = new LocalRuntimeManager()

    // Initialize native macOS system audio capture bridge
    this.macSystemAudioCapture = new MacSystemAudioCapture(() => this.getMainWindow())

    // Initialize persisted app controls/settings
    this.settingsStore = new AppSettingsStore()

    // Initialize ShortcutsHelper
    this.shortcutsHelper = new ShortcutsHelper(this)
  }

  public static getInstance(): AppState {
    if (!AppState.instance) {
      AppState.instance = new AppState()
    }
    return AppState.instance
  }

  // Getters and Setters
  public getMainWindow(): BrowserWindow | null {
    return this.windowHelper.getMainWindow()
  }

  public getView(): "queue" | "solutions" {
    return this.view
  }

  public setView(view: "queue" | "solutions"): void {
    this.view = view
    this.screenshotHelper.setView(view)
  }

  public isVisible(): boolean {
    return this.windowHelper.isVisible()
  }

  public getScreenshotHelper(): ScreenshotHelper {
    return this.screenshotHelper
  }

  public getLocalRuntimeManager(): LocalRuntimeManager {
    return this.localRuntimeManager
  }

  public getControlSettings(): ControlSettings {
    return this.settingsStore.getSettings()
  }

  public updateControlSettings(patch: ControlSettingsPatch): ControlSettings {
    const settings = this.settingsStore.updateSettings(patch)
    this.windowHelper.applyControlSettings()
    this.shortcutsHelper.registerGlobalShortcuts()
    return settings
  }

  public resetControlSettings(): ControlSettings {
    const settings = this.settingsStore.resetSettings()
    this.windowHelper.applyControlSettings()
    this.shortcutsHelper.registerGlobalShortcuts()
    return settings
  }

  public getProblemInfo(): any {
    return this.problemInfo
  }

  public setProblemInfo(problemInfo: any): void {
    this.problemInfo = problemInfo
  }

  public getScreenshotQueue(): string[] {
    return this.screenshotHelper.getScreenshotQueue()
  }

  public getExtraScreenshotQueue(): string[] {
    return this.screenshotHelper.getExtraScreenshotQueue()
  }

  // Window management methods
  public createWindow(): void {
    this.windowHelper.createWindow()
  }

  public hideMainWindow(): void {
    this.windowHelper.hideMainWindow()
  }

  public showMainWindow(): void {
    this.windowHelper.showMainWindow()
  }

  public toggleMainWindow(): void {
    console.log(
      "Screenshots: ",
      this.screenshotHelper.getScreenshotQueue().length,
      "Extra screenshots: ",
      this.screenshotHelper.getExtraScreenshotQueue().length
    )
    this.windowHelper.toggleMainWindow()
  }

  public setWindowDimensions(width: number, height: number): void {
    this.windowHelper.setWindowDimensions(width, height)
  }

  public getWindowBounds(): Electron.Rectangle | null {
    return this.windowHelper.getWindowBounds()
  }

  public setWindowBounds(bounds: Electron.Rectangle): Electron.Rectangle | null {
    return this.windowHelper.setWindowBounds(bounds)
  }

  public setOverlayOpacity(opacity: number): number | null {
    return this.windowHelper.setOverlayOpacity(opacity)
  }

  public getAudioCaptureCapabilities(): AudioCaptureCapabilities {
    return {
      ...getAudioCaptureCapabilities(),
      nativeSystemAudioAvailable: this.hasNativeSystemAudioCapture()
    }
  }

  public async openSystemAudioPermissionSettings(): Promise<{ success: boolean }> {
    if (process.platform === "darwin") {
      await shell.openExternal(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
      )
      return { success: true }
    }

    if (process.platform === "win32") {
      await shell.openExternal("ms-settings:privacy-microphone")
      return { success: true }
    }

    return { success: false }
  }

  public hasNativeSystemAudioCapture(): boolean {
    return this.macSystemAudioCapture.isAvailable()
  }

  public startNativeSystemAudioCapture(
    chunkSeconds: number
  ): Promise<{ success: boolean; error?: string }> {
    return this.macSystemAudioCapture.start(chunkSeconds)
  }

  public stopNativeSystemAudioCapture(): Promise<void> {
    return this.macSystemAudioCapture.stop()
  }

  public clearQueues(): void {
    this.screenshotHelper.clearQueues()

    // Clear problem info
    this.problemInfo = null

    // Reset view to initial state
    this.setView("queue")
  }

  // Screenshot management methods
  public async takeScreenshot(): Promise<string> {
    if (!this.getMainWindow()) throw new Error("No main window available")

    const screenshotPath = await this.screenshotHelper.takeScreenshot(
      () => this.hideMainWindow(),
      () => this.showMainWindow()
    )

    return screenshotPath
  }

  public async getImagePreview(filepath: string): Promise<string> {
    return this.screenshotHelper.getImagePreview(filepath)
  }

  public async deleteScreenshot(
    path: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.screenshotHelper.deleteScreenshot(path)
  }

  // New methods to move the window
  public moveWindowLeft(): void {
    this.windowHelper.moveWindowLeft()
  }

  public moveWindowRight(): void {
    this.windowHelper.moveWindowRight()
  }
  public moveWindowDown(): void {
    this.windowHelper.moveWindowDown()
  }
  public moveWindowUp(): void {
    this.windowHelper.moveWindowUp()
  }

  public resetWindowPosition(): void {
    this.windowHelper.resetWindowPosition()
  }

  public centerAndShowWindow(): void {
    if (this.windowHelper.getMainWindow() === null) {
      this.windowHelper.createWindow()
      setTimeout(() => this.windowHelper.centerAndShowWindow(), 300)
      return
    }

    this.windowHelper.centerAndShowWindow()
  }

  public createTray(): void {
    const trayImage = createTrayImage()
    this.tray = new Tray(trayImage)
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Sidekick Live',
        enabled: false
      },
      {
        type: 'separator'
      },
      {
        label: 'Show Overlay',
        click: () => {
          this.centerAndShowWindow()
        }
      },
      {
        label: 'Hide Overlay',
        click: () => {
          this.hideMainWindow()
        }
      },
      {
        label: 'Toggle Overlay',
        click: () => {
          this.toggleMainWindow()
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Take Screenshot (Cmd+H)',
        click: async () => {
          try {
            const screenshotPath = await this.takeScreenshot()
            const preview = await this.getImagePreview(screenshotPath)
            const mainWindow = this.getMainWindow()
            if (mainWindow) {
              mainWindow.webContents.send("screenshot-taken", {
                path: screenshotPath,
                preview
              })
            }
          } catch (error) {
            console.error("Error taking screenshot from tray:", error)
          }
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Quit',
        accelerator: 'Command+Q',
        click: () => {
          app.quit()
        }
      }
    ])
    
    this.tray.setToolTip('Sidekick is live - click for overlay')
    this.tray.setContextMenu(contextMenu)
    
    // Make the menu-bar item itself act like a pull-up control.
    this.tray.on('click', () => {
      this.centerAndShowWindow()
    })

    this.tray.on('right-click', () => {
      this.tray?.popUpContextMenu()
    })

    this.tray.on('double-click', () => {
      this.centerAndShowWindow()
    })
  }

  public setHasDebugged(value: boolean): void {
    this.hasDebugged = value
  }

  public getHasDebugged(): boolean {
    return this.hasDebugged
  }
}

// Application initialization
async function initializeApp() {
  const appState = AppState.getInstance()

  // Initialize IPC handlers before window creation
  initializeIpcHandlers(appState)

  app.whenReady().then(() => {
    console.log("App is ready")
    registerSystemAudioCapture()
    if (process.platform === "darwin") {
      app.setActivationPolicy("accessory")
    }
    appState.createWindow()
    appState.createTray()
    // Register global shortcuts using ShortcutsHelper
    appState.shortcutsHelper.registerGlobalShortcuts()
  })

  app.on("before-quit", () => {
    void appState.stopNativeSystemAudioCapture()
    void appState.getLocalRuntimeManager().stop()
  })

  app.on("activate", () => {
    console.log("App activated")
    if (appState.getMainWindow() === null) {
      appState.createWindow()
    } else {
      appState.centerAndShowWindow()
    }
  })

  // Quit when all windows are closed, except on macOS
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit()
    }
  })

  app.commandLine.appendSwitch("disable-background-timer-throttling")
}

// Start the application
initializeApp().catch(console.error)
