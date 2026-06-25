import { MeetingMode } from "./meeting"

export interface SidekickSettings {
  privateByDefault: boolean
  deleteRawAudio: boolean
  noTraining: boolean
  consentReminder: boolean
  autoDetectMeetings: boolean
  autoStartQueuedMeetings: boolean
  autoEndQueuedMeetings: boolean
  idleResourceMode: boolean
  idleTimeoutMinutes: number
  clipboardScanIntervalSeconds: number
  autoStartLeadTimeMinutes: number
  autoEndGraceMinutes: number
  transcriptChunkSeconds: number
  defaultMeetingMode: MeetingMode
  defaultSessionTitle: string
}

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

export const defaultSidekickSettings: SidekickSettings = {
  privateByDefault: true,
  deleteRawAudio: true,
  noTraining: true,
  consentReminder: true,
  autoDetectMeetings: true,
  autoStartQueuedMeetings: true,
  autoEndQueuedMeetings: true,
  idleResourceMode: true,
  idleTimeoutMinutes: 5,
  clipboardScanIntervalSeconds: 5,
  autoStartLeadTimeMinutes: 1,
  autoEndGraceMinutes: 0,
  transcriptChunkSeconds: 10,
  defaultMeetingMode: "general",
  defaultSessionTitle: "Working session"
}

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
