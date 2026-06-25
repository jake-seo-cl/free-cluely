import React, { useEffect, useMemo, useState } from "react"
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  Bot,
  Cpu,
  Database,
  Download,
  Keyboard,
  Lock,
  MonitorUp,
  Radio,
  RefreshCcw,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Trash2
} from "lucide-react"
import {
  ControlSettings,
  defaultControlSettings,
  ShortcutAction,
  SidekickSettings
} from "../../types/settings"
import { MeetingMode } from "../../types/meeting"
import ModelSelector from "./ModelSelector"

type SettingsSection = "controls" | "automation" | "privacy" | "models" | "data"

interface SettingsPanelProps {
  settings: SidekickSettings
  onSettingsChange: (settings: SidekickSettings) => void
  storedMeetingsCount: number
  queuedMeetingsCount: number
  isIdle: boolean
  lastDetectedAt: string
  onExportMemory: () => void
  onClearMemory: () => void
  onClearQueue: () => void
  onResetSettings: () => void
}

const settingSections: Array<{
  id: SettingsSection
  label: string
  icon: React.ReactNode
}> = [
  { id: "controls", label: "Controls", icon: <Keyboard className="h-4 w-4" /> },
  { id: "automation", label: "Automation", icon: <Radio className="h-4 w-4" /> },
  { id: "privacy", label: "Privacy", icon: <ShieldCheck className="h-4 w-4" /> },
  { id: "models", label: "Models", icon: <Bot className="h-4 w-4" /> },
  { id: "data", label: "Data", icon: <Database className="h-4 w-4" /> }
]

const shortcutRows: Array<{
  action: ShortcutAction
  label: string
  description: string
}> = [
  {
    action: "show_overlay",
    label: "Show overlay",
    description: "Bring Sidekick back without changing your active meeting."
  },
  {
    action: "toggle_overlay",
    label: "Toggle overlay",
    description: "Hide or show the floating window."
  },
  {
    action: "reset_overlay_position",
    label: "Reset position",
    description: "Snap the overlay back below the menu bar."
  },
  {
    action: "manual_answer",
    label: "Answer assist",
    description: "Generate a direct response from the current conversation."
  },
  {
    action: "recap",
    label: "Recap",
    description: "Summarize the recent conversation."
  },
  {
    action: "follow_up_question",
    label: "Follow-up question",
    description: "Suggest what to ask next."
  },
  {
    action: "action_items",
    label: "Action items",
    description: "Extract owners, tasks, and due dates."
  },
  {
    action: "move_left",
    label: "Move left",
    description: "Nudge the overlay without grabbing it."
  },
  {
    action: "move_right",
    label: "Move right",
    description: "Nudge the overlay without grabbing it."
  },
  {
    action: "move_up",
    label: "Move up",
    description: "Nudge the overlay without grabbing it."
  },
  {
    action: "move_down",
    label: "Move down",
    description: "Nudge the overlay without grabbing it."
  },
  {
    action: "take_screenshot",
    label: "Screenshot",
    description: "Capture the screen for legacy screenshot workflows."
  },
  {
    action: "reset_session",
    label: "Reset session",
    description: "Clear queues and return to the main view."
  }
]

const modeLabels: Record<MeetingMode, string> = {
  general: "General",
  sales: "Sales",
  customer_success: "Success",
  recruiting: "Recruiting"
}

const modifierKeys = new Set([
  "Alt",
  "Control",
  "Meta",
  "Shift",
  "CapsLock",
  "Fn"
])

const keyAliases: Record<string, string> = {
  " ": "Space",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  ArrowUp: "Up",
  ArrowDown: "Down",
  Escape: "Esc",
  Delete: "Delete",
  Backspace: "Backspace",
  Enter: "Enter",
  Tab: "Tab"
}

const acceleratorFromEvent = (event: KeyboardEvent) => {
  if (modifierKeys.has(event.key)) return null

  const parts: string[] = []
  if (event.metaKey || event.ctrlKey) parts.push("CommandOrControl")
  if (event.altKey) parts.push("Alt")
  if (event.shiftKey) parts.push("Shift")

  const key = keyAliases[event.key] || event.key.toUpperCase()
  if (!key) return null
  parts.push(key)
  return parts.join("+")
}

