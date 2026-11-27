import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  Cpu,
  FlaskConical,
  History,
  Play,
  PlusCircle,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge, type BadgeTone } from "@/components/resolvex/Badge";
import { Button } from "@/components/resolvex/Button";
import { Card } from "@/components/resolvex/Card";
import { useResolveX } from "@/context/useResolveX";
import {
  ADVERSARIAL_BENCHMARK_CASES,
  computeAdversarialSuiteMetrics,
  mapBackendEvalToAdversarialHistory,
  runAdversarialTestCase,
} from "@/data/adversarialTestingEngine";
import { resolveXService } from "@/services/api";
import type {
  AdversarialCategory,
  AdversarialCaseExecutionResult,
  AdversarialChallengeTag,
  AdversarialExecutionHistoryEntry,
  AdversarialRunProvenance,
  AdversarialTestCase,
  DomainContext,
} from "@/types/resolvex";

const CATEGORY_OPTIONS: Array<{ id: AdversarialCategory | "all"; label: string }> = [
  { id: "all", label: "All Categories" },
  { id: "lexical", label: "Lexical" },
  { id: "referential", label: "Referential" },
  { id: "structural", label: "Structural" },
  { id: "contextual", label: "Contextual" },
  { id: "semantic", label: "Semantic" },
  { id: "underspecification", label: "Underspecification" },
  { id: "clear", label: "Clear Control" },
];

const TAG_OPTIONS: Array<{ id: AdversarialChallengeTag | "all"; label: string }> = [
  { id: "all", label: "All Stress Dimensions" },
  { id: "long_sentence", label: "Long Sentences" },
  { id: "multi_ambiguity", label: "Multiple Ambiguities" },
  { id: "missing_context", label: "Missing Context" },
  { id: "contradictory", label: "Contradictory" },
  { id: "multi_turn", label: "Multi-Turn" },
  { id: "ps2_inventory", label: "PS2 Inventory Bridge" },
  { id: "multilingual", label: "Code-Mixed / Multilingual" },
  { id: "clear_control", label: "Clear Controls" },
];

const DOMAINS: DomainContext[] = [
  "Software Engineering",
  "Supply Chain & Inventory",
  "Data & Analytics",
  "Enterprise Support",
  "Product & Ops",
  "General",
];

const PROVENANCE_BADGE: Record<AdversarialRunProvenance, { label: string; tone: BadgeTone }> = {
  live_backend_evaluated: { label: "Live FastAPI Backend Measured", tone: "emerald" },
  ai_fallback_mixed: { label: "Backend Fallback / Error (Not Live AI)", tone: "rose" },
  client_simulation_evaluated: {
    label: "Client Simulator (Not Live Backend Model)",
    tone: "amber",
  },
};

function formatPct(val: number | null): string {
  if (val === null) return "—";
  return `${Math.round(val * 100)}%`;
}

