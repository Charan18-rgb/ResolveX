import { CheckCircle2, Loader2 } from "lucide-react";
import { Card } from "./Card";

const STAGES = [
  { id: 1, label: "Understanding input & script" },
  { id: 2, label: "Analyzing context & entities" },
  { id: 3, label: "Detecting ambiguity spans" },
  { id: 4, label: "Generating What-If interpretations" },
];

interface AnalysisProgressBannerProps {
  isAnalyzing: boolean;
  activeStage: number;
  stageLabel: string;
}

export function AnalysisProgressBanner({
  isAnalyzing,
  activeStage,
  stageLabel,
}: AnalysisProgressBannerProps) {
  if (!isAnalyzing) return null;

  return (
    <Card className="border-cyan-500/35 bg-cyan-500/8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
          <span className="text-sm font-semibold text-white">
            {stageLabel || "Running ResolveX pipeline..."}
          </span>
        </div>
        <span className="font-mono text-xs text-cyan-300">
          Stage {Math.max(1, activeStage)} / 4
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {STAGES.map((stage) => {
          const done = activeStage > stage.id;
          const current = activeStage === stage.id;
          return (
            <div
              key={stage.id}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition-all ${
                done
                  ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
                  : current
                    ? "border-cyan-400/60 bg-cyan-500/15 text-white"
                    : "border-white/10 bg-[#050814]/60 text-slate-400"
              }`}
            >
              {done ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              ) : current ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-cyan-300" />
              ) : (
                <span className="h-2 w-2 shrink-0 rounded-full bg-slate-600" />
              )}
              <span className="truncate">{stage.label}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
