export type AmbiguityCategory =
  "Lexical" | "Syntactic" | "Referential" | "Scope" | "Temporal" | "Pragmatic";

export type RiskLevel = "Low" | "Medium" | "Moderate" | "High" | "Critical";

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

export type ConfidenceProvenance =
  "live_backend" | "ai_unavailable_abstained" | "client_simulation";

export type ConfidenceBand = "high" | "moderate" | "low" | "abstained";

export type VerifiedCorrectnessState =
  "verified" | "partially_verified" | "unverified" | "contradictory";

export interface EvidenceItem {
  id: string;
  polarity: "supporting" | "contradicting";
  category: string;
  label: string;
  detail: string;
  source: string;
  impactWeight: number;
}

export interface UnresolvedEntityItem {
  token: string;
  kind: string;
  reason: string;
  resolved: boolean;
  resolvedValue?: string | undefined;
}

export interface ConfidenceHistoryPoint {
  turnNumber: number;
  timestamp: string;
  eventLabel: string;
  triggerInput: string;
  confidenceScore: number | null;
  confidenceBand: ConfidenceBand;
  verifiedCorrectness: VerifiedCorrectnessState;
  abstained: boolean;
  deltaFromPrevious: number | null;
  changeReasons: string[];
  changeSummary: string;
  evidenceCountSupporting: number;
  evidenceCountContradicting: number;
}

export interface ConfidenceAssessment {
  provenance: ConfidenceProvenance;
  isLiveBackend: boolean;
  modelConfidenceAvailable: boolean;
  confidenceBasis:
    | "backend_evidence_calibrated"
    | "deterministic_db_grounded"
    | "insufficient_evidence_abstained"
    | "client_simulation_calibrated";
  confidenceScore: number | null;
  confidenceBand: ConfidenceBand;
  uncertaintyScore: number;
  evidenceSufficiencyScore: number;
  verifiedCorrectness: VerifiedCorrectnessState;
  verificationExplanation: string;
  abstained: boolean;
  abstentionReason: string | null;
  recommendedAction: "request_clarification" | "resolve_conflicts" | "proceed_verified";
  recommendationReason: string;
  supportingEvidence: EvidenceItem[];
  contradictingEvidence: EvidenceItem[];
  missingContext: string[];
  unresolvedEntities: UnresolvedEntityItem[];
  history: ConfidenceHistoryPoint[];
  calibrationNote: string;
}

