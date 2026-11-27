import {
  CheckCircle2,
  Database,
  FileSearch,
  Lightbulb,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import type { AnalysisResult, FinalResolution } from "@/types/resolvex";
import { Badge } from "./Badge";
import { Card } from "./Card";

interface ExplainabilityLedgerProps {
  analysis: AnalysisResult;
  finalResolution?: FinalResolution | undefined;
  isVerifiedResolved?: boolean | undefined;
}

export function ExplainabilityLedger({
  analysis,
  finalResolution,
  isVerifiedResolved,
}: ExplainabilityLedgerProps) {
  const backend = analysis.backendData;
  const inv = backend?.inventory_insight ?? null;
  const intent = backend?.resolved_intent ?? null;
  const isResolved = isVerifiedResolved ?? backend?.status === "RESOLVED";
  const isUnitConversion = intent?.action === "unit_conversion";
  const isUnsupported = intent?.action === "unsupported_request";

  // 1. Data Sources Used
  const dataSources: string[] = [];
  if (inv) dataSources.push("SQLite Inventory & Order DB");
  if (isUnitConversion || isUnsupported) dataSources.push("Deterministic Rule Engine");
  if (backend && !isUnitConversion && !isUnsupported) {
    dataSources.push("Gemini Structured Analyzer");
  }
  if (!backend) dataSources.push("Client Preview Model");
  if ((backend?.turn_count ?? 1) > 1) dataSources.push("Multi-Turn Clarification History");

  // 2. Verified Facts
  const verifiedFacts: string[] = [];
  if (inv) {
    const atRiskCount = inv.order_risks.filter((r) => r.risk_category !== "ON_TRACK").length;
    verifiedFacts.push(
      `Evaluated ${inv.inventory_overview.total_materials} materials (${inv.inventory_overview.out_of_stock_count} out of stock, ${inv.inventory_overview.low_stock_count} low stock) using Net Availability = on_hand + incoming - allocated.`,
    );
    verifiedFacts.push(
      `Assessed ${inv.order_risks.length} open order(s) using Earliest-CRD-First allocation; ${atRiskCount} order(s) flagged AT_RISK or BLOCKED.`,
    );
  }
  if (isUnitConversion && intent?.direct_answer) {
    verifiedFacts.push(`Exact unit conversion computed deterministically: ${intent.direct_answer}`);
  }
  if (backend) {
    verifiedFacts.push(
      `Session persisted across ${backend.turn_count} turn(s) with status ${backend.status}.`,
    );
  } else {
    verifiedFacts.push(
      `Analyzed ${analysis.spans.length} ambiguity span(s) in "${analysis.domain}" domain.`,
    );
  }

  // 3. AI Interpretations & Ambiguity Evidence
  const interpretationsSummary: string[] = [];
  if (backend?.classification) {
    interpretationsSummary.push(
      `Classification: ${backend.classification} (Ambiguity Index: ${analysis.ambiguityScore}%).`,
    );
  }
  if (backend?.missing_required_info && backend.missing_required_info.length > 0) {
    interpretationsSummary.push(
      `Missing information identified: ${backend.missing_required_info.join(", ")}.`,
    );
  }
  if (analysis.interpretations.length > 0) {
    interpretationsSummary.push(
      `${analysis.interpretations.length} candidate interpretation(s) generated: ${analysis.interpretations
        .slice(0, 2)
        .map((i) => i.title)
        .join(" | ")}.`,
    );
  } else if (isResolved) {
    interpretationsSummary.push("No competing interpretations detected; instruction is unambiguous.");
  }

  // 4. Estimates, Assumptions & Recommendations
  const estimatesAndRecs: string[] = [];
  if (inv) {
    estimatesAndRecs.push(
      "Estimate/Assumption: Projected ship dates assume supplier replenishment within configured material lead times.",
    );
    if (inv.shortages.length > 0) {
      const top = inv.shortages[0]!;
      estimatesAndRecs.push(
        `Recommendation: Review ${inv.shortages.length} shortage(s) — e.g., ${top.material_id} suggested PO +${top.recommended_purchase_qty} ${top.unit}.`,
      );
    }
  } else if (!isResolved && analysis.clarificationQuestions.length > 0) {
    estimatesAndRecs.push(
      `Recommendation: Answer ${analysis.clarificationQuestions.length} targeted clarification question(s) before execution.`,
    );
  } else {
    estimatesAndRecs.push(
      "Assumption: Clarity and ambiguity scores reflect structural completeness of the instruction.",
    );
  }

  // 5. Execution Status (Completed vs Not Executed)
  const completedActions: string[] = [];
  const notExecuted: string[] = [
    "No external email, message, or third-party API action was executed.",
    "No purchase order is finalized or sent to suppliers without Procurement Manager / Admin approval.",
  ];
  if (isResolved) {
    completedActions.push(
      finalResolution
        ? `Structured intent "${finalResolution.structuredSpec.intentType}" compiled and ready for export.`
        : "Resolved intent recorded in session.",
    );
  } else {
    completedActions.push("Ambiguity diagnostic recorded; awaiting user clarification.");
  }
  if (inv) {
    completedActions.push("Live SQLite inventory, shortages, and CRD risks queried.");
  }

  return (
    <Card className="border-cyan-500/25 bg-[#070d1f]/80 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileSearch className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm sm:text-base font-semibold text-white">
            Explainability &amp; Evidence Ledger
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {dataSources.map((src) => (
            <Badge key={src} tone="cyan">
              <Database className="h-3 w-3" />
              {src}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
        {/* Verified Facts */}
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/15 p-3.5 space-y-2">
          <div className="flex items-center gap-1.5 font-semibold text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Verified Facts</span>
          </div>
          <ul className="space-y-1.5 text-slate-200 list-disc list-inside">
            {verifiedFacts.map((fact, idx) => (
              <li key={idx} className="leading-relaxed">
                {fact}
              </li>
            ))}
          </ul>
        </div>

        {/* AI Interpretations */}
        <div className="rounded-xl border border-violet-500/25 bg-violet-950/15 p-3.5 space-y-2">
          <div className="flex items-center gap-1.5 font-semibold text-violet-300">
            <Sparkles className="h-3.5 w-3.5" />
            <span>AI Interpretations &amp; Ambiguity</span>
          </div>
          <ul className="space-y-1.5 text-slate-200 list-disc list-inside">
            {interpretationsSummary.map((item, idx) => (
              <li key={idx} className="leading-relaxed">
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Estimates & Recommendations */}
        <div className="rounded-xl border border-amber-500/25 bg-amber-950/15 p-3.5 space-y-2">
          <div className="flex items-center gap-1.5 font-semibold text-amber-300">
            <Lightbulb className="h-3.5 w-3.5" />
            <span>Estimates, Assumptions &amp; Recommendations</span>
          </div>
          <ul className="space-y-1.5 text-slate-200 list-disc list-inside">
            {estimatesAndRecs.map((item, idx) => (
              <li key={idx} className="leading-relaxed">
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Action Execution Status */}
        <div className="rounded-xl border border-cyan-500/25 bg-cyan-950/15 p-3.5 space-y-2">
          <div className="flex items-center gap-1.5 font-semibold text-cyan-300">
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>Execution Guardrails (Completed vs. Pending)</span>
          </div>
          <ul className="space-y-1.5 text-slate-200 list-disc list-inside">
            {completedActions.map((item, idx) => (
              <li key={`c-${idx}`} className="leading-relaxed">
                <strong className="text-emerald-300">Completed:</strong> {item}
              </li>
            ))}
            {notExecuted.map((item, idx) => (
              <li key={`n-${idx}`} className="leading-relaxed">
                <strong className="text-slate-300">Not Executed:</strong> {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
