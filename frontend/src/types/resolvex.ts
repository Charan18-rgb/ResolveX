export type AmbiguityCategory =
  "Lexical" | "Syntactic" | "Referential" | "Scope" | "Temporal" | "Pragmatic";

export type RiskLevel = "Low" | "Moderate" | "High" | "Critical";

export type LanguageOption =
  "Auto Detect" | "English" | "Kannada" | "Hindi" | "Hinglish" | "Kanglish";

export type ResolvedLanguage = Exclude<LanguageOption, "Auto Detect">;

export interface CodeMixedTokenInfo {
  token: string;
  languageTag: ResolvedLanguage;
  normalizedMeaning: string;
}

export interface MultilingualAnalysisMetadata {
  requestedLanguage: LanguageOption;
  detectedLanguage: ResolvedLanguage;
  isCodeMixed: boolean;
  scriptsDetected: string[];
  detectionConfidence: number;
  originalPrompt: string;
  normalizedEnglishMeaning: string;
  codeMixedTokens: CodeMixedTokenInfo[];
  engineNote: string;
}

export type DomainContext =
  | "General"
  | "Software Engineering"
  | "Product & Ops"
  | "Data & Analytics"
  | "Enterprise Support"
  | "Supply Chain & Inventory";

export type StrictnessLevel = "Balanced" | "Strict" | "Exploratory";

export interface AmbiguitySpan {
  id: string;
  token: string;
  startIndex: number;
  endIndex: number;
  category: AmbiguityCategory;
  severity: number;
  confidence: number;
  reason: string;
  candidateMeanings: string[];
}

export interface CategoryScore {
  category: AmbiguityCategory;
  score: number;
  count: number;
}

export interface SimulatedStructuredIntent {
  action: string;
  entities: string[];
  recipient: string;
  object: string;
  date: string;
  resolvedDirective: string;
}

export interface InterpretationTriggerWord {
  word: string;
  category: AmbiguityCategory;
  divergenceReason: string;
}

export interface SimulatedConsequence {
  label: string;
  severity: "Positive" | "Neutral" | "Risk";
  detail: string;
}

export interface Interpretation {
  id: string;
  title: string;
  summary: string;
  probability: number;
  impactScope: string;
  riskLevel: RiskLevel;
  assumptions: string[];
  recommendedAction: string;
  simulatedIntent: SimulatedStructuredIntent;
  triggerWords: InterpretationTriggerWord[];
  consequences: SimulatedConsequence[];
}

export interface ScenarioDimensionDiff {
  dimension: "action" | "entities" | "recipient" | "object" | "date";
  label: string;
  differs: boolean;
  causedByWords: string[];
  valuesByScenario: Array<{
    scenarioId: string;
    scenarioTitle: string;
    value: string;
  }>;
}

export type EssentialIntentField =
  | "Action Scope"
  | "Target Entity"
  | "Execution Timing"
  | "Safety & Guardrails"
  | "Output Deliverable";

export interface ClarificationOption {
  id: string;
  label: string;
  description: string;
  resolvesTo: string;
}

export interface ClarificationQuestion {
  id: string;
  targetSpanId: string;
  targetToken: string;
  category: AmbiguityCategory;
  question: string;
  rationale: string;
  importanceScore: number;
  essentialField: EssentialIntentField;
  isEssential: boolean;
  estimatedClarityGain: number;
  necessityReason: string;
  selectionExplanation: string;
  dependentSpanIds?: string[] | undefined;
  options: ClarificationOption[];
}

export interface ClarificationAnswer {
  questionId: string;
  selectedOptionId: string | null;
  customAnswer: string;
  resolvedValue: string;
  turnNumber?: number | undefined;
  answeredAt?: string | undefined;
  targetToken?: string | undefined;
  questionText?: string | undefined;
  essentialField?: EssentialIntentField | undefined;
  selectionExplanation?: string | undefined;
  clarityBefore?: number | undefined;
  clarityAfter?: number | undefined;
  ambiguityReduction?: number | undefined;
  source?: "option" | "custom" | undefined;
}

export interface RemainingAmbiguityItem {
  spanId: string;
  token: string;
  category: AmbiguityCategory;
  essentialField: EssentialIntentField;
  isEssential: boolean;
  baseSeverity: number;
  currentSeverity: number;
  importanceScore: number;
  status: "Unresolved" | "Reduced" | "Resolved";
  questionId: string | null;
  rank: number;
  rankReason: string;
}

export interface EssentialFieldStatus {
  field: EssentialIntentField;
  required: boolean;
  status: "Clear" | "Needs Clarification";
  resolvedByToken?: string | undefined;
  resolvedValue?: string | undefined;
}

