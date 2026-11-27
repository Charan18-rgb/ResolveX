import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  GitBranch,
  Layers,
  MessageSquareMore,
  Package,
  Radar,
  SearchCheck,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { IntelligenceSphere3D } from "@/components/hero/IntelligenceSphere3D";
import { AnalysisProgressBanner } from "@/components/resolvex/AnalysisProgressBanner";
import { Badge } from "@/components/resolvex/Badge";
import { Button } from "@/components/resolvex/Button";
import { Card } from "@/components/resolvex/Card";
import { DemoBanner } from "@/components/resolvex/DemoBanner";
import { PromptHighlighter } from "@/components/resolvex/PromptHighlighter";
import { PromptInputCard } from "@/components/resolvex/PromptInputCard";
import { SectionHeader } from "@/components/resolvex/SectionHeader";
import { useResolveX } from "@/context/useResolveX";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

const THREE_STAGES = [
  {
    step: "01 — Detect",
    title: "Identify Ambiguous Expressions",
    description:
      "Pinpoint vague pronouns, relative timing, and underspecified boundaries in English, Kannada, Hindi, Hinglish, and Kanglish.",
    icon: SearchCheck,
    to: "/analysis",
  },
  {
    step: "02 — Clarify",
    title: "Optimize Targeted Questions",
    description:
      "Simulate What-If interpretations, ask priority-ranked clarification questions, and verify required fields.",
    icon: MessageSquareMore,
    to: "/clarification",
  },
  {
    step: "03 — Resolve",
    title: "Verify & Act With Confidence",
    description:
      "Produce deterministic intent specs and link directly into PS2 Smart Inventory & CRD risk workflows.",
    icon: CheckCircle2,
    to: "/resolution",
  },
] as const;

const FEATURE_CARDS = [
  {
    title: "Detection & Context Graph",
    badge: "PS6 Stage 01",
    icon: Radar,
    to: "/visualization",
    description:
      "Highlights span-level ambiguities and maps actions, people, objects, dates, and locations on an interactive graph.",
  },
  {
    title: "What-If Simulator",
    badge: "PS6 Stage 02",
    icon: GitBranch,
    to: "/interpretations",
    description:
      "Compare competing interpretations side by side across actions, entities, recipients, and dry-run consequences.",
  },
  {
    title: "Clarification & Verification",
    badge: "PS6 Stage 03",
    icon: ShieldCheck,
    to: "/clarification",
    description:
      "Ranks ambiguities by importance, detects missing or contradictory answers, and stops early once clear.",
  },
  {
    title: "Inventory & CRD Hub",
    badge: "PS2 Unified",
    icon: Package,
    to: "/inventory",
    description:
      "Monitor stock availability, CRD delay risks, shortages, PO recommendations, and approvals across demo roles.",
  },
] as const;

