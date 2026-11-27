import { FlaskConical } from "lucide-react";
import { Badge } from "./Badge";

interface DemoBannerProps {
  label?: string | undefined;
  description?: string | undefined;
  compact?: boolean | undefined;
}

export function DemoBanner({
  label = "DEMO DATA",
  description = "Simulated client-side analysis and synthetic benchmarks. Connect a FastAPI backend in Settings when ready.",
  compact = false,
}: DemoBannerProps) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-500/25 bg-cyan-500/8 ${
        compact ? "px-3.5 py-2" : "px-4 py-3"
      }`}
    >
      <div className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-200">
        <FlaskConical className="h-4 w-4 shrink-0 text-cyan-400" aria-hidden="true" />
        <Badge tone="cyan">{label}</Badge>
        <span className="text-slate-300">{description}</span>
      </div>
    </div>
  );
}