export interface ClarificationOptimizerState {
  initialAmbiguityScore: number;
  remainingAmbiguityScore: number;
  initialClarityScore: number;
  currentClarityScore: number;
  progressPercentage: number;
  essentialFields: EssentialFieldStatus[];
  rankedAmbiguities: RemainingAmbiguityItem[];
  unresolvedQuestionsQueue: ClarificationQuestion[];
  activeQuestion: ClarificationQuestion | null;
  activeSelectionReason: string;
  isSufficientlyClear: boolean;
  stopReason: string | null;
  skippedOptionalCount: number;
  conversationHistory: ClarificationAnswer[];
}

export interface StructuredIntentSpec {
  intentType: string;
  primarySubject: string;
  targetScope: string;
  constraints: string[];
  timeHorizon: string;
  outputFormat: string;
  confidenceAfterClarification: number;
}

export type FieldVerificationStatus =
  "Passed" | "Missing" | "Ambiguous" | "Contradictory" | "Optional Pending";

export type VerificationIssueType = "missing" | "ambiguous" | "contradictory";

export interface FieldVerificationCheck {
  field: EssentialIntentField;
  required: boolean;
  status: FieldVerificationStatus;
  issueType?: VerificationIssueType | undefined;
  explanation: string;
  resolvedValue?: string | undefined;
  targetQuestionId?: string | null | undefined;
  targetToken?: string | undefined;
}

export interface ResolutionVerificationReport {
  status: "Verified" | "Needs Clarification" | "Blocked";
  allRequiredPassed: boolean;
  completenessScore: number;
  completenessExplanation: string;
  requiredTotal: number;
  requiredPassed: number;
  optionalTotal: number;
  optionalPassed: number;
  missingFields: EssentialIntentField[];
  ambiguousFields: EssentialIntentField[];
  contradictoryFields: EssentialIntentField[];
  contradictions: Array<{
    fields: [EssentialIntentField, EssentialIntentField];
    reason: string;
    targetQuestionId: string | null;
  }>;
  fieldChecks: FieldVerificationCheck[];
  checkedAt: string;
}

export interface FinalResolution {
  originalPrompt: string;
  resolvedPrompt: string;
  clarityGain: number;
  remainingAmbiguityScore: number;
  structuredSpec: StructuredIntentSpec;
  appliedDecisions: Array<{
    token: string;
    decision: string;
    essentialField?: EssentialIntentField | undefined;
    selectionExplanation?: string | undefined;
    ambiguityReduction?: number | undefined;
  }>;
  optimizationSummary?:
    | {
        turnsTaken: number;
        totalQuestionsAvailable: number;
        skippedOptionalCount: number;
        stoppedEarly: boolean;
        stopReason: string | null;
        essentialFields: EssentialFieldStatus[];
      }
    | undefined;
  verification?: ResolutionVerificationReport | undefined;
  generatedAt: string;
}

export interface AnalysisResult {
  id: string;
  prompt: string;
  domain: DomainContext;
  strictness: StrictnessLevel;
  createdAt: string;
  isDemoData: boolean;
  ambiguityScore: number;
  clarityScore: number;
  riskLevel: RiskLevel;
  summary: string;
  multilingual: MultilingualAnalysisMetadata;
  spans: AmbiguitySpan[];
  categoryBreakdown: CategoryScore[];
  interpretations: Interpretation[];
  clarificationQuestions: ClarificationQuestion[];
  defaultResolution: FinalResolution;
}

export interface ExamplePrompt {
  id: string;
  title: string;
  tag: string;
  domain: DomainContext;
  prompt: string;
  previewAmbiguity: number;
}

export interface MultilingualSampleCase {
  id: string;
  title: string;
  language: ResolvedLanguage;
  tag: string;
  domain: DomainContext;
  prompt: string;
  normalizedHint: string;
  isCodeMixed: boolean;
}

export interface SessionHistoryItem {
  id: string;
  prompt: string;
  domain: DomainContext;
  ambiguityScore: number;
  resolved: boolean;
  createdAt: string;
}

export type UserDemoRole = "Inventory Planner" | "Procurement Manager" | "Operations Manager";

export interface AppSettings {
  apiBaseUrl: string;
  integrationMode: "mock" | "fastapi-ready";
  ambiguityThreshold: number;
  maxClarificationQuestions: number;
  defaultDomain: DomainContext;
  defaultStrictness: StrictnessLevel;
  defaultRole: UserDemoRole;
  reduceMotion: boolean;
  showTokenConfidence: boolean;
}

export interface EvaluationOverviewMetric {
  label: string;
  value: string;
  delta: string;
  note: string;
}

