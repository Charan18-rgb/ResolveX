import { createContext } from 'react'
import type {
  AnalysisResult,
  AppSettings,
  ClarificationAnswer,
  ClarificationOptimizerState,
  ContextIntelligenceGraphData,
  DomainContext,
  FinalResolution,
  Interpretation,
  ResolutionVerificationReport,
  SessionHistoryItem,
  StrictnessLevel,
} from '../types/resolvex'

export interface ResolveXContextValue {
  promptInput: string
  setPromptInput: (value: string) => void
  domain: DomainContext
  setDomain: (value: DomainContext) => void
  strictness: StrictnessLevel
  setStrictness: (value: StrictnessLevel) => void
  isAnalyzing: boolean
  activeAnalysis: AnalysisResult
  selectedInterpretationId: string | null
  setSelectedInterpretationId: (id: string | null) => void
  selectedInterpretation: Interpretation | null
  clarificationAnswers: ClarificationAnswer[]
  optimizerState: ClarificationOptimizerState
  verificationReport: ResolutionVerificationReport
  contextGraph: ContextIntelligenceGraphData
  focusedQuestionId: string | null
  focusClarificationQuestion: (questionId: string | null) => void
  allowOptionalRefinement: boolean
  setAllowOptionalRefinement: (value: boolean) => void
  setClarificationAnswer: (
    questionId: string,
    selectedOptionId: string | null,
    customAnswer: string,
    resolvedValue: string,
  ) => void
  submitClarificationTurn: (
    questionId: string,
    selectedOptionId: string | null,
    customAnswer: string,
    resolvedValue: string,
  ) => void
  revertToTurn: (turnIndex: number) => void
  resetClarificationFlow: () => void
  finalResolution: FinalResolution
  sessionHistory: SessionHistoryItem[]
  settings: AppSettings
  updateSettings: (partial: Partial<AppSettings>) => void
  resetSettings: () => void
  clearHistory: () => void
  runAnalysis: (
    customPrompt?: string,
    customDomain?: DomainContext,
    customStrictness?: StrictnessLevel,
  ) => Promise<AnalysisResult>
  selectExamplePrompt: (exampleId: string) => Promise<AnalysisResult>
  generateFinalResolution: () => Promise<FinalResolution>
  loadHistorySession: (item: SessionHistoryItem) => Promise<void>
}

export const ResolveXContext = createContext<ResolveXContextValue | undefined>(
  undefined,
)
