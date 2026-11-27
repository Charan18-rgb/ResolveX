import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  buildPresetAnalysis,
  computeResolutionFromInputs,
  DEFAULT_APP_SETTINGS,
  EXAMPLE_PROMPTS,
} from '../data/mockData'
import { resolveXService } from '../services/api'
import type {
  AnalysisResult,
  AppSettings,
  ClarificationAnswer,
  DomainContext,
  FinalResolution,
  SessionHistoryItem,
  StrictnessLevel,
} from '../types/resolvex'
import {
  ResolveXContext,
  type ResolveXContextValue,
} from './resolveXContextDef'

const STORAGE_KEYS = {
  settings: 'resolvex_settings_v1',
  history: 'resolvex_history_v1',
  activeAnalysis: 'resolvex_active_analysis_v1',
} as const

function loadStoredSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings)
    if (!raw) return DEFAULT_APP_SETTINGS
    return { ...DEFAULT_APP_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) }
  } catch {
    return DEFAULT_APP_SETTINGS
  }
}

function loadStoredHistory(initialAnalysis: AnalysisResult): SessionHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.history)
    if (raw) {
      const parsed = JSON.parse(raw) as SessionHistoryItem[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    // ignore storage errors
  }

  return [
    {
      id: initialAnalysis.id,
      prompt: initialAnalysis.prompt,
      domain: initialAnalysis.domain,
      ambiguityScore: initialAnalysis.ambiguityScore,
      resolved: false,
      createdAt: initialAnalysis.createdAt,
    },
  ]
}

function buildInitialAnswers(): ClarificationAnswer[] {
  return []
}

