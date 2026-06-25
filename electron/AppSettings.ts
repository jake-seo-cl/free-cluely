import { app } from "electron"
import fs from "node:fs"
import path from "node:path"

export type ShortcutAction =
  | "show_overlay"
  | "toggle_overlay"
  | "reset_overlay_position"
  | "take_screenshot"
  | "manual_answer"
  | "recap"
  | "follow_up_question"
  | "action_items"
  | "reset_session"
  | "move_left"
  | "move_right"
  | "move_up"
  | "move_down"

export interface ShortcutSettings {
  enabled: boolean
  bindings: Record<ShortcutAction, string>
}

export type OverlayDragModifier = "command" | "control" | "option" | "shift"

export interface WindowControlSettings {
  movementStep: number
  rememberPosition: boolean
  resetPositionOnShow: boolean
  showOnAllWorkspaces: boolean
  overlayOpacity: number
  dragModifier: OverlayDragModifier
}

export interface ControlSettings {
  version: 1
  shortcuts: ShortcutSettings
  window: WindowControlSettings
}

export type ControlSettingsPatch = Partial<{
  shortcuts: Partial<ShortcutSettings> & {
    bindings?: Partial<Record<ShortcutAction, string>>
  }
  window: Partial<WindowControlSettings>
}>

export const defaultShortcutBindings: Record<ShortcutAction, string> = {
  show_overlay: "CommandOrControl+Shift+Space",
  toggle_overlay: "CommandOrControl+B",
  reset_overlay_position: "CommandOrControl+Shift+0",
  take_screenshot: "CommandOrControl+H",
  manual_answer: "CommandOrControl+Enter",
  recap: "CommandOrControl+Shift+S",
  follow_up_question: "CommandOrControl+Shift+Q",
  action_items: "CommandOrControl+Shift+A",
  reset_session: "CommandOrControl+R",
  move_left: "CommandOrControl+Left",
  move_right: "CommandOrControl+Right",
  move_up: "CommandOrControl+Up",
  move_down: "CommandOrControl+Down"
}

export const defaultControlSettings: ControlSettings = {
  version: 1,
  shortcuts: {
    enabled: true,
    bindings: defaultShortcutBindings
  },
  window: {
    movementStep: 48,
    rememberPosition: true,
    resetPositionOnShow: false,
    showOnAllWorkspaces: true,
    overlayOpacity: 0.88,
    dragModifier: "command"
  }
}

const shortcutActions = Object.keys(defaultShortcutBindings) as ShortcutAction[]
const dragModifiers: OverlayDragModifier[] = ["command", "control", "option", "shift"]

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const cloneDefaults = (): ControlSettings => ({
  version: 1,
  shortcuts: {
    enabled: defaultControlSettings.shortcuts.enabled,
    bindings: { ...defaultControlSettings.shortcuts.bindings }
  },
  window: { ...defaultControlSettings.window }
})

export class AppSettingsStore {
  private settings: ControlSettings = cloneDefaults()
  private hasLoaded = false

  constructor() {}

  public getSettings(): ControlSettings {
    this.ensureLoaded()
    return {
      version: 1,
      shortcuts: {
        enabled: this.settings.shortcuts.enabled,
        bindings: { ...this.settings.shortcuts.bindings }
      },
      window: { ...this.settings.window }
    }
  }

  public updateSettings(patch: ControlSettingsPatch): ControlSettings {
    this.ensureLoaded()
    this.settings = this.sanitizeSettings({
      ...this.settings,
      shortcuts: {
        ...this.settings.shortcuts,
        ...patch.shortcuts,
        bindings: {
          ...this.settings.shortcuts.bindings,
          ...patch.shortcuts?.bindings
        }
      },
      window: {
        ...this.settings.window,
        ...patch.window
      }
    })
    this.writeSettings()
    return this.getSettings()
  }

  public resetSettings(): ControlSettings {
    this.ensureLoaded()
    this.settings = cloneDefaults()
    this.writeSettings()
    return this.getSettings()
  }

  private get settingsPath(): string {
    return path.join(app.getPath("userData"), "settings.json")
  }

  private ensureLoaded(): void {
    if (this.hasLoaded) return
    this.settings = this.readSettings()
    this.hasLoaded = true
  }

  private readSettings(): ControlSettings {
    try {
      const raw = fs.readFileSync(this.settingsPath, "utf8")
      return this.sanitizeSettings(JSON.parse(raw))
    } catch {
      return cloneDefaults()
    }
  }

  private writeSettings(): void {
    try {
      fs.mkdirSync(path.dirname(this.settingsPath), { recursive: true })
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2))
    } catch (error) {
      console.error("Could not write settings:", error)
    }
  }

  private sanitizeSettings(value: any): ControlSettings {
    const defaults = cloneDefaults()
    const bindings = { ...defaults.shortcuts.bindings }
    const incomingBindings = value?.shortcuts?.bindings || {}

    for (const action of shortcutActions) {
      const accelerator = incomingBindings[action]
      if (typeof accelerator === "string") {
        bindings[action] = accelerator.trim()
      }
    }

    return {
      version: 1,
      shortcuts: {
        enabled:
          typeof value?.shortcuts?.enabled === "boolean"
            ? value.shortcuts.enabled
            : defaults.shortcuts.enabled,
        bindings
      },
      window: {
        movementStep: clamp(
          Number(value?.window?.movementStep) || defaults.window.movementStep,
          8,
          240
        ),
        rememberPosition:
          typeof value?.window?.rememberPosition === "boolean"
            ? value.window.rememberPosition
            : defaults.window.rememberPosition,
        resetPositionOnShow:
          typeof value?.window?.resetPositionOnShow === "boolean"
            ? value.window.resetPositionOnShow
            : defaults.window.resetPositionOnShow,
        showOnAllWorkspaces:
          typeof value?.window?.showOnAllWorkspaces === "boolean"
            ? value.window.showOnAllWorkspaces
            : defaults.window.showOnAllWorkspaces,
        overlayOpacity: clamp(
          Number(value?.window?.overlayOpacity) || defaults.window.overlayOpacity,
          0.35,
          1
        ),
        dragModifier: dragModifiers.includes(value?.window?.dragModifier)
          ? value.window.dragModifier
          : defaults.window.dragModifier
      }
    }
  }
}
