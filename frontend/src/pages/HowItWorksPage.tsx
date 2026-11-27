import {
  ArrowRight,
  CheckCircle2,
  GitBranch,
  MessageSquareMore,
  SearchCheck,
  Server,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { SectionHeader } from '../components/ui/SectionHeader'
import { useResolveX } from '../context/useResolveX'
import { API_ENDPOINTS, resolveXService } from '../services/api'

const PIPELINE_DETAILS = [
  {
    id: 'detect',
    step: 'Step 01',
    title: 'Ambiguity Detection',
    icon: SearchCheck,
    route: '/analysis',
    inputExample: '“Update the auth service and deploy it soon...”',
    transformation:
      'Tokenizes the instruction and flags underspecified verbs, unresolved pronouns, open temporal markers, and missing scope boundaries.',
    outputExample:
      '4 AmbiguitySpans tagged (Lexical, Referential, Temporal, Scope) with severity scores.',
  },
  {
    id: 'interpret',
    step: 'Step 02',
    title: 'Interpretation Mapping',
    icon: GitBranch,
    route: '/interpretations',
    inputExample: '4 tagged spans + domain context (Software Engineering)',
    transformation:
      'Expands competing semantic branches into ranked candidate interpretations with probability weights and blast-radius assessments.',
    outputExample:
      '3 ranked interpretations: Canary Rollout (54%), Staging Security Patch (31%), Config Hot-Reload (15%).',
  },
  {
    id: 'clarify',
    step: 'Step 03',
    title: 'Targeted Clarification',
    icon: MessageSquareMore,
    route: '/clarification',
    inputExample: 'Top-ranked uncertainty spans above threshold',
    transformation:
      'Generates minimal, high-information-gain questions with concrete choices so users resolve uncertainty without typing essays.',
    outputExample:
      '3 focused clarification cards resolving release artifact, rollout window, and session TTL.',
  },
  {
    id: 'resolve',
    step: 'Step 04',
    title: 'Deterministic Resolution',
    icon: CheckCircle2,
    route: '/resolution',
    inputExample: 'Selected interpretation + verified clarification answers',
    transformation:
      'Compiles an unambiguous natural language directive and machine-readable JSON intent specification ready for downstream execution.',
    outputExample:
      'Clarity rises from 16% to 94% with explicit constraints and verified time horizon.',
  },
]

export function HowItWorksPage() {
  const navigate = useNavigate()
  const { settings } = useResolveX()
  const [activeStageId, setActiveStageId] = useState('detect')

  const activeStage =
    PIPELINE_DETAILS.find((s) => s.id === activeStageId) ?? PIPELINE_DETAILS[0]

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 space-y-10">
      <SectionHeader
        eyebrow="Architecture & Methodology"
        title="How ResolveX Eliminates Ambiguity"
        description="Explore the four-stage disambiguation pipeline and the FastAPI-ready client contract built into this frontend."
        actions={
          <Button
            onClick={() => navigate('/workspace')}
            iconRight={<ArrowRight className="h-4 w-4" />}
          >
            Try in Workspace
          </Button>
        }
      />

      {/* Interactive 4-Step Walkthrough */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-3">
          {PIPELINE_DETAILS.map((stage) => {
            const Icon = stage.icon
            const isActive = stage.id === activeStage.id
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => setActiveStageId(stage.id)}
                className={`w-full cursor-pointer rounded-2xl border p-4 text-left transition-all ${
                  isActive
                    ? 'border-cyan-400/60 bg-cyan-500/12 shadow-lg shadow-cyan-500/10'
                    : 'border-white/10 bg-slate-900/45 hover:border-violet-400/40'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/15 text-violet-300">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-wider text-cyan-300">
                        {stage.step}
                      </p>
                      <h3 className="text-base font-semibold text-white">
                        {stage.title}
                      </h3>
                    </div>
                  </div>
                  <ArrowRight
                    className={`h-4 w-4 transition-transform ${
                      isActive ? 'text-cyan-300 translate-x-0.5' : 'text-slate-500'
                    }`}
                  />
                </div>
              </button>
            )
          })}
        </div>

        <Card padding="lg" className="lg:col-span-7 flex flex-col justify-between gap-6">
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-2">
              <Badge tone="violet">{activeStage.step}</Badge>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => navigate(activeStage.route)}
                iconRight={<ArrowRight className="h-3.5 w-3.5" />}
              >
                Open Live View
              </Button>
            </div>

            <div>
              <h3 className="text-2xl font-semibold text-white">
                {activeStage.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                {activeStage.transformation}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="rounded-xl border border-white/10 bg-[#050814]/80 p-4 space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Stage Input
                </p>
                <p className="text-xs sm:text-sm text-slate-200">
                  {activeStage.inputExample}
                </p>
              </div>
              <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/8 p-4 space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
                  Stage Output
                </p>
                <p className="text-xs sm:text-sm text-white">
                  {activeStage.outputExample}
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* FastAPI Readiness Section */}
      <Card padding="lg" className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Server className="h-5 w-5 text-cyan-400" />
            <div>
              <h3 className="text-lg font-semibold text-white">
                Future FastAPI Integration Contract
              </h3>
              <p className="text-xs text-slate-400">
                Centralized service layer configured with{' '}
                <code className="text-cyan-300">VITE_API_BASE_URL</code> (currently{' '}
                <code className="text-violet-300">{settings.apiBaseUrl}</code>)
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/settings')}>
            Configure API Base URL
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(
            Object.keys(API_ENDPOINTS) as Array<keyof typeof API_ENDPOINTS>
          ).map((key) => (
            <div
              key={key}
              className="rounded-xl border border-white/10 bg-[#050814]/85 p-3.5 flex items-center justify-between gap-3"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-300">
                  {key}
                </p>
                <p className="mt-0.5 font-mono text-xs text-slate-200 break-all">
                  {resolveXService.getEndpointUrl(settings.apiBaseUrl, key)}
                </p>
              </div>
              <Badge tone="slate">Mock Active</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
