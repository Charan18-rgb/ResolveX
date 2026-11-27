import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  Clock,
  Eye,
  GitBranch,
  History,
  MessageSquareMore,
  Package,
  RotateCcw,
  SearchCheck,
  Trash2,
} from "lucide-react";
import { AnalysisProgressBanner } from "@/components/resolvex/AnalysisProgressBanner";
import { Badge } from "@/components/resolvex/Badge";
import { Button } from "@/components/resolvex/Button";
import { Card } from "@/components/resolvex/Card";
import { ContextMemoryPanel } from "@/components/resolvex/ContextMemoryPanel";
import { DemoBanner } from "@/components/resolvex/DemoBanner";
import { PromptInputCard } from "@/components/resolvex/PromptInputCard";
import { SectionHeader } from "@/components/resolvex/SectionHeader";
import { useResolveX } from "@/context/useResolveX";

export const Route = createFileRoute("/workspace")({
  component: WorkspacePage,
});

function WorkspacePage() {
  const navigate = useNavigate();
  const {
    promptInput,
    setPromptInput,
    domain,
    setDomain,
    strictness,
    setStrictness,
    language,
    setLanguage,
    isAnalyzing,
    analysisStage,
    analysisStageLabel,
    activeAnalysis,
    sessionMemory,
    continueInSession,
    setContinueInSession,
    startNewIsolatedSession,
    sessionHistory,
    runAnalysis,
    selectExamplePrompt,
    selectMultilingualSample,
    loadHistorySession,
    clearHistory,
    apiError,
    clearApiError,
  } = useResolveX();

  const handleAnalyzeAndOpen = async (overridePrompt?: string) => {
    try {
      const result = await runAnalysis(overridePrompt);
      if (!result.isDemoData && result.backendData?.status === "RESOLVED") {
        void navigate({ to: "/resolution" });
      } else {
        void navigate({ to: "/analysis" });
      }
    } catch {
      // Error surfaced cleanly via apiError banner
    }
  };

  const pipelineDestinations = [
    {
      title: "Ambiguity Analysis",
      description: `${activeAnalysis.spans.length} spans detected (${activeAnalysis.ambiguityScore}% score)`,
      to: "/analysis" as const,
      icon: SearchCheck,
    },
    {
      title: "Context Intelligence Graph",
      description: "Inspect semantic nodes, heatmap & dimension radar",
      to: "/visualization" as const,
      icon: Eye,
    },
    {
      title: "What-If Simulator",
      description: `${activeAnalysis.interpretations.length} scenarios & intent diffs`,
      to: "/interpretations" as const,
      icon: GitBranch,
    },
    {
      title: "Clarification & Verification",
      description: `${activeAnalysis.clarificationQuestions.length} priority-ranked prompts`,
      to: "/clarification" as const,
      icon: MessageSquareMore,
    },
    {
      title: "Final Resolution",
      description: "Verification summary & JSON intent contract",
      to: "/resolution" as const,
      icon: CheckCircle2,
    },
    {
      title: "Inventory & CRD Hub",
      description: "Materials, shortages, CRD risks & PO approvals",
      to: "/inventory" as const,
      icon: Package,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-8">
      <SectionHeader
        eyebrow="Interactive AI Studio"
        title="Let's Understand What You Mean."
        description="Enter an English, multilingual, or supply-chain instruction. ResolveX runs a 4-stage detection sequence and maps it through the complete verification pipeline."
        actions={
          <Button
            variant="secondary"
            onClick={() => void navigate({ to: "/analysis" })}
            iconRight={<ArrowRight className="h-4 w-4" />}
          >
            View Active Analysis
          </Button>
        }
      />

      <DemoBanner compact />

      {apiError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-500/12 px-4 py-3 text-xs sm:text-sm text-rose-100"
        >
          <span>{apiError}</span>
          <Button size="sm" variant="secondary" onClick={clearApiError}>
            Dismiss
          </Button>
        </div>
      )}

      <AnalysisProgressBanner
        isAnalyzing={isAnalyzing}
        activeStage={analysisStage}
        stageLabel={analysisStageLabel}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-6">
          <Card className="border-indigo-400/20 bg-slate-900/60 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-cyan-300" />
                <span className="text-xs font-semibold text-slate-200">
                  Session Memory Mode ({sessionMemory.messages.length}{" "}
                  {sessionMemory.messages.length === 1 ? "turn" : "turns"} •{" "}
                  {sessionMemory.entities.length} remembered)
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setContinueInSession(true)}
                  className={`cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                    continueInSession
                      ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-200"
                      : "border-white/10 bg-white/4 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Follow-up in Active Session
                </button>
                <button
                  type="button"
                  onClick={() => setContinueInSession(false)}
                  className={`cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                    !continueInSession
                      ? "border-violet-400/50 bg-violet-500/15 text-violet-200"
                      : "border-white/10 bg-white/4 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  New Isolated Session
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => startNewIsolatedSession()}
                  className="text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset Session
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-white/8 pt-2.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Multi-Turn Memory Demo:
              </span>
              <button
                type="button"
                onClick={() => {
                  const p =
                    "Review Q3_Finance_Report.pdf and Budget_2026.xlsx with Rahul Sharma tomorrow.";
                  setPromptInput(p);
                  setContinueInSession(true);
                  void runAnalysis(p, domain, strictness, { forceSessionMode: "new" });
                }}
                className="cursor-pointer rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-200 hover:bg-cyan-500/20"
              >
                1. Load Files &amp; Rahul Sharma
              </button>
              <button
                type="button"
                onClick={() => {
                  const p = "Email him the second one next week.";
                  setPromptInput(p);
                  setContinueInSession(true);
                  void runAnalysis(p, domain, strictness, { forceSessionMode: "continue" });
                }}
                className="cursor-pointer rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/20"
              >
                2. Resolve &quot;him&quot; &amp; &quot;the second one&quot;
              </button>
              <button
                type="button"
                onClick={() => {
                  const p = "Send that file to Rahul Verma instead of Priya Nair before Friday.";
                  setPromptInput(p);
                  setContinueInSession(true);
                  void runAnalysis(p, domain, strictness, { forceSessionMode: "continue" });
                }}
                className="cursor-pointer rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-200 hover:bg-amber-500/20"
              >
                3. Trigger Reference Conflict
              </button>
            </div>
          </Card>

          <PromptInputCard
            prompt={promptInput}
            onPromptChange={setPromptInput}
            domain={domain}
            onDomainChange={setDomain}
            strictness={strictness}
            onStrictnessChange={setStrictness}
            language={language}
            onLanguageChange={setLanguage}
            isAnalyzing={isAnalyzing}
            onAnalyze={handleAnalyzeAndOpen}
            onSelectExample={async (id) => {
              await selectExamplePrompt(id);
            }}
            onSelectMultilingualSample={async (id) => {
              await selectMultilingualSample(id);
            }}
            showControls={true}
            showExamples={true}
            analyzeLabel="Analyze & Open Pipeline"
          />

          <ContextMemoryPanel
            title="Active Session Context Memory & Entity Tracker"
            onResolveConflictClick={() => void navigate({ to: "/clarification" })}
          />

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-200">
              Jump Into Active Pipeline or Inventory Hub
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {pipelineDestinations.map((dest) => {
                const Icon = dest.icon;
                return (
                  <button
                    key={dest.to}
                    type="button"
                    onClick={() => void navigate({ to: dest.to })}
                    className="glass-panel glass-panel-hover flex cursor-pointer items-start gap-3 rounded-xl p-4 text-left"
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/15 text-violet-300">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{dest.title}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{dest.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-4">
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-white">Recent Sessions</h3>
              </div>
              {sessionHistory.length > 0 && (
                <button
                  type="button"
                  onClick={clearHistory}
                  className="inline-flex cursor-pointer items-center gap-1 text-xs text-slate-400 hover:text-rose-300 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear
                </button>
              )}
            </div>

            {sessionHistory.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-slate-400">
                No recent sessions yet. Run an analysis or click an example prompt to record history
                locally.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                {sessionHistory.map((item) => {
                  const isCurrent = item.prompt === activeAnalysis.prompt;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => void loadHistorySession(item)}
                      className={`w-full cursor-pointer rounded-xl border p-3 text-left transition-all ${
                        isCurrent
                          ? "border-cyan-400/50 bg-cyan-500/10"
                          : "border-white/8 bg-white/3 hover:border-violet-400/35 hover:bg-white/6"
                      }`}
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <Badge tone={item.resolved ? "emerald" : "amber"}>
                          {item.resolved ? "Verified" : "Analyzed"}
                        </Badge>
                        <span className="font-mono text-[11px] text-slate-400">
                          {item.ambiguityScore}% ambig.
                        </span>
                      </div>
                      <p className="line-clamp-2 text-xs text-slate-200">{item.prompt}</p>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                        <span>{item.domain}</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(item.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
