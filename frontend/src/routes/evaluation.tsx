import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  Boxes,
  CheckCircle2,
  FlaskConical,
  Languages,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
import { AdversarialTestingLab } from "@/components/evaluation/AdversarialTestingLab";
import { Badge } from "@/components/resolvex/Badge";
import { Button } from "@/components/resolvex/Button";
import { Card } from "@/components/resolvex/Card";
import { DemoBanner } from "@/components/resolvex/DemoBanner";
import { SectionHeader } from "@/components/resolvex/SectionHeader";
import { useResolveX } from "@/context/useResolveX";
import { mapDemoRoleToBackendHeader, resolveXService } from "@/services/api";
import type { BackendPs2Evaluation, BackendPs6Evaluation } from "@/types/resolvex";

export const Route = createFileRoute("/evaluation")({
  component: EvaluationPage,
});

type EvalDomainTab = "adversarial" | "ps6" | "ps2";

function EvaluationPage() {
  const { settings, activeRole } = useResolveX();
  const roleHeader = mapDemoRoleToBackendHeader(activeRole);
  const isOperator = roleHeader === "ADMIN";
  const [activeTab, setActiveTab] = useState<EvalDomainTab>("adversarial");
  const [ps2Eval, setPs2Eval] = useState<BackendPs2Evaluation | null>(null);
  const [ps6Eval, setPs6Eval] = useState<BackendPs6Evaluation | null>(null);
  const [ps6Source, setPs6Source] = useState<string>("loading");
  const [isLoadingPs2, setIsLoadingPs2] = useState(false);
  const [isRunningPs6, setIsRunningPs6] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadEvaluations = useCallback(async () => {
    setErrorMsg(null);
    setIsLoadingPs2(true);
    try {
      const [r2, r6] = await Promise.all([
        resolveXService.getPs2Evaluation(true, settings.apiBaseUrl, roleHeader),
        resolveXService.getPs6Evaluation(false, settings.apiBaseUrl, roleHeader),
      ]);
      setPs2Eval(r2.evaluation);
      setPs6Eval(r6.evaluation);
      setPs6Source(r6.source);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to load evaluation metrics from backend.",
      );
    } finally {
      setIsLoadingPs2(false);
    }
  }, [settings.apiBaseUrl, roleHeader]);

  useEffect(() => {
    void loadEvaluations();
  }, [loadEvaluations]);

  const handleRunLivePs6 = async () => {
    if (isRunningPs6) return;
    setIsRunningPs6(true);
    setErrorMsg(null);
    try {
      const res = await resolveXService.getPs6Evaluation(true, settings.apiBaseUrl, roleHeader);
      setPs6Eval(res.evaluation);
      setPs6Source(res.source);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Language evaluation run failed.");
    } finally {
      setIsRunningPs6(false);
    }
  };

  const SOURCE_LABELS: Record<string, string> = {
    loading: "Loading…",
    fresh_run: "Fresh evaluation run",
    latest_record: "Latest stored record",
    no_record: "No record yet",
    computed: "Computed on demand",
  };
  const ps6SourceLabel = SOURCE_LABELS[ps6Source] ?? ps6Source;

  const ps2ChartData = [
    {
      name: "ResolveX Earliest-CRD",
      accuracy: Math.round((ps2Eval?.accuracy ?? 0) * 100),
    },
    {
      name: "Reactive FIFO Baseline",
      accuracy: Math.round((ps2Eval?.baseline_accuracy ?? 0.5) * 100),
    },
  ];

  const ps6ChartData = ps6Eval
    ? [
        { metric: "Precision", value: Math.round(ps6Eval.precision * 100) },
        { metric: "Recall", value: Math.round(ps6Eval.recall * 100) },
        { metric: "F1 Score", value: Math.round(ps6Eval.f1_score * 100) },
        { metric: "Resolution Acc.", value: Math.round(ps6Eval.resolution_accuracy * 100) },
      ]
    : [];

  if (!isOperator) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
          <ShieldAlert className="h-7 w-7 text-slate-400" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900">Operator area</h1>
        <p className="mt-2 text-sm text-slate-500">
          Evaluation metrics and diagnostics are restricted to authorized operators.
          Your current role is <span className="font-medium">{activeRole}</span>. Switch to the
          System Operator role to access this area.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-8">
      <SectionHeader
        eyebrow="Benchmarking & Adversarial Testing"
        title={
          activeTab === "adversarial"
            ? "Adversarial Ambiguity Testing Lab"
            : activeTab === "ps6"
              ? "Live Language Benchmark Telemetry"
              : "Inventory Allocation Evaluation"
        }
        description={
          activeTab === "adversarial"
            ? "Stress-test ResolveX on challenging multi-ambiguity, contradictory, missing-context, and custom judge sentences."
            : "Real measured results executed by backend evaluators against the inventory database and labeled evaluation dataset."
        }
        actions={
          activeTab === "adversarial" ? (
            <Badge tone="cyan">MEASURED OVER EXECUTED CASES</Badge>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                isLoading={isLoadingPs2}
                iconLeft={<RefreshCw className="h-4 w-4 text-cyan-400" />}
                onClick={() => void loadEvaluations()}
              >
                Refresh Metrics
              </Button>
              {activeTab === "ps6" && (
                <Button
                  isLoading={isRunningPs6}
                  iconLeft={<Play className="h-4 w-4" />}
                  onClick={() => void handleRunLivePs6()}
                >
                  Run Language Benchmark
                </Button>
              )}
            </div>
          )
        }
      />

      <DemoBanner compact />

      {errorMsg && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/12 px-4 py-3 text-xs sm:text-sm text-rose-100"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Domain switcher: Adversarial Lab, Language Benchmark, Inventory Evaluation */}
      <div className="inline-flex flex-wrap rounded-xl border border-white/10 bg-slate-900/75 p-1 gap-1">
        <button
          type="button"
          onClick={() => setActiveTab("adversarial")}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-xs sm:text-sm font-medium transition-all ${
            activeTab === "adversarial"
              ? "bg-gradient-to-r from-cyan-600/85 to-violet-600/85 text-white shadow"
              : "text-slate-300 hover:text-white"
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          Adversarial Testing Lab
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("ps6")}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-xs sm:text-sm font-medium transition-all ${
            activeTab === "ps6"
              ? "bg-gradient-to-r from-violet-600/80 to-cyan-600/80 text-white shadow"
              : "text-slate-300 hover:text-white"
          }`}
        >
          <Languages className="h-4 w-4" />
          Language Benchmark
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("ps2")}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-xs sm:text-sm font-medium transition-all ${
            activeTab === "ps2"
              ? "bg-gradient-to-r from-cyan-600/80 to-violet-600/80 text-white shadow"
              : "text-slate-300 hover:text-white"
          }`}
        >
          <Boxes className="h-4 w-4" />
          Inventory Allocation Evaluation
        </button>
      </div>

      {activeTab === "adversarial" ? (
        <AdversarialTestingLab />
      ) : activeTab === "ps2" ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="space-y-1.5">
              <span className="text-xs text-slate-400">Scenario Accuracy</span>
              <p className="font-mono text-3xl font-bold text-emerald-300">
                {ps2Eval ? `${Math.round(ps2Eval.accuracy * 100)}%` : "—"}
              </p>
              <p className="inline-flex items-center gap-1 text-xs text-cyan-300">
                <TrendingUp className="h-3.5 w-3.5" />
                {ps2Eval
                  ? `+${Math.round(ps2Eval.improvement_over_baseline * 100)}% vs FIFO baseline`
                  : "Waiting for backend"}
              </p>
            </Card>
            <Card className="space-y-1.5">
              <span className="text-xs text-slate-400">Scenarios Passed</span>
              <p className="font-mono text-3xl font-bold text-white">
                {ps2Eval ? `${ps2Eval.passed} / ${ps2Eval.total_scenarios}` : "—"}
              </p>
              <p className="text-xs text-slate-400">Net avail, CRD risk, shortage, alloc</p>
            </Card>
            <Card className="space-y-1.5">
              <span className="text-xs text-slate-400">Shortages Detected</span>
              <p className="font-mono text-3xl font-bold text-rose-300">
                {ps2Eval?.shortages_detected ?? "—"}
              </p>
              <p className="text-xs text-slate-400">Active material shortages</p>
            </Card>
            <Card className="space-y-1.5">
              <span className="text-xs text-slate-400">Orders Evaluated</span>
              <p className="font-mono text-3xl font-bold text-cyan-300">
                {ps2Eval?.crd_risk_orders_evaluated ?? "—"}
              </p>
              <p className="text-xs text-slate-400">Open customer orders</p>
            </Card>
          </div>

          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">
                  ResolveX Earliest-CRD vs. Reactive FIFO Baseline
                </h3>
                <p className="text-xs text-slate-400">
                  CRD lookahead allocation reduces delivery risk over standard FIFO
                </p>
              </div>
              <Badge tone="emerald">
                <CheckCircle2 className="h-3 w-3" />
                Deterministic Verification
              </Badge>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ps2ChartData} margin={{ top: 10, right: 16, left: -16, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                  <XAxis dataKey="name" tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0a0f1f",
                      borderColor: "rgba(255,255,255,0.14)",
                      borderRadius: "12px",
                      color: "#f8fafc",
                    }}
                  />
                  <Bar dataKey="accuracy" name="Accuracy %" fill="#06b6d4" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          {!ps6Eval ? (
            <Card className="space-y-4 py-8 text-center">
              <p className="text-sm text-slate-300">
                No language evaluation has been run yet ({ps6SourceLabel}).
              </p>
              <div className="flex justify-center">
                <Button isLoading={isRunningPs6} onClick={() => void handleRunLivePs6()}>
                  Run 48-Case Language Evaluation Now
                </Button>
              </div>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="space-y-1.5">
                  <span className="text-xs text-slate-400">Precision / Recall</span>
                  <p className="font-mono text-2xl font-bold text-white">
                    {Math.round(ps6Eval.precision * 100)}% / {Math.round(ps6Eval.recall * 100)}%
                  </p>
                  <p className="text-xs text-slate-400">Dataset size: {ps6Eval.dataset_size}</p>
                </Card>
                <Card className="space-y-1.5">
                  <span className="text-xs text-slate-400">F1 Score</span>
                  <p className="font-mono text-3xl font-bold text-cyan-300">
                    {(ps6Eval.f1_score * 100).toFixed(1)}%
                  </p>
                  <p className="text-xs text-slate-400">Model: {ps6Eval.model}</p>
                </Card>
                <Card className="space-y-1.5">
                  <span className="text-xs text-slate-400">Classification Accuracy</span>
                  <p className="font-mono text-3xl font-bold text-emerald-300">
                    {(ps6Eval.resolution_accuracy * 100).toFixed(1)}%
                  </p>
                  <p className="text-xs text-slate-400">Exact category match</p>
                </Card>
                <Card className="space-y-1.5">
                  <span className="text-xs text-slate-400">False Clarification Rate</span>
                  <p className="font-mono text-3xl font-bold text-amber-300">
                    {(ps6Eval.false_clarification_rate * 100).toFixed(1)}%
                  </p>
                  <p className="text-xs text-slate-400">Clear prompts flagged unnecessarily</p>
                </Card>
              </div>

              <Card className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-white">
                    Language Benchmark Metrics (%)
                  </h3>
                  <Badge tone="emerald">
                    <CheckCircle2 className="h-3 w-3" />
                    Source: {ps6SourceLabel}
                  </Badge>
                </div>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={ps6ChartData}
                      margin={{ top: 10, right: 16, left: -16, bottom: 5 }}
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
                        }}
                      />
                      <Legend />
                      <Bar dataKey="value" name="Score %" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}
