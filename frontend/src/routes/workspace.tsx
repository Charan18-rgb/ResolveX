import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  GitBranch,
  History,
  MessageSquareMore,
  Package,
  SearchCheck,
  Trash2,
} from "lucide-react";
import { AnalysisProgressBanner } from "@/components/resolvex/AnalysisProgressBanner";
import { Badge } from "@/components/resolvex/Badge";
import { Button } from "@/components/resolvex/Button";
import { Card } from "@/components/resolvex/Card";
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
    sessionHistory,
    runAnalysis,
    selectExamplePrompt,
    selectMultilingualSample,
    loadHistorySession,
    clearHistory,
  } = useResolveX();

  const handleAnalyzeAndOpen = async (overridePrompt?: string) => {
    await runAnalysis(overridePrompt);
    void navigate({ to: "/analysis" });
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
      title: "Inventory & CRD Hub (PS2)",
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

      <AnalysisProgressBanner
        isAnalyzing={isAnalyzing}
        activeStage={analysisStage}
        stageLabel={analysisStageLabel}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-6">
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

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-200">
              Jump Into Active Pipeline or PS2 Inventory
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
