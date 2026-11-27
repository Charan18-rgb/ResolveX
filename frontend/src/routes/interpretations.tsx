import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Columns3,
  GitBranch,
  GitCompareArrows,
  Layers,
  Play,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import { useState } from "react";
import { ContextIntelligenceGraph } from "@/components/graph/ContextIntelligenceGraph";
import { Badge, type BadgeTone } from "@/components/resolvex/Badge";
import { Button } from "@/components/resolvex/Button";
import { Card } from "@/components/resolvex/Card";
import { ConfidenceUncertaintyPanel } from "@/components/resolvex/ConfidenceUncertaintyPanel";
import { ContextMemoryPanel } from "@/components/resolvex/ContextMemoryPanel";
import { RiskAssessmentPanel } from "@/components/resolvex/RiskAssessmentPanel";
import { DemoBanner } from "@/components/resolvex/DemoBanner";
import { MultilingualContextBanner } from "@/components/resolvex/MultilingualContextBanner";
import { SectionHeader } from "@/components/resolvex/SectionHeader";
import { useResolveX } from "@/context/useResolveX";
import { localizeInterpretationNote } from "@/data/multilingualEngine";
import type { RiskLevel, SimulatedConsequence } from "@/types/resolvex";

export const Route = createFileRoute("/interpretations")({
  component: InterpretationsPage,
});

const RISK_TONE: Record<RiskLevel, BadgeTone> = {
  Low: "emerald",
  Medium: "amber",
  Moderate: "amber",
  High: "rose",
  Critical: "rose",
};

const CONSEQUENCE_TONE: Record<SimulatedConsequence["severity"], BadgeTone> = {
  Positive: "emerald",
  Neutral: "cyan",
  Risk: "rose",
};

