import React, { useEffect, useMemo, useState } from "react"

interface ModelConfig {
  provider: "ollama" | "gemini"
  model: string
  isOllama: boolean
}

interface RecommendedLocalModel {
  id: string
  name: string
  languageProfile: "eng_kor" | "english"
  tier: "default" | "light" | "quality"
  size: string
  context: string
  notes: string
}

interface LocalRuntimeStatus {
  installed: boolean
  running: boolean
  source: "bundled" | "managed" | "external" | "missing"
  url: string
  binaryPath?: string
  modelDir: string
  message: string
}

interface ModelSelectorProps {
  onModelChange?: (provider: "ollama" | "gemini", model: string) => void
  onChatOpen?: () => void
}

const languageLabels = {
  eng_kor: "English + Korean",
  english: "English"
}

const tierLabels = {
  default: "Recommended",
  light: "Low resource",
  quality: "Higher quality"
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ onModelChange, onChatOpen }) => {
  const [currentConfig, setCurrentConfig] = useState<ModelConfig | null>(null)
  const [runtimeStatus, setRuntimeStatus] = useState<LocalRuntimeStatus | null>(null)
  const [availableOllamaModels, setAvailableOllamaModels] = useState<string[]>([])
  const [recommendedModels, setRecommendedModels] = useState<RecommendedLocalModel[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [actionStatus, setActionStatus] = useState<"idle" | "working" | "success" | "error">("idle")
  const [statusMessage, setStatusMessage] = useState("Ready")
  const [geminiApiKey, setGeminiApiKey] = useState("")
  const [selectedProvider, setSelectedProvider] = useState<"ollama" | "gemini">("ollama")
  const [selectedLanguageProfile, setSelectedLanguageProfile] =
    useState<RecommendedLocalModel["languageProfile"]>("eng_kor")
  const [selectedOllamaModel, setSelectedOllamaModel] = useState("qwen3:8b")
  const [ollamaUrl, setOllamaUrl] = useState("http://127.0.0.1:11435")

  const installedModelSet = useMemo(
    () => new Set(availableOllamaModels),
    [availableOllamaModels]
  )

  const visibleRecommendedModels = recommendedModels.filter(
    (model) => model.languageProfile === selectedLanguageProfile
  )

  useEffect(() => {
    void loadModelState()
  }, [])

  const loadModelState = async () => {
    try {
      setIsLoading(true)
      const [config, recommendations, installed, runtime] = await Promise.all([
        window.electronAPI.getCurrentLlmConfig(),
        window.electronAPI.getRecommendedLocalModels(),
        window.electronAPI.getAvailableOllamaModels(),
        window.electronAPI.getLocalRuntimeStatus()
      ])
      setCurrentConfig(config)
      setRuntimeStatus(runtime as LocalRuntimeStatus)
      setRecommendedModels(recommendations as RecommendedLocalModel[])
      setAvailableOllamaModels(installed)
      setSelectedProvider(config.provider === "gemini" ? "gemini" : "ollama")
      setSelectedOllamaModel(config.isOllama ? config.model : "qwen3:8b")
      const activeRecommendation = (recommendations as RecommendedLocalModel[]).find(
        (model) => model.id === config.model
      )
      setSelectedLanguageProfile(activeRecommendation?.languageProfile || "eng_kor")
      if ((runtime as LocalRuntimeStatus).url) setOllamaUrl((runtime as LocalRuntimeStatus).url)
    } catch (error) {
      console.error("Error loading model configuration:", error)
      setActionStatus("error")
      setStatusMessage("Could not load model settings")
    } finally {
      setIsLoading(false)
    }
  }

  const refreshInstalledModels = async () => {
    try {
      const models = await window.electronAPI.getAvailableOllamaModels()
      setAvailableOllamaModels(models)
      setActionStatus("success")
      setStatusMessage("Installed models refreshed")
    } catch (error) {
      setActionStatus("error")
      setStatusMessage(String(error))
    }
  }

  const setupSidekickLocal = async () => {
    setActionStatus("working")
    setStatusMessage("Setting up Sidekick Local")
    const runtime = (await window.electronAPI.setupLocalRuntime()) as LocalRuntimeStatus
    setRuntimeStatus(runtime)
    if (!runtime.running) {
      setActionStatus("error")
      setStatusMessage(runtime.message || "Local engine setup failed")
      return null
    }

    setOllamaUrl(runtime.url)
    const result = await window.electronAPI.switchToOllama(selectedOllamaModel, runtime.url)
    if (!result.success) {
      setActionStatus("error")
      setStatusMessage(result.error || "Could not connect to Sidekick Local")
      return null
    }

    return runtime
  }

  const downloadModel = async (model: string) => {
    try {
      setSelectedProvider("ollama")
      setSelectedOllamaModel(model)
      setActionStatus("working")
      setStatusMessage("Preparing Sidekick Local")
      const runtime = await setupSidekickLocal()
      if (!runtime) return

      await window.electronAPI.switchToOllama(model, runtime.url)
      setStatusMessage(`Downloading ${model}`)
      const result = await window.electronAPI.pullOllamaModel(model)
      if (!result.success) {
        setActionStatus("error")
        setStatusMessage(result.error || "Download failed")
        return
      }
      await refreshInstalledModels()
      setActionStatus("success")
      setStatusMessage(`${model} downloaded`)
    } catch (error) {
      setActionStatus("error")
      setStatusMessage(String(error))
    }
  }

  const applyModel = async () => {
    try {
      setActionStatus("working")
      setStatusMessage("Applying model")
      let result
      if (selectedProvider === "ollama") {
        const runtime = await setupSidekickLocal()
        if (!runtime) return
        result = await window.electronAPI.switchToOllama(selectedOllamaModel, runtime.url)
      } else {
        result = await window.electronAPI.switchToGemini(geminiApiKey || undefined)
      }

      if (!result.success) {
        setActionStatus("error")
        setStatusMessage(result.error || "Model switch failed")
        return
      }

      await loadModelState()
      setActionStatus("success")
      setStatusMessage("Model applied")
      onModelChange?.(
        selectedProvider,
        selectedProvider === "ollama" ? selectedOllamaModel : "gemini-2.0-flash"
      )
      setTimeout(() => onChatOpen?.(), 300)
    } catch (error) {
      setActionStatus("error")
      setStatusMessage(String(error))
    }
  }

  const unloadLocalModel = async () => {
    try {
      setActionStatus("working")
      setStatusMessage("Unloading local model")
      const result = await window.electronAPI.unloadOllamaModel()
      setActionStatus(result.success ? "success" : "error")
      setStatusMessage(result.success ? "Local model unloaded" : result.error || "Unload failed")
    } catch (error) {
      setActionStatus("error")
      setStatusMessage(String(error))
    }
  }

  const selectLanguageProfile = (languageProfile: RecommendedLocalModel["languageProfile"]) => {
    setSelectedLanguageProfile(languageProfile)
    const defaultModel =
      recommendedModels.find(
        (model) => model.languageProfile === languageProfile && model.tier === "default"
      ) ||
      recommendedModels.find((model) => model.languageProfile === languageProfile)
    if (defaultModel) {
      setSelectedProvider("ollama")
      setSelectedOllamaModel(defaultModel.id)
    }
  }

  const statusClass = {
    idle: "text-zinc-500",
    working: "text-amber-700",
    success: "text-emerald-700",
    error: "text-rose-700"
  }[actionStatus]

  const renderRecommendation = (model: RecommendedLocalModel) => {
    const isInstalled = installedModelSet.has(model.id)
    const isSelected = selectedProvider === "ollama" && selectedOllamaModel === model.id

    return (
      <button
        type="button"
        key={model.id}
        onClick={() => {
          setSelectedProvider("ollama")
          setSelectedOllamaModel(model.id)
        }}
        className={`interactive w-full rounded-md border p-3 text-left transition ${
          isSelected
            ? "border-cyan-400/70 bg-cyan-500/15"
            : "border-white/20 bg-white/30 hover:bg-white/45"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold text-zinc-900">{model.name}</span>
              <span className="rounded border border-zinc-300/70 bg-white/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-600">
                {tierLabels[model.tier]}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-zinc-600">
              {languageLabels[model.languageProfile]} · {model.size} · {model.context}
            </div>
          </div>
          <span className={`shrink-0 rounded px-2 py-1 text-[11px] ${isInstalled ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}>
            {isInstalled ? "Installed" : "Not installed"}
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-4 text-zinc-700">{model.notes}</p>
        {!isInstalled && (
          <div className="mt-2">
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation()
                void downloadModel(model.id)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  event.stopPropagation()
                  void downloadModel(model.id)
                }
              }}
              className="interactive inline-flex rounded-md bg-zinc-800 px-2 py-1 text-[11px] text-white hover:bg-zinc-700"
            >
              Download in app
            </span>
          </div>
        )}
      </button>
    )
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-white/30 bg-white/20 p-4 text-sm text-zinc-600 backdrop-blur-md">
        Loading model settings
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-lg border border-white/30 bg-white/20 p-4 backdrop-blur-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Local Model Setup</h3>
          <p className="mt-1 text-[11px] leading-4 text-zinc-600">
            Defaults are tuned for English + Korean. Download once, then switch locally.
          </p>
        </div>
        <div className={`max-w-[180px] text-right text-[11px] leading-4 ${statusClass}`}>
          {statusMessage}
        </div>
      </div>

      {currentConfig && (
        <div className="rounded-md border border-white/30 bg-white/40 p-2 text-[12px] text-zinc-700">
          Current: {currentConfig.provider} · {currentConfig.model}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setSelectedProvider("ollama")}
          className={`interactive rounded-md border px-3 py-2 text-[12px] transition ${
            selectedProvider === "ollama"
              ? "border-cyan-400/70 bg-cyan-500/20 text-zinc-900"
              : "border-white/30 bg-white/35 text-zinc-700"
          }`}
        >
          Local
        </button>
        <button
          type="button"
          onClick={() => setSelectedProvider("gemini")}
          className={`interactive rounded-md border px-3 py-2 text-[12px] transition ${
            selectedProvider === "gemini"
              ? "border-cyan-400/70 bg-cyan-500/20 text-zinc-900"
              : "border-white/30 bg-white/35 text-zinc-700"
          }`}
        >
          Cloud
        </button>
      </div>

      {selectedProvider === "ollama" ? (
        <div className="space-y-3">
          <div className="rounded-md border border-white/30 bg-white/35 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-zinc-800">Sidekick Local Engine</div>
                <div className="mt-1 text-[11px] leading-4 text-zinc-600">
                  {runtimeStatus?.message || "Checking local engine"}
                </div>
                <div className="mt-1 text-[10px] text-zinc-500">
                  {runtimeStatus?.running
                    ? `Running from ${runtimeStatus.source}`
                    : "Bundled runtime is used when available; otherwise Sidekick downloads its own copy."}
                </div>
              </div>
              <span className={`shrink-0 rounded px-2 py-1 text-[11px] ${
                runtimeStatus?.running
                  ? "bg-emerald-100 text-emerald-700"
                  : runtimeStatus?.installed
                    ? "bg-amber-100 text-amber-700"
                    : "bg-zinc-100 text-zinc-600"
              }`}>
                {runtimeStatus?.running ? "Ready" : runtimeStatus?.installed ? "Stopped" : "Setup needed"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void setupSidekickLocal()}
              disabled={actionStatus === "working"}
              className="interactive mt-3 rounded-md bg-zinc-800 px-3 py-2 text-xs text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
            >
              {runtimeStatus?.installed ? "Start Sidekick Local" : "Set up Sidekick Local"}
            </button>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-zinc-700">Languages</div>
            <div className="grid grid-cols-2 gap-2">
              {(["eng_kor", "english"] as RecommendedLocalModel["languageProfile"][]).map((languageProfile) => (
                <button
                  key={languageProfile}
                  type="button"
                  onClick={() => selectLanguageProfile(languageProfile)}
                  className={`interactive rounded-md border px-3 py-2 text-[12px] transition ${
                    selectedLanguageProfile === languageProfile
                      ? "border-cyan-400/70 bg-cyan-500/20 text-zinc-900"
                      : "border-white/30 bg-white/35 text-zinc-700"
                  }`}
                >
                  {languageLabels[languageProfile]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-zinc-700">
              Recommended models for {languageLabels[selectedLanguageProfile]}
            </div>
            {visibleRecommendedModels.map(renderRecommendation)}
          </div>

          {availableOllamaModels.length > 0 && (
            <div>
              <label className="text-xs font-medium text-zinc-700">Installed models</label>
              <select
                value={selectedOllamaModel}
                onChange={(event) => {
                  setSelectedProvider("ollama")
                  setSelectedOllamaModel(event.target.value)
                }}
                className="interactive mt-1 w-full rounded-md border border-white/50 bg-white/40 px-3 py-2 text-xs text-zinc-800 outline-none focus:border-cyan-400/70"
              >
                {availableOllamaModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      ) : (
        <div>
          <label className="text-xs font-medium text-zinc-700">Gemini API key</label>
          <input
            type="password"
            placeholder="Optional if already set in environment"
            value={geminiApiKey}
            onChange={(event) => setGeminiApiKey(event.target.value)}
            className="interactive mt-1 w-full rounded-md border border-white/50 bg-white/40 px-3 py-2 text-xs text-zinc-800 outline-none focus:border-cyan-400/70"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={applyModel}
          disabled={actionStatus === "working"}
          className="interactive rounded-md bg-cyan-600 px-3 py-2 text-xs text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {actionStatus === "working" ? "Working" : "Apply"}
        </button>
        <button
          type="button"
          onClick={refreshInstalledModels}
          disabled={actionStatus === "working"}
          className="interactive rounded-md bg-zinc-700 px-3 py-2 text-xs text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={unloadLocalModel}
          disabled={actionStatus === "working"}
          className="interactive rounded-md border border-zinc-400/60 bg-white/35 px-3 py-2 text-xs text-zinc-800 transition hover:bg-white/55 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Unload when idle
        </button>
      </div>

      <p className="text-[11px] leading-4 text-zinc-600">
        Complete packaged builds should embed a local runtime and use this same recommendation list as the download catalog.
      </p>
    </div>
  )
}

export default ModelSelector