const displayAccelerator = (accelerator: string) => {
  if (!accelerator) return "Unset"
  const isMac = navigator.platform.toLowerCase().includes("mac")
  return accelerator
    .replace(/CommandOrControl/g, isMac ? "Cmd" : "Ctrl")
    .replace(/\+/g, " + ")
}

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const SettingHeader = ({
  icon,
  title,
  description
}: {
  icon: React.ReactNode
  title: string
  description: string
}) => (
  <div className="mb-3 flex items-start gap-3">
    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-amber-300/20 bg-amber-300/10 text-amber-100">
      {icon}
    </div>
    <div className="min-w-0">
      <div className="text-[13px] font-semibold text-zinc-100">{title}</div>
      <p className="mt-1 text-[11px] leading-4 text-zinc-400">{description}</p>
    </div>
  </div>
)

const ToggleRow = ({
  title,
  description,
  checked,
  onChange
}: {
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) => (
  <label className="interactive flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2">
    <span className="min-w-0">
      <span className="block text-[12px] font-medium text-zinc-100">{title}</span>
      <span className="mt-0.5 block text-[11px] leading-4 text-zinc-400">
        {description}
      </span>
    </span>
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="h-4 w-4 shrink-0 accent-amber-300"
    />
  </label>
)

const NumberRow = ({
  title,
  description,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange
}: {
  title: string
  description: string
  value: number
  min: number
  max: number
  step?: number
  suffix: string
  onChange: (value: number) => void
}) => (
  <div className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2">
    <div className="min-w-0">
      <div className="text-[12px] font-medium text-zinc-100">{title}</div>
      <div className="mt-0.5 text-[11px] leading-4 text-zinc-400">{description}</div>
    </div>
    <div className="flex shrink-0 items-center gap-1">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const next = clampNumber(Number(event.target.value) || min, min, max)
          onChange(next)
        }}
        className="interactive h-8 w-16 rounded-md border border-white/15 bg-zinc-950/60 px-2 text-right text-[12px] text-zinc-100 outline-none focus:border-amber-300/50"
      />
      <span className="w-8 text-[11px] text-zinc-500">{suffix}</span>
    </div>
  </div>
)

const RangeRow = ({
  title,
  description,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange
}: {
  title: string
  description: string
  value: number
  min: number
  max: number
  step?: number
  suffix: string
  onChange: (value: number) => void
}) => (
  <div className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2">
    <div className="mb-2 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[12px] font-medium text-zinc-100">{title}</div>
        <div className="mt-0.5 text-[11px] leading-4 text-zinc-400">{description}</div>
      </div>
      <div className="shrink-0 font-mono text-[12px] text-amber-100">
        {value}{suffix}
      </div>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(clampNumber(Number(event.target.value), min, max))}
      className="interactive h-2 w-full cursor-pointer accent-amber-300"
    />
  </div>
)

