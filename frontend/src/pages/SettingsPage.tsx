import {
  CheckCircle2,
  RotateCcw,
  Server,
  Sliders,
  Trash2,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { DemoBanner } from '../components/ui/DemoBanner'
import { SectionHeader } from '../components/ui/SectionHeader'
import { ENV_CONFIG } from '../config/env'
import { useResolveX } from '../context/useResolveX'
import { resolveXService } from '../services/api'
import type {
  BackendHealthStatus,
  DomainContext,
  StrictnessLevel,
} from '../types/resolvex'

const DOMAINS: DomainContext[] = [
  'Software Engineering',
  'Data & Analytics',
  'Enterprise Support',
  'Product & Ops',
  'General',
]

const STRICTNESS: StrictnessLevel[] = ['Balanced', 'Strict', 'Exploratory']

export function SettingsPage() {
  const { settings, updateSettings, resetSettings, clearHistory } =
    useResolveX()

  const [apiUrlInput, setApiUrlInput] = useState(settings.apiBaseUrl)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [savedNotice, setSavedNotice] = useState(false)
  const [healthPreview, setHealthPreview] =
    useState<BackendHealthStatus | null>(null)

  const handleSaveApiConfig = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = apiUrlInput.trim()
    if (!trimmed) {
      setUrlError('API Base URL cannot be empty.')
      return
    }
    try {
      new URL(trimmed)
    } catch {
      setUrlError('Enter a valid URL such as http://localhost:8000')
      return
    }
    setUrlError(null)
    updateSettings({ apiBaseUrl: trimmed.replace(/\/+$/, '') })
    setSavedNotice(true)
    setTimeout(() => setSavedNotice(false), 2000)
  }

  const handlePreviewConnection = async () => {
    const status = await resolveXService.previewBackendConnection(
      apiUrlInput,
      settings.integrationMode,
    )
    setHealthPreview(status)
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 space-y-8">
      <SectionHeader
        eyebrow="Configuration"
        title="Settings & FastAPI Readiness"
        description="Configure client-side detection defaults, motion preferences, and the target VITE_API_BASE_URL for future backend integration."
        actions={
          <Button
            variant="secondary"
            iconLeft={<RotateCcw className="h-4 w-4" />}
            onClick={() => {
              resetSettings()
              setApiUrlInput(ENV_CONFIG.apiBaseUrl)
              setUrlError(null)
            }}
          >
            Reset Defaults
          </Button>
        }
      />

      <DemoBanner compact />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* API Readiness Card */}
        <Card className="space-y-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-cyan-400" />
              <h3 className="text-base font-semibold text-white">
                API Endpoint Configuration
              </h3>
            </div>
            <Badge tone="cyan">
              {settings.integrationMode === 'mock'
                ? 'Mock Engine'
                : 'FastAPI Ready'}
            </Badge>
          </div>

          <form onSubmit={handleSaveApiConfig} className="space-y-4">
            <div>
              <label
                htmlFor="api-base-url"
                className="mb-1.5 block text-xs font-medium text-slate-300"
              >
                VITE_API_BASE_URL (Env Default: {ENV_CONFIG.apiBaseUrl})
              </label>
              <input
                id="api-base-url"
                type="text"
                value={apiUrlInput}
                onChange={(e) => {
                  setApiUrlInput(e.target.value)
                  if (urlError) setUrlError(null)
                }}
                placeholder="http://localhost:8000"
                className="w-full rounded-xl border border-white/12 bg-[#050814]/85 px-3.5 py-2.5 font-mono text-sm text-slate-100 focus:border-cyan-400/60 focus:outline-none"
              />
              {urlError && (
                <p className="mt-1.5 text-xs text-rose-300">{urlError}</p>
              )}
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-slate-300">
                Execution Mode
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                {(
                  [
                    { id: 'mock', label: 'Local Mock Mode' },
                    { id: 'fastapi-ready', label: 'FastAPI-Ready Profile' },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => updateSettings({ integrationMode: mode.id })}
                    className={`cursor-pointer rounded-xl border px-3 py-2.5 text-xs font-medium transition-all ${
                      settings.integrationMode === mode.id
                        ? 'border-cyan-400/60 bg-cyan-500/15 text-white'
                        : 'border-white/10 bg-white/4 text-slate-300 hover:border-white/25'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button type="submit" size="sm">
                Save Endpoint
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={handlePreviewConnection}
              >
                Preview Contract Status
              </Button>
              {savedNotice && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Saved
                </span>
              )}
            </div>
          </form>

          {healthPreview && (
            <div className="rounded-xl border border-white/10 bg-[#050814]/85 p-3.5 space-y-1 text-xs">
              <p className="font-mono text-cyan-300">{healthPreview.baseUrl}</p>
              <p className="text-slate-300">{healthPreview.message}</p>
            </div>
          )}
        </Card>

        {/* Detection & UI Preferences */}
        <Card className="space-y-5">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-violet-400" />
            <h3 className="text-base font-semibold text-white">
              Detection & Interface Preferences
            </h3>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="default-domain"
                  className="mb-1.5 block text-xs font-medium text-slate-300"
                >
                  Default Domain
                </label>
                <select
                  id="default-domain"
                  value={settings.defaultDomain}
                  onChange={(e) =>
                    updateSettings({
                      defaultDomain: e.target.value as DomainContext,
                    })
                  }
                  className="w-full rounded-xl border border-white/12 bg-[#050814]/85 px-3 py-2 text-xs sm:text-sm text-slate-100 focus:border-cyan-400/60 focus:outline-none"
                >
                  {DOMAINS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="default-strictness"
                  className="mb-1.5 block text-xs font-medium text-slate-300"
                >
                  Default Sensitivity
                </label>
                <select
                  id="default-strictness"
                  value={settings.defaultStrictness}
                  onChange={(e) =>
                    updateSettings({
                      defaultStrictness: e.target.value as StrictnessLevel,
                    })
                  }
                  className="w-full rounded-xl border border-white/12 bg-[#050814]/85 px-3 py-2 text-xs sm:text-sm text-slate-100 focus:border-cyan-400/60 focus:outline-none"
                >
                  {STRICTNESS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <label
                  htmlFor="threshold-range"
                  className="font-medium text-slate-300"
                >
                  Clarification Trigger Threshold
                </label>
                <span className="font-mono text-cyan-300">
                  {settings.ambiguityThreshold}%
                </span>
              </div>
              <input
                id="threshold-range"
                type="range"
                min={30}
                max={90}
                step={5}
                value={settings.ambiguityThreshold}
                onChange={(e) =>
                  updateSettings({
                    ambiguityThreshold: Number(e.target.value),
                  })
                }
                className="w-full accent-cyan-400"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium text-slate-300">
                  Max Clarification Questions per Prompt
                </span>
                <span className="font-mono text-violet-300">
                  {settings.maxClarificationQuestions}
                </span>
              </div>
              <div className="flex gap-2">
                {[2, 3, 4, 5].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() =>
                      updateSettings({ maxClarificationQuestions: count })
                    }
                    className={`flex-1 cursor-pointer rounded-lg border py-1.5 font-mono text-xs transition-all ${
                      settings.maxClarificationQuestions === count
                        ? 'border-violet-400/60 bg-violet-500/20 text-white'
                        : 'border-white/10 bg-white/4 text-slate-400 hover:text-white'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5 pt-2 border-t border-white/10">
              <label className="flex cursor-pointer items-center justify-between gap-3 text-xs sm:text-sm text-slate-200">
                <span>Show classifier confidence scores on spans</span>
                <input
                  type="checkbox"
                  checked={settings.showTokenConfidence}
                  onChange={(e) =>
                    updateSettings({ showTokenConfidence: e.target.checked })
                  }
                  className="h-4 w-4 accent-cyan-400"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between gap-3 text-xs sm:text-sm text-slate-200">
                <span>Reduce page transition animations</span>
                <input
                  type="checkbox"
                  checked={settings.reduceMotion}
                  onChange={(e) =>
                    updateSettings({ reduceMotion: e.target.checked })
                  }
                  className="h-4 w-4 accent-violet-500"
                />
              </label>
            </div>

            <div className="pt-2 border-t border-white/10 flex justify-end">
              <Button
                size="sm"
                variant="outline"
                iconLeft={<Trash2 className="h-3.5 w-3.5 text-rose-400" />}
                onClick={clearHistory}
              >
                Clear Local Session History
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
