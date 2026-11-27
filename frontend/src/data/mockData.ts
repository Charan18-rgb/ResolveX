import type {
  AmbiguityCategory,
  AmbiguitySpan,
  AnalysisResult,
  AppSettings,
  CategoryScore,
  ClarificationAnswer,
  ClarificationOptimizerState,
  ClarificationQuestion,
  ContextGraphEdge,
  ContextGraphNode,
  ContextIntelligenceGraphData,
  DomainContext,
  EssentialFieldStatus,
  EssentialIntentField,
  EvaluationDataset,
  ExamplePrompt,
  FieldVerificationCheck,
  FinalResolution,
  GraphNodeState,
  Interpretation,
  LanguageOption,
  RemainingAmbiguityItem,
  ResolutionVerificationReport,
  RiskLevel,
  ScenarioDimensionDiff,
  StrictnessLevel,
} from "@/types/resolvex";
import { ENV_CONFIG } from "@/config/env";
import {
  detectLanguageMetadata,
  MULTILINGUAL_AMBIGUOUS_TOKENS,
  MULTILINGUAL_SAMPLE_CASES,
  resolveUiLanguage,
} from "./multilingualEngine";

export const DEFAULT_APP_SETTINGS: AppSettings = {
  apiBaseUrl: ENV_CONFIG.apiBaseUrl,
  integrationMode: "live",
  ambiguityThreshold: 60,
  maxClarificationQuestions: 3,
  defaultDomain: "General",
  defaultStrictness: "Balanced",
  defaultRole: "Inventory Planner",
  reduceMotion: false,
  showTokenConfidence: true,
};

export const CLASSIC_QUICK_PROMPTS: string[] = [
  "Send the report to Rahul tomorrow.",
  "Book a table for tomorrow evening.",
  "Move the meeting to Friday.",
  "Give Alex the latest version.",
  "Transfer the files to the other folder.",
  "Prioritize remaining MCU stock for the Bengaluru line and expedite the rest soon.",
];

export const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  {
    id: "ex-deploy-fast",
    title: "Ambiguous Deployment Command",
    tag: "Engineering Ops",
    domain: "Software Engineering",
    prompt:
      "Update the auth service and deploy it soon, but make sure recent user sessions stay intact.",
    previewAmbiguity: 84,
  },
  {
    id: "ex-analytics-report",
    title: "Unclear Executive Reporting",
    tag: "Data & Analytics",
    domain: "Data & Analytics",
    prompt:
      "Pull the top performing regions from last quarter and clean up the anomalies before sharing them.",
    previewAmbiguity: 79,
  },
  {
    id: "ex-support-escalation",
    title: "Vague Policy & Scope Request",
    tag: "Enterprise Support",
    domain: "Enterprise Support",
    prompt: "Restrict access for inactive accounts and notify the team if anything looks unusual.",
    previewAmbiguity: 88,
  },
];

function locateSpan(
  prompt: string,
  token: string,
  id: string,
  category: AmbiguityCategory,
  severity: number,
  confidence: number,
  reason: string,
  candidateMeanings: string[],
  searchFrom = 0,
): AmbiguitySpan | null {
  const lowerPrompt = prompt.toLowerCase();
  const lowerToken = token.toLowerCase();
  const idx = lowerPrompt.indexOf(lowerToken, searchFrom);
  if (idx === -1) return null;
  return {
    id,
    token: prompt.slice(idx, idx + token.length),
    startIndex: idx,
    endIndex: idx + token.length,
    category,
    severity,
    confidence,
    reason,
    candidateMeanings,
  };
}

function buildCategoryBreakdown(spans: AmbiguitySpan[]): CategoryScore[] {
  const categories: AmbiguityCategory[] = [
    "Lexical",
    "Syntactic",
    "Referential",
    "Scope",
    "Temporal",
    "Pragmatic",
  ];
  return categories.map((category) => {
    const matching = spans.filter((s) => s.category === category);
    const avg =
      matching.length > 0
        ? Math.round(matching.reduce((acc, item) => acc + item.severity, 0) / matching.length)
        : 18;
    return {
      category,
      score: avg,
      count: matching.length,
    };
  });
}

function deriveRiskLevel(ambiguityScore: number): RiskLevel {
  if (ambiguityScore >= 82) return "Critical";
  if (ambiguityScore >= 65) return "High";
  if (ambiguityScore >= 42) return "Moderate";
  return "Low";
}

