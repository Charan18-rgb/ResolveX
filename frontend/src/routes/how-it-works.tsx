import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  GitBranch,
  Languages,
  Layers,
  MessageSquareMore,
  Network,
  SearchCheck,
  Server,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/resolvex/Badge";
import { Button } from "@/components/resolvex/Button";
import { Card } from "@/components/resolvex/Card";
import { SectionHeader } from "@/components/resolvex/SectionHeader";
import { useResolveX } from "@/context/useResolveX";
import { API_ENDPOINTS, resolveXService } from "@/services/api";

export const Route = createFileRoute("/how-it-works")({
  component: HowItWorksPage,
});

interface PipelineDetail {
  id: string;
  step: string;
  title: string;
  icon: typeof SearchCheck;
  route:
    | "/analysis"
    | "/visualization"
    | "/interpretations"
    | "/clarification"
    | "/resolution"
    | "/inventory";
  inputExample: string;
  transformation: string;
  outputExample: string;
}

const PIPELINE_DETAILS: PipelineDetail[] = [
  {
    id: "detect",
    step: "Step 01",
    title: "Multilingual NLU & Ambiguity Detection",
    icon: SearchCheck,
    route: "/analysis",
    inputExample:
      "“Update the auth service and deploy it soon...” / “Bengaluru warehouse stock bega check maadi...”",
    transformation:
      "Preserves original script & code-mixed tokens (Kannada, Hindi, Hinglish, Kanglish, English), normalizes semantic meaning, and flags underspecified verbs, unresolved pronouns, open dates, and missing quantities.",
    outputExample:
      "AmbiguitySpans tagged (Lexical, Referential, Temporal, Scope, Quantitative) with severity & confidence.",
  },
  {
    id: "graph",
    step: "Step 02",
    title: "Context Intelligence Graph & What-If Mapping",
    icon: GitBranch,
    route: "/visualization",
    inputExample: "Tagged spans + active domain + knowledge graph entities",
    transformation:
      "Maps actions, actors, SKUs, warehouses, dates, and ambiguous references onto an interactive semantic graph while generating side-by-side What-If execution scenarios with consequence previews.",
    outputExample:
      "Ranked interpretations with action/entity/date diffs synchronized live with graph node states.",
  },
  {
    id: "clarify",
    step: "Step 03",
    title: "Smart Clarification Optimizer",
    icon: MessageSquareMore,
    route: "/clarification",
    inputExample: "Ranked unresolved ambiguities above threshold",
    transformation:
      "Calculates information gain per ambiguity dimension, asks the single highest-priority question first in the selected language, recalculates remaining entropy after every answer, and stops early when essential intent is clear.",
    outputExample:
      "Minimal targeted clarification turns with visible rationale & one-click undo/reset.",
  },
  {
    id: "resolve",
    step: "Step 04",
    title: "Verification Layer & Intent Compilation",
    icon: ShieldCheck,
    route: "/resolution",
    inputExample: "Selected interpretation + clarification answers",
    transformation:
      "Audits essential required vs. optional intent fields for missing, ambiguous, or contradictory states. Routes back to clarification if required checks fail; compiles verified JSON once all gates pass.",
    outputExample:
      "Verified natural-language directive + FastAPI-ready structured intent contract.",
  },
  {
    id: "inventory",
    step: "Step 05",
    title: "Smart Inventory & Procurement Execution (PS2)",
    icon: Boxes,
    route: "/inventory",
    inputExample: "Verified supply-chain directive or live BOM/CRD inventory telemetry",
    transformation:
      "Bridges clarified operational commands directly with SKU stockout risk, Customer Requested Date (CRD) delay projection, optimal replenishment recommendations, Draft PO actions, and Role-based Approvals.",
    outputExample:
      "Synchronized Inventory Planner / Procurement / Operations workflows + shared AI assistant.",
  },
];

const ENDPOINT_FLOW_STEPS = [
  "User Input",
  "NLU & Language Normalization",
  "Context Graph & Ambiguity Detection",
  "What-If Interpretation Mapping",
  "Priority Clarification Optimizer",
  "Verification Gate",
  "Structured Intent / PS2 Action",
];

