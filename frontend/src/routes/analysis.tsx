import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Eye,
  GitBranch,
  Layers,
  ShieldAlert,
} from "lucide-react";
import { useState } from "react";
import { ContextIntelligenceGraph } from "@/components/graph/ContextIntelligenceGraph";
import { Badge, type BadgeTone } from "@/components/resolvex/Badge";
import { Button } from "@/components/resolvex/Button";
import { Card } from "@/components/resolvex/Card";
import { DemoBanner } from "@/components/resolvex/DemoBanner";
import { MultilingualContextBanner } from "@/components/resolvex/MultilingualContextBanner";
import { PromptHighlighter } from "@/components/resolvex/PromptHighlighter";
import { SectionHeader } from "@/components/resolvex/SectionHeader";
import { useResolveX } from "@/context/useResolveX";
import { CATEGORY_STYLE_MAP } from "@/data/categoryStyles";
import type { AmbiguitySpan, RiskLevel } from "@/types/resolvex";

export const Route = createFileRoute("/analysis")({
  component: AnalysisPage,
});

const RISK_TONE: Record<RiskLevel, BadgeTone> = {
  Low: "emerald",
  Moderate: "amber",
  High: "rose",
  Critical: "rose",
};

function AnalysisPage() {
  const navigate = useNavigate();
  const {
    activeAnalysis,
    contextGraph,
    focusClarificationQuestion,
    language,
    uiLanguage,
    settings,
  } = useResolveX();
  const [selectedSpan, setSelectedSpan] = useState<AmbiguitySpan | null>(
    activeAnalysis.spans[0] ?? null,
  );

  const exceedsThreshold = activeAnalysis.ambiguityScore >= settings.ambiguityThreshold;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-8">
      <SectionHeader
        eyebrow="Stage 01 — Detection"
        title="Ambiguity Analysis Report"
        description={activeAnalysis.summary}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              iconLeft={<Eye className="h-4 w-4 text-cyan-400" />}
              onClick={() => void navigate({ to: "/visualization" })}
            >
              Open Visualization
            </Button>
            <Button
              iconRight={<ArrowRight className="h-4 w-4" />}
              onClick={() => void navigate({ to: "/interpretations" })}
            >
              What-If Simulator
            </Button>
          </div>
        }
      />

      <DemoBanner compact />

      <MultilingualContextBanner
        multilingual={activeAnalysis.multilingual}
        selectedLanguage={language}
        uiLanguage={uiLanguage}
      />

      {/* Top KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Ambiguity Index</span>
            <AlertTriangle className="h-4 w-4 text-rose-400" />
          </div>
          <p className="font-mono text-3xl font-bold text-white">
            {activeAnalysis.ambiguityScore}%
          </p>
          <p className="text-xs text-slate-400">
            {exceedsThreshold
              ? `Exceeds ${settings.ambiguityThreshold}% clarification threshold`
              : `Below ${settings.ambiguityThreshold}% threshold`}
          </p>
        </Card>

        <Card className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Initial Clarity Score</span>
            <CheckCircle2 className="h-4 w-4 text-cyan-400" />
          </div>
          <p className="font-mono text-3xl font-bold text-cyan-300">
            {activeAnalysis.clarityScore}%
          </p>
          <p className="text-xs text-slate-400">Estimated readiness before disambiguation</p>
        </Card>

        <Card className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Execution Risk Level</span>
            <ShieldAlert className="h-4 w-4 text-amber-400" />
          </div>
          <div className="pt-1">
            <Badge tone={RISK_TONE[activeAnalysis.riskLevel]} className="text-sm px-3 py-1">
              {activeAnalysis.riskLevel} Risk
            </Badge>
          </div>
          <p className="text-xs text-slate-400">
            Domain: {activeAnalysis.domain} ({activeAnalysis.strictness})
          </p>
        </Card>

        <Card className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Detected Spans</span>
            <Layers className="h-4 w-4 text-violet-400" />
          </div>
          <p className="font-mono text-3xl font-bold text-violet-300">
            {activeAnalysis.spans.length}
          </p>
          <p className="text-xs text-slate-400">
            {activeAnalysis.clarificationQuestions.length} clarification prompts ready
          </p>
        </Card>
      </div>

      {/* Highlighted Prompt */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-white">Inline Ambiguity Span Detection</h3>
          <span className="text-xs text-slate-400">
            Click any highlighted phrase to inspect details
          </span>
        </div>

        <PromptHighlighter
          prompt={activeAnalysis.prompt}
          spans={activeAnalysis.spans}
          selectedSpanId={selectedSpan?.id ?? null}
          onSelectSpan={(span) => setSelectedSpan(span)}
        />
      </Card>

      {/* Span Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-4">
          <h3 className="text-base font-semibold text-white">Detected Ambiguity Spans</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeAnalysis.spans.map((span) => {
              const style = CATEGORY_STYLE_MAP[span.category];
              const isSelected = selectedSpan?.id === span.id;
              return (
                <Card
                  key={span.id}
                  hover
                  onClick={() => setSelectedSpan(span)}
                  className={`cursor-pointer space-y-3 ${
                    isSelected ? "border-cyan-400/50 ring-1 ring-cyan-400/30" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${style.badge}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                      {span.category}
                    </span>
                    <span className="font-mono text-xs text-slate-300">
                      Severity {span.severity}%
                    </span>
                  </div>

                  <div>
                    <p className="font-mono text-sm font-semibold text-white">“{span.token}”</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">{span.reason}</p>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Possible Meanings
                    </p>
                    <ul className="space-y-1">
                      {span.candidateMeanings.map((meaning) => (
                        <li
                          key={meaning}
                          className="text-xs text-slate-300 flex items-center gap-1.5"
                        >
                          <span className="h-1 w-1 rounded-full bg-cyan-400" />
                          <span>{meaning}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {settings.showTokenConfidence && (
                    <div className="pt-1 border-t border-white/8 flex items-center justify-between text-[11px] text-slate-400">
                      <span>Classifier Confidence</span>
                      <span className="font-mono text-cyan-300">
                        {Math.round(span.confidence * 100)}%
                      </span>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-4 space-y-4">
          <h3 className="text-base font-semibold text-white">Category Distribution</h3>
          <Card className="space-y-4">
            {activeAnalysis.categoryBreakdown.map((item) => {
              const style = CATEGORY_STYLE_MAP[item.category];
              return (
                <div key={item.category} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-200">{item.category}</span>
                    <span className="font-mono text-slate-400">
                      {item.score}% ({item.count} span{item.count === 1 ? "" : "s"})
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/8">
                    <div
                      className={`h-full rounded-full ${style.dot}`}
                      style={{ width: `${item.score}%` }}
                    />
                  </div>
                </div>
              );
            })}

            <div className="pt-3 border-t border-white/10 flex flex-col gap-2">
              <Button
                variant="secondary"
                iconLeft={<GitBranch className="h-4 w-4 text-violet-300" />}
                onClick={() => void navigate({ to: "/interpretations" })}
              >
                Open What-If Simulator
              </Button>
              <Button
                onClick={() => void navigate({ to: "/clarification" })}
                iconRight={<ArrowRight className="h-4 w-4" />}
              >
                Proceed to Clarification
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <ContextIntelligenceGraph
        graph={contextGraph}
        title="Context Intelligence Graph — Semantic Entities & Dependencies"
        onClarifyNode={(questionId) => {
          focusClarificationQuestion(questionId);
          void navigate({ to: "/clarification" });
        }}
        onOpenInterpretations={() => void navigate({ to: "/interpretations" })}
      />
    </div>
  );
}
