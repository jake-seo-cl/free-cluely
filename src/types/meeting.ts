export type MeetingMode = "general" | "sales" | "customer_success" | "recruiting"

export type SuggestionTrigger =
  | "manual_answer"
  | "recap"
  | "follow_up_question"
  | "action_items"

export type ConfidenceLevel = "high" | "medium" | "low"

export interface TranscriptSegment {
  id: string
  speakerLabel: string
  startTime: number
  endTime: number
  text: string
  confidence: ConfidenceLevel
}

export interface MeetingAudioAnalysis {
  transcript: string
  summary: string
  actionItems: string[]
  questions: string[]
  confidence: ConfidenceLevel
  sourceBasis: "meeting" | "uncertain"
  timestamp: number
}

export interface LiveMeetingSuggestion {
  answer: string
  confidence: ConfidenceLevel
  sourceBasis: "meeting" | "user_context" | "general_knowledge" | "uncertain"
  citations: string[]
  followUpQuestions: string[]
  riskFlags: string[]
  timestamp: number
}

export interface MeetingActionItem {
  task: string
  owner: string
  dueDate: string
  citation: string
}

export interface MeetingNotes {
  summary: string
  decisions: string[]
  actionItems: MeetingActionItem[]
  risks: string[]
  followUpDraft: string
  citations: string[]
  timestamp: number
}

export interface StoredMeeting {
  id: string
  title: string
  mode: MeetingMode
  startedAt: number
  endedAt?: number
  participants: string
  context: string
  transcriptSegments: TranscriptSegment[]
  notes?: MeetingNotes
}

export interface QueuedMeeting {
  id: string
  title: string
  mode: MeetingMode
  participants: string
  context: string
  meetingUrl: string
  source: "clipboard" | "calendar_text" | "manual"
  queuedAt: number
  startTime?: number
  endTime?: number
  status: "queued" | "capturing" | "completed" | "dismissed"
}
