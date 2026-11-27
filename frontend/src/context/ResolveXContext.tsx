import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
import { MULTILINGUAL_SAMPLE_CASES, resolveUiLanguage } from "@/data/multilingualEngine";
import { resolveXService } from "@/services/api";
import type {
  AnalysisResult,
  AppSettings,
  AssistantMessage,
  ClarificationAnswer,
  DomainContext,
  FinalResolution,
  InventoryApprovalItem,
  LanguageOption,
  NotificationItem,
  SessionHistoryItem,
  StrictnessLevel,
  UserDemoRole,
} from "@/types/resolvex";
import { ResolveXContext, type ResolveXContextValue } from "./resolveXContextDef";

const STORAGE_KEYS = {
  settings: "resolvex_settings_v2",
  history: "resolvex_history_v2",
} as const;

const ANALYSIS_STAGES = [
  "Understanding input & script...",
  "Analyzing context & entities...",
  "Detecting ambiguity spans...",
  "Generating What-If interpretations...",
] as const;

export function ResolveXProvider({ children }: { children: ReactNode }) {
  const initialPreset = useMemo(() => buildPresetAnalysis("ex-deploy-fast"), []);

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [promptInput, setPromptInput] = useState<string>(EXAMPLE_PROMPTS[0]?.prompt ?? "");
  const [domain, setDomain] = useState<DomainContext>(DEFAULT_APP_SETTINGS.defaultDomain);
  const [strictness, setStrictness] = useState<StrictnessLevel>(
    DEFAULT_APP_SETTINGS.defaultStrictness,
  );
  const [language, setLanguage] = useState<LanguageOption>("Auto Detect");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStage, setAnalysisStage] = useState(0);
  const [analysisStageLabel, setAnalysisStageLabel] = useState("");
  const [activeAnalysis, setActiveAnalysis] = useState<AnalysisResult>(initialPreset);
  const [selectedInterpretationId, setSelectedInterpretationId] = useState<string | null>(
    initialPreset.interpretations[0]?.id ?? null,
  );
  const [clarificationAnswers, setClarificationAnswers] = useState<ClarificationAnswer[]>([]);
  const [allowOptionalRefinement, setAllowOptionalRefinement] = useState(false);
  const [focusedQuestionId, setFocusedQuestionId] = useState<string | null>(null);
  const [finalResolution, setFinalResolution] = useState<FinalResolution>(
    initialPreset.defaultResolution,
  );
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>([
    {
      id: initialPreset.id,
      prompt: initialPreset.prompt,
      domain: initialPreset.domain,
      ambiguityScore: initialPreset.ambiguityScore,
      resolved: false,
      createdAt: initialPreset.createdAt,
    },
  ]);

  // PS2 Inventory State
  const [activeRole, setActiveRole] = useState<UserDemoRole>(DEFAULT_APP_SETTINGS.defaultRole);
  const [materials] = useState(INITIAL_INVENTORY_MATERIALS);
  const [orders] = useState(INITIAL_INVENTORY_ORDERS);
  const [recommendations, setRecommendations] = useState(INITIAL_PURCHASE_RECOMMENDATIONS);
  const [approvals, setApprovals] = useState(INITIAL_APPROVALS);
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");

  // Shared AI Assistant State
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([
    {
      id: "asst-welcome",
      sender: "assistant",
      domainTag: "Unified",
      text: "ResolveX Unified Assistant (Demo) ready. Ask about active language ambiguities, verification blocks, stock shortages, CRD risks, or pending PO approvals.",
      suggestedRoute: "/inventory",
      suggestedLabel: "Open Inventory Hub",
      timestamp: "Now",
    },
  ]);

  // Hydrate persisted settings & history safely on client only
  useEffect(() => {
    try {
      const rawSettings = localStorage.getItem(STORAGE_KEYS.settings);
      if (rawSettings) {
        const parsed = JSON.parse(rawSettings) as Partial<AppSettings>;
        const merged = { ...DEFAULT_APP_SETTINGS, ...parsed };
        setSettings(merged);
        setDomain(merged.defaultDomain);
        setStrictness(merged.defaultStrictness);
        setActiveRole(merged.defaultRole);
      }
      const rawHistory = localStorage.getItem(STORAGE_KEYS.history);
      if (rawHistory) {
        const parsedHist = JSON.parse(rawHistory) as SessionHistoryItem[];
        if (Array.isArray(parsedHist) && parsedHist.length > 0) {
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
      localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(sessionHistory.slice(0, 12)));
    } catch {
      // ignore
    }
  }, [sessionHistory]);

  const uiLanguage = useMemo(
    () => resolveUiLanguage(language, activeAnalysis.multilingual.detectedLanguage),
    [activeAnalysis.multilingual.detectedLanguage, language],
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

  const contextGraph = useMemo(
    () =>
      resolveXService.buildContextGraph(
        activeAnalysis,
        clarificationAnswers,
        selectedInterpretation,
        optimizerState,
      ),
    [activeAnalysis, clarificationAnswers, optimizerState, selectedInterpretation],
  );

  const interpretationDiffs = useMemo(
    () => resolveXService.simulateInterpretationDiffs(activeAnalysis.interpretations),
    [activeAnalysis.interpretations],
  );

  const runSimulatedStageProgress = useCallback(async () => {
    const stepDelay = settings.reduceMotion ? 60 : 210;
    for (let i = 0; i < ANALYSIS_STAGES.length; i += 1) {
      setAnalysisStage(i + 1);
      setAnalysisStageLabel(ANALYSIS_STAGES[i] ?? "Analyzing...");
      await new Promise((r) => setTimeout(r, stepDelay));
    }
  }, [settings.reduceMotion]);

  const applyNewAnalysis = useCallback((result: AnalysisResult) => {
    setActiveAnalysis(result);
    setPromptInput(result.prompt);
    setDomain(result.domain);
    setStrictness(result.strictness);
    setSelectedInterpretationId(result.interpretations[0]?.id ?? null);
    setClarificationAnswers([]);
    setAllowOptionalRefinement(false);
    setFocusedQuestionId(null);
    setFinalResolution(result.defaultResolution);

    setSessionHistory((prev) => {
      const nextItem: SessionHistoryItem = {
        id: result.id,
        prompt: result.prompt,
        domain: result.domain,
        ambiguityScore: result.ambiguityScore,
        resolved: false,
        createdAt: result.createdAt,
      };
      const filtered = prev.filter((item) => item.prompt !== result.prompt);
      return [nextItem, ...filtered].slice(0, 10);
    });
  }, []);

  const runAnalysis = useCallback(
    async (
      customPrompt?: string,
      customDomain?: DomainContext,
      customStrictness?: StrictnessLevel,
    ): Promise<AnalysisResult> => {
      const targetPrompt = (customPrompt ?? promptInput).trim();
      const targetDomain = customDomain ?? domain;
      const targetStrictness = customStrictness ?? strictness;

      setIsAnalyzing(true);
      try {
        await runSimulatedStageProgress();
        const result = await resolveXService.analyzePrompt({
          prompt: targetPrompt,
          domain: targetDomain,
          strictness: targetStrictness,
          language,
          maxQuestions: settings.maxClarificationQuestions,
        });
        applyNewAnalysis(result);
        return result;
      } finally {
        setIsAnalyzing(false);
        setAnalysisStage(0);
        setAnalysisStageLabel("");
      }
    },
    [
      applyNewAnalysis,
      domain,
      language,
      promptInput,
      runSimulatedStageProgress,
      settings.maxClarificationQuestions,
      strictness,
    ],
  );

  const selectExamplePrompt = useCallback(
    async (exampleId: string): Promise<AnalysisResult> => {
      const found = EXAMPLE_PROMPTS.find((e) => e.id === exampleId) ?? EXAMPLE_PROMPTS[0];
      setIsAnalyzing(true);
      try {
        await runSimulatedStageProgress();
        const result = buildPresetAnalysis(found?.id ?? "ex-deploy-fast", strictness, language);
        applyNewAnalysis(result);
        return result;
      } finally {
        setIsAnalyzing(false);
        setAnalysisStage(0);
        setAnalysisStageLabel("");
      }
    },
    [applyNewAnalysis, language, runSimulatedStageProgress, strictness],
  );

  const selectMultilingualSample = useCallback(
    async (sampleId: string): Promise<AnalysisResult> => {
      const sample =
        MULTILINGUAL_SAMPLE_CASES.find((s) => s.id === sampleId) ?? MULTILINGUAL_SAMPLE_CASES[0];
      if (!sample) {
        return buildPresetAnalysis("ex-deploy-fast", strictness, language);
      }
      setIsAnalyzing(true);
      try {
        await runSimulatedStageProgress();
        const result = analyzeCustomPromptMock(
          sample.prompt,
          sample.domain,
          strictness,
          settings.maxClarificationQuestions,
          language,
        );
        applyNewAnalysis(result);
        return result;
      } finally {
        setIsAnalyzing(false);
        setAnalysisStage(0);
        setAnalysisStageLabel("");
      }
    },
    [
      applyNewAnalysis,
      language,
      runSimulatedStageProgress,
      settings.maxClarificationQuestions,
      strictness,
    ],
  );

  const focusClarificationQuestion = useCallback((questionId: string | null) => {
    setFocusedQuestionId(questionId);
  }, []);

  const sendScenarioToClarification = useCallback(
    (interpretationId: string) => {
      setSelectedInterpretationId(interpretationId);
      setClarificationAnswers([]);
      setAllowOptionalRefinement(false);
      setFocusedQuestionId(null);
      setFinalResolution(activeAnalysis.defaultResolution);
    },
    [activeAnalysis.defaultResolution],
  );

  const resetInterpretationSimulation = useCallback(() => {
    setSelectedInterpretationId(activeAnalysis.interpretations[0]?.id ?? null);
    setClarificationAnswers([]);
    setAllowOptionalRefinement(false);
    setFocusedQuestionId(null);
    setFinalResolution(activeAnalysis.defaultResolution);
  }, [activeAnalysis.defaultResolution, activeAnalysis.interpretations]);

  const submitClarificationTurn = useCallback(
    (
      questionId: string,
      selectedOptionId: string | null,
      customAnswer: string,
      resolvedValue: string,
    ) => {
      const trimmedValue = resolvedValue.trim();
      if (!trimmedValue) return;

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

        const enrichedAnswer: ClarificationAnswer = {
          ...draftAnswer,
          clarityBefore: stateBefore.currentClarityScore,
          clarityAfter: stateAfter.currentClarityScore,
          ambiguityReduction: Math.max(
            0,
            stateBefore.remainingAmbiguityScore - stateAfter.remainingAmbiguityScore,
          ),
        };
        return [...withoutCurrent, enrichedAnswer];
      });
      setFocusedQuestionId(null);
    },
    [activeAnalysis, allowOptionalRefinement, selectedInterpretation, settings.ambiguityThreshold],
  );

  const setClarificationAnswer = useCallback(
    (
      questionId: string,
      selectedOptionId: string | null,
      customAnswer: string,
      resolvedValue: string,
    ) => {
      submitClarificationTurn(questionId, selectedOptionId, customAnswer, resolvedValue);
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

  const generateFinalResolution = useCallback(async () => {
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
    clarificationAnswers,
    selectedInterpretation,
    selectedInterpretationId,
    settings.ambiguityThreshold,
  ]);

  const loadHistorySession = useCallback(
    async (item: SessionHistoryItem) => {
      await runAnalysis(item.prompt, item.domain, strictness);
    },
    [runAnalysis, strictness],
  );

  const clearHistory = useCallback(() => {
    setSessionHistory([]);
  }, []);

  // PS2 Inventory Actions
  const draftPurchaseOrder = useCallback(
    (recommendationId: string) => {
      const target = recommendations.find((r) => r.id === recommendationId);
      if (!target || target.status === "PO Drafted") return;

      setRecommendations((prev) =>
        prev.map((rec) => (rec.id === recommendationId ? { ...rec, status: "PO Drafted" } : rec)),
      );

      const newApproval: InventoryApprovalItem = {
        id: `apr-${Date.now()}`,
        title: `PO-DRAFT • ${target.recommendedQty}x ${target.sku} (${target.supplier})`,
        type: "Purchase Order",
        requestedBy: `Demo User (${activeRole})`,
        ownerRole: "Procurement Manager",
        amountUsd: target.estimatedCostUsd,
        sku: target.sku,
        qty: target.recommendedQty,
        crdImpact:
          target.impactedOrders.length > 0
            ? `Protects ${target.impactedOrders.join(", ")}`
            : "Replenishes safety stock buffer",
        status: "Pending",
        note: target.rationale,
      };
      setApprovals((prev) => [newApproval, ...prev]);
      setNotifications((prev) => [
        {
          id: `notif-po-${Date.now()}`,
          title: `Draft PO Created: ${target.sku}`,
          detail: `${target.recommendedQty} units ($${target.estimatedCostUsd.toLocaleString()}) routed to Procurement approval queue.`,
          category: "PS2",
          severity: "info",
          route: "/inventory",
          read: false,
        },
        ...prev,
      ]);
    },
    [activeRole, recommendations],
  );

  const updateApprovalStatus = useCallback(
    (approvalId: string, status: InventoryApprovalItem["status"]) => {
      setApprovals((prev) =>
        prev.map((item) => (item.id === approvalId ? { ...item, status } : item)),
      );
    },
    [],
  );

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  // Shared AI Assistant responder (PS6 + PS2 unified)
  const sendAssistantQuery = useCallback(
    (rawQuery: string) => {
      const q = rawQuery.trim();
      if (!q) return;
      const lower = q.toLowerCase();
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

      let replyText = "";
      let domainTag: AssistantMessage["domainTag"] = "Unified";
      let suggestedRoute: string | undefined;
      let suggestedLabel: string | undefined;

      if (/\b(shortage|stock|sku|mcu|sensor|warehouse|inventory)\b/i.test(lower)) {
        domainTag = "PS2 Inventory";
        const shortages = materials.filter((m) => m.health !== "Healthy");
        replyText = `${shortages.length} materials need attention: ${shortages
          .map((m) => `${m.sku} (${m.available} avail vs ${m.safetyStock} safety — ${m.health})`)
          .join("; ")}.`;
        suggestedRoute = "/inventory";
        suggestedLabel = "Inspect Materials & Shortages";
      } else if (/\b(crd|order|delay|tata|reliance|fulfillment)\b/i.test(lower)) {
        domainTag = "PS2 Inventory";
        const atRisk = orders.filter((o) => o.crdRisk !== "On Track");
        replyText = `${atRisk.length} customer orders have CRD risk: ${atRisk
          .map(
            (o) =>
              `${o.orderNumber} (${o.customer}, ${o.daysUntilCrd}d to CRD, ${o.fulfillmentPct}% filled — ${o.crdRisk})`,
          )
          .join("; ")}.`;
        suggestedRoute = "/inventory";
        suggestedLabel = "Open CRD Risk Monitor";
      } else if (/\b(approval|po|purchase|recommend|supplier)\b/i.test(lower)) {
        domainTag = "PS2 Inventory";
        const pending = approvals.filter((a) => a.status === "Pending");
        replyText = `${pending.length} approval requests are pending (${pending
          .map((p) => `${p.sku} $${p.amountUsd.toLocaleString()}`)
          .join(
            ", ",
          )}), and ${recommendations.filter((r) => r.status === "Suggested").length} PO recommendations are ready to draft.`;
        suggestedRoute = "/inventory";
        suggestedLabel = "Review PO Approvals";
      } else if (/\b(verify|verification|contradict|missing|complete)\b/i.test(lower)) {
        domainTag = "PS6 Language";
        replyText = `Verification status is "${verificationReport.status}" (${verificationReport.completenessScore}% complete): ${verificationReport.completenessExplanation}`;
        suggestedRoute = verificationReport.allRequiredPassed ? "/resolution" : "/clarification";
        suggestedLabel = verificationReport.allRequiredPassed
          ? "Open Final Resolution"
          : "Fix in Clarification";
      } else if (
        /\b(graph|node|ambigu|span|why|interpret|what-if|language|kannada|hindi)\b/i.test(lower)
      ) {
        domainTag = "PS6 Language";
        replyText = `Active prompt (${activeAnalysis.multilingual.detectedLanguage}) has ${activeAnalysis.spans.length} ambiguity spans (${activeAnalysis.ambiguityScore}% ambiguity). Highest-priority unresolved question targets "${optimizerState.activeQuestion?.targetToken ?? "none"}".`;
        suggestedRoute = "/visualization";
        suggestedLabel = "View Context Graph";
      } else {
        domainTag = "Unified";
        const shortagesCount = materials.filter((m) => m.health === "Shortage").length;
        const atRiskOrders = orders.filter((o) => o.crdRisk !== "On Track").length;
        replyText = `Unified Snapshot (${activeRole}): PS6 prompt is ${verificationReport.completenessScore}% verified (${activeAnalysis.spans.length} spans, ${uiLanguage} UI). PS2 tracks ${shortagesCount} critical SKU shortages and ${atRiskOrders} CRD-at-risk orders.`;
        suggestedRoute = "/evaluation";
        suggestedLabel = "View Unified Analytics";
      }

      const assistantMsg: AssistantMessage = {
        id: `a-${Date.now() + 1}`,
        sender: "assistant",
        text: replyText,
        domainTag,
        suggestedRoute,
        suggestedLabel,
        timestamp: nowLabel,
      };

      setAssistantMessages((prev) => [...prev, userMsg, assistantMsg]);
    },
    [
      activeAnalysis,
      activeRole,
      approvals,
      materials,
      optimizerState.activeQuestion?.targetToken,
      orders,
      recommendations,
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
    if (clarificationAnswers.length === 0) {
      return finalResolution;
    }
    const base = computeResolutionFromInputs(
      activeAnalysis.prompt,
      activeAnalysis.spans,
      selectedInterpretation,
      clarificationAnswers,
      activeAnalysis.domain,
      activeAnalysis.clarificationQuestions,
    );
    const remainingAmbiguityScore = optimizerState.remainingAmbiguityScore;
    const clarityGain = Math.max(
      0,
      optimizerState.currentClarityScore - activeAnalysis.clarityScore,
    );
    return {
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
        stoppedEarly: optimizerState.isSufficientlyClear && optimizerState.skippedOptionalCount > 0,
        stopReason: optimizerState.stopReason,
        essentialFields: optimizerState.essentialFields,
      },
      verification: verificationReport,
    };
  }, [
    activeAnalysis,
    clarificationAnswers,
    finalResolution,
    optimizerState,
    selectedInterpretation,
    verificationReport,
  ]);

  const value: ResolveXContextValue = {
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
    analysisStage,
    analysisStageLabel,
    activeAnalysis,
    selectedInterpretationId,
    setSelectedInterpretationId,
    selectedInterpretation,
    interpretationDiffs,
    sendScenarioToClarification,
    resetInterpretationSimulation,
    clarificationAnswers,
    optimizerState,
    verificationReport,
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
    activeRole,
    setActiveRole,
    materials,
    orders,
    recommendations,
    approvals,
    draftPurchaseOrder,
    updateApprovalStatus,
    assistantOpen,
    setAssistantOpen,
    assistantMessages,
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
