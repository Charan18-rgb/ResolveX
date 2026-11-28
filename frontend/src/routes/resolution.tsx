import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Download,
  History,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/resolvex/Badge";
import { Button } from "@/components/resolvex/Button";
import { Card } from "@/components/resolvex/Card";
import { ConfidenceUncertaintyPanel } from "@/components/resolvex/ConfidenceUncertaintyPanel";
import { ContextMemoryPanel } from "@/components/resolvex/ContextMemoryPanel";
import { DemoBanner } from "@/components/resolvex/DemoBanner";
import { ExplainabilityLedger } from "@/components/resolvex/ExplainabilityLedger";
import { InventoryInsightPanel } from "@/components/resolvex/InventoryInsightPanel";
import { MultilingualContextBanner } from "@/components/resolvex/MultilingualContextBanner";
import { SectionHeader } from "@/components/resolvex/SectionHeader";
import { VerificationSummaryPanel } from "@/components/resolvex/VerificationSummaryPanel";
import { RiskAssessmentPanel } from "@/components/resolvex/RiskAssessmentPanel";
import { DecisionTimelinePanel } from "@/components/resolvex/DecisionTimelinePanel";
import { generateDecisionTimeline } from "@/data/decisionTimelineEngine";
import { useResolveX } from "@/context/useResolveX";

export const Route = createFileRoute("/resolution")({
  component: ResolutionPage,
});

