import { createContext } from "react";
import type {
  AnalysisResult,
  AppSettings,
  AssistantMessage,
  ClarificationAnswer,
  ClarificationOptimizerState,
  ContextIntelligenceGraphData,
  DomainContext,
  FinalResolution,
  Interpretation,
  InventoryApprovalItem,
  InventoryMaterial,
  InventoryOrder,
  LanguageOption,
  NotificationItem,
  PurchaseRecommendation,
  ResolvedLanguage,
  ResolutionVerificationReport,
  ScenarioDimensionDiff,
  SessionHistoryItem,
  StrictnessLevel,
  UserDemoRole,
} from "@/types/resolvex";

export interface ResolveXContextValue {
  // PS6 Language Intelligence
  promptInput: string;
  setPromptInput: (value: string) => void;
  domain: DomainContext;
  setDomain: (value: DomainContext) => void;
  strictness: StrictnessLevel;
  setStrictness: (value: StrictnessLevel) => void;
  language: LanguageOption;
  setLanguage: (value: LanguageOption) => void;
  uiLanguage: ResolvedLanguage;
  isAnalyzing: boolean;
  analysisStage: number;
  analysisStageLabel: string;
  activeAnalysis: AnalysisResult;
  selectedInterpretationId: string | null;
  setSelectedInterpretationId: (id: string | null) => void;
  selectedInterpretation: Interpretation | null;
  interpretationDiffs: ScenarioDimensionDiff[];
  sendScenarioToClarification: (interpretationId: string) => void;
  resetInterpretationSimulation: () => void;
  clarificationAnswers: ClarificationAnswer[];
  optimizerState: ClarificationOptimizerState;
  verificationReport: ResolutionVerificationReport;
  contextGraph: ContextIntelligenceGraphData;
  focusedQuestionId: string | null;
  focusClarificationQuestion: (questionId: string | null) => void;
  allowOptionalRefinement: boolean;
  setAllowOptionalRefinement: (value: boolean) => void;
  setClarificationAnswer: (
    questionId: string,
    selectedOptionId: string | null,
    customAnswer: string,
    resolvedValue: string,
  ) => void;
  submitClarificationTurn: (
    questionId: string,
    selectedOptionId: string | null,
    customAnswer: string,
    resolvedValue: string,
  ) => void;
  revertToTurn: (turnIndex: number) => void;
  resetClarificationFlow: () => void;
  finalResolution: FinalResolution;
  sessionHistory: SessionHistoryItem[];
  runAnalysis: (
    customPrompt?: string,
    customDomain?: DomainContext,
    customStrictness?: StrictnessLevel,
  ) => Promise<AnalysisResult>;
  selectExamplePrompt: (exampleId: string) => Promise<AnalysisResult>;
  selectMultilingualSample: (sampleId: string) => Promise<AnalysisResult>;
  generateFinalResolution: () => Promise<FinalResolution>;
  loadHistorySession: (item: SessionHistoryItem) => Promise<void>;
  clearHistory: () => void;

  // PS2 Smart Inventory Intelligence & Role Views
  activeRole: UserDemoRole;
  setActiveRole: (role: UserDemoRole) => void;
  materials: InventoryMaterial[];
  orders: InventoryOrder[];
  recommendations: PurchaseRecommendation[];
  approvals: InventoryApprovalItem[];
  draftPurchaseOrder: (recommendationId: string) => void;
  updateApprovalStatus: (approvalId: string, status: InventoryApprovalItem["status"]) => void;

  // Shared AI Assistant & Notifications & Global Search
  assistantOpen: boolean;
  setAssistantOpen: (open: boolean) => void;
  assistantMessages: AssistantMessage[];
  sendAssistantQuery: (query: string) => void;
  notifications: NotificationItem[];
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  globalSearchQuery: string;
  setGlobalSearchQuery: (query: string) => void;

  // Settings
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

export const ResolveXContext = createContext<ResolveXContextValue | undefined>(undefined);
