import React, { useEffect, useMemo, useRef, useState } from "react"
import {
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  Clipboard,
  FileText,
  Link2,
  ListChecks,
  Mic,
  Pause,
  Play,
  Plus,
  Radio,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Users
} from "lucide-react"
import {
  ConfidenceLevel,
  LiveMeetingSuggestion,
  MeetingAudioAnalysis,
  MeetingMode,
  MeetingNotes,
  QueuedMeeting,
  StoredMeeting,
  SuggestionTrigger,
  TranscriptSegment
} from "../types/meeting"
import ModelSelector from "../components/ui/ModelSelector"
import {
  Toast,
  ToastDescription,
  ToastMessage,
  ToastTitle,
  ToastVariant
} from "../components/ui/toast"

interface QueueProps {
  setView: React.Dispatch<React.SetStateAction<"queue" | "solutions" | "debug">>
}

const STORAGE_KEY = "sidekick-notes.meetings.v1"
const QUEUE_STORAGE_KEY = "sidekick-notes.meetingQueue.v1"
const SETTINGS_KEY = "sidekick-notes.privacy.v1"
const DETECTABLE_MEETING_HOSTS =
  /(zoom\.us|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|webex\.com|whereby\.com|gotomeeting\.com|bluejeans\.com|app\.slack\.com\/huddle|slack\.com\/call)/i

const modeLabels: Record<MeetingMode, string> = {
  general: "General",
  sales: "Sales",
  customer_success: "Success",
  recruiting: "Recruiting"
}

const triggerLabels: Record<SuggestionTrigger, string> = {
  manual_answer: "Answer",
  recap: "Recap",
  follow_up_question: "Question",
  action_items: "Actions"
}

const confidenceClasses: Record<ConfidenceLevel, string> = {
  high: "border-emerald-400/60 bg-emerald-500/10 text-emerald-100",
  medium: "border-amber-400/60 bg-amber-500/10 text-amber-100",
  low: "border-rose-400/60 bg-rose-500/10 text-rose-100"
}

