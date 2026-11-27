import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  History,
  Info,
  ListOrdered,
  MessageSquareMore,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Undo2,
  Zap,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Badge } from "@/components/resolvex/Badge";
import { Button } from "@/components/resolvex/Button";
import { Card } from "@/components/resolvex/Card";
import { DemoBanner } from "@/components/resolvex/DemoBanner";
import { MultilingualContextBanner } from "@/components/resolvex/MultilingualContextBanner";
import { SectionHeader } from "@/components/resolvex/SectionHeader";
import { VerificationSummaryPanel } from "@/components/resolvex/VerificationSummaryPanel";
import { useResolveX } from "@/context/useResolveX";
import { CATEGORY_STYLE_MAP } from "@/data/categoryStyles";
import { localizeClarificationQuestion, localizeSelectionReason } from "@/data/multilingualEngine";

export const Route = createFileRoute("/clarification")({
  component: ClarificationPage,
});

function ClarificationPage() {
  const navigate = useNavigate();
  const {
    activeAnalysis,
    selectedInterpretation,
    optimizerState,
    verificationReport,
    focusedQuestionId,
    focusClarificationQuestion,
    language,
    uiLanguage,
    allowOptionalRefinement,
    setAllowOptionalRefinement,
    submitClarificationTurn,
    revertToTurn,
    resetClarificationFlow,
    generateFinalResolution,
    settings,
  } = useResolveX();

  const [customInput, setCustomInput] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [verificationGateAlert, setVerificationGateAlert] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  const {
    activeQuestion,
    activeSelectionReason,
    conversationHistory,
    currentClarityScore,
    essentialFields,
    initialClarityScore,
    isSufficientlyClear,
    progressPercentage,
    rankedAmbiguities,
    remainingAmbiguityScore,
    skippedOptionalCount,
    stopReason,
    unresolvedQuestionsQueue,
  } = optimizerState;

  const focusedQuestion = focusedQuestionId
    ? activeAnalysis.clarificationQuestions.find((q) => q.id === focusedQuestionId)
    : undefined;

  const rawDisplayedQuestion = focusedQuestion ?? activeQuestion;
  const displayedQuestion = rawDisplayedQuestion
    ? localizeClarificationQuestion(rawDisplayedQuestion, uiLanguage)
    : null;

  const displayedFailedCheck = displayedQuestion
    ? verificationReport.fieldChecks.find(
        (c) =>
          c.targetQuestionId === displayedQuestion.id &&
          (c.status === "Ambiguous" || c.status === "Contradictory"),
      )
    : undefined;

  const displayedSelectionReason = displayedFailedCheck
    ? `Targeted re-clarification (${displayedFailedCheck.status}): ${displayedFailedCheck.explanation}`
    : displayedQuestion && displayedQuestion.id !== activeQuestion?.id
      ? `Routed by Verification Layer: ${displayedQuestion.selectionExplanation}`
      : localizeSelectionReason(activeSelectionReason, rawDisplayedQuestion, uiLanguage);

  const handleSelectOption = (optionId: string, resolvesTo: string) => {
    if (!displayedQuestion) return;
    setCustomInput("");
    setCustomError(null);
    setVerificationGateAlert(null);
    submitClarificationTurn(displayedQuestion.id, optionId, "", resolvesTo);
  };

  const handleSubmitCustom = (e: FormEvent) => {
    e.preventDefault();
    if (!displayedQuestion) return;
    const trimmed = customInput.trim();
    if (!trimmed) {
      setCustomError(
        "Enter a custom clarification value or choose one of the predefined options above.",
      );
      return;
    }
    setCustomError(null);
    setVerificationGateAlert(null);
    submitClarificationTurn(displayedQuestion.id, null, trimmed, trimmed);
    setCustomInput("");
  };

  const handleFocusQuestion = (questionId: string | null) => {
    if (!questionId) return;
    focusClarificationQuestion(questionId);
    setVerificationGateAlert(null);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleGenerateResolution = async () => {
    if (!verificationReport.allRequiredPassed) {
      const firstFailing = verificationReport.fieldChecks.find(
        (c) =>
          c.required &&
          (c.status === "Missing" || c.status === "Ambiguous" || c.status === "Contradictory"),
      );
      setVerificationGateAlert(verificationReport.completenessExplanation);
      if (firstFailing?.targetQuestionId) {
        focusClarificationQuestion(firstFailing.targetQuestionId);
      }
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }

    setVerificationGateAlert(null);
    setIsResolving(true);
    try {
      await generateFinalResolution();
      void navigate({ to: "/resolution" });
    } finally {
      setIsResolving(false);
    }
  };

  const clarityLift = Math.max(0, currentClarityScore - initialClarityScore);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-8">
      <SectionHeader
        eyebrow="Stage 04 — Smart Clarification Optimizer"
        title="Priority-Ranked Disambiguation"
        description="Questions are dynamically ranked by ambiguity impact. Answer the highest-priority question first and watch remaining uncertainties recalculate live."
        actions={
          <div className="flex flex-wrap gap-2">
            {conversationHistory.length > 0 && (
              <Button
                variant="secondary"
                iconLeft={<RotateCcw className="h-4 w-4" />}
                onClick={() => {
                  resetClarificationFlow();
                  setCustomInput("");
                  setCustomError(null);
                  setVerificationGateAlert(null);
                }}
              >
                Reset Turns
              </Button>
            )}
            <Button
              isLoading={isResolving}
              onClick={() => void handleGenerateResolution()}
              iconRight={<ArrowRight className="h-4 w-4" />}
            >
              {verificationReport.allRequiredPassed
                ? "Verify & Finalize Resolution"
                : "Verify & Continue"}
            </Button>
          </div>
        }
      />

      <DemoBanner
        compact
        label="DEMO OPTIMIZER"
        description="Deterministic local priority ranking & early-stopping engine. Structured for future FastAPI /api/v1/resolve orchestration."
      />

      <MultilingualContextBanner
        compact
        multilingual={activeAnalysis.multilingual}
        selectedLanguage={language}
        uiLanguage={uiLanguage}
      />

      {verificationGateAlert && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-500/12 px-4 py-3 text-xs sm:text-sm text-rose-100"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{verificationGateAlert}</span>
          </div>
          <Badge tone="rose">Verification Gate Blocked</Badge>
        </div>
      )}

      {/* Progress & Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="lg:col-span-8 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-cyan-400" />
              <span className="font-semibold text-slate-200">
                Essential Intent Coverage ({progressPercentage}%)
              </span>
            </div>
            <span className="font-mono text-slate-400">
              {conversationHistory.length} turn
              {conversationHistory.length === 1 ? "" : "s"} completed •{" "}
              {unresolvedQuestionsQueue.length} remaining in queue
            </span>
          </div>

          <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 via-indigo-400 to-cyan-400 transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Essential Intent Fields
            </p>
            <div className="flex flex-wrap gap-2">
              {essentialFields.map((field) => {
                const isClear = field.status === "Clear";
                return (
                  <div
                    key={field.field}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                      isClear
                        ? "border-emerald-500/35 bg-emerald-500/12 text-emerald-200"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-200"
                    }`}
                  >
                    {isClear ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-amber-400" />
                    )}
                    <span>{field.field}</span>
                    {field.resolvedByToken && (
                      <span className="font-mono text-[10px] opacity-80">
                        ({field.resolvedByToken})
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {selectedInterpretation && (
            <p className="text-xs text-slate-400 pt-1 border-t border-white/8">
              Active Interpretation:{" "}
              <span className="font-medium text-violet-300">{selectedInterpretation.title}</span>
            </p>
          )}
        </Card>

        <Card className="lg:col-span-4 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Live Intent Clarity</span>
            <Badge tone={isSufficientlyClear ? "emerald" : "cyan"}>
              {isSufficientlyClear ? "Sufficiently Clear" : "Optimizing"}
            </Badge>
          </div>
          <div className="flex items-baseline gap-3">
            <p className="font-mono text-4xl font-bold text-emerald-300">{currentClarityScore}%</p>
            {clarityLift > 0 && (
              <span className="font-mono text-xs font-semibold text-cyan-300">
                +{clarityLift} pts
              </span>
            )}
          </div>
          <div className="space-y-1 text-xs text-slate-400">
            <div className="flex justify-between">
              <span>Remaining Ambiguity</span>
              <span className="font-mono text-slate-200">
                {remainingAmbiguityScore}% (initial {activeAnalysis.ambiguityScore}%)
              </span>
            </div>
            <div className="flex justify-between">
              <span>Target Threshold</span>
              <span className="font-mono text-slate-200">
                ≤ {Math.min(settings.ambiguityThreshold, 35)}% + essential fields
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-6">
          <AnimatePresence mode="wait">
            {displayedQuestion ? (
              <motion.div
                key={displayedQuestion.id}
                initial={settings.reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={settings.reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                transition={{ duration: settings.reduceMotion ? 0 : 0.22 }}
              >
                <Card
                  padding="lg"
                  className="border-cyan-500/30 space-y-5 relative overflow-hidden"
                >
                  <div className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full bg-cyan-500/12 blur-3xl" />

                  <div className="relative flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={displayedFailedCheck ? "rose" : "cyan"}>
                        {displayedFailedCheck
                          ? `Targeted Re-clarification (${displayedFailedCheck.status})`
                          : `Highest Priority • Turn ${conversationHistory.length + 1}`}
                      </Badge>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          CATEGORY_STYLE_MAP[displayedQuestion.category].badge
                        }`}
                      >
                        {displayedQuestion.category}
                      </span>
                      <Badge tone="violet">{displayedQuestion.essentialField}</Badge>
                      <Badge tone="slate">
                        {uiLanguage}
                        {uiLanguage !== "English" ? " (Mock)" : ""}
                      </Badge>
                    </div>
                    <span className="font-mono text-xs text-cyan-300">
                      Importance {displayedQuestion.importanceScore}/100
                    </span>
                  </div>

                  <div className="relative space-y-2">
                    <p className="font-mono text-xs text-slate-400">
                      Ambiguous Span:{" "}
                      <span className="rounded bg-white/8 px-2 py-0.5 text-cyan-200">
                        “{displayedQuestion.targetToken}”
                      </span>
                    </p>
                    <h3 className="text-xl sm:text-2xl font-semibold text-white">
                      {displayedQuestion.question}
                    </h3>
                  </div>

                  <div className="relative grid grid-cols-1 gap-3">
                    <div
                      className={`rounded-xl border p-3.5 space-y-1 ${
                        displayedFailedCheck
                          ? "border-rose-500/35 bg-rose-500/10"
                          : "border-violet-500/30 bg-violet-500/10"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-200">
                        <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
                        <span>Why This Question Was Selected Next</span>
                      </div>
                      <p className="text-xs sm:text-sm leading-relaxed text-slate-200">
                        {displayedSelectionReason}
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-[#050814]/80 p-3.5 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                        <Info className="h-3.5 w-3.5 text-amber-400" />
                        <span>Why Clarification Is Necessary</span>
                      </div>
                      <p className="text-xs sm:text-sm leading-relaxed text-slate-400">
                        {displayedQuestion.necessityReason}
                      </p>
                    </div>
                  </div>

                  <div className="relative space-y-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Select a Predefined Resolution (applies & recalculates immediately)
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {displayedQuestion.options.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleSelectOption(opt.id, opt.resolvesTo)}
                          className="group cursor-pointer rounded-xl border border-white/12 bg-[#050814]/80 p-4 text-left transition-all hover:border-cyan-400/70 hover:bg-cyan-500/12"
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-sm font-semibold text-white group-hover:text-cyan-200">
                              {opt.label}
                            </span>
                            <ArrowRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-cyan-300 transition-transform group-hover:translate-x-0.5" />
                          </div>
                          <p className="text-xs text-slate-400">{opt.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <form
                    onSubmit={handleSubmitCustom}
                    className="relative pt-3 border-t border-white/10 space-y-2.5"
                  >
                    <label
                      htmlFor="custom-optimizer-input"
                      className="flex items-center gap-1.5 text-xs font-medium text-slate-300"
                    >
                      <MessageSquareMore className="h-3.5 w-3.5 text-violet-400" />
                      <span>Or provide a custom specification:</span>
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <input
                        id="custom-optimizer-input"
                        type="text"
                        value={customInput}
                        onChange={(e) => {
                          setCustomInput(e.target.value);
                          if (customError) setCustomError(null);
                        }}
                        placeholder={`Specify exact constraint for "${displayedQuestion.targetToken}"...`}
                        className="flex-1 rounded-xl border border-white/12 bg-[#050814]/90 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none"
                      />
                      <Button type="submit" variant="secondary">
                        Submit Custom Answer
                      </Button>
                    </div>
                    {customError && (
                      <div role="alert" className="flex items-center gap-1.5 text-xs text-rose-300">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>{customError}</span>
                      </div>
                    )}
                  </form>
                </Card>
              </motion.div>
            ) : (
              <motion.div
                key="optimizer-complete"
                initial={settings.reduceMotion ? false : { opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: settings.reduceMotion ? 0 : 0.25 }}
              >
                <Card padding="lg" className="border-emerald-500/35 bg-emerald-500/5 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge tone="emerald">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Optimization Complete
                    </Badge>
                    {skippedOptionalCount > 0 && (
                      <Badge tone="cyan">
                        Early Stop Saved {skippedOptionalCount} Turn
                        {skippedOptionalCount === 1 ? "" : "s"}
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-xl sm:text-2xl font-semibold text-white">
                      All Essential Intent Fields Are Clear
                    </h3>
                    <p className="text-sm leading-relaxed text-slate-300">{stopReason}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <Button
                      size="lg"
                      isLoading={isResolving}
                      onClick={() => void handleGenerateResolution()}
                      iconRight={<ArrowRight className="h-4 w-4" />}
                    >
                      View Final Resolution
                    </Button>
                    {skippedOptionalCount > 0 && !allowOptionalRefinement && (
                      <Button variant="secondary" onClick={() => setAllowOptionalRefinement(true)}>
                        Refine {skippedOptionalCount} Optional Ambiguit
                        {skippedOptionalCount === 1 ? "y" : "ies"} Anyway
                      </Button>
                    )}
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-cyan-400" />
                <h3 className="text-base font-semibold text-white">
                  Clarification Conversation History
                </h3>
              </div>
              <span className="font-mono text-xs text-slate-400">
                {conversationHistory.length} turn
                {conversationHistory.length === 1 ? "" : "s"}
              </span>
            </div>

            {conversationHistory.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/12 p-5 text-center text-xs sm:text-sm text-slate-400">
                No clarification turns recorded yet. Answer the top-ranked question above to begin
                optimizing intent.
              </div>
            ) : (
              <div className="space-y-3">
                {conversationHistory.map((turn, idx) => (
                  <div
                    key={turn.questionId}
                    className="rounded-xl border border-white/10 bg-[#050814]/80 p-4 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="violet">Turn {idx + 1}</Badge>
                        {turn.essentialField && <Badge tone="emerald">{turn.essentialField}</Badge>}
                        {turn.targetToken && (
                          <span className="font-mono text-xs text-cyan-300">
                            “{turn.targetToken}”
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {typeof turn.clarityBefore === "number" &&
                          typeof turn.clarityAfter === "number" && (
                            <span className="font-mono text-[11px] text-emerald-300">
                              Clarity {turn.clarityBefore}% → {turn.clarityAfter}%
                            </span>
                          )}
                        <button
                          type="button"
                          onClick={() => revertToTurn(idx)}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-slate-400 hover:border-amber-400/40 hover:text-amber-200 transition-colors"
                          title="Rewind conversation back to this question"
                        >
                          <Undo2 className="h-3 w-3" />
                          Rewind
                        </button>
                      </div>
                    </div>

                    {turn.questionText && (
                      <p className="text-xs font-medium text-slate-300">Q: {turn.questionText}</p>
                    )}

                    <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/8 px-3 py-2 text-xs sm:text-sm text-white">
                      <span className="font-semibold text-cyan-300 mr-1.5">
                        A ({turn.source === "custom" ? "Custom" : "Option"}):
                      </span>
                      {turn.resolvedValue}
                    </div>

                    {turn.selectionExplanation && (
                      <p className="text-[11px] text-slate-400">
                        <span className="font-semibold text-violet-300">Selection rationale:</span>{" "}
                        {turn.selectionExplanation}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <VerificationSummaryPanel
            report={verificationReport}
            title="Live Verification Gate"
            onRouteToQuestion={handleFocusQuestion}
          />

          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListOrdered className="h-4 w-4 text-violet-400" />
                <h3 className="text-base font-semibold text-white">
                  Ranked Ambiguity Priority Queue
                </h3>
              </div>
              <Badge tone="violet">Live Recalculation</Badge>
            </div>

            <p className="text-xs text-slate-400">
              Remaining ambiguities are re-scored and re-ranked after every answer, including
              cascading reductions on dependent pronouns.
            </p>

            <div className="space-y-3">
              {rankedAmbiguities.map((item) => {
                const style = CATEGORY_STYLE_MAP[item.category];
                const isNextActive = displayedQuestion?.targetSpanId === item.spanId;
                return (
                  <div
                    key={item.spanId}
                    className={`rounded-xl border p-3.5 space-y-2 transition-all ${
                      isNextActive
                        ? "border-cyan-400/60 bg-cyan-500/10"
                        : item.status === "Resolved"
                          ? "border-emerald-500/25 bg-emerald-500/5 opacity-80"
                          : "border-white/10 bg-[#050814]/75"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-300">
                          #{item.rank}
                        </span>
                        <span className="font-mono text-sm font-semibold text-white">
                          “{item.token}”
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${style.badge}`}
                        >
                          {item.category}
                        </span>
                      </div>
                      <Badge
                        tone={
                          item.status === "Resolved"
                            ? "emerald"
                            : item.status === "Reduced"
                              ? "cyan"
                              : isNextActive
                                ? "violet"
                                : "amber"
                        }
                      >
                        {isNextActive ? "Asking Now" : item.status}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>
                        Field: <strong className="text-slate-200">{item.essentialField}</strong> (
                        {item.isEssential ? "Essential" : "Optional"})
                      </span>
                      <span className="font-mono text-cyan-300">
                        Severity {item.currentSeverity}%
                        {item.currentSeverity !== item.baseSeverity && (
                          <span className="text-slate-500"> (was {item.baseSeverity}%)</span>
                        )}
                      </span>
                    </div>

                    <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          item.status === "Resolved" ? "bg-emerald-400" : style.dot
                        }`}
                        style={{ width: `${item.currentSeverity}%` }}
                      />
                    </div>

                    <p className="text-[11px] leading-relaxed text-slate-400">{item.rankReason}</p>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
