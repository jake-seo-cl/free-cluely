import { ControlSettings } from "./settings"

export interface ElectronAPI {
  updateContentDimensions: (dimensions: {
    width: number
    height: number
  }) => Promise<void>
  getScreenshots: () => Promise<Array<{ path: string; preview: string }>>
  deleteScreenshot: (path: string) => Promise<{ success: boolean; error?: string }>
  onScreenshotTaken: (callback: (data: { path: string; preview: string }) => void) => () => void
  onSolutionsReady: (callback: (solutions: string) => void) => () => void
  onResetView: (callback: () => void) => () => void
  onSolutionStart: (callback: () => void) => () => void
  onDebugStart: (callback: () => void) => () => void
  onDebugSuccess: (callback: (data: any) => void) => () => void
  onSolutionError: (callback: (error: string) => void) => () => void
  onProcessingNoScreenshots: (callback: () => void) => () => void
  onProblemExtracted: (callback: (data: any) => void) => () => void
  onSolutionSuccess: (callback: (data: any) => void) => () => void
  onMeetingShortcut: (callback: (action: string) => void) => () => void
  onNativeSystemAudioChunk: (callback: (chunk: { data: string; mimeType: string }) => void) => () => void
  onNativeSystemAudioError: (callback: (error: string) => void) => () => void
  onUnauthorized: (callback: () => void) => () => void
  onDebugError: (callback: (error: string) => void) => () => void
  takeScreenshot: () => Promise<{ path: string; preview: string }>
  moveWindowLeft: () => Promise<void>
  moveWindowRight: () => Promise<void>
  moveWindowUp: () => Promise<void>
  moveWindowDown: () => Promise<void>
  centerAndShowWindow: () => Promise<void>
  resetWindowPosition: () => Promise<void>
  getOverlayBounds: () => Promise<{ x: number; y: number; width: number; height: number } | null>
  setOverlayBounds: (bounds: { x: number; y: number; width: number; height: number }) => Promise<{ x: number; y: number; width: number; height: number } | null>
  setOverlayOpacity: (opacity: number) => Promise<number | null>
  analyzeAudioFromBase64: (data: string, mimeType: string) => Promise<{ text: string; timestamp: number }>
  analyzeMeetingAudioFromBase64: (data: string, mimeType: string) => Promise<any>
  analyzeAudioFile: (path: string) => Promise<{ text: string; timestamp: number }>
  analyzeImageFile: (path: string) => Promise<{ text: string; timestamp: number }>
  getAudioCaptureCapabilities: () => Promise<{
    platform: string
    supportsSystemAudio: boolean
    systemAudioCapturePath: "loopback" | "system-picker" | "unsupported"
    requiresUserPrompt: boolean
    screenPermission: "not-determined" | "granted" | "denied" | "restricted" | "unknown"
    nativeSystemAudioAvailable: boolean
    unsupportedReason?: string
  }>
  openSystemAudioPermissionSettings: () => Promise<{ success: boolean }>
  startNativeSystemAudioCapture: (chunkSeconds: number) => Promise<{ success: boolean; error?: string }>
  stopNativeSystemAudioCapture: () => Promise<void>
  readClipboardText: () => Promise<string>
  quitApp: () => Promise<void>
  getCurrentLlmConfig: () => Promise<{ provider: "ollama" | "gemini"; model: string; isOllama: boolean }>
  getAvailableOllamaModels: () => Promise<string[]>
  getRecommendedLocalModels: () => Promise<any[]>
  getLocalRuntimeStatus: () => Promise<any>
  setupLocalRuntime: () => Promise<any>
  startLocalRuntime: () => Promise<any>
  pullOllamaModel: (model: string) => Promise<{ success: boolean; error?: string }>
  unloadOllamaModel: () => Promise<{ success: boolean; error?: string }>
  switchToOllama: (model?: string, url?: string) => Promise<{ success: boolean; error?: string }>
  switchToGemini: (apiKey?: string) => Promise<{ success: boolean; error?: string }>
  testLlmConnection: () => Promise<{ success: boolean; error?: string }>
  getControlSettings: () => Promise<ControlSettings>
  updateControlSettings: (patch: any) => Promise<ControlSettings>
  resetControlSettings: () => Promise<ControlSettings>
  generateLiveMeetingSuggestion: (payload: any) => Promise<any>
  generateMeetingNotes: (payload: any) => Promise<any>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
