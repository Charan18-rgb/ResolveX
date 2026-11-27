import { createContext } from "react";
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
  // Backend Connectivity & Errors
  backendHealth: BackendHealthStatus | null;
  refreshBackendHealth: () => Promise<BackendHealthStatus>;
  apiError: string | null;
  clearApiError: () => void;

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
  isSubmittingClarification: boolean;
  analysisStage: number;
  analysisStageLabel: string;
  activeAnalysis: AnalysisResult;
  activeConversationDetail: BackendConversationDetail | null;
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
  ) => Promise<void>;
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
  isLoadingInventory: boolean;
  ps2Error: string | null;
  backendInventoryOverview: BackendInventoryOverviewResponse | null;
  backendOrders: BackendOrderRow[];
  backendOrderRisks: BackendOrderRiskItem[];
  backendShortages: BackendShortageItem[];
  backendProposals: BackendPurchaseOrderProposal[];
  backendAlerts: BackendAlertItem[];
  backendBriefing: BackendBriefingResponse | null;
  backendEvents: BackendInventoryEvent[];
  refreshInventoryData: () => Promise<void>;
  generatePoProposals: () => Promise<BackendPurchaseOrderProposal[]>;
  recalculateInventoryAllocations: () => Promise<void>;
  ingestInventoryEvent: (payload: {
    event_id: string;
    event_type: string;
    entity_ref: string;
    payload: Record<string, unknown>;
    simulated?: boolean;
  }) => Promise<BackendEventIngestionResponse>;
  acknowledgeBackendAlert: (alertId: number) => Promise<void>;
  decidePoProposal: (
    proposalId: string,
    decision: "approve" | "reject",
    comment?: string,
  ) => Promise<{ ok: boolean; message: string }>;
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
  isAssistantLoading: boolean;
  assistantConversationId: string | null;
  resetAssistantConversation: () => void;
  sendAssistantQuery: (query: string) => Promise<void>;
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
