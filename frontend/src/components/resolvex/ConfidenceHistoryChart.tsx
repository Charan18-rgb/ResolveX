import { ArrowDownRight, ArrowUpRight, Ban, History, ShieldCheck } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  ConfidenceBand,
  ConfidenceHistoryPoint,
  VerifiedCorrectnessState,
} from "@/types/resolvex";
import { Badge, type BadgeTone } from "./Badge";
import { Card } from "./Card";

const BAND_TONE: Record<ConfidenceBand, BadgeTone> = {
  high: "emerald",
  moderate: "cyan",
  low: "amber",
  abstained: "rose",
};

const VERIFIED_TONE: Record<VerifiedCorrectnessState, BadgeTone> = {
  verified: "emerald",
  partially_verified: "cyan",
  unverified: "amber",
  contradictory: "rose",
};

interface ConfidenceHistoryChartProps {
  history: ConfidenceHistoryPoint[];
  compact?: boolean | undefined;
  title?: string | undefined;
}

export function ConfidenceHistoryChart({
  history,
  compact = false,
  title = "Confidence & Uncertainty Progression Across Turns",
}: ConfidenceHistoryChartProps) {
  const chartData = history.map((point) => ({
    turnLabel: `Turn ${point.turnNumber}`,
    confidencePct:
      point.confidenceScore !== null && !point.abstained
        ? Math.round(point.confidenceScore * 100)
        : 0,
    abstained: point.abstained,
    eventLabel: point.eventLabel,
    statusLabel: point.abstained
      ? "ABSTAINED"
      : `${Math.round((point.confidenceScore ?? 0) * 100)}%`,
  }));

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm sm:text-base font-semibold text-white">{title}</h3>
        </div>
        <Badge tone="cyan">
          {history.length} Snapshot{history.length === 1 ? "" : "s"}
        </Badge>
      </div>

      {history.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/12 p-4 text-xs text-slate-400">
          No confidence history snapshots recorded yet.
        </p>
      ) : (
        <>
          <div className={compact ? "h-48 w-full" : "h-60 w-full"}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 16, left: -16, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="turnLabel" tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <ReferenceLine
                  y={78}
                  stroke="#10b981"
                  strokeDasharray="4 4"
                  label={{
                    value: "High Confidence",
                    position: "insideTopRight",
                    fill: "#6ee7b7",
                    fontSize: 10,
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0a0f1f",
                    borderColor: "rgba(255,255,255,0.14)",
                    borderRadius: "12px",
                    color: "#f8fafc",
                    fontSize: "12px",
                  }}
                  formatter={(
                    value: unknown,
                    _name: unknown,
                    item: { payload?: { abstained?: boolean } },
                  ) => {
                    if (item?.payload?.abstained) {
                      return ["Abstained (0 — refused to guess)", "Confidence"];
                    }
                    return [`${String(value)}%`, "Calibrated Confidence"];
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="confidencePct"
                  name="Confidence %"
                  stroke="#06b6d4"
                  strokeWidth={3}
                  dot={{ r: 4.5, fill: "#22d3ee", strokeWidth: 2, stroke: "#050814" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-2.5">
            {history.map((point) => {
              const deltaPts =
                point.deltaFromPrevious !== null ? Math.round(point.deltaFromPrevious * 100) : null;
              return (
                <div
                  key={`${point.turnNumber}-${point.timestamp}`}
                  className="rounded-xl border border-white/10 bg-[#050814]/80 p-3 space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-cyan-300">
                        Turn {point.turnNumber}
                      </span>
                      <span className="text-xs font-medium text-white">{point.eventLabel}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={BAND_TONE[point.confidenceBand]}>
                        {point.abstained ? (
                          <>
                            <Ban className="h-3 w-3" />
                            Abstained
                          </>
                        ) : (
                          `${Math.round((point.confidenceScore ?? 0) * 100)}% (${point.confidenceBand})`
                        )}
                      </Badge>
                      <Badge tone={VERIFIED_TONE[point.verifiedCorrectness]}>
                        <ShieldCheck className="h-3 w-3" />
                        {point.verifiedCorrectness.replace("_", " ")}
                      </Badge>
                      {deltaPts !== null && deltaPts !== 0 && (
                        <span
                          className={`inline-flex items-center gap-0.5 font-mono text-[11px] font-semibold ${
                            deltaPts > 0 ? "text-emerald-300" : "text-rose-300"
                          }`}
                        >
                          {deltaPts > 0 ? (
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowDownRight className="h-3.5 w-3.5" />
                          )}
                          {deltaPts > 0 ? `+${deltaPts}` : deltaPts} pts
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">{point.changeSummary}</p>
                  <p className="text-[11px] text-slate-500">
                    Input: <span className="text-slate-400">“{point.triggerInput}”</span> •{" "}
                    {point.evidenceCountSupporting} supporting / {point.evidenceCountContradicting}{" "}
                    contradicting
                  </p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
