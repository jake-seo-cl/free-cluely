import { app, BrowserWindow, screen } from "electron"
import { AppState } from "main"
import path from "node:path"

const isDev = process.env.NODE_ENV === "development"

const startUrl = isDev
  ? "http://localhost:5180"
  : `file://${path.join(__dirname, "../dist/index.html")}`

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export class WindowHelper {
  private mainWindow: BrowserWindow | null = null
  private isWindowVisible: boolean = false
  private windowPosition: { x: number; y: number } | null = null
  private windowSize: { width: number; height: number } | null = null
  private manualLayout: boolean = false
  private appState: AppState

  private step: number = 48
  private currentX: number = 0
  private currentY: number = 0

  constructor(appState: AppState) {
    this.appState = appState
  }

  public setWindowDimensions(width: number, height: number): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    if (this.manualLayout) return

    const workArea = this.getCurrentWorkArea()

    const maxAllowedWidth = Math.floor(
      workArea.width * (this.appState.getHasDebugged() ? 0.75 : 0.5)
    )
    const newWidth = Math.min(width + 32, maxAllowedWidth)
    const newHeight = Math.min(Math.ceil(height), workArea.height - 24)
    const windowSettings = this.appState.getControlSettings().window
    const currentBounds = this.mainWindow.getBounds()
    const desiredX =
      windowSettings.rememberPosition && this.windowPosition
        ? this.windowPosition.x
        : currentBounds.x || Math.floor(workArea.x + (workArea.width - newWidth) / 2)
    const desiredY =
      windowSettings.rememberPosition && this.windowPosition
        ? this.windowPosition.y
        : currentBounds.y || workArea.y + 12
    const { x: newX, y: newY } = this.constrainPosition(
      desiredX,
      desiredY,
      newWidth,
      newHeight
    )

    this.mainWindow.setBounds({
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight
    })

    this.windowPosition = { x: newX, y: newY }
    this.windowSize = { width: newWidth, height: newHeight }
    this.currentX = newX
    this.currentY = newY
  }

  public createWindow(): void {
    if (this.mainWindow !== null) return

    this.step = this.appState.getControlSettings().window.movementStep

    
    const windowSettings: Electron.BrowserWindowConstructorOptions = {
      width: 400,
      height: 600,
      minWidth: 300,
      minHeight: 200,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js")
      },
      show: false, // Start hidden, then show after setup
      alwaysOnTop: true,
      frame: false,
      transparent: true,
      fullscreenable: false,
      hasShadow: false,
      backgroundColor: "#00000000",
      focusable: true,
      resizable: true,
      movable: true,
      x: 100, // Start at a visible position
      y: 100
    }

    this.mainWindow = new BrowserWindow(windowSettings)
    // this.mainWindow.webContents.openDevTools()
    this.mainWindow.setContentProtection(false)

    if (process.platform === "darwin") {
      this.mainWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true
      })
      this.mainWindow.setHiddenInMissionControl(true)
      this.mainWindow.setAlwaysOnTop(true, "floating")
    }
    if (process.platform === "linux") {
      // Linux-specific optimizations for better compatibility
      if (this.mainWindow.setHasShadow) {
        this.mainWindow.setHasShadow(false)
      }
      // Keep window focusable on Linux for proper interaction
      this.mainWindow.setFocusable(true)
    } 
    this.mainWindow.setSkipTaskbar(true)
    this.mainWindow.setAlwaysOnTop(true)
    this.applyControlSettings()

    this.mainWindow.webContents.once("did-finish-load", () => {
      setTimeout(() => {
        if (this.mainWindow && !this.mainWindow.isDestroyed() && !this.mainWindow.isVisible()) {
          this.centerAndShowWindow()
        }
      }, 250)
    })

    // Place the overlay just below the notch/menu bar on first launch.
    this.mainWindow.once('ready-to-show', () => {
      if (this.mainWindow) {
        this.positionBelowMenuBar()
        this.showOverlayWindow()
        console.log("Window is ready below the menu bar")
      }
    })

    this.mainWindow.loadURL(startUrl).catch((err) => {
      console.error("Failed to load URL:", err)
    })

    const bounds = this.mainWindow.getBounds()
    this.windowPosition = { x: bounds.x, y: bounds.y }
    this.windowSize = { width: bounds.width, height: bounds.height }
    this.currentX = bounds.x
    this.currentY = bounds.y

    this.setupWindowListeners()
    this.isWindowVisible = false
  }

  private setupWindowListeners(): void {
    if (!this.mainWindow) return

    this.mainWindow.on("move", () => {
      if (this.mainWindow) {
        const bounds = this.mainWindow.getBounds()
        this.windowPosition = { x: bounds.x, y: bounds.y }
        this.currentX = bounds.x
        this.currentY = bounds.y
      }
    })

    this.mainWindow.on("resize", () => {
      if (this.mainWindow) {
        const bounds = this.mainWindow.getBounds()
        this.windowSize = { width: bounds.width, height: bounds.height }
      }
    })

    this.mainWindow.on("closed", () => {
      this.mainWindow = null
      this.isWindowVisible = false
      this.windowPosition = null
      this.windowSize = null
    })
  }

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  private getCurrentWorkArea(): Electron.Rectangle {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return screen.getPrimaryDisplay().workArea
    }

    return screen.getDisplayMatching(this.mainWindow.getBounds()).workArea
  }

  private constrainPosition(
    x: number,
    y: number,
    width: number,
    height: number
  ): { x: number; y: number } {
    const workArea = this.getCurrentWorkArea()
    const inset = 8
    const maxX = Math.max(workArea.x + inset, workArea.x + workArea.width - width - inset)
    const maxY = Math.max(workArea.y + inset, workArea.y + workArea.height - height - inset)

    return {
      x: clamp(Math.round(x), workArea.x + inset, maxX),
      y: clamp(Math.round(y), workArea.y + inset, maxY)
    }
  }

  private constrainManualBounds(bounds: Electron.Rectangle): Electron.Rectangle {
    const workArea = this.getCurrentWorkArea()
    const minWidth = 420
    const minHeight = 260
    const maxWidth = Math.max(minWidth, workArea.width)
    const maxHeight = Math.max(minHeight, workArea.height)
    const width = clamp(Math.round(bounds.width), minWidth, maxWidth)
    const height = clamp(Math.round(bounds.height), minHeight, maxHeight)
    const minVisible = 96
    const minX = workArea.x - width + minVisible
    const maxX = workArea.x + workArea.width - minVisible
    const minY = workArea.y - height + minVisible
    const maxY = workArea.y + workArea.height - minVisible

    return {
      x: clamp(Math.round(bounds.x), minX, maxX),
      y: clamp(Math.round(bounds.y), minY, maxY),
      width,
      height
    }
  }

  public getWindowBounds(): Electron.Rectangle | null {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return null
    return this.mainWindow.getBounds()
  }

  public setWindowBounds(bounds: Electron.Rectangle): Electron.Rectangle | null {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return null

    const nextBounds = this.constrainManualBounds(bounds)
    this.manualLayout = true
    this.mainWindow.setBounds(nextBounds)
    this.windowPosition = { x: nextBounds.x, y: nextBounds.y }
    this.windowSize = { width: nextBounds.width, height: nextBounds.height }
    this.currentX = nextBounds.x
    this.currentY = nextBounds.y
    return nextBounds
  }

  public setOverlayOpacity(opacity: number): number | null {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return null

    const numericOpacity = Number(opacity)
    const nextOpacity = clamp(
      Number.isFinite(numericOpacity) ? numericOpacity : 0.88,
      0.35,
      1
    )
    this.mainWindow.setOpacity(nextOpacity)
    return nextOpacity
  }

  public applyControlSettings(): void {
    const settings = this.appState.getControlSettings().window
    this.step = settings.movementStep

    if (!this.mainWindow || this.mainWindow.isDestroyed()) return

    this.mainWindow.setOpacity(settings.overlayOpacity)

    if (process.platform === "darwin") {
      this.mainWindow.setVisibleOnAllWorkspaces(settings.showOnAllWorkspaces, {
        visibleOnFullScreen: settings.showOnAllWorkspaces,
        skipTransformProcessType: true
      })
    }
  }

  public isVisible(): boolean {
    return this.mainWindow?.isVisible() ?? false
  }

  public hideMainWindow(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      console.warn("Main window does not exist or is destroyed.")
      return
    }

    const bounds = this.mainWindow.getBounds()
    this.windowPosition = { x: bounds.x, y: bounds.y }
    this.windowSize = { width: bounds.width, height: bounds.height }
    this.mainWindow.hide()
    this.isWindowVisible = false
  }

  public showMainWindow(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      console.warn("Main window does not exist or is destroyed.")
      return
    }

    if (this.windowPosition && this.windowSize) {
      const { x, y } = this.constrainPosition(
        this.windowPosition.x,
        this.windowPosition.y,
        this.windowSize.width,
        this.windowSize.height
      )
      this.mainWindow.setBounds({
        x,
        y,
        width: this.windowSize.width,
        height: this.windowSize.height
      })
    }

    this.showOverlayWindow()
  }

  public toggleMainWindow(): void {
    if (this.isVisible()) {
      this.hideMainWindow()
    } else {
      this.centerAndShowWindow()
    }
  }

  private positionBelowMenuBar(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return
    }

    const primaryDisplay = screen.getPrimaryDisplay()
    const workArea = primaryDisplay.workArea
    const windowBounds = this.mainWindow.getBounds()
    const windowWidth = windowBounds.width || 400
    const windowHeight = Math.min(windowBounds.height || 600, workArea.height - 24)
    const x = Math.floor(workArea.x + (workArea.width - windowWidth) / 2)
    const y = workArea.y + 12

    this.mainWindow.setBounds({
      x,
      y,
      width: windowWidth,
      height: windowHeight
    })

    this.windowPosition = { x, y }
    this.windowSize = { width: windowWidth, height: windowHeight }
    this.currentX = x
    this.currentY = y
  }

  private showOverlayWindow(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return

    if (process.platform === "darwin") {
      const settings = this.appState.getControlSettings().window
      app.focus({ steal: true })
      this.mainWindow.setVisibleOnAllWorkspaces(settings.showOnAllWorkspaces, {
        visibleOnFullScreen: settings.showOnAllWorkspaces,
        skipTransformProcessType: true
      })
      this.mainWindow.setAlwaysOnTop(true, "screen-saver", 1)
    } else {
      this.mainWindow.setAlwaysOnTop(true)
    }

    this.mainWindow.setFocusable(true)
    this.mainWindow.show()
    this.mainWindow.moveTop()
    this.mainWindow.focus()
    this.isWindowVisible = true

    console.log("Overlay visible", {
      visible: this.mainWindow.isVisible(),
      focused: this.mainWindow.isFocused(),
      bounds: this.mainWindow.getBounds()
    })
  }

  public centerAndShowWindow(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      console.warn("Main window does not exist or is destroyed.")
      return
    }

    const settings = this.appState.getControlSettings().window
    if (settings.resetPositionOnShow || !settings.rememberPosition || !this.windowPosition) {
      this.positionBelowMenuBar()
    } else {
      this.showMainWindow()
      return
    }
    this.showOverlayWindow()
  }

  public resetWindowPosition(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    this.manualLayout = false
    this.positionBelowMenuBar()
    this.showOverlayWindow()
  }

  private moveWindowBy(deltaX: number, deltaY: number): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return

    const bounds = this.mainWindow.getBounds()
    const next = this.constrainPosition(
      bounds.x + deltaX,
      bounds.y + deltaY,
      bounds.width,
      bounds.height
    )
    this.mainWindow.setPosition(next.x, next.y)
    this.windowPosition = next
    this.currentX = next.x
    this.currentY = next.y
  }

  public moveWindowRight(): void {
    this.moveWindowBy(this.step, 0)
  }

  public moveWindowLeft(): void {
    this.moveWindowBy(-this.step, 0)
  }

  public moveWindowDown(): void {
    this.moveWindowBy(0, this.step)
  }

  public moveWindowUp(): void {
    this.moveWindowBy(0, -this.step)
  }
}
