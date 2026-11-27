export type AmbiguityCategory =
  | 'Lexical'
  | 'Syntactic'
  | 'Referential'
  | 'Scope'
  | 'Temporal'
  | 'Pragmatic'

export type RiskLevel = 'Low' | 'Moderate' | 'High' | 'Critical'

export type DomainContext =
  | 'General'
  | 'Software Engineering'
  | 'Product & Ops'
  | 'Data & Analytics'
  | 'Enterprise Support'

export type StrictnessLevel = 'Balanced' | 'Strict' | 'Exploratory'

export interface AmbiguitySpan {
  id: string
  token: string
  startIndex: number
  endIndex: number
  category: AmbiguityCategory
  severity: number // 0 - 100
  confidence: number // 0 - 1
  reason: string
  candidateMeanings: string[]
}

export interface CategoryScore {
  category: AmbiguityCategory
  score: number // 0 - 100
  count: number
}

export interface Interpretation {
  id: string
  title: string
  summary: string
  probability: number // 0 - 100
  impactScope: string
  riskLevel: RiskLevel
  assumptions: string[]
  recommendedAction: string
}

export type EssentialIntentField =
  | 'Action Scope'
  | 'Target Entity'
  | 'Execution Timing'
  | 'Safety & Guardrails'
  | 'Output Deliverable'

export interface ClarificationOption {
  id: string
  label: string
  description: string
  resolvesTo: string
}

export interface ClarificationQuestion {
  id: string
  targetSpanId: string
  targetToken: string
  category: AmbiguityCategory
  question: string
  rationale: string
  importanceScore: number
  essentialField: EssentialIntentField
  isEssential: boolean
  estimatedClarityGain: number
  necessityReason: string
  selectionExplanation: string
  dependentSpanIds?: string[]
  options: ClarificationOption[]
}

export interface ClarificationAnswer {
  questionId: string
  selectedOptionId: string | null
  customAnswer: string
  resolvedValue: string
  turnNumber?: number
  answeredAt?: string
  targetToken?: string
  questionText?: string
  essentialField?: EssentialIntentField
  selectionExplanation?: string
  clarityBefore?: number
  clarityAfter?: number
  ambiguityReduction?: number
  source?: 'option' | 'custom'
}

export interface RemainingAmbiguityItem {
  spanId: string
  token: string
  category: AmbiguityCategory
  essentialField: EssentialIntentField
  isEssential: boolean
  baseSeverity: number
  currentSeverity: number
  importanceScore: number
  status: 'Unresolved' | 'Reduced' | 'Resolved'
  questionId: string | null
  rank: number
  rankReason: string
}

export interface EssentialFieldStatus {
  field: EssentialIntentField
  required: boolean
  status: 'Clear' | 'Needs Clarification'
  resolvedByToken?: string
  resolvedValue?: string
}

export interface ClarificationOptimizerState {
  initialAmbiguityScore: number
  remainingAmbiguityScore: number
  initialClarityScore: number
  currentClarityScore: number
  progressPercentage: number
  essentialFields: EssentialFieldStatus[]
  rankedAmbiguities: RemainingAmbiguityItem[]
  unresolvedQuestionsQueue: ClarificationQuestion[]
  activeQuestion: ClarificationQuestion | null
  activeSelectionReason: string
  isSufficientlyClear: boolean
  stopReason: string | null
  skippedOptionalCount: number
  conversationHistory: ClarificationAnswer[]
}

export interface StructuredIntentSpec {
  intentType: string
  primarySubject: string
  targetScope: string
  constraints: string[]
  timeHorizon: string
  outputFormat: string
  confidenceAfterClarification: number
}

export type FieldVerificationStatus =
  | 'Passed'
  | 'Missing'
  | 'Ambiguous'
  | 'Contradictory'
  | 'Optional Pending'

export type VerificationIssueType = 'missing' | 'ambiguous' | 'contradictory'

export interface FieldVerificationCheck {
  field: EssentialIntentField
  required: boolean
  status: FieldVerificationStatus
  issueType?: VerificationIssueType
  explanation: string
  resolvedValue?: string
  targetQuestionId?: string | null
  targetToken?: string
}

export interface ResolutionVerificationReport {
  status: 'Verified' | 'Needs Clarification' | 'Blocked'
  allRequiredPassed: boolean
  completenessScore: number // 0 - 100
  completenessExplanation: string
  requiredTotal: number
  requiredPassed: number
  optionalTotal: number
  optionalPassed: number
  missingFields: EssentialIntentField[]
  ambiguousFields: EssentialIntentField[]
  contradictoryFields: EssentialIntentField[]
  contradictions: Array<{
    fields: [EssentialIntentField, EssentialIntentField]
    reason: string
    targetQuestionId: string | null
  }>
  fieldChecks: FieldVerificationCheck[]
  checkedAt: string
}

