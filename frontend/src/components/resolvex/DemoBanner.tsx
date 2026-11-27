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
      ? "MOCK MODE"
      : isChecking
        ? "CONNECTING TO BACKEND..."
        : isReachable
          ? `LIVE BACKEND • ${backendHealth?.aiConfigured ? "GEMINI AI ACTIVE" : "FALLBACK MODE"}`
          : "BACKEND UNREACHABLE");

  const effectiveDescription =
    description ??
    (!isLive
      ? "Running in client-side mock mode. Switch to Live Backend in Settings for FastAPI + Gemini + SQLite."
      : isChecking
        ? `Checking FastAPI backend health at ${settings.apiBaseUrl}...`
        : isReachable
          ? `Connected to ${backendHealth?.baseUrl ?? settings.apiBaseUrl} (SQLite DB: ${backendHealth?.database ?? "connected"}).`
          : (backendHealth?.message ??
            `Cannot reach FastAPI backend at ${settings.apiBaseUrl}. Start uvicorn on port 8000.`));

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