function LandingPage() {
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
    runAnalysis,
    selectExamplePrompt,
    selectMultilingualSample,
    settings,
    apiError,
    clearApiError,
  } = useResolveX();

  const [hasAnalyzedHere, setHasAnalyzedHere] = useState(false);

  const handleAnalyze = async (overridePrompt?: string) => {
    try {
      await runAnalysis(overridePrompt);
      setHasAnalyzedHere(true);
    } catch {
      // apiError surfaced cleanly in UI
    }
  };

  return (
    <div className="pb-20">
      {/* Hero with 3D-Inspired Intelligence Sphere */}
      <section className="relative pt-10 pb-14 sm:pt-16 sm:pb-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <motion.div
              initial={settings.reduceMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: settings.reduceMotion ? 0 : 0.4 }}
              className="lg:col-span-7 space-y-5 text-center lg:text-left"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1 text-xs font-medium text-violet-200">
                <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                <span>PS6 Language Intelligence + PS2 Inventory Intelligence</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.08]">
                Understand the Unclear.{" "}
                <span className="bg-gradient-to-r from-violet-400 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">
                  Resolve the Intent.
                </span>
              </h1>

              <p className="text-sm font-medium text-cyan-300">
                Not Everything You Say Is What You Mean.
              </p>

              <p className="max-w-2xl mx-auto lg:mx-0 text-base sm:text-lg leading-relaxed text-slate-300">
                An intelligent system that identifies ambiguity in natural language, simulates
                What-If interpretations, asks priority-ranked questions, and connects resolved
                intent directly into smart inventory & CRD operations.
              </p>

              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 pt-1">
                <Button
                  size="lg"
                  onClick={() => void navigate({ to: "/workspace" })}
                  iconRight={<ArrowRight className="h-4 w-4" />}
                >
                  Start Resolving
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => void navigate({ to: "/inventory" })}
                  iconLeft={<Package className="h-4 w-4 text-cyan-400" />}
                >
                  Open Inventory Hub
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => void navigate({ to: "/how-it-works" })}
                >
                  Explore How It Works
                </Button>
              </div>
            </motion.div>

            <div className="lg:col-span-5">
              <IntelligenceSphere3D reduceMotion={settings.reduceMotion} />
            </div>
          </div>

          {/* Interactive Prompt Input Workspace */}
          <div className="mx-auto mt-12 max-w-5xl space-y-5">
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
              onAnalyze={handleAnalyze}
              onSelectExample={async (id) => {
                try {
                  await selectExamplePrompt(id);
                  setHasAnalyzedHere(true);
                } catch {
                  // apiError surfaced cleanly in UI
                }
              }}
              onSelectMultilingualSample={async (id) => {
                try {
                  await selectMultilingualSample(id);
                  setHasAnalyzedHere(true);
                } catch {
                  // apiError surfaced cleanly in UI
                }
              }}
              showControls={false}
              showExamples={true}
              analyzeLabel="Analyze Prompt"
            />

            {apiError && (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-500/12 px-4 py-3 text-xs sm:text-sm text-rose-100"
              >
                <span>{apiError}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={clearApiError}>
                    Dismiss
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void navigate({ to: "/settings" })}
                  >
                    Check Settings
                  </Button>
                </div>
              </div>
            )}

            <AnalysisProgressBanner
              isAnalyzing={isAnalyzing}
              activeStage={analysisStage}
              stageLabel={analysisStageLabel}
            />

            {/* Analysis Preview */}
            <Card className="border-cyan-500/20 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Badge tone={!activeAnalysis.isDemoData ? "emerald" : "cyan"}>
                    {!activeAnalysis.isDemoData
                      ? `LIVE BACKEND (${activeAnalysis.backendData?.status ?? "ANALYZED"})`
                      : hasAnalyzedHere
                        ? "LIVE MOCK RESULT"
                        : "SAMPLE ANALYSIS PREVIEW"}
                  </Badge>
                  <Badge tone="violet">
                    {activeAnalysis.multilingual.detectedLanguage}
                    {activeAnalysis.multilingual.isCodeMixed ? " • Code-Mixed" : ""}
                  </Badge>
                  <span className="text-xs text-slate-400">
                    Domain: <strong className="text-slate-200">{activeAnalysis.domain}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 font-mono text-rose-200">
                    Ambiguity: {activeAnalysis.ambiguityScore}%
                  </span>
                  <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-mono text-amber-200">
                    Risk: {activeAnalysis.riskLevel}
                  </span>
                </div>
              </div>

              <PromptHighlighter
                prompt={activeAnalysis.prompt}
                spans={activeAnalysis.spans}
                onSelectSpan={() => void navigate({ to: "/visualization" })}
              />

              {activeAnalysis.multilingual.detectedLanguage !== "English" && (
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/8 px-3.5 py-2.5 text-xs text-slate-200">
                  <span className="font-semibold text-cyan-300 mr-1.5">
                    Normalized Meaning (Separate):
                  </span>
                  {activeAnalysis.multilingual.normalizedEnglishMeaning}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <p className="text-xs sm:text-sm text-slate-300">{activeAnalysis.summary}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    iconLeft={<Eye className="h-3.5 w-3.5 text-cyan-400" />}
                    onClick={() => void navigate({ to: "/visualization" })}
                  >
                    Context Graph
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void navigate({ to: "/analysis" })}
                    iconRight={<ArrowRight className="h-3.5 w-3.5" />}
                  >
                    Inspect Full Analysis
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* 3-Stage Overview */}
      <section className="py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
          <SectionHeader
            eyebrow="Three Core Stages"
            title="From Underspecified Language to Verified Action"
            align="center"
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {THREE_STAGES.map((stage) => {
              const Icon = stage.icon;
              return (
                <Card key={stage.step} hover className="flex flex-col justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge tone="cyan">{stage.step}</Badge>
                      <Icon className="h-5 w-5 text-violet-300" />
                    </div>
                    <h3 className="text-lg font-semibold text-white">{stage.title}</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">{stage.description}</p>
                  </div>
                  <Link
                    to={stage.to}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300 hover:text-cyan-200"
                  >
                    <span>Explore stage</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Unified Capabilities */}
      <section className="py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
          <SectionHeader
            eyebrow="Unified Platform"
            title="PS6 Language Intelligence Meets PS2 Inventory Operations"
            description="Every module shares one assistant, unified analytics, and consistent design tokens."
            actions={
              <Button
                variant="outline"
                onClick={() => void navigate({ to: "/evaluation" })}
                iconLeft={<Layers className="h-4 w-4" />}
              >
                Unified Analytics
              </Button>
            }
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURE_CARDS.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card key={feature.title} hover className="flex flex-col justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Icon className="h-5 w-5 text-cyan-400" />
                      <Badge tone="violet">{feature.badge}</Badge>
                    </div>
                    <h3 className="text-base font-semibold text-white">{feature.title}</h3>
                    <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                  <Link
                    to={feature.to}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300 hover:text-cyan-200"
                  >
                    <span>Open module</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Card>
              );
            })}
          </div>

          <DemoBanner />
        </div>
      </section>
    </div>
  );
}