export function buildPresetAnalysis(
  exampleId: string,
  strictness: StrictnessLevel = "Balanced",
  requestedLanguage: LanguageOption = "Auto Detect",
): AnalysisResult {
  const now = new Date().toISOString();

  if (exampleId === "ex-deploy-fast") {
    const prompt = EXAMPLE_PROMPTS[0]!.prompt;
    const spans = [
      locateSpan(
        prompt,
        "Update",
        "span-update",
        "Lexical",
        78,
        0.92,
        '"Update" does not specify whether to patch dependencies, roll a new image tag, or apply schema migrations.',
        [
          "Deploy latest release artifact (v2.4.x)",
          "Apply security dependency patches only",
          "Rotate JWT signing keys & config",
        ],
      ),
      locateSpan(
        prompt,
        "it",
        "span-it",
        "Referential",
        71,
        0.88,
        'Pronoun "it" could refer to the auth service container, the entire identity stack, or a staging replica.',
        ["Auth microservice only", "Auth service + API gateway"],
      ),
      locateSpan(
        prompt,
        "soon",
        "span-soon",
        "Temporal",
        86,
        0.95,
        'Relative temporal marker "soon" lacks an execution window, SLA, or maintenance freeze check.',
        [
          "Immediate canary rollout (next 15 mins)",
          "Scheduled off-peak window (02:00 UTC)",
          "After CI integration sign-off",
        ],
      ),
      locateSpan(
        prompt,
        "recent user sessions",
        "span-sessions",
        "Scope",
        89,
        0.94,
        '"Recent" has no TTL boundary (e.g., last 15m vs 24h) and does not define token persistence strategy.',
        [
          "Active sessions within last 60 minutes (Redis-backed)",
          "All non-expired refresh tokens (7 days)",
        ],
      ),
    ].filter((s): s is AmbiguitySpan => s !== null);

    const interpretations: Interpretation[] = [
      {
        id: "interp-canary-zero-downtime",
        title: "Zero-Downtime Rolling Release to Production",
        summary:
          "Deploy the latest built auth service release immediately using rolling pods while preserving Redis-backed sessions from the last 24 hours.",
        probability: 54,
        impactScope: "Production Auth Cluster (us-east + eu-west)",
        riskLevel: "High",
        assumptions: [
          "CI build artifact is already validated",
          "Redis session store remains backward-compatible",
          "Zero-downtime health checks pass",
        ],
        recommendedAction:
          "Confirm deployment target environment and session retention cutoff before triggering pipeline.",
        simulatedIntent: {
          action: "Rolling container release (v2.4.2 canary)",
          entities: ["auth-service", "Redis session store"],
          recipient: "Live Production Traffic (us-east + eu-west)",
          object: "Auth container image + 24h refresh tokens",
          date: "Immediate 10% canary rollout",
          resolvedDirective:
            "Deploy release artifact v2.4.2 to Production Auth Cluster immediately via 10% canary while keeping dual-key validation for all 24h Redis sessions.",
        },
        triggerWords: [
          {
            word: "Update",
            category: "Lexical",
            divergenceReason:
              "Interpreted as full container build rollout (v2.4.2) rather than a dependency patch or config reload.",
          },
          {
            word: "soon",
            category: "Temporal",
            divergenceReason:
              "Resolved as immediate automated canary execution instead of queuing for staging or off-peak.",
          },
          {
            word: "recent user sessions",
            category: "Scope",
            divergenceReason:
              "Expanded to preserve all non-expired 24h refresh tokens across pod replacement.",
          },
        ],
        consequences: [
          {
            label: "Production Traffic Exposure",
            severity: "Risk",
            detail:
              "10% of live logins route to v2.4.2 immediately; automated rollback triggers if 5xx > 0.5%.",
          },
          {
            label: "Zero Session Drop",
            severity: "Positive",
            detail:
              "Dual-key JWT validation preserves active users across rolling pod replacement.",
          },
          {
            label: "Audit & Telemetry",
            severity: "Neutral",
            detail: "Simulated plan only — no Kubernetes or CI/CD webhook is executed.",
          },
        ],
      },
      {
        id: "interp-staging-patch",
        title: "Staging Security Patch Validation First",
        summary:
          "Apply dependency updates to the auth service in staging within 2 hours and verify active QA session continuity before production promotion.",
        probability: 31,
        impactScope: "Staging Environment Only",
        riskLevel: "Moderate",
        assumptions: [
          "User meant non-disruptive staging verification first",
          "Production deploy waits for manual approval",
        ],
        recommendedAction: 'Clarify whether "soon" permits immediate production mutation.',
        simulatedIntent: {
          action: "Apply CVE dependency patch & rebuild",
          entities: ["auth-service-staging", "QA session store"],
          recipient: "Staging QA Engineers & Integration Suite",
          object: "Dependency lockfile + 60m test sessions",
          date: "Scheduled within next 2 hours (pre-prod)",
          resolvedDirective:
            "Patch auth-service dependencies in Staging Environment only within 2 hours and verify 60-minute QA sessions before production promotion.",
        },
        triggerWords: [
          {
            word: "Update",
            category: "Lexical",
            divergenceReason:
              "Narrowed to dependency CVE security patching instead of shipping new feature code.",
          },
          {
            word: "it",
            category: "Referential",
            divergenceReason:
              'Scoped "it" strictly to the staging auth replica rather than production cluster.',
          },
          {
            word: "soon",
            category: "Temporal",
            divergenceReason:
              "Interpreted as a 2-hour staging verification window prior to manual prod sign-off.",
          },
        ],
        consequences: [
          {
            label: "Zero Production Blast Radius",
            severity: "Positive",
            detail: "Customer traffic remains untouched until staging smoke checks pass.",
          },
          {
            label: "Delayed Fix Delivery",
            severity: "Risk",
            detail:
              "Production rollout waits for manual approval, delaying live release by 2+ hours.",
          },
          {
            label: "QA Verification Gate",
            severity: "Neutral",
            detail: "Requires staging integration runner availability.",
          },
        ],
      },
      {
        id: "interp-config-reload",
        title: "Hot-Reload Auth Configuration Without Pod Restart",
        summary:
          "Update auth service feature flags/secrets in-place without container replacement so active JWT/session state is untouched.",
        probability: 15,
        impactScope: "Runtime Config Store",
        riskLevel: "Low",
        assumptions: ["No binary code change is required"],
        recommendedAction: "Verify whether code changes or config updates are intended.",
        simulatedIntent: {
          action: "Hot-reload runtime config (zero pod restarts)",
          entities: ["auth-config-map", "JWT signing secrets"],
          recipient: "Existing Running Auth Pods",
          object: "Feature flags & runtime environment variables",
          date: "02:00 UTC maintenance sync (or instant config push)",
          resolvedDirective:
            "Hot-reload auth-service runtime configuration in-place without container restarts so active user sessions remain completely untouched.",
        },
        triggerWords: [
          {
            word: "Update",
            category: "Lexical",
            divergenceReason:
              "Interpreted as in-place configuration mutation rather than container redeployment.",
          },
          {
            word: "recent user sessions",
            category: "Scope",
            divergenceReason: "Guaranteed automatically because no pods restart or drain.",
          },
        ],
        consequences: [
          {
            label: "Zero Container Churn",
            severity: "Positive",
            detail:
              "Active connections and in-memory session caches stay intact with zero restart downtime.",
          },
          {
            label: "Binary Changes Ignored",
            severity: "Risk",
            detail: "If actual source-code fixes were needed, hot-reload will not ship them.",
          },
          {
            label: "Reversible Config Diff",
            severity: "Neutral",
            detail: "Configuration snapshot can be rolled back in <5 seconds.",
          },
        ],
      },
    ];

    const clarificationQuestions: ClarificationQuestion[] = [
      {
        id: "cq-sessions",
        targetSpanId: "span-sessions",
        targetToken: "recent user sessions",
        category: "Scope",
        importanceScore: 95,
        essentialField: "Safety & Guardrails",
        isEssential: true,
        estimatedClarityGain: 28,
        question: 'How do you define "recent user sessions" to preserve?',
        rationale:
          "Determines whether short-lived access tokens or full refresh sessions must stay valid.",
        necessityReason:
          "Without a concrete session TTL boundary, rolling pods could unexpectedly invalidate active customer logins.",
        selectionExplanation:
          "Ranked #1 (95/100 importance) because session retention carries the highest user-facing outage risk and resolves the Safety & Guardrails intent field.",
        options: [
          {
            id: "opt-1h",
            label: "Active in Last 60 Minutes",
            description: "Drain pods gracefully and preserve 1h Redis keys.",
            resolvesTo: "preserving all sessions active within the last 60 minutes",
          },
          {
            id: "opt-24h",
            label: "All Non-Expired Sessions (24h)",
            description: "Maintain backward-compatible token signing keys for 24h.",
            resolvesTo: "keeping dual-key validation active for all 24h sessions",
          },
        ],
      },
      {
        id: "cq-window",
        targetSpanId: "span-soon",
        targetToken: "soon",
        category: "Temporal",
        importanceScore: 91,
        essentialField: "Execution Timing",
        isEssential: true,
        estimatedClarityGain: 24,
        question: "When should the deployment execute?",
        rationale: '"Soon" creates ambiguity around maintenance windows and canary approval.',
        necessityReason:
          'Relative timing ("soon") leaves SLA windows and peak-traffic freezes undefined prior to production rollout.',
        selectionExplanation:
          "Prioritized (91/100 importance) because Execution Timing is an essential operational gate before any deployment action can be scheduled.",
        options: [
          {
            id: "opt-now",
            label: "Immediately (Canary)",
            description: "Start 10% traffic shift now with auto-rollback.",
            resolvesTo: "immediately via automated canary in production",
          },
          {
            id: "opt-offpeak",
            label: "Next Off-Peak Window (02:00 UTC)",
            description: "Queue deployment for lowest traffic period.",
            resolvesTo: "during the 02:00 UTC maintenance window",
          },
        ],
      },
      {
        id: "cq-target-env",
        targetSpanId: "span-update",
        targetToken: "Update",
        category: "Lexical",
        importanceScore: 86,
        essentialField: "Action Scope",
        isEssential: true,
        estimatedClarityGain: 22,
        dependentSpanIds: ["span-it"],
        question: "What type of update should be applied to the auth service?",
        rationale:
          "Code deployments, config reloads, and schema migrations have vastly different rollback risks.",
        necessityReason:
          "Clarifying the exact mutation operation prevents running a full container rollout when only config or security patching was intended.",
        selectionExplanation:
          'Selected (86/100 importance) to lock down the Action Scope field and disambiguate the downstream pronoun reference ("it").',
        options: [
          {
            id: "opt-release",
            label: "Latest Release Build (v2.4.2)",
            description: "Roll out the pre-built release container via canary.",
            resolvesTo: "Deploy release artifact v2.4.2 using a 10% canary rollout",
          },
          {
            id: "opt-security",
            label: "Security Patch Only",
            description: "Apply CVE dependency patch and rebuild.",
            resolvesTo: "Apply security dependency patch only after CI check",
          },
          {
            id: "opt-config",
            label: "Config Hot-Reload",
            description: "Update environment secrets without container restart.",
            resolvesTo: "Hot-reload runtime config without pod restarts",
          },
        ],
      },
      {
        id: "cq-it-ref",
        targetSpanId: "span-it",
        targetToken: "it",
        category: "Referential",
        importanceScore: 54,
        essentialField: "Target Entity",
        isEssential: false,
        estimatedClarityGain: 8,
        question: 'Confirm the exact deployment target for "it":',
        rationale: 'Pronoun "it" usually maps to the auth service once the update type is known.',
        necessityReason:
          "Optional confirmation of whether coupled gateway proxies also redeploy alongside the auth service.",
        selectionExplanation:
          'Lower priority (54/100) because resolving the update action largely narrows "it" to the auth microservice.',
        options: [
          {
            id: "opt-auth-only",
            label: "Auth Microservice Only",
            description: "Target only the auth-service deployment.",
            resolvesTo: "targeting only the auth-service deployment",
          },
          {
            id: "opt-auth-gateway",
            label: "Auth Service + API Gateway",
            description: "Include coupled gateway validation middleware.",
            resolvesTo: "targeting both auth-service and API gateway middleware",
          },
        ],
      },
    ];

    const defaultResolution = computeResolutionFromInputs(
      prompt,
      spans,
      interpretations[0] ?? null,
      [
        {
          questionId: "cq-sessions",
          selectedOptionId: "opt-24h",
          customAnswer: "",
          resolvedValue: clarificationQuestions[0]!.options[1]!.resolvesTo,
        },
        {
          questionId: "cq-window",
          selectedOptionId: "opt-now",
          customAnswer: "",
          resolvedValue: clarificationQuestions[1]!.options[0]!.resolvesTo,
        },
        {
          questionId: "cq-target-env",
          selectedOptionId: "opt-release",
          customAnswer: "",
          resolvedValue: clarificationQuestions[2]!.options[0]!.resolvesTo,
        },
      ],
      "Software Engineering",
      clarificationQuestions,
    );

    const ambiguityScore = strictness === "Strict" ? 89 : 84;

    return {
      id: "analysis-ex-deploy",
      prompt,
      domain: "Software Engineering",
      strictness,
      createdAt: now,
      isDemoData: true,
      ambiguityScore,
      clarityScore: 100 - ambiguityScore,
      riskLevel: deriveRiskLevel(ambiguityScore),
      summary:
        "Detected 4 high-impact ambiguities across action specificity, deployment timing, and session retention boundaries.",
      multilingual: detectLanguageMetadata(prompt, requestedLanguage),
      spans,
      categoryBreakdown: buildCategoryBreakdown(spans),
      interpretations,
      clarificationQuestions,
      defaultResolution,
    };
  }

  if (exampleId === "ex-analytics-report") {
    const prompt = EXAMPLE_PROMPTS[1]!.prompt;
    const spans = [
      locateSpan(
        prompt,
        "top performing",
        "span-top",
        "Lexical",
        81,
        0.91,
        '"Top performing" omits the ranking KPI (gross revenue, net margin, or YoY growth) and cutoff N.',
        ["Top 5 by Net Revenue", "Top 10% by YoY Growth", "Highest Retention Rate"],
      ),
      locateSpan(
        prompt,
        "last quarter",
        "span-quarter",
        "Temporal",
        68,
        0.86,
        "Fiscal quarter vs. calendar quarter can shift boundary dates by up to 30 days.",
        ["Calendar Q3 (Jul–Sep)", "Fiscal Q3 per Finance Ledger"],
      ),
      locateSpan(
        prompt,
        "clean up the anomalies",
        "span-anomalies",
        "Pragmatic",
        87,
        0.95,
        "Filtering vs. imputing vs. flagging anomalies alters executive metrics and auditability.",
        [
          "Exclude test/sandbox accounts only",
          "Winsorize statistical outliers (>3σ)",
          "Flag in appendix without deleting",
        ],
      ),
      locateSpan(
        prompt,
        "them",
        "span-them",
        "Referential",
        74,
        0.89,
        'Pronoun "them" may refer to cleaned anomaly logs, top regions, or the full dataset.',
        ["Top region summary deck", "Cleaned regional CSV export"],
      ),
    ].filter((s): s is AmbiguitySpan => s !== null);

    const interpretations: Interpretation[] = [
      {
        id: "interp-rev-exec",
        title: "Executive Revenue Leaderboard (Flag Outliers, Do Not Delete)",
        summary:
          "Rank top 5 calendar-quarter regions by net ARR, isolate >3σ spikes in a separate audit footnote, and export an executive summary.",
        probability: 58,
        impactScope: "Executive Board Reporting",
        riskLevel: "High",
        assumptions: ["Financial metrics must remain auditable", "Calendar quarter dates apply"],
        recommendedAction: "Confirm KPI definition and whether anomalies are flagged or excluded.",
        simulatedIntent: {
          action: "Rank top 5 regions & flag >3σ outliers",
          entities: ["Regional Net ARR", "Audit Footnote Log"],
          recipient: "Executive Leadership Team",
          object: "Executive Summary Table + CSV",
          date: "Calendar Q3 (Jul 1 – Sep 30)",
          resolvedDirective:
            "Pull top 5 regions by recognized Net ARR for Calendar Q3, annotate >3σ anomalies in an audit footnote without deleting rows, and share the executive summary with Leadership.",
        },
        triggerWords: [
          {
            word: "top performing",
            category: "Lexical",
            divergenceReason:
              "Defined as Top 5 regions by recognized Net ARR instead of growth rate.",
          },
          {
            word: "clean up the anomalies",
            category: "Pragmatic",
            divergenceReason:
              "Preserves audit integrity by flagging >3σ outliers rather than deleting records.",
          },
          {
            word: "them",
            category: "Referential",
            divergenceReason: 'Resolves "them" to the curated Executive Summary + CSV artifact.',
          },
        ],
        consequences: [
          {
            label: "Full Financial Auditability",
            severity: "Positive",
            detail: "No revenue figures are silently dropped before board presentation.",
          },
          {
            label: "Outlier Distortion Risk",
            severity: "Risk",
            detail:
              "Headline totals still include flagged one-off enterprise deals unless filtered.",
          },
          {
            label: "Read-Only Simulation",
            severity: "Neutral",
            detail: "Preview only — no warehouse query or email send is triggered.",
          },
        ],
      },
      {
        id: "interp-ops-cleanup",
        title: "Operational Dataset Sanitization Before BI Sync",
        summary:
          "Remove duplicate/bot transactions from the top 10 growth territories and publish cleaned tables to Looker.",
        probability: 29,
        impactScope: "BI Warehouse Layer",
        riskLevel: "Moderate",
        assumptions: ["Anomalies represent ingestion bugs rather than real demand"],
        recommendedAction: "Specify anomaly rule threshold before mutating rows.",
        simulatedIntent: {
          action: "Exclude QA/bot rows & sync BI dashboard",
          entities: ["Top 10 Growth Territories", "Looker BI Model"],
          recipient: "Revenue Operations (#rev-ops)",
          object: "Sanitized BI Dataset View",
          date: "Calendar Q3 (rolling 90d)",
          resolvedDirective:
            "Extract top 10 territories by QoQ growth, exclude verified QA/bot ingestion anomalies, and publish the cleaned BI dashboard link to #rev-ops.",
        },
        triggerWords: [
          {
            word: "top performing",
            category: "Lexical",
            divergenceReason:
              "Switched KPI from Net ARR to QoQ percentage growth across top 10 territories.",
          },
          {
            word: "clean up the anomalies",
            category: "Pragmatic",
            divergenceReason:
              "Actively deletes/excludes duplicate & QA rows from the operational dataset.",
          },
          {
            word: "them",
            category: "Referential",
            divergenceReason:
              "Interpreted as publishing the refreshed Looker BI view to Revenue Ops.",
          },
        ],
        consequences: [
          {
            label: "Cleaner Operational Dashboards",
            severity: "Positive",
            detail: "Removes bot/QA noise so RevOps conversion funnels stay accurate.",
          },
          {
            label: "Compliance Discrepancy Risk",
            severity: "Risk",
            detail:
              "Deleting rows without finance sign-off can misalign BI vs. GAAP ledger totals.",
          },
          {
            label: "Warehouse Sync Latency",
            severity: "Neutral",
            detail: "Requires incremental DBT/Looker refresh after exclusion rules.",
          },
        ],
      },
      {
        id: "interp-regional-raw",
        title: "Raw Regional Export for Finance Audit",
        summary:
          "Extract all regional rows from fiscal Q3 with anomaly flags attached for manual finance sign-off.",
        probability: 13,
        impactScope: "Finance Review Queue",
        riskLevel: "Low",
        assumptions: ["Finance team prefers raw flagged rows"],
        recommendedAction: "Verify audience and output format.",
        simulatedIntent: {
          action: "Export raw fiscal ledger rows with flags",
          entities: ["All Geo Regions", "Fiscal Q3 Ledger"],
          recipient: "Finance & Compliance Team",
          object: "Unmodified Regional Audit CSV",
          date: "Corporate Fiscal Q3",
          resolvedDirective:
            "Extract all regional ledger rows for Corporate Fiscal Q3 with anomaly flags attached and route to Finance Review Queue for manual sign-off.",
        },
        triggerWords: [
          {
            word: "last quarter",
            category: "Temporal",
            divergenceReason:
              "Shifted boundary from calendar quarter to Corporate Fiscal Q3 ledger dates.",
          },
          {
            word: "clean up the anomalies",
            category: "Pragmatic",
            divergenceReason:
              "Attaches passive diagnostic flags without modifying or filtering any rows.",
          },
        ],
        consequences: [
          {
            label: "Zero Data Loss",
            severity: "Positive",
            detail: "Every raw transaction remains intact for external audit inspection.",
          },
          {
            label: "Manual Review Overhead",
            severity: "Risk",
            detail: "Finance must inspect flagged anomalies manually before executive sharing.",
          },
          {
            label: "Fiscal Boundary Shift",
            severity: "Neutral",
            detail: "Fiscal Q3 boundary shifts date range relative to standard calendar view.",
          },
        ],
      },
    ];

    const clarificationQuestions: ClarificationQuestion[] = [
      {
        id: "cq-anomaly",
        targetSpanId: "span-anomalies",
        targetToken: "clean up the anomalies",
        category: "Pragmatic",
        importanceScore: 94,
        essentialField: "Safety & Guardrails",
        isEssential: true,
        estimatedClarityGain: 29,
        question: "How should detected anomalies be handled?",
        rationale: "Deleting records silently can create compliance discrepancies.",
        necessityReason:
          "Mutating vs. flagging revenue outliers directly changes board-level KPI totals and audit trails.",
        selectionExplanation:
          "Ranked #1 (94/100 importance) because data hygiene policy poses the highest integrity risk and secures the Safety & Guardrails field.",
        options: [
          {
            id: "opt-flag",
            label: "Flag & Annotate Only",
            description: "Keep values intact and attach an audit footnote.",
            resolvesTo: "flagging statistical outliers (>3σ) in an audit footnote",
          },
          {
            id: "opt-bots",
            label: "Exclude Verified Test Accounts",
            description: "Remove internal QA/test rows while retaining real spikes.",
            resolvesTo: "excluding verified internal test accounts only",
          },
        ],
      },
      {
        id: "cq-kpi",
        targetSpanId: "span-top",
        targetToken: "top performing",
        category: "Lexical",
        importanceScore: 88,
        essentialField: "Action Scope",
        isEssential: true,
        estimatedClarityGain: 25,
        dependentSpanIds: ["span-quarter"],
        question: 'Which metric and cutoff define "top performing regions"?',
        rationale: "Revenue leaders and growth leaders frequently differ.",
        necessityReason:
          "Ranking by recognized ARR vs. percentage growth yields completely different regional winners.",
        selectionExplanation:
          "Prioritized (88/100 importance) to establish the core Action Scope KPI and top-N selection cutoff.",
        options: [
          {
            id: "opt-arr",
            label: "Top 5 by Net Revenue",
            description: "Rank regions by recognized net revenue.",
            resolvesTo: "top 5 regions ranked by recognized net revenue",
          },
          {
            id: "opt-growth",
            label: "Top 5 by QoQ Growth %",
            description: "Rank by percentage growth over prior quarter.",
            resolvesTo: "top 5 regions ranked by QoQ percentage growth",
          },
        ],
      },
      {
        id: "cq-share",
        targetSpanId: "span-them",
        targetToken: "them",
        category: "Referential",
        importanceScore: 81,
        essentialField: "Output Deliverable",
        isEssential: true,
        estimatedClarityGain: 21,
        question: "What deliverable should be shared, and with whom?",
        rationale: "Clarifies both the artifact type and distribution scope.",
        necessityReason:
          "Prevents publishing raw internal anomaly tables to external or executive channels by mistake.",
        selectionExplanation:
          "Selected (81/100 importance) because Output Deliverable is an essential intent field before generating the report.",
        options: [
          {
            id: "opt-deck",
            label: "Executive Summary + CSV to Leadership",
            description: "Share curated summary metrics and regional table.",
            resolvesTo: "exporting an executive summary table for leadership review",
          },
          {
            id: "opt-slack",
            label: "BI Dashboard Link to #rev-ops",
            description: "Publish interactive view for Revenue Ops.",
            resolvesTo: "publishing the verified BI view to Revenue Operations",
          },
        ],
      },
      {
        id: "cq-quarter",
        targetSpanId: "span-quarter",
        targetToken: "last quarter",
        category: "Temporal",
        importanceScore: 58,
        essentialField: "Execution Timing",
        isEssential: false,
        estimatedClarityGain: 9,
        question: 'Should "last quarter" use calendar or fiscal quarter dates?',
        rationale: "Calendar vs. fiscal calendars may shift dates by 30 days.",
        necessityReason:
          "Optional alignment check when fiscal ledger differs from standard calendar quarters.",
        selectionExplanation:
          "Lower priority (58/100) because the reporting domain defaults to standard quarterly ledger boundaries once KPI is chosen.",
        options: [
          {
            id: "opt-cal-q",
            label: "Calendar Quarter (Jul 1 – Sep 30)",
            description: "Use standard calendar quarter bounds.",
            resolvesTo: "using standard calendar quarter boundaries",
          },
          {
            id: "opt-fiscal-q",
            label: "Fiscal Quarter per Finance Ledger",
            description: "Align with corporate fiscal calendar.",
            resolvesTo: "using corporate fiscal quarter boundaries",
          },
        ],
      },
    ];

    const defaultResolution = computeResolutionFromInputs(
      prompt,
      spans,
      interpretations[0] ?? null,
      [
        {
          questionId: "cq-anomaly",
          selectedOptionId: "opt-flag",
          customAnswer: "",
          resolvedValue: clarificationQuestions[0]!.options[0]!.resolvesTo,
        },
        {
          questionId: "cq-kpi",
          selectedOptionId: "opt-arr",
          customAnswer: "",
          resolvedValue: clarificationQuestions[1]!.options[0]!.resolvesTo,
        },
        {
          questionId: "cq-share",
          selectedOptionId: "opt-deck",
          customAnswer: "",
          resolvedValue: clarificationQuestions[2]!.options[0]!.resolvesTo,
        },
      ],
      "Data & Analytics",
      clarificationQuestions,
    );

    const ambiguityScore = strictness === "Strict" ? 84 : 79;

    return {
      id: "analysis-ex-analytics",
      prompt,
      domain: "Data & Analytics",
      strictness,
      createdAt: now,
      isDemoData: true,
      ambiguityScore,
      clarityScore: 100 - ambiguityScore,
      riskLevel: deriveRiskLevel(ambiguityScore),
      summary:
        "Identified 4 critical ambiguity points around KPI selection, quarter boundaries, data hygiene policy, and target artifact.",
      multilingual: detectLanguageMetadata(prompt, requestedLanguage),
      spans,
      categoryBreakdown: buildCategoryBreakdown(spans),
      interpretations,
      clarificationQuestions,
      defaultResolution,
    };
  }

  // Example 3: Enterprise Support
  const prompt = EXAMPLE_PROMPTS[2]!.prompt;
  const spans = [
    locateSpan(
      prompt,
      "Restrict access",
      "span-restrict",
      "Scope",
      85,
      0.93,
      '"Restrict access" could mean temporary suspension, read-only downgrade, or permanent token revocation.',
      ["Downgrade to read-only", "Require SSO re-authentication", "Suspend account"],
    ),
    locateSpan(
      prompt,
      "inactive accounts",
      "span-inactive",
      "Temporal",
      90,
      0.96,
      "Inactivity threshold is undefined (30, 60, or 90 days) and omits service/API accounts.",
      ["Human accounts inactive > 90 days", "All accounts inactive > 30 days"],
    ),
    locateSpan(
      prompt,
      "the team",
      "span-team",
      "Referential",
      77,
      0.87,
      '"The team" does not identify Security Ops, Account Owners, or Workspace Admins.',
      ["SecOps on-call channel", "Workspace Administrators"],
    ),
    locateSpan(
      prompt,
      "anything looks unusual",
      "span-unusual",
      "Pragmatic",
      91,
      0.95,
      "Subjective anomaly phrase lacks concrete security triggers (failed logins, impossible travel, bulk export).",
      [
        "Failed login burst (>10 in 5m)",
        "Off-hours privilege escalation",
        "Unrecognized ASN / geo login",
      ],
    ),
  ].filter((s): s is AmbiguitySpan => s !== null);

  const interpretations: Interpretation[] = [
    {
      id: "interp-sec-graceful",
      title: "90-Day Inactivity Lock + SecOps Anomaly Alerting",
      summary:
        "Require SSO re-verification for human accounts inactive >90 days (excluding API service tokens) and alert Security Ops on impossible-travel or brute-force events.",
      probability: 61,
      impactScope: "Identity & Access Governance",
      riskLevel: "Critical",
      assumptions: [
        "Service accounts must not be auto-locked",
        "Reversible suspension is safer than deletion",
      ],
      recommendedAction:
        "Confirm inactivity day threshold and explicit anomaly rules before enforcing IAM changes.",
      simulatedIntent: {
        action: "Suspend sessions & enforce SSO re-auth + real-time SecOps alert",
        entities: ["Human User Accounts", "API Service Tokens (Excluded)"],
        recipient: "Security Operations (#secops-alerts)",
        object: "Dormant SSO Sessions & Anomaly Stream",
        date: "90+ days inactivity cutoff",
        resolvedDirective:
          "Temporarily suspend human accounts inactive >90 days (excluding service tokens) until SSO re-auth, and alert #secops-alerts on >10 failed logins or geo anomalies.",
      },
      triggerWords: [
        {
          word: "inactive accounts",
          category: "Temporal",
          divergenceReason:
            "Set to 90+ days dormancy for human accounts while excluding CI/API service tokens.",
        },
        {
          word: "Restrict access",
          category: "Scope",
          divergenceReason:
            "Enforced as reversible session suspension requiring SSO re-verification.",
        },
        {
          word: "anything looks unusual",
          category: "Pragmatic",
          divergenceReason:
            "Concretized into failed login bursts, new-country sign-ins, and RBAC escalations.",
        },
      ],
      consequences: [
        {
          label: "Protects Production Pipelines",
          severity: "Positive",
          detail:
            "Excluding API service tokens prevents breaking CI/CD and automated integrations.",
        },
        {
          label: "User Re-Authentication Friction",
          severity: "Risk",
          detail: "Returning employees inactive >90 days must re-verify via corporate SSO.",
        },
        {
          label: "Real-Time SecOps Paging",
          severity: "Neutral",
          detail: "Simulated policy preview — no IAM tokens are revoked.",
        },
      ],
    },
    {
      id: "interp-sec-readonly",
      title: "30-Day Read-Only Downgrade + Admin Digest",
      summary:
        "Downgrade accounts dormant for 30 days to viewer-only permissions and send a daily digest to workspace admins.",
      probability: 27,
      impactScope: "Workspace RBAC Policy",
      riskLevel: "High",
      assumptions: ["Users still need passive dashboard visibility"],
      recommendedAction: "Confirm whether read-only preserves operational needs.",
      simulatedIntent: {
        action: "Downgrade RBAC role to read-only viewer + daily digest",
        entities: ["Standard Non-Admin Accounts", "Workspace RBAC Matrix"],
        recipient: "Workspace Administrators",
        object: "Write/Admin Permissions + Daily Digest",
        date: "30+ days inactivity cutoff (daily 09:00 digest)",
        resolvedDirective:
          "Downgrade standard accounts inactive >30 days to read-only viewer role and email Workspace Admins a daily digest of dormant reactivations.",
      },
      triggerWords: [
        {
          word: "inactive accounts",
          category: "Temporal",
          divergenceReason:
            "Tightened dormancy threshold to 30+ days across standard workspace seats.",
        },
        {
          word: "Restrict access",
          category: "Scope",
          divergenceReason:
            "Downgrades write/admin roles to viewer-only instead of suspending login access.",
        },
        {
          word: "the team",
          category: "Referential",
          divergenceReason:
            "Routed notifications to Workspace Administrators rather than Security Ops.",
        },
      ],
      consequences: [
        {
          label: "Passive Visibility Preserved",
          severity: "Positive",
          detail: "Occasional stakeholders can still view dashboards without IT tickets.",
        },
        {
          label: "Aggressive 30-Day Cutoff",
          severity: "Risk",
          detail: "Monthly/quarterly reviewers could unexpectedly lose edit privileges.",
        },
        {
          label: "Low Alert Noise",
          severity: "Neutral",
          detail: "Batches anomalies into one daily digest instead of real-time alerts.",
        },
      ],
    },
    {
      id: "interp-sec-audit",
      title: "Dry-Run Audit Report Before Enforcement",
      summary:
        "Generate a dry-run list of dormant accounts and anomalous login patterns for manual review prior to restricting access.",
      probability: 12,
      impactScope: "Compliance Audit Log",
      riskLevel: "Low",
      assumptions: ["Policy requires human approval prior to lockout"],
      recommendedAction: "Choose between dry-run preview vs. automated enforcement.",
      simulatedIntent: {
        action: "Generate dry-run compliance audit (no lockouts)",
        entities: ["All Candidate Accounts", "Auth Audit Log"],
        recipient: "Compliance & Security Reviewers",
        object: "Read-Only Access Review Report",
        date: "Immediate snapshot + manual approval gate",
        resolvedDirective:
          "Produce a non-destructive audit report listing dormant accounts (30d/90d cohorts) and unusual login spikes for manual reviewer sign-off before enforcement.",
      },
      triggerWords: [
        {
          word: "Restrict access",
          category: "Scope",
          divergenceReason: "Deferred enforcement behind a manual compliance sign-off gate.",
        },
        {
          word: "anything looks unusual",
          category: "Pragmatic",
          divergenceReason:
            "Aggregates anomaly candidates into a review table rather than paging on-call.",
        },
      ],
      consequences: [
        {
          label: "Zero Accidental Lockouts",
          severity: "Positive",
          detail: "Human reviewers validate every affected user and token before enforcement.",
        },
        {
          label: "Delayed Threat Containment",
          severity: "Risk",
          detail: "Dormant accounts retain active permissions until manual review completes.",
        },
        {
          label: "Compliance Evidence Ready",
          severity: "Neutral",
          detail: "Produces auditable snapshot export for SOC2/ISO reviews.",
        },
      ],
    },
  ];

  const clarificationQuestions: ClarificationQuestion[] = [
    {
      id: "cq-anomaly-def",
      targetSpanId: "span-unusual",
      targetToken: "anything looks unusual",
      category: "Pragmatic",
      importanceScore: 96,
      essentialField: "Safety & Guardrails",
      isEssential: true,
      estimatedClarityGain: 28,
      dependentSpanIds: ["span-team"],
      question: 'Which signals constitute "unusual" activity for alerting?',
      rationale: "Explicit triggers eliminate alert fatigue for the receiving team.",
      necessityReason:
        "Subjective threat criteria cannot be compiled into deterministic SIEM/alerting rules without false positives.",
      selectionExplanation:
        'Ranked #1 (96/100 importance) because defining anomaly triggers has the highest security sensitivity and narrows who "the team" should be.',
      options: [
        {
          id: "opt-secops-signals",
          label: "Geo Anomaly / >10 Failed Logins / Role Change",
          description: "Notify #secops-alerts in real time.",
          resolvesTo:
            "notifying Security Ops on >10 failed logins, new-country sign-ins, or RBAC escalations",
        },
        {
          id: "opt-admin-digest",
          label: "Daily Digest of Dormant Reactivations",
          description: "Notify Workspace Admins once daily.",
          resolvesTo: "sending Workspace Admins a daily digest of dormant account reactivations",
        },
      ],
    },
    {
      id: "cq-inactivity-days",
      targetSpanId: "span-inactive",
      targetToken: "inactive accounts",
      category: "Temporal",
      importanceScore: 92,
      essentialField: "Target Entity",
      isEssential: true,
      estimatedClarityGain: 26,
      question: "What inactivity window and account types should be targeted?",
      rationale:
        "Locking service accounts or using a short window can break production integrations.",
      necessityReason:
        "Excluding CI/API service tokens and fixing the dormancy cutoff prevents accidental production outages.",
      selectionExplanation:
        "Prioritized (92/100 importance) because Target Entity & dormancy threshold directly govern which accounts get locked.",
      options: [
        {
          id: "opt-90d-human",
          label: "90+ Days (Human Users Only)",
          description: "Exclude automated CI/API service accounts.",
          resolvesTo:
            "human user accounts with zero login activity for 90+ days (excluding service tokens)",
        },
        {
          id: "opt-30d-all",
          label: "30+ Days (All Non-Admin Users)",
          description: "Stricter hygiene policy for standard seats.",
          resolvesTo: "standard accounts inactive for 30+ days",
        },
      ],
    },
    {
      id: "cq-restriction-mode",
      targetSpanId: "span-restrict",
      targetToken: "Restrict access",
      category: "Scope",
      importanceScore: 87,
      essentialField: "Action Scope",
      isEssential: true,
      estimatedClarityGain: 22,
      question: 'What enforcement level should "Restrict access" apply?',
      rationale: "Reversible restrictions prevent irreversible user lockout.",
      necessityReason:
        "Choosing between read-only downgrade and temporary session suspension determines recovery overhead.",
      selectionExplanation:
        "Selected (87/100 importance) to finalize the essential Action Scope enforcement level.",
      options: [
        {
          id: "opt-suspend",
          label: "Temporary Suspend + Email Reactivation",
          description: "Revoke active sessions until SSO re-auth.",
          resolvesTo: "temporarily suspend sessions and require SSO re-authentication",
        },
        {
          id: "opt-readonly",
          label: "Downgrade to Read-Only",
          description: "Remove write/admin capabilities only.",
          resolvesTo: "downgrade permissions to read-only viewer role",
        },
      ],
    },
    {
      id: "cq-team-target",
      targetSpanId: "span-team",
      targetToken: "the team",
      category: "Referential",
      importanceScore: 56,
      essentialField: "Output Deliverable",
      isEssential: false,
      estimatedClarityGain: 8,
      question: "Which team channel should receive escalation notifications?",
      rationale: "Confirms exact Slack/PagerDuty routing target.",
      necessityReason:
        "Optional routing confirmation once the anomaly trigger level already implies SecOps vs. Workspace Admins.",
      selectionExplanation:
        "Lower priority (56/100) because the chosen anomaly trigger already identifies the owning team.",
      options: [
        {
          id: "opt-secops-ch",
          label: "Security Operations (#secops-alerts)",
          description: "Route directly to SecOps on-call.",
          resolvesTo: "routing alerts to #secops-alerts",
        },
        {
          id: "opt-admins-ch",
          label: "Workspace Administrators",
          description: "Route to organization owners.",
          resolvesTo: "routing alerts to Workspace Administrators",
        },
      ],
    },
  ];

  const defaultResolution = computeResolutionFromInputs(
    prompt,
    spans,
    interpretations[0] ?? null,
    [
      {
        questionId: "cq-anomaly-def",
        selectedOptionId: "opt-secops-signals",
        customAnswer: "",
        resolvedValue: clarificationQuestions[0]!.options[0]!.resolvesTo,
      },
      {
        questionId: "cq-inactivity-days",
        selectedOptionId: "opt-90d-human",
        customAnswer: "",
        resolvedValue: clarificationQuestions[1]!.options[0]!.resolvesTo,
      },
      {
        questionId: "cq-restriction-mode",
        selectedOptionId: "opt-suspend",
        customAnswer: "",
        resolvedValue: clarificationQuestions[2]!.options[0]!.resolvesTo,
      },
    ],
    "Enterprise Support",
    clarificationQuestions,
  );

  const ambiguityScore = strictness === "Strict" ? 92 : 88;

  return {
    id: "analysis-ex-support",
    prompt,
    domain: "Enterprise Support",
    strictness,
    createdAt: now,
    isDemoData: true,
    ambiguityScore,
    clarityScore: 100 - ambiguityScore,
    riskLevel: deriveRiskLevel(ambiguityScore),
    summary:
      "Detected 4 critical access-governance ambiguities covering lock severity, inactivity thresholds, and security alert criteria.",
    multilingual: detectLanguageMetadata(prompt, requestedLanguage),
    spans,
    categoryBreakdown: buildCategoryBreakdown(spans),
    interpretations,
    clarificationQuestions,
    defaultResolution,
  };
}