export interface EvaluationDataset {
  isDemoData: true;
  benchmarkName: string;
  sampleCount: number;
  lastUpdated: string;
  overview: EvaluationOverviewMetric[];
  categoryPerformance: Array<{
    category: AmbiguityCategory;
    precision: number;
    recall: number;
    f1: number;
  }>;
  baselineComparison: Array<{
    turn: string;
    rawPromptClarity: number;
    singleTurnLLM: number;
    resolveXPipeline: number;
  }>;
  latencyDistribution: Array<{
    stage: string;
    latencyMs: number;
  }>;
  benchmarkCases: Array<{
    id: string;
    promptSnippet: string;
    category: AmbiguityCategory;
    detectedSpans: number;
    turnsToResolve: number;
    finalClarity: number;
    status: "Resolved" | "Needs Review";
  }>;
  inventoryMetrics: {
    overview: EvaluationOverviewMetric[];
    stockHealthTrend: Array<{
      week: string;
      serviceLevel: number;
      crdOnTimeRate: number;
      shortageRiskIndex: number;
    }>;
    warehouseUtilization: Array<{
      warehouse: string;
      availableUnits: number;
      reservedUnits: number;
      shortageUnits: number;
    }>;
  };
}

export type GraphNodeKind =
  "action" | "person" | "object" | "date" | "location" | "ambiguous_reference";

export type GraphNodeState = "ambiguous" | "unresolved" | "resolved";

export interface ContextGraphNode {
  id: string;
  label: string;
  kind: GraphNodeKind;
  state: GraphNodeState;
  x: number;
  y: number;
  meaning: string;
  resolvedValue?: string | undefined;
  uncertaintyScore: number;
  uncertaintyReason: string;
  interpretations: string[];
  linkedSpanId?: string | undefined;
  linkedQuestionId?: string | undefined;
}

export interface ContextGraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  state: GraphNodeState;
}

export interface ContextIntelligenceGraphData {
  nodes: ContextGraphNode[];
  edges: ContextGraphEdge[];
  summary: {
    totalNodes: number;
    ambiguousCount: number;
    unresolvedCount: number;
    resolvedCount: number;
    averageUncertainty: number;
    activeInterpretationTitle: string | null;
  };
}

// --- PS2: SMART INVENTORY INTELLIGENCE TYPES ---

export type MaterialHealth = "Healthy" | "Low Stock" | "Shortage";

export interface InventoryMaterial {
  id: string;
  sku: string;
  name: string;
  category: string;
  warehouse: string;
  onHand: number;
  allocated: number;
  available: number;
  safetyStock: number;
  reorderPoint: number;
  unitCostUsd: number;
  leadTimeDays: number;
  supplier: string;
  health: MaterialHealth;
}

export type CrdRiskTier = "On Track" | "At Risk" | "Critical Delay";

export interface InventoryOrder {
  id: string;
  orderNumber: string;
  customer: string;
  priority: "Standard" | "Expedited" | "VIP";
  crdDate: string;
  daysUntilCrd: number;
  requiredSku: string;
  requiredQty: number;
  allocatedQty: number;
  fulfillmentPct: number;
  crdRisk: CrdRiskTier;
  instructionNote: string;
}

export interface PurchaseRecommendation {
  id: string;
  sku: string;
  materialName: string;
  netShortage: number;
  recommendedQty: number;
  estimatedCostUsd: number;
  supplier: string;
  leadTimeDays: number;
  impactedOrders: string[];
  urgency: "High" | "Critical" | "Moderate";
  rationale: string;
  status: "Suggested" | "PO Drafted";
}

export interface InventoryApprovalItem {
  id: string;
  title: string;
  type: "Purchase Order" | "Stock Reallocation" | "Expedite Freight";
  requestedBy: string;
  ownerRole: UserDemoRole;
  amountUsd: number;
  sku: string;
  qty: number;
  crdImpact: string;
  status: "Pending" | "Approved" | "Rejected" | "Clarification Requested";
  note: string;
}

export interface AssistantMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  domainTag: "PS6 Language" | "PS2 Inventory" | "Unified";
  suggestedRoute?: string | undefined;
  suggestedLabel?: string | undefined;
  timestamp: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  detail: string;
  category: "PS6" | "PS2";
  severity: "info" | "warning" | "critical";
  route: string;
  read: boolean;
}

export interface AnalyzePromptRequest {
  prompt: string;
  domain: DomainContext;
  strictness: StrictnessLevel;
  language?: LanguageOption | undefined;
  maxQuestions?: number | undefined;
}

export interface ResolveIntentRequest {
  analysisId: string;
  prompt: string;
  selectedInterpretationId: string | null;
  answers: ClarificationAnswer[];
}

export interface BackendHealthStatus {
  reachable: boolean;
  mode: "mock" | "fastapi-ready";
  baseUrl: string;
  checkedAt: string;
  message: string;
}