export function ResolveXProvider({ children }: { children: ReactNode }) {
  const initialPreset = useMemo(() => buildPresetAnalysis('ex-deploy-fast'), [])
  const [settings, setSettings] = useState<AppSettings>(loadStoredSettings)
  const [promptInput, setPromptInput] = useState<string>(
    EXAMPLE_PROMPTS[0].prompt,
  )
  const [domain, setDomain] = useState<DomainContext>(
    settings.defaultDomain,
  )
  const [strictness, setStrictness] = useState<StrictnessLevel>(
    settings.defaultStrictness,
  )
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [activeAnalysis, setActiveAnalysis] =
    useState<AnalysisResult>(initialPreset)
  const [selectedInterpretationId, setSelectedInterpretationId] = useState<
    string | null
  >(initialPreset.interpretations[0]?.id ?? null)
  const [clarificationAnswers, setClarificationAnswers] = useState<
    ClarificationAnswer[]
  >(() => buildInitialAnswers())
  const [allowOptionalRefinement, setAllowOptionalRefinement] = useState(false)
  const [focusedQuestionId, setFocusedQuestionId] = useState<string | null>(null)
  const [finalResolution, setFinalResolution] = useState<FinalResolution>(
    initialPreset.defaultResolution,
  )
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>(
    () => loadStoredHistory(initialPreset),
  )

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings))
    } catch {
      // ignore
    }
  }, [settings])

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.history,
        JSON.stringify(sessionHistory.slice(0, 12)),
      )
    } catch {
      // ignore
    }
  }, [sessionHistory])

  const selectedInterpretation = useMemo(
    () =>
      activeAnalysis.interpretations.find(
        (interp) => interp.id === selectedInterpretationId,
      ) ??
      activeAnalysis.interpretations[0] ??
      null,
    [activeAnalysis, selectedInterpretationId],
  )

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
  )

  const verificationReport = useMemo(
    () =>
      resolveXService.verifyResolutionReadiness(
        activeAnalysis,
        clarificationAnswers,
        selectedInterpretation,
      ),
    [activeAnalysis, clarificationAnswers, selectedInterpretation],
  )

  const contextGraph = useMemo(
    () =>
      resolveXService.buildContextGraph(
        activeAnalysis,
        clarificationAnswers,
        selectedInterpretation,
        optimizerState,
      ),
    [activeAnalysis, clarificationAnswers, optimizerState, selectedInterpretation],
  )

  const focusClarificationQuestion = useCallback((questionId: string | null) => {
    setFocusedQuestionId(questionId)
  }, [])

  const applyNewAnalysis = useCallback((result: AnalysisResult) => {
    setActiveAnalysis(result)
    setPromptInput(result.prompt)
    setDomain(result.domain)
    setStrictness(result.strictness)
    setSelectedInterpretationId(result.interpretations[0]?.id ?? null)
    setClarificationAnswers(buildInitialAnswers())
    setAllowOptionalRefinement(false)
    setFocusedQuestionId(null)
    setFinalResolution(result.defaultResolution)

    setSessionHistory((prev) => {
      const nextItem: SessionHistoryItem = {
        id: result.id,
        prompt: result.prompt,
        domain: result.domain,
        ambiguityScore: result.ambiguityScore,
        resolved: false,
        createdAt: result.createdAt,
      }
      const filtered = prev.filter((item) => item.prompt !== result.prompt)
      return [nextItem, ...filtered].slice(0, 10)
    })
  }, [])

  const runAnalysis = useCallback(
    async (
      customPrompt?: string,
      customDomain?: DomainContext,
      customStrictness?: StrictnessLevel,
    ): Promise<AnalysisResult> => {
      const targetPrompt = (customPrompt ?? promptInput).trim()
      const targetDomain = customDomain ?? domain
      const targetStrictness = customStrictness ?? strictness

      setIsAnalyzing(true)
      try {
        const result = await resolveXService.analyzePrompt({
          prompt: targetPrompt,
          domain: targetDomain,
          strictness: targetStrictness,
          maxQuestions: settings.maxClarificationQuestions,
        })
        applyNewAnalysis(result)
        return result
      } finally {
        setIsAnalyzing(false)
      }
    },
    [
      applyNewAnalysis,
      domain,
      promptInput,
      settings.maxClarificationQuestions,
      strictness,
    ],
  )

  const selectExamplePrompt = useCallback(
    async (exampleId: string): Promise<AnalysisResult> => {
      const found =
        EXAMPLE_PROMPTS.find((e) => e.id === exampleId) ?? EXAMPLE_PROMPTS[0]
      setIsAnalyzing(true)
      try {
        await new Promise((r) => setTimeout(r, 180))
        const result = buildPresetAnalysis(found.id, strictness)
        applyNewAnalysis(result)
        return result
      } finally {
        setIsAnalyzing(false)
      }
    },
    [applyNewAnalysis, strictness],
  )

  const submitClarificationTurn = useCallback(
    (
      questionId: string,
      selectedOptionId: string | null,
      customAnswer: string,
      resolvedValue: string,
    ) => {
      const trimmedValue = resolvedValue.trim()
      if (!trimmedValue) return

      setClarificationAnswers((prev) => {
        const question = activeAnalysis.clarificationQuestions.find(
          (q) => q.id === questionId,
        )
        const withoutCurrent = prev.filter((item) => item.questionId !== questionId)
        const stateBefore = resolveXService.evaluateClarificationState(
          activeAnalysis,
          withoutCurrent,
          settings.ambiguityThreshold,
          allowOptionalRefinement,
          selectedInterpretation,
        )
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
          source: selectedOptionId ? 'option' : 'custom',
        }
        const nextAnswers = [...withoutCurrent, draftAnswer]
        const stateAfter = resolveXService.evaluateClarificationState(
          activeAnalysis,
          nextAnswers,
          settings.ambiguityThreshold,
          allowOptionalRefinement,
          selectedInterpretation,
        )

        const enrichedAnswer: ClarificationAnswer = {
          ...draftAnswer,
          clarityBefore: stateBefore.currentClarityScore,
          clarityAfter: stateAfter.currentClarityScore,
          ambiguityReduction: Math.max(
            0,
            stateBefore.remainingAmbiguityScore - stateAfter.remainingAmbiguityScore,
          ),
        }
        return [...withoutCurrent, enrichedAnswer]
      })
      setFocusedQuestionId(null)
    },
    [
      activeAnalysis,
      allowOptionalRefinement,
      selectedInterpretation,
      settings.ambiguityThreshold,
    ],
  )

  const setClarificationAnswer = useCallback(
    (
      questionId: string,
      selectedOptionId: string | null,
      customAnswer: string,
      resolvedValue: string,
    ) => {
      submitClarificationTurn(
        questionId,
        selectedOptionId,
        customAnswer,
        resolvedValue,
      )
    },
    [submitClarificationTurn],
  )

  const revertToTurn = useCallback((turnIndex: number) => {
    setClarificationAnswers((prev) => prev.slice(0, turnIndex))
    setAllowOptionalRefinement(false)
    setFocusedQuestionId(null)
  }, [])

  const resetClarificationFlow = useCallback(() => {
    setClarificationAnswers([])
    setAllowOptionalRefinement(false)
    setFocusedQuestionId(null)
    setFinalResolution(activeAnalysis.defaultResolution)
  }, [activeAnalysis.defaultResolution])

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
    )
    setFinalResolution(resolved)
    setSessionHistory((prev) =>
      prev.map((item) =>
        item.id === activeAnalysis.id
          ? { ...item, resolved: Boolean(resolved.verification?.allRequiredPassed) }
          : item,
      ),
    )
    return resolved
  }, [
    activeAnalysis,
    clarificationAnswers,
    selectedInterpretation,
    selectedInterpretationId,
    settings.ambiguityThreshold,
  ])

  const loadHistorySession = useCallback(
    async (item: SessionHistoryItem) => {
      await runAnalysis(item.prompt, item.domain, strictness)
    },
    [runAnalysis, strictness],
  )

  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }))
  }, [])

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_APP_SETTINGS)
    setDomain(DEFAULT_APP_SETTINGS.defaultDomain)
    setStrictness(DEFAULT_APP_SETTINGS.defaultStrictness)
  }, [])

  const clearHistory = useCallback(() => {
    setSessionHistory([])
  }, [])

  const effectiveFinalResolution = useMemo<FinalResolution>(() => {
    if (clarificationAnswers.length === 0) {
      return finalResolution
    }
    const base = computeResolutionFromInputs(
      activeAnalysis.prompt,
      activeAnalysis.spans,
      selectedInterpretation,
      clarificationAnswers,
      activeAnalysis.domain,
      activeAnalysis.clarificationQuestions,
    )
    const remainingAmbiguityScore = optimizerState.remainingAmbiguityScore
    const clarityGain = Math.max(
      0,
      optimizerState.currentClarityScore - activeAnalysis.clarityScore,
    )
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
        stoppedEarly:
          optimizerState.isSufficientlyClear &&
          optimizerState.skippedOptionalCount > 0,
        stopReason: optimizerState.stopReason,
        essentialFields: optimizerState.essentialFields,
      },
      verification: verificationReport,
    }
  }, [
    activeAnalysis,
    clarificationAnswers,
    finalResolution,
    optimizerState,
    selectedInterpretation,
    verificationReport,
  ])

  const value: ResolveXContextValue = {
    promptInput,
    setPromptInput,
    domain,
    setDomain,
    strictness,
    setStrictness,
    isAnalyzing,
    activeAnalysis,
    selectedInterpretationId,
    setSelectedInterpretationId,
    selectedInterpretation,
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
    settings,
    updateSettings,
    resetSettings,
    clearHistory,
    runAnalysis,
    selectExamplePrompt,
    generateFinalResolution,
    loadHistorySession,
  }

  return (
    <ResolveXContext.Provider value={value}>
      {children}
    </ResolveXContext.Provider>
  )
}
