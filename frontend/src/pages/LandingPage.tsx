import { motion } from 'framer-motion'
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  GitBranch,
  Layers,
  MessageSquareMore,
  Radar,
  SearchCheck,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { DemoBanner } from '../components/ui/DemoBanner'
import { PromptHighlighter } from '../components/ui/PromptHighlighter'
import { PromptInputCard } from '../components/ui/PromptInputCard'
import { SectionHeader } from '../components/ui/SectionHeader'
import { useResolveX } from '../context/useResolveX'

const FEATURE_CARDS = [
  {
    id: 'detection',
    title: 'Detection',
    badge: 'Stage 01',
    icon: SearchCheck,
    to: '/analysis',
    accent: 'text-violet-300 bg-violet-500/15 border-violet-500/30',
    description:
      'Pinpoints lexical, syntactic, referential, temporal, scope, and pragmatic ambiguities directly inside natural language prompts.',
  },
  {
    id: 'interpretations',
    title: 'Interpretations',
    badge: 'Stage 02',
    icon: GitBranch,
    to: '/interpretations',
    accent: 'text-cyan-300 bg-cyan-500/15 border-cyan-500/30',
    description:
      'Enumerates competing plausible meanings with probability weights, hidden assumptions, and downstream blast-radius scores.',
  },
  {
    id: 'clarification',
    title: 'Clarification',
    badge: 'Stage 03',
    icon: MessageSquareMore,
    to: '/clarification',
    accent: 'text-indigo-300 bg-indigo-500/15 border-indigo-500/30',
    description:
      'Synthesizes minimal, high-leverage disambiguation questions so users resolve uncertainty in just one or two clicks.',
  },
  {
    id: 'resolution',
    title: 'Resolution',
    badge: 'Stage 04',
    icon: CheckCircle2,
    to: '/resolution',
    accent: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
    description:
      'Compiles verified user choices into an unambiguous specification and structured JSON intent ready for downstream execution.',
  },
]

const HOW_IT_WORKS_STEPS = [
  {
    step: '01',
    title: 'Ingest Underspecified Prompt',
    description:
      'Submit raw instructions, engineering requests, or policy commands along with optional target domain context.',
    icon: Layers,
  },
  {
    step: '02',
    title: 'Score & Visualize Ambiguity Spans',
    description:
      'Span-level classifiers tag vague pronouns, missing boundaries, and relative time markers before execution happens.',
    icon: Radar,
  },
  {
    step: '03',
    title: 'Rank Meanings & Ask Targeted Questions',
    description:
      'Explore ranked interpretations and answer focused clarification prompts instead of guessing user intent.',
    icon: MessageSquareMore,
  },
  {
    step: '04',
    title: 'Emit Deterministic Intent Spec',
    description:
      'Export a crystal-clear rewritten prompt and structured JSON contract ready for FastAPI or agentic workflows.',
    icon: ShieldCheck,
  },
]

