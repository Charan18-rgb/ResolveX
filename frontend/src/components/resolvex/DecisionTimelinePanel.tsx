import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileCode,
  FileSpreadsheet,
  FileText,
  Filter,
  History,
  Link2,
  Lock,
  MessageSquare,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge, type BadgeTone } from "@/components/resolvex/Badge";
import { Button } from "@/components/resolvex/Button";
import { Card } from "@/components/resolvex/Card";
import type {
  DecisionTimelineEvent,
  DecisionTimelineEventType,
  ExplainableDecisionTimeline,
} from "@/types/resolvex";
import { formatDecisionTimelineAsMarkdown } from "@/data/decisionTimelineEngine";

interface DecisionTimelinePanelProps {
  timeline: ExplainableDecisionTimeline;
  compact?: boolean;
  className?: string;
}

const EVENT_TYPE_ICON: Record<DecisionTimelineEventType, React.ElementType> = {
  initial_input: MessageSquare,
  ambiguity_detected: AlertTriangle,
  interpretation_divergence: Sparkles,
  scenario_selected: Sparkles,
  clarification_question_selected: Filter,
  clarification_answered: CheckCircle2,
  memory_coreference_resolved: Brain,
  confidence_recalculated: Clock,
  risk_assessment_evaluated: Shield,
  risk_confirmed: ShieldCheck,
  verification_checked: ShieldAlert,
  final_intent_compiled: FileText,
};

const EVENT_TYPE_TONE: Record<DecisionTimelineEventType, BadgeTone> = {
  initial_input: "cyan",
  ambiguity_detected: "amber",
  interpretation_divergence: "violet",
  scenario_selected: "violet",
  clarification_question_selected: "cyan",
  clarification_answered: "emerald",
  memory_coreference_resolved: "cyan",
  confidence_recalculated: "violet",
  risk_assessment_evaluated: "rose",
  risk_confirmed: "emerald",
  verification_checked: "amber",
  final_intent_compiled: "emerald",
};