export interface FinalResolution {
  originalPrompt: string
  resolvedPrompt: string
  clarityGain: number
  remainingAmbiguityScore: number
  structuredSpec: StructuredIntentSpec
  appliedDecisions: Array<{
    token: string
    decision: string
    essentialField?: EssentialIntentField
    selectionExplanation?: string
    ambiguityReduction?: number
  }>
  optimizationSummary?: {
    turnsTaken: number
    totalQuestionsAvailable: number
    skippedOptionalCount: number
    stoppedEarly: boolean
    stopReason: string | null
    essentialFields: EssentialFieldStatus[]
  }
  verification?: ResolutionVerificationReport
  generatedAt: string
}

export interface AnalysisResult {
  id: string
  prompt: string
  domain: DomainContext
  strictness: StrictnessLevel
  createdAt: string
  isDemoData: boolean
  ambiguityScore: number // 0 - 100
  clarityScore: number // 0 - 100
  riskLevel: RiskLevel
  summary: string
  spans: AmbiguitySpan[]
  categoryBreakdown: CategoryScore[]
  interpretations: Interpretation[]
  clarificationQuestions: ClarificationQuestion[]
  defaultResolution: FinalResolution
}

export interface ExamplePrompt {
  id: string
  title: string
  tag: string
  domain: DomainContext
  prompt: string
  previewAmbiguity: number
}

export interface SessionHistoryItem {
  id: string
  prompt: string
  domain: DomainContext
  ambiguityScore: number
  resolved: boolean
  createdAt: string
}

export interface AppSettings {
  apiBaseUrl: string
  integrationMode: 'mock' | 'fastapi-ready'
  ambiguityThreshold: number
  maxClarificationQuestions: number
  defaultDomain: DomainContext
  defaultStrictness: StrictnessLevel
  reduceMotion: boolean
  showTokenConfidence: boolean
}

export interface EvaluationOverviewMetric {
  label: string
  value: string
  delta: string
  note: string
}

export interface EvaluationDataset {
  isDemoData: true
  benchmarkName: string
  sampleCount: number
  lastUpdated: string
  overview: EvaluationOverviewMetric[]
  categoryPerformance: Array<{
    category: AmbiguityCategory
    precision: number
    recall: number
    f1: number
  }>
  baselineComparison: Array<{
    turn: string
    rawPromptClarity: number
    singleTurnLLM: number
    resolveXPipeline: number
  }>
  latencyDistribution: Array<{
    stage: string
    latencyMs: number
  }>
  benchmarkCases: Array<{
    id: string
    promptSnippet: string
    category: AmbiguityCategory
    detectedSpans: number
    turnsToResolve: number
    finalClarity: number
    status: 'Resolved' | 'Needs Review'
  }>
}

export interface AnalyzePromptRequest {
  prompt: string
  domain: DomainContext
  strictness: StrictnessLevel
  maxQuestions?: number
}

export interface ResolveIntentRequest {
  analysisId: string
  prompt: string
  selectedInterpretationId: string | null
  answers: ClarificationAnswer[]
}

export type GraphNodeKind =
  | 'action'
  | 'person'
  | 'object'
  | 'date'
  | 'location'
  | 'ambiguous_reference'

export type GraphNodeState = 'ambiguous' | 'unresolved' | 'resolved'

export interface ContextGraphNode {
  id: string
  label: string
  kind: GraphNodeKind
  state: GraphNodeState
  x: number
  y: number
  meaning: string
  resolvedValue?: string
  uncertaintyScore: number // 0 - 100
  uncertaintyReason: string
  interpretations: string[]
  linkedSpanId?: string
  linkedQuestionId?: string
}

export interface ContextGraphEdge {
  id: string
  source: string
  target: string
  label: string
  state: GraphNodeState
}

export interface ContextIntelligenceGraphData {
  nodes: ContextGraphNode[]
  edges: ContextGraphEdge[]
  summary: {
    totalNodes: number
    ambiguousCount: number
    unresolvedCount: number
    resolvedCount: number
    averageUncertainty: number
    activeInterpretationTitle: string | null
  }
}

export interface BackendHealthStatus {
  reachable: boolean
  mode: 'mock' | 'fastapi-ready'
  baseUrl: string
  checkedAt: string
  message: string
}