const ActionButton = ({
  title,
  onClick,
  children,
  variant = "default"
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
  variant?: "default" | "primary" | "danger"
}) => {
  const classes = {
    default: "border-white/15 bg-white/[0.06] text-zinc-100 hover:bg-white/10",
    primary: "border-amber-300/30 bg-amber-300/15 text-amber-50 hover:bg-amber-300/25",
    danger: "border-rose-300/30 bg-rose-500/15 text-rose-50 hover:bg-rose-500/25"
  }

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`interactive inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-2.5 text-[12px] transition ${classes[variant]}`}
    >
      {children}
    </button>
  )
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  onSettingsChange,
  storedMeetingsCount,
  queuedMeetingsCount,
  isIdle,
  lastDetectedAt,
  onExportMemory,
  onClearMemory,
  onClearQueue,
  onResetSettings
}) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>("controls")
  const [controlSettings, setControlSettings] =
    useState<ControlSettings>(defaultControlSettings)
  const [recordingAction, setRecordingAction] = useState<ShortcutAction | null>(null)
  const [status, setStatus] = useState("Settings ready")

  const activeQueueCount = useMemo(
    () => queuedMeetingsCount.toLocaleString(),
    [queuedMeetingsCount]
  )
  const meetingMemoryCount = useMemo(
    () => storedMeetingsCount.toLocaleString(),
    [storedMeetingsCount]
  )

  useEffect(() => {
    let cancelled = false
    const loadControlSettings = async () => {
      try {
        const loaded = await window.electronAPI.getControlSettings()
        if (!cancelled) setControlSettings(loaded)
      } catch (error) {
        console.error("Could not load control settings:", error)
        setStatus("Control settings unavailable")
      }
    }
    void loadControlSettings()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!recordingAction) return

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()

      if (event.key === "Escape") {
        setRecordingAction(null)
        return
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        void updateShortcut(recordingAction, "")
        setRecordingAction(null)
        return
      }

      const accelerator = acceleratorFromEvent(event)
      if (!accelerator) return
      void updateShortcut(recordingAction, accelerator)
      setRecordingAction(null)
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [recordingAction, controlSettings])

  const updateSettings = <K extends keyof SidekickSettings>(
    key: K,
    value: SidekickSettings[K]
  ) => {
    onSettingsChange({ ...settings, [key]: value })
    setStatus("Settings saved")
  }

  const updateControlSettings = async (next: ControlSettings) => {
    setControlSettings(next)
    try {
      const saved = await window.electronAPI.updateControlSettings(next)
      setControlSettings(saved)
      setStatus("Controls saved")
    } catch (error) {
      console.error("Could not save control settings:", error)
      setStatus("Control save failed")
    }
  }

  const updateShortcut = async (action: ShortcutAction, accelerator: string) => {
    await updateControlSettings({
      ...controlSettings,
      shortcuts: {
        ...controlSettings.shortcuts,
        bindings: {
          ...controlSettings.shortcuts.bindings,
          [action]: accelerator
        }
      }
    })
  }

  const resetControlSettings = async () => {
    try {
      const saved = await window.electronAPI.resetControlSettings()
      setControlSettings(saved)
      setStatus("Controls reset")
    } catch (error) {
      console.error("Could not reset controls:", error)
      setStatus("Control reset failed")
    }
  }

  const renderControls = () => (
    <div>
      <SettingHeader
        icon={<Keyboard className="h-4 w-4" />}
        title="Controls"
        description="Set global hotkeys and how the floating overlay moves around the screen."
      />

      <div className="grid grid-cols-[1fr_150px] gap-3">
        <div className="space-y-2">
          <ToggleRow
            title="Global hotkeys"
            description="Register keyboard shortcuts while Sidekick is running."
            checked={controlSettings.shortcuts.enabled}
            onChange={(checked) =>
              void updateControlSettings({
                ...controlSettings,
                shortcuts: { ...controlSettings.shortcuts, enabled: checked }
              })
            }
          />
          <NumberRow
            title="Nudge distance"
            description="How far the overlay moves when using arrow hotkeys."
            value={controlSettings.window.movementStep}
            min={8}
            max={240}
            step={8}
            suffix="px"
            onChange={(movementStep) =>
              void updateControlSettings({
                ...controlSettings,
                window: { ...controlSettings.window, movementStep }
              })
            }
          />
          <RangeRow
            title="Overlay transparency"
            description="Make the full floating window more see-through."
            value={Math.round((1 - controlSettings.window.overlayOpacity) * 100)}
            min={0}
            max={65}
            suffix="%"
            onChange={(transparency) =>
              void updateControlSettings({
                ...controlSettings,
                window: {
                  ...controlSettings.window,
                  overlayOpacity: 1 - transparency / 100
                }
              })
            }
          />
          <ToggleRow
            title="Remember position"
            description="Keep the overlay where you dragged or nudged it."
            checked={controlSettings.window.rememberPosition}
            onChange={(rememberPosition) =>
              void updateControlSettings({
                ...controlSettings,
                window: { ...controlSettings.window, rememberPosition }
              })
            }
          />
          <ToggleRow
            title="Reset position when shown"
            description="Open below the menu bar instead of restoring the last position."
            checked={controlSettings.window.resetPositionOnShow}
            onChange={(resetPositionOnShow) =>
              void updateControlSettings({
                ...controlSettings,
                window: { ...controlSettings.window, resetPositionOnShow }
              })
            }
          />
          <ToggleRow
            title="Show on all workspaces"
            description="Keep the overlay available across desktops and fullscreen apps."
            checked={controlSettings.window.showOnAllWorkspaces}
            onChange={(showOnAllWorkspaces) =>
              void updateControlSettings({
                ...controlSettings,
                window: { ...controlSettings.window, showOnAllWorkspaces }
              })
            }
          />
        </div>

        <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
          <div className="mb-2 text-[12px] font-medium text-zinc-100">Move overlay</div>
          <div className="grid grid-cols-3 gap-1">
            <div />
            <ActionButton title="Move up" onClick={() => void window.electronAPI.moveWindowUp()}>
              <ArrowUp className="h-3.5 w-3.5" />
            </ActionButton>
            <div />
            <ActionButton title="Move left" onClick={() => void window.electronAPI.moveWindowLeft()}>
              <ArrowLeft className="h-3.5 w-3.5" />
            </ActionButton>
            <ActionButton title="Reset position" onClick={() => void window.electronAPI.resetWindowPosition()}>
              <MonitorUp className="h-3.5 w-3.5" />
            </ActionButton>
            <ActionButton title="Move right" onClick={() => void window.electronAPI.moveWindowRight()}>
              <ArrowRight className="h-3.5 w-3.5" />
            </ActionButton>
            <div />
            <ActionButton title="Move down" onClick={() => void window.electronAPI.moveWindowDown()}>
              <ArrowDown className="h-3.5 w-3.5" />
            </ActionButton>
            <div />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton title="Show overlay" onClick={() => void window.electronAPI.centerAndShowWindow()}>
              <MonitorUp className="h-3.5 w-3.5" />
              Show
            </ActionButton>
            <ActionButton title="Reset controls" onClick={() => void resetControlSettings()}>
              <RotateCcw className="h-3.5 w-3.5" />
            </ActionButton>
          </div>
        </div>
      </div>

      <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
        {shortcutRows.map((row) => {
          const isRecording = recordingAction === row.action
          const binding = controlSettings.shortcuts.bindings[row.action]
          return (
            <div
              key={row.action}
              className="grid grid-cols-[1fr_auto] gap-3 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-[12px] font-medium text-zinc-100">{row.label}</div>
                <div className="mt-0.5 text-[11px] leading-4 text-zinc-400">
                  {row.description}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRecordingAction(row.action)}
                className={`interactive h-8 min-w-[118px] rounded-md border px-2 text-[11px] transition ${
                  isRecording
                    ? "border-amber-300/70 bg-amber-300/20 text-amber-50"
                    : "border-white/15 bg-zinc-950/50 text-zinc-200 hover:bg-zinc-900"
                }`}
              >
                {isRecording ? "Press keys" : displayAccelerator(binding)}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )

  const renderAutomation = () => (
    <div>
      <SettingHeader
        icon={<Radio className="h-4 w-4" />}
        title="Automation"
        description="Control queue detection, auto-start behavior, recording cadence, and low-resource idle mode."
      />
      <div className="grid grid-cols-2 gap-2">
        <ToggleRow
          title="Auto-detect meeting links"
          description="Watch clipboard text for Zoom, Meet, Teams, Webex, and calendar invites."
          checked={settings.autoDetectMeetings}
          onChange={(checked) => updateSettings("autoDetectMeetings", checked)}
        />
        <ToggleRow
          title="Auto-start due meetings"
          description="Begin capture when a queued meeting reaches its start window."
          checked={settings.autoStartQueuedMeetings}
          onChange={(checked) => updateSettings("autoStartQueuedMeetings", checked)}
        />
        <ToggleRow
          title="Auto-save at end"
          description="Finalize notes when a queued meeting reaches its scheduled end."
          checked={settings.autoEndQueuedMeetings}
          onChange={(checked) => updateSettings("autoEndQueuedMeetings", checked)}
        />
        <ToggleRow
          title="Low-resource idle"
          description="Back off detection and unload local models after inactivity."
          checked={settings.idleResourceMode}
          onChange={(checked) => updateSettings("idleResourceMode", checked)}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <NumberRow
          title="Idle timeout"
          description="Minutes before Sidekick enters low-resource mode."
          value={settings.idleTimeoutMinutes}
          min={1}
          max={60}
          suffix="min"
          onChange={(value) => updateSettings("idleTimeoutMinutes", value)}
        />
        <NumberRow
          title="Clipboard scan"
          description="Seconds between meeting-link checks while active."
          value={settings.clipboardScanIntervalSeconds}
          min={3}
          max={60}
          suffix="sec"
          onChange={(value) => updateSettings("clipboardScanIntervalSeconds", value)}
        />
        <NumberRow
          title="Auto-start lead"
          description="Minutes before start time when capture can begin."
          value={settings.autoStartLeadTimeMinutes}
          min={0}
          max={15}
          suffix="min"
          onChange={(value) => updateSettings("autoStartLeadTimeMinutes", value)}
        />
        <NumberRow
          title="End grace"
          description="Minutes to keep listening after the scheduled end."
          value={settings.autoEndGraceMinutes}
          min={0}
          max={30}
          suffix="min"
          onChange={(value) => updateSettings("autoEndGraceMinutes", value)}
        />
        <NumberRow
          title="Transcript cadence"
          description="Seconds of audio per transcription chunk."
          value={settings.transcriptChunkSeconds}
          min={5}
          max={30}
          step={5}
          suffix="sec"
          onChange={(value) => updateSettings("transcriptChunkSeconds", value)}
        />
        <div className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2">
          <div className="text-[12px] font-medium text-zinc-100">Default session</div>
          <div className="mt-2 grid grid-cols-[1fr_120px] gap-2">
            <input
              value={settings.defaultSessionTitle}
              onChange={(event) => updateSettings("defaultSessionTitle", event.target.value)}
              className="interactive h-8 rounded-md border border-white/15 bg-zinc-950/60 px-2 text-[12px] text-zinc-100 outline-none focus:border-amber-300/50"
            />
            <select
              value={settings.defaultMeetingMode}
              onChange={(event) =>
                updateSettings("defaultMeetingMode", event.target.value as MeetingMode)
              }
              className="interactive h-8 rounded-md border border-white/15 bg-zinc-950/60 px-2 text-[12px] text-zinc-100 outline-none focus:border-amber-300/50"
            >
              {Object.entries(modeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  )

  const renderPrivacy = () => (
    <div>
      <SettingHeader
        icon={<Lock className="h-4 w-4" />}
        title="Privacy"
        description="Defaults for a user base that expects meeting data to stay private and understandable."
      />
      <div className="grid grid-cols-2 gap-2">
        <ToggleRow
          title="Private notes by default"
          description="Treat notes and transcripts as local user-owned data."
          checked={settings.privateByDefault}
          onChange={(checked) => updateSettings("privateByDefault", checked)}
        />
        <ToggleRow
          title="Delete raw audio"
          description="Do not retain raw audio after transcription chunks are processed."
          checked={settings.deleteRawAudio}
          onChange={(checked) => updateSettings("deleteRawAudio", checked)}
        />
        <ToggleRow
          title="No training"
          description="Keep model and product copy aligned with no-training expectations."
          checked={settings.noTraining}
          onChange={(checked) => updateSettings("noTraining", checked)}
        />
        <ToggleRow
          title="Consent reminder"
          description="Keep a visible footer reminder while capture is available."
          checked={settings.consentReminder}
          onChange={(checked) => updateSettings("consentReminder", checked)}
        />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
          <div className="text-[11px] uppercase tracking-[0.08em] text-zinc-500">Idle</div>
          <div className="mt-1 text-[13px] font-semibold text-zinc-100">
            {isIdle ? "Low resource" : "Active"}
          </div>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
          <div className="text-[11px] uppercase tracking-[0.08em] text-zinc-500">Queue</div>
          <div className="mt-1 text-[13px] font-semibold text-zinc-100">
            {activeQueueCount} queued
          </div>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
          <div className="text-[11px] uppercase tracking-[0.08em] text-zinc-500">Detection</div>
          <div className="mt-1 truncate text-[13px] font-semibold text-zinc-100">
            {lastDetectedAt || "Watching"}
          </div>
        </div>
      </div>
    </div>
  )

  const renderModels = () => (
    <div>
      <SettingHeader
        icon={<Cpu className="h-4 w-4" />}
        title="Models"
        description="Default recommendations stay English + Korean and local-first; users can download models inside the app."
      />
      <ModelSelector onModelChange={() => undefined} onChatOpen={() => undefined} />
    </div>
  )

  const renderData = () => (
    <div>
      <SettingHeader
        icon={<Database className="h-4 w-4" />}
        title="Data"
        description="Export or clear local meeting memory, queue state, and user-facing defaults."
      />
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
          <div className="text-[12px] font-medium text-zinc-100">Meeting memory</div>
          <div className="mt-1 text-[11px] leading-4 text-zinc-400">
            {meetingMemoryCount} saved conversations with notes and transcript segments.
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton title="Export meeting memory" onClick={onExportMemory}>
              <Download className="h-3.5 w-3.5" />
              Export
            </ActionButton>
            <ActionButton title="Clear meeting memory" onClick={onClearMemory} variant="danger">
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </ActionButton>
          </div>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
          <div className="text-[12px] font-medium text-zinc-100">Meeting queue</div>
          <div className="mt-1 text-[11px] leading-4 text-zinc-400">
            {activeQueueCount} queued or recently handled online meetings.
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton title="Clear meeting queue" onClick={onClearQueue} variant="danger">
              <Trash2 className="h-3.5 w-3.5" />
              Clear queue
            </ActionButton>
          </div>
        </div>
      </div>
      <div className="mt-3 rounded-md border border-white/10 bg-white/[0.04] p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[12px] font-medium text-zinc-100">Reset defaults</div>
            <div className="mt-1 text-[11px] leading-4 text-zinc-400">
              Restore meeting automation and privacy defaults. Hotkeys have their own reset in Controls.
            </div>
          </div>
          <ActionButton title="Reset app defaults" onClick={onResetSettings}>
            <RefreshCcw className="h-3.5 w-3.5" />
            Reset
          </ActionButton>
        </div>
      </div>
    </div>
  )

  const content = {
    controls: renderControls,
    automation: renderAutomation,
    privacy: renderPrivacy,
    models: renderModels,
    data: renderData
  }[activeSection]()

  return (
    <div className="rounded-md border border-white/10 bg-zinc-950/55 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Settings2 className="h-4 w-4 shrink-0 text-amber-200" />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-zinc-100">Settings</div>
            <div className="truncate text-[11px] text-zinc-500">{status}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-zinc-400">
          <Bell className="h-3.5 w-3.5 text-amber-100" />
          {settings.consentReminder ? "Consent reminder on" : "Consent reminder off"}
        </div>
      </div>

      <div className="grid grid-cols-[140px_1fr] gap-3">
        <div className="space-y-1">
          {settingSections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={`interactive flex h-9 w-full items-center gap-2 rounded-md border px-2 text-left text-[12px] transition ${
                activeSection === section.id
                  ? "border-amber-300/35 bg-amber-300/15 text-amber-50"
                  : "border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]"
              }`}
            >
              {section.icon}
              <span className="truncate">{section.label}</span>
            </button>
          ))}
        </div>

        <div className="min-w-0">{content}</div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3 text-[11px] text-zinc-500">
        <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-1">
          Local-first defaults
        </span>
        <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-1">
          English + Korean model recommendations
        </span>
        <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-1">
          {settings.idleResourceMode ? "Low-resource idle enabled" : "Low-resource idle disabled"}
        </span>
      </div>
    </div>
  )
}

export default SettingsPanel