export function LandingPage() {
  const navigate = useNavigate()
  const {
    promptInput,
    setPromptInput,
    domain,
    setDomain,
    strictness,
    setStrictness,
    isAnalyzing,
    activeAnalysis,
    runAnalysis,
    selectExamplePrompt,
    settings,
  } = useResolveX()

  const [hasAnalyzedHere, setHasAnalyzedHere] = useState(false)

  const handleAnalyze = async () => {
    await runAnalysis()
    setHasAnalyzedHere(true)
  }

  const handleSelectExample = async (exampleId: string) => {
    await selectExamplePrompt(exampleId)
    setHasAnalyzedHere(true)
  }

  return (
    <div className="pb-20">
      {/* Hero + Input Workspace */}
      <section className="relative pt-12 pb-16 sm:pt-20 sm:pb-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={settings.reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: settings.reduceMotion ? 0 : 0.4 }}
            className="mx-auto max-w-3xl text-center space-y-5"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1 text-xs font-medium text-violet-200">
              <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
              <span>AI Ambiguity Detection & Intent Resolution</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.1]">
              Not Everything You Say{' '}
              <span className="bg-gradient-to-r from-violet-400 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">
                Is What You Mean.
              </span>
            </h1>

            <p className="mx-auto max-w-2xl text-base sm:text-lg leading-relaxed text-slate-300">
              ResolveX detects hidden linguistic ambiguity before an AI acts on
              the wrong assumption—mapping competing interpretations, asking
              smart clarification questions, and producing deterministic intent.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <Button
                size="lg"
                onClick={() => navigate('/workspace')}
                iconRight={<ArrowRight className="h-4 w-4" />}
              >
                Open Full Studio
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => navigate('/how-it-works')}
              >
                Explore Pipeline
              </Button>
            </div>
          </motion.div>

          {/* Interactive Prompt Input Workspace */}
          <motion.div
            initial={settings.reduceMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: settings.reduceMotion ? 0 : 0.45, delay: 0.1 }}
            className="mx-auto mt-10 max-w-4xl space-y-5"
          >
            <PromptInputCard
              prompt={promptInput}
              onPromptChange={setPromptInput}
              domain={domain}
              onDomainChange={setDomain}
              strictness={strictness}
              onStrictnessChange={setStrictness}
              isAnalyzing={isAnalyzing}
              onAnalyze={handleAnalyze}
              onSelectExample={handleSelectExample}
              showControls={false}
              showExamples={true}
              analyzeLabel="Analyze Prompt"
            />

            {/* Mock Analysis Preview Panel */}
            <Card className="border-cyan-500/20 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Badge tone="cyan">
                    {hasAnalyzedHere ? 'LIVE MOCK RESULT' : 'SAMPLE ANALYSIS PREVIEW'}
                  </Badge>
                  <span className="text-xs text-slate-400">
                    Domain: <strong className="text-slate-200">{activeAnalysis.domain}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 font-mono text-rose-200">
                    Ambiguity: {activeAnalysis.ambiguityScore}%
                  </span>
                  <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-mono text-amber-200">
                    Risk: {activeAnalysis.riskLevel}
                  </span>
                </div>
              </div>

              <PromptHighlighter
                prompt={activeAnalysis.prompt}
                spans={activeAnalysis.spans}
                onSelectSpan={() => navigate('/visualization')}
              />

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <p className="text-xs sm:text-sm text-slate-300">
                  {activeAnalysis.summary}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    iconLeft={<Eye className="h-3.5 w-3.5 text-cyan-400" />}
                    onClick={() => navigate('/visualization')}
                  >
                    Visualize Spans
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => navigate('/analysis')}
                    iconRight={<ArrowRight className="h-3.5 w-3.5" />}
                  >
                    Inspect Full Analysis
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Four Feature Cards */}
      <section id="features" className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-10">
          <SectionHeader
            eyebrow="Core Capabilities"
            title="Four Stages From Vagueness to Certainty"
            description="Every component of ResolveX isolates where natural language breaks down and turns implicit assumptions into explicit engineering clarity."
            align="center"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURE_CARDS.map((feature, idx) => {
              const Icon = feature.icon
              return (
                <motion.div
                  key={feature.id}
                  initial={settings.reduceMotion ? false : { opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{
                    duration: settings.reduceMotion ? 0 : 0.35,
                    delay: settings.reduceMotion ? 0 : idx * 0.06,
                  }}
                >
                  <Card hover className="h-full flex flex-col justify-between gap-5">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span
                          className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border ${feature.accent}`}
                        >
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <span className="font-mono text-xs text-slate-400">
                          {feature.badge}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white mb-2">
                          {feature.title}
                        </h3>
                        <p className="text-sm leading-relaxed text-slate-400">
                          {feature.description}
                        </p>
                      </div>
                    </div>

                    <Link
                      to={feature.to}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300 hover:text-cyan-200 transition-colors"
                    >
                      <span>Open {feature.title}</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Card>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Four-Step How It Works Section */}
      <section id="how-it-works" className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-10">
          <SectionHeader
            eyebrow="How It Works"
            title="Structured Disambiguation in Four Steps"
            description="Built to sit cleanly in front of your LLM or FastAPI orchestration layer—catching ambiguous intent before it triggers costly errors."
            actions={
              <Button
                variant="outline"
                onClick={() => navigate('/how-it-works')}
                iconRight={<ArrowRight className="h-4 w-4" />}
              >
                Architecture & API Guide
              </Button>
            }
          />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {HOW_IT_WORKS_STEPS.map((item, idx) => {
              const Icon = item.icon
              return (
                <motion.div
                  key={item.step}
                  initial={settings.reduceMotion ? false : { opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{
                    duration: settings.reduceMotion ? 0 : 0.35,
                    delay: settings.reduceMotion ? 0 : idx * 0.06,
                  }}
                >
                  <Card className="h-full relative overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-mono text-2xl font-bold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                        {item.step}
                      </span>
                      <Icon
                        className="h-5 w-5 text-slate-400"
                        aria-hidden="true"
                      />
                    </div>
                    <h3 className="text-base font-semibold text-white mb-2">
                      {item.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-slate-400">
                      {item.description}
                    </p>
                  </Card>
                </motion.div>
              )
            })}
          </div>

          <DemoBanner />
        </div>
      </section>
    </div>
  )
}
