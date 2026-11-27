import { Link, useLocation } from "@tanstack/react-router";
import {
  CheckCircle2,
  Eye,
  GitBranch,
  Languages,
  MessageSquareMore,
  SearchCheck,
} from "lucide-react";
import { useResolveX } from "@/context/useResolveX";
import { LANGUAGE_OPTIONS } from "@/data/multilingualEngine";
import type { LanguageOption } from "@/types/resolvex";

const STEPS = [
  { to: "/analysis", label: "1. Analysis", icon: SearchCheck },
  { to: "/visualization", label: "2. Visualization & Graph", icon: Eye },
  { to: "/interpretations", label: "3. What-If Simulator", icon: GitBranch },
  { to: "/clarification", label: "4. Clarification & Verify", icon: MessageSquareMore },
  { to: "/resolution", label: "5. Final Resolution", icon: CheckCircle2 },
] as const;

export function PipelineStepper() {
  const { pathname } = useLocation();
  const { language, setLanguage, uiLanguage } = useResolveX();

  return (
    <div className="border-b border-white/10 bg-[#080d1e]/75 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-2 overflow-x-auto">
          {STEPS.map((step) => {
            const Icon = step.icon;
            const isActive = pathname === step.to;
            return (
              <Link
                key={step.to}
                to={step.to}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                  isActive
                    ? "border-cyan-400/50 bg-gradient-to-r from-violet-600/30 to-cyan-500/25 text-white shadow-sm"
                    : "border-white/8 bg-white/3 text-slate-400 hover:border-white/20 hover:text-slate-200"
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{step.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <Languages className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
          <label htmlFor="pipeline-language-select" className="sr-only">
            Switch interface language without losing progress
          </label>
          <select
            id="pipeline-language-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value as LanguageOption)}
            title="Switch language without losing clarification progress"
            className="rounded-lg border border-white/12 bg-[#050814]/90 px-2.5 py-1 text-xs font-medium text-slate-200 focus:border-cyan-400/60 focus:outline-none"
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt === "Auto Detect" ? `Auto Detect (${uiLanguage})` : opt}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
