import { AlertCircle, ArrowRight, RotateCcw, Sparkles } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { EXAMPLE_PROMPTS } from '../../data/mockData'
import type { DomainContext, StrictnessLevel } from '../../types/resolvex'
import { Badge } from './Badge'
import { Button } from './Button'
import { Card } from './Card'

const MAX_CHAR_LIMIT = 600

const DOMAIN_OPTIONS: DomainContext[] = [
  'Software Engineering',
  'Data & Analytics',
  'Enterprise Support',
  'Product & Ops',
  'General',
]

const STRICTNESS_OPTIONS: StrictnessLevel[] = [
  'Balanced',
  'Strict',
  'Exploratory',
]

interface PromptInputCardProps {
  prompt: string
  onPromptChange: (value: string) => void
  domain: DomainContext
  onDomainChange: (domain: DomainContext) => void
  strictness: StrictnessLevel
  onStrictnessChange: (level: StrictnessLevel) => void
  isAnalyzing: boolean
  onAnalyze: () => Promise<void> | void
  onSelectExample: (exampleId: string) => Promise<void> | void
  showControls?: boolean
  showExamples?: boolean
  analyzeLabel?: string
}

export function PromptInputCard({
  prompt,
  onPromptChange,
  domain,
  onDomainChange,
  strictness,
  onStrictnessChange,
  isAnalyzing,
  onAnalyze,
  onSelectExample,
  showControls = true,
  showExamples = true,
  analyzeLabel = 'Analyze Ambiguity',
}: PromptInputCardProps) {
  const [validationError, setValidationError] = useState<string | null>(null)

  const trimmedLength = prompt.trim().length
  const charCount = prompt.length

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (trimmedLength === 0) {
      setValidationError(
        'Please enter an instruction or select one of the example prompts before analyzing.',
      )
      return
    }
    setValidationError(null)
    await onAnalyze()
  }

  const handleChange = (value: string) => {
    if (value.length <= MAX_CHAR_LIMIT) {
      onPromptChange(value)
      if (validationError && value.trim().length > 0) {
        setValidationError(null)
      }
    }
  }

  const handleExampleClick = async (exampleId: string) => {
    setValidationError(null)
    await onSelectExample(exampleId)
  }

  return (
    <div className="space-y-4">
      <Card padding="lg" className="relative overflow-hidden border-white/12">
        <div className="pointer-events-none absolute -top-24 -right-24 h-56 w-56 rounded-full bg-violet-600/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-cyan-500/12 blur-3xl" />

        <form onSubmit={handleSubmit} className="relative space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-400" aria-hidden="true" />
              <label
                htmlFor="resolvex-prompt-input"
                className="text-sm font-medium text-slate-200"
              >
                Ambiguity Detection Workspace
              </label>
            </div>
            <Badge tone="cyan">DEMO ENGINE</Badge>
          </div>

          <textarea
            id="resolvex-prompt-input"
            rows={4}
            value={prompt}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Enter a natural language instruction (e.g., 'Update the auth service and deploy it soon, but make sure recent user sessions stay intact.')"
            aria-invalid={Boolean(validationError)}
            aria-describedby={validationError ? 'prompt-validation-error' : undefined}
            className={`w-full resize-y rounded-xl border bg-[#050814]/85 p-4 text-sm sm:text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 transition-colors ${
              validationError
                ? 'border-rose-500/60 focus:ring-rose-500/40'
                : 'border-white/12 focus:border-violet-400/60 focus:ring-violet-500/30'
            }`}
          />

          {validationError && (
            <div
              id="prompt-validation-error"
              role="alert"
              className="flex items-center gap-2 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs sm:text-sm text-rose-200"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{validationError}</span>
            </div>
          )}

          {showControls && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="domain-select"
                  className="mb-1.5 block text-xs font-medium text-slate-400"
                >
                  Target Context Domain
                </label>
                <select
                  id="domain-select"
                  value={domain}
                  onChange={(e) => onDomainChange(e.target.value as DomainContext)}
                  className="w-full rounded-xl border border-white/12 bg-[#050814]/90 px-3 py-2 text-xs sm:text-sm text-slate-200 focus:border-cyan-400/60 focus:outline-none"
                >
                  {DOMAIN_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="strictness-select"
                  className="mb-1.5 block text-xs font-medium text-slate-400"
                >
                  Detection Sensitivity
                </label>
                <select
                  id="strictness-select"
                  value={strictness}
                  onChange={(e) =>
                    onStrictnessChange(e.target.value as StrictnessLevel)
                  }
                  className="w-full rounded-xl border border-white/12 bg-[#050814]/90 px-3 py-2 text-xs sm:text-sm text-slate-200 focus:border-cyan-400/60 focus:outline-none"
                >
                  {STRICTNESS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-3">
              <span
                className={`font-mono text-xs ${
                  charCount > MAX_CHAR_LIMIT - 40
                    ? 'text-amber-300'
                    : 'text-slate-400'
                }`}
              >
                {charCount} / {MAX_CHAR_LIMIT} chars
              </span>
              {charCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onPromptChange('')
                    setValidationError(null)
                  }}
                  className="inline-flex cursor-pointer items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Clear
                </button>
              )}
            </div>

            <Button
              type="submit"
              isLoading={isAnalyzing}
              iconRight={<ArrowRight className="h-4 w-4" />}
            >
              {analyzeLabel}
            </Button>
          </div>
        </form>
      </Card>

      {showExamples && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Try an ambiguous example prompt (mock dataset):</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {EXAMPLE_PROMPTS.map((example) => {
              const isSelected =
                prompt.trim().toLowerCase() === example.prompt.toLowerCase()
              return (
                <button
                  key={example.id}
                  type="button"
                  onClick={() => handleExampleClick(example.id)}
                  className={`group cursor-pointer rounded-xl border p-3.5 text-left transition-all ${
                    isSelected
                      ? 'border-cyan-400/50 bg-cyan-500/10 shadow-md shadow-cyan-500/10'
                      : 'border-white/10 bg-slate-900/50 hover:border-violet-400/40 hover:bg-slate-900/80'
                  }`}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-violet-300">
                      {example.tag}
                    </span>
                    <span className="font-mono text-[11px] text-cyan-300">
                      {example.previewAmbiguity}% ambig.
                    </span>
                  </div>
                  <p className="text-xs font-medium text-white mb-1">
                    {example.title}
                  </p>
                  <p className="line-clamp-2 text-xs text-slate-400 group-hover:text-slate-300">
                    “{example.prompt}”
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
