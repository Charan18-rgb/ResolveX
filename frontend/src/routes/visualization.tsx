import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, GitFork, Sparkles } from "lucide-react";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ContextIntelligenceGraph } from "@/components/graph/ContextIntelligenceGraph";
import { Badge } from "@/components/resolvex/Badge";
import { Button } from "@/components/resolvex/Button";
import { Card } from "@/components/resolvex/Card";
import { ContextMemoryPanel } from "@/components/resolvex/ContextMemoryPanel";
import { RiskAssessmentPanel } from "@/components/resolvex/RiskAssessmentPanel";
import { DemoBanner } from "@/components/resolvex/DemoBanner";
import { PromptHighlighter } from "@/components/resolvex/PromptHighlighter";
import { SectionHeader } from "@/components/resolvex/SectionHeader";
import { useResolveX } from "@/context/useResolveX";
import { CATEGORY_STYLE_MAP } from "@/data/categoryStyles";

export const Route = createFileRoute("/visualization")({
  component: VisualizationPage,
});

function VisualizationPage() {
  const navigate = useNavigate();
  const {
    activeAnalysis,
    contextGraph,
    focusClarificationQuestion,
    riskAssessment,
    userConfirmedHighRisk,
    setUserConfirmedHighRisk,
  } = useResolveX();
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);

  const selectedSpan =
    activeAnalysis.spans.find((s) => s.id === selectedSpanId) ?? activeAnalysis.spans[0] ?? null;

  const spanChartData = activeAnalysis.spans.map((span) => ({
    token: span.token.length > 14 ? `${span.token.slice(0, 12)}…` : span.token,
    severity: span.severity,
    confidence: Math.round(span.confidence * 100),
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-8">
      <SectionHeader
        eyebrow="Stage 02 — Visual Inspection"
        title="Context Graph & Ambiguity Visualization"
        description="Explore interactive entity relationships, token-level ambiguity severity, multi-dimensional linguistic radar profiles, and candidate semantic branches."
        actions={
          <Button
            onClick={() => void navigate({ to: "/interpretations" })}
            iconRight={<ArrowRight className="h-4 w-4" />}
          >
            What-If Simulator
          </Button>
        }
      />

      <DemoBanner compact />

      <ContextIntelligenceGraph
        graph={contextGraph}
        onClarifyNode={(questionId) => {
          focusClarificationQuestion(questionId);
          void navigate({ to: "/clarification" });
        }}
        onOpenInterpretations={() => void navigate({ to: "/interpretations" })}
      />

      <ContextMemoryPanel
        compact
        title="Session Memory Synced with Context Graph"
        onResolveConflictClick={() => void navigate({ to: "/clarification" })}
      />

      {/* Feature 9: Risk-Aware Intent Guardrails */}
      <RiskAssessmentPanel
        compact
        assessment={riskAssessment}
        userConfirmed={userConfirmedHighRisk}
        onConfirmHighRisk={setUserConfirmedHighRisk}
        onRequestClarification={() => void navigate({ to: "/clarification" })}
        title="Context Graph Impact &amp; Consequence Risk Layer"
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-white">Interactive Ambiguity Heatmap</h3>
            <Badge tone="violet">{activeAnalysis.spans.length} Active Spans</Badge>
          </div>

          <PromptHighlighter
            prompt={activeAnalysis.prompt}
            spans={activeAnalysis.spans}
            selectedSpanId={selectedSpan?.id ?? null}
            onSelectSpan={(span) => setSelectedSpanId(span.id)}
          />

          <div className="space-y-2 pt-2">
            <p className="text-xs font-medium text-slate-400">
              Select a span node to inspect its branching meanings:
            </p>
            <div className="flex flex-wrap gap-2">
              {activeAnalysis.spans.map((span) => {
                const style = CATEGORY_STYLE_MAP[span.category];
                const isSelected = selectedSpan?.id === span.id;
                return (
                  <button
                    key={span.id}
                    type="button"
                    onClick={() => setSelectedSpanId(span.id)}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
                      isSelected
                        ? "border-cyan-400/70 bg-cyan-500/15 text-white shadow-md shadow-cyan-500/10"
                        : "border-white/10 bg-white/4 text-slate-300 hover:border-white/25"
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                    <span className="font-mono">{span.token}</span>
                    <span className="text-slate-400">{span.severity}%</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitFork className="h-4 w-4 text-cyan-400" />
              <h3 className="text-base font-semibold text-white">Semantic Branch Tree</h3>
            </div>
            {selectedSpan && <Badge tone="cyan">{selectedSpan.category}</Badge>}
          </div>

          {selectedSpan ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3.5">
                <div className="flex items-center justify-between text-xs text-violet-200 mb-1">
                  <span>Source Token</span>
                  <span className="font-mono">
                    Chars {selectedSpan.startIndex}–{selectedSpan.endIndex}
                  </span>
                </div>
                <p className="font-mono text-base font-semibold text-white">
                  “{selectedSpan.token}”
                </p>
                <p className="mt-1.5 text-xs text-slate-300">{selectedSpan.reason}</p>
              </div>

              <div className="space-y-2.5 pl-4 border-l-2 border-cyan-500/35">
                {selectedSpan.candidateMeanings.map((meaning, idx) => (
                  <div
                    key={meaning}
                    className="relative rounded-xl border border-white/10 bg-[#050814]/80 p-3"
                  >
                    <span className="absolute -left-[22px] top-1/2 h-0.5 w-4 bg-cyan-500/50" />
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
                        <Sparkles className="h-3 w-3" />
                        Branch {idx + 1}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        Candidate Reading
                      </span>
                    </div>
                    <p className="text-sm text-slate-100">{meaning}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              Select a highlighted token to view candidate meanings.
            </p>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-white">6-Dimension Ambiguity Radar</h3>
              <p className="text-xs text-slate-400">
                Intensity across linguistic ambiguity taxonomies (Demo Engine)
              </p>
            </div>
            <Badge tone="cyan">DEMO DATA</Badge>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart
                cx="50%"
                cy="50%"
                outerRadius="72%"
                data={activeAnalysis.categoryBreakdown}
              >
                <PolarGrid stroke="rgba(148,163,184,0.2)" />
                <PolarAngleAxis dataKey="category" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                <PolarRadiusAxis
                  angle={30}
                  domain={[0, 100]}
                  tick={{ fill: "#64748b", fontSize: 10 }}
                />
                <Radar
                  name="Ambiguity Score"
                  dataKey="score"
                  stroke="#06b6d4"
                  fill="#8b5cf6"
                  fillOpacity={0.42}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0a0f1f",
                    borderColor: "rgba(255,255,255,0.14)",
                    borderRadius: "12px",
                    color: "#f8fafc",
                    fontSize: "12px",
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-white">
                Span Severity vs. Classifier Confidence
              </h3>
              <p className="text-xs text-slate-400">
                Per-token risk weighting across detected spans (Demo Engine)
              </p>
            </div>
            <Badge tone="cyan">DEMO DATA</Badge>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={spanChartData} margin={{ top: 10, right: 16, left: -12, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="token" tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0a0f1f",
                    borderColor: "rgba(255,255,255,0.14)",
                    borderRadius: "12px",
                    color: "#f8fafc",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="severity" name="Severity %" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                <Bar
                  dataKey="confidence"
                  name="Confidence %"
                  fill="#06b6d4"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