interface HeuristicRule {
  pattern: RegExp;
  category: AmbiguityCategory;
  severity: number;
  reason: string;
  meanings: string[];
}

const HEURISTIC_RULES: HeuristicRule[] = [
  {
    pattern: /\b(it|they|them|this|that|those|these)\b/gi,
    category: "Referential",
    severity: 76,
    reason: "Anaphoric pronoun lacks a single unambiguous antecedent.",
    meanings: ["Primary target entity", "Previous clause output", "Full active scope"],
  },
  {
    pattern: /\b(soon|later|asap|recently|recent|quickly|fast|next week|early)\b/gi,
    category: "Temporal",
    severity: 83,
    reason: "Relative or open-ended time expression has no concrete timestamp or SLA.",
    meanings: ["Immediate execution", "Scheduled off-peak window", "Specific SLA deadline"],
  },
  {
    pattern: /\b(optimize|improve|fix|update|clean up|clean|enhance|better|handle|restrict)\b/gi,
    category: "Lexical",
    severity: 80,
    reason: "Underspecified action verb permits multiple operational strategies.",
    meanings: ["Minimal safe patch", "Full refactor / policy change", "Dry-run audit first"],
  },
  {
    pattern: /\b(all|every|users|data|system|everything|anything|unusual|some|many|top)\b/gi,
    category: "Scope",
    severity: 84,
    reason: "Broad quantifier or boundary term omits inclusion/exclusion filters.",
    meanings: ["Filtered subset only", "Production-wide scope", "Bounded top-N threshold"],
  },
  {
    pattern: /\b(should|maybe|probably|if possible|properly|appropriately|safely)\b/gi,
    category: "Pragmatic",
    severity: 78,
    reason: "Soft modal or subjective qualifier leaves acceptance criteria undefined.",
    meanings: ["Mandatory hard constraint", "Best-effort fallback", "Automated guardrail"],
  },
];