function HowItWorksPage() {
  const navigate = useNavigate();
  const { settings } = useResolveX();
  const [activeStageId, setActiveStageId] = useState("detect");

  const activeStage = PIPELINE_DETAILS.find((s) => s.id === activeStageId) ?? PIPELINE_DETAILS[0]!;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-10">
      <SectionHeader
        eyebrow="Architecture & Methodology"
        title="How ResolveX Bridges Language & Supply Chain Decisions"
        description="Explore the connected end-to-end architecture combining PS6 Ambiguity Resolution with PS2 Smart Inventory Intelligence."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => void navigate({ to: "/inventory" })}
              iconLeft={<Boxes className="h-4 w-4" />}
            >
              Open Inventory Hub
            </Button>
            <Button
              onClick={() => void navigate({ to: "/workspace" })}
              iconRight={<ArrowRight className="h-4 w-4" />}
            >
              Try Prompt Workspace
            </Button>
          </div>
        }
      />

      {/* Connected End-to-End Flow */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-cyan-200">
              Connected Pipeline Flow
            </h2>
          </div>
          <Badge tone="cyan">PS6 NLU + PS2 Supply Chain</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ENDPOINT_FLOW_STEPS.map((label, idx) => (
            <div key={label} className="flex items-center gap-2">
              <span className="rounded-xl border border-white/12 bg-[#050814]/85 px-3 py-1.5 text-xs font-medium text-slate-200">
                <span className="font-mono text-cyan-300 mr-1.5">0{idx + 1}</span>
                {label}
              </span>
              {idx < ENDPOINT_FLOW_STEPS.length - 1 && (
                <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Interactive 5-Stage Walkthrough */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-3">
          {PIPELINE_DETAILS.map((stage) => {
            const Icon = stage.icon;
            const isActive = stage.id === activeStage.id;
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => setActiveStageId(stage.id)}
                className={`w-full cursor-pointer rounded-2xl border p-4 text-left transition-all ${
                  isActive
                    ? "border-cyan-400/60 bg-cyan-500/12 shadow-lg shadow-cyan-500/10"
                    : "border-white/10 bg-slate-900/45 hover:border-violet-400/40"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/15 text-violet-300">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-wider text-cyan-300">
                        {stage.step}
                      </p>
                      <h3 className="text-sm sm:text-base font-semibold text-white">
                        {stage.title}
                      </h3>
                    </div>
                  </div>
                  <ArrowRight
                    className={`h-4 w-4 shrink-0 transition-transform ${
                      isActive ? "text-cyan-300 translate-x-0.5" : "text-slate-500"
                    }`}
                  />
                </div>
              </button>
            );
          })}
        </div>

        <Card padding="lg" className="lg:col-span-7 flex flex-col justify-between gap-6">
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-2">
              <Badge tone="violet">{activeStage.step}</Badge>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void navigate({ to: activeStage.route })}
                iconRight={<ArrowRight className="h-3.5 w-3.5" />}
              >
                Open Live View
              </Button>
            </div>

            <div>
              <h3 className="text-2xl font-semibold text-white">{activeStage.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                {activeStage.transformation}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="rounded-xl border border-white/10 bg-[#050814]/80 p-4 space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Stage Input
                </p>
                <p className="text-xs sm:text-sm text-slate-200">{activeStage.inputExample}</p>
              </div>
              <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/8 p-4 space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
                  Stage Output
                </p>
                <p className="text-xs sm:text-sm text-white">{activeStage.outputExample}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="rounded-xl border border-white/10 bg-white/3 p-3 flex items-start gap-2.5">
                <Languages className="h-4 w-4 text-violet-300 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-white">6 Languages</p>
                  <p className="text-[11px] text-slate-400">Auto, EN, KN, HI, Hinglish, Kanglish</p>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/3 p-3 flex items-start gap-2.5">
                <Network className="h-4 w-4 text-cyan-300 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-white">Live Graph Sync</p>
                  <p className="text-[11px] text-slate-400">
                    Nodes react to interpretations &amp; answers
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/3 p-3 flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-300 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-white">Verified Output</p>
                  <p className="text-[11px] text-slate-400">
                    Zero silent guesses on critical gates
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* FastAPI Readiness Section */}
      <Card padding="lg" className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Server className="h-5 w-5 text-cyan-400" />
            <div>
              <h3 className="text-lg font-semibold text-white">
                Future FastAPI Integration Contract
              </h3>
              <p className="text-xs text-slate-400">
                Centralized service layer configured with{" "}
                <code className="text-cyan-300">VITE_API_BASE_URL</code> (currently{" "}
                <code className="text-violet-300">{settings.apiBaseUrl}</code>)
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void navigate({ to: "/settings" })}>
            Configure API Base URL
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(Object.keys(API_ENDPOINTS) as Array<keyof typeof API_ENDPOINTS>).map((key) => (
            <div
              key={key}
              className="rounded-xl border border-white/10 bg-[#050814]/85 p-3.5 flex items-center justify-between gap-3"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-300">
                  {key}
                </p>
                <p className="mt-0.5 font-mono text-xs text-slate-200 break-all">
                  {resolveXService.getEndpointUrl(settings.apiBaseUrl, key)}
                </p>
              </div>
              <Badge tone="slate">Mock Active</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
