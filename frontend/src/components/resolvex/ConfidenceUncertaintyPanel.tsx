import {
  AlertOctagon,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Cpu,
  HelpCircle,
  MessageSquareMore,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type {
  ConfidenceAssessment,
  ConfidenceBand,
  VerifiedCorrectnessState,
} from "@/types/resolvex";
import { Badge, type BadgeTone } from "./Badge";
import { Button } from "./Button";
import { Card } from "./Card";
import { ConfidenceHistoryChart } from "./ConfidenceHistoryChart";

const BAND_TONE: Record<ConfidenceBand, BadgeTone> = {
  high: "emerald",
  moderate: "cyan",
  low: "amber",
  abstained: "rose",
};

const VERIFIED_META: Record<VerifiedCorrectnessState, { label: string; tone: BadgeTone }> = {
  verified: { label: "Verified Correctness", tone: "emerald" },
  partially_verified: { label: "Partially Verified", tone: "cyan" },
  unverified: { label: "Unverified (Not Proven Correct)", tone: "amber" },
  contradictory: { label: "Contradictory / Unsafe", tone: "rose" },
};

interface ConfidenceUncertaintyPanelProps {
  assessment: ConfidenceAssessment;
  compact?: boolean | undefined;
  showHistory?: boolean | undefined;
  liveBackendNotice?: string | null | undefined;
  onRequestClarification?: (() => void) | undefined;
  title?: string | undefined;
}

export function ConfidenceUncertaintyPanel({
  assessment,
  compact = false,
  showHistory = false,
  liveBackendNotice = null,
  onRequestClarification,
  title = "Confidence & Uncertainty Intelligence",
}: ConfidenceUncertaintyPanelProps) {
  const verifiedMeta = VERIFIED_META[assessment.verifiedCorrectness];
  const confidencePct =
    assessment.confidenceScore !== null ? Math.round(assessment.confidenceScore * 100) : null;
  const unresolvedList = assessment.unresolvedEntities.filter((e) => !e.resolved);

  const provenanceBadge =
    assessment.provenance === "live_backend"
      ? { label: "Live FastAPI Backend Calibration", tone: "emerald" as const }
      : assessment.provenance === "ai_unavailable_abstained"
        ? { label: "Backend AI Unavailable — Abstained", tone: "rose" as const }
        : {
            label: "Client Simulation (DEMO DATA — Not Live Model Confidence)",
            tone: "amber" as const,
          };

  const confidenceEqualsVerified =
    !assessment.abstained && assessment.verifiedCorrectness === "verified";

  return (
    <div className="space-y-4">
      <Card className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Scale className="h-4 w-4 text-cyan-400" />
              <h3 className="text-base font-semibold text-white">{title}</h3>
            </div>
            <p className="text-xs text-slate-400">{assessment.calibrationNote}</p>
          </div>
          <Badge tone={provenanceBadge.tone}>
            <Cpu className="h-3 w-3" />
            {provenanceBadge.label}
          </Badge>
        </div>

        {liveBackendNotice && (
          <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-100 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
            <span>{liveBackendNotice}</span>
          </div>
        )}

        {/* Abstention Guard Banner */}
        {assessment.abstained && (
          <div
            role="status"
            className="rounded-2xl border border-rose-500/45 bg-rose-500/12 p-4 flex items-start gap-3"
          >
            <Ban className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-rose-100">
                  Engine Abstained Instead of Guessing
                </p>
                <Badge tone="rose">Insufficient / Conflicting Evidence</Badge>
              </div>
              <p className="text-xs text-rose-200/90 leading-relaxed">
                {assessment.abstentionReason ??
                  "Evidence is insufficient or contradictory; ResolveX refuses to guess a confident answer."}
              </p>
            </div>
          </div>
        )}

        {/* Clarification Recommendation Policy Guard */}
        {assessment.recommendedAction !== "proceed_verified" && (
          <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2.5 text-xs text-amber-100">
              <MessageSquareMore className="h-4 w-4 shrink-0 text-amber-300 mt-0.5 sm:mt-0" />
              <div>
                <span className="font-semibold">
                  {assessment.recommendedAction === "resolve_conflicts"
                    ? "Policy Recommendation: Resolve Contradictions Before Execution — "
                    : "Policy Recommendation: Clarify Instead of Forcing Interpretation — "}
                </span>
                <span className="text-amber-200/85">{assessment.recommendationReason}</span>
              </div>
            </div>
            {onRequestClarification && (
              <Button size="sm" variant="secondary" onClick={onRequestClarification}>
                Clarify Instead
              </Button>
            )}
          </div>
        )}

        {/* Distinction Grid: Confidence vs Verified Correctness */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/10 bg-[#050814]/80 p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-400">
                1. Evidence-Calibrated Confidence
              </span>
              <Badge tone={BAND_TONE[assessment.confidenceBand]}>
                {assessment.confidenceBand.toUpperCase()}
              </Badge>
            </div>
            <div className="flex items-baseline gap-3">
              <span
                className={`font-mono text-3xl font-bold ${
                  assessment.abstained
                    ? "text-rose-300"
                    : (confidencePct ?? 0) >= 78
                      ? "text-emerald-300"
                      : (confidencePct ?? 0) >= 50
                        ? "text-cyan-300"
                        : "text-amber-300"
                }`}
              >
                {confidencePct !== null ? `${confidencePct}%` : "ABSTAINED"}
              </span>
              <span className="font-mono text-xs text-slate-400">
                Sufficiency {Math.round(assessment.evidenceSufficiencyScore * 100)}%
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Measures how strongly available backend signals lean toward candidate interpretations
              — NOT whether constraints are verified safe.
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#050814]/80 p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-400">
                2. Verified Correctness (Separate Gate)
              </span>
              <Badge tone={verifiedMeta.tone}>
                {assessment.verifiedCorrectness === "verified" ? (
                  <ShieldCheck className="h-3 w-3" />
                ) : (
                  <ShieldAlert className="h-3 w-3" />
                )}
                {verifiedMeta.label}
              </Badge>
            </div>
            <p className="text-xs sm:text-sm font-medium text-white pt-1">
              {confidenceEqualsVerified
                ? "Verified & Safe to Execute"
                : assessment.verifiedCorrectness === "contradictory"
                  ? "Blocked by Contradictory Evidence"
                  : "Confidence ≠ Verified Correctness"}
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {assessment.verificationExplanation}
            </p>
          </div>
        </div>

        {/* Supporting vs Contradicting Evidence */}
        {!compact && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-300">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Supporting Evidence</span>
                </div>
                <Badge tone="emerald">{assessment.supportingEvidence.length}</Badge>
              </div>
              {assessment.supportingEvidence.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No strong supporting evidence established yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {assessment.supportingEvidence.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-white/8 bg-[#050814]/80 p-2.5 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-emerald-200">{item.label}</span>
                        <span className="font-mono text-[10px] text-emerald-300">
                          +{Math.round(item.impactWeight * 100)}w
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">{item.detail}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-300">
                  <AlertOctagon className="h-3.5 w-3.5" />
                  <span>Contradicting Evidence</span>
                </div>
                <Badge tone={assessment.contradictingEvidence.length > 0 ? "rose" : "slate"}>
                  {assessment.contradictingEvidence.length}
                </Badge>
              </div>
              {assessment.contradictingEvidence.length === 0 ? (
                <p className="text-xs text-slate-400 inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  No contradictions detected across prompt or turns.
                </p>
              ) : (
                <div className="space-y-2">
                  {assessment.contradictingEvidence.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-rose-500/25 bg-[#050814]/80 p-2.5 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-rose-200">{item.label}</span>
                        <span className="font-mono text-[10px] text-rose-300">
                          -{Math.round(item.impactWeight * 100)}w
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">{item.detail}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Missing Context & Unresolved Entities */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/10 bg-[#050814]/75 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200 inline-flex items-center gap-1.5">
                <HelpCircle className="h-3.5 w-3.5 text-amber-300" />
                Missing Context Slots
              </span>
              <Badge tone={assessment.missingContext.length > 0 ? "amber" : "emerald"}>
                {assessment.missingContext.length} Open
              </Badge>
            </div>
            {assessment.missingContext.length === 0 ? (
              <p className="text-xs text-emerald-300">All essential context slots populated.</p>
            ) : (
              <ul className="space-y-1 text-xs text-slate-300">
                {assessment.missingContext.map((ctx) => (
                  <li key={ctx} className="flex items-start gap-1.5">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                    <span>{ctx}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-[#050814]/75 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">Unresolved Entities</span>
              <Badge tone={unresolvedList.length > 0 ? "amber" : "emerald"}>
                {unresolvedList.length} Unresolved
              </Badge>
            </div>
            {assessment.unresolvedEntities.length === 0 ? (
              <p className="text-xs text-slate-400">No ambiguous entity references detected.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {assessment.unresolvedEntities.map((ent) => (
                  <span
                    key={`${ent.token}-${ent.kind}`}
                    title={ent.reason}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-mono ${
                      ent.resolved
                        ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
                        : "border-amber-500/35 bg-amber-500/10 text-amber-200"
                    }`}
                  >
                    {ent.resolved ? "✓" : "?"} {ent.token}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      {showHistory && <ConfidenceHistoryChart history={assessment.history} compact={compact} />}
    </div>
  );
}
