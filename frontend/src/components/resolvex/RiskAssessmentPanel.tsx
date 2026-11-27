import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Lock,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Badge, type BadgeTone } from "@/components/resolvex/Badge";
import { Button } from "@/components/resolvex/Button";
import { Card } from "@/components/resolvex/Card";
import type { ImpactDimension, IntentRiskAssessment, RiskLevel } from "@/types/resolvex";

interface RiskAssessmentPanelProps {
  assessment: IntentRiskAssessment;
  userConfirmed?: boolean;
  onConfirmHighRisk?: (confirmed: boolean) => void;
  onRequestClarification?: () => void;
  compact?: boolean;
  title?: string;
  className?: string;
}

const RISK_BADGE_MAP: Record<RiskLevel, { tone: BadgeTone; label: string }> = {
  Low: { tone: "emerald", label: "Low Risk" },
  Medium: { tone: "amber", label: "Medium Risk" },
  Moderate: { tone: "amber", label: "Moderate Risk" },
  High: { tone: "rose", label: "High Risk" },
  Critical: { tone: "rose", label: "Critical Risk" },
};

const DIMENSION_LABEL_MAP: Record<ImpactDimension, string> = {
  financial_payment: "Financial Settlement / Payment",
  data_deletion: "Destructive Resource Deletion",
  permission_access: "IAM & Access Privilege Mutation",
  sensitive_recipient: "Sensitive / Broad Recipient Reach",
  system_mutation: "Production System Mutation",
};

export function RiskAssessmentPanel({
  assessment,
  userConfirmed = false,
  onConfirmHighRisk,
  onRequestClarification,
  compact = false,
  title = "Risk-Aware Intent Resolution & Guardrails",
  className = "",
}: RiskAssessmentPanelProps) {
  const isHighRisk = assessment.riskLevel === "High" || assessment.riskLevel === "Critical";
  const badgeInfo = RISK_BADGE_MAP[assessment.riskLevel] ?? { tone: "cyan", label: "Assessed" };

  return (
    <Card
      className={`space-y-4 border transition-all ${
        isHighRisk
          ? "border-rose-500/40 bg-rose-950/20 shadow-rose-950/20 shadow-lg"
          : assessment.riskLevel === "Moderate"
            ? "border-amber-500/30 bg-amber-950/15"
            : "border-emerald-500/30 bg-emerald-950/10"
      } ${className}`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              isHighRisk
                ? "bg-rose-500/20 text-rose-300"
                : assessment.riskLevel === "Moderate"
                  ? "bg-amber-500/20 text-amber-300"
                  : "bg-emerald-500/20 text-emerald-300"
            }`}
          >
            {isHighRisk ? (
              <ShieldAlert className="h-4 w-4" />
            ) : assessment.safeToResolve ? (
              <ShieldCheck className="h-4 w-4" />
            ) : (
              <Shield className="h-4 w-4" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">{title}</h3>
              <Badge tone={badgeInfo.tone}>{badgeInfo.label}</Badge>
            </div>
            <p className="text-xs text-slate-400">
              Risk Score:{" "}
              <span className="font-mono font-semibold text-white">{assessment.riskScore}/100</span>{" "}
              • Reversibility:{" "}
              <span className="font-medium text-slate-300 capitalize">
                {assessment.reversibility.replace("_", " ")}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {assessment.safeToResolve ? (
            <Badge tone="emerald" className="px-2.5 py-1 text-xs">
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Safe to Conclude
            </Badge>
          ) : (
            <Badge tone="rose" className="px-2.5 py-1 text-xs">
              <Lock className="mr-1 h-3.5 w-3.5" /> Gated: Requires Clarification / Confirmation
            </Badge>
          )}
        </div>
      </div>

      {/* Confirmation & Gating Banner if high risk */}
      {assessment.requiresExplicitConfirmation && (
        <div
          className={`rounded-xl border p-3.5 space-y-2.5 ${
            userConfirmed
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
              : "border-rose-500/40 bg-rose-500/10 text-rose-200"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle
                className={`mt-0.5 h-4 w-4 shrink-0 ${userConfirmed ? "text-emerald-300" : "text-rose-300"}`}
              />
              <div>
                <p className="text-xs font-semibold">
                  {userConfirmed
                    ? "Explicit Human Confirmation Verified"
                    : "High-Impact Intent: Explicit Confirmation Required"}
                </p>
                <p className="text-[11px] leading-relaxed opacity-90">
                  {assessment.confirmationReason ??
                    "This intent entails high-impact consequences (payments, deletion, permissions, or broad audience reach)."}
                </p>
              </div>
            </div>

            {onConfirmHighRisk && (
              <Button
                size="sm"
                variant={userConfirmed ? "outline" : "primary"}
                onClick={() => onConfirmHighRisk(!userConfirmed)}
                className="shrink-0 text-xs"
              >
                {userConfirmed ? (
                  <>
                    <RotateCcw className="h-3 w-3 mr-1" /> Revoke Confirmation
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-3 w-3 mr-1" /> Explicitly Confirm Intent
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* High-Impact Ambiguities Callout */}
      {assessment.highImpactAmbiguities.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-amber-200">
            High-Impact Ambiguity Triggers Detected:
          </p>
          <ul className="space-y-1 pl-4 list-disc text-xs text-amber-300">
            {assessment.highImpactAmbiguities.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
          {onRequestClarification && (
            <div className="pt-1">
              <Button
                size="sm"
                variant="secondary"
                onClick={onRequestClarification}
                className="text-xs"
              >
                Clarify High-Impact Ambiguity
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Breakdown of Risk Factors */}
      {!compact && assessment.riskFactors.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Detected Consequence &amp; Target Risk Factors
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {assessment.riskFactors.map((factor, idx) => {
              const fBadge = RISK_BADGE_MAP[factor.level] ?? { tone: "amber", label: factor.level };
              return (
                <div
                  key={idx}
                  className="rounded-xl border border-white/8 bg-white/3 p-3 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-200">{factor.label}</span>
                    <Badge tone={fBadge.tone}>{fBadge.label}</Badge>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{factor.description}</p>
                  <p className="text-[10px] text-slate-500 font-mono">
                    Category: {DIMENSION_LABEL_MAP[factor.dimension] ?? factor.dimension}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Safe Execution Notice */}
      <div className="flex items-center justify-between border-t border-white/8 pt-2.5 text-[11px] text-slate-400">
        <span>
          <strong className="text-slate-300">Safety Guarantee:</strong> ResolveX never executes
          external actions or modifies third-party state directly.
        </span>
        <span className="text-slate-500 italic">Feature 9 Risk Layer</span>
      </div>
    </Card>
  );
}
