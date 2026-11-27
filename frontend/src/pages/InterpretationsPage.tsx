import {
  ArrowRight,
  CheckCircle2,
  GitBranch,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, type BadgeTone } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { DemoBanner } from '../components/ui/DemoBanner'
import { SectionHeader } from '../components/ui/SectionHeader'
import { useResolveX } from '../context/useResolveX'
import type { RiskLevel } from '../types/resolvex'

const RISK_TONE: Record<RiskLevel, BadgeTone> = {
  Low: 'emerald',
  Moderate: 'amber',
  High: 'rose',
  Critical: 'rose',
}

export function InterpretationsPage() {
  const navigate = useNavigate()
  const {
    activeAnalysis,
    selectedInterpretationId,
    setSelectedInterpretationId,
  } = useResolveX()
  const [compareMode, setCompareMode] = useState(false)

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 space-y-8">
      <SectionHeader
        eyebrow="Stage 03 — Interpretation Ranking"
        title="Candidate Interpretations"
        description="Multiple plausible readings coexist inside your prompt. Select the interpretation that aligns best with your intent before clarification."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => setCompareMode((prev) => !prev)}
            >
              {compareMode ? 'Card View' : 'Side-by-Side Matrix'}
            </Button>
            <Button
              onClick={() => navigate('/clarification')}
              iconRight={<ArrowRight className="h-4 w-4" />}
            >
              Continue to Clarification
            </Button>
          </div>
        }
      />

      <DemoBanner compact />

      {/* Active Prompt Recap */}
      <Card padding="sm" className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <GitBranch className="h-4 w-4 shrink-0 text-violet-400" />
          <p className="truncate text-sm text-slate-200">
            “{activeAnalysis.prompt}”
          </p>
        </div>
        <Badge tone="violet">
          {activeAnalysis.interpretations.length} Ranked Readings
        </Badge>
      </Card>

      {compareMode ? (
        <Card padding="none" className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3.5">Interpretation</th>
                <th className="px-5 py-3.5">Probability</th>
                <th className="px-5 py-3.5">Impact Scope</th>
                <th className="px-5 py-3.5">Risk</th>
                <th className="px-5 py-3.5 text-right">Selection</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/8">
              {activeAnalysis.interpretations.map((interp) => {
                const isSelected = interp.id === selectedInterpretationId
                return (
                  <tr
                    key={interp.id}
                    className={
                      isSelected ? 'bg-cyan-500/8' : 'hover:bg-white/3'
                    }
                  >
                    <td className="px-5 py-4">
                      <p className="font-semibold text-white">{interp.title}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {interp.summary}
                      </p>
                    </td>
                    <td className="px-5 py-4 font-mono text-cyan-300">
                      {interp.probability}%
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-300">
                      {interp.impactScope}
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={RISK_TONE[interp.riskLevel]}>
                        {interp.riskLevel}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Button
                        size="sm"
                        variant={isSelected ? 'primary' : 'secondary'}
                        onClick={() => setSelectedInterpretationId(interp.id)}
                      >
                        {isSelected ? 'Selected' : 'Select'}
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {activeAnalysis.interpretations.map((interp, idx) => {
            const isSelected = interp.id === selectedInterpretationId
            return (
              <Card
                key={interp.id}
                hover
                className={`flex flex-col justify-between gap-5 transition-all ${
                  isSelected
                    ? 'border-cyan-400/60 ring-1 ring-cyan-400/35 bg-cyan-500/5'
                    : ''
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={idx === 0 ? 'violet' : 'slate'}>
                      Rank #{idx + 1} • {interp.probability}% likelihood
                    </Badge>
                    <Badge tone={RISK_TONE[interp.riskLevel]}>
                      {interp.riskLevel} Risk
                    </Badge>
                  </div>

                  {/* Probability bar */}
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400"
                      style={{ width: `${interp.probability}%` }}
                    />
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {interp.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-300">
                      {interp.summary}
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/8 bg-[#050814]/70 p-3 space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Impact Scope: <span className="text-cyan-300">{interp.impactScope}</span>
                    </p>
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Implicit Assumptions
                      </p>
                      <ul className="space-y-1">
                        {interp.assumptions.map((a) => (
                          <li
                            key={a}
                            className="flex items-start gap-1.5 text-xs text-slate-300"
                          >
                            <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-violet-400" />
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 text-xs text-amber-200/90">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                    <span>{interp.recommendedAction}</span>
                  </div>
                </div>

                <Button
                  variant={isSelected ? 'primary' : 'secondary'}
                  iconLeft={
                    isSelected ? <CheckCircle2 className="h-4 w-4" /> : undefined
                  }
                  onClick={() => setSelectedInterpretationId(interp.id)}
                >
                  {isSelected
                    ? 'Active Interpretation'
                    : 'Choose Interpretation'}
                </Button>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