const newMeetingId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`

const loadStoredMeetings = (): StoredMeeting[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as StoredMeeting[]
  } catch {
    return []
  }
}

const saveStoredMeetings = (meetings: StoredMeeting[]) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(meetings.slice(0, 40)))
}

const loadQueuedMeetings = (): QueuedMeeting[] => {
  try {
    const raw = window.localStorage.getItem(QUEUE_STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as QueuedMeeting[]
  } catch {
    return []
  }
}

const saveQueuedMeetings = (meetings: QueuedMeeting[]) => {
  window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(meetings.slice(0, 50)))
}

const loadSettings = () => {
  const defaults = {
    privateByDefault: true,
    deleteRawAudio: true,
    noTraining: true,
    consentReminder: true,
    autoDetectMeetings: true,
    autoStartQueuedMeetings: true,
    autoEndQueuedMeetings: true,
    idleResourceMode: true
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY)
    if (!raw) return defaults
    return { ...defaults, ...JSON.parse(raw) } as typeof defaults
  } catch {
    return defaults
  }
}

const normalizeMeetingUrl = (url: string) =>
  url.replace(/[),.;\]]+$/g, "").replace(/\\n/g, "").trim()

const extractMeetingUrls = (text: string) => {
  const urls = Array.from(text.matchAll(/https?:\/\/[^\s<>"']+/gi))
    .map((match) => normalizeMeetingUrl(match[0]))
    .filter((url) => DETECTABLE_MEETING_HOSTS.test(url))
  return Array.from(new Set(urls))
}

const unfoldIcs = (text: string) => text.replace(/\r?\n[ \t]/g, "")

const readIcsValue = (eventText: string, key: string) => {
  const match = eventText.match(new RegExp(`^${key}(?:;[^:]*)?:(.*)$`, "im"))
  return match?.[1]?.replace(/\\n/g, " ").trim() || ""
}

const parseIcsDate = (value: string) => {
  const match = value.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/)
  if (!match) return undefined
  const [, year, month, day, hour = "00", minute = "00", second = "00", isUtc] = match
  if (isUtc) {
    return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
  }
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ).getTime()
}

const meetingTitleFromUrl = (url: string) => {
  if (/meet\.google\.com/i.test(url)) return "Google Meet"
  if (/zoom\.us/i.test(url)) return "Zoom meeting"
  if (/teams\./i.test(url)) return "Teams meeting"
  if (/webex\.com/i.test(url)) return "Webex meeting"
  if (/slack/i.test(url)) return "Slack huddle"
  return "Online meeting"
}

const parseQueuedMeetings = (
  text: string,
  source: QueuedMeeting["source"] = "manual"
): QueuedMeeting[] => {
  const normalized = unfoldIcs(text)
  const eventBlocks = normalized.includes("BEGIN:VEVENT")
    ? normalized.split("BEGIN:VEVENT").slice(1).map((block) => block.split("END:VEVENT")[0] || block)
    : []

  if (eventBlocks.length > 0) {
    return eventBlocks.flatMap((eventText) => {
      const eventUrls = extractMeetingUrls(eventText)
      if (eventUrls.length === 0) return []
      const summary = readIcsValue(eventText, "SUMMARY")
      const description = readIcsValue(eventText, "DESCRIPTION")
      const location = readIcsValue(eventText, "LOCATION")
      const startTime = parseIcsDate(readIcsValue(eventText, "DTSTART"))
      const endTime = parseIcsDate(readIcsValue(eventText, "DTEND"))
      return eventUrls.map((meetingUrl) => ({
        id: `${meetingUrl}-${startTime || Date.now()}`,
        title: summary || meetingTitleFromUrl(meetingUrl),
        mode: "general" as MeetingMode,
        participants: "",
        context: [description, location].filter(Boolean).join("\n"),
        meetingUrl,
        source,
        queuedAt: Date.now(),
        startTime,
        endTime,
        status: "queued" as const
      }))
    })
  }

  return extractMeetingUrls(text).map((meetingUrl) => ({
    id: `${meetingUrl}-${Date.now()}`,
    title: meetingTitleFromUrl(meetingUrl),
    mode: "general" as MeetingMode,
    participants: "",
    context: text.length > 1200 ? text.slice(0, 1200) : text,
    meetingUrl,
    source,
    queuedAt: Date.now(),
    status: "queued" as const
  }))
}

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result
      if (typeof result !== "string") {
        reject(new Error("Unable to read audio chunk"))
        return
      }
      resolve(result.split(",")[1] || "")
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

const InlineButton = ({
  title,
  onClick,
  children,
  disabled,
  variant = "default"
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
  variant?: "default" | "primary" | "danger"
}) => {
  const variants = {
    default: "bg-white/10 hover:bg-white/15 text-zinc-100 border-white/15",
    primary: "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-50 border-emerald-300/30",
    danger: "bg-rose-500/15 hover:bg-rose-500/25 text-rose-50 border-rose-300/30"
  }

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`interactive inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border px-2 text-[12px] transition disabled:cursor-not-allowed disabled:opacity-45 ${variants[variant]}`}
    >
      {children}
    </button>
  )
}

const SectionTitle = ({
  icon,
  children,
  action
}: {
  icon: React.ReactNode
  children: React.ReactNode
  action?: React.ReactNode
}) => (
  <div className="mb-2 flex items-center justify-between gap-3">
    <div className="flex min-w-0 items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-zinc-300">
      <span className="text-amber-200">{icon}</span>
      <span className="truncate">{children}</span>
    </div>
    {action}
  </div>
)

const Queue: React.FC<QueueProps> = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef(Date.now())
  const transcriptRef = useRef<TranscriptSegment[]>([])
  const notesRef = useRef<MeetingNotes | undefined>(undefined)
  const audioTasksRef = useRef<Promise<void>[]>([])
  const lastClipboardTextRef = useRef("")
  const activeQueuedMeetingIdRef = useRef<string | null>(null)
  const isAutoEndingRef = useRef(false)
  const lastActivityAtRef = useRef(Date.now())
  const lastModelUnloadAtRef = useRef(0)

  const [meetingId, setMeetingId] = useState(newMeetingId())
  const [title, setTitle] = useState("Working session")
  const [participants, setParticipants] = useState("")
  const [mode, setMode] = useState<MeetingMode>("general")
  const [context, setContext] = useState("")
  const [isMeetingActive, setIsMeetingActive] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isAnalyzingAudio, setIsAnalyzingAudio] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [status, setStatus] = useState("Ready")
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([])
  const [suggestions, setSuggestions] = useState<LiveMeetingSuggestion[]>([])
  const [notes, setNotes] = useState<MeetingNotes | undefined>()
  const [storedMeetings, setStoredMeetings] = useState<StoredMeeting[]>([])
  const [queuedMeetings, setQueuedMeetings] = useState<QueuedMeeting[]>([])
  const [detectorText, setDetectorText] = useState("")
  const [lastDetectedAt, setLastDetectedAt] = useState("")
  const [memoryQuery, setMemoryQuery] = useState("")
  const [memoryAnswer, setMemoryAnswer] = useState<LiveMeetingSuggestion | null>(null)
  const [settings, setSettings] = useState(loadSettings)
  const [showSettings, setShowSettings] = useState(false)
  const [showModelSettings, setShowModelSettings] = useState(false)
  const [isIdle, setIsIdle] = useState(false)
  const [toastOpen, setToastOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<ToastMessage>({
    title: "",
    description: "",
    variant: "neutral"
  })

  useEffect(() => {
    setStoredMeetings(loadStoredMeetings())
    setQueuedMeetings(loadQueuedMeetings())
  }, [])

  useEffect(() => {
    transcriptRef.current = transcriptSegments
  }, [transcriptSegments])

  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  }, [settings])

  useEffect(() => {
    const markActive = () => {
      lastActivityAtRef.current = Date.now()
      setIsIdle(false)
    }

    window.addEventListener("pointerdown", markActive)
    window.addEventListener("keydown", markActive)
    window.addEventListener("focus", markActive)

    const interval = window.setInterval(() => {
      const idleForMs = Date.now() - lastActivityAtRef.current
      setIsIdle(idleForMs > 5 * 60_000 && !isMeetingActive)
    }, 30_000)

    return () => {
      window.removeEventListener("pointerdown", markActive)
      window.removeEventListener("keydown", markActive)
      window.removeEventListener("focus", markActive)
      window.clearInterval(interval)
    }
  }, [isMeetingActive])

  useEffect(() => {
    if (!settings.idleResourceMode || !isIdle || isMeetingActive) return

    const unloadIfNeeded = async () => {
      const now = Date.now()
      if (now - lastModelUnloadAtRef.current < 10 * 60_000) return
      lastModelUnloadAtRef.current = now
      await window.electronAPI.unloadOllamaModel()
    }

    void unloadIfNeeded()
  }, [isIdle, isMeetingActive, settings.idleResourceMode])

  useEffect(() => {
    const updateDimensions = () => {
      if (!containerRef.current) return
      window.electronAPI.updateContentDimensions({
        width: containerRef.current.scrollWidth,
        height: containerRef.current.scrollHeight
      })
    }

    const resizeObserver = new ResizeObserver(updateDimensions)
    if (containerRef.current) resizeObserver.observe(containerRef.current)
    updateDimensions()

    return () => resizeObserver.disconnect()
  }, [
    isMeetingActive,
    transcriptSegments.length,
    suggestions.length,
    notes,
    showSettings,
    showModelSettings,
    memoryAnswer,
    queuedMeetings.length
  ])

  useEffect(() => {
    const unsubscribe = window.electronAPI.onMeetingShortcut((action) => {
      if (["manual_answer", "recap", "follow_up_question", "action_items"].includes(action)) {
        void generateSuggestion(action as SuggestionTrigger)
      }
    })
    return () => unsubscribe()
  })

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const transcriptText = useMemo(
    () => transcriptSegments.map((segment) => segment.text).join("\n"),
    [transcriptSegments]
  )

  const currentSummary = useMemo(() => {
    const recent = transcriptSegments.slice(-4).map((segment) => segment.text).join(" ")
    return recent || notes?.summary || ""
  }, [notes?.summary, transcriptSegments])

  const filteredMeetings = useMemo(() => {
    const query = memoryQuery.trim().toLowerCase()
    if (!query) return storedMeetings.slice(0, 6)
    return storedMeetings
      .filter((meeting) => {
        const haystack = [
          meeting.title,
          meeting.participants,
          meeting.notes?.summary,
          meeting.transcriptSegments.map((segment) => segment.text).join(" ")
        ]
          .join(" ")
          .toLowerCase()
        return haystack.includes(query)
      })
      .slice(0, 6)
  }, [memoryQuery, storedMeetings])

  const showToast = (title: string, description: string, variant: ToastVariant) => {
    setToastMessage({ title, description, variant })
    setToastOpen(true)
  }

  const updateQueuedMeeting = (id: string, patch: Partial<QueuedMeeting>) => {
    setQueuedMeetings((current) => {
      const next = current.map((meeting) =>
        meeting.id === id ? { ...meeting, ...patch } : meeting
      )
      saveQueuedMeetings(next)
      return next
    })
  }

  const queueDetectedMeetings = (detectedMeetings: QueuedMeeting[], notify = true) => {
    if (detectedMeetings.length === 0) return

    let addedCount = 0
    setQueuedMeetings((current) => {
      const next = [...current]
      for (const detected of detectedMeetings) {
        const existingIndex = next.findIndex((meeting) => {
          const sameUrl = meeting.meetingUrl === detected.meetingUrl
          const sameStart =
            !meeting.startTime ||
            !detected.startTime ||
            Math.abs(meeting.startTime - detected.startTime) < 60_000
          return sameUrl && sameStart
        })

        if (existingIndex === -1) {
          addedCount += 1
          next.unshift(detected)
          continue
        }

        const existing = next[existingIndex]
        if (existing.status === "dismissed") continue
        next[existingIndex] = {
          ...existing,
          title: existing.title || detected.title,
          context: existing.context || detected.context,
          startTime: existing.startTime || detected.startTime,
          endTime: existing.endTime || detected.endTime
        }
      }

      const sorted = next
        .slice(0, 50)
        .sort((a, b) => (a.startTime || a.queuedAt) - (b.startTime || b.queuedAt))
      saveQueuedMeetings(sorted)
      return sorted
    })

    if (notify && addedCount > 0) {
      setLastDetectedAt(new Date().toLocaleTimeString())
      showToast("Meeting queued", `${addedCount} online meeting${addedCount === 1 ? "" : "s"} detected.`, "success")
    }
  }

  const resetMeetingState = () => {
    setMeetingId(newMeetingId())
    setTranscriptSegments([])
    setSuggestions([])
    setNotes(undefined)
    setStatus("Ready")
    transcriptRef.current = []
    notesRef.current = undefined
    activeQueuedMeetingIdRef.current = null
  }

  const loadQueuedMeetingIntoForm = (queuedMeeting: QueuedMeeting) => {
    setMeetingId(queuedMeeting.id)
    setTitle(queuedMeeting.title)
    setParticipants(queuedMeeting.participants)
    setMode(queuedMeeting.mode)
    setContext(
      [
        queuedMeeting.context,
        queuedMeeting.meetingUrl ? `Meeting link: ${queuedMeeting.meetingUrl}` : ""
      ]
        .filter(Boolean)
        .join("\n")
    )
    setTranscriptSegments([])
    setSuggestions([])
    setNotes(undefined)
    transcriptRef.current = []
    notesRef.current = undefined
  }

  const startMeeting = async (queuedMeeting?: QueuedMeeting) => {
    if (isMeetingActive) return

    if (queuedMeeting) {
      loadQueuedMeetingIntoForm(queuedMeeting)
      activeQueuedMeetingIdRef.current = queuedMeeting.id
      updateQueuedMeeting(queuedMeeting.id, { status: "capturing" })
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      streamRef.current = stream
      mediaRecorderRef.current = recorder
      startedAtRef.current = Date.now()
      setIsMeetingActive(true)
      setIsRecording(true)
      setStatus("Listening")

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          const task = processAudioChunk(event.data)
          audioTasksRef.current = [...audioTasksRef.current, task]
          void task.finally(() => {
            audioTasksRef.current = audioTasksRef.current.filter((item) => item !== task)
          })
        }
      }

      recorder.onstop = () => {
        setIsRecording(false)
      }

      recorder.start(10000)
    } catch (error) {
      console.error("Unable to start meeting capture:", error)
      if (queuedMeeting) {
        updateQueuedMeeting(queuedMeeting.id, { status: "queued" })
      }
      showToast("Mic unavailable", "Check microphone permission and try again.", "error")
      setStatus("Mic unavailable")
    }
  }

  const pauseMeeting = () => {
    const recorder = mediaRecorderRef.current
    if (!recorder) return
    if (recorder.state === "recording") {
      recorder.pause()
      setIsRecording(false)
      setStatus("Paused")
    } else if (recorder.state === "paused") {
      recorder.resume()
      setIsRecording(true)
      setStatus("Listening")
    }
  }

  const stopCapture = () =>
    new Promise<void>((resolve) => {
      const recorder = mediaRecorderRef.current
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = () => {
          setIsRecording(false)
          resolve()
        }
        if (recorder.state === "recording") {
          recorder.requestData()
        }
        recorder.stop()
      } else {
        resolve()
      }

      mediaRecorderRef.current = null
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      setIsRecording(false)
    })

  const waitForAudioTasks = async () => {
    const tasks = audioTasksRef.current
    if (tasks.length > 0) {
      await Promise.allSettled(tasks)
    }
  }

  const endMeeting = async () => {
    await stopCapture()
    await waitForAudioTasks()
    setIsMeetingActive(false)
    setStatus("Finalizing notes")
    const generatedNotes = transcriptRef.current.length > 0 ? await generateNotes() : notesRef.current
    const completedMeeting: StoredMeeting = {
      id: meetingId,
      title: title || "Untitled meeting",
      mode,
      startedAt: startedAtRef.current,
      endedAt: Date.now(),
      participants,
      context,
      transcriptSegments: transcriptRef.current,
      notes: generatedNotes
    }
    const updated = [completedMeeting, ...storedMeetings.filter((meeting) => meeting.id !== meetingId)]
    setStoredMeetings(updated)
    saveStoredMeetings(updated)
    if (activeQueuedMeetingIdRef.current) {
      updateQueuedMeeting(activeQueuedMeetingIdRef.current, { status: "completed" })
      activeQueuedMeetingIdRef.current = null
    }
    setStatus("Saved")
  }

  const processAudioChunk = async (blob: Blob) => {
    setIsAnalyzingAudio(true)
    try {
      const base64 = await blobToBase64(blob)
      const result = (await window.electronAPI.analyzeMeetingAudioFromBase64(
        base64,
        blob.type || "audio/webm"
      )) as MeetingAudioAnalysis

      if (result.transcript.trim()) {
        const segment: TranscriptSegment = {
          id: newMeetingId(),
          speakerLabel: "Speaker",
          startTime: Math.max(0, Date.now() - startedAtRef.current - 10000),
          endTime: Math.max(0, Date.now() - startedAtRef.current),
          text: result.transcript.trim(),
          confidence: result.confidence
        }
        setTranscriptSegments((segments) => [...segments, segment])
      }

      setStatus(result.confidence === "low" ? "Low-confidence audio" : "Listening")
    } catch (error) {
      console.error("Audio chunk analysis failed:", error)
      setStatus("Audio analysis failed")
    } finally {
      setIsAnalyzingAudio(false)
    }
  }

  const buildMeetingPayload = () => ({
    mode,
    title,
    participants,
    context,
    transcript: transcriptRef.current.map((segment) => segment.text).join("\n"),
    currentSummary
  })

  const generateSuggestion = async (trigger: SuggestionTrigger) => {
    setIsGenerating(true)
    setStatus(`Generating ${triggerLabels[trigger].toLowerCase()}`)
    try {
      const result = (await window.electronAPI.invoke("generate-live-meeting-suggestion", {
        ...buildMeetingPayload(),
        trigger
      })) as LiveMeetingSuggestion
      setSuggestions((items) => [result, ...items].slice(0, 8))
      setStatus("Ready")
    } catch (error) {
      console.error("Live suggestion failed:", error)
      showToast("Suggestion failed", "The model could not generate a live suggestion.", "error")
      setStatus("Suggestion failed")
    } finally {
      setIsGenerating(false)
    }
  }

  const generateNotes = async () => {
    setIsGenerating(true)
    try {
      const result = (await window.electronAPI.invoke("generate-meeting-notes", {
        mode,
        title,
        participants,
        context,
        transcript: transcriptRef.current.map((segment) => segment.text).join("\n")
      })) as MeetingNotes
      setNotes(result)
      return result
    } catch (error) {
      console.error("Meeting notes failed:", error)
      showToast("Notes failed", "The model could not generate meeting notes.", "error")
      return notesRef.current
    } finally {
      setIsGenerating(false)
    }
  }

  const askMemory = async () => {
    const query = memoryQuery.trim()
    if (!query) return
    setIsGenerating(true)
    try {
      const memoryTranscript = filteredMeetings
        .map((meeting) => {
          const transcript = meeting.transcriptSegments.map((segment) => segment.text).join("\n")
          return `[${new Date(meeting.startedAt).toLocaleDateString()}] ${meeting.title}\n${meeting.notes?.summary || ""}\n${transcript}`
        })
        .join("\n\n")
      const result = (await window.electronAPI.invoke("generate-live-meeting-suggestion", {
        trigger: query,
        mode,
        title: "Meeting memory search",
        participants: "",
        context: "Answer from stored meeting notes only. Cite meeting titles or dates where possible.",
        transcript: memoryTranscript,
        currentSummary: ""
      })) as LiveMeetingSuggestion
      setMemoryAnswer(result)
    } catch (error) {
      console.error("Memory answer failed:", error)
      showToast("Memory failed", "The model could not answer from meeting memory.", "error")
    } finally {
      setIsGenerating(false)
    }
  }

  const copyNotes = async () => {
    if (!notes) return
    const body = [
      `# ${title || "Meeting Notes"}`,
      "",
      notes.summary,
      "",
      "## Decisions",
      ...notes.decisions.map((decision) => `- ${decision}`),
      "",
      "## Action Items",
      ...notes.actionItems.map((item) => `- ${item.task} (${item.owner}, ${item.dueDate})`),
      "",
      "## Follow-up",
      notes.followUpDraft
    ].join("\n")
    await navigator.clipboard.writeText(body)
    showToast("Copied", "Meeting notes copied to clipboard.", "success")
  }

  const deleteStoredMeeting = (id: string) => {
    const updated = storedMeetings.filter((meeting) => meeting.id !== id)
    setStoredMeetings(updated)
    saveStoredMeetings(updated)
  }

  const queueFromDetectorText = () => {
    const detected = parseQueuedMeetings(detectorText, "calendar_text")
    if (detected.length === 0) {
      showToast("No meeting links", "Paste a Zoom, Meet, Teams, Webex, or calendar invite.", "neutral")
      return
    }
    queueDetectedMeetings(detected)
  }

  const dismissQueuedMeeting = (id: string) => {
    updateQueuedMeeting(id, { status: "dismissed" })
  }

  useEffect(() => {
    if (!settings.autoDetectMeetings) return

    let cancelled = false
    const scanClipboard = async () => {
      try {
        const text = await window.electronAPI.readClipboardText()
        if (cancelled || !text || text === lastClipboardTextRef.current) return
        lastClipboardTextRef.current = text
        const detected = parseQueuedMeetings(text, "clipboard")
        if (detected.length > 0) {
          queueDetectedMeetings(detected)
        }
      } catch (error) {
        console.error("Clipboard meeting detection failed:", error)
      }
    }

    void scanClipboard()
    const intervalMs = settings.idleResourceMode && isIdle && !isMeetingActive ? 60_000 : 5000
    const interval = window.setInterval(scanClipboard, intervalMs)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [isIdle, isMeetingActive, settings.autoDetectMeetings, settings.idleResourceMode])

  useEffect(() => {
    if (!settings.autoStartQueuedMeetings || isMeetingActive) return

    const startDueMeeting = () => {
      const now = Date.now()
      const dueMeeting = queuedMeetings.find((meeting) => {
        if (meeting.status !== "queued" || !meeting.startTime) return false
        const startsSoon = meeting.startTime <= now + 60_000
        const stillRelevant = !meeting.endTime || meeting.endTime >= now - 5 * 60_000
        return startsSoon && stillRelevant
      })

      if (dueMeeting) {
        void startMeeting(dueMeeting)
      }
    }

    startDueMeeting()
    const interval = window.setInterval(startDueMeeting, 15_000)
    return () => window.clearInterval(interval)
  }, [settings.autoStartQueuedMeetings, isMeetingActive, queuedMeetings])

  useEffect(() => {
    if (!settings.autoEndQueuedMeetings || !isMeetingActive) return

    const endDueMeeting = () => {
      const activeId = activeQueuedMeetingIdRef.current
      if (!activeId || isAutoEndingRef.current) return
      const activeMeeting = queuedMeetings.find((meeting) => meeting.id === activeId)
      if (!activeMeeting?.endTime) return
      if (activeMeeting.endTime <= Date.now()) {
        isAutoEndingRef.current = true
        void endMeeting().finally(() => {
          isAutoEndingRef.current = false
        })
      }
    }

    endDueMeeting()
    const interval = window.setInterval(endDueMeeting, 15_000)
    return () => window.clearInterval(interval)
  }, [settings.autoEndQueuedMeetings, isMeetingActive, queuedMeetings])

  return (
    <div ref={containerRef} className="select-none p-2 text-zinc-100">
      <Toast
        open={toastOpen}
        onOpenChange={setToastOpen}
        variant={toastMessage.variant}
        duration={2600}
      >
        <ToastTitle>{toastMessage.title}</ToastTitle>
        <ToastDescription>{toastMessage.description}</ToastDescription>
      </Toast>

      <div className="liquid-glass chat-container overflow-hidden rounded-lg border border-zinc-500/20 bg-zinc-950/70 shadow-2xl">
        <div className="draggable-area flex h-9 items-center justify-between border-b border-white/10 px-3">
          <div className="flex min-w-0 items-center gap-2">
            <BrainCircuit className="h-4 w-4 shrink-0 text-amber-200" />
            <div className="truncate text-[13px] font-semibold">Sidekick Notes</div>
          </div>
          <div className="flex items-center gap-1">
            <span
              className={`h-2 w-2 rounded-full ${isRecording ? "bg-emerald-300" : isMeetingActive ? "bg-amber-300" : "bg-zinc-500"}`}
            />
            <span className="max-w-[130px] truncate text-[11px] text-zinc-300">{status}</span>
          </div>
        </div>

        <div className="grid w-[720px] max-w-[calc(100vw-32px)] grid-cols-[1.1fr_0.9fr] gap-3 p-3">
          <div className="space-y-3">
            <div className="rounded-md border border-white/10 bg-zinc-950/45 p-3">
              <SectionTitle icon={<Mic className="h-3.5 w-3.5" />}>
                Meeting
              </SectionTitle>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input
                  className="interactive h-9 rounded-md border border-white/10 bg-white/10 px-3 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-amber-300/50"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Meeting title"
                />
                <select
                  className="interactive h-9 rounded-md border border-white/10 bg-zinc-900 px-2 text-[12px] text-zinc-100 outline-none focus:border-amber-300/50"
                  value={mode}
                  onChange={(event) => setMode(event.target.value as MeetingMode)}
                >
                  {Object.entries(modeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Users className="h-4 w-4 shrink-0 text-zinc-400" />
                <input
                  className="interactive h-8 flex-1 rounded-md border border-white/10 bg-white/10 px-3 text-[12px] text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-amber-300/50"
                  value={participants}
                  onChange={(event) => setParticipants(event.target.value)}
                  placeholder="Participants or account"
                />
              </div>
              <textarea
                className="interactive mt-2 h-20 w-full resize-none rounded-md border border-white/10 bg-white/10 p-3 text-[12px] leading-5 text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-amber-300/50"
                value={context}
                onChange={(event) => setContext(event.target.value)}
                placeholder="Private prep notes, agenda, open questions, or prior-call facts"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {!isMeetingActive ? (
                  <InlineButton title="Start meeting capture" onClick={startMeeting} variant="primary">
                    <Play className="h-4 w-4" />
                    Start
                  </InlineButton>
                ) : (
                  <>
                    <InlineButton title="Pause or resume capture" onClick={pauseMeeting}>
                      <Pause className="h-4 w-4" />
                      {isRecording ? "Pause" : "Resume"}
                    </InlineButton>
                    <InlineButton title="End and save meeting" onClick={() => void endMeeting()} variant="danger">
                      <Square className="h-4 w-4" />
                      End
                    </InlineButton>
                  </>
                )}
                <InlineButton title="Generate meeting notes" onClick={() => void generateNotes()} disabled={transcriptSegments.length === 0 || isGenerating}>
                  <FileText className="h-4 w-4" />
                  Notes
                </InlineButton>
                <InlineButton title="Reset current meeting" onClick={resetMeetingState} disabled={isMeetingActive}>
                  <Trash2 className="h-4 w-4" />
                </InlineButton>
                <InlineButton title="Privacy settings" onClick={() => setShowSettings((value) => !value)}>
                  <ShieldCheck className="h-4 w-4" />
                </InlineButton>
                <InlineButton title="Model settings" onClick={() => setShowModelSettings((value) => !value)}>
                  <Sparkles className="h-4 w-4" />
                </InlineButton>
              </div>
            </div>

            <div className="rounded-md border border-white/10 bg-zinc-950/45 p-3">
              <SectionTitle
                icon={<CalendarClock className="h-3.5 w-3.5" />}
                action={
                  <span className="text-[11px] text-zinc-400">
                    {lastDetectedAt ? `Last ${lastDetectedAt}` : "Watching links"}
                  </span>
                }
              >
                Meeting Queue
              </SectionTitle>
              <div className="mb-2 grid grid-cols-[1fr_auto] gap-2">
                <textarea
                  className="interactive h-16 resize-none rounded-md border border-white/10 bg-white/10 p-2 text-[12px] leading-5 text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-amber-300/50"
                  value={detectorText}
                  onChange={(event) => setDetectorText(event.target.value)}
                  placeholder="Paste a calendar invite or meeting link to queue it"
                />
                <InlineButton title="Queue pasted meeting" onClick={queueFromDetectorText}>
                  <Plus className="h-4 w-4" />
                </InlineButton>
              </div>
              <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                {queuedMeetings.filter((meeting) => meeting.status !== "dismissed").length === 0 ? (
                  <div className="rounded-md border border-dashed border-white/15 p-3 text-center text-[12px] text-zinc-400">
                    Detected online meetings will auto-queue here.
                  </div>
                ) : (
                  queuedMeetings
                    .filter((meeting) => meeting.status !== "dismissed")
                    .slice(0, 8)
                    .map((meeting) => (
                      <div key={meeting.id} className="rounded-md border border-white/10 bg-white/[0.06] p-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-[12px] font-semibold text-zinc-100">{meeting.title}</div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                              <span>{meeting.source}</span>
                              <span>{meeting.status}</span>
                              {meeting.startTime ? (
                                <span>{new Date(meeting.startTime).toLocaleString()}</span>
                              ) : (
                                <span>No start time</span>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <InlineButton
                              title="Load queued meeting"
                              onClick={() => loadQueuedMeetingIntoForm(meeting)}
                              disabled={isMeetingActive}
                            >
                              <Link2 className="h-3.5 w-3.5" />
                            </InlineButton>
                            <InlineButton
                              title="Start capture for queued meeting"
                              onClick={() => void startMeeting(meeting)}
                              disabled={isMeetingActive || meeting.status === "completed"}
                              variant="primary"
                            >
                              <Radio className="h-3.5 w-3.5" />
                            </InlineButton>
                            <InlineButton title="Dismiss queued meeting" onClick={() => dismissQueuedMeeting(meeting.id)} variant="danger">
                              <Trash2 className="h-3.5 w-3.5" />
                            </InlineButton>
                          </div>
                        </div>
                        <div className="mt-1 truncate text-[11px] text-cyan-100">{meeting.meetingUrl}</div>
                      </div>
                    ))
                )}
              </div>
            </div>

            {showSettings && (
              <div className="rounded-md border border-white/10 bg-zinc-950/45 p-3">
                <SectionTitle icon={<ShieldCheck className="h-3.5 w-3.5" />}>
                  Privacy Defaults
                </SectionTitle>
                <div className="grid grid-cols-2 gap-2 text-[12px]">
                  {[
                    ["privateByDefault", "Private notes"],
                    ["deleteRawAudio", "Delete raw audio"],
                    ["noTraining", "No training"],
                    ["consentReminder", "Consent reminder"],
                    ["autoDetectMeetings", "Auto-detect meetings"],
                    ["autoStartQueuedMeetings", "Auto-start due queue"],
                    ["autoEndQueuedMeetings", "Auto-save at end"],
                    ["idleResourceMode", "Low-resource idle"]
                  ].map(([key, label]) => (
                    <label key={key} className="interactive flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2 py-2">
                      <input
                        type="checkbox"
                        checked={settings[key as keyof typeof settings]}
                        onChange={(event) =>
                          setSettings((current) => ({
                            ...current,
                            [key]: event.target.checked
                          }))
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {showModelSettings && (
              <div className="rounded-md border border-white/10 bg-zinc-950/45 p-3">
                <ModelSelector onModelChange={() => undefined} onChatOpen={() => undefined} />
              </div>
            )}

            <div className="rounded-md border border-white/10 bg-zinc-950/45 p-3">
              <SectionTitle
                icon={<Sparkles className="h-3.5 w-3.5" />}
                action={isGenerating ? <span className="text-[11px] text-emerald-100">Generating</span> : null}
              >
                Live Assist
              </SectionTitle>
              <div className="mb-3 flex flex-wrap gap-2">
                {(Object.keys(triggerLabels) as SuggestionTrigger[]).map((trigger) => (
                  <InlineButton
                    key={trigger}
                    title={triggerLabels[trigger]}
                    onClick={() => void generateSuggestion(trigger)}
                    disabled={isGenerating}
                    variant={trigger === "manual_answer" ? "primary" : "default"}
                  >
                    {trigger === "action_items" ? <ListChecks className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                    {triggerLabels[trigger]}
                  </InlineButton>
                ))}
              </div>
              <div className="space-y-2">
                {suggestions.length === 0 ? (
                  <div className="rounded-md border border-dashed border-white/15 p-4 text-center text-[12px] text-zinc-400">
                    Live suggestions will appear here.
                  </div>
                ) : (
                  suggestions.map((suggestion, index) => (
                    <div key={`${suggestion.timestamp}-${index}`} className="rounded-md border border-white/10 bg-white/[0.06] p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className={`rounded border px-2 py-0.5 text-[11px] ${confidenceClasses[suggestion.confidence]}`}>
                          {suggestion.confidence}
                        </span>
                        <span className="truncate text-[11px] text-zinc-400">{suggestion.sourceBasis}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-[13px] leading-5 text-zinc-100">{suggestion.answer}</p>
                      {suggestion.followUpQuestions.length > 0 && (
                        <div className="mt-2 text-[12px] text-amber-100">
                          {suggestion.followUpQuestions[0]}
                        </div>
                      )}
                      {suggestion.riskFlags.length > 0 && (
                        <div className="mt-2 text-[11px] text-amber-100">
                          {suggestion.riskFlags.join(" ")}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-md border border-white/10 bg-zinc-950/45 p-3">
              <SectionTitle
                icon={<FileText className="h-3.5 w-3.5" />}
                action={
                  <span className="text-[11px] text-zinc-400">
                    {isAnalyzingAudio ? "Analyzing" : `${transcriptSegments.length} segments`}
                  </span>
                }
              >
                Transcript
              </SectionTitle>
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {transcriptSegments.length === 0 ? (
                  <div className="rounded-md border border-dashed border-white/15 p-4 text-center text-[12px] text-zinc-400">
                    Transcript evidence will appear here.
                  </div>
                ) : (
                  transcriptSegments.slice().reverse().map((segment) => (
                    <div key={segment.id} className="rounded-md bg-white/[0.06] p-2">
                      <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-400">
                        <span>{Math.round(segment.endTime / 1000)}s</span>
                        <span className={segment.confidence === "low" ? "text-amber-100" : "text-zinc-400"}>
                          {segment.confidence}
                        </span>
                      </div>
                      <p className="text-[12px] leading-5 text-zinc-200">{segment.text}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-md border border-white/10 bg-zinc-950/45 p-3">
              <SectionTitle
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                action={
                  notes ? (
                    <InlineButton title="Copy notes" onClick={() => void copyNotes()}>
                      <Clipboard className="h-3.5 w-3.5" />
                    </InlineButton>
                  ) : null
                }
              >
                Notes
              </SectionTitle>
              {!notes ? (
                <div className="rounded-md border border-dashed border-white/15 p-4 text-center text-[12px] text-zinc-400">
                  Generated notes will appear here.
                </div>
              ) : (
                <div className="max-h-72 space-y-3 overflow-y-auto pr-1 text-[12px] leading-5">
                  <p className="text-zinc-100">{notes.summary}</p>
                  {notes.decisions.length > 0 && (
                    <div>
                      <div className="mb-1 font-semibold text-zinc-300">Decisions</div>
                      <ul className="space-y-1">
                        {notes.decisions.map((decision, index) => (
                          <li key={index} className="text-zinc-200">- {decision}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {notes.actionItems.length > 0 && (
                    <div>
                      <div className="mb-1 font-semibold text-zinc-300">Actions</div>
                      <ul className="space-y-1">
                        {notes.actionItems.map((item, index) => (
                          <li key={index} className="text-zinc-200">
                            - {item.task} <span className="text-zinc-400">({item.owner}, {item.dueDate})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {notes.followUpDraft && (
                    <div>
                      <div className="mb-1 font-semibold text-zinc-300">Follow-up</div>
                      <p className="whitespace-pre-wrap rounded-md bg-white/[0.06] p-2 text-zinc-200">
                        {notes.followUpDraft}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-md border border-white/10 bg-zinc-950/45 p-3">
              <SectionTitle icon={<Search className="h-3.5 w-3.5" />}>
                Memory
              </SectionTitle>
              <form
                className="mb-2 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  void askMemory()
                }}
              >
                <input
                  className="interactive h-8 flex-1 rounded-md border border-white/10 bg-white/10 px-2 text-[12px] text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-amber-300/50"
                  value={memoryQuery}
                  onChange={(event) => setMemoryQuery(event.target.value)}
                  placeholder="Search or ask meeting memory"
                />
                <InlineButton title="Ask meeting memory" onClick={() => void askMemory()} disabled={isGenerating || !memoryQuery.trim()}>
                  <Send className="h-4 w-4" />
                </InlineButton>
              </form>
              {memoryAnswer && (
                <div className="mb-2 rounded-md border border-emerald-300/20 bg-emerald-500/10 p-2 text-[12px] leading-5 text-emerald-50">
                  {memoryAnswer.answer}
                </div>
              )}
              <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                {filteredMeetings.length === 0 ? (
                  <div className="rounded-md border border-dashed border-white/15 p-3 text-center text-[12px] text-zinc-400">
                    Saved meetings appear here.
                  </div>
                ) : (
                  filteredMeetings.map((meeting) => (
                    <div key={meeting.id} className="flex items-start justify-between gap-2 rounded-md bg-white/[0.06] p-2">
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-semibold text-zinc-200">{meeting.title}</div>
                        <div className="text-[11px] text-zinc-400">
                          {new Date(meeting.startedAt).toLocaleDateString()} · {modeLabels[meeting.mode]}
                        </div>
                      </div>
                      <InlineButton title="Delete saved meeting" onClick={() => deleteStoredMeeting(meeting.id)} variant="danger">
                        <Trash2 className="h-3.5 w-3.5" />
                      </InlineButton>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 px-3 py-2 text-[11px] text-zinc-400">
          {settings.consentReminder
            ? "Consent-aware capture is enabled. Sidekick keeps notes private until you export them."
            : "Sidekick keeps notes private until you export them."}
          {settings.idleResourceMode && isIdle ? " Low-resource idle is active." : ""}
        </div>
      </div>
    </div>
  )
}

export default Queue
