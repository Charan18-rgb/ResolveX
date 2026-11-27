import { Languages } from "lucide-react";
import type {
  LanguageOption,
  MultilingualAnalysisMetadata,
  ResolvedLanguage,
} from "@/types/resolvex";
import { Badge } from "./Badge";
import { Card } from "./Card";

interface MultilingualContextBannerProps {
  multilingual: MultilingualAnalysisMetadata;
  selectedLanguage: LanguageOption;
  uiLanguage: ResolvedLanguage;
  compact?: boolean | undefined;
}

export function MultilingualContextBanner({
  multilingual,
  selectedLanguage,
  uiLanguage,
  compact = false,
}: MultilingualContextBannerProps) {
  return (
    <Card
      padding={compact ? "sm" : "md"}
      className="border-indigo-500/25 bg-indigo-500/5 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Languages className="h-4 w-4 text-cyan-400" aria-hidden="true" />
          <span className="text-xs sm:text-sm font-semibold text-white">
            Multilingual Intelligence Layer
          </span>
          <Badge tone="cyan">Detected: {multilingual.detectedLanguage}</Badge>
          {multilingual.isCodeMixed && <Badge tone="violet">Code-Mixed</Badge>}
          <Badge tone="slate">
            UI Mode: {selectedLanguage === "Auto Detect" ? `Auto (${uiLanguage})` : uiLanguage}
          </Badge>
        </div>

        <span className="font-mono text-[11px] text-slate-400">
          Scripts: {multilingual.scriptsDetected.join(" + ")} •{" "}
          {Math.round(multilingual.detectionConfidence * 100)}%
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/10 bg-[#050814]/80 p-3 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Original Sentence (Preserved Script)
          </p>
          <p className="text-xs sm:text-sm text-white leading-relaxed">
            “{multilingual.originalPrompt}”
          </p>
        </div>

        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/8 p-3 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
            Normalized Semantic Interpretation (Separate Preview)
          </p>
          <p className="text-xs sm:text-sm text-slate-100 leading-relaxed">
            {multilingual.normalizedEnglishMeaning}
          </p>
        </div>
      </div>

      {!compact && multilingual.codeMixedTokens.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[11px] font-medium text-slate-400">
            Detected Non-English / Code-Mixed Tokens:
          </span>
          {multilingual.codeMixedTokens.map((item) => (
            <span
              key={`${item.languageTag}-${item.token}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-200"
            >
              <span className="font-mono font-semibold text-amber-200">{item.token}</span>
              <span className="text-slate-400">→ {item.normalizedMeaning}</span>
            </span>
          ))}
        </div>
      )}

      <p className="text-[11px] text-slate-400">{multilingual.engineNote}</p>
    </Card>
  );
}
