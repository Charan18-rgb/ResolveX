import { ENV_CONFIG } from "@/config/env";
import {
  computeClientConfidenceAssessment,
  enrichInterpretationsWithConfidence,
  mapBackendAnalyzeToAnalysisResult,
} from "@/data/confidenceEngine";
import {
  analyzeCustomPromptMock,
  buildContextIntelligenceGraph,
  computeClarificationOptimizerState,
  computeInterpretationDiffs,
  computeResolutionFromInputs,
  computeResolutionVerification,
  DEMO_EVALUATION_DATA,
} from "@/data/mockData";
import { detectLanguageMetadata } from "@/data/multilingualEngine";
import type {
  AmbiguityCategory,
  AmbiguitySpan,
  AnalysisResult,
  AnalyzePromptRequest,
  BackendAlertItem,
  BackendAllocationRecord,
  BackendAnalyzeResponse,
  BackendApiRoleHeader,
  BackendBriefingResponse,
  BackendConversationDetail,
  BackendConversationSummary,
  BackendEvaluationPs6Response,
  BackendEventIngestionResponse,
  BackendHealthStatus,
  BackendInventoryEvent,
  BackendInventoryOverviewResponse,
  BackendMaterialOverview,
  BackendOrderRiskItem,
  BackendOrderRow,
  BackendPs2Evaluation,
  BackendPs6Evaluation,
  BackendPurchaseOrderProposal,
  BackendShortageItem,
  CategoryScore,
  ClarificationAnswer,
  ClarificationOptimizerState,
  ClarificationQuestion,
  ConfidenceAssessment,
  ContextIntelligenceGraphData,
  DomainContext,
  EvaluationDataset,
  FinalResolution,
  Interpretation,
  LanguageOption,
  ResolutionVerificationReport,
  ResolveIntentRequest,
  RiskLevel,
  ScenarioDimensionDiff,
  StrictnessLevel,
  UserDemoRole,
} from "@/types/resolvex";

export const API_ENDPOINTS = {
  health: "/health",
  analyze: "/api/analyze",
  clarify: "/api/clarify",
  resolve: "/api/resolve",
  conversations: "/api/conversations",
  inventoryOverview: "/api/inventory/overview",
  inventoryMaterials: "/api/inventory/materials",
  inventoryShortages: "/api/inventory/shortages",
  inventoryEvents: "/api/inventory/events",
  inventoryAllocations: "/api/inventory/allocations",
  recalculateAllocations: "/api/inventory/allocations/recalculate",
  orders: "/api/orders",
  orderRisks: "/api/orders/risks",
  alerts: "/api/alerts",
  briefings: "/api/briefings",
  poProposals: "/api/purchase-orders/proposals",
  evalPs6: "/api/evaluation/ps6",
  evalPs2: "/api/evaluation/ps2",
  evaluation: "/api/evaluation/ps6",
} as const;

export class ApiServiceError extends Error {
  status?: number | undefined;
  code?: string | undefined;
  isNetworkError: boolean;
  details?: unknown;

  constructor(
    message: string,
    options?: {
      status?: number;
      code?: string;
      isNetworkError?: boolean;
      details?: unknown;
    },
  ) {
    super(message);
    this.name = "ApiServiceError";
    this.status = options?.status;
    this.code = options?.code;
    this.isNetworkError = Boolean(options?.isNetworkError);
    this.details = options?.details;
  }
}

export function mapDemoRoleToBackendHeader(role: UserDemoRole): BackendApiRoleHeader {
  switch (role) {
    case "Procurement Manager":
      return "PROCUREMENT_MANAGER";
    case "Operations Manager":
      return "OPERATIONS_MANAGER";
    case "System Operator":
      return "ADMIN";
    case "Inventory Planner":
    default:
      return "INVENTORY_PLANNER";
  }
}

function normalizeBaseUrl(baseUrl?: string): string {
  const raw = (baseUrl ?? ENV_CONFIG.apiBaseUrl).trim().replace(/\/+$/, "");
  return raw || ENV_CONFIG.apiBaseUrl;
}