export function DecisionTimelinePanel({
  timeline,
  compact = false,
  className = "",
}: DecisionTimelinePanelProps) {
  const [copied, setCopied] = useState<"json" | "md" | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const filteredEvents =
    filterType === "all"
      ? timeline.events
      : timeline.events.filter((e) => e.type.includes(filterType) || e.category === filterType);

  const handleCopyMarkdown = async () => {
    if (typeof navigator === "undefined") return;
    const md = formatDecisionTimelineAsMarkdown(timeline);
    try {
      await navigator.clipboard.writeText(md);
      setCopied("md");
      setTimeout(() => setCopied(null), 1800);
    } catch {
      // ignore
    }
  };

  const handleCopyJson = async () => {
    if (typeof navigator === "undefined") return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(timeline, null, 2));
      setCopied("json");
      setTimeout(() => setCopied(null), 1800);
    } catch {
      // ignore
    }
  };

  const handleDownloadMarkdown = () => {
    if (typeof document === "undefined") return;
    const md = formatDecisionTimelineAsMarkdown(timeline);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resolvex-decision-timeline-${timeline.conversationId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className={`space-y-4 border border-violet-500/25 bg-slate-950/40 ${className}`}>
      {/* Header & Export Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/20 text-violet-300">
            <History className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">Explainable AI Decision Timeline</h3>
              <Badge tone="violet">{timeline.totalEvents} Observable Events</Badge>
            </div>
            <p className="text-xs text-slate-400">
              Chronological decision provenance from initial directive to verified contract.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void handleCopyMarkdown()}
            iconLeft={<Copy className="h-3.5 w-3.5" />}
            className="text-xs"
          >
            {copied === "md" ? "Copied Markdown" : "Copy Markdown"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownloadMarkdown}
            iconLeft={<Download className="h-3.5 w-3.5" />}
            className="text-xs"
          >
            Export .md
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleCopyJson()}
            iconLeft={<FileCode className="h-3.5 w-3.5" />}
            className="text-xs"
          >
            {copied === "json" ? "Copied JSON" : "Timeline JSON"}
          </Button>
        </div>
      </div>

      {/* Narrative Summary Callout */}
      <div className="rounded-xl border border-white/10 bg-[#060a18] p-3 text-xs leading-relaxed text-slate-300">
        <span className="font-semibold text-cyan-300">Decision Narrative: </span>
        {timeline.summaryNarrative}
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/5 pb-2">
        <span className="text-[11px] font-medium text-slate-500 mr-1">Filter Events:</span>
        {[
          { id: "all", label: "All Decisions" },
          { id: "clarif", label: "Clarification" },
          { id: "confid", label: "Confidence" },
          { id: "risk", label: "Risk & Safety" },
          { id: "verif", label: "Verification" },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilterType(f.id)}
            className={`cursor-pointer rounded-lg px-2 py-0.5 text-[11px] font-medium transition-colors ${
              filterType === f.id
                ? "bg-violet-500/20 text-violet-200 border border-violet-500/40"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/4"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Timeline Stream */}
      <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-white/10">
        {filteredEvents.map((evt, idx) => {
          const Icon = EVENT_TYPE_ICON[evt.type] ?? Sparkles;
          const tone = EVENT_TYPE_TONE[evt.type] ?? "violet";
          const isExpanded = expandedEventId === evt.id;

          return (
            <div key={evt.id} className="relative group">
              {/* Dot */}
              <div
                className={`absolute -left-[19px] top-1 flex h-4 w-4 items-center justify-center rounded-full border border-slate-900 ${
                  tone === "emerald"
                    ? "bg-emerald-400 text-slate-950"
                    : tone === "rose"
                      ? "bg-rose-400 text-slate-950"
                      : tone === "amber"
                        ? "bg-amber-400 text-slate-950"
                        : "bg-cyan-400 text-slate-950"
                }`}
              >
                <div className="h-1.5 w-1.5 rounded-full bg-slate-950" />
              </div>

              {/* Event Card */}
              <div
                onClick={() => setExpandedEventId(isExpanded ? null : evt.id)}
                className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
                  isExpanded
                    ? "border-violet-400/40 bg-white/6 shadow-md"
                    : "border-white/8 bg-white/2 hover:border-white/20 hover:bg-white/4"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-violet-300" />
                    <span className="text-xs font-semibold text-white">{evt.title}</span>
                    <Badge tone={tone} className="text-[10px] py-0 px-1.5">
                      Turn #{evt.turnNumber}
                    </Badge>
                  </div>
                  <span className="font-mono text-[10px] text-slate-500">
                    {new Date(evt.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">{evt.summary}</p>

                {/* Explanation block */}
                <div className="mt-2 rounded-lg border border-white/6 bg-black/30 p-2.5 text-[11px] leading-relaxed text-slate-300">
                  <span className="font-semibold text-violet-300">
                    Why this decision was made:{" "}
                  </span>
                  {evt.explanation}
                </div>

                {/* Linked context and message */}
                {(evt.sourceMessage || evt.sourceContext) && (
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-slate-400 border-t border-white/5 pt-2">
                    {evt.sourceContext && (
                      <span className="inline-flex items-center gap-1">
                        <Link2 className="h-3 w-3 text-cyan-400" />
                        {evt.sourceContext}
                      </span>
                    )}
                    {evt.sourceMessage && (
                      <span className="inline-flex items-center gap-1 font-mono text-cyan-200 truncate max-w-md">
                        “{evt.sourceMessage}”
                      </span>
                    )}
                  </div>
                )}

                {/* Evidence Signals if expanded */}
                {isExpanded && evt.evidenceSignals && evt.evidenceSignals.length > 0 && (
                  <div className="mt-2.5 space-y-1 border-t border-white/8 pt-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Supporting Observable Signals:
                    </p>
                    <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-slate-400">
                      {evt.evidenceSignals.map((sig, sIdx) => (
                        <li key={sIdx}>{sig}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-white/8 pt-2 flex items-center justify-between text-[11px] text-slate-500">
        <span>Click any decision card to view full observable evidence signals.</span>
        <span>Feature 10 Decision Timeline</span>
      </div>
    </Card>
  );
}