function InterpretationsPage() {
  const navigate = useNavigate();
  const {
    activeAnalysis,
    enrichedInterpretations,
    confidenceAssessment,
    liveBackendNotice,
    selectedInterpretationId,
    setSelectedInterpretationId,
    selectedInterpretation,
    interpretationDiffs,
    contextGraph,
    language,
    uiLanguage,
    sendScenarioToClarification,
    resetInterpretationSimulation,
    focusClarificationQuestion,
    riskAssessment,
    userConfirmedHighRisk,
    setUserConfirmedHighRisk,
  } = useResolveX();

  const scenarios =
    enrichedInterpretations.length > 0 ? enrichedInterpretations : activeAnalysis.interpretations;

  const [viewMode, setViewMode] = useState<"cards" | "matrix">("cards");
  const [onlyDiffs, setOnlyDiffs] = useState(false);
  const [baselineId, setBaselineId] = useState<string>(activeAnalysis.interpretations[0]?.id ?? "");
  const [compareId, setCompareId] = useState<string>(
    activeAnalysis.interpretations[1]?.id ?? activeAnalysis.interpretations[0]?.id ?? "",
  );

  const effectiveBaseline =
    activeAnalysis.interpretations.find((i) => i.id === baselineId) ??
    activeAnalysis.interpretations[0];
  const effectiveCompare =
    activeAnalysis.interpretations.find((i) => i.id === compareId) ??
    activeAnalysis.interpretations[1] ??
    activeAnalysis.interpretations[0];

  const visibleDiffs = onlyDiffs
    ? interpretationDiffs.filter((d) => d.differs)
    : interpretationDiffs;

  const handleSendToClarification = (interpId: string) => {
    sendScenarioToClarification(interpId);
    void navigate({ to: "/clarification" });
  };

  const handleReset = () => {
    resetInterpretationSimulation();
    setViewMode("cards");
    setOnlyDiffs(false);
    setBaselineId(activeAnalysis.interpretations[0]?.id ?? "");
    setCompareId(
      activeAnalysis.interpretations[1]?.id ?? activeAnalysis.interpretations[0]?.id ?? "",
    );
  };

  const diffDimensionSet = new Set(
    interpretationDiffs.filter((d) => d.differs).map((d) => d.dimension),
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-8">
      <SectionHeader
        eyebrow="Stage 03 — What-If Interpretation Simulator"
        title="Simulate & Compare Plausible Intents"
        description="Explore competing meanings side by side, inspect differences across actions, entities, recipients, objects, and dates, preview consequences without running external actions, and send your chosen scenario into clarification."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              iconLeft={<RotateCcw className="h-4 w-4" />}
              onClick={handleReset}
            >
              Reset Simulator
            </Button>
            <Button
              variant="secondary"
              iconLeft={
                viewMode === "cards" ? (
                  <GitCompareArrows className="h-4 w-4 text-cyan-400" />
                ) : (
                  <Columns3 className="h-4 w-4 text-violet-300" />
                )
              }
              onClick={() => setViewMode((prev) => (prev === "cards" ? "matrix" : "cards"))}
            >
              {viewMode === "cards" ? "Comparison Matrix" : "Scenario Cards"}
            </Button>
            {selectedInterpretation && (
              <Button
                onClick={() => handleSendToClarification(selectedInterpretation.id)}
                iconRight={<ArrowRight className="h-4 w-4" />}
              >
                Send Active to Clarification
              </Button>
            )}
          </div>
        }
      />

      <DemoBanner
        compact
        label="DRY-RUN SIMULATOR"
        description="Simulates resulting structured intents and potential consequences locally without executing external actions."
      />

      <MultilingualContextBanner
        compact
        multilingual={activeAnalysis.multilingual}
        selectedLanguage={language}
        uiLanguage={uiLanguage}
      />

      <ConfidenceUncertaintyPanel
        compact
        assessment={confidenceAssessment}
        liveBackendNotice={liveBackendNotice}
        onRequestClarification={() => void navigate({ to: "/clarification" })}
        title="Confidence vs. Verified Correctness Overview"
      />

      <ContextMemoryPanel
        compact
        title="Session Memory & Resolved Scenario Entities"
        onResolveConflictClick={() => void navigate({ to: "/clarification" })}
      />

      {/* Feature 9: Risk-Aware Intent Guardrails */}
      <RiskAssessmentPanel
        compact
        assessment={riskAssessment}
        userConfirmed={userConfirmedHighRisk}
        onConfirmHighRisk={setUserConfirmedHighRisk}
        onRequestClarification={() => void navigate({ to: "/clarification" })}
        title="Scenario Risk Classification & Safety Guardrails"
      />

      <Card padding="sm" className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <GitBranch className="h-4 w-4 shrink-0 text-violet-400" />
          <p className="truncate text-sm text-slate-200">“{activeAnalysis.prompt}”</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="violet">{activeAnalysis.interpretations.length} Scenarios</Badge>
          {selectedInterpretation && (
            <Badge tone="cyan">Active: {selectedInterpretation.title}</Badge>
          )}
        </div>
      </Card>

      {viewMode === "matrix" ? (
        <Card padding="none" className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3.5 w-44">Structured Dimension</th>
                {scenarios.map((interp, idx) => {
                  const isSelected = interp.id === selectedInterpretationId;
                  const isAbstained = interp.confidenceStatus === "abstained";
                  const confLabel = isAbstained
                    ? "Abstained"
                    : interp.confidenceScore != null
                      ? `${Math.round(interp.confidenceScore * 100)}%`
                      : typeof interp.probability === "number"
                        ? `${interp.probability}%`
                        : "—";
                  return (
                    <th key={interp.id} className="px-5 py-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-white font-semibold normal-case">
                          #{idx + 1} {interp.title}
                        </span>
                        <Badge tone={isAbstained ? "rose" : isSelected ? "cyan" : "slate"}>
                          {confLabel}
                        </Badge>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/8">
              {visibleDiffs.map((row) => (
                <tr key={row.dimension} className={row.differs ? "bg-violet-500/5" : ""}>
                  <td className="px-5 py-4 align-top">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{row.label}</span>
                      {row.differs && <Badge tone="amber">DIFF</Badge>}
                    </div>
                    {row.causedByWords.length > 0 && (
                      <p className="mt-1 text-[11px] text-slate-400">
                        Trigger:{" "}
                        <span className="font-mono text-cyan-300">
                          {row.causedByWords.join(", ")}
                        </span>
                      </p>
                    )}
                  </td>
                  {row.valuesByScenario.map((cell) => (
                    <td key={cell.scenarioId} className="px-5 py-4 align-top text-slate-200">
                      {cell.value}
                    </td>
                  ))}
                </tr>
              ))}

              <tr>
                <td className="px-5 py-4 align-top font-semibold text-white">
                  Potential Consequences
                </td>
                {activeAnalysis.interpretations.map((interp) => (
                  <td key={interp.id} className="px-5 py-4 align-top space-y-2">
                    {interp.consequences.map((c) => (
                      <div key={c.label} className="space-y-0.5">
                        <Badge tone={CONSEQUENCE_TONE[c.severity]}>{c.label}</Badge>
                        <p className="text-[11px] text-slate-400">{c.detail}</p>
                      </div>
                    ))}
                  </td>
                ))}
              </tr>

              <tr>
                <td className="px-5 py-4 align-top font-semibold text-white">Actions</td>
                {activeAnalysis.interpretations.map((interp) => {
                  const isSelected = interp.id === selectedInterpretationId;
                  return (
                    <td key={interp.id} className="px-5 py-4 align-top">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant={isSelected ? "primary" : "secondary"}
                          onClick={() => setSelectedInterpretationId(interp.id)}
                        >
                          {isSelected ? "Active in Graph" : "Preview in Graph"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSendToClarification(interp.id)}
                          iconRight={<ArrowRight className="h-3.5 w-3.5" />}
                        >
                          Clarify
                        </Button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {scenarios.map((interp, idx) => {
            const isSelected = interp.id === selectedInterpretationId;
            const sim = interp.simulatedIntent;
            const isAbstained = interp.confidenceStatus === "abstained";
            const confLabel = isAbstained
              ? "Abstained"
              : interp.confidenceScore != null
                ? `${Math.round(interp.confidenceScore * 100)}% Conf`
                : typeof interp.probability === "number"
                  ? `${interp.probability}%`
                  : "—";
            return (
              <Card
                key={interp.id}
                hover
                className={`flex flex-col justify-between gap-5 transition-all ${
                  isSelected ? "border-cyan-400/70 ring-1 ring-cyan-400/40 bg-cyan-500/5" : ""
                }`}
              >
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge tone={isAbstained ? "rose" : idx === 0 ? "violet" : "slate"}>
                      Scenario #{idx + 1} • {confLabel}
                    </Badge>
                    <Badge tone={RISK_TONE[interp.riskLevel]}>{interp.riskLevel} Risk</Badge>
                  </div>

                  <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                    <div
                      className={`h-full rounded-full ${
                        isAbstained
                          ? "bg-rose-500/60"
                          : "bg-gradient-to-r from-violet-500 to-cyan-400"
                      }`}
                      style={{
                        width: `${
                          isAbstained
                            ? 18
                            : interp.confidenceScore != null
                              ? Math.round(interp.confidenceScore * 100)
                              : typeof interp.probability === "number"
                                ? interp.probability
                                : 0
                        }%`,
                      }}
                    />
                  </div>

                  {((interp.supportingSignals?.length ?? 0) > 0 ||
                    (interp.contradictingSignals?.length ?? 0) > 0 ||
                    (interp.missingRequirements?.length ?? 0) > 0) && (
                    <div className="rounded-xl border border-white/8 bg-[#050814]/75 p-2.5 space-y-1 text-[11px]">
                      {interp.supportingSignals?.slice(0, 2).map((s) => (
                        <p key={s} className="text-emerald-300/90">
                          + {s}
                        </p>
                      ))}
                      {interp.contradictingSignals?.slice(0, 2).map((c) => (
                        <p key={c} className="text-rose-300/90">
                          ! {c}
                        </p>
                      ))}
                      {interp.missingRequirements?.slice(0, 1).map((m) => (
                        <p key={m} className="text-amber-200/85">
                          ? Missing: {m}
                        </p>
                      ))}
                    </div>
                  )}

                  <div>
                    <h3 className="text-lg font-semibold text-white">{interp.title}</h3>
                    <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-slate-300">
                      {localizeInterpretationNote(interp, uiLanguage).localizedSummary}
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#050814]/85 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
                        Resulting Structured Intent
                      </span>
                      <Badge tone="cyan">Simulated</Badge>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-start gap-2">
                        <Play className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-400" />
                        <div className="min-w-0">
                          <span className="text-slate-400">Action: </span>
                          <span className="font-medium text-white">{sim.action}</span>
                          {diffDimensionSet.has("action") && (
                            <span className="ml-1.5 rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] text-amber-200">
                              DIFF
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-400" />
                        <div className="min-w-0">
                          <span className="text-slate-400">Entities: </span>
                          <span className="text-slate-200">{sim.entities.join(", ")}</span>
                          {diffDimensionSet.has("entities") && (
                            <span className="ml-1.5 rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] text-amber-200">
                              DIFF
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />
                        <div className="min-w-0">
                          <span className="text-slate-400">Recipient: </span>
                          <span className="text-slate-200">{sim.recipient}</span>
                          {diffDimensionSet.has("recipient") && (
                            <span className="ml-1.5 rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] text-amber-200">
                              DIFF
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        <div className="min-w-0">
                          <span className="text-slate-400">Object: </span>
                          <span className="text-slate-200">{sim.object}</span>
                          {diffDimensionSet.has("object") && (
                            <span className="ml-1.5 rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] text-amber-200">
                              DIFF
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                        <div className="min-w-0">
                          <span className="text-slate-400">Date: </span>
                          <span className="text-slate-200">{sim.date}</span>
                          {diffDimensionSet.has("date") && (
                            <span className="ml-1.5 rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] text-amber-200">
                              DIFF
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Ambiguous Words Driving This Scenario
                    </p>
                    <div className="space-y-1.5">
                      {interp.triggerWords.map((tw) => (
                        <div
                          key={`${interp.id}-${tw.word}`}
                          className="rounded-lg border border-white/8 bg-white/4 p-2.5 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className="font-mono font-semibold text-amber-200">
                              “{tw.word}”
                            </span>
                            <span className="text-[10px] uppercase tracking-wider text-violet-300">
                              {tw.category}
                            </span>
                          </div>
                          <p className="text-[11px] leading-relaxed text-slate-300">
                            {tw.divergenceReason}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Potential Consequences (Dry-Run Preview)
                    </p>
                    <div className="space-y-1.5">
                      {interp.consequences.map((c) => (
                        <div
                          key={c.label}
                          className="flex items-start gap-2 rounded-lg border border-white/8 bg-[#050814]/60 p-2.5 text-xs"
                        >
                          {c.severity === "Risk" ? (
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                          ) : c.severity === "Positive" ? (
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          ) : (
                            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />
                          )}
                          <div>
                            <p className="font-semibold text-white">{c.label}</p>
                            <p className="text-[11px] text-slate-400">{c.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
                  <Button
                    variant={isSelected ? "primary" : "secondary"}
                    iconLeft={isSelected ? <CheckCircle2 className="h-4 w-4" /> : undefined}
                    onClick={() => setSelectedInterpretationId(interp.id)}
                  >
                    {isSelected ? "Active in Graph Preview" : "Select & Preview in Graph"}
                  </Button>
                  <Button
                    variant="outline"
                    iconRight={<ArrowRight className="h-4 w-4" />}
                    onClick={() => handleSendToClarification(interp.id)}
                  >
                    Send to Clarification & Verification
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {effectiveBaseline && effectiveCompare && (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <GitCompareArrows className="h-4 w-4 text-cyan-400" />
              <h3 className="text-base font-semibold text-white">
                Pairwise Structured Intent Diff Explorer
              </h3>
            </div>
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyDiffs}
                onChange={(e) => setOnlyDiffs(e.target.checked)}
                className="h-3.5 w-3.5 accent-cyan-400"
              />
              Highlight differences only
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="sim-baseline-select"
                className="mb-1 block text-xs font-medium text-slate-400"
              >
                Scenario A (Baseline)
              </label>
              <select
                id="sim-baseline-select"
                value={effectiveBaseline.id}
                onChange={(e) => setBaselineId(e.target.value)}
                className="w-full rounded-xl border border-white/12 bg-[#050814]/90 px-3 py-2 text-xs sm:text-sm text-slate-100 focus:border-cyan-400/60 focus:outline-none"
              >
                {activeAnalysis.interpretations.map((i, idx) => (
                  <option key={i.id} value={i.id}>
                    #{idx + 1} {i.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="sim-compare-select"
                className="mb-1 block text-xs font-medium text-slate-400"
              >
                Scenario B (Compare)
              </label>
              <select
                id="sim-compare-select"
                value={effectiveCompare.id}
                onChange={(e) => setCompareId(e.target.value)}
                className="w-full rounded-xl border border-white/12 bg-[#050814]/90 px-3 py-2 text-xs sm:text-sm text-slate-100 focus:border-cyan-400/60 focus:outline-none"
              >
                {activeAnalysis.interpretations.map((i, idx) => (
                  <option key={i.id} value={i.id}>
                    #{idx + 1} {i.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2.5">
            {visibleDiffs.map((diff) => {
              const valA =
                diff.valuesByScenario.find((v) => v.scenarioId === effectiveBaseline.id)?.value ??
                "";
              const valB =
                diff.valuesByScenario.find((v) => v.scenarioId === effectiveCompare.id)?.value ??
                "";
              const pairDiffers = valA.trim().toLowerCase() !== valB.trim().toLowerCase();

              return (
                <div
                  key={diff.dimension}
                  className={`rounded-xl border p-3.5 space-y-2 ${
                    pairDiffers
                      ? "border-amber-500/30 bg-amber-500/5"
                      : "border-white/8 bg-[#050814]/70"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white">{diff.label}</span>
                      <Badge tone={pairDiffers ? "amber" : "emerald"}>
                        {pairDiffers ? "Diverges" : "Identical"}
                      </Badge>
                    </div>
                    {diff.causedByWords.length > 0 && (
                      <span className="text-[11px] text-slate-400">
                        Caused by:{" "}
                        <span className="font-mono text-cyan-300">
                          {diff.causedByWords.join(", ")}
                        </span>
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg border border-white/8 bg-[#050814]/80 p-2.5">
                      <span className="block text-[10px] uppercase tracking-wider text-violet-300 mb-0.5">
                        Scenario A
                      </span>
                      <span className="text-slate-200">{valA}</span>
                    </div>
                    <div className="rounded-lg border border-white/8 bg-[#050814]/80 p-2.5">
                      <span className="block text-[10px] uppercase tracking-wider text-cyan-300 mb-0.5">
                        Scenario B
                      </span>
                      <span className="text-slate-200">{valB}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <ContextIntelligenceGraph
        graph={contextGraph}
        title="Synchronized Context Intelligence Graph (Live Scenario Preview)"
        onClarifyNode={(questionId) => {
          focusClarificationQuestion(questionId);
          void navigate({ to: "/clarification" });
        }}
      />
    </div>
  );
}
