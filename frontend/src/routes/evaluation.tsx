import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  Boxes,
  CheckCircle2,
  Languages,
  Play,
  RefreshCw,
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
import { Badge } from "@/components/resolvex/Badge";
import { Button } from "@/components/resolvex/Button";
import { Card } from "@/components/resolvex/Card";
import { DemoBanner } from "@/components/resolvex/DemoBanner";
import { SectionHeader } from "@/components/resolvex/SectionHeader";
import { useResolveX } from "@/context/useResolveX";
import { resolveXService } from "@/services/api";
import type { BackendPs2Evaluation, BackendPs6Evaluation } from "@/types/resolvex";

export const Route = createFileRoute("/evaluation")({
  component: EvaluationPage,
});

type EvalDomainTab = "ps2" | "ps6";

function EvaluationPage() {
  const { settings } = useResolveX();
  const [activeTab, setActiveTab] = useState<EvalDomainTab>("ps2");
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
        resolveXService.getPs2Evaluation(true, settings.apiBaseUrl),
        resolveXService.getPs6Evaluation(false, settings.apiBaseUrl),
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
  }, [settings.apiBaseUrl]);

  useEffect(() => {
    void loadEvaluations();
  }, [loadEvaluations]);

  const handleRunLivePs6 = async () => {
    if (isRunningPs6) return;
    setIsRunningPs6(true);
    setErrorMsg(null);
    try {
      const res = await resolveXService.getPs6Evaluation(true, settings.apiBaseUrl);
      setPs6Eval(res.evaluation);
      setPs6Source(res.source);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Language evaluation run failed.",
      );
    } finally {
      setIsRunningPs6(false);
    }
  };

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

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-8">
      <SectionHeader
        eyebrow="Live Backend Evaluation"
        title="Unified Benchmark Telemetry"
        description="Real measured results executed by backend evaluators against the SQLite inventory database and 48-case ambiguity dataset."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              isLoading={isLoadingPs2}
              iconLeft={<RefreshCw className="h-4 w-4 text-cyan-400" />}
              onClick={() => void loadEvaluations()}
            >
              Refresh Metrics
            </Button>
            <Button
              isLoading={isRunningPs6}
              iconLeft={<Play className="h-4 w-4" />}
              onClick={() => void handleRunLivePs6()}
            >
              Run 48-Case Language Benchmark
            </Button>
          </div>
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

      {/* Domain Switcher */}
      <div className="inline-flex rounded-xl border border-white/10 bg-slate-900/75 p-1">
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
          Inventory Intelligence Evaluation
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
          Language Understanding Benchmark
        </button>
      </div>

      {activeTab === "ps2" ? (
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

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <Card className="lg:col-span-5 space-y-4">
              <h3 className="text-base font-semibold text-white">
                ResolveX vs. Reactive FIFO Baseline (%)
              </h3>
              <div className="h-64 w-full">
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
              {ps2Eval && <p className="text-xs text-slate-400">{ps2Eval.note}</p>}
            </Card>

            <Card padding="none" className="lg:col-span-7 overflow-hidden">
              <div className="border-b border-white/10 p-5">
                <h3 className="text-base font-semibold text-white">
                  Scenario Verification Breakdown
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-400">
                      <th className="px-4 py-3">Scenario</th>
                      <th className="px-4 py-3">Details</th>
                      <th className="px-4 py-3">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/8">
                    {(ps2Eval?.results_detail ?? []).map((row, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-3 font-mono text-cyan-300">
                          {String(row["scenario"] ?? "")}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-300">
                          {JSON.stringify(
                            Object.fromEntries(
                              Object.entries(row).filter(([k]) => k !== "scenario" && k !== "pass"),
                            ),
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={row["pass"] ? "emerald" : "rose"}>
                            {row["pass"] ? "PASS" : "FAIL"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {!ps6Eval ? (
            <Card className="space-y-4 py-8 text-center">
              <p className="text-sm text-slate-300">
                No language evaluation record persisted yet in SQLite ({ps6Source}).
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
                    Source: {ps6Source}
                  </Badge>
                </div>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ps6ChartData} margin={{ top: 10, right: 16, left: -16, bottom: 5 }}>
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
