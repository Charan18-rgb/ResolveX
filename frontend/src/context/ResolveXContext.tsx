import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  INITIAL_APPROVALS,
  INITIAL_INVENTORY_MATERIALS,
  INITIAL_INVENTORY_ORDERS,
  INITIAL_NOTIFICATIONS,
  INITIAL_PURCHASE_RECOMMENDATIONS,
} from "@/data/inventoryMockData";
import {
  analyzeCustomPromptMock,
  buildPresetAnalysis,
  computeResolutionFromInputs,
  DEFAULT_APP_SETTINGS,
  EXAMPLE_PROMPTS,
} from "@/data/mockData";
import {
  appendMessageToSessionMemory,
  applySessionMemoryToAnalysis,
  createEmptySessionMemory,
  recomputeMemoryReferencesForPrompt,
  serializeSessionMemoryForContext,
} from "@/data/contextMemoryEngine";
import { evaluateClientIntentRisk } from "@/data/riskEngine";
import { generateDecisionTimeline } from "@/data/decisionTimelineEngine";
import { MULTILINGUAL_SAMPLE_CASES, resolveUiLanguage } from "@/data/multilingualEngine";
import {
  adaptBackendAnalysisToUi,
  ApiServiceError,
  mapDemoRoleToBackendHeader,
  resolveXService,
} from "@/services/api";
import type {
  AnalysisResult,
  AppSettings,
  AssistantMessage,
  BackendAlertItem,
  BackendBriefingResponse,
  BackendConversationDetail,
  BackendEventIngestionResponse,
  BackendHealthStatus,
  BackendInventoryEvent,
  BackendInventoryOverviewResponse,
  BackendOrderRiskItem,
  BackendOrderRow,
  BackendPurchaseOrderProposal,
  BackendShortageItem,
  ClarificationAnswer,
  DomainContext,
  FinalResolution,
  InventoryApprovalItem,
  InventoryMaterial,
  InventoryOrder,
  LanguageOption,
  NotificationItem,
  PurchaseRecommendation,
  SessionContextMemory,
  SessionHistoryItem,
  StrictnessLevel,
  UserDemoRole,
} from "@/types/resolvex";
import { ResolveXContext, type ResolveXContextValue } from "./resolveXContextDef";

const STORAGE_KEYS = {
  settings: "resolvex_settings_v3",
  history: "resolvex_history_v3",
} as const;

const ANALYSIS_STAGES = [
  "Connecting to ResolveX engine...",
  "Analyzing context & entities...",
  "Detecting ambiguity & interpretations...",
  "Checking domain routing & intent...",
] as const;

