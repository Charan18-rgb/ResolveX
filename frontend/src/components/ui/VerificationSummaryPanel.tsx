import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import type {
  FieldVerificationStatus,
  ResolutionVerificationReport,
} from '../../types/resolvex'
import { Badge, type BadgeTone } from './Badge'
import { Button } from './Button'
import { Card } from './Card'

const STATUS_BADGE: Record<
  FieldVerificationStatus,
  { tone: BadgeTone; label: string }
> = {
  Passed: { tone: 'emerald', label: 'Passed' },
  Missing: { tone: 'amber', label: 'Missing' },
  Ambiguous: { tone: 'rose', label: 'Ambiguous' },
  Contradictory: { tone: 'rose', label: 'Contradictory' },
  'Optional Pending': { tone: 'slate', label: 'Optional Pending' },
}

interface VerificationSummaryPanelProps {
  report: ResolutionVerificationReport
  title?: string
  onRouteToQuestion?: (questionId: string | null) => void
}

export function VerificationSummaryPanel({
  report,
  title = 'Resolution Verification Layer',
  onRouteToQuestion,
}: VerificationSummaryPanelProps) {
  const statusTone: BadgeTone =
    report.status === 'Verified'
      ? 'emerald'
      : report.status === 'Blocked'
        ? 'rose'
        : 'amber'

  return (
    <Card
      className={`space-y-4 ${
        report.status === 'Verified'
          ? 'border-emerald-500/30'
          : report.status === 'Blocked'
            ? 'border-rose-500/35'
            : 'border-amber-500/30'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {report.status === 'Verified' ? (
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          ) : report.status === 'Blocked' ? (
            <AlertOctagon className="h-4 w-4 text-rose-400" />
          ) : (
            <ShieldAlert className="h-4 w-4 text-amber-400" />
          )}
          <h3 className="text-base font-semibold text-white">{title}</h3>
        </div>
        <Badge tone={statusTone}>{report.status}</Badge>
      </div>

      {/* Completeness Score + Explanation */}
      <div className="rounded-xl border border-white/10 bg-[#050814]/80 p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-slate-300">
            Resolution Completeness Score
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-2xl font-bold text-white">
              {report.completenessScore}%
            </span>
            <span className="font-mono text-[11px] text-slate-400">
              ({report.requiredPassed}/{report.requiredTotal} required •{' '}
              {report.optionalPassed}/{report.optionalTotal} optional)
            </span>
          </div>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              report.status === 'Verified'
                ? 'bg-gradient-to-r from-emerald-500 to-cyan-400'
                : report.status === 'Blocked'
                  ? 'bg-rose-500'
                  : 'bg-amber-400'
            }`}
            style={{ width: `${report.completenessScore}%` }}
          />
        </div>

        <p className="text-xs leading-relaxed text-slate-300">
          {report.completenessExplanation}
        </p>
      </div>

      {/* Contradictions Alert */}
      {report.contradictions.length > 0 && (
        <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-3.5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-rose-200">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>
              {report.contradictions.length} Contradiction
              {report.contradictions.length === 1 ? '' : 's'} Detected
            </span>
          </div>
          <ul className="space-y-1.5">
            {report.contradictions.map((c, idx) => (
              <li
                key={`${c.fields.join('-')}-${idx}`}
                className="text-xs text-rose-100/90"
              >
                {c.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Field-level verification checks */}
      <div className="space-y-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Field-Level Verification Status
        </p>
        <div className="space-y-2">
          {report.fieldChecks.map((check) => {
            const badgeCfg = STATUS_BADGE[check.status]
            const isFailure =
              check.status === 'Missing' ||
              check.status === 'Ambiguous' ||
              check.status === 'Contradictory'

            return (
              <div
                key={check.field}
                className={`rounded-xl border p-3 space-y-1.5 ${
                  check.status === 'Passed'
                    ? 'border-emerald-500/20 bg-emerald-500/5'
                    : isFailure
                      ? 'border-rose-500/25 bg-rose-500/5'
                      : 'border-white/10 bg-[#050814]/65'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {check.status === 'Passed' ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    ) : check.status === 'Optional Pending' ? (
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                    )}
                    <span className="text-xs font-semibold text-white">
                      {check.field}
                    </span>
                    <Badge tone={check.required ? 'violet' : 'slate'}>
                      {check.required ? 'Required' : 'Optional'}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge tone={badgeCfg.tone}>{badgeCfg.label}</Badge>
                    {isFailure && onRouteToQuestion && check.targetQuestionId && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onRouteToQuestion(check.targetQuestionId ?? null)}
                        iconRight={<ArrowRight className="h-3 w-3" />}
                      >
                        Fix
                      </Button>
                    )}
                  </div>
                </div>

                <p className="text-[11px] leading-relaxed text-slate-300">
                  {check.explanation}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}