export function AdversarialTestingLab() {
  const navigate = useNavigate();
  const { settings, runAnalysis } = useResolveX();

  const [testCases, setTestCases] = useState<AdversarialTestCase[]>(ADVERSARIAL_BENCHMARK_CASES);
  const [resultsMap, setResultsMap] = useState<Map<string, AdversarialCaseExecutionResult>>(
    new Map(),
  );
  const [executionHistory, setExecutionHistory] = useState<AdversarialExecutionHistoryEntry[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>(
    ADVERSARIAL_BENCHMARK_CASES[0]?.id ?? "",
  );

  const [categoryFilter, setCategoryFilter] = useState<AdversarialCategory | "all">("all");
  const [tagFilter, setTagFilter] = useState<AdversarialChallengeTag | "all">("all");
  const [verdictFilter, setVerdictFilter] = useState<"all" | "Pass" | "Failed" | "unexecuted">(
    "all",
  );
  const [isRunning, setIsRunning] = useState(false);
  const [runningCaseId, setRunningCaseId] = useState<string | null>(null);
  const [runStatusBanner, setRunStatusBanner] = useState<string | null>(null);

  // Judge Custom Test Submission State
  const [customPrompt, setCustomPrompt] = useState("");
  const [customFollowUp, setCustomFollowUp] = useState("");
  const [customDomain, setCustomDomain] = useState<DomainContext>("Software Engineering");
  const [customGroundTruthMode, setCustomGroundTruthMode] = useState<
    "exploratory" | "ambiguous" | "incomplete" | "context_dependent" | "clear"
  >("exploratory");
  const [customExpectedAmbiguities, setCustomExpectedAmbiguities] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);

  const filteredCases = useMemo(() => {
    return testCases.filter((tc) => {
      if (categoryFilter !== "all" && tc.category !== categoryFilter) return false;
      if (tagFilter !== "all" && !tc.tags.includes(tagFilter)) return false;
      const res = resultsMap.get(tc.id);
      if (verdictFilter === "unexecuted" && res) return false;
      if (
        (verdictFilter === "Pass" || verdictFilter === "Failed") &&
        res?.verdict !== verdictFilter
      )
        return false;
      return true;
    });
  }, [categoryFilter, resultsMap, tagFilter, testCases, verdictFilter]);

  const executedResultsList = useMemo(
    () =>
      testCases
        .map((tc) => resultsMap.get(tc.id))
        .filter((r): r is AdversarialCaseExecutionResult => Boolean(r)),
    [resultsMap, testCases],
  );

  const { resolveXMetrics, baselineMetrics } = useMemo(
    () => computeAdversarialSuiteMetrics(executedResultsList),
    [executedResultsList],
  );

  const overallProvenance: AdversarialRunProvenance = useMemo(() => {
    if (executedResultsList.length === 0) {
      return settings.integrationMode === "live"
        ? "live_backend_evaluated"
        : "client_simulation_evaluated";
    }
    if (executedResultsList.some((r) => r.provenance === "ai_fallback_mixed")) {
      return "ai_fallback_mixed";
    }
    if (executedResultsList.every((r) => r.provenance === "live_backend_evaluated")) {
      return "live_backend_evaluated";
    }
    return "client_simulation_evaluated";
  }, [executedResultsList, settings.integrationMode]);

  const selectedCase = testCases.find((tc) => tc.id === selectedCaseId) ?? testCases[0] ?? null;
  const selectedResult = selectedCase ? (resultsMap.get(selectedCase.id) ?? null) : null;

  const executeSingleCase = async (tc: AdversarialTestCase) => {
    return runAdversarialTestCase(tc, {
      mode: settings.integrationMode === "live" ? "fastapi-ready" : "mock",
      apiBaseUrl: settings.apiBaseUrl,
      analyzeLive: async (instruction, domain) => {
        const { raw } = await resolveXService.analyzePromptLive(settings.apiBaseUrl, {
          prompt: instruction,
          domain,
          strictness: "Balanced",
        });
        return {
          conversationId: raw.conversation_id,
          status: raw.status,
          classification: raw.classification ?? "unknown",
          ambiguityTypes: raw.ambiguity_types,
          needsClarification: raw.needs_clarification,
          interpretations: raw.interpretations.map((i) => i.label),
          turnsTaken: raw.turn_count,
          abstained: raw.confidence_assessment?.abstained ?? false,
          verifiedCorrectness: raw.confidence_assessment?.verified_correctness ?? "unverified",
          provenance: raw.confidence_assessment?.provenance ?? "live_backend",
        };
      },
      clarifyLive: async (conversationId, response) => {
        const { raw } = await resolveXService.clarifyBackendTurn(
          settings.apiBaseUrl,
          conversationId,
          response,
          tc.instruction,
          tc.domain,
          "Balanced",
        );
        return {
          status: raw.status,
          classification: raw.classification ?? "unknown",
          ambiguityTypes: raw.ambiguity_types,
          needsClarification: raw.needs_clarification,
          turnsTaken: raw.turn_count,
          abstained: raw.confidence_assessment?.abstained ?? false,
          verifiedCorrectness: raw.confidence_assessment?.verified_correctness ?? "unverified",
          provenance: raw.confidence_assessment?.provenance ?? "live_backend",
        };
      },
    });
  };

  const handleRunCase = async (tc: AdversarialTestCase) => {
    setRunningCaseId(tc.id);
    setSelectedCaseId(tc.id);
    setRunStatusBanner(null);
    try {
      const res = await executeSingleCase(tc);
      setResultsMap((prev) => {
        const next = new Map(prev);
        next.set(tc.id, res);
        return next;
      });
    } finally {
      setRunningCaseId(null);
    }
  };

  const handleRunSuite = async (casesToRun: AdversarialTestCase[], scopeLabel: string) => {
    if (casesToRun.length === 0) return;
    setIsRunning(true);
    setRunStatusBanner(null);
    try {
      const nextMap = new Map(resultsMap);
      const batchResults: AdversarialCaseExecutionResult[] = [];
      for (const tc of casesToRun) {
        const res = await executeSingleCase(tc);
        nextMap.set(tc.id, res);
        batchResults.push(res);
      }
      setResultsMap(nextMap);

      const batchMetrics = computeAdversarialSuiteMetrics(batchResults);
      const batchProv: AdversarialRunProvenance = batchResults.some(
        (r) => r.provenance === "ai_fallback_mixed",
      )
        ? "ai_fallback_mixed"
        : batchResults.every((r) => r.provenance === "live_backend_evaluated")
          ? "live_backend_evaluated"
          : "client_simulation_evaluated";

      const entry: AdversarialExecutionHistoryEntry = {
        runId: `run-${Date.now()}`,
        timestamp: new Date().toISOString(),
        provenance: batchProv,
        scopeLabel,
        executedCount: batchResults.length,
        groundedCount: batchMetrics.resolveXMetrics.groundedCount,
        resolveXMetrics: batchMetrics.resolveXMetrics,
        baselineMetrics: batchMetrics.baselineMetrics,
        results: batchResults,
      };
      setExecutionHistory((prev) => [entry, ...prev].slice(0, 10));
      setRunStatusBanner(
        `Completed ${batchResults.length} case(s) under ${PROVENANCE_BADGE[batchProv].label}.`,
      );
    } finally {
      setIsRunning(false);
    }
  };

  const handleRunBackendPs6Endpoint = async () => {
    setIsRunning(true);
    setRunStatusBanner(null);
    try {
      const resp = await resolveXService.runBackendPs6Evaluation(settings.apiBaseUrl, true);
      const entry = mapBackendEvalToAdversarialHistory(resp);
      if (!entry) {
        setRunStatusBanner("Backend returned no evaluation record.");
        return;
      }
      setExecutionHistory((prev) => [entry, ...prev].slice(0, 10));
      setResultsMap((prev) => {
        const next = new Map(prev);
        for (const row of entry.results) {
          next.set(row.caseId, row);
        }
        return next;
      });
      setRunStatusBanner(
        entry.provenance === "ai_fallback_mixed"
          ? `Backend /api/evaluation/ps6 ran ${entry.executedCount} adversarial cases, but AI fallback occurred on ${resp.evaluation?.fallback_cases_count ?? entry.executedCount} cases.`
          : `Backend /api/evaluation/ps6 measured ${entry.executedCount} adversarial cases cleanly (F1: ${formatPct(entry.resolveXMetrics.f1Score)}).`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Backend request failed";
      setRunStatusBanner(
        `Unable to reach ${settings.apiBaseUrl}/api/evaluation/ps6 (${msg}). Switch to Live FastAPI Backend in Settings when FastAPI is running, or run cases locally under explicit Client Simulator mode.`,
      );
    } finally {
      setIsRunning(false);
    }
  };

  const handleAddAndRunCustom = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = customPrompt.trim();
    if (trimmed.length < 5) {
      setCustomError("Enter a custom test sentence (at least 5 characters) to evaluate.");
      return;
    }
    setCustomError(null);

    const hasGroundTruth = customGroundTruthMode !== "exploratory";
    const expectedNeeds =
      customGroundTruthMode === "exploratory" ? null : customGroundTruthMode !== "clear";
    const parsedExpectedAmbigs = customExpectedAmbiguities
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const primaryCat: AdversarialCategory =
      customGroundTruthMode === "clear"
        ? "clear"
        : ((parsedExpectedAmbigs[0] as AdversarialCategory | undefined) ?? "contextual");

    const customCase: AdversarialTestCase = {
      id: `judge-${Date.now()}`,
      title: "Judge Custom Adversarial Input",
      instruction: trimmed,
      domain: customDomain,
      category: primaryCat,
      tags: customFollowUp.trim() ? ["multi_turn"] : [],
      hasValidGroundTruth: hasGroundTruth,
      expectedClassification: hasGroundTruth ? customGroundTruthMode : null,
      expectedNeedsClarification: expectedNeeds,
      expectedAmbiguities: parsedExpectedAmbigs,
      expectedInterpretations: [],
      followUpClarification: customFollowUp.trim() || undefined,
      isCustom: true,
      notes: hasGroundTruth
        ? "Judge-submitted case with labeled ground truth."
        : "Exploratory judge-submitted case (excluded from ground-truth F1 until labeled).",
    };

    setTestCases((prev) => [customCase, ...prev]);
    setSelectedCaseId(customCase.id);
    setCustomPrompt("");
    setCustomFollowUp("");
    await handleRunCase(customCase);
  };

  const handleResetLab = () => {
    setResultsMap(new Map());
    setRunStatusBanner(null);
  };

  const handleLoadHistoryRun = (entry: AdversarialExecutionHistoryEntry) => {
    const next = new Map<string, AdversarialCaseExecutionResult>();
    for (const r of entry.results) {
      next.set(r.caseId, r);
    }
    setResultsMap(next);
    setRunStatusBanner(`Loaded historical snapshot: ${entry.scopeLabel} (${entry.timestamp}).`);
  };

  const handleInspectInPipeline = async (instruction: string, domain: DomainContext) => {
    await runAnalysis(instruction, domain, "Balanced");
    void navigate({ to: "/visualization" });
  };

  const baselineChartData = [
    {
      metric: "Precision",
      ResolveX:
        resolveXMetrics.precision !== null ? Math.round(resolveXMetrics.precision * 100) : 0,
      Baseline:
        baselineMetrics.precision !== null ? Math.round(baselineMetrics.precision * 100) : 0,
    },
    {
      metric: "Recall",
      ResolveX: resolveXMetrics.recall !== null ? Math.round(resolveXMetrics.recall * 100) : 0,
      Baseline: baselineMetrics.recall !== null ? Math.round(baselineMetrics.recall * 100) : 0,
    },
    {
      metric: "F1 Score",
      ResolveX: resolveXMetrics.f1Score !== null ? Math.round(resolveXMetrics.f1Score * 100) : 0,
      Baseline: baselineMetrics.f1Score !== null ? Math.round(baselineMetrics.f1Score * 100) : 0,
    },
    {
      metric: "Resolution Acc",
      ResolveX:
        resolveXMetrics.resolutionAccuracy !== null
          ? Math.round(resolveXMetrics.resolutionAccuracy * 100)
          : 0,
      Baseline:
        baselineMetrics.resolutionAccuracy !== null
          ? Math.round(baselineMetrics.resolutionAccuracy * 100)
          : 0,
    },
    {
      metric: "Clarify Efficiency",
      ResolveX:
        resolveXMetrics.clarificationEfficiency !== null
          ? Math.round(resolveXMetrics.clarificationEfficiency * 100)
          : 0,
      Baseline: 0,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Lab Control Bar */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <FlaskConical className="h-5 w-5 text-cyan-400" />
              <h2 className="text-lg sm:text-xl font-semibold text-white">
                Adversarial Ambiguity Testing Lab
              </h2>
              <Badge tone={PROVENANCE_BADGE[overallProvenance].tone}>
                <Cpu className="h-3 w-3" />
                {PROVENANCE_BADGE[overallProvenance].label}
              </Badge>
            </div>
            <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
              Stress-test ResolveX on lexical, referential, structural, contextual, semantic, and
              underspecified prompts, long multi-ambiguity sentences, missing context,
              contradictions, and multi-turn PS6+PS2 scenarios. Metrics update strictly from
              executed tests — never fabricated or pre-marked passing.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              isLoading={isRunning}
              onClick={() =>
                void handleRunSuite(testCases, `Full Suite (${testCases.length} cases)`)
              }
              iconLeft={<Play className="h-3.5 w-3.5" />}
            >
              Run Full Suite ({testCases.length})
            </Button>
            <Button
              size="sm"
              variant="secondary"
              isLoading={isRunning}
              onClick={() =>
                void handleRunSuite(
                  filteredCases,
                  `Filtered Subset (${filteredCases.length} cases)`,
                )
              }
            >
              Run Filtered ({filteredCases.length})
            </Button>
            <Button
              size="sm"
              variant="outline"
              isLoading={isRunning}
              onClick={() => void handleRunBackendPs6Endpoint()}
            >
              Run Backend /api/evaluation/ps6
            </Button>
            {executedResultsList.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleResetLab}
                iconLeft={<RotateCcw className="h-3.5 w-3.5" />}
              >
                Clear Results
              </Button>
            )}
          </div>
        </div>

        {runStatusBanner && (
          <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2.5 text-xs text-cyan-100">
            {runStatusBanner}
          </div>
        )}
      </Card>

      {/* Measured Metrics Strip (Strict Ground-Truth Honesty) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          {
            label: "Precision",
            val: formatPct(resolveXMetrics.precision),
            sub:
              resolveXMetrics.groundedCount > 0
                ? `${resolveXMetrics.truePositives} TP / ${resolveXMetrics.falsePositives} FP`
                : "Not measured yet",
          },
          {
            label: "Recall",
            val: formatPct(resolveXMetrics.recall),
            sub:
              resolveXMetrics.groundedCount > 0
                ? `${resolveXMetrics.truePositives} TP / ${resolveXMetrics.falseNegatives} FN`
                : "Not measured yet",
          },
          {
            label: "F1 Score",
            val: formatPct(resolveXMetrics.f1Score),
            sub: `Baseline ${formatPct(baselineMetrics.f1Score)}`,
          },
          {
            label: "Resolution Accuracy",
            val: formatPct(resolveXMetrics.resolutionAccuracy),
            sub: `${resolveXMetrics.groundedCount} grounded run(s)`,
          },
          {
            label: "False Clarification",
            val: formatPct(resolveXMetrics.falseClarificationRate),
            sub: `${resolveXMetrics.trueNegatives} TN clear pass`,
          },
          {
            label: "Clarify Efficiency",
            val: formatPct(resolveXMetrics.clarificationEfficiency),
            sub: `≤ 2 turns resolved`,
          },
        ].map((kpi) => (
          <Card key={kpi.label} padding="sm" className="space-y-1">
            <span className="text-[11px] text-slate-400">{kpi.label}</span>
            <p className="font-mono text-2xl font-bold text-white">{kpi.val}</p>
            <p className="text-[10px] text-slate-400 truncate">{kpi.sub}</p>
          </Card>
        ))}
      </div>

      {/* Judge Custom Test Runner + Baseline Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4 text-violet-400" />
              <h3 className="text-base font-semibold text-white">Submit Custom Judge Test</h3>
            </div>
            <Badge tone={settings.integrationMode === "live" ? "emerald" : "amber"}>
              {settings.integrationMode === "live" ? "Live API" : "Local Simulator"}
            </Badge>
          </div>

          <form onSubmit={(e) => void handleAddAndRunCustom(e)} className="space-y-3">
            <div>
              <label
                htmlFor="judge-custom-prompt"
                className="mb-1 block text-xs font-medium text-slate-300"
              >
                Adversarial Prompt / Edge Sentence
              </label>
              <textarea
                id="judge-custom-prompt"
                rows={3}
                value={customPrompt}
                onChange={(e) => {
                  setCustomPrompt(e.target.value);
                  if (customError) setCustomError(null);
                }}
                placeholder="e.g. Deploy the backup script to prod or staging after Rahul approves it..."
                className="w-full rounded-xl border border-white/12 bg-[#050814]/85 px-3 py-2 text-xs sm:text-sm text-white focus:border-cyan-400/60 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor="judge-domain"
                  className="mb-1 block text-[11px] font-medium text-slate-400"
                >
                  Domain Context
                </label>
                <select
                  id="judge-domain"
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value as DomainContext)}
                  className="w-full rounded-xl border border-white/12 bg-[#050814]/85 px-2.5 py-2 text-xs text-slate-100 focus:border-cyan-400/60 focus:outline-none"
                >
                  {DOMAINS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="judge-truth"
                  className="mb-1 block text-[11px] font-medium text-slate-400"
                >
                  Expected Ground Truth
                </label>
                <select
                  id="judge-truth"
                  value={customGroundTruthMode}
                  onChange={(e) =>
                    setCustomGroundTruthMode(e.target.value as typeof customGroundTruthMode)
                  }
                  className="w-full rounded-xl border border-white/12 bg-[#050814]/85 px-2.5 py-2 text-xs text-slate-100 focus:border-cyan-400/60 focus:outline-none"
                >
                  <option value="exploratory">Exploratory (No Ground Truth)</option>
                  <option value="ambiguous">Ambiguous (Needs Clarification)</option>
                  <option value="incomplete">Incomplete (Needs Clarification)</option>
                  <option value="context_dependent">Context Dependent (Needs Clarification)</option>
                  <option value="clear">Clear (No Clarification Needed)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor="judge-expected-tags"
                  className="mb-1 block text-[11px] font-medium text-slate-400"
                >
                  Expected Ambiguity Categories (optional)
                </label>
                <input
                  id="judge-expected-tags"
                  type="text"
                  value={customExpectedAmbiguities}
                  onChange={(e) => setCustomExpectedAmbiguities(e.target.value)}
                  placeholder="lexical, referential, contextual"
                  className="w-full rounded-xl border border-white/12 bg-[#050814]/85 px-3 py-2 text-xs text-white focus:border-cyan-400/60 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="judge-followup"
                  className="mb-1 block text-[11px] font-medium text-slate-400"
                >
                  Turn-2 Clarification Answer (optional)
                </label>
                <input
                  id="judge-followup"
                  type="text"
                  value={customFollowUp}
                  onChange={(e) => setCustomFollowUp(e.target.value)}
                  placeholder="Optional answer for multi-turn test"
                  className="w-full rounded-xl border border-white/12 bg-[#050814]/85 px-3 py-2 text-xs text-white focus:border-cyan-400/60 focus:outline-none"
                />
              </div>
            </div>

            {customError && <p className="text-xs text-rose-300">{customError}</p>}

            <Button type="submit" size="sm" isLoading={isRunning} className="w-full">
              Add &amp; Execute Custom Test Case
            </Button>
          </form>
        </Card>

        {/* Same-Dataset Baseline vs. ResolveX Comparison */}
        <Card className="lg:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-white">
                Baseline vs. ResolveX (Same Executed Dataset)
              </h3>
              <p className="text-xs text-slate-400">
                Single-turn keyword/pronoun baseline vs. ResolveX measured across the exact{" "}
                {resolveXMetrics.groundedCount} grounded case(s) executed above
              </p>
            </div>
            <Badge tone={resolveXMetrics.groundedCount > 0 ? "cyan" : "slate"}>
              {resolveXMetrics.groundedCount > 0
                ? `${resolveXMetrics.groundedCount} Cases Compared`
                : "Awaiting Execution"}
            </Badge>
          </div>

          {resolveXMetrics.groundedCount === 0 ? (
            <div className="flex h-60 flex-col items-center justify-center rounded-xl border border-dashed border-white/12 p-6 text-center space-y-2">
              <Sparkles className="h-6 w-6 text-cyan-400" />
              <p className="text-sm font-medium text-white">No Executed Benchmark Results Yet</p>
              <p className="text-xs text-slate-400 max-w-md">
                Click &ldquo;Run Full Suite&rdquo; or run any labeled test case to measure true
                Precision, Recall, F1, False Clarification Rate, and Clarification Efficiency
                against the naive baseline.
              </p>
            </div>
          ) : (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={baselineChartData}
                  margin={{ top: 10, right: 12, left: -16, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                  <XAxis dataKey="metric" tick={{ fill: "#cbd5e1", fontSize: 11 }} />
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
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Bar
                    dataKey="ResolveX"
                    name="ResolveX (%)"
                    fill="#06b6d4"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="Baseline"
                    name="Naive Regex Baseline (%)"
                    fill="#64748b"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Suite Matrix + Failure Report Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <Card padding="none" className="lg:col-span-7 overflow-hidden">
          <div className="border-b border-white/10 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-white">
                Adversarial Suite Cases ({filteredCases.length})
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {(["all", "Pass", "Failed", "unexecuted"] as const).map((vf) => (
                  <button
                    key={vf}
                    type="button"
                    onClick={() => setVerdictFilter(vf)}
                    className={`cursor-pointer rounded-lg px-2 py-1 text-[11px] font-medium ${
                      verdictFilter === vf
                        ? "border border-cyan-400/50 bg-cyan-500/15 text-white"
                        : "text-slate-400 hover:bg-white/5"
                    }`}
                  >
                    {vf === "all" ? "All" : vf === "unexecuted" ? "Pending" : vf}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                aria-label="Filter by ambiguity category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as AdversarialCategory | "all")}
                className="rounded-xl border border-white/12 bg-[#050814]/85 px-3 py-1.5 text-xs text-slate-200 focus:border-cyan-400/60 focus:outline-none"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by stress challenge tag"
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value as AdversarialChallengeTag | "all")}
                className="rounded-xl border border-white/12 bg-[#050814]/85 px-3 py-1.5 text-xs text-slate-200 focus:border-cyan-400/60 focus:outline-none"
              >
                {TAG_OPTIONS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="divide-y divide-white/8 max-h-[540px] overflow-y-auto">
            {filteredCases.map((tc) => {
              const res = resultsMap.get(tc.id);
              const isSelected = tc.id === selectedCase?.id;
              return (
                <div
                  key={tc.id}
                  onClick={() => setSelectedCaseId(tc.id)}
                  className={`cursor-pointer p-4 space-y-2 transition-colors ${
                    isSelected ? "bg-cyan-500/8" : "hover:bg-white/3"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[11px] text-cyan-300">{tc.id}</span>
                      <Badge tone="violet">{tc.category}</Badge>
                      {tc.followUpClarification && <Badge tone="slate">Multi-Turn</Badge>}
                      {tc.isCustom && <Badge tone="cyan">Custom Judge</Badge>}
                    </div>

                    <div className="flex items-center gap-2">
                      {!res ? (
                        <Badge tone="slate">Not Executed</Badge>
                      ) : res.verdict === "Pass" ? (
                        <Badge tone="emerald">
                          <CheckCircle2 className="h-3 w-3" />
                          Pass
                        </Badge>
                      ) : res.verdict === "Failed" ? (
                        <Badge tone="rose">
                          <XCircle className="h-3 w-3" />
                          Failed
                        </Badge>
                      ) : res.verdict === "Execution Error" ? (
                        <Badge tone="rose">Error</Badge>
                      ) : (
                        <Badge tone="cyan">Exploratory</Badge>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        isLoading={runningCaseId === tc.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleRunCase(tc);
                        }}
                      >
                        Run
                      </Button>
                    </div>
                  </div>

                  <p className="text-xs font-medium text-white">{tc.title}</p>
                  <p className="text-xs text-slate-300 line-clamp-2">“{tc.instruction}”</p>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Explainable Test Detail & Failure Inspector */}
        <Card className="lg:col-span-5 space-y-4">
          {selectedCase ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <span className="font-mono text-[11px] text-cyan-300">{selectedCase.id}</span>
                  <h3 className="text-base font-semibold text-white">{selectedCase.title}</h3>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void handleInspectInPipeline(selectedCase.instruction, selectedCase.domain)
                  }
                  iconRight={<ArrowRight className="h-3.5 w-3.5" />}
                >
                  Inspect Live
                </Button>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#050814]/85 p-3 space-y-1.5 text-xs">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Test Prompt ({selectedCase.domain})
                </p>
                <p className="text-slate-100 leading-relaxed">“{selectedCase.instruction}”</p>
                {selectedCase.followUpClarification && (
                  <p className="text-[11px] text-cyan-300 pt-1 border-t border-white/10">
                    Turn-2 Follow-up: “{selectedCase.followUpClarification}”
                  </p>
                )}
              </div>

              <div className="space-y-1.5 text-xs">
                <p className="font-semibold text-slate-300">Expected Ground Truth</p>
                {selectedCase.hasValidGroundTruth ? (
                  <div className="rounded-xl border border-white/10 bg-white/3 p-3 space-y-1">
                    <p className="text-slate-200">
                      Classification:{" "}
                      <span className="font-mono text-cyan-300">
                        {selectedCase.expectedClassification}
                      </span>{" "}
                      • Needs Clarification:{" "}
                      <span className="font-mono text-white">
                        {String(selectedCase.expectedNeedsClarification)}
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Expected Ambiguities:{" "}
                      {selectedCase.expectedAmbiguities.length > 0
                        ? selectedCase.expectedAmbiguities.join(", ")
                        : "None (clear control)"}
                    </p>
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-white/12 p-3 text-[11px] text-slate-400">
                    No labeled ground truth supplied (Exploratory mode — excluded from
                    Precision/F1).
                  </p>
                )}
              </div>

              {selectedResult ? (
                <div className="space-y-3 pt-2 border-t border-white/10 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge tone={PROVENANCE_BADGE[selectedResult.provenance].tone}>
                      {PROVENANCE_BADGE[selectedResult.provenance].label}
                    </Badge>
                    <span className="font-mono text-[11px] text-slate-400">
                      {selectedResult.durationMs} ms • {selectedResult.turnsTaken} turn(s)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-white/8 bg-[#050814]/75 p-2.5">
                      <span className="text-[10px] text-slate-400">Detected Needs Clarify</span>
                      <p className="font-mono font-semibold text-white">
                        {String(selectedResult.predictedNeedsClarification)} (
                        {selectedResult.predictedClassification})
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/8 bg-[#050814]/75 p-2.5">
                      <span className="text-[10px] text-slate-400">Baseline Needs Clarify</span>
                      <p className="font-mono font-semibold text-slate-200">
                        {String(selectedResult.baselinePredictedNeeds)} (
                        {selectedResult.baselineMatch === null
                          ? "N/A"
                          : selectedResult.baselineMatch
                            ? "Match"
                            : "Miss"}
                        )
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {selectedResult.correctDetections.length > 0 && (
                      <p className="text-emerald-300">
                        <CheckCircle2 className="inline h-3.5 w-3.5 mr-1" />
                        Correct Detections: {selectedResult.correctDetections.join(", ")}
                      </p>
                    )}
                    {selectedResult.missedAmbiguities.length > 0 && (
                      <p className="text-amber-300">
                        <AlertTriangle className="inline h-3.5 w-3.5 mr-1" />
                        Missed Ambiguities: {selectedResult.missedAmbiguities.join(", ")}
                      </p>
                    )}
                    {selectedResult.falsePositives.length > 0 && (
                      <p className="text-rose-300">
                        <ShieldAlert className="inline h-3.5 w-3.5 mr-1" />
                        False Positives: {selectedResult.falsePositives.join(", ")}
                      </p>
                    )}
                    {selectedResult.abstained && (
                      <p className="text-rose-200">
                        <Ban className="inline h-3.5 w-3.5 mr-1" />
                        Engine Abstained ({selectedResult.verifiedCorrectness})
                      </p>
                    )}
                  </div>

                  {selectedResult.failureExplanation && (
                    <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-3 space-y-1">
                      <p className="font-semibold text-rose-200">Explainable Failure Report</p>
                      <p className="text-[11px] text-rose-100/90 leading-relaxed">
                        {selectedResult.failureExplanation}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-white/12 p-4 text-xs text-slate-400">
                  Click &ldquo;Run&rdquo; on this case to inspect detected ambiguities, baseline
                  comparison, and explainable diagnostics.
                </p>
              )}
            </>
          ) : null}
        </Card>
      </div>

      {/* Execution History */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-violet-400" />
            <h3 className="text-base font-semibold text-white">Suite Execution History</h3>
          </div>
          <Badge tone="slate">{executionHistory.length} Run(s)</Badge>
        </div>

        {executionHistory.length === 0 ? (
          <p className="text-xs text-slate-400">
            No suite runs recorded in this session yet. Execute the full suite, filtered subset, or
            backend evaluator to log reproducible benchmark runs.
          </p>
        ) : (
          <div className="space-y-2">
            {executionHistory.map((entry) => (
              <div
                key={entry.runId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#050814]/80 p-3 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-white">{entry.scopeLabel}</span>
                    <Badge tone={PROVENANCE_BADGE[entry.provenance].tone}>
                      {PROVENANCE_BADGE[entry.provenance].label}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    F1 {formatPct(entry.resolveXMetrics.f1Score)} • Precision{" "}
                    {formatPct(entry.resolveXMetrics.precision)} • Recall{" "}
                    {formatPct(entry.resolveXMetrics.recall)} • Baseline F1{" "}
                    {formatPct(entry.baselineMetrics.f1Score)}
                  </p>
                </div>

                <Button size="sm" variant="secondary" onClick={() => handleLoadHistoryRun(entry)}>
                  Load Run
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
