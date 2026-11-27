import { CATEGORY_STYLE_MAP } from "@/data/categoryStyles";
import type { AmbiguitySpan } from "@/types/resolvex";

interface PromptHighlighterProps {
  prompt: string;
  spans: AmbiguitySpan[];
  selectedSpanId?: string | null | undefined;
  onSelectSpan?: ((span: AmbiguitySpan) => void) | undefined;
}

export function PromptHighlighter({
  prompt,
  spans,
  selectedSpanId,
  onSelectSpan,
}: PromptHighlighterProps) {
  const sorted = [...spans].sort((a, b) => a.startIndex - b.startIndex);
  const segments: Array<
    | { type: "text"; key: string; value: string }
    | { type: "span"; key: string; span: AmbiguitySpan }
  > = [];

  let cursor = 0;
  for (const span of sorted) {
    if (span.startIndex < cursor || span.endIndex > prompt.length) continue;
    if (span.startIndex > cursor) {
      segments.push({
        type: "text",
        key: `t-${cursor}`,
        value: prompt.slice(cursor, span.startIndex),
      });
    }
    segments.push({
      type: "span",
      key: span.id,
      span,
    });
    cursor = span.endIndex;
  }

  if (cursor < prompt.length) {
    segments.push({
      type: "text",
      key: `t-${cursor}-end`,
      value: prompt.slice(cursor),
    });
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#050814]/80 p-4 sm:p-5 text-base sm:text-lg leading-relaxed text-slate-100">
      {segments.map((seg) => {
        if (seg.type === "text") {
          return <span key={seg.key}>{seg.value}</span>;
        }
        const style = CATEGORY_STYLE_MAP[seg.span.category];
        const isActive = selectedSpanId === seg.span.id;
        return (
          <button
            key={seg.key}
            type="button"
            onClick={() => onSelectSpan?.(seg.span)}
            className={`mx-0.5 inline-flex cursor-pointer items-center gap-1 rounded-md border px-1.5 py-0.5 font-medium transition-all ${style.span} ${
              isActive ? "ring-2 ring-cyan-400/80 ring-offset-1 ring-offset-[#050814]" : ""
            }`}
            title={`${seg.span.category} ambiguity (${seg.span.severity}% severity)`}
          >
            <span>{seg.span.token}</span>
            <span className="text-[10px] uppercase tracking-wider opacity-80">
              {seg.span.category}
            </span>
          </button>
        );
      })}
    </div>
  );
}