export function ResolveXProvider({ children }: { children: ReactNode }) {
  const initialPreset = useMemo(() => buildPresetAnalysis("ex-deploy-fast"), []);

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [backendHealth, setBackendHealth] = useState<BackendHealthStatus | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const [promptInput, setPromptInput] = useState<string>(EXAMPLE_PROMPTS[0]?.prompt ?? "");
  const [domain, setDomain] = useState<DomainContext>(DEFAULT_APP_SETTINGS.defaultDomain);
  const [strictness, setStrictness] = useState<StrictnessLevel>(
    DEFAULT_APP_SETTINGS.defaultStrictness,
  );
  const [language, setLanguage] = useState<LanguageOption>("Auto Detect");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSubmittingClarification, setIsSubmittingClarification] = useState(false);
  const [analysisStage, setAnalysisStage] = useState(0);
  const [analysisStageLabel, setAnalysisStageLabel] = useState("");
  const [activeAnalysis, setActiveAnalysis] = useState<AnalysisResult>(initialPreset);
  const [activeConversationDetail, setActiveConversationDetail] =
    useState<BackendConversationDetail | null>(null);
  const [selectedInterpretationId, setSelectedInterpretationId] = useState<string | null>(
    initialPreset.interpretations[0]?.id ?? null,
  );
  const [clarificationAnswers, setClarificationAnswers] = useState<ClarificationAnswer[]>([]);
  const [allowOptionalRefinement, setAllowOptionalRefinement] = useState(false);
  const [focusedQuestionId, setFocusedQuestionId] = useState<string | null>(null);
  const [liveBackendNotice, setLiveBackendNotice] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string>("sess-initial");
  const [continueInSession, setContinueInSession] = useState<boolean>(true);
  const [sessionMemories, setSessionMemories] = useState<Record<string, SessionContextMemory>>(
    () => ({
      "sess-initial": appendMessageToSessionMemory(
        createEmptySessionMemory("sess-initial", initialPreset.prompt.slice(0, 48)),
        initialPreset.prompt,
        "user",
      ),
    }),
  );
  const [finalResolution, setFinalResolution] = useState<FinalResolution>(
    initialPreset.defaultResolution,
  );
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>([]);

  // PS2 Inventory State (live backend authoritative + mapped views)
  const [activeRole, setActiveRole] = useState<UserDemoRole>(DEFAULT_APP_SETTINGS.defaultRole);
  const [isLoadingInventory, setIsLoadingInventory] = useState(false);
  const [ps2Error, setPs2Error] = useState<string | null>(null);
  const [backendInventoryOverview, setBackendInventoryOverview] =
    useState<BackendInventoryOverviewResponse | null>(null);
  const [backendOrders, setBackendOrders] = useState<BackendOrderRow[]>([]);
  const [backendOrderRisks, setBackendOrderRisks] = useState<BackendOrderRiskItem[]>([]);
  const [backendShortages, setBackendShortages] = useState<BackendShortageItem[]>([]);
  const [backendProposals, setBackendProposals] = useState<BackendPurchaseOrderProposal[]>([]);
  const [backendAlerts, setBackendAlerts] = useState<BackendAlertItem[]>([]);
  const [backendBriefing, setBackendBriefing] = useState<BackendBriefingResponse | null>(null);
  const [backendEvents, setBackendEvents] = useState<BackendInventoryEvent[]>([]);

  // Local/mock compatibility arrays (populated from real backend when in live mode)
  const [mockMaterials] = useState(INITIAL_INVENTORY_MATERIALS);
  const [mockOrders] = useState(INITIAL_INVENTORY_ORDERS);
  const [mockRecommendations, setMockRecommendations] = useState(INITIAL_PURCHASE_RECOMMENDATIONS);
  const [mockApprovals, setMockApprovals] = useState(INITIAL_APPROVALS);
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(new Set());
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");

  // Shared AI Assistant State
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [isAssistantLoading, setIsAssistantLoading] = useState(false);
  const [assistantConversationId, setAssistantConversationId] = useState<string | null>(null);
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([
    {
      id: "asst-welcome",
      sender: "assistant",
      domainTag: "Unified",
      text: "ResolveX Unified Assistant ready. Ask natural-language questions across language disambiguation and smart inventory intelligence (shortages, MAT-CHIP availability, CRD risks, or pending POs).",
      suggestedRoute: "/inventory",
      suggestedLabel: "Open Inventory Hub",
      timestamp: "Now",
    },
  ]);

  const isAnalyzingRef = useRef(false);
  const clearApiError = useCallback(() => setApiError(null), []);

  // Feature 9: Risk-Aware Intent Confirmation State
  const [userConfirmedHighRisk, setUserConfirmedHighRisk] = useState(false);

  // Hydrate persisted settings & history safely on client only
  useEffect(() => {
    try {
      const rawSettings = localStorage.getItem(STORAGE_KEYS.settings);
      if (rawSettings) {
        const parsed = JSON.parse(rawSettings) as Partial<AppSettings>;
        const merged: AppSettings = {
          ...DEFAULT_APP_SETTINGS,
          ...parsed,
          integrationMode: parsed.integrationMode === "mock" ? "mock" : "live",
        };
        setSettings(merged);
        setDomain(merged.defaultDomain);
        setStrictness(merged.defaultStrictness);
        setActiveRole(merged.defaultRole);
      }
      const rawHistory = localStorage.getItem(STORAGE_KEYS.history);
      if (rawHistory) {
        const parsedHist = JSON.parse(rawHistory) as SessionHistoryItem[];
        if (Array.isArray(parsedHist)) {
          setSessionHistory(parsedHist);
        }
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(sessionHistory.slice(0, 15)));
    } catch {
      // ignore
    }
  }, [sessionHistory]);

  const refreshBackendHealth = useCallback(async (): Promise<BackendHealthStatus> => {
    const status = await resolveXService.previewBackendConnection(
      settings.apiBaseUrl,
      settings.integrationMode,
    );
    setBackendHealth(status);
    return status;
  }, [settings.apiBaseUrl, settings.integrationMode]);

  const refreshConversationsList = useCallback(async () => {
    if (settings.integrationMode !== "live") return;
    try {
      const data = await resolveXService.listConversations(15, 0, settings.apiBaseUrl);
      const mapped: SessionHistoryItem[] = data.conversations.map((c) => ({
        id: c.id,
        prompt: c.original_instruction,
        domain: "General",
        ambiguityScore: c.status === "RESOLVED" ? 0 : 75,
        resolved: c.status === "RESOLVED",
        createdAt: c.updated_at || c.created_at,
      }));
      setSessionHistory(mapped);
    } catch {
      // ignore background history sync error; primary screens surface backend status
    }
  }, [settings.apiBaseUrl, settings.integrationMode]);

  const refreshInventoryData = useCallback(async () => {
    if (settings.integrationMode !== "live") return;
    setIsLoadingInventory(true);
    setPs2Error(null);
    try {
      const [overview, ordersRes, risks, shortagesRes, proposals, alertsRes, eventsRes] =
        await Promise.all([
          resolveXService.getInventoryOverview(settings.apiBaseUrl),
          resolveXService.getOrders(settings.apiBaseUrl),
          resolveXService.getOrderRisks(settings.apiBaseUrl),
          resolveXService.getInventoryShortages(settings.apiBaseUrl),
          resolveXService.getPurchaseProposals(undefined, settings.apiBaseUrl),
          resolveXService.getAlerts(settings.apiBaseUrl),
          resolveXService.listInventoryEvents(20, settings.apiBaseUrl),
        ]);

      setBackendInventoryOverview(overview);
      setBackendOrders(ordersRes.orders);
      setBackendOrderRisks(risks);
      setBackendShortages(shortagesRes.shortages);
      setBackendProposals(proposals);
      setBackendAlerts(alertsRes.alerts);
      setBackendEvents(eventsRes.events);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load inventory data from backend.";
      setPs2Error(msg);
    } finally {
      setIsLoadingInventory(false);
    }
  }, [settings.apiBaseUrl, settings.integrationMode]);

  // Initial client hydration of backend health, PS2 inventory, and PS6 conversation history
  useEffect(() => {
    if (typeof window === "undefined") return;
    void refreshBackendHealth();
    if (settings.integrationMode === "live") {
      void refreshInventoryData();
      void refreshConversationsList();
    }
  }, [
    refreshBackendHealth,
    refreshConversationsList,
    refreshInventoryData,
    settings.integrationMode,
  ]);

  // Re-fetch role briefing whenever activeRole changes
  useEffect(() => {
    if (typeof window === "undefined" || settings.integrationMode !== "live") return;
    const roleHeader = mapDemoRoleToBackendHeader(activeRole);
    void resolveXService
      .getBriefing(roleHeader, settings.apiBaseUrl)
      .then((b) => setBackendBriefing(b))
      .catch(() => {});
  }, [activeRole, settings.apiBaseUrl, settings.integrationMode]);

  // Map live backend inventory entities into legacy UI shapes for global search & notifications
  const materials = useMemo<InventoryMaterial[]>(() => {
    if (settings.integrationMode === "mock" || !backendInventoryOverview) {
      return settings.integrationMode === "mock" ? mockMaterials : [];
    }
    return backendInventoryOverview.materials.map((m) => ({
      id: m.id,
      sku: m.sku,
      name: m.name,
      category: m.unit,
      warehouse: "Primary Plant",
      onHand: m.on_hand,
      allocated: m.allocated,
      available: m.net_availability,
      safetyStock: m.reorder_threshold,
      reorderPoint: m.reorder_threshold,
      unitCostUsd: 0,
      leadTimeDays: m.lead_time_days ?? 0,
      supplier: m.supplier_name ?? "Unassigned",
      health:
        m.stock_status === "OUT_OF_STOCK"
          ? "Shortage"
          : m.stock_status === "LOW_STOCK"
            ? "Low Stock"
            : "Healthy",
    }));
  }, [backendInventoryOverview, mockMaterials, settings.integrationMode]);

  const orders = useMemo<InventoryOrder[]>(() => {
    if (settings.integrationMode === "mock") return mockOrders;
    return backendOrderRisks.map((o) => {
      const totalReq =
        o.missing_materials.reduce((sum, mm) => sum + mm.required_qty, 0) || o.quantity;
      const totalAlloc =
        o.missing_materials.reduce((sum, mm) => sum + mm.allocated_qty, 0) || o.quantity;
      const pct = totalReq > 0 ? Math.round((totalAlloc / totalReq) * 100) : 100;
      const daysUntil = Math.ceil(
        (new Date(o.customer_request_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      return {
        id: o.order_id,
        orderNumber: o.order_id,
        customer: o.customer_name,
        priority:
          o.risk_category === "BLOCKED" || o.risk_category === "DELAYED" ? "VIP" : "Standard",
        crdDate: o.customer_request_date,
        daysUntilCrd: daysUntil,
        requiredSku: o.product_code,
        requiredQty: o.quantity,
        allocatedQty: o.missing_materials.length === 0 ? o.quantity : totalAlloc,
        fulfillmentPct: o.missing_materials.length === 0 ? 100 : pct,
        crdRisk:
          o.risk_category === "ON_TRACK"
            ? "On Track"
            : o.risk_category === "AT_RISK"
              ? "At Risk"
              : "Critical Delay",
        instructionNote: o.explanation,
      };
    });
  }, [backendOrderRisks, mockOrders, settings.integrationMode]);

  const recommendations = useMemo<PurchaseRecommendation[]>(() => {
    if (settings.integrationMode === "mock") return mockRecommendations;
    return backendShortages.map((s) => {
      const hasProposal = backendProposals.some(
        (p) => p.material_id === s.material_id && p.status === "PENDING_APPROVAL",
      );
      return {
        id: s.material_id,
        sku: s.sku,
        materialName: s.material_name,
        netShortage: Math.max(0, s.unmet_order_demand || s.reorder_threshold - s.net_availability),
        recommendedQty: s.recommended_purchase_qty,
        estimatedCostUsd: 0,
        supplier: s.supplier_name ?? "Unassigned Supplier",
        leadTimeDays: s.lead_time_days ?? 0,
        impactedOrders: s.affected_orders,
        urgency: s.unmet_order_demand > 0 ? "Critical" : "High",
        rationale: `Net availability: ${s.net_availability} ${s.unit}, unmet order demand: ${s.unmet_order_demand} ${s.unit}.`,
        status: hasProposal ? "PO Drafted" : "Suggested",
      };
    });
  }, [backendProposals, backendShortages, mockRecommendations, settings.integrationMode]);

  const approvals = useMemo<InventoryApprovalItem[]>(() => {
    if (settings.integrationMode === "mock") return mockApprovals;
    return backendProposals.map((p) => ({
      id: p.id,
      title: `${p.id} • ${p.suggested_quantity}x ${p.material_id} (${p.supplier_name ?? "Supplier"})`,
      type: "Purchase Order",
      requestedBy: "ResolveX Shortage Engine",
      ownerRole: "Procurement Manager",
      amountUsd: 0,
      sku: p.material_id,
      qty: p.suggested_quantity,
      crdImpact: p.estimated_impact,
      status:
        p.status === "APPROVED" ? "Approved" : p.status === "REJECTED" ? "Rejected" : "Pending",
      note: p.reason,
    }));
  }, [backendProposals, mockApprovals, settings.integrationMode]);

  const notifications = useMemo<NotificationItem[]>(() => {
    if (settings.integrationMode === "mock") {
      return INITIAL_NOTIFICATIONS.map((n) => ({
        ...n,
        read: readNotificationIds.has(n.id) ? true : n.read,
      }));
    }
    return backendAlerts.map((a) => ({
      id: `alert-${a.id}`,
      title: `${a.alert_type} • ${a.entity_id}`,
      detail: a.message,
      category: "Inventory",
      severity:
        a.severity === "CRITICAL" ? "critical" : a.severity === "HIGH" ? "warning" : "info",
      route: "/inventory",
      read: a.acknowledged || readNotificationIds.has(`alert-${a.id}`),
    }));
  }, [backendAlerts, readNotificationIds, settings.integrationMode]);

  const uiLanguage = useMemo(
    () => resolveUiLanguage(language, activeAnalysis.multilingual.detectedLanguage),
    [activeAnalysis.multilingual.detectedLanguage, language],
  );

  const sessionMemory = useMemo<SessionContextMemory>(
    () =>
      sessionMemories[activeSessionId] ??
      createEmptySessionMemory(activeSessionId, activeAnalysis.prompt.slice(0, 48)),
    [activeAnalysis.prompt, activeSessionId, sessionMemories],
  );

  const selectedInterpretation = useMemo(
    () =>
      activeAnalysis.interpretations.find((interp) => interp.id === selectedInterpretationId) ??
      activeAnalysis.interpretations[0] ??
      null,
    [activeAnalysis, selectedInterpretationId],
  );

  const optimizerState = useMemo(
    () =>
      resolveXService.evaluateClarificationState(
        activeAnalysis,
        clarificationAnswers,
        settings.ambiguityThreshold,
        allowOptionalRefinement,
        selectedInterpretation,
      ),
    [
      activeAnalysis,
      allowOptionalRefinement,
      clarificationAnswers,
      selectedInterpretation,
      settings.ambiguityThreshold,
    ],
  );

  const verificationReport = useMemo(
    () =>
      resolveXService.verifyResolutionReadiness(
        activeAnalysis,
        clarificationAnswers,
        selectedInterpretation,
      ),
    [activeAnalysis, clarificationAnswers, selectedInterpretation],
  );

  // Feature 9: Risk-Aware Intent Assessment (Recalculated after every turn)
  const riskAssessment = useMemo(
    () =>
      evaluateClientIntentRisk({
        prompt: activeAnalysis.prompt,
        answers: clarificationAnswers,
        verificationReport,
        selectedInterpretation,
        userConfirmed: userConfirmedHighRisk,
        backendAssessment: activeAnalysis.riskAssessment
          ? {
              risk_level: activeAnalysis.riskAssessment.riskLevel,
              risk_score: activeAnalysis.riskAssessment.riskScore,
              requires_explicit_confirmation:
                activeAnalysis.riskAssessment.requiresExplicitConfirmation,
              confirmation_reason: activeAnalysis.riskAssessment.confirmationReason,
              high_impact_ambiguities: activeAnalysis.riskAssessment.highImpactAmbiguities,
              risk_factors: activeAnalysis.riskAssessment.riskFactors.map((f) => ({
                dimension: f.dimension,
                level: f.level,
                label: f.label,
                description: f.description,
                target_token: f.targetToken,
                requires_confirmation: f.requiresConfirmation,
              })),
              action_type: activeAnalysis.riskAssessment.actionType,
              target_summary: activeAnalysis.riskAssessment.targetSummary,
              reversibility: activeAnalysis.riskAssessment.reversibility,
              mitigation_guidance: activeAnalysis.riskAssessment.mitigationGuidance,
              safe_to_resolve: activeAnalysis.riskAssessment.safeToResolve,
            }
          : undefined,
      }),
    [
      activeAnalysis.prompt,
      activeAnalysis.riskAssessment,
      clarificationAnswers,
      selectedInterpretation,
      userConfirmedHighRisk,
      verificationReport,
    ],
  );

  const confidenceBundle = useMemo(
    () =>
      resolveXService.evaluateConfidenceAndUncertainty(
        activeAnalysis,
        clarificationAnswers,
        selectedInterpretation,
        verificationReport,
        optimizerState,
      ),
    [
      activeAnalysis,
      clarificationAnswers,
      optimizerState,
      selectedInterpretation,
      verificationReport,
    ],
  );

  const confidenceAssessment = confidenceBundle.assessment;
  const enrichedInterpretations = confidenceBundle.interpretations;

  const contextGraph = useMemo(
    () =>
      resolveXService.buildContextGraph(
        activeAnalysis,
        clarificationAnswers,
        selectedInterpretation,
        optimizerState,
        confidenceAssessment,
      ),
    [
      activeAnalysis,
      clarificationAnswers,
      confidenceAssessment,
      optimizerState,
      selectedInterpretation,
    ],
  );

  const interpretationDiffs = useMemo(
    () => resolveXService.simulateInterpretationDiffs(activeAnalysis.interpretations),
    [activeAnalysis.interpretations],
  );

  const applyNewAnalysis = useCallback((result: AnalysisResult, resetAnswers = true) => {
    setActiveAnalysis(result);
    setPromptInput(result.prompt);
    setDomain(result.domain);
    setStrictness(result.strictness);
    setSelectedInterpretationId(result.interpretations[0]?.id ?? null);
    if (resetAnswers) {
      setClarificationAnswers([]);
    }
    setAllowOptionalRefinement(false);
    setFocusedQuestionId(null);
    setUserConfirmedHighRisk(false);
    setFinalResolution(result.defaultResolution);

    setSessionHistory((prev) => {
      const nextItem: SessionHistoryItem = {
        id: result.id,
        prompt: result.prompt,
        domain: result.domain,
        ambiguityScore: result.ambiguityScore,
        resolved: result.defaultResolution.verification?.allRequiredPassed ?? false,
        createdAt: result.createdAt,
      };
      const filtered = prev.filter(
        (item) => item.id !== result.id && item.prompt !== result.prompt,
      );
      return [nextItem, ...filtered].slice(0, 15);
    });
  }, []);

  const runSimulatedStageProgress = useCallback(async () => {
    const stages = [
      "Understanding input & script",
      "Analyzing context & entities",
      "Detecting ambiguity spans",
      "Generating interpretations",
    ];
    if (settings.integrationMode === "live" || settings.reduceMotion) {
      setAnalysisStage(stages.length);
      setAnalysisStageLabel(stages[stages.length - 1] ?? "");
      return;
    }
    for (let i = 0; i < stages.length; i += 1) {
      setAnalysisStage(i + 1);
      setAnalysisStageLabel(stages[i] ?? "");
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }, [settings.integrationMode, settings.reduceMotion]);

  const runAnalysis = useCallback(
    async (
      customPrompt?: string,
      customDomain?: DomainContext,
      customStrictness?: StrictnessLevel,
      options?: { forceSessionMode?: "new" | "continue" },
    ): Promise<AnalysisResult> => {
      if (isAnalyzingRef.current) {
        return activeAnalysis;
      }
      const targetPrompt = (customPrompt ?? promptInput).trim();
      const targetDomain = customDomain ?? domain;
      const targetStrictness = customStrictness ?? strictness;
      const effectiveContinue =
        options?.forceSessionMode === "continue"
          ? true
          : options?.forceSessionMode === "new"
            ? false
            : continueInSession;

      if (!targetPrompt) {
        const msg = "Please enter an instruction before analyzing.";
        setApiError(msg);
        throw new ApiServiceError(msg);
      }

      isAnalyzingRef.current = true;
      setIsAnalyzing(true);
      setApiError(null);
      setLiveBackendNotice(null);
      setActiveConversationDetail(null);

      try {
        await runSimulatedStageProgress();

        // Maintain strict session boundary: reuse activeSessionId only when effectiveContinue is true
        const targetSessionId = effectiveContinue ? activeSessionId : `sess-${Date.now()}`;
        const priorSessionMem = effectiveContinue
          ? (sessionMemories[activeSessionId] ??
            createEmptySessionMemory(activeSessionId, targetPrompt.slice(0, 48)))
          : createEmptySessionMemory(targetSessionId, targetPrompt.slice(0, 48));
        const nextSessionMem = appendMessageToSessionMemory(priorSessionMem, targetPrompt, "user");

        if (!effectiveContinue) {
          setActiveSessionId(targetSessionId);
        }
        setSessionMemories((prev) => ({
          ...prev,
          [targetSessionId]: nextSessionMem,
        }));

        const serializedContext = serializeSessionMemoryForContext(nextSessionMem);
        let result: AnalysisResult;

        if (settings.integrationMode === "live") {
          try {
            const contextStr = serializedContext
              ? `Domain: ${targetDomain} | Strictness: ${targetStrictness} | Language: ${language} | Prior Session Memory: ${serializedContext}`
              : `Domain: ${targetDomain} | Strictness: ${targetStrictness} | Language: ${language}`;

            const backendResp = await resolveXService.analyzeWithBackend(
              targetPrompt,
              contextStr,
              settings.apiBaseUrl,
            );
            const uiResult = adaptBackendAnalysisToUi(
              targetPrompt,
              backendResp,
              targetDomain,
              targetStrictness,
              language,
            );
            result = applySessionMemoryToAnalysis(uiResult, nextSessionMem);
            setLiveBackendNotice(null);
            void refreshConversationsList();
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Backend request failed";
            setLiveBackendNotice(
              `Backend service (${settings.apiBaseUrl}) unreachable: ${msg}. Showing local simulation (DEMO DATA — not live model output).`,
            );
            const rawLocal = await resolveXService.analyzePrompt({
              prompt: targetPrompt,
              domain: targetDomain,
              strictness: targetStrictness,
              language,
              maxQuestions: settings.maxClarificationQuestions,
            });
            result = applySessionMemoryToAnalysis(rawLocal, nextSessionMem);
          }
        } else {
          const rawLocal = await resolveXService.analyzePrompt({
            prompt: targetPrompt,
            domain: targetDomain,
            strictness: targetStrictness,
            language,
            maxQuestions: settings.maxClarificationQuestions,
          });
          result = applySessionMemoryToAnalysis(rawLocal, nextSessionMem);
        }

        applyNewAnalysis(result, true);
        return result;
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Analysis request failed. Please try again.";
        setApiError(msg);
        throw err;
      } finally {
        isAnalyzingRef.current = false;
        setIsAnalyzing(false);
        setAnalysisStage(0);
        setAnalysisStageLabel("");
      }
    },
    [
      activeAnalysis,
      activeSessionId,
      applyNewAnalysis,
      continueInSession,
      domain,
      language,
      promptInput,
      refreshConversationsList,
      runSimulatedStageProgress,
      sessionMemories,
      settings.apiBaseUrl,
      settings.integrationMode,
      settings.maxClarificationQuestions,
      settings.reduceMotion,
      strictness,
    ],
  );

  const selectExamplePrompt = useCallback(
    async (exampleId: string): Promise<AnalysisResult> => {
      const found = EXAMPLE_PROMPTS.find((e) => e.id === exampleId) ?? EXAMPLE_PROMPTS[0];
      if (!found) return activeAnalysis;
      setPromptInput(found.prompt);
      setDomain(found.domain);
      if (settings.integrationMode === "live") {
        return runAnalysis(found.prompt, found.domain, strictness);
      }
      setIsAnalyzing(true);
      try {
        await runSimulatedStageProgress();
        const raw = buildPresetAnalysis(found.id, strictness, language);
        const isolatedId = `sess-${exampleId}-${Date.now()}`;
        const freshMem = appendMessageToSessionMemory(
          createEmptySessionMemory(isolatedId, raw.prompt.slice(0, 48)),
          raw.prompt,
          "user",
        );
        setActiveSessionId(isolatedId);
        setSessionMemories((prev) => ({ ...prev, [isolatedId]: freshMem }));
        const result = applySessionMemoryToAnalysis(raw, freshMem);
        applyNewAnalysis(result, true);
        return result;
      } finally {
        setIsAnalyzing(false);
        setAnalysisStage(0);
        setAnalysisStageLabel("");
      }
    },
    [activeAnalysis, applyNewAnalysis, language, runAnalysis, settings.integrationMode, strictness],
  );

  const selectMultilingualSample = useCallback(
    async (sampleId: string): Promise<AnalysisResult> => {
      const sample =
        MULTILINGUAL_SAMPLE_CASES.find((s) => s.id === sampleId) ?? MULTILINGUAL_SAMPLE_CASES[0];
      if (!sample) return activeAnalysis;
      setPromptInput(sample.prompt);
      setDomain(sample.domain);
      if (settings.integrationMode === "live") {
        return runAnalysis(sample.prompt, sample.domain, strictness);
      }
      setIsAnalyzing(true);
      try {
        await runSimulatedStageProgress();
        const raw = analyzeCustomPromptMock(
          sample.prompt,
          sample.domain,
          strictness,
          settings.maxClarificationQuestions,
          language,
        );
        const isolatedId = `sess-ml-${sampleId}-${Date.now()}`;
        const freshMem = appendMessageToSessionMemory(
          createEmptySessionMemory(isolatedId, raw.prompt.slice(0, 48)),
          raw.prompt,
          "user",
        );
        setActiveSessionId(isolatedId);
        setSessionMemories((prev) => ({ ...prev, [isolatedId]: freshMem }));
        const result = applySessionMemoryToAnalysis(raw, freshMem);
        applyNewAnalysis(result, true);
        return result;
      } finally {
        setIsAnalyzing(false);
        setAnalysisStage(0);
        setAnalysisStageLabel("");
      }
    },
    [
      activeAnalysis,
      applyNewAnalysis,
      language,
      runAnalysis,
      settings.integrationMode,
      settings.maxClarificationQuestions,
      strictness,
    ],
  );

  const focusClarificationQuestion = useCallback((questionId: string | null) => {
    setFocusedQuestionId(questionId);
  }, []);

  const sendScenarioToClarification = useCallback((interpretationId: string) => {
    setSelectedInterpretationId(interpretationId);
    setFocusedQuestionId(null);
  }, []);

  const resetInterpretationSimulation = useCallback(() => {
    setSelectedInterpretationId(activeAnalysis.interpretations[0]?.id ?? null);
    setFocusedQuestionId(null);
  }, [activeAnalysis.interpretations]);

  const submitClarificationTurn = useCallback(
    async (
      questionId: string,
      selectedOptionId: string | null,
      customAnswer: string,
      resolvedValue: string,
    ): Promise<void> => {
      const trimmedValue = resolvedValue.trim();
      if (!trimmedValue || isSubmittingClarification) return;

      setApiError(null);

      if (
        settings.integrationMode === "live" &&
        !activeAnalysis.isDemoData &&
        activeAnalysis.backendData
      ) {
        setIsSubmittingClarification(true);
        try {
          const question = activeAnalysis.clarificationQuestions.find((q) => q.id === questionId);
          const backendResp = await resolveXService.clarifyWithBackend(
            activeAnalysis.backendData.conversation_id,
            trimmedValue,
            settings.apiBaseUrl,
          );

          const turnAnswer: ClarificationAnswer = {
            questionId,
            selectedOptionId,
            customAnswer,
            resolvedValue: trimmedValue,
            turnNumber: backendResp.turn_count - 1,
            answeredAt: new Date().toISOString(),
            targetToken: question?.targetToken,
            questionText: question?.question,
            essentialField: question?.essentialField,
            selectionExplanation: "Submitted to the ResolveX clarification service.",
            source: selectedOptionId ? "option" : "custom",
          };

          const updatedAnswers = [...clarificationAnswers, turnAnswer];
          setClarificationAnswers(updatedAnswers);

          const updatedUi = adaptBackendAnalysisToUi(
            activeAnalysis.prompt,
            backendResp,
            activeAnalysis.domain,
            activeAnalysis.strictness,
            language,
          );
          applyNewAnalysis(updatedUi, false);
          void refreshConversationsList();
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Failed to submit clarification to backend.";
          setApiError(msg);
        } finally {
          setIsSubmittingClarification(false);
        }
        return;
      }

      // Mock mode turn tracking
      setClarificationAnswers((prev) => {
        const question = activeAnalysis.clarificationQuestions.find((q) => q.id === questionId);
        const withoutCurrent = prev.filter((item) => item.questionId !== questionId);
        const stateBefore = resolveXService.evaluateClarificationState(
          activeAnalysis,
          withoutCurrent,
          settings.ambiguityThreshold,
          allowOptionalRefinement,
          selectedInterpretation,
        );
        const draftAnswer: ClarificationAnswer = {
          questionId,
          selectedOptionId,
          customAnswer,
          resolvedValue: trimmedValue,
          turnNumber: withoutCurrent.length + 1,
          answeredAt: new Date().toISOString(),
          targetToken: question?.targetToken,
          questionText: question?.question,
          essentialField: question?.essentialField,
          selectionExplanation: stateBefore.activeSelectionReason,
          source: selectedOptionId ? "option" : "custom",
        };
        const nextAnswers = [...withoutCurrent, draftAnswer];
        const stateAfter = resolveXService.evaluateClarificationState(
          activeAnalysis,
          nextAnswers,
          settings.ambiguityThreshold,
          allowOptionalRefinement,
          selectedInterpretation,
        );
        return [
          ...withoutCurrent,
          {
            ...draftAnswer,
            clarityBefore: stateBefore.currentClarityScore,
            clarityAfter: stateAfter.currentClarityScore,
            ambiguityReduction: Math.max(
              0,
              stateBefore.remainingAmbiguityScore - stateAfter.remainingAmbiguityScore,
            ),
          },
        ];
      });
      setFocusedQuestionId(null);

      // Persist clarified entities into active session memory strictly within activeSessionId
      setSessionMemories((prev) => {
        const curr =
          prev[activeSessionId] ??
          createEmptySessionMemory(activeSessionId, activeAnalysis.prompt.slice(0, 48));
        const updated = appendMessageToSessionMemory(curr, trimmedValue, "clarification");
        return { ...prev, [activeSessionId]: updated };
      });

      // When connected to live FastAPI backend, synchronize clarification turn & real confidence history
      if (settings.integrationMode === "live" && activeAnalysis.backendConversationId) {
        void resolveXService
          .clarifyBackendTurn(
            settings.apiBaseUrl,
            activeAnalysis.backendConversationId,
            trimmedValue,
            activeAnalysis.prompt,
            activeAnalysis.domain,
            activeAnalysis.strictness,
            activeAnalysis,
          )
          .then(({ analysis: updated }) => {
            setActiveAnalysis((curr) =>
              curr.backendConversationId === updated.backendConversationId ? updated : curr,
            );
            setLiveBackendNotice(null);
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : "Backend clarification sync failed";
            setLiveBackendNotice(
              `Backend clarification sync unavailable (${msg}). Using local client simulation.`,
            );
          });
      }
    },
    [
      activeAnalysis,
      activeSessionId,
      allowOptionalRefinement,
      applyNewAnalysis,
      clarificationAnswers,
      isSubmittingClarification,
      language,
      refreshConversationsList,
      selectedInterpretation,
      settings.ambiguityThreshold,
      settings.apiBaseUrl,
      settings.integrationMode,
    ],
  );

  const setClarificationAnswer = useCallback(
    (
      questionId: string,
      selectedOptionId: string | null,
      customAnswer: string,
      resolvedValue: string,
    ) => {
      void submitClarificationTurn(questionId, selectedOptionId, customAnswer, resolvedValue);
    },
    [submitClarificationTurn],
  );

  const revertToTurn = useCallback((turnIndex: number) => {
    setClarificationAnswers((prev) => prev.slice(0, turnIndex));
    setAllowOptionalRefinement(false);
    setFocusedQuestionId(null);
  }, []);

  const resetClarificationFlow = useCallback(() => {
    setClarificationAnswers([]);
    setAllowOptionalRefinement(false);
    setFocusedQuestionId(null);
    setFinalResolution(activeAnalysis.defaultResolution);
  }, [activeAnalysis.defaultResolution]);

  const generateFinalResolution = useCallback(async (): Promise<FinalResolution> => {
    if (
      (settings.integrationMode === "live") &&
      activeAnalysis.backendData &&
      !activeAnalysis.isDemoData
    ) {
      if (activeAnalysis.backendData.status === "RESOLVED") {
        try {
          const confirmed = await resolveXService.resolveWithBackend(
            activeAnalysis.backendData.conversation_id,
            settings.apiBaseUrl,
          );
          const updatedUi = adaptBackendAnalysisToUi(
            activeAnalysis.prompt,
            confirmed,
            activeAnalysis.domain,
            activeAnalysis.strictness,
            language,
          );
          applyNewAnalysis(updatedUi, false);
          return updatedUi.defaultResolution;
        } catch {
          return activeAnalysis.defaultResolution;
        }
      }
      return activeAnalysis.defaultResolution;
    }

    const resolved = await resolveXService.resolveIntent(
      activeAnalysis,
      {
        analysisId: activeAnalysis.id,
        prompt: activeAnalysis.prompt,
        selectedInterpretationId,
        answers: clarificationAnswers,
      },
      selectedInterpretation,
      settings.ambiguityThreshold,
    );
    setFinalResolution(resolved);
    setSessionHistory((prev) =>
      prev.map((item) =>
        item.id === activeAnalysis.id
          ? {
              ...item,
              resolved: Boolean(resolved.verification?.allRequiredPassed),
            }
          : item,
      ),
    );
    return resolved;
  }, [
    activeAnalysis,
    applyNewAnalysis,
    clarificationAnswers,
    language,
    selectedInterpretation,
    selectedInterpretationId,
    settings.ambiguityThreshold,
    settings.apiBaseUrl,
    settings.integrationMode,
  ]);

  const loadHistorySession = useCallback(
    async (item: SessionHistoryItem) => {
      const isolatedId = `sess-hist-${Date.now()}`;
      setActiveSessionId(isolatedId);
      setSessionMemories((prev) => ({
        ...prev,
        [isolatedId]: createEmptySessionMemory(isolatedId, item.prompt.slice(0, 48)),
      }));
      const prevMode = continueInSession;
      setContinueInSession(false);

      try {
        if (settings.integrationMode === "live") {
          try {
            const detail = await resolveXService.getConversationDetail(
              item.id,
              settings.apiBaseUrl,
            );
            setActiveConversationDetail(detail);
            const syntheticResp = {
              conversation_id: detail.conversation.id,
              status: detail.conversation.status,
              classification: detail.conversation.classification ?? null,
              ambiguity_types: [],
              needs_clarification: detail.conversation.status === "NEEDS_CLARIFICATION",
              interpretations: [],
              missing_required_info: [],
              clarification_questions: detail.clarification_questions
                .filter((q) => !q.answered)
                .map((q) => q.question_text),
              resolved_intent: detail.resolved_intent ?? null,
              inventory_insight: null,
              turn_count: detail.conversation.turn_count,
            };
            const ui = adaptBackendAnalysisToUi(
              detail.conversation.original_instruction,
              syntheticResp,
              item.domain,
              strictness,
              language,
            );
            applyNewAnalysis(ui, true);
            return;
          } catch {
            // If not found in backend DB, re-analyze prompt cleanly
          }
        }
        await runAnalysis(item.prompt, item.domain, strictness);
      } finally {
        setContinueInSession(prevMode);
      }
    },
    [
      applyNewAnalysis,
      continueInSession,
      language,
      runAnalysis,
      settings.apiBaseUrl,
      settings.integrationMode,
      strictness,
    ],
  );

  const clearHistory = useCallback(() => {
    setSessionHistory([]);
  }, []);

  // --- Context Memory Session Handlers ---
  const startNewIsolatedSession = useCallback(() => {
    const newId = `sess-${Date.now()}`;
    const emptyMem = createEmptySessionMemory(newId, "Fresh Isolated Session");
    setActiveSessionId(newId);
    setSessionMemories((prev) => ({ ...prev, [newId]: emptyMem }));
    setClarificationAnswers([]);
    setAllowOptionalRefinement(false);
    setFocusedQuestionId(null);
    setPromptInput("");
    setActiveAnalysis((curr) => ({ ...curr, contextMemory: emptyMem }));
  }, []);

  const syncEditedMemoryToActiveAnalysis = useCallback(
    (nextMem: SessionContextMemory) => {
      setSessionMemories((prev) => ({ ...prev, [activeSessionId]: nextMem }));
      setActiveAnalysis((curr) => applySessionMemoryToAnalysis(curr, nextMem));
    },
    [activeSessionId],
  );

  const updateMemoryEntity = useCallback(
    (entityId: string, newValue: string) => {
      const cleaned = newValue.trim();
      if (!cleaned) return;
      const currMem =
        sessionMemories[activeSessionId] ??
        createEmptySessionMemory(activeSessionId, activeAnalysis.prompt.slice(0, 48));
      const updatedEntities = currMem.entities.map((ent) =>
        ent.id === entityId
          ? { ...ent, value: cleaned, sourceRole: "edited" as const, editedByUser: true }
          : ent,
      );
      const recomputed = recomputeMemoryReferencesForPrompt(
        { ...currMem, entities: updatedEntities, editedAt: new Date().toISOString() },
        activeAnalysis.prompt,
      );
      syncEditedMemoryToActiveAnalysis(recomputed);
    },
    [activeAnalysis.prompt, activeSessionId, sessionMemories, syncEditedMemoryToActiveAnalysis],
  );

  const deleteMemoryEntity = useCallback(
    (entityId: string) => {
      const currMem =
        sessionMemories[activeSessionId] ??
        createEmptySessionMemory(activeSessionId, activeAnalysis.prompt.slice(0, 48));
      const updatedEntities = currMem.entities.filter((ent) => ent.id !== entityId);
      const recomputed = recomputeMemoryReferencesForPrompt(
        { ...currMem, entities: updatedEntities, editedAt: new Date().toISOString() },
        activeAnalysis.prompt,
      );
      syncEditedMemoryToActiveAnalysis(recomputed);
    },
    [activeAnalysis.prompt, activeSessionId, sessionMemories, syncEditedMemoryToActiveAnalysis],
  );

  const clearCurrentSessionMemory = useCallback(() => {
    const emptyMem = createEmptySessionMemory(activeSessionId, activeAnalysis.prompt.slice(0, 48));
    syncEditedMemoryToActiveAnalysis(emptyMem);
  }, [activeAnalysis.prompt, activeSessionId, syncEditedMemoryToActiveAnalysis]);

  // --- PS2 Real Backend Mutations ---

  const generatePoProposals = useCallback(async () => {
    const created = await resolveXService.generatePurchaseProposals(settings.apiBaseUrl);
    await refreshInventoryData();
    return created;
  }, [refreshInventoryData, settings.apiBaseUrl]);

  const recalculateInventoryAllocations = useCallback(async () => {
    await resolveXService.recalculateAllocations(settings.apiBaseUrl);
    await refreshInventoryData();
  }, [refreshInventoryData, settings.apiBaseUrl]);

  const ingestInventoryEvent = useCallback(
    async (payload: {
      event_id: string;
      event_type: string;
      entity_ref: string;
      payload: Record<string, unknown>;
      simulated?: boolean;
    }) => {
      const res = await resolveXService.ingestInventoryEvent(payload, settings.apiBaseUrl);
      await refreshInventoryData();
      return res;
    },
    [refreshInventoryData, settings.apiBaseUrl],
  );

  const updateMaterialStock = useCallback(
    async (
      materialId: string,
      payload: {
        on_hand?: number;
        incoming?: number;
        reorder_threshold?: number;
        reason?: string;
        actor?: string;
      },
    ) => {
      const updated = await resolveXService.updateMaterialStock(
        materialId,
        payload,
        settings.apiBaseUrl,
      );
      await refreshInventoryData();
      return updated;
    },
    [refreshInventoryData, settings.apiBaseUrl],
  );

  const acknowledgeBackendAlert = useCallback(
    async (alertId: number) => {
      await resolveXService.acknowledgeAlert(alertId, settings.apiBaseUrl);
      await refreshInventoryData();
    },
    [refreshInventoryData, settings.apiBaseUrl],
  );

  const decidePoProposal = useCallback(
    async (
      proposalId: string,
      decision: "approve" | "reject",
      comment?: string,
    ): Promise<{ ok: boolean; message: string }> => {
      const roleHeader = mapDemoRoleToBackendHeader(activeRole);
      try {
        const res = await resolveXService.decidePurchaseProposal(
          proposalId,
          decision,
          roleHeader,
          `Demo (${activeRole})`,
          comment,
          settings.apiBaseUrl,
        );
        await refreshInventoryData();
        return { ok: true, message: res.note };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Proposal decision failed.";
        return { ok: false, message: msg };
      }
    },
    [activeRole, refreshInventoryData, settings.apiBaseUrl],
  );

  // Legacy mock compatibility helpers
  const draftPurchaseOrder = useCallback(
    (recommendationId: string) => {
      if (settings.integrationMode === "live") {
        void generatePoProposals();
        return;
      }
      const target = mockRecommendations.find((r) => r.id === recommendationId);
      if (!target || target.status === "PO Drafted") return;
      setMockRecommendations((prev) =>
        prev.map((rec) => (rec.id === recommendationId ? { ...rec, status: "PO Drafted" } : rec)),
      );
      setMockApprovals((prev) => [
        {
          id: `apr-${Date.now()}`,
          title: `PO-DRAFT • ${target.recommendedQty}x ${target.sku} (${target.supplier})`,
          type: "Purchase Order",
          requestedBy: `Demo User (${activeRole})`,
          ownerRole: "Procurement Manager",
          amountUsd: target.estimatedCostUsd,
          sku: target.sku,
          qty: target.recommendedQty,
          crdImpact: "Protects impacted orders",
          status: "Pending",
          note: target.rationale,
        },
        ...prev,
      ]);
    },
    [activeRole, generatePoProposals, mockRecommendations, settings.integrationMode],
  );

  const updateApprovalStatus = useCallback(
    (approvalId: string, status: InventoryApprovalItem["status"]) => {
      if (settings.integrationMode === "live") {
        if (status === "Approved") void decidePoProposal(approvalId, "approve");
        if (status === "Rejected") void decidePoProposal(approvalId, "reject");
        return;
      }
      setMockApprovals((prev) =>
        prev.map((item) => (item.id === approvalId ? { ...item, status } : item)),
      );
    },
    [decidePoProposal, settings.integrationMode],
  );

  const markNotificationRead = useCallback(
    (id: string) => {
      setReadNotificationIds((prev) => new Set(prev).add(id));
      if (settings.integrationMode === "live" && id.startsWith("alert-")) {
        const numericId = Number(id.replace("alert-", ""));
        if (Number.isFinite(numericId)) {
          void acknowledgeBackendAlert(numericId);
        }
      }
    },
    [acknowledgeBackendAlert, settings.integrationMode],
  );

  const markAllNotificationsRead = useCallback(() => {
    const allIds = notifications.map((n) => n.id);
    setReadNotificationIds(new Set(allIds));
    if (settings.integrationMode === "live") {
      for (const a of backendAlerts) {
        if (!a.acknowledged) {
          void acknowledgeBackendAlert(a.id);
        }
      }
    }
  }, [acknowledgeBackendAlert, backendAlerts, notifications, settings.integrationMode]);

  const resetAssistantConversation = useCallback(() => {
    setAssistantConversationId(null);
  }, []);

  // Shared AI Assistant responder (unified language + inventory via backend services)
  const sendAssistantQuery = useCallback(
    async (rawQuery: string): Promise<void> => {
      const q = rawQuery.trim();
      if (!q || isAssistantLoading) return;
      const nowLabel = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      const userMsg: AssistantMessage = {
        id: `u-${Date.now()}`,
        sender: "user",
        text: q,
        domainTag: "Unified",
        timestamp: nowLabel,
      };
      setAssistantMessages((prev) => [...prev, userMsg]);

      if (settings.integrationMode !== "live") {
        const mockMsg: AssistantMessage = {
          id: `a-${Date.now() + 1}`,
          sender: "assistant",
          text: "Switch to Live mode in Settings to query real inventory data and the AI engine.",
          domainTag: "Unified",
          suggestedRoute: "/settings",
          suggestedLabel: "Open Settings",
          timestamp: nowLabel,
        };
        setAssistantMessages((prev) => [...prev, mockMsg]);
        return;
      }

      setIsAssistantLoading(true);
      try {
        const resp = assistantConversationId
          ? await resolveXService.clarifyWithBackend(
              assistantConversationId,
              q,
              settings.apiBaseUrl,
            )
          : await resolveXService.analyzeWithBackend(
              q,
              `Unified Assistant | Role: ${activeRole}`,
              settings.apiBaseUrl,
            );

        if (resp.status === "NEEDS_CLARIFICATION") {
          setAssistantConversationId(resp.conversation_id);
        } else {
          setAssistantConversationId(null);
        }

        const isInventory = Boolean(resp.inventory_insight);
        const domainTag: AssistantMessage["domainTag"] = isInventory
          ? "Inventory"
          : resp.status === "NEEDS_CLARIFICATION"
            ? "Language & Intent"
            : "Unified";

        let replyText = "";
        if (resp.status === "NEEDS_CLARIFICATION") {
          replyText =
            resp.clarification_questions[0] ||
            "Could you clarify your request so ResolveX can proceed?";
        } else if (resp.resolved_intent) {
          replyText =
            resp.resolved_intent.direct_answer || resp.resolved_intent.resolved_instruction;
        } else {
          replyText = `Status: ${resp.status}`;
        }

        const assistantMsg: AssistantMessage = {
          id: `a-${Date.now() + 1}`,
          sender: "assistant",
          text: replyText,
          domainTag,
          conversationId: resp.conversation_id,
          clarificationQuestions: resp.clarification_questions,
          interpretations: resp.interpretations,
          inventoryInsight: resp.inventory_insight ?? null,
          suggestedRoute: isInventory
            ? "/inventory"
            : resp.status === "RESOLVED"
              ? "/resolution"
              : "/",
          suggestedLabel: isInventory
            ? "Open Inventory Hub"
            : resp.status === "RESOLVED"
              ? "Inspect Intent Spec"
              : "Continue in Unified Chat",
          timestamp: nowLabel,
        };
        setAssistantMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        const errText =
          err instanceof Error
            ? err.message
            : "Unable to reach ResolveX backend for assistant query.";
        setAssistantConversationId(null);
        setAssistantMessages((prev) => [
          ...prev,
          {
            id: `a-err-${Date.now()}`,
            sender: "assistant",
            text: errText,
            domainTag: "Unified",
            isError: true,
            suggestedRoute: "/settings",
            suggestedLabel: "Check Backend Health",
            timestamp: nowLabel,
          },
        ]);
      } finally {
        setIsAssistantLoading(false);
      }
    },
    [
      activeRole,
      approvals,
      assistantConversationId,
      confidenceAssessment,
      isAssistantLoading,
      materials,
      optimizerState.activeQuestion?.targetToken,
      orders,
      recommendations,
      settings.apiBaseUrl,
      settings.integrationMode,
      uiLanguage,
      verificationReport,
    ],
  );

  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_APP_SETTINGS);
    setDomain(DEFAULT_APP_SETTINGS.defaultDomain);
    setStrictness(DEFAULT_APP_SETTINGS.defaultStrictness);
    setActiveRole(DEFAULT_APP_SETTINGS.defaultRole);
  }, []);

  const effectiveFinalResolution = useMemo<FinalResolution>(() => {
    let resolvedBase = finalResolution;
    if (
      !activeAnalysis.isDemoData &&
      activeAnalysis.backendData &&
      clarificationAnswers.length === 0
    ) {
      resolvedBase = activeAnalysis.defaultResolution;
    } else if (clarificationAnswers.length > 0) {
      const base = computeResolutionFromInputs(
        activeAnalysis.prompt,
        activeAnalysis.spans,
        selectedInterpretation,
        clarificationAnswers,
        activeAnalysis.domain,
        activeAnalysis.clarificationQuestions,
        activeAnalysis.contextMemory,
      );
      const remainingAmbiguityScore = optimizerState.remainingAmbiguityScore;
      const clarityGain = Math.max(
        0,
        optimizerState.currentClarityScore - activeAnalysis.clarityScore,
      );
      resolvedBase = {
        ...base,
        clarityGain,
        remainingAmbiguityScore,
        structuredSpec: {
          ...base.structuredSpec,
          confidenceAfterClarification: 100 - remainingAmbiguityScore,
        },
        optimizationSummary: {
          turnsTaken: optimizerState.conversationHistory.length,
          totalQuestionsAvailable: activeAnalysis.clarificationQuestions.length,
          skippedOptionalCount: optimizerState.skippedOptionalCount,
          stoppedEarly:
            optimizerState.isSufficientlyClear && optimizerState.skippedOptionalCount > 0,
          stopReason: optimizerState.stopReason,
          essentialFields: optimizerState.essentialFields,
        },
        verification: verificationReport,
        riskAssessment,
      };
    }

    // Feature 10: Chronological Explainable Decision Timeline
    const decisionTimeline = generateDecisionTimeline({
      analysis: activeAnalysis,
      clarificationAnswers,
      optimizerState,
      selectedInterpretation,
      confidenceAssessment,
      riskAssessment,
      verificationReport,
      contextMemory: activeAnalysis.contextMemory,
      finalResolution: resolvedBase,
      userConfirmedHighRisk,
    });

    return {
      ...resolvedBase,
      verification: verificationReport,
      riskAssessment,
      decisionTimeline,
    };
  }, [
    activeAnalysis,
    clarificationAnswers,
    confidenceAssessment,
    finalResolution,
    optimizerState,
    riskAssessment,
    selectedInterpretation,
    userConfirmedHighRisk,
    verificationReport,
  ]);

  const value: ResolveXContextValue = {
    backendHealth,
    refreshBackendHealth,
    apiError,
    clearApiError,
    promptInput,
    setPromptInput,
    domain,
    setDomain,
    strictness,
    setStrictness,
    language,
    setLanguage,
    uiLanguage,
    isAnalyzing,
    isSubmittingClarification,
    analysisStage,
    analysisStageLabel,
    activeAnalysis,
    activeConversationDetail,
    selectedInterpretationId,
    setSelectedInterpretationId,
    selectedInterpretation,
    interpretationDiffs,
    sendScenarioToClarification,
    resetInterpretationSimulation,
    clarificationAnswers,
    optimizerState,
    verificationReport,
    confidenceAssessment,
    enrichedInterpretations,
    liveBackendNotice,
    contextGraph,
    focusedQuestionId,
    focusClarificationQuestion,
    allowOptionalRefinement,
    setAllowOptionalRefinement,
    setClarificationAnswer,
    submitClarificationTurn,
    revertToTurn,
    resetClarificationFlow,
    finalResolution: effectiveFinalResolution,
    sessionHistory,
    runAnalysis,
    selectExamplePrompt,
    selectMultilingualSample,
    generateFinalResolution,
    loadHistorySession,
    clearHistory,
    activeSessionId,
    sessionMemory,
    continueInSession,
    setContinueInSession,
    startNewIsolatedSession,
    updateMemoryEntity,
    deleteMemoryEntity,
    clearCurrentSessionMemory,
    riskAssessment,
    userConfirmedHighRisk,
    setUserConfirmedHighRisk,
    activeRole,
    setActiveRole,
    isLoadingInventory,
    ps2Error,
    backendInventoryOverview,
    backendOrders,
    backendOrderRisks,
    backendShortages,
    backendProposals,
    backendAlerts,
    backendBriefing,
    backendEvents,
    refreshInventoryData,
    generatePoProposals,
    recalculateInventoryAllocations,
    ingestInventoryEvent,
    updateMaterialStock,
    acknowledgeBackendAlert,
    decidePoProposal,
    materials,
    orders,
    recommendations,
    approvals,
    draftPurchaseOrder,
    updateApprovalStatus,
    assistantOpen,
    setAssistantOpen,
    assistantMessages,
    isAssistantLoading,
    assistantConversationId,
    resetAssistantConversation,
    sendAssistantQuery,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    globalSearchQuery,
    setGlobalSearchQuery,
    settings,
    updateSettings,
    resetSettings,
  };

  return <ResolveXContext.Provider value={value}>{children}</ResolveXContext.Provider>;
}