export interface Interpretation {
  id: string;
  title: string;
  summary: string;
  /** Illustrative weight for demo scenarios only; omitted for live backend analyses. */
  probability?: number | undefined;
  impactScope: string;
  riskLevel: RiskLevel;
  assumptions: string[];
  recommendedAction: string;
  simulatedIntent: SimulatedStructuredIntent;
  triggerWords: InterpretationTriggerWord[];
  consequences: SimulatedConsequence[];
  confidenceScore?: number | null | undefined;
  confidenceStatus?: "calibrated" | "abstained" | undefined;
  supportingSignals?: string[] | undefined;
  contradictingSignals?: string[] | undefined;
  missingRequirements?: string[] | undefined;
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

export type ImpactDimension =
  | "financial_payment"
  | "data_deletion"
  | "permission_access"
  | "sensitive_recipient"
  | "system_mutation";

export interface RiskFactor {
  dimension: ImpactDimension;
  level: RiskLevel;
  label: string;
  description: string;
  targetToken?: string | undefined;
  requiresConfirmation?: boolean | undefined;
}

export interface IntentRiskAssessment {
  riskLevel: RiskLevel;
  riskScore: number;
  requiresExplicitConfirmation: boolean;
  confirmationReason: string | null;
  highImpactAmbiguities: string[];
  riskFactors: RiskFactor[];
  actionType: string;
  targetSummary: string;
  reversibility: "reversible" | "partially_reversible" | "irreversible";
  mitigationGuidance: string;
  safeToResolve: boolean;
  confirmedByUser?: boolean | undefined;
  confirmedAt?: string | undefined;
}

export interface BackendRiskAssessmentDTO {
  risk_level: RiskLevel;
  risk_score: number;
  requires_explicit_confirmation: boolean;
  confirmation_reason: string | null;
  high_impact_ambiguities: string[];
  risk_factors: Array<{
    dimension: ImpactDimension;
    level: RiskLevel;
    label: string;
    description: string;
    target_token?: string | null | undefined;
    requires_confirmation?: boolean | undefined;
  }>;
  action_type: string;
  target_summary: string;
  reversibility: "reversible" | "partially_reversible" | "irreversible";
  mitigation_guidance: string;
  safe_to_resolve: boolean;
}

// --- FEATURE 10: EXPLAINABLE AI DECISION TIMELINE ---

export type DecisionTimelineEventType =
  | "initial_input"
  | "ambiguity_detected"
  | "interpretation_divergence"
  | "scenario_selected"
  | "clarification_question_selected"
  | "clarification_answered"
  | "memory_coreference_resolved"
  | "confidence_recalculated"
  | "risk_assessment_evaluated"
  | "risk_confirmed"
  | "verification_checked"
  | "final_intent_compiled";

export interface DecisionTimelineEvent {
  id: string;
  timestamp: string;
  turnNumber: number;
  type: DecisionTimelineEventType;
  title: string;
  summary: string;
  explanation: string;
  sourceContext?: string | undefined;
  sourceMessage?: string | undefined;
  targetToken?: string | undefined;
  category?: string | undefined;
  evidenceSignals: string[];
  metricsSnapshot?:
    | {
        ambiguityScore?: number | undefined;
        clarityScore?: number | undefined;
        confidenceScore?: number | null | undefined;
        verifiedCorrectness?: string | undefined;
        riskLevel?: RiskLevel | undefined;
        verificationStatus?: string | undefined;
      }
    | undefined;
}

export interface ExplainableDecisionTimeline {
  conversationId: string;
  generatedAt: string;
  totalEvents: number;
  events: DecisionTimelineEvent[];
  summaryNarrative: string;
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
  riskAssessment?: IntentRiskAssessment | undefined;
  decisionTimeline?: ExplainableDecisionTimeline | undefined;
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
  backendData?: BackendAnalyzeResponse | undefined;
  backendConversationId?: string | undefined;
  backendStatus?: "ANALYZING" | "NEEDS_CLARIFICATION" | "RESOLVED" | "FAILED" | undefined;
  confidenceAssessment?: ConfidenceAssessment | undefined;
  backendInventoryInsight?: BackendInventoryInsight | Record<string, unknown> | null | undefined;
  contextMemory?: SessionContextMemory | undefined;
  riskAssessment?: IntentRiskAssessment | undefined;
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

export type UserDemoRole = "Inventory Planner" | "Procurement Manager" | "Operations Manager" | "System Operator";

export interface AppSettings {
  apiBaseUrl: string;
  integrationMode: "live" | "mock";
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
  supportingEvidence?: string[] | undefined;
  contradictingEvidence?: string[] | undefined;
  verifiedCorrectness?: VerifiedCorrectnessState | undefined;
  abstained?: boolean | undefined;
  riskLevel?: RiskLevel | undefined;
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
    contradictoryCount?: number | undefined;
    missingContextCount?: number | undefined;
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
  domainTag: "Language & Intent" | "Inventory" | "Unified";
  suggestedRoute?: string | undefined;
  suggestedLabel?: string | undefined;
  timestamp: string;
  isError?: boolean | undefined;
  conversationId?: string | undefined;
  clarificationQuestions?: string[] | undefined;
  interpretations?: BackendInterpretationItem[] | undefined;
  inventoryInsight?: BackendInventoryInsight | null | undefined;
}

export interface NotificationItem {
  id: string;
  title: string;
  detail: string;
  category: "Language" | "Inventory";
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
  contextSummary?: string | undefined;
}

export interface ResolveIntentRequest {
  analysisId: string;
  prompt: string;
  selectedInterpretationId: string | null;
  answers: ClarificationAnswer[];
}

export interface BackendHealthStatus {
  reachable: boolean;
  mode: "live" | "mock";
  baseUrl: string;
  checkedAt: string;
  message: string;
  database?: "connected" | "disconnected" | undefined;
  aiConfigured?: boolean | undefined;
  service?: string | undefined;
}

export interface BackendConfidenceAssessmentDTO {
  provenance: "live_backend" | "ai_unavailable_abstained";
  model_confidence_available: boolean;
  confidence_basis:
    "backend_evidence_calibrated" | "deterministic_db_grounded" | "insufficient_evidence_abstained";
  confidence_score: number | null;
  confidence_band: ConfidenceBand;
  uncertainty_score: number;
  evidence_sufficiency_score: number;
  verified_correctness: VerifiedCorrectnessState;
  verification_explanation: string;
  abstained: boolean;
  abstention_reason: string | null;
  recommended_action?:
    "request_clarification" | "resolve_conflicts" | "proceed_verified" | undefined;
  recommendation_reason?: string | undefined;
  supporting_evidence: Array<{
    id: string;
    polarity: "supporting" | "contradicting";
    category: string;
    label: string;
    detail: string;
    source: string;
    impact_weight: number;
  }>;
  contradicting_evidence: Array<{
    id: string;
    polarity: "supporting" | "contradicting";
    category: string;
    label: string;
    detail: string;
    source: string;
    impact_weight: number;
  }>;
  missing_context: string[];
  unresolved_entities: Array<{
    token: string;
    kind: string;
    reason: string;
    resolved: boolean;
    resolved_value?: string | null | undefined;
  }>;
  calibration_note: string;
}

export interface BackendConfidenceHistoryDTO {
  turn_number: number;
  timestamp: string;
  event_label: string;
  trigger_input: string;
  confidence_score: number | null;
  confidence_band: ConfidenceBand;
  verified_correctness: VerifiedCorrectnessState;
  abstained: boolean;
  delta_from_previous: number | null;
  change_reasons: string[];
  change_summary: string;
  evidence_count_supporting: number;
  evidence_count_contradicting: number;
}

// --- FEATURE 8: CONTEXT MEMORY & CONVERSATION INTELLIGENCE ---

export type MemoryEntityCategory = "person" | "object" | "date" | "action" | "reference";

export interface RememberedEntity {
  id: string;
  sessionId: string;
  category: MemoryEntityCategory;
  label: string;
  value: string;
  sourceTurn: number;
  sourceRole: "user" | "clarification" | "context" | "edited";
  sourceMessage: string;
  editedByUser?: boolean | undefined;
}

export interface SessionReferenceResolution {
  referenceToken: string;
  category: "person" | "object" | "date" | "action" | "ordinal";
  status: "resolved" | "conflicting" | "unclear";
  resolvedValue: string | null;
  candidates: string[];
  sourceTurn?: number | undefined;
  sourceMessage?: string | undefined;
  explanation: string;
  clarificationQuestion?: string | undefined;
}

export interface SessionMessageEntry {
  id: string;
  turnNumber: number;
  role: "user" | "assistant" | "clarification";
  content: string;
  timestamp: string;
}

export interface SessionContextMemory {
  sessionId: string;
  title: string;
  messages: SessionMessageEntry[];
  entities: RememberedEntity[];
  resolvedReferences: SessionReferenceResolution[];
  referenceConflicts: SessionReferenceResolution[];
  editedAt?: string | undefined;
}

export interface BackendContextMemoryDTO {
  session_id: string;
  entities: Array<{
    id: string;
    session_id: string;
    category: MemoryEntityCategory;
    label: string;
    value: string;
    source_turn: number;
    source_role: string;
    source_message: string;
  }>;
  resolved_references: Array<{
    reference_token: string;
    category: "person" | "object" | "date" | "action" | "ordinal";
    status: "resolved" | "conflicting" | "unclear";
    resolved_value: string | null;
    candidates: string[];
    source_turn?: number | null | undefined;
    source_message?: string | null | undefined;
    explanation: string;
    clarification_question?: string | null | undefined;
  }>;
  reference_conflicts: Array<{
    reference_token: string;
    category: "person" | "object" | "date" | "action" | "ordinal";
    status: "resolved" | "conflicting" | "unclear";
    resolved_value: string | null;
    candidates: string[];
    source_turn?: number | null | undefined;
    source_message?: string | null | undefined;
    explanation: string;
    clarification_question?: string | null | undefined;
  }>;
  turn_count: number;
}

// --- FEATURE 7: ADVERSARIAL AMBIGUITY TESTING LAB ---

export type AdversarialCategory =
  | "lexical"
  | "referential"
  | "structural"
  | "contextual"
  | "semantic"
  | "underspecification"
  | "clear";

export type AdversarialChallengeTag =
  | "long_sentence"
  | "multi_ambiguity"
  | "missing_context"
  | "contradictory"
  | "multi_turn"
  | "clear_control"
  | "ps2_inventory"
  | "multilingual";

export interface AdversarialTestCase {
  id: string;
  title: string;
  instruction: string;
  domain: DomainContext;
  category: AdversarialCategory;
  tags: AdversarialChallengeTag[];
  hasValidGroundTruth: boolean;
  expectedClassification: "clear" | "ambiguous" | "incomplete" | "context_dependent" | null;
  expectedNeedsClarification: boolean | null;
  expectedAmbiguities: string[];
  expectedInterpretations: string[];
  followUpClarification?: string | undefined;
  isCustom?: boolean | undefined;
  notes?: string | undefined;
}

export type AdversarialRunProvenance =
  "live_backend_evaluated" | "ai_fallback_mixed" | "client_simulation_evaluated";

export interface AdversarialCaseExecutionResult {
  caseId: string;
  title: string;
  instruction: string;
  category: AdversarialCategory;
  tags: AdversarialChallengeTag[];
  executedAt: string;
  durationMs: number;
  provenance: AdversarialRunProvenance;
  predictedClassification: string;
  predictedNeedsClarification: boolean;
  detectedAmbiguities: string[];
  detectedInterpretations: string[];
  turnsTaken: number;
  finalStatus: string;
  abstained: boolean;
  verifiedCorrectness: VerifiedCorrectnessState;
  hasValidGroundTruth: boolean;
  verdict: "Pass" | "Failed" | "Exploratory (No Ground Truth)" | "Execution Error";
  correctDetections: string[];
  missedAmbiguities: string[];
  falsePositives: string[];
  resolutionFailure: string | null;
  failureExplanation: string | null;
  baselinePredictedNeeds: boolean;
  baselineMatch: boolean | null;
  executionError?: string | undefined;
}

export interface AdversarialMetricsSummary {
  executedCount: number;
  groundedCount: number;
  precision: number | null;
  recall: number | null;
  f1Score: number | null;
  resolutionAccuracy: number | null;
  falseClarificationRate: number | null;
  clarificationEfficiency: number | null;
  truePositives: number;
  trueNegatives: number;
  falsePositives: number;
  falseNegatives: number;
}

export interface AdversarialExecutionHistoryEntry {
  runId: string;
  timestamp: string;
  provenance: AdversarialRunProvenance;
  scopeLabel: string;
  executedCount: number;
  groundedCount: number;
  resolveXMetrics: AdversarialMetricsSummary;
  baselineMetrics: AdversarialMetricsSummary;
  results: AdversarialCaseExecutionResult[];
}

export interface BackendEvaluationPs6Response {
  source: "fresh_run" | "latest_record" | "no_record";
  message?: string | undefined;
  evaluation: {
    run_id: string;
    model: string;
    dataset_size: number;
    adversarial_only?: boolean | undefined;
    executed_at?: string | undefined;
    ai_configured?: boolean | undefined;
    fallback_cases_count?: number | undefined;
    provenance?: "live_backend_evaluated" | "ai_fallback_mixed" | undefined;
    precision: number;
    recall: number;
    f1_score: number;
    resolution_accuracy: number;
    false_clarification_rate: number;
    clarification_efficiency?: number | undefined;
    true_positives?: number | undefined;
    true_negatives?: number | undefined;
    false_positives?: number | undefined;
    false_negatives?: number | undefined;
    baseline_comparison?:
      | {
          name: string;
          precision: number;
          recall: number;
          f1_score: number;
          resolution_accuracy: number;
          false_clarification_rate: number;
          clarification_efficiency: number;
          true_positives: number;
          true_negatives: number;
          false_positives: number;
          false_negatives: number;
        }
      | undefined;
    results_detail?:
      | Array<{
          id: string;
          instruction: string;
          ambiguity_category?: string | undefined;
          is_adversarial?: boolean | undefined;
          tags?: string[] | undefined;
          expected_classification: string;
          predicted_classification: string;
          expected_needs_clarification: boolean;
          predicted_needs_clarification: boolean;
          expected_ambiguities?: string[] | undefined;
          detected_ambiguities?: string[] | undefined;
          correct_detections?: string[] | undefined;
          missed_ambiguities?: string[] | undefined;
          false_positives?: string[] | undefined;
          resolution_failed?: boolean | undefined;
          turns_taken?: number | undefined;
          final_status?: string | undefined;
          abstained?: boolean | undefined;
          provenance?: string | undefined;
          failure_explanation?: string | null | undefined;
        }>
      | undefined;
  } | null;
}

// ============================================================================
// REAL FASTAPI BACKEND CONTRACTS (PS6 + PS2 + Evaluation)
// ============================================================================

export type BackendConversationStatus = "ANALYZING" | "NEEDS_CLARIFICATION" | "RESOLVED" | "FAILED";

export type BackendClassification = "clear" | "ambiguous" | "incomplete" | "context_dependent";

export interface BackendInterpretationItem {
  label: string;
  description: string;
  confidence_score?: number | null;
  confidence_status?: "calibrated" | "abstained";
  supporting_signals?: string[];
  contradicting_signals?: string[];
  missing_requirements?: string[];
  risk_level?: "Low" | "Medium" | "High" | null;
}

export interface BackendResolvedIntentPayload {
  action: string;
  parameters: Record<string, unknown>;
  resolved_instruction: string;
  direct_answer?: string | null;
}

export interface BackendMaterialOverview {
  id: string;
  sku: string;
  name: string;
  unit: string;
  on_hand: number;
  incoming: number;
  allocated: number;
  net_availability: number;
  reorder_threshold: number;
  stock_status: "HEALTHY" | "LOW_STOCK" | "OUT_OF_STOCK";
  lead_time_days?: number | null;
  supplier_name?: string | null;
}

export interface BackendInventoryOverviewResponse {
  total_materials: number;
  low_stock_count: number;
  out_of_stock_count: number;
  materials: BackendMaterialOverview[];
}

export interface BackendMissingMaterialDetail {
  material_id: string;
  material_name: string;
  required_qty: number;
  allocated_qty: number;
  shortage_qty: number;
  expected_available_date?: string | null;
}

export interface BackendOrderRiskItem {
  order_id: string;
  customer_name: string;
  product_code: string;
  quantity: number;
  customer_request_date: string;
  status: string;
  risk_category: "ON_TRACK" | "AT_RISK" | "DELAYED" | "BLOCKED";
  projected_ship_date?: string | null;
  ship_date_status: "CALCULATED" | "ESTIMATED" | "UNAVAILABLE";
  missing_materials: BackendMissingMaterialDetail[];
  explanation: string;
  data_timestamp: string;
}

export interface BackendShortageItem {
  material_id: string;
  sku: string;
  material_name: string;
  unit: string;
  on_hand: number;
  incoming: number;
  allocated: number;
  net_availability: number;
  unmet_order_demand: number;
  reorder_threshold: number;
  recommended_purchase_qty: number;
  supplier_id?: string | null;
  supplier_name?: string | null;
  lead_time_days?: number | null;
  affected_orders: string[];
}

export interface BackendInventoryInsight {
  domain: string;
  intent_action: string;
  inventory_overview: BackendInventoryOverviewResponse;
  shortages: BackendShortageItem[];
  order_risks: BackendOrderRiskItem[];
  note: string;
}

export interface BackendAnalyzeResponse {
  conversation_id: string;
  status: BackendConversationStatus;
  classification?: BackendClassification | null;
  ambiguity_types: string[];
  needs_clarification: boolean;
  interpretations: BackendInterpretationItem[];
  missing_required_info: string[];
  clarification_questions: string[];
  resolved_intent?: BackendResolvedIntentPayload | null;
  inventory_insight?: BackendInventoryInsight | null;
  turn_count: number;
  analysis_source?: "gemini" | "local" | "offline_fallback" | "system" | null;
  confidence_assessment?: BackendConfidenceAssessmentDTO | null;
  confidence_history?: BackendConfidenceHistoryDTO[];
  context_memory?: BackendContextMemoryDTO | null;
  risk_assessment?: BackendRiskAssessmentDTO | null;
}

export interface BackendConversationSummary {
  id: string;
  original_instruction: string;
  initial_context?: string | null;
  status: BackendConversationStatus;
  classification?: BackendClassification | null;
  turn_count: number;
  created_at: string;
  updated_at: string;
}

export interface BackendConversationDetail {
  conversation: BackendConversationSummary;
  messages: Array<{
    role: string;
    content: string;
    turn_number: number;
    card_json?: string | null;
    created_at: string;
  }>;
  clarification_questions: Array<{
    question_text: string;
    answered: number;
    turn_number: number;
  }>;
  resolved_intent?: {
    action: string;
    parameters: Record<string, unknown>;
    resolved_instruction: string;
    direct_answer?: string | null;
  } | null;
  draft?: {
    draft: Record<string, unknown>;
    status: string;
    updated_at: string;
  } | null;
}

export interface BackendOrderRow {
  id: string;
  customer_name: string;
  product_code: string;
  quantity: number;
  customer_request_date: string;
  processing_days: number;
  status: string;
  risk_category?: string | null;
  projected_ship_date?: string | null;
  risk_explanation?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BackendAllocationRecord {
  order_id: string;
  material_id: string;
  required_qty: number;
  allocated_qty: number;
  priority_reason: string;
  updated_at: string;
}

export interface BackendPurchaseOrderProposal {
  id: string;
  material_id: string;
  material_name: string;
  suggested_quantity: number;
  supplier_id?: string | null;
  supplier_name?: string | null;
  reason: string;
  affected_orders: string[];
  expected_shortage_date?: string | null;
  estimated_impact: string;
  supporting_data: Record<string, unknown>;
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "CANCELLED";
  supplier_email_draft?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BackendAlertItem {
  id: number;
  alert_type: "STOCK_OUT" | "CRD_RISK" | "FEED_FAILURE" | "LOW_STOCK";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  entity_id: string;
  message: string;
  acknowledged: boolean;
  created_at: string;
}

export interface BackendBriefingResponse {
  role: string;
  sections: Array<{
    section: string;
    data: Record<string, unknown>;
  }>;
  data_source: string;
  ai_enriched: boolean;
  ai_summary?: string | null;
  ai_note?: string | null;
}

export interface BackendEventIngestionResponse {
  event_id: string;
  status: "PROCESSED" | "DUPLICATE" | "MALFORMED";
  message: string;
  simulated: boolean;
}

export interface BackendInventoryEvent {
  id: number;
  event_id: string;
  event_type: string;
  entity_ref: string;
  payload_json: string;
  status: string;
  error_message?: string | null;
  simulated: number;
  created_at: string;
}

export interface BackendPs2Evaluation {
  run_id: string;
  total_scenarios: number;
  passed: number;
  failed: number;
  accuracy: number;
  baseline_accuracy: number;
  improvement_over_baseline: number;
  shortages_detected: number;
  crd_risk_orders_evaluated: number;
  results_detail: Array<Record<string, unknown>>;
  note: string;
}

export interface BackendPs6Evaluation {
  run_id: string;
  model: string;
  dataset_size: number;
  precision: number;
  recall: number;
  f1_score: number;
  resolution_accuracy: number;
  false_clarification_rate: number;
  true_positives?: number;
  true_negatives?: number;
  false_positives?: number;
  false_negatives?: number;
  created_at?: string;
}

export type BackendApiRoleHeader =
  "ADMIN" | "INVENTORY_PLANNER" | "PROCUREMENT_MANAGER" | "OPERATIONS_MANAGER";