const CATEGORY_FIELD_MAP: Record<AmbiguityCategory, EssentialIntentField> = {
  Scope: "Safety & Guardrails",
  Pragmatic: "Safety & Guardrails",
  Temporal: "Execution Timing",
  Lexical: "Action Scope",
  Syntactic: "Action Scope",
  Referential: "Target Entity",
};

const CATEGORY_PRIORITY_BONUS: Record<AmbiguityCategory, number> = {
  Pragmatic: 10,
  Scope: 9,
  Temporal: 8,
  Lexical: 6,
  Syntactic: 4,
  Referential: 0,
};

export function analyzeCustomPromptMock(
  promptText: string,
  domain: DomainContext,
  strictness: StrictnessLevel,
  maxQuestions = 3,
  requestedLanguage: LanguageOption = "Auto Detect",
): AnalysisResult {
  const trimmed = promptText.trim();

  // Match exact English preset if user clicked or pasted an example prompt
  const matchedPreset = EXAMPLE_PROMPTS.find(
    (ex) => ex.prompt.toLowerCase() === trimmed.toLowerCase(),
  );
  if (matchedPreset) {
    return buildPresetAnalysis(matchedPreset.id, strictness, requestedLanguage);
  }

  const multilingual = detectLanguageMetadata(trimmed, requestedLanguage);
  const uiLanguage = resolveUiLanguage(requestedLanguage, multilingual.detectedLanguage);

  const detectedSpans: AmbiguitySpan[] = [];
  const occupiedRanges: Array<[number, number]> = [];

  // 1. Language-aware multilingual token scan (Unicode-safe boundaries)
  const isBoundaryChar = (ch: string | undefined) => !ch || /[\s,.;:!?()[\]{}"'“”‘’।]/.test(ch);

  for (const mlToken of MULTILINGUAL_AMBIGUOUS_TOKENS) {
    const lowerPrompt = trimmed.toLowerCase();
    const lowerToken = mlToken.token.toLowerCase();
    let searchFrom = 0;
    let idx = lowerPrompt.indexOf(lowerToken, searchFrom);
    while (idx !== -1) {
      const end = idx + mlToken.token.length;
      const validBoundary = isBoundaryChar(trimmed[idx - 1]) && isBoundaryChar(trimmed[end]);
      const overlaps = occupiedRanges.some(([s, e]) => !(end <= s || idx >= e));
      if (validBoundary && !overlaps && detectedSpans.length < 6) {
        occupiedRanges.push([idx, end]);
        const strictBoost = strictness === "Strict" ? 6 : strictness === "Exploratory" ? -4 : 0;
        const severity = Math.min(96, Math.max(45, mlToken.severity + strictBoost));
        detectedSpans.push({
          id: `span-${detectedSpans.length + 1}`,
          token: trimmed.slice(idx, end),
          startIndex: idx,
          endIndex: end,
          category: mlToken.category,
          severity,
          confidence: Number((0.86 + (detectedSpans.length % 3) * 0.03).toFixed(2)),
          reason:
            mlToken.reasonByLang[uiLanguage] ??
            mlToken.reasonByLang[multilingual.detectedLanguage] ??
            mlToken.defaultReason,
          candidateMeanings: mlToken.meanings,
        });
      }
      searchFrom = end;
      idx = lowerPrompt.indexOf(lowerToken, searchFrom);
    }
  }

  // 2. Standard Latin/English heuristic scan
  for (const rule of HEURISTIC_RULES) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match: RegExpExecArray | null = regex.exec(trimmed);
    while (match !== null) {
      const start = match.index;
      const end = start + match[0].length;
      const overlaps = occupiedRanges.some(([s, e]) => !(end <= s || start >= e));
      if (!overlaps && detectedSpans.length < 6) {
        occupiedRanges.push([start, end]);
        const strictBoost = strictness === "Strict" ? 6 : strictness === "Exploratory" ? -4 : 0;
        const severity = Math.min(96, Math.max(45, rule.severity + strictBoost));
        detectedSpans.push({
          id: `span-${detectedSpans.length + 1}`,
          token: match[0],
          startIndex: start,
          endIndex: end,
          category: rule.category,
          severity,
          confidence: Number((0.82 + (detectedSpans.length % 4) * 0.03).toFixed(2)),
          reason: rule.reason,
          candidateMeanings: rule.meanings,
        });
      }
      match = regex.exec(trimmed);
    }
  }

  // If this matches a multilingual deploy/analytics sample case, inherit its rich scenarios & localized question IDs while preserving the original script & spans!
  const matchedMlSample = MULTILINGUAL_SAMPLE_CASES.find(
    (s) => s.prompt.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (matchedMlSample) {
    const basePresetId =
      matchedMlSample.id === "ml-hindi-analytics" ? "ex-analytics-report" : "ex-deploy-fast";
    const basePreset = buildPresetAnalysis(basePresetId, strictness, requestedLanguage);
    const sortedSpans = [...detectedSpans].sort((a, b) => a.startIndex - b.startIndex);
    const finalSpans = sortedSpans.length > 0 ? sortedSpans : basePreset.spans;

    // Map preset questions onto the detected multilingual spans cleanly
    const mappedQuestions = basePreset.clarificationQuestions.map((q) => {
      const matchingSpan = finalSpans.find((s) => s.category === q.category) ?? finalSpans[0];
      return matchingSpan
        ? {
            ...q,
            targetSpanId: matchingSpan.id,
            targetToken: matchingSpan.token,
          }
        : q;
    });

    return {
      ...basePreset,
      id: `analysis-${matchedMlSample.id}`,
      prompt: trimmed,
      domain: matchedMlSample.domain,
      multilingual,
      spans: finalSpans,
      categoryBreakdown: buildCategoryBreakdown(finalSpans),
      clarificationQuestions: mappedQuestions,
      summary: `Detected ${finalSpans.length} language-aware ambiguity span${
        finalSpans.length === 1 ? "" : "s"
      } in ${multilingual.detectedLanguage}${
        multilingual.isCodeMixed ? " (code-mixed)" : ""
      } input while preserving original script.`,
      defaultResolution: {
        ...basePreset.defaultResolution,
        originalPrompt: trimmed,
      },
    };
  }

  // Ensure every non-empty prompt produces meaningful demonstration spans
  if (detectedSpans.length === 0) {
    const words = trimmed.split(/\s+/).filter(Boolean);
    const firstWord = words[0] ?? trimmed;
    const lastWord = words[words.length - 1] ?? trimmed;
    const firstSpan = locateSpan(
      trimmed,
      firstWord,
      "span-1",
      "Lexical",
      62,
      0.84,
      `Action phrase "${firstWord}" can be executed with multiple output formats and validation depths.`,
      ["Strict deterministic execution", "Exploratory draft preview"],
    );
    if (firstSpan) detectedSpans.push(firstSpan);

    if (words.length > 2 && lastWord !== firstWord) {
      const lastSpan = locateSpan(
        trimmed,
        lastWord,
        "span-2",
        "Scope",
        58,
        0.81,
        `Target boundary "${lastWord}" lacks explicit constraints, acceptance metrics, and edge-case rules.`,
        ["Scoped to primary context", "Include downstream dependencies"],
        firstSpan ? firstSpan.endIndex : 0,
      );
      if (lastSpan) detectedSpans.push(lastSpan);
    }
  }

  detectedSpans.sort((a, b) => a.startIndex - b.startIndex);

  const avgSeverity = detectedSpans.reduce((sum, s) => sum + s.severity, 0) / detectedSpans.length;
  const ambiguityScore = Math.min(
    95,
    Math.max(38, Math.round(avgSeverity * 0.92 + detectedSpans.length * 2.5)),
  );

  const primaryToken = detectedSpans[0]?.token ?? "instruction";
  const secondaryToken = detectedSpans[1]?.token ?? primaryToken;

  const interpretations: Interpretation[] = [
    {
      id: "interp-primary-scoped",
      title: `Scoped ${domain} Execution (Conservative Guardrails)`,
      summary: `Execute the request within bounded ${domain} parameters, applying explicit constraints and non-destructive validation checks before committing changes.`,
      probability: 56,
      impactScope: `${domain} Primary Scope`,
      riskLevel: ambiguityScore >= 75 ? "High" : "Moderate",
      assumptions: [
        "Reversible / auditable actions are preferred",
        "Target entities are restricted to the active workspace",
      ],
      recommendedAction:
        "Confirm ambiguous boundaries and timing constraints before automated execution.",
      simulatedIntent: {
        action: `Scoped ${domain} update with rollback guardrails`,
        entities: [`${domain} Primary Resource`, "Audit Checkpoint"],
        recipient: `${domain} Team Owners`,
        object: `Filtered subset linked to "${primaryToken}"`,
        date: "Next validated maintenance window",
        resolvedDirective: `Execute "${trimmed}" strictly within ${domain} primary scope with validation checks and reversible audit logging.`,
      },
      triggerWords: detectedSpans.slice(0, 3).map((span) => ({
        word: span.token,
        category: span.category,
        divergenceReason: `Bounded "${span.token}" to conservative ${domain} defaults (${span.candidateMeanings[0] ?? "safe scope"}).`,
      })),
      consequences: [
        {
          label: "Safe Blast Radius",
          severity: "Positive",
          detail: `Restricts changes to primary ${domain} entities with rollback support.`,
        },
        {
          label: "Scope Exclusion Risk",
          severity: "Risk",
          detail: "Downstream coupled services may remain unmodified unless added.",
        },
        {
          label: "Simulated Preview Only",
          severity: "Neutral",
          detail: "No external commands or database mutations are executed.",
        },
      ],
    },
    {
      id: "interp-broad-automated",
      title: `Broad Automated Execution Across All Matching Targets`,
      summary: `Apply the instruction broadly across all inferred targets with immediate execution and standard logging.`,
      probability: 29,
      impactScope: "Full Environment / Multi-Entity",
      riskLevel: "Critical",
      assumptions: [
        "No manual approval gate is required",
        "All downstream dependencies share the same schema/policy",
      ],
      recommendedAction: "Verify scope boundaries carefully to avoid unintended side effects.",
      simulatedIntent: {
        action: "Full automated execution across all targets",
        entities: ["All Matching Entities", "Downstream Dependencies"],
        recipient: "All Active Stakeholders & Systems",
        object: `Unfiltered full dataset/stack ("${secondaryToken}")`,
        date: "Immediate execution (zero wait gate)",
        resolvedDirective: `Execute "${trimmed}" immediately across all matching ${domain} environments and downstream dependencies.`,
      },
      triggerWords: detectedSpans.slice(0, 3).map((span) => ({
        word: span.token,
        category: span.category,
        divergenceReason: `Expanded "${span.token}" to broadest interpretation (${span.candidateMeanings[1] ?? "full environment"}).`,
      })),
      consequences: [
        {
          label: "Maximum Speed & Coverage",
          severity: "Positive",
          detail: "Updates every matching target in a single pass.",
        },
        {
          label: "High Unintended Impact Risk",
          severity: "Risk",
          detail: "Broad execution without filters can disrupt production dependencies.",
        },
        {
          label: "Automated Audit Stream",
          severity: "Neutral",
          detail: "Simulated execution path only — no external actions run.",
        },
      ],
    },
    {
      id: "interp-dry-run",
      title: "Dry-Run Plan & Verification Preview",
      summary:
        "Generate an inspection plan and preview diff without mutating live state until stakeholders approve.",
      probability: 15,
      impactScope: "Read-Only Preview",
      riskLevel: "Low",
      assumptions: ["Stakeholder review precedes execution"],
      recommendedAction: "Ideal when ambiguity risk exceeds your threshold.",
      simulatedIntent: {
        action: "Generate non-destructive dry-run diff",
        entities: ["Read-Only Snapshot", "Approval Queue"],
        recipient: "Approving Reviewer / Requester",
        object: "Simulation Plan & Impact Diff",
        date: "Immediate preview + manual sign-off",
        resolvedDirective: `Generate a read-only dry-run plan for "${trimmed}" and await stakeholder sign-off before mutating state.`,
      },
      triggerWords: detectedSpans.slice(0, 2).map((span) => ({
        word: span.token,
        category: span.category,
        divergenceReason: `Deferred live mutation for "${span.token}" until human review confirms intent.`,
      })),
      consequences: [
        {
          label: "Zero State Mutation",
          severity: "Positive",
          detail: "Eliminates accidental changes prior to review.",
        },
        {
          label: "Manual Approval Delay",
          severity: "Risk",
          detail: "Requires follow-up confirmation before real execution begins.",
        },
        {
          label: "Review Artifact Created",
          severity: "Neutral",
          detail: "Produces structured diff for stakeholder alignment.",
        },
      ],
    },
  ];

  const rankedSpans = [...detectedSpans].sort((a, b) => {
    const scoreA = a.severity + CATEGORY_PRIORITY_BONUS[a.category];
    const scoreB = b.severity + CATEGORY_PRIORITY_BONUS[b.category];
    return scoreB - scoreA;
  });

  const seenFields = new Set<EssentialIntentField>();
  const clarificationQuestions: ClarificationQuestion[] = rankedSpans
    .slice(0, Math.max(2, Math.min(6, maxQuestions + 1)))
    .map((span, idx) => {
      const essentialField = CATEGORY_FIELD_MAP[span.category];
      const isFirstForField = !seenFields.has(essentialField);
      seenFields.add(essentialField);
      const isEssential = isFirstForField && idx < 3;
      const importanceScore = Math.min(
        98,
        Math.max(
          52,
          Math.round(
            span.severity * 0.85 + CATEGORY_PRIORITY_BONUS[span.category] + (isEssential ? 8 : -8),
          ),
        ),
      );
      const estimatedClarityGain = Math.max(8, Math.round(importanceScore * 0.28));
      const referentialDependents =
        span.category === "Lexical" || span.category === "Scope"
          ? detectedSpans
              .filter((other) => other.id !== span.id && other.category === "Referential")
              .map((other) => other.id)
          : undefined;

      return {
        id: `cq-custom-${idx + 1}`,
        targetSpanId: span.id,
        targetToken: span.token,
        category: span.category,
        importanceScore,
        essentialField,
        isEssential,
        estimatedClarityGain,
        dependentSpanIds:
          referentialDependents && referentialDependents.length > 0
            ? referentialDependents
            : undefined,
        question: `What specific meaning should "${span.token}" resolve to in this ${domain} request?`,
        rationale: span.reason,
        necessityReason: `Leaving "${span.token}" (${span.category}) unresolved risks executing the wrong ${essentialField.toLowerCase()} in ${domain}.`,
        selectionExplanation: isEssential
          ? `Ranked #${idx + 1} (${importanceScore}/100 importance) because it resolves the essential ${essentialField} field (+${estimatedClarityGain}% estimated clarity).`
          : `Lower priority (${importanceScore}/100) optional refinement for "${span.token}" once core ${essentialField} constraints are set.`,
        options: span.candidateMeanings.map((meaning, optIdx) => ({
          id: `opt-${idx + 1}-${optIdx + 1}`,
          label: meaning,
          description: `Resolve "${span.token}" (${span.category}) to: ${meaning}.`,
          resolvesTo: `${meaning.toLowerCase()} (verified constraint)`,
        })),
      };
    });

  const defaultAnswers: ClarificationAnswer[] = clarificationQuestions
    .filter((q) => q.isEssential)
    .map((q, idx) => ({
      questionId: q.id,
      selectedOptionId: q.options[0]?.id ?? null,
      customAnswer: "",
      resolvedValue: q.options[0]?.resolvesTo ?? "",
      turnNumber: idx + 1,
      targetToken: q.targetToken,
      essentialField: q.essentialField,
      selectionExplanation: q.selectionExplanation,
      ambiguityReduction: q.estimatedClarityGain,
      source: "option",
    }));

  const defaultResolution = computeResolutionFromInputs(
    trimmed,
    detectedSpans,
    interpretations[0] ?? null,
    defaultAnswers,
    domain,
    clarificationQuestions,
  );

  return {
    id: `analysis-${Date.now()}`,
    prompt: trimmed,
    domain,
    strictness,
    createdAt: new Date().toISOString(),
    isDemoData: true,
    ambiguityScore,
    clarityScore: 100 - ambiguityScore,
    riskLevel: deriveRiskLevel(ambiguityScore),
    summary: `Detected ${detectedSpans.length} ambiguity span${detectedSpans.length === 1 ? "" : "s"} across ${domain} (${multilingual.detectedLanguage}${multilingual.isCodeMixed ? ", code-mixed" : ""}).`,
    multilingual,
    spans: detectedSpans,
    categoryBreakdown: buildCategoryBreakdown(detectedSpans),
    interpretations,
    clarificationQuestions,
    defaultResolution,
  };
}

const VAGUE_ANSWER_PATTERN =
  /\b(soon|later|asap|maybe|probably|some|many|recent|recently|anything|unusual|whatever|tbd|unknown|etc|things|stuff|quickly|fast)\b/i;

export function computeResolutionVerification(
  analysis: AnalysisResult,
  answers: ClarificationAnswer[],
  selectedInterpretation: Interpretation | null = null,
): ResolutionVerificationReport {
  const validAnswers = answers.filter((a) => a.resolvedValue.trim().length > 0);

  // Group clarification questions by EssentialIntentField preserving priority order
  const fieldGroups = new Map<
    EssentialIntentField,
    { required: boolean; questions: ClarificationQuestion[] }
  >();

  for (const q of analysis.clarificationQuestions) {
    const existing = fieldGroups.get(q.essentialField);
    if (existing) {
      existing.required = existing.required || q.isEssential;
      existing.questions.push(q);
    } else {
      fieldGroups.set(q.essentialField, {
        required: q.isEssential,
        questions: [q],
      });
    }
  }

  // First pass: evaluate Missing & Ambiguous per field
  const rawChecks: FieldVerificationCheck[] = [];
  const answeredByField = new Map<
    EssentialIntentField,
    { question: ClarificationQuestion; answer: ClarificationAnswer }
  >();

  for (const [field, group] of fieldGroups.entries()) {
    const primaryQuestion = group.questions[0];
    const matchedAnswer = validAnswers.find((ans) =>
      group.questions.some((q) => q.id === ans.questionId),
    );
    const matchedQuestion = matchedAnswer
      ? (group.questions.find((q) => q.id === matchedAnswer.questionId) ?? primaryQuestion)
      : primaryQuestion;

    if (!matchedQuestion) continue;

    if (!matchedAnswer) {
      if (group.required) {
        rawChecks.push({
          field,
          required: true,
          status: "Missing",
          issueType: "missing",
          explanation: `Required field "${field}" is missing a specification for "${matchedQuestion.targetToken}".`,
          targetQuestionId: matchedQuestion.id,
          targetToken: matchedQuestion.targetToken,
        });
      } else {
        rawChecks.push({
          field,
          required: false,
          status: "Optional Pending",
          explanation: `Optional refinement for "${matchedQuestion.targetToken}" is deferred and not required to finalize intent.`,
          targetQuestionId: matchedQuestion.id,
          targetToken: matchedQuestion.targetToken,
        });
      }
      continue;
    }

    answeredByField.set(field, {
      question: matchedQuestion,
      answer: matchedAnswer,
    });

    const val = matchedAnswer.resolvedValue.trim();
    const vagueMatch = val.match(VAGUE_ANSWER_PATTERN);
    if (val.length < 5 || vagueMatch) {
      const reason =
        val.length < 5
          ? `Answer "${val}" is too brief to disambiguate "${matchedQuestion.targetToken}".`
          : `Answer still contains unresolved vague language ("${vagueMatch?.[0]}") that leaves "${field}" ambiguous.`;
      rawChecks.push({
        field,
        required: group.required,
        status: "Ambiguous",
        issueType: "ambiguous",
        explanation: reason,
        resolvedValue: val,
        targetQuestionId: matchedQuestion.id,
        targetToken: matchedQuestion.targetToken,
      });
      continue;
    }

    rawChecks.push({
      field,
      required: group.required,
      status: "Passed",
      explanation: `Verified via "${matchedQuestion.targetToken}" with deterministic constraint.`,
      resolvedValue: val,
      targetQuestionId: matchedQuestion.id,
      targetToken: matchedQuestion.targetToken,
    });
  }

  // Second pass: detect cross-field & self-contradictions
  const contradictions: ResolutionVerificationReport["contradictions"] = [];
  const contradictoryFieldSet = new Set<EssentialIntentField>();
  const contradictionReasonMap = new Map<EssentialIntentField, string>();

  const markContradiction = (
    f1: EssentialIntentField,
    f2: EssentialIntentField,
    reason: string,
    qId: string | null,
  ) => {
    contradictions.push({
      fields: [f1, f2],
      reason,
      targetQuestionId: qId,
    });
    contradictoryFieldSet.add(f1);
    contradictoryFieldSet.add(f2);
    if (!contradictionReasonMap.has(f1)) contradictionReasonMap.set(f1, reason);
    if (!contradictionReasonMap.has(f2)) contradictionReasonMap.set(f2, reason);
  };

  // Check self-contradiction inside single answer
  for (const [field, entry] of answeredByField.entries()) {
    const text = entry.answer.resolvedValue;
    if (
      (/\bimmediately\b/i.test(text) &&
        /\b(02:00|off-peak|next week|never|later|staging only)\b/i.test(text)) ||
      (/\b(flag|read-only|keep values intact|without deleting)\b/i.test(text) &&
        /\b(delete|purge|drop|wipe|remove all)\b/i.test(text))
    ) {
      markContradiction(
        field,
        field,
        `Contradictory directives detected inside "${field}": "${text}".`,
        entry.question.id,
      );
    }
  }

  // Cross-field checks
  const timingEntry = answeredByField.get("Execution Timing");
  const actionEntry = answeredByField.get("Action Scope");
  const safetyEntry = answeredByField.get("Safety & Guardrails");
  const targetEntry = answeredByField.get("Target Entity");

  if (timingEntry && actionEntry) {
    const timingVal = timingEntry.answer.resolvedValue;
    const actionVal = actionEntry.answer.resolvedValue;
    if (
      /\bimmediately\b/i.test(timingVal) &&
      /\b(without pod restarts|hot-reload|dry-run|staging only)\b/i.test(actionVal)
    ) {
      markContradiction(
        "Execution Timing",
        "Action Scope",
        "Execution Timing requests an immediate production canary rollout, which conflicts with Action Scope specifying a non-restart / dry-run operation.",
        timingEntry.question.id,
      );
    } else if (
      /\b(02:00|maintenance window|off-peak)\b/i.test(timingVal) &&
      /\b(immediately|right now|hotfix now)\b/i.test(actionVal)
    ) {
      markContradiction(
        "Execution Timing",
        "Action Scope",
        "Execution Timing schedules an off-peak maintenance window while Action Scope demands immediate execution.",
        timingEntry.question.id,
      );
    }
  }

  if (safetyEntry && actionEntry) {
    const safetyVal = safetyEntry.answer.resolvedValue;
    const actionVal = actionEntry.answer.resolvedValue;
    if (
      /\b(keep values intact|flag|read-only|without deleting)\b/i.test(safetyVal) &&
      /\b(delete|purge|drop|wipe)\b/i.test(actionVal)
    ) {
      markContradiction(
        "Safety & Guardrails",
        "Action Scope",
        "Safety & Guardrails preserves records intact while Action Scope specifies destructive deletion.",
        actionEntry.question.id,
      );
    }
  }

  if (safetyEntry && targetEntry) {
    const safetyVal = safetyEntry.answer.resolvedValue;
    const targetVal = targetEntry.answer.resolvedValue;
    if (
      /\b(excluding service tokens|human user accounts)\b/i.test(targetVal) &&
      /\b(all accounts|including service)\b/i.test(safetyVal)
    ) {
      markContradiction(
        "Target Entity",
        "Safety & Guardrails",
        "Target Entity excludes service tokens while Safety & Guardrails applies to all accounts.",
        targetEntry.question.id,
      );
    }
  }

  // Cross-check against explicitly selected Low-risk Dry-Run interpretation
  if (
    selectedInterpretation &&
    /\b(dry-run|read-only preview|staging)\b/i.test(selectedInterpretation.title) &&
    timingEntry &&
    /\b(in production|immediately via automated canary)\b/i.test(timingEntry.answer.resolvedValue)
  ) {
    markContradiction(
      "Execution Timing",
      "Execution Timing",
      `Selected interpretation "${selectedInterpretation.title}" avoids live production rollout, conflicting with immediate production canary timing.`,
      timingEntry.question.id,
    );
  }

  const fieldChecks: FieldVerificationCheck[] = rawChecks.map((check) => {
    if (contradictoryFieldSet.has(check.field)) {
      return {
        ...check,
        status: "Contradictory",
        issueType: "contradictory",
        explanation:
          contradictionReasonMap.get(check.field) ??
          "Conflicting constraint detected across clarified fields.",
      };
    }
    return check;
  });

  const requiredChecks = fieldChecks.filter((c) => c.required);
  const optionalChecks = fieldChecks.filter((c) => !c.required);

  const requiredPassed = requiredChecks.filter((c) => c.status === "Passed").length;
  const optionalPassed = optionalChecks.filter((c) => c.status === "Passed").length;

  const missingFields = fieldChecks.filter((c) => c.status === "Missing").map((c) => c.field);
  const ambiguousFields = fieldChecks.filter((c) => c.status === "Ambiguous").map((c) => c.field);
  const contradictoryFields = fieldChecks
    .filter((c) => c.status === "Contradictory")
    .map((c) => c.field);

  const requiredRatio = requiredChecks.length > 0 ? requiredPassed / requiredChecks.length : 1;
  const optionalRatio = optionalChecks.length > 0 ? optionalPassed / optionalChecks.length : 1;

  const rawScore = Math.round(
    requiredRatio * 90 +
      optionalRatio * 10 -
      ambiguousFields.length * 6 -
      contradictoryFields.length * 12,
  );
  const completenessScore = Math.max(0, Math.min(100, rawScore));

  const allRequiredPassed =
    requiredChecks.length > 0 ? requiredPassed === requiredChecks.length : true;

  const status: ResolutionVerificationReport["status"] =
    contradictoryFields.length > 0 || ambiguousFields.length > 0
      ? "Blocked"
      : allRequiredPassed
        ? "Verified"
        : "Needs Clarification";

  let completenessExplanation: string;
  if (status === "Verified") {
    completenessExplanation =
      optionalPassed === optionalChecks.length
        ? `100% complete: all ${requiredChecks.length} required and ${optionalChecks.length} optional intent fields passed verification with zero contradictions.`
        : `${completenessScore}% complete: all ${requiredChecks.length} required intent fields passed verification (${optionalChecks.length - optionalPassed} optional refinement deferred).`;
  } else {
    const parts: string[] = [];
    if (missingFields.length > 0) {
      parts.push(`${missingFields.length} missing required (${missingFields.join(", ")})`);
    }
    if (ambiguousFields.length > 0) {
      parts.push(`${ambiguousFields.length} ambiguous (${ambiguousFields.join(", ")})`);
    }
    if (contradictoryFields.length > 0) {
      parts.push(`${contradictoryFields.length} contradictory (${contradictoryFields.join(", ")})`);
    }
    completenessExplanation = `${completenessScore}% complete — verification failed on ${parts.join("; ")}. Resolve flagged fields in clarification before marking intent resolved.`;
  }

  return {
    status,
    allRequiredPassed,
    completenessScore,
    completenessExplanation,
    requiredTotal: requiredChecks.length,
    requiredPassed,
    optionalTotal: optionalChecks.length,
    optionalPassed,
    missingFields,
    ambiguousFields,
    contradictoryFields,
    contradictions,
    fieldChecks,
    checkedAt: new Date().toISOString(),
  };
}

export function computeClarificationOptimizerState(
  analysis: AnalysisResult,
  answers: ClarificationAnswer[],
  ambiguityThreshold = 60,
  allowOptionalRefinement = false,
  selectedInterpretation: Interpretation | null = null,
): ClarificationOptimizerState {
  const validAnswers = answers.filter((a) => a.resolvedValue.trim().length > 0);
  const answeredIds = new Set(validAnswers.map((a) => a.questionId));

  // Calculate cascading uncertainty reductions from answered questions
  const dependentReductionMap = new Map<string, number>();
  for (const ans of validAnswers) {
    const q = analysis.clarificationQuestions.find((item) => item.id === ans.questionId);
    if (q?.dependentSpanIds) {
      for (const depSpanId of q.dependentSpanIds) {
        dependentReductionMap.set(depSpanId, (dependentReductionMap.get(depSpanId) ?? 0) + 42);
      }
    }
  }

  // Build ranked remaining ambiguities across all detected spans
  const rawItems = analysis.spans.map((span) => {
    const matchingQuestion = analysis.clarificationQuestions.find(
      (q) => q.targetSpanId === span.id,
    );
    const isAnswered = Boolean(matchingQuestion && answeredIds.has(matchingQuestion.id));
    const cascadeReduction = dependentReductionMap.get(span.id) ?? 0;
    const currentSeverity = isAnswered
      ? Math.max(4, Math.round(span.severity * 0.08))
      : Math.max(12, span.severity - cascadeReduction);

    const baseImportance =
      matchingQuestion?.importanceScore ??
      Math.min(95, span.severity + CATEGORY_PRIORITY_BONUS[span.category]);
    const currentImportance = isAnswered
      ? 0
      : Math.max(10, baseImportance - Math.round(cascadeReduction * 0.65));

    const status: RemainingAmbiguityItem["status"] = isAnswered
      ? "Resolved"
      : cascadeReduction > 0
        ? "Reduced"
        : "Unresolved";

    const essentialField = matchingQuestion?.essentialField ?? CATEGORY_FIELD_MAP[span.category];
    const isEssential = matchingQuestion?.isEssential ?? false;

    const rankReason = isAnswered
      ? `Resolved via "${matchingQuestion?.targetToken ?? span.token}" clarification.`
      : cascadeReduction > 0
        ? `Reduced (-${cascadeReduction}% severity) via upstream clarification; optional confirmation only.`
        : (matchingQuestion?.necessityReason ?? span.reason);

    return {
      spanId: span.id,
      token: span.token,
      category: span.category,
      essentialField,
      isEssential,
      baseSeverity: span.severity,
      currentSeverity,
      importanceScore: currentImportance,
      status,
      questionId: matchingQuestion?.id ?? null,
      rank: 0,
      rankReason,
    };
  });

  const sortedItems = [...rawItems].sort((a, b) => {
    if (a.status === "Resolved" && b.status !== "Resolved") return 1;
    if (a.status !== "Resolved" && b.status === "Resolved") return -1;
    return b.importanceScore - a.importanceScore;
  });

  const rankedAmbiguities: RemainingAmbiguityItem[] = sortedItems.map((item, idx) => ({
    ...item,
    rank: idx + 1,
  }));

  // Compute remaining overall ambiguity & current clarity after all answers
  const totalBaseSeverity = rankedAmbiguities.reduce((sum, item) => sum + item.baseSeverity, 0);
  const totalCurrentSeverity = rankedAmbiguities.reduce(
    (sum, item) => sum + item.currentSeverity,
    0,
  );
  const severityRatio = totalBaseSeverity > 0 ? totalCurrentSeverity / totalBaseSeverity : 0;

  const remainingAmbiguityScore =
    validAnswers.length === 0
      ? analysis.ambiguityScore
      : Math.max(
          5,
          Math.min(analysis.ambiguityScore, Math.round(analysis.ambiguityScore * severityRatio)),
        );
  const currentClarityScore = 100 - remainingAmbiguityScore;

  // Track essential intent fields represented in this analysis
  const essentialFieldOrder: EssentialIntentField[] = [];
  for (const q of analysis.clarificationQuestions) {
    if (q.isEssential && !essentialFieldOrder.includes(q.essentialField)) {
      essentialFieldOrder.push(q.essentialField);
    }
  }

  const verification = computeResolutionVerification(
    analysis,
    validAnswers,
    selectedInterpretation,
  );

  const essentialFields: EssentialFieldStatus[] = essentialFieldOrder.map((field) => {
    const check = verification.fieldChecks.find((c) => c.field === field);
    const answeredForField = validAnswers.find((ans) => {
      const q = analysis.clarificationQuestions.find((item) => item.id === ans.questionId);
      return q?.essentialField === field;
    });
    const questionForField = answeredForField
      ? analysis.clarificationQuestions.find((item) => item.id === answeredForField.questionId)
      : undefined;
    const isClear = check ? check.status === "Passed" : Boolean(answeredForField);
    return {
      field,
      required: true,
      status: isClear ? "Clear" : "Needs Clarification",
      resolvedByToken: questionForField?.targetToken,
      resolvedValue: answeredForField?.resolvedValue,
    };
  });

  const allEssentialClear =
    essentialFields.length > 0 &&
    essentialFields.every((f) => f.status === "Clear") &&
    verification.allRequiredPassed;

  // Questions needing attention: unanswered OR failed verification (Ambiguous / Contradictory)
  const failedQuestionIds = new Set(
    verification.fieldChecks
      .filter(
        (c) => (c.status === "Ambiguous" || c.status === "Contradictory") && c.targetQuestionId,
      )
      .map((c) => c.targetQuestionId as string),
  );

  const unresolvedQuestionsQueue = analysis.clarificationQuestions
    .filter((q) => !answeredIds.has(q.id) || failedQuestionIds.has(q.id))
    .sort((a, b) => {
      const aFailed = failedQuestionIds.has(a.id) ? 1 : 0;
      const bFailed = failedQuestionIds.has(b.id) ? 1 : 0;
      if (aFailed !== bFailed) return bFailed - aFailed;
      const itemA = rankedAmbiguities.find((r) => r.questionId === a.id);
      const itemB = rankedAmbiguities.find((r) => r.questionId === b.id);
      return (
        (itemB?.importanceScore ?? b.importanceScore) -
        (itemA?.importanceScore ?? a.importanceScore)
      );
    });

  const stopTarget = Math.min(ambiguityThreshold, 35);
  const meetsClarityStop = allEssentialClear && remainingAmbiguityScore <= stopTarget;
  const isSufficientlyClear =
    (unresolvedQuestionsQueue.length === 0 && verification.allRequiredPassed) ||
    (meetsClarityStop && !allowOptionalRefinement);

  const skippedOptionalCount = isSufficientlyClear ? unresolvedQuestionsQueue.length : 0;

  let stopReason: string | null = null;
  if (unresolvedQuestionsQueue.length === 0 && verification.allRequiredPassed) {
    stopReason = "All detected ambiguity spans have been explicitly clarified and verified.";
  } else if (isSufficientlyClear) {
    stopReason = `Early stop triggered: all ${essentialFields.length} essential intent fields (${essentialFields.map((f) => f.field).join(", ")}) passed verification and remaining ambiguity dropped to ${remainingAmbiguityScore}% (below ${stopTarget}% target). Skipping ${skippedOptionalCount} low-impact question${skippedOptionalCount === 1 ? "" : "s"} to minimize user turns.`;
  }

  const activeQuestion = isSufficientlyClear ? null : (unresolvedQuestionsQueue[0] ?? null);

  const activeRankItem = activeQuestion
    ? rankedAmbiguities.find((r) => r.questionId === activeQuestion.id)
    : undefined;

  const activeFailedCheck = activeQuestion
    ? verification.fieldChecks.find(
        (c) =>
          c.targetQuestionId === activeQuestion.id &&
          (c.status === "Ambiguous" || c.status === "Contradictory"),
      )
    : undefined;

  const activeSelectionReason = activeFailedCheck
    ? `Re-clarification required (${activeFailedCheck.status}): ${activeFailedCheck.explanation}`
    : activeQuestion
      ? activeQuestion.selectionExplanation +
        (activeRankItem && activeRankItem.currentSeverity !== activeRankItem.baseSeverity
          ? ` (Recalculated severity: ${activeRankItem.currentSeverity}%.)`
          : "")
      : (stopReason ?? "Clarification complete.");

  const essentialTotal = Math.max(1, essentialFields.length);
  const essentialCleared = essentialFields.filter((f) => f.status === "Clear").length;
  const progressPercentage =
    unresolvedQuestionsQueue.length === 0
      ? 100
      : Math.min(100, Math.round((essentialCleared / essentialTotal) * 100));

  return {
    initialAmbiguityScore: analysis.ambiguityScore,
    remainingAmbiguityScore,
    initialClarityScore: analysis.clarityScore,
    currentClarityScore,
    progressPercentage,
    essentialFields,
    rankedAmbiguities,
    unresolvedQuestionsQueue,
    activeQuestion,
    activeSelectionReason,
    isSufficientlyClear,
    stopReason,
    skippedOptionalCount,
    conversationHistory: validAnswers,
  };
}

export function computeResolutionFromInputs(
  originalPrompt: string,
  spans: AmbiguitySpan[],
  selectedInterpretation: Interpretation | null,
  answers: ClarificationAnswer[],
  domain: DomainContext,
  clarificationQuestions: ClarificationQuestion[] = [],
): FinalResolution {
  const validAnswers = answers.filter((a) => a.resolvedValue.trim().length > 0);
  const decisionList = validAnswers.map((ans, idx) => {
    const matchedQuestion = clarificationQuestions.find((q) => q.id === ans.questionId);
    const matchingSpan = matchedQuestion
      ? spans.find((s) => s.id === matchedQuestion.targetSpanId)
      : spans[idx];
    return {
      token: ans.targetToken ?? matchingSpan?.token ?? `Parameter ${idx + 1}`,
      decision: ans.resolvedValue.trim(),
      essentialField: ans.essentialField ?? matchedQuestion?.essentialField,
      selectionExplanation: ans.selectionExplanation ?? matchedQuestion?.selectionExplanation,
      ambiguityReduction: ans.ambiguityReduction ?? matchedQuestion?.estimatedClarityGain,
    };
  });

  const intentLabel = selectedInterpretation
    ? selectedInterpretation.title
    : `${domain} Deterministic Specification`;

  const constraints =
    decisionList.length > 0
      ? decisionList.map((d) => `${d.token} → ${d.decision}`)
      : ["Explicit scope and acceptance criteria confirmed"];

  const resolvedPromptParts = [
    `[${domain} | ${intentLabel}]`,
    `Execute the instruction: "${originalPrompt}"`,
    decisionList.length > 0
      ? `with explicit parameters: ${decisionList.map((d) => d.decision).join("; ")}.`
      : "with verified scope, deterministic timing, and audit logging enabled.",
  ];

  const answeredRatio =
    spans.length > 0 ? Math.min(1, validAnswers.length / Math.min(3, spans.length)) : 1;
  const remainingAmbiguityScore = Math.max(5, Math.round(42 - answeredRatio * 34));
  const clarityGain = Math.min(90, Math.max(24, Math.round(32 + answeredRatio * 48)));

  return {
    originalPrompt,
    resolvedPrompt: resolvedPromptParts.join(" "),
    clarityGain,
    remainingAmbiguityScore,
    structuredSpec: {
      intentType: intentLabel,
      primarySubject: domain,
      targetScope: selectedInterpretation?.impactScope ?? `${domain} Active Scope`,
      constraints,
      timeHorizon:
        decisionList.find((d) => /utc|immediate|window|day|minute|quarter|hour/i.test(d.decision))
          ?.decision ?? "Explicit execution window verified",
      outputFormat: "Structured Intent JSON + Verified Action Plan",
      confidenceAfterClarification: 100 - remainingAmbiguityScore,
    },
    appliedDecisions: decisionList,
    generatedAt: new Date().toISOString(),
  };
}

export const DEMO_EVALUATION_DATA: EvaluationDataset = {
  isDemoData: true,
  benchmarkName: "ResolveX Ambiguity-120 Synthetic Benchmark",
  sampleCount: 120,
  lastUpdated: "2026-11-27 (Demo Snapshot)",
  overview: [
    {
      label: "Span Detection F1",
      value: "91.4%",
      delta: "+14.2% vs baseline",
      note: "DEMO DATA — Simulated precision/recall across 120 prompts",
    },
    {
      label: "Post-Clarification Clarity",
      value: "94.8%",
      delta: "+48.6 pts gain",
      note: "DEMO DATA — Mean clarity increase after 2.1 clarification turns",
    },
    {
      label: "Avg Clarification Turns",
      value: "2.1 turns",
      delta: "-38% user effort",
      note: "DEMO DATA — Ranked question selection reduces back-and-forth",
    },
    {
      label: "Misinterpretation Rate",
      value: "4.2%",
      delta: "-27.5% errors",
      note: "DEMO DATA — Synthetic ambiguity resolution eval",
    },
  ],
  categoryPerformance: [
    { category: "Lexical", precision: 93, recall: 90, f1: 91 },
    { category: "Syntactic", precision: 88, recall: 85, f1: 86 },
    { category: "Referential", precision: 94, recall: 92, f1: 93 },
    { category: "Scope", precision: 92, recall: 91, f1: 91 },
    { category: "Temporal", precision: 96, recall: 94, f1: 95 },
    { category: "Pragmatic", precision: 89, recall: 87, f1: 88 },
  ],
  baselineComparison: [
    {
      turn: "Initial Prompt",
      rawPromptClarity: 34,
      singleTurnLLM: 46,
      resolveXPipeline: 48,
    },
    {
      turn: "Turn 1 Clarify",
      rawPromptClarity: 34,
      singleTurnLLM: 58,
      resolveXPipeline: 76,
    },
    {
      turn: "Turn 2 Clarify",
      rawPromptClarity: 34,
      singleTurnLLM: 64,
      resolveXPipeline: 91,
    },
    {
      turn: "Final Spec",
      rawPromptClarity: 34,
      singleTurnLLM: 68,
      resolveXPipeline: 95,
    },
  ],
  latencyDistribution: [
    { stage: "Token Detection", latencyMs: 110 },
    { stage: "Interpretation Rank", latencyMs: 185 },
    { stage: "Clarify Synthesis", latencyMs: 140 },
    { stage: "Final Resolution", latencyMs: 95 },
  ],
  benchmarkCases: [
    {
      id: "EVAL-014",
      promptSnippet: "Update the auth service and deploy it soon...",
      category: "Temporal",
      detectedSpans: 4,
      turnsToResolve: 3,
      finalClarity: 96,
      status: "Resolved",
    },
    {
      id: "EVAL-032",
      promptSnippet: "Pull the top performing regions from last quarter...",
      category: "Pragmatic",
      detectedSpans: 4,
      turnsToResolve: 2,
      finalClarity: 94,
      status: "Resolved",
    },
    {
      id: "EVAL-059",
      promptSnippet: "Restrict access for inactive accounts and notify...",
      category: "Scope",
      detectedSpans: 4,
      turnsToResolve: 3,
      finalClarity: 95,
      status: "Resolved",
    },
    {
      id: "EVAL-088",
      promptSnippet: "Migrate the legacy billing tables safely before Friday...",
      category: "Lexical",
      detectedSpans: 3,
      turnsToResolve: 2,
      finalClarity: 92,
      status: "Resolved",
    },
    {
      id: "EVAL-107",
      promptSnippet: "Make sure they get the updated report when it finishes...",
      category: "Referential",
      detectedSpans: 5,
      turnsToResolve: 3,
      finalClarity: 86,
      status: "Needs Review",
    },
  ],
  inventoryMetrics: {
    overview: [
      {
        label: "CRD On-Time Protection",
        value: "89.2%",
        delta: "+11.4% with PO automation",
        note: "DEMO DATA — Simulated Customer Requested Date protection rate",
      },
      {
        label: "Shortage Mitigation Speed",
        value: "4.2 hrs",
        delta: "-62% triage cycle",
        note: "DEMO DATA — Mean time from breach detection to PO draft",
      },
      {
        label: "Safety Stock Coverage",
        value: "83.5%",
        delta: "2 critical SKUs flagged",
        note: "DEMO DATA — Multi-warehouse buffer adherence",
      },
      {
        label: "Ambiguous Order Notes Resolved",
        value: "96.0%",
        delta: "PS6 + PS2 unified",
        note: "DEMO DATA — Order dispatch notes disambiguated before fulfillment",
      },
    ],
    stockHealthTrend: [
      { week: "W1", serviceLevel: 82, crdOnTimeRate: 78, shortageRiskIndex: 38 },
      { week: "W2", serviceLevel: 85, crdOnTimeRate: 81, shortageRiskIndex: 31 },
      { week: "W3", serviceLevel: 88, crdOnTimeRate: 86, shortageRiskIndex: 24 },
      { week: "W4", serviceLevel: 92, crdOnTimeRate: 89, shortageRiskIndex: 17 },
    ],
    warehouseUtilization: [
      {
        warehouse: "BLR-Hub-01",
        availableUnits: 648,
        reservedUnits: 684,
        shortageUnits: 150,
      },
      {
        warehouse: "MUM-West-02",
        availableUnits: 865,
        reservedUnits: 420,
        shortageUnits: 35,
      },
      {
        warehouse: "DEL-North-03",
        availableUnits: 120,
        reservedUnits: 215,
        shortageUnits: 120,
      },
    ],
  },
};

export function buildContextIntelligenceGraph(
  analysis: AnalysisResult,
  answers: ClarificationAnswer[],
  selectedInterpretation: Interpretation | null,
  optimizerState: ClarificationOptimizerState,
): ContextIntelligenceGraphData {
  const validAnswers = answers.filter((a) => a.resolvedValue.trim().length > 0);
  const answerByQuestionId = new Map(validAnswers.map((a) => [a.questionId, a]));
  const rankedBySpanId = new Map(optimizerState.rankedAmbiguities.map((r) => [r.spanId, r]));
  const spanById = new Map(analysis.spans.map((s) => [s.id, s]));

  const resolveNodeDynamics = (node: ContextGraphNode): ContextGraphNode => {
    const answer = node.linkedQuestionId
      ? answerByQuestionId.get(node.linkedQuestionId)
      : undefined;
    const ranked = node.linkedSpanId ? rankedBySpanId.get(node.linkedSpanId) : undefined;
    const span = node.linkedSpanId ? spanById.get(node.linkedSpanId) : undefined;

    if (answer) {
      return {
        ...node,
        state: "resolved",
        resolvedValue: answer.resolvedValue,
        meaning: `Clarified: ${answer.resolvedValue}`,
        uncertaintyScore: 7,
        uncertaintyReason: `Resolved via clarification turn (${answer.source === "custom" ? "custom input" : "predefined option"}).`,
      };
    }

    // Synchronize un-answered nodes with active What-If Interpretation Simulator scenario
    let simMeaning = node.meaning;
    let simResolvedPreview = node.resolvedValue;
    const simUncertainty = node.uncertaintyScore;
    const simReason = node.uncertaintyReason;

    if (selectedInterpretation) {
      const sim = selectedInterpretation.simulatedIntent;
      if (node.kind === "action") {
        simMeaning = `What-If Scenario (${selectedInterpretation.title}): ${sim.action}`;
        simResolvedPreview = sim.action;
      } else if (node.kind === "date") {
        simMeaning = `Simulated Timing: ${sim.date}`;
        simResolvedPreview = sim.date;
      } else if (node.kind === "location") {
        simMeaning = `Simulated Scope (${selectedInterpretation.title}): ${selectedInterpretation.impactScope}`;
        simResolvedPreview = selectedInterpretation.impactScope;
      } else if (node.kind === "person" && node.id !== "n-operator" && node.id !== "n-actor") {
        simMeaning = `Simulated Recipient / Cohort: ${sim.recipient}`;
        simResolvedPreview = sim.recipient;
      } else if (node.kind === "object") {
        simMeaning = `Simulated Object: ${sim.object}`;
        simResolvedPreview = sim.object;
      }
    }

    if (ranked) {
      const state: GraphNodeState =
        ranked.status === "Resolved"
          ? "resolved"
          : ranked.currentSeverity >= 65
            ? "ambiguous"
            : "unresolved";
      return {
        ...node,
        state,
        meaning: simMeaning,
        resolvedValue: simResolvedPreview,
        uncertaintyScore: ranked.currentSeverity,
        uncertaintyReason: ranked.rankReason,
        interpretations: span?.candidateMeanings ?? node.interpretations,
      };
    }

    return {
      ...node,
      meaning: simMeaning,
      resolvedValue: simResolvedPreview,
      uncertaintyScore: simUncertainty,
      uncertaintyReason: simReason,
    };
  };

  let baseNodes: ContextGraphNode[] = [];
  let baseEdges: Array<Omit<ContextGraphEdge, "state">> = [];

  const activeInterpTitle = selectedInterpretation?.title ?? null;
  const activeInterpScope = selectedInterpretation?.impactScope ?? `${analysis.domain} Environment`;

  if (analysis.id === "analysis-ex-deploy") {
    baseNodes = [
      {
        id: "n-operator",
        label: "Requester / Ops",
        kind: "person",
        state: "resolved",
        x: 110,
        y: 120,
        meaning: "Engineering operator issuing the deployment directive.",
        uncertaintyScore: 10,
        uncertaintyReason: "Actor role inferred cleanly from engineering context.",
        interpretations: ["Release engineer triggering CI/CD rollout"],
      },
      {
        id: "n-update",
        label: "Update & Deploy",
        kind: "action",
        state: "ambiguous",
        x: 330,
        y: 120,
        meaning: "Mutate and roll out changes to the authentication service.",
        uncertaintyScore: 78,
        uncertaintyReason: "Does not specify release build, security patch, or config hot-reload.",
        interpretations: [
          "Deploy release artifact v2.4.2",
          "Apply CVE security patch",
          "Hot-reload runtime config",
        ],
        linkedSpanId: "span-update",
        linkedQuestionId: "cq-target-env",
      },
      {
        id: "n-auth-svc",
        label: "Auth Service",
        kind: "object",
        state: "resolved",
        x: 560,
        y: 110,
        meaning: "Core authentication microservice handling tokens & logins.",
        uncertaintyScore: 14,
        uncertaintyReason: "Primary target object explicitly named in prompt.",
        interpretations: ["auth-service Kubernetes deployment"],
      },
      {
        id: "n-it-ref",
        label: '"it" (Reference)',
        kind: "ambiguous_reference",
        state: "ambiguous",
        x: 440,
        y: 250,
        meaning: "Anaphoric pronoun referencing the target deployment artifact.",
        uncertaintyScore: 71,
        uncertaintyReason: "Could refer solely to auth-service or coupled API gateway middleware.",
        interpretations: ["Auth microservice only", "Auth service + API gateway"],
        linkedSpanId: "span-it",
        linkedQuestionId: "cq-it-ref",
      },
      {
        id: "n-soon",
        label: '"soon" (Timing)',
        kind: "date",
        state: "ambiguous",
        x: 190,
        y: 290,
        meaning: "Unbounded deployment schedule / execution window.",
        uncertaintyScore: 86,
        uncertaintyReason: "Relative time expression lacks maintenance window or canary gate.",
        interpretations: ["Immediate 10% canary rollout", "Off-peak window (02:00 UTC)"],
        linkedSpanId: "span-soon",
        linkedQuestionId: "cq-window",
      },
      {
        id: "n-cluster",
        label: activeInterpScope,
        kind: "location",
        state: selectedInterpretation ? "resolved" : "unresolved",
        x: 720,
        y: 230,
        meaning: `Target cluster environment shaped by interpretation: ${activeInterpTitle ?? "Default"}.`,
        uncertaintyScore: selectedInterpretation ? 22 : 62,
        uncertaintyReason: selectedInterpretation
          ? `Scoped to ${activeInterpScope} via selected interpretation.`
          : "Target environment (staging vs. production) awaits interpretation.",
        interpretations: analysis.interpretations.map((i) => `${i.title} (${i.impactScope})`),
      },
      {
        id: "n-sessions",
        label: "Recent User Sessions",
        kind: "person",
        state: "ambiguous",
        x: 560,
        y: 380,
        meaning: "Active end-user authentication sessions to preserve intact.",
        uncertaintyScore: 89,
        uncertaintyReason: "TTL cutoff (60m vs. 24h refresh tokens) is unspecified.",
        interpretations: [
          "Active sessions in last 60 minutes",
          "All non-expired 24h refresh sessions",
        ],
        linkedSpanId: "span-sessions",
        linkedQuestionId: "cq-sessions",
      },
    ];

    baseEdges = [
      { id: "e-1", source: "n-operator", target: "n-update", label: "initiates" },
      { id: "e-2", source: "n-update", target: "n-auth-svc", label: "targets" },
      { id: "e-3", source: "n-it-ref", target: "n-auth-svc", label: "refers_to" },
      { id: "e-4", source: "n-update", target: "n-soon", label: "scheduled_at" },
      { id: "e-5", source: "n-auth-svc", target: "n-cluster", label: "deployed_in" },
      { id: "e-6", source: "n-update", target: "n-sessions", label: "must_preserve" },
      { id: "e-7", source: "n-it-ref", target: "n-cluster", label: "resolves_in" },
    ];
  } else if (analysis.id === "analysis-ex-analytics") {
    baseNodes = [
      {
        id: "n-analyst",
        label: "Leadership / RevOps",
        kind: "person",
        state: "unresolved",
        x: 720,
        y: 260,
        meaning: "Intended audience receiving the shared regional report.",
        uncertaintyScore: 52,
        uncertaintyReason: 'Audience implied by "sharing"; refined via deliverable choice.',
        interpretations: ["Executive Board Leadership", "Revenue Ops (#rev-ops)"],
      },
      {
        id: "n-pull-clean",
        label: "Pull & Clean Anomalies",
        kind: "action",
        state: "ambiguous",
        x: 320,
        y: 120,
        meaning: "Query regional metrics and sanitize statistical outliers.",
        uncertaintyScore: 87,
        uncertaintyReason: "Deleting vs. flagging anomalies changes reported financial totals.",
        interpretations: ["Flag outliers in audit footnote", "Exclude verified test accounts only"],
        linkedSpanId: "span-anomalies",
        linkedQuestionId: "cq-anomaly",
      },
      {
        id: "n-top-kpi",
        label: '"top performing" KPI',
        kind: "object",
        state: "ambiguous",
        x: 130,
        y: 240,
        meaning: "Ranking metric and top-N cutoff for regional performance.",
        uncertaintyScore: 81,
        uncertaintyReason: "Net revenue vs. QoQ growth yields different regions.",
        interpretations: ["Top 5 by Net Revenue", "Top 5 by QoQ Growth %"],
        linkedSpanId: "span-top",
        linkedQuestionId: "cq-kpi",
      },
      {
        id: "n-regions",
        label: "Target Geo Regions",
        kind: "location",
        state: "unresolved",
        x: 560,
        y: 115,
        meaning: `Geographic territories evaluated under ${activeInterpScope}.`,
        uncertaintyScore: selectedInterpretation ? 28 : 54,
        uncertaintyReason: selectedInterpretation
          ? `Contextualized by "${activeInterpTitle}".`
          : "Regional boundary depends on selected KPI & quarter.",
        interpretations: ["NA + EMEA + APAC territories", "Top 5 revenue territories"],
      },
      {
        id: "n-quarter",
        label: '"last quarter"',
        kind: "date",
        state: "ambiguous",
        x: 240,
        y: 370,
        meaning: "Reporting time window (calendar vs. fiscal quarter).",
        uncertaintyScore: 68,
        uncertaintyReason: "Fiscal quarter dates may differ from calendar Q3.",
        interpretations: ["Calendar Quarter (Jul–Sep)", "Corporate Fiscal Quarter"],
        linkedSpanId: "span-quarter",
        linkedQuestionId: "cq-quarter",
      },
      {
        id: "n-them-ref",
        label: '"them" (Deliverable)',
        kind: "ambiguous_reference",
        state: "ambiguous",
        x: 520,
        y: 330,
        meaning: "Pronoun referring to the final artifact shared downstream.",
        uncertaintyScore: 74,
        uncertaintyReason:
          'Unclear whether "them" means top regions summary, anomaly logs, or BI view.',
        interpretations: ["Executive Summary + CSV", "Interactive BI Dashboard Link"],
        linkedSpanId: "span-them",
        linkedQuestionId: "cq-share",
      },
    ];

    baseEdges = [
      { id: "e-1", source: "n-pull-clean", target: "n-regions", label: "queries" },
      { id: "e-2", source: "n-top-kpi", target: "n-regions", label: "ranks" },
      { id: "e-3", source: "n-pull-clean", target: "n-quarter", label: "bounded_by" },
      { id: "e-4", source: "n-pull-clean", target: "n-them-ref", label: "produces" },
      { id: "e-5", source: "n-them-ref", target: "n-regions", label: "refers_to" },
      { id: "e-6", source: "n-them-ref", target: "n-analyst", label: "shared_with" },
    ];
  } else if (analysis.id === "analysis-ex-support") {
    baseNodes = [
      {
        id: "n-inactive",
        label: "Inactive Accounts",
        kind: "person",
        state: "ambiguous",
        x: 130,
        y: 140,
        meaning: "User or service accounts crossing the dormancy threshold.",
        uncertaintyScore: 90,
        uncertaintyReason: "Does not distinguish human users from automated API/CI service tokens.",
        interpretations: ["Human accounts inactive > 90 days", "All non-admin accounts > 30 days"],
        linkedSpanId: "span-inactive",
        linkedQuestionId: "cq-inactivity-days",
      },
      {
        id: "n-restrict",
        label: "Restrict Access",
        kind: "action",
        state: "ambiguous",
        x: 360,
        y: 120,
        meaning: "Enforce access restriction policy on dormant accounts.",
        uncertaintyScore: 85,
        uncertaintyReason: "Could mean temporary SSO suspension or read-only role downgrade.",
        interpretations: ["Temporary suspend + SSO re-auth", "Downgrade to read-only viewer"],
        linkedSpanId: "span-restrict",
        linkedQuestionId: "cq-restriction-mode",
      },
      {
        id: "n-iam",
        label: "Auth & RBAC Tokens",
        kind: "object",
        state: "resolved",
        x: 590,
        y: 115,
        meaning: "Session tokens and workspace role permissions governed by IAM.",
        uncertaintyScore: 16,
        uncertaintyReason: "Standard workspace authorization objects.",
        interpretations: ["SSO session tokens & RBAC policies"],
      },
      {
        id: "n-dormancy-date",
        label: "Dormancy Window",
        kind: "date",
        state: "unresolved",
        x: 170,
        y: 330,
        meaning: "Elapsed time since last authenticated user activity.",
        uncertaintyScore: 76,
        uncertaintyReason: "Bound to 30-day vs. 90-day inactivity definition.",
        interpretations: ["90+ days inactive", "30+ days inactive"],
        linkedQuestionId: "cq-inactivity-days",
      },
      {
        id: "n-perimeter",
        label: activeInterpScope,
        kind: "location",
        state: selectedInterpretation ? "resolved" : "unresolved",
        x: 720,
        y: 250,
        meaning: `Governance boundary for ${activeInterpTitle ?? "Identity Perimeter"}.`,
        uncertaintyScore: selectedInterpretation ? 20 : 50,
        uncertaintyReason: selectedInterpretation
          ? `Policy scoped to ${activeInterpScope}.`
          : "Scope depends on chosen governance interpretation.",
        interpretations: analysis.interpretations.map((i) => i.impactScope),
      },
      {
        id: "n-unusual",
        label: '"anything looks unusual"',
        kind: "ambiguous_reference",
        state: "ambiguous",
        x: 410,
        y: 270,
        meaning: "Subjective anomaly condition triggering escalation alerts.",
        uncertaintyScore: 91,
        uncertaintyReason:
          "Lacks concrete detection signals (failed logins, geo anomaly, role escalation).",
        interpretations: [
          "Geo anomaly / >10 failed logins / RBAC change",
          "Daily digest of dormant reactivations",
        ],
        linkedSpanId: "span-unusual",
        linkedQuestionId: "cq-anomaly-def",
      },
      {
        id: "n-team",
        label: '"the team" (Escalation)',
        kind: "person",
        state: "ambiguous",
        x: 610,
        y: 375,
        meaning: "Responding team receiving security or admin alerts.",
        uncertaintyScore: 77,
        uncertaintyReason: "Does not name SecOps vs. Workspace Administrators.",
        interpretations: ["#secops-alerts on-call", "Workspace Administrators"],
        linkedSpanId: "span-team",
        linkedQuestionId: "cq-team-target",
      },
    ];

    baseEdges = [
      { id: "e-1", source: "n-restrict", target: "n-inactive", label: "applies_to" },
      { id: "e-2", source: "n-restrict", target: "n-iam", label: "modifies" },
      { id: "e-3", source: "n-inactive", target: "n-dormancy-date", label: "measured_over" },
      { id: "e-4", source: "n-iam", target: "n-perimeter", label: "enforced_in" },
      { id: "e-5", source: "n-unusual", target: "n-perimeter", label: "monitored_in" },
      { id: "e-6", source: "n-unusual", target: "n-team", label: "notifies" },
    ];
  } else {
    // Dynamic graph for any custom prompt
    const actionSpan =
      analysis.spans.find((s) => s.category === "Lexical" || s.category === "Syntactic") ??
      analysis.spans[0];
    const temporalSpan = analysis.spans.find((s) => s.category === "Temporal");
    const scopeSpan = analysis.spans.find(
      (s) => s.category === "Scope" || s.category === "Pragmatic",
    );
    const refSpan = analysis.spans.find((s) => s.category === "Referential");

    const qForSpan = (spanId?: string) =>
      spanId
        ? analysis.clarificationQuestions.find((q) => q.targetSpanId === spanId)?.id
        : undefined;

    baseNodes = [
      {
        id: "n-actor",
        label: "Prompt Initiator",
        kind: "person",
        state: "resolved",
        x: 110,
        y: 130,
        meaning: `Operator requesting action within ${analysis.domain}.`,
        uncertaintyScore: 12,
        uncertaintyReason: "Context role derived from workspace domain.",
        interpretations: [`${analysis.domain} owner / operator`],
      },
      {
        id: "n-action",
        label: actionSpan ? `"${actionSpan.token}" (Action)` : "Primary Action",
        kind: "action",
        state: actionSpan ? "ambiguous" : "unresolved",
        x: 340,
        y: 120,
        meaning: actionSpan ? actionSpan.reason : "Primary operation requested by the instruction.",
        uncertaintyScore: actionSpan ? actionSpan.severity : 45,
        uncertaintyReason: actionSpan?.reason ?? "Action depth requires confirmation.",
        interpretations: actionSpan?.candidateMeanings ?? [
          "Scoped execution",
          "Dry-run verification",
        ],
        linkedSpanId: actionSpan?.id,
        linkedQuestionId: qForSpan(actionSpan?.id),
      },
      {
        id: "n-object",
        label: scopeSpan ? `"${scopeSpan.token}" (Scope)` : `${analysis.domain} Target`,
        kind: "object",
        state: scopeSpan ? "ambiguous" : "unresolved",
        x: 580,
        y: 115,
        meaning: scopeSpan ? scopeSpan.reason : `Primary resource entity in ${analysis.domain}.`,
        uncertaintyScore: scopeSpan ? scopeSpan.severity : 40,
        uncertaintyReason: scopeSpan?.reason ?? "Target entity boundaries inferred from prompt.",
        interpretations: scopeSpan?.candidateMeanings ?? ["Primary workspace entity"],
        linkedSpanId: scopeSpan?.id,
        linkedQuestionId: qForSpan(scopeSpan?.id),
      },
      {
        id: "n-date",
        label: temporalSpan ? `"${temporalSpan.token}"` : "Execution Window",
        kind: "date",
        state: temporalSpan ? "ambiguous" : "unresolved",
        x: 190,
        y: 330,
        meaning: temporalSpan ? temporalSpan.reason : "Execution schedule and SLA horizon.",
        uncertaintyScore: temporalSpan ? temporalSpan.severity : 35,
        uncertaintyReason: temporalSpan?.reason ?? "No explicit timestamp stated in prompt.",
        interpretations: temporalSpan?.candidateMeanings ?? [
          "Immediate execution",
          "Scheduled window",
        ],
        linkedSpanId: temporalSpan?.id,
        linkedQuestionId: qForSpan(temporalSpan?.id),
      },
      {
        id: "n-location",
        label: activeInterpScope,
        kind: "location",
        state: selectedInterpretation ? "resolved" : "unresolved",
        x: 710,
        y: 265,
        meaning: `Execution environment for ${activeInterpTitle ?? analysis.domain}.`,
        uncertaintyScore: selectedInterpretation ? 22 : 52,
        uncertaintyReason: selectedInterpretation
          ? `Environment scoped via "${activeInterpTitle}".`
          : "Awaiting environment interpretation selection.",
        interpretations: analysis.interpretations.map((i) => i.impactScope),
      },
      {
        id: "n-ref",
        label: refSpan ? `"${refSpan.token}" (Reference)` : "Implicit Reference",
        kind: "ambiguous_reference",
        state: refSpan ? "ambiguous" : "unresolved",
        x: 440,
        y: 310,
        meaning: refSpan
          ? refSpan.reason
          : "Cross-clause contextual reference requiring validation.",
        uncertaintyScore: refSpan ? refSpan.severity : 48,
        uncertaintyReason: refSpan?.reason ?? "Contextual link inferred from prompt phrasing.",
        interpretations: refSpan?.candidateMeanings ?? ["Primary target entity"],
        linkedSpanId: refSpan?.id,
        linkedQuestionId: qForSpan(refSpan?.id),
      },
    ];

    baseEdges = [
      { id: "e-1", source: "n-actor", target: "n-action", label: "initiates" },
      { id: "e-2", source: "n-action", target: "n-object", label: "operates_on" },
      { id: "e-3", source: "n-action", target: "n-date", label: "timed_by" },
      { id: "e-4", source: "n-object", target: "n-location", label: "scoped_in" },
      { id: "e-5", source: "n-ref", target: "n-object", label: "refers_to" },
      { id: "e-6", source: "n-ref", target: "n-location", label: "contextualized_by" },
    ];
  }

  const resolvedNodes = baseNodes.map(resolveNodeDynamics);
  const nodeStateMap = new Map(resolvedNodes.map((n) => [n.id, n.state]));

  const edges: ContextGraphEdge[] = baseEdges.map((edge) => {
    const srcState = nodeStateMap.get(edge.source) ?? "unresolved";
    const tgtState = nodeStateMap.get(edge.target) ?? "unresolved";
    const state: GraphNodeState =
      srcState === "ambiguous" || tgtState === "ambiguous"
        ? "ambiguous"
        : srcState === "resolved" && tgtState === "resolved"
          ? "resolved"
          : "unresolved";
    return { ...edge, state };
  });

  const ambiguousCount = resolvedNodes.filter((n) => n.state === "ambiguous").length;
  const unresolvedCount = resolvedNodes.filter((n) => n.state === "unresolved").length;
  const resolvedCount = resolvedNodes.filter((n) => n.state === "resolved").length;
  const averageUncertainty =
    resolvedNodes.length > 0
      ? Math.round(
          resolvedNodes.reduce((sum, n) => sum + n.uncertaintyScore, 0) / resolvedNodes.length,
        )
      : 0;

  return {
    nodes: resolvedNodes,
    edges,
    summary: {
      totalNodes: resolvedNodes.length,
      ambiguousCount,
      unresolvedCount,
      resolvedCount,
      averageUncertainty,
      activeInterpretationTitle: activeInterpTitle,
    },
  };
}

export function computeInterpretationDiffs(
  interpretations: Interpretation[],
): ScenarioDimensionDiff[] {
  const dimensions: Array<{
    dimension: ScenarioDimensionDiff["dimension"];
    label: string;
    readValue: (interp: Interpretation) => string;
  }> = [
    {
      dimension: "action",
      label: "Action",
      readValue: (interp) => interp.simulatedIntent.action,
    },
    {
      dimension: "entities",
      label: "Entities",
      readValue: (interp) => interp.simulatedIntent.entities.join(", "),
    },
    {
      dimension: "recipient",
      label: "Recipient",
      readValue: (interp) => interp.simulatedIntent.recipient,
    },
    {
      dimension: "object",
      label: "Object",
      readValue: (interp) => interp.simulatedIntent.object,
    },
    {
      dimension: "date",
      label: "Date / Timing",
      readValue: (interp) => interp.simulatedIntent.date,
    },
  ];

  return dimensions.map(({ dimension, label, readValue }) => {
    const valuesByScenario = interpretations.map((interp) => ({
      scenarioId: interp.id,
      scenarioTitle: interp.title,
      value: readValue(interp),
    }));

    const uniqueValues = new Set(valuesByScenario.map((v) => v.value.trim().toLowerCase()));
    const differs = uniqueValues.size > 1;

    const causedWordsSet = new Set<string>();
    for (const interp of interpretations) {
      for (const tw of interp.triggerWords) {
        if (
          (dimension === "date" && tw.category === "Temporal") ||
          (dimension === "action" && (tw.category === "Lexical" || tw.category === "Pragmatic")) ||
          (dimension === "recipient" &&
            (tw.category === "Referential" || tw.category === "Scope")) ||
          (dimension === "object" &&
            (tw.category === "Scope" ||
              tw.category === "Referential" ||
              tw.category === "Lexical")) ||
          (dimension === "entities" && (tw.category === "Scope" || tw.category === "Referential"))
        ) {
          causedWordsSet.add(tw.word);
        }
      }
    }
    if (causedWordsSet.size === 0) {
      for (const interp of interpretations) {
        for (const tw of interp.triggerWords) {
          causedWordsSet.add(tw.word);
        }
      }
    }

    return {
      dimension,
      label,
      differs,
      causedByWords: Array.from(causedWordsSet),
      valuesByScenario,
    };
  });
}