function ResolutionPage() {
  const navigate = useNavigate();
  const {
    activeAnalysis,
    finalResolution,
    optimizerState,
    verificationReport,
    confidenceAssessment,
    liveBackendNotice,
    focusClarificationQuestion,
    language,
    uiLanguage,
    riskAssessment,
    userConfirmedHighRisk,
    setUserConfirmedHighRisk,
  } = useResolveX();
  const [copiedType, setCopiedType] = useState<"prompt" | "json" | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const hasInteractiveTurns = optimizerState.conversationHistory.length > 0;
  const displayVerification = finalResolution.verification ?? verificationReport;
  const isVerifiedResolved = displayVerification.allRequiredPassed;

  const displaySummary = finalResolution.optimizationSummary ?? {
    turnsTaken: optimizerState.conversationHistory.length,
    totalQuestionsAvailable: activeAnalysis.clarificationQuestions.length,
    skippedOptionalCount: optimizerState.skippedOptionalCount,
    stoppedEarly: optimizerState.isSufficientlyClear && optimizerState.skippedOptionalCount > 0,
    stopReason: optimizerState.stopReason,
    essentialFields: optimizerState.essentialFields,
  };

  const firstFailingQuestionId =
    displayVerification.fieldChecks.find(
      (c) =>
        c.required &&
        (c.status === "Missing" || c.status === "Ambiguous" || c.status === "Contradictory") &&
        c.targetQuestionId,
    )?.targetQuestionId ?? null;

  const handleRouteToClarification = (questionId: string | null) => {
    focusClarificationQuestion(questionId);
    void navigate({ to: "/" });
  };

  const displayTimeline =
    finalResolution.decisionTimeline ??
    generateDecisionTimeline({
      analysis: activeAnalysis,
      clarificationAnswers: optimizerState.conversationHistory,
      optimizerState,
      selectedInterpretation: null,
      confidenceAssessment,
      riskAssessment,
      verificationReport: displayVerification,
      contextMemory: activeAnalysis.contextMemory,
      finalResolution,
      userConfirmedHighRisk,
    });

  const jsonPayload = JSON.stringify(
    {
      resolutionId: activeAnalysis.id,
      domain: activeAnalysis.domain,
      verifiedResolved: isVerifiedResolved,
      multilingual: {
        detectedLanguage: activeAnalysis.multilingual.detectedLanguage,
        uiLanguage,
        isCodeMixed: activeAnalysis.multilingual.isCodeMixed,
        originalScriptPreserved: activeAnalysis.multilingual.originalPrompt,
        normalizedEnglishMeaning: activeAnalysis.multilingual.normalizedEnglishMeaning,
      },
      originalPrompt: finalResolution.originalPrompt,
      resolvedPrompt: finalResolution.resolvedPrompt,
      metrics: {
        initialAmbiguityScore: activeAnalysis.ambiguityScore,
        remainingAmbiguityScore: finalResolution.remainingAmbiguityScore,
        clarityGain: finalResolution.clarityGain,
        completenessScore: displayVerification.completenessScore,
      },
      verification: mounted
        ? displayVerification
        : { ...displayVerification, checkedAt: "ssr-pending" },
      confidenceAssessment,
      confidenceHistory: confidenceAssessment.history,
      contextMemory: activeAnalysis.contextMemory,
      riskAssessment,
      decisionTimeline: displayTimeline,
      optimizationSummary: displaySummary,
      structuredSpec: finalResolution.structuredSpec,
      appliedDecisions: finalResolution.appliedDecisions,
    },
    null,
    2,
  );

  const handleCopy = async (type: "prompt" | "json") => {
    if (typeof navigator === "undefined") return;
    const text = type === "prompt" ? finalResolution.resolvedPrompt : jsonPayload;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 1800);
    } catch {
      // Clipboard fallback ignored if permission denied
    }
  };

  const handleDownloadJson = () => {
    if (typeof document === "undefined") return;
    const blob = new Blob([jsonPayload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `resolvex-intent-${activeAnalysis.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-8">
      <SectionHeader
        eyebrow="Stage 05 — Verification & Deterministic Output"
        title="Final Resolution & Verification Summary"
        description="Inspect field-level verification checks, completeness score, optimization trace, and the execution-ready intent specification."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              iconLeft={<ArrowLeft className="h-4 w-4" />}
              onClick={() => handleRouteToClarification(firstFailingQuestionId)}
            >
              {isVerifiedResolved ? "Adjust Clarification" : "Fix Required Fields"}
            </Button>
            <Button
              iconLeft={<RefreshCw className="h-4 w-4" />}
              onClick={() => void navigate({ to: "/workspace" })}
            >
              New Prompt
            </Button>
          </div>
        }
      />

      <DemoBanner compact />

      {activeAnalysis.backendData?.inventory_insight && (
        <InventoryInsightPanel insight={activeAnalysis.backendData.inventory_insight} />
      )}

      {activeAnalysis.backendData?.resolved_intent?.direct_answer && (
        <Card className="border-emerald-500/35 bg-emerald-950/15 space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
            {activeAnalysis.backendData.inventory_insight
              ? "Verified Answer (Inventory Database)"
              : activeAnalysis.backendData.resolved_intent.action === "unit_conversion"
                ? "Verified Answer (Deterministic Unit Converter)"
                : activeAnalysis.backendData.resolved_intent.action === "unsupported_request"
                  ? "Capability Boundary (System Guardrail)"
                  : "AI-Generated Answer (Not Verified Against App Data)"}
          </p>
          <p className="text-sm sm:text-base text-white">
            {activeAnalysis.backendData.resolved_intent.direct_answer}
          </p>
        </Card>
      )}

      <ExplainabilityLedger
        analysis={activeAnalysis}
        finalResolution={finalResolution}
        isVerifiedResolved={isVerifiedResolved}
      />

      {!isVerifiedResolved && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-rose-500/40 bg-rose-500/12 px-5 py-4"
        >
          <div className="flex items-start sm:items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400" />
            <div>
              <p className="text-sm font-semibold text-rose-100">
                Verification Gate Not Passed — Not Marked Resolved
              </p>
              <p className="text-xs text-rose-200/85 mt-0.5">
                {displayVerification.completenessExplanation}
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => handleRouteToClarification(firstFailingQuestionId)}>
            Route to Targeted Clarification
          </Button>
        </div>
      )}

      {!hasInteractiveTurns && isVerifiedResolved && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs sm:text-sm text-amber-100">
          <span>
            Showing preset demo resolution because no custom clarification turns have been submitted
            for this prompt yet.
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void navigate({ to: "/" })}
          >
            Continue in Unified Chat
          </Button>
        </div>
      )}

      {/* Resolution KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="space-y-1.5">
          <span className="text-xs text-slate-400">Verification Completeness</span>
          <p
            className={`font-mono text-3xl font-bold ${
              isVerifiedResolved ? "text-emerald-300" : "text-amber-300"
            }`}
          >
            {displayVerification.completenessScore}%
          </p>
          <p className="text-xs text-slate-400">
            {displayVerification.requiredPassed}/{displayVerification.requiredTotal} required checks
            passed
          </p>
        </Card>

        <Card className="space-y-1.5">
          <span className="text-xs text-slate-400">Clarity Improvement</span>
          <p className="font-mono text-3xl font-bold text-cyan-300">
            {isVerifiedResolved && finalResolution.clarityGain === 0
              ? "Clear"
              : `+${finalResolution.clarityGain} pts`}
          </p>
          <p className="text-xs text-slate-400">
            {isVerifiedResolved && finalResolution.clarityGain === 0
              ? "No ambiguity detected — resolved immediately"
              : `Ambiguity ${activeAnalysis.ambiguityScore}% → ${finalResolution.remainingAmbiguityScore}%`}
          </p>
        </Card>

        <Card className="space-y-1.5">
          <span className="text-xs text-slate-400">Optimizer Efficiency</span>
          <p className="font-mono text-3xl font-bold text-violet-300">
            {displaySummary.turnsTaken} / {displaySummary.totalQuestionsAvailable}
          </p>
          <p className="text-xs text-slate-400">
            {displaySummary.stoppedEarly
              ? `Early stop skipped ${displaySummary.skippedOptionalCount} optional turn${
                  displaySummary.skippedOptionalCount === 1 ? "" : "s"
                }`
              : "Turns completed"}
          </p>
        </Card>

        <Card className="space-y-1.5">
          <span className="text-xs text-slate-400">Resolution Status</span>
          <p className="text-base font-semibold text-white pt-1">
            {finalResolution.structuredSpec.targetScope}
          </p>
          <Badge tone={isVerifiedResolved ? "emerald" : "rose"}>
            {isVerifiedResolved ? (
              <>
                <ShieldCheck className="h-3.5 w-3.5" />
                Verified &amp; Resolved
              </>
            ) : (
              <>
                <ShieldAlert className="h-3.5 w-3.5" />
                {displayVerification.status}
              </>
            )}
          </Badge>
        </Card>
      </div>

      {/* Final Verification Summary */}
      <VerificationSummaryPanel
        report={displayVerification}
        title="Final Verification Summary"
        onRouteToQuestion={handleRouteToClarification}
      />

      {/* Feature 9: Risk-Aware Intent Resolution & Guardrails */}
      <RiskAssessmentPanel
        assessment={riskAssessment}
        userConfirmed={userConfirmedHighRisk}
        onConfirmHighRisk={setUserConfirmedHighRisk}
        onRequestClarification={() => handleRouteToClarification(firstFailingQuestionId)}
        title="Final Risk-Aware Intent Assessment & Guardrails"
      />

      {/* Feature 10: Explainable AI Decision Timeline */}
      <DecisionTimelinePanel timeline={displayTimeline} />

      {/* Confidence & Uncertainty Intelligence Audit + History */}
      <ConfidenceUncertaintyPanel
        assessment={confidenceAssessment}
        showHistory
        liveBackendNotice={liveBackendNotice}
        onRequestClarification={() => handleRouteToClarification(firstFailingQuestionId)}
        title="Confidence vs. Verified Correctness Audit & History"
      />

      <ContextMemoryPanel
        compact
        title="Resolved Session Context Memory Trace"
        onResolveConflictClick={() => handleRouteToClarification(firstFailingQuestionId)}
      />

      <MultilingualContextBanner
        compact
        multilingual={activeAnalysis.multilingual}
        selectedLanguage={language}
        uiLanguage={uiLanguage}
      />

      {/* Before vs After Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-rose-500/25 space-y-3">
          <div className="flex items-center justify-between">
            <Badge tone="rose">Before • Ambiguous Prompt</Badge>
            <span className="font-mono text-xs text-rose-300">
              {activeAnalysis.ambiguityScore}% ambiguity
            </span>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#050814]/85 p-4 text-sm sm:text-base leading-relaxed text-slate-300">
            “{finalResolution.originalPrompt}”
          </div>
          <p className="text-xs text-slate-400">
            Contained {activeAnalysis.spans.length} unresolved ambiguities across{" "}
            {activeAnalysis.domain}.
          </p>
        </Card>

        <Card
          className={`space-y-3 ${
            isVerifiedResolved ? "border-emerald-500/30" : "border-amber-500/30"
          }`}
        >
          <div className="flex items-center justify-between">
            <Badge tone={isVerifiedResolved ? "emerald" : "amber"}>
              <Sparkles className="h-3 w-3" />
              {isVerifiedResolved
                ? "After • Verified Resolved Intent"
                : "Draft • Pending Required Verification"}
            </Badge>
            <span className="font-mono text-xs text-emerald-300">
              {finalResolution.remainingAmbiguityScore}% residual ambiguity
            </span>
          </div>
          <div className="rounded-xl border border-white/15 bg-[#050814]/90 p-4 text-sm sm:text-base leading-relaxed text-white">
            {finalResolution.resolvedPrompt}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              iconLeft={
                copiedType === "prompt" ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )
              }
              onClick={() => void handleCopy("prompt")}
            >
              {copiedType === "prompt" ? "Copied Prompt" : "Copy Resolved Prompt"}
            </Button>
          </div>
        </Card>
      </div>

      {/* Clarification Optimization Trace */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-cyan-400" />
            <h3 className="text-base font-semibold text-white">Clarification Optimization Trace</h3>
          </div>
          <Badge tone={displaySummary.stoppedEarly ? "emerald" : "cyan"}>
            {displaySummary.stoppedEarly
              ? "Stopped Early — Essential Intent Clear"
              : "Intent Field Verification"}
          </Badge>
        </div>

        {displaySummary.stopReason && (
          <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-xs sm:text-sm text-emerald-100">
            {displaySummary.stopReason}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {displaySummary.essentialFields.map((field) => (
            <div
              key={field.field}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium ${
                field.status === "Clear"
                  ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-200"
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{field.field}:</span>
              <span className="font-mono">{field.status}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Applied Decisions + JSON Contract */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-5 space-y-4">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-violet-400" />
            <h3 className="text-base font-semibold text-white">Applied Disambiguation Decisions</h3>
          </div>
          <div className="space-y-3">
            {finalResolution.appliedDecisions.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/12 p-4 text-xs text-slate-400">
                {isVerifiedResolved
                  ? "Resolved directly on initial analysis — no clarification turns required."
                  : "No clarification turns submitted yet."}
              </p>
            ) : (
              finalResolution.appliedDecisions.map((item, idx) => (
                <div
                  key={`${item.token}-${idx}`}
                  className="rounded-xl border border-white/10 bg-[#050814]/80 p-3.5 space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-cyan-300">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span className="font-mono font-semibold">“{item.token}”</span>
                    </div>
                    {item.essentialField && <Badge tone="violet">{item.essentialField}</Badge>}
                  </div>
                  <p className="text-xs sm:text-sm text-slate-200">{item.decision}</p>
                  {item.selectionExplanation && (
                    <p className="text-[11px] text-slate-400">{item.selectionExplanation}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="lg:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-white">
              Structured Intent Specification (API Payload)
            </h3>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                iconLeft={
                  copiedType === "json" ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )
                }
                onClick={() => void handleCopy("json")}
              >
                {copiedType === "json" ? "Copied JSON" : "Copy JSON"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                iconLeft={<Download className="h-3.5 w-3.5" />}
                onClick={handleDownloadJson}
              >
                Export .json
              </Button>
            </div>
          </div>

          <pre className="max-h-96 overflow-auto rounded-xl border border-white/10 bg-[#04060f] p-4 font-mono text-xs leading-relaxed text-cyan-200">
            {jsonPayload}
          </pre>
        </Card>
      </div>
    </div>
  );
}
