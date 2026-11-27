import { AlertTriangle, CheckCircle2, FlaskConical } from "lucide-react";
import { useResolveX } from "@/context/useResolveX";
import { Badge } from "./Badge";

interface DemoBannerProps {
  label?: string | undefined;
  description?: string | undefined;
  compact?: boolean | undefined;
}

export function DemoBanner({ label, description, compact = false }: DemoBannerProps) {
  const { settings, backendHealth } = useResolveX();

  const isLive = settings.integrationMode === "live";
  const isChecking = isLive && backendHealth === null;
  const isReachable = Boolean(backendHealth?.reachable);

  const badgeTone = !isLive ? "amber" : isChecking ? "cyan" : isReachable ? "emerald" : "rose";
  const effectiveLabel =
    label ??
    (!isLive
      ? "DEMO MODE (OFFLINE)"
      : isChecking
        ? "CONNECTING..."
        : isReachable
          ? `LIVE • ${backendHealth?.aiConfigured ? "AI ENGINE ACTIVE" : "DETERMINISTIC MODE"}`
          : "SERVICE UNAVAILABLE");

  const effectiveDescription =
    description ??
    (!isLive
      ? "Running with sample data only. Switch to Live mode in Settings for real inventory and AI answers."
      : isChecking
        ? "Checking connection to the ResolveX service..."
        : isReachable
          ? `Connected to the ResolveX service (data: ${backendHealth?.database ?? "connected"}, AI: ${backendHealth?.aiConfigured ? "configured" : "fallback"}).`
          : (backendHealth?.message ??
            "Cannot reach the ResolveX service. Make sure the backend server is running."));

  const borderClass = !isLive
    ? "border-amber-500/30 bg-amber-500/8"
    : isChecking
      ? "border-cyan-500/25 bg-cyan-500/8"
      : isReachable
        ? "border-emerald-500/25 bg-emerald-500/8"
        : "border-rose-500/35 bg-rose-500/10";

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border ${borderClass} ${
        compact ? "px-3.5 py-2" : "px-4 py-3"
      }`}
    >
      <div className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-200">
        {!isLive ? (
          <FlaskConical className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
        ) : isReachable ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
        )}
        <Badge tone={badgeTone}>{effectiveLabel}</Badge>
        <span className="text-slate-300">{effectiveDescription}</span>
      </div>
    </div>
  );
}