export async function requestFastApi<TResponse>(
  baseUrl: string | undefined,
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<TResponse> {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const timeoutMs = init?.timeoutMs ?? 25000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${normalizedBase}${path}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

    const rawText = await response.text();
    let parsedBody: unknown = null;
    if (rawText.trim()) {
      try {
        parsedBody = JSON.parse(rawText);
      } catch {
        parsedBody = null;
      }
    }

    if (!response.ok) {
      const errRecord = parsedBody as {
        error?: { code?: string; message?: string; details?: unknown };
        detail?: string;
      } | null;
      const errMessage =
        errRecord?.error?.message ||
        errRecord?.detail ||
        `The service returned an unexpected error (status ${response.status}).`;
      const errCode = errRecord?.error?.code || `HTTP_${response.status}`;
      throw new ApiServiceError(errMessage, {
        status: response.status,
        code: errCode,
        details: errRecord?.error?.details ?? null,
      });
    }

    if (parsedBody === null) {
      throw new ApiServiceError("Backend returned an empty or non-JSON response.", {
        status: response.status,
        code: "INVALID_RESPONSE",
      });
    }

    return parsedBody as TResponse;
  } catch (err) {
    if (err instanceof ApiServiceError) {
      throw err;
    }
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiServiceError(
        `Request timed out. The analysis service may be busy — please try again.`,
        { code: "REQUEST_TIMEOUT", isNetworkError: true },
      );
    }
    throw new ApiServiceError(
      `Unable to reach the ResolveX service. Please check your connection and try again.`,
      { code: "BACKEND_UNREACHABLE", isNetworkError: true },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

function mapAmbiguityTypeToUiCategory(rawType: string): AmbiguityCategory {
  const t = rawType.toLowerCase();
  if (t.includes("referential") || t.includes("contextual")) return "Referential";
  if (t.includes("lexical")) return "Lexical";
  if (t.includes("structural") || t.includes("syntactic")) return "Syntactic";
  if (t.includes("temporal")) return "Temporal";
  if (t.includes("underspecification") || t.includes("scope")) return "Scope";
  return "Pragmatic";
}

function deriveSpansFromBackend(prompt: string, backend: BackendAnalyzeResponse): AmbiguitySpan[] {
  const categories =
    backend.ambiguity_types.length > 0
      ? backend.ambiguity_types.map(mapAmbiguityTypeToUiCategory)
      : backend.needs_clarification
        ? (["Pragmatic"] as AmbiguityCategory[])
        : [];

  if (!backend.needs_clarification || categories.length === 0) {
    return [];
  }

  const candidateTargets = [
    ...backend.missing_required_info,
    ...backend.interpretations.map((i) => i.label),
  ];

  const spans: AmbiguitySpan[] = [];
  const lowerPrompt = prompt.toLowerCase();
  const usedRanges: Array<[number, number]> = [];

  // Try matching meaningful words from missing info or pronouns against the prompt
  const fallbackTokens = [
    "it",
    "this",
    "that",
    "them",
    "they",
    "soon",
    "later",
    "report",
    "rahul",
    "tomorrow",
  ];
  const searchTokens = [
    ...candidateTargets.flatMap((t) =>
      t
        .split(/\s+/)
        .map((w) => w.replace(/[^a-zA-Z0-9_-]/g, ""))
        .filter((w) => w.length >= 3),
    ),
    ...fallbackTokens,
  ];

  for (const token of searchTokens) {
    if (spans.length >= Math.max(1, categories.length)) break;
    const idx = lowerPrompt.indexOf(token.toLowerCase());
    if (idx === -1) continue;
    const end = idx + token.length;
    const overlaps = usedRanges.some(([s, e]) => idx < e && end > s);
    if (overlaps) continue;
    usedRanges.push([idx, end]);
    const cat = categories[spans.length % categories.length] ?? "Pragmatic";
    spans.push({
      id: `span-${spans.length + 1}`,
      token: prompt.slice(idx, end),
      startIndex: idx,
      endIndex: end,
      category: cat,
      severity: backend.status === "NEEDS_CLARIFICATION" ? 75 : 30,
      confidence: 0.9,
      reason:
        backend.missing_required_info[spans.length] ??
        `Detected ${backend.ambiguity_types[spans.length] ?? cat.toLowerCase()} ambiguity by ResolveX backend.`,
      candidateMeanings:
        backend.interpretations.map((i) => i.label).slice(0, 3).length > 0
          ? backend.interpretations.map((i) => i.label).slice(0, 3)
          : ["Requires user clarification"],
    });
  }

  // If no substring matched, attach a single whole-prompt span representing backend classification
  if (spans.length === 0 && prompt.trim().length > 0) {
    const firstWordMatch = prompt.match(/\S+/);
    const token = firstWordMatch ? firstWordMatch[0] : prompt;
    const cat = categories[0] ?? "Pragmatic";
    spans.push({
      id: "span-1",
      token,
      startIndex: 0,
      endIndex: token.length,
      category: cat,
      severity: 72,
      confidence: 0.88,
      reason:
        backend.missing_required_info[0] ??
        `Classified as ${backend.classification ?? "ambiguous"} (${backend.ambiguity_types.join(", ") || "needs clarification"}).`,
      candidateMeanings: backend.interpretations.map((i) => i.label).slice(0, 3),
    });
  }

  return spans;
}

export function adaptBackendAnalysisToUi(
  prompt: string,
  backend: BackendAnalyzeResponse,
  domain: DomainContext,
  strictness: StrictnessLevel,
  language: LanguageOption = "Auto Detect",
): AnalysisResult {
  const multilingual = detectLanguageMetadata(prompt, language);
  const spans = deriveSpansFromBackend(prompt, backend);

  const ambiguityScore =
    backend.status === "RESOLVED"
      ? 0
      : backend.classification === "incomplete" || backend.classification === "ambiguous"
        ? 78
        : 62;
  const clarityScore = 100 - ambiguityScore;

  const riskLevel: RiskLevel =
    backend.status === "RESOLVED" ? "Low" : backend.needs_clarification ? "High" : "Moderate";

  const categoryCounts = new Map<AmbiguityCategory, { count: number; total: number }>();
  for (const s of spans) {
    const prev = categoryCounts.get(s.category) ?? { count: 0, total: 0 };
    categoryCounts.set(s.category, { count: prev.count + 1, total: prev.total + s.severity });
  }
  const categoryBreakdown: CategoryScore[] = Array.from(categoryCounts.entries()).map(
    ([category, info]) => ({
      category,
      count: info.count,
      score: Math.round(info.total / info.count),
    }),
  );

  const interpretations: Interpretation[] = backend.interpretations.map((item, idx) => ({
    id: `interp-${idx + 1}`,
    title: item.label,
    summary: item.description,
    impactScope: domain,
    riskLevel: idx === 0 ? "Moderate" : "High",
    assumptions: [item.description],
    recommendedAction: item.label,
    simulatedIntent: {
      action: backend.resolved_intent?.action ?? "clarify_then_execute",
      entities: [],
      recipient: "Pending clarification",
      object: prompt,
      date: "Pending",
      resolvedDirective: item.description,
    },
    triggerWords: [],
    consequences: [],
  }));

  const clarificationQuestions: ClarificationQuestion[] = backend.clarification_questions.map(
    (qText, idx) => ({
      id: `q-turn${backend.turn_count}-${idx + 1}`,
      targetSpanId: spans[idx]?.id ?? spans[0]?.id ?? "span-1",
      targetToken: spans[idx]?.token ?? backend.missing_required_info[idx] ?? "instruction",
      category: spans[idx]?.category ?? "Pragmatic",
      question: qText,
      rationale:
        backend.missing_required_info[idx] ?? "Generated by ResolveX clarification engine.",
      importanceScore: 95 - idx * 10,
      essentialField: idx === 0 ? "Target Entity" : "Action Scope",
      isEssential: true,
      estimatedClarityGain: Math.round(
        ambiguityScore / Math.max(1, backend.clarification_questions.length),
      ),
      necessityReason: "Required by backend ambiguity analysis to resolve intent.",
      selectionExplanation: `Turn ${backend.turn_count} question from the ResolveX analysis engine.`,
      options: interpretations.slice(0, 3).map((interp, optIdx) => ({
        id: `opt-${idx}-${optIdx}`,
        label: interp.title,
        description: interp.summary,
        resolvesTo: `${interp.title}: ${interp.summary}`,
      })),
    }),
  );

  const isResolved = backend.status === "RESOLVED" && Boolean(backend.resolved_intent);
  const resolvedIntent = backend.resolved_intent;
  const paramsEntries = resolvedIntent ? Object.entries(resolvedIntent.parameters ?? {}) : [];

  const verification: ResolutionVerificationReport = {
    status: isResolved ? "Verified" : "Needs Clarification",
    allRequiredPassed: isResolved,
    completenessScore: isResolved ? 100 : clarityScore,
    completenessExplanation: isResolved
      ? "Resolved and persisted by ResolveX backend."
      : `Backend status is ${backend.status}; answer the clarification questions to resolve intent.`,
    requiredTotal: Math.max(1, clarificationQuestions.length),
    requiredPassed: isResolved ? Math.max(1, clarificationQuestions.length) : 0,
    optionalTotal: 0,
    optionalPassed: 0,
    missingFields: isResolved ? [] : ["Target Entity"],
    ambiguousFields: [],
    contradictions: [],
    contradictoryFields: [],
    fieldChecks: [
      {
        field: "Action Scope",
        required: true,
        status: isResolved ? "Passed" : "Missing",
        explanation: resolvedIntent
          ? `Action: ${resolvedIntent.action}`
          : "Waiting for backend intent resolution.",
        resolvedValue: resolvedIntent?.action,
        targetQuestionId: clarificationQuestions[0]?.id ?? null,
      },
      {
        field: "Target Entity",
        required: true,
        status: isResolved ? "Passed" : "Ambiguous",
        explanation:
          paramsEntries.length > 0
            ? paramsEntries.map(([k, v]) => `${k}=${String(v)}`).join(", ")
            : isResolved
              ? "No ambiguous parameters remaining."
              : backend.missing_required_info.join(", ") || "Pending user clarification.",
        resolvedValue:
          paramsEntries.length > 0
            ? paramsEntries.map(([k, v]) => `${k}: ${String(v)}`).join("; ")
            : undefined,
        targetQuestionId: clarificationQuestions[0]?.id ?? null,
      },
    ],
    checkedAt: new Date().toISOString(),
  };

  const defaultResolution: FinalResolution = {
    originalPrompt: prompt,
    resolvedPrompt: resolvedIntent?.resolved_instruction ?? prompt,
    clarityGain: isResolved ? (backend.turn_count > 1 ? 78 : 100 - clarityScore) : 0,
    remainingAmbiguityScore: isResolved ? 0 : ambiguityScore,
    structuredSpec: {
      intentType: resolvedIntent?.action ?? backend.classification ?? "analyzing",
      primarySubject: paramsEntries[0]
        ? `${paramsEntries[0][0]}: ${String(paramsEntries[0][1])}`
        : domain,
      targetScope: backend.inventory_insight ? "Smart Inventory Intelligence" : domain,
      constraints: paramsEntries.map(([k, v]) => `${k} = ${String(v)}`),
      timeHorizon: String(
        resolvedIntent?.parameters?.["time"] ?? resolvedIntent?.parameters?.["date"] ?? "Immediate",
      ),
      outputFormat: resolvedIntent?.direct_answer
        ? "Direct Answer + Structured Intent"
        : "Structured JSON Intent",
      confidenceAfterClarification: isResolved ? 100 : clarityScore,
    },
    appliedDecisions: paramsEntries.map(([k, v]) => ({
      token: k,
      decision: String(v),
      essentialField: "Target Entity",
    })),
    optimizationSummary: {
      turnsTaken: Math.max(0, backend.turn_count - 1),
      totalQuestionsAvailable: Math.max(
        backend.turn_count - 1,
        clarificationQuestions.length,
        isResolved && backend.turn_count > 1 ? backend.turn_count - 1 : 0,
      ),
      skippedOptionalCount: 0,
      stoppedEarly: isResolved && backend.turn_count <= 2,
      stopReason: isResolved
        ? `Resolved by ResolveX backend in ${backend.turn_count} turn(s).`
        : null,
      essentialFields: verification.fieldChecks.map((fc) => ({
        field: fc.field,
        required: fc.required,
        status: fc.status === "Passed" ? "Clear" : "Needs Clarification",
        resolvedValue: fc.resolvedValue,
      })),
    },
    verification,
    generatedAt: new Date().toISOString(),
  };

  const summary = isResolved
    ? resolvedIntent?.direct_answer ||
      `Resolved cleanly as "${resolvedIntent?.action}" without further clarification.`
    : `Classified as "${backend.classification ?? "ambiguous"}" (${backend.ambiguity_types.join(", ") || "clarification needed"}). ${backend.clarification_questions.length} targeted question(s) generated.`;

  return {
    id: backend.conversation_id,
    prompt,
    domain,
    strictness,
    createdAt: new Date().toISOString(),
    isDemoData: false,
    ambiguityScore,
    clarityScore,
    riskLevel,
    summary,
    multilingual,
    spans,
    categoryBreakdown,
    interpretations,
    clarificationQuestions,
    defaultResolution,
    backendData: backend,
  };
}

export const resolveXService = {
  getEndpointUrl(baseUrl: string, endpoint: keyof typeof API_ENDPOINTS): string {
    const cleanBase = normalizeBaseUrl(baseUrl);
    return `${cleanBase}${API_ENDPOINTS[endpoint]}`;
  },

  async checkHealth(baseUrl?: string): Promise<BackendHealthStatus> {
    const cleanBase = normalizeBaseUrl(baseUrl);
    try {
      const res = await requestFastApi<{
        status: "ok" | "degraded";
        service: string;
        database: "connected" | "disconnected";
        ai_configured: boolean;
      }>(cleanBase, API_ENDPOINTS.health, { timeoutMs: 6000 });
      return {
        reachable: true,
        mode: "live",
        baseUrl: cleanBase,
        checkedAt: new Date().toISOString(),
        service: res.service,
        database: res.database,
        aiConfigured: res.ai_configured,
        message: `Connected to ${res.service} (DB: ${res.database}, Gemini AI: ${res.ai_configured ? "configured" : "fallback mode"}).`,
      };
    } catch (err) {
      return {
        reachable: false,
        mode: "live",
        baseUrl: cleanBase,
        checkedAt: new Date().toISOString(),
        message: err instanceof Error ? err.message : `Unable to connect to ${cleanBase}.`,
      };
    }
  },

  // --- PS6 Real Backend Endpoints ---

  async analyzeWithBackend(
    instruction: string,
    context?: string,
    baseUrl?: string,
  ): Promise<BackendAnalyzeResponse> {
    const trimmed = instruction.trim();
    if (!trimmed) {
      throw new ApiServiceError("Instruction cannot be empty.", { code: "VALIDATION_ERROR" });
    }
    return requestFastApi<BackendAnalyzeResponse>(baseUrl, API_ENDPOINTS.analyze, {
      method: "POST",
      body: JSON.stringify({
        instruction: trimmed,
        context: context?.trim() || undefined,
      }),
      timeoutMs: 30000,
    });
  },

  async clarifyWithBackend(
    conversationId: string,
    responseText: string,
    baseUrl?: string,
  ): Promise<BackendAnalyzeResponse> {
    const trimmed = responseText.trim();
    if (!conversationId || !trimmed) {
      throw new ApiServiceError("Conversation ID and clarification response are required.", {
        code: "VALIDATION_ERROR",
      });
    }
    return requestFastApi<BackendAnalyzeResponse>(baseUrl, API_ENDPOINTS.clarify, {
      method: "POST",
      body: JSON.stringify({
        conversation_id: conversationId,
        response: trimmed,
      }),
      timeoutMs: 30000,
    });
  },

  async resolveWithBackend(
    conversationId: string,
    baseUrl?: string,
  ): Promise<BackendAnalyzeResponse> {
    return requestFastApi<BackendAnalyzeResponse>(baseUrl, API_ENDPOINTS.resolve, {
      method: "POST",
      body: JSON.stringify({ conversation_id: conversationId }),
      timeoutMs: 15000,
    });
  },

  async listConversations(
    limit = 20,
    offset = 0,
    baseUrl?: string,
  ): Promise<{ conversations: BackendConversationSummary[]; total: number }> {
    return requestFastApi<{ conversations: BackendConversationSummary[]; total: number }>(
      baseUrl,
      `${API_ENDPOINTS.conversations}?limit=${limit}&offset=${offset}`,
    );
  },

  async getConversationDetail(
    conversationId: string,
    baseUrl?: string,
  ): Promise<BackendConversationDetail> {
    return requestFastApi<BackendConversationDetail>(
      baseUrl,
      `${API_ENDPOINTS.conversations}?conversation_id=${encodeURIComponent(conversationId)}`,
    );
  },

  async deleteConversation(conversationId: string, baseUrl?: string): Promise<void> {
    await requestFastApi<unknown>(
      baseUrl,
      `${API_ENDPOINTS.conversations}/${encodeURIComponent(conversationId)}`,
      { method: "DELETE" },
    );
  },

  async renameConversation(conversationId: string, title: string, baseUrl?: string): Promise<void> {
    await requestFastApi<unknown>(
      baseUrl,
      `${API_ENDPOINTS.conversations}/${encodeURIComponent(conversationId)}`,
      { method: "PATCH", body: JSON.stringify({ title }) },
    );
  },

  // --- PS2 Real Backend Endpoints ---

  async getInventoryOverview(baseUrl?: string): Promise<BackendInventoryOverviewResponse> {
    return requestFastApi<BackendInventoryOverviewResponse>(
      baseUrl,
      API_ENDPOINTS.inventoryOverview,
    );
  },

  async getInventoryMaterials(baseUrl?: string): Promise<BackendMaterialOverview[]> {
    return requestFastApi<BackendMaterialOverview[]>(baseUrl, API_ENDPOINTS.inventoryMaterials);
  },

  async getInventoryShortages(
    baseUrl?: string,
  ): Promise<{ shortages: BackendShortageItem[]; count: number }> {
    return requestFastApi<{ shortages: BackendShortageItem[]; count: number }>(
      baseUrl,
      API_ENDPOINTS.inventoryShortages,
    );
  },

  async getOrders(baseUrl?: string): Promise<{ orders: BackendOrderRow[]; count: number }> {
    return requestFastApi<{ orders: BackendOrderRow[]; count: number }>(
      baseUrl,
      API_ENDPOINTS.orders,
    );
  },

  async getOrderRisks(baseUrl?: string): Promise<BackendOrderRiskItem[]> {
    return requestFastApi<BackendOrderRiskItem[]>(baseUrl, API_ENDPOINTS.orderRisks);
  },

  async getAllocations(baseUrl?: string): Promise<BackendAllocationRecord[]> {
    return requestFastApi<BackendAllocationRecord[]>(baseUrl, API_ENDPOINTS.inventoryAllocations);
  },

  async recalculateAllocations(baseUrl?: string): Promise<BackendAllocationRecord[]> {
    return requestFastApi<BackendAllocationRecord[]>(
      baseUrl,
      API_ENDPOINTS.recalculateAllocations,
      { method: "POST" },
    );
  },

  async ingestInventoryEvent(
    payload: {
      event_id: string;
      event_type: string;
      entity_ref: string;
      payload: Record<string, unknown>;
      simulated?: boolean;
    },
    baseUrl?: string,
  ): Promise<BackendEventIngestionResponse> {
    return requestFastApi<BackendEventIngestionResponse>(baseUrl, API_ENDPOINTS.inventoryEvents, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async listInventoryEvents(
    limit = 25,
    baseUrl?: string,
  ): Promise<{ events: BackendInventoryEvent[]; count: number }> {
    return requestFastApi<{ events: BackendInventoryEvent[]; count: number }>(
      baseUrl,
      `${API_ENDPOINTS.inventoryEvents}?limit=${limit}`,
    );
  },

  async getAlerts(baseUrl?: string): Promise<{ alerts: BackendAlertItem[]; count: number }> {
    return requestFastApi<{ alerts: BackendAlertItem[]; count: number }>(
      baseUrl,
      API_ENDPOINTS.alerts,
    );
  },

  async acknowledgeAlert(
    alertId: number,
    baseUrl?: string,
  ): Promise<{ alert_id: number; acknowledged: boolean }> {
    return requestFastApi<{ alert_id: number; acknowledged: boolean }>(
      baseUrl,
      `${API_ENDPOINTS.alerts}/${alertId}/acknowledge`,
      { method: "POST" },
    );
  },

  async getBriefing(
    role: BackendApiRoleHeader,
    baseUrl?: string,
  ): Promise<BackendBriefingResponse> {
    return requestFastApi<BackendBriefingResponse>(
      baseUrl,
      `${API_ENDPOINTS.briefings}?role=${encodeURIComponent(role)}`,
      {
        headers: { "X-User-Role": role },
        timeoutMs: 30000,
      },
    );
  },

  async getPurchaseProposals(
    status?: string,
    baseUrl?: string,
  ): Promise<BackendPurchaseOrderProposal[]> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    return requestFastApi<BackendPurchaseOrderProposal[]>(
      baseUrl,
      `${API_ENDPOINTS.poProposals}${qs}`,
    );
  },

  async generatePurchaseProposals(baseUrl?: string): Promise<BackendPurchaseOrderProposal[]> {
    return requestFastApi<BackendPurchaseOrderProposal[]>(baseUrl, API_ENDPOINTS.poProposals, {
      method: "POST",
    });
  },

  async decidePurchaseProposal(
    proposalId: string,
    decision: "approve" | "reject",
    roleHeader: BackendApiRoleHeader,
    userName = "Demo User",
    comment?: string,
    baseUrl?: string,
  ): Promise<{
    proposal_id: string;
    decision: "APPROVED" | "REJECTED";
    decided_by: string;
    decided_role: string;
    timestamp: string;
    note: string;
  }> {
    return requestFastApi(baseUrl, `${API_ENDPOINTS.poProposals}/${proposalId}/${decision}`, {
      method: "POST",
      headers: {
        "X-User-Role": roleHeader,
        "X-User-Name": userName,
      },
      body: JSON.stringify({ comment: comment ?? null }),
    });
  },

  // --- Evaluation Endpoints ---

  async getPs2Evaluation(
    runNow = true,
    baseUrl?: string,
    roleHeader?: BackendApiRoleHeader,
  ): Promise<{ source: string; evaluation: BackendPs2Evaluation }> {
    return requestFastApi(baseUrl, `${API_ENDPOINTS.evalPs2}?run_now=${runNow ? "true" : "false"}`, {
      headers: roleHeader ? { "X-User-Role": roleHeader } : {},
    });
  },

  async getPs6Evaluation(
    runNow = false,
    baseUrl?: string,
    roleHeader?: BackendApiRoleHeader,
  ): Promise<{ source: string; message?: string; evaluation: BackendPs6Evaluation | null }> {
    return requestFastApi(
      baseUrl,
      `${API_ENDPOINTS.evalPs6}?run_now=${runNow ? "true" : "false"}`,
      {
        timeoutMs: runNow ? 120000 : 12000,
        headers: roleHeader ? { "X-User-Role": roleHeader } : {},
      },
    );
  },

  // --- Local Helpers & Optional Mock Mode Compatibility ---

  async analyzePrompt(payload: AnalyzePromptRequest): Promise<AnalysisResult> {
    const trimmed = payload.prompt.trim();
    if (!trimmed) {
      throw new ApiServiceError("Prompt cannot be empty.");
    }

    return analyzeCustomPromptMock(
      trimmed,
      payload.domain,
      payload.strictness,
      payload.maxQuestions ?? 3,
      payload.language ?? "Auto Detect",
    );
  },

  evaluateClarificationState(
    analysis: AnalysisResult,
    answers: ClarificationAnswer[],
    ambiguityThreshold: number,
    allowOptionalRefinement = false,
    selectedInterpretation: Interpretation | null = null,
  ): ClarificationOptimizerState {
    if (!analysis.isDemoData && analysis.backendData) {
      const b = analysis.backendData;
      const isResolved = b.status === "RESOLVED";
      const remainingQuestions = isResolved ? [] : analysis.clarificationQuestions;
      return {
        initialAmbiguityScore: analysis.ambiguityScore,
        remainingAmbiguityScore: isResolved ? 0 : analysis.ambiguityScore,
        initialClarityScore: analysis.clarityScore,
        currentClarityScore: isResolved ? 100 : analysis.clarityScore,
        progressPercentage: isResolved ? 100 : Math.min(85, Math.max(15, (b.turn_count - 1) * 35)),
        essentialFields:
          analysis.defaultResolution.verification?.fieldChecks.map((fc) => ({
            field: fc.field,
            required: fc.required,
            status: fc.status === "Passed" ? "Clear" : "Needs Clarification",
            resolvedValue: fc.resolvedValue,
          })) ?? [],
        rankedAmbiguities: [],
        unresolvedQuestionsQueue: remainingQuestions,
        activeQuestion: remainingQuestions[0] ?? null,
        activeSelectionReason: isResolved
          ? "Backend marked conversation RESOLVED."
          : `Turn ${b.turn_count}: awaiting clarification.`,
        isSufficientlyClear: isResolved,
        stopReason: isResolved ? "Resolved by ResolveX backend." : null,
        skippedOptionalCount: 0,
        conversationHistory: answers,
      };
    }

    return computeClarificationOptimizerState(
      analysis,
      answers,
      ambiguityThreshold,
      allowOptionalRefinement,
      selectedInterpretation,
    );
  },

  verifyResolutionReadiness(
    analysis: AnalysisResult,
    answers: ClarificationAnswer[],
    selectedInterpretation: Interpretation | null = null,
  ): ResolutionVerificationReport {
    if (!analysis.isDemoData && analysis.defaultResolution.verification) {
      return analysis.defaultResolution.verification;
    }
    return computeResolutionVerification(analysis, answers, selectedInterpretation);
  },

  buildContextGraph(
    analysis: AnalysisResult,
    answers: ClarificationAnswer[],
    selectedInterpretation: Interpretation | null,
    optimizerState: ClarificationOptimizerState,
    confidenceAssessment?: ConfidenceAssessment,
  ): ContextIntelligenceGraphData {
    return buildContextIntelligenceGraph(
      analysis,
      answers,
      selectedInterpretation,
      optimizerState,
      confidenceAssessment,
    );
  },

  evaluateConfidenceAndUncertainty(
    analysis: AnalysisResult,
    clarificationAnswers: ClarificationAnswer[],
    selectedInterpretation: Interpretation | null,
    verificationReport: ResolutionVerificationReport,
    optimizerState: ClarificationOptimizerState,
  ): {
    assessment: ConfidenceAssessment;
    interpretations: Interpretation[];
  } {
    const assessment = computeClientConfidenceAssessment({
      analysis,
      clarificationAnswers,
      selectedInterpretation,
      verificationReport,
      optimizerState,
    });
    const interpretations = enrichInterpretationsWithConfidence(
      analysis.interpretations,
      assessment,
      clarificationAnswers,
    );
    return { assessment, interpretations };
  },

  async analyzePromptLive(
    baseUrl: string,
    payload: AnalyzePromptRequest,
  ): Promise<{ analysis: AnalysisResult; raw: BackendAnalyzeResponse }> {
    const trimmed = payload.prompt.trim();
    if (!trimmed) {
      throw new ApiServiceError("Prompt cannot be empty.");
    }
    const baseCtx = `Domain: ${payload.domain} | Strictness: ${payload.strictness}`;
    const fullContext = payload.contextSummary ? `${baseCtx} | ${payload.contextSummary}` : baseCtx;
    const raw = await requestFastApi<BackendAnalyzeResponse>(baseUrl, API_ENDPOINTS.analyze, {
      method: "POST",
      body: JSON.stringify({
        instruction: trimmed,
        context: fullContext,
      }),
    });
    return {
      analysis: mapBackendAnalyzeToAnalysisResult(raw, trimmed, payload.domain, payload.strictness),
      raw,
    };
  },

  async clarifyBackendTurn(
    baseUrl: string,
    conversationId: string,
    responseText: string,
    originalPrompt: string,
    domain: DomainContext,
    strictness: StrictnessLevel,
    previousAnalysis?: AnalysisResult,
  ): Promise<{ analysis: AnalysisResult; raw: BackendAnalyzeResponse }> {
    const raw = await requestFastApi<BackendAnalyzeResponse>(baseUrl, API_ENDPOINTS.clarify, {
      method: "POST",
      body: JSON.stringify({
        conversation_id: conversationId,
        response: responseText.trim(),
      }),
    });
    return {
      analysis: mapBackendAnalyzeToAnalysisResult(
        raw,
        originalPrompt,
        domain,
        strictness,
        previousAnalysis,
      ),
      raw,
    };
  },

  async resolveBackendIntent(
    baseUrl: string,
    conversationId: string,
  ): Promise<BackendAnalyzeResponse> {
    return requestFastApi<BackendAnalyzeResponse>(baseUrl, API_ENDPOINTS.resolve, {
      method: "POST",
      body: JSON.stringify({ conversation_id: conversationId }),
    });
  },

  simulateInterpretationDiffs(interpretations: Interpretation[]): ScenarioDimensionDiff[] {
    return computeInterpretationDiffs(interpretations);
  },

  async resolveIntent(
    analysis: AnalysisResult,
    request: ResolveIntentRequest,
    selectedInterpretation: Interpretation | null,
    ambiguityThreshold = 60,
  ): Promise<FinalResolution> {
    if (!analysis.isDemoData && analysis.backendData) {
      return analysis.defaultResolution;
    }

    await new Promise((resolve) => setTimeout(resolve, 150));

    const optimizerState = computeClarificationOptimizerState(
      analysis,
      request.answers,
      ambiguityThreshold,
      false,
      selectedInterpretation,
    );

    const verification = computeResolutionVerification(
      analysis,
      request.answers,
      selectedInterpretation,
    );

    const baseResolution = computeResolutionFromInputs(
      request.prompt,
      analysis.spans,
      selectedInterpretation,
      request.answers,
      analysis.domain,
      analysis.clarificationQuestions,
      analysis.contextMemory,
    );

    const remainingAmbiguityScore = optimizerState.remainingAmbiguityScore;
    const clarityGain = Math.max(0, optimizerState.currentClarityScore - analysis.clarityScore);

    return {
      ...baseResolution,
      clarityGain,
      remainingAmbiguityScore,
      structuredSpec: {
        ...baseResolution.structuredSpec,
        confidenceAfterClarification: 100 - remainingAmbiguityScore,
      },
      optimizationSummary: {
        turnsTaken: optimizerState.conversationHistory.length,
        totalQuestionsAvailable: analysis.clarificationQuestions.length,
        skippedOptionalCount: optimizerState.skippedOptionalCount,
        stoppedEarly: optimizerState.isSufficientlyClear && optimizerState.skippedOptionalCount > 0,
        stopReason: optimizerState.stopReason,
        essentialFields: optimizerState.essentialFields,
      },
      verification,
    };
  },

  async getEvaluationDataset(): Promise<EvaluationDataset> {
    return DEMO_EVALUATION_DATA;
  },

  async runBackendPs6Evaluation(
    baseUrl: string,
    adversarialOnly = true,
  ): Promise<BackendEvaluationPs6Response> {
    const query = `run_now=true&adversarial_only=${adversarialOnly ? "true" : "false"}`;
    return requestFastApi<BackendEvaluationPs6Response>(
      baseUrl,
      `${API_ENDPOINTS.evaluation}?${query}`,
      { method: "GET" },
    );
  },

  async previewBackendConnection(
    baseUrl: string,
    mode: "live" | "mock",
  ): Promise<BackendHealthStatus> {
    const cleanBase = normalizeBaseUrl(baseUrl) || ENV_CONFIG.apiBaseUrl;
    if (mode === "mock") {
      return {
        reachable: false,
        mode,
        baseUrl: cleanBase,
        checkedAt: new Date().toISOString(),
        message:
          "Local Simulation Mode active (DEMO DATA — no backend requests sent). Switch to Live FastAPI Backend to run real /api/analyze requests.",
      };
    }

    try {
      const health = await requestFastApi<{
        status: string;
        service: string;
        database: string;
        ai_configured: boolean;
      }>(cleanBase, API_ENDPOINTS.health, { method: "GET" });
      return {
        reachable: true,
        mode,
        baseUrl: cleanBase,
        checkedAt: new Date().toISOString(),
        aiConfigured: health.ai_configured,
        service: health.service,
        database: health.database === "connected" ? "connected" : "disconnected",
        message: `Connected to ${health.service} (status: ${health.status}, DB: ${health.database}, AI configured: ${health.ai_configured ? "Yes" : "No — fallback abstention active"}).`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      return {
        reachable: false,
        mode,
        baseUrl: cleanBase,
        checkedAt: new Date().toISOString(),
        message: `FastAPI backend unreachable at ${cleanBase}${API_ENDPOINTS.health} (${msg}). Simulation fallback remains explicitly labeled as non-model output.`,
      };
    }
  },
};
