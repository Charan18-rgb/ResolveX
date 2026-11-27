import type {
  AmbiguitySpan,
  AnalysisResult,
  BackendContextMemoryDTO,
  ClarificationQuestion,
  MemoryEntityCategory,
  RememberedEntity,
  SessionContextMemory,
  SessionReferenceResolution,
} from "@/types/resolvex";

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const NAMED_PERSON_REGEX = /\b([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,})\b/g;
const PREP_PERSON_REGEX =
  /\b(?:to|from|with|for|ask|tell|email|notify|cc)\s+([A-Z][a-z]{2,})(?!\s+[A-Z][a-z]{2,})\b/g;
const FILE_OR_ID_REGEX =
  /\b(?:MAT-[A-Z0-9-]+|ORD-[0-9]+|[A-Za-z0-9_.-]+\.(?:pdf|xlsx|csv|json|yaml|yml|md|txt|docx|py|ts))\b/gi;
const ARTIFACT_OBJECT_REGEX =
  /\b((?:Q[1-4]\s+)?(?:[A-Z][a-z0-9-]+\s+){0,2}(?:[Rr]eport|[Dd]ocument|[Ff]ile|[Ss]preadsheet|[Ss]heet|[Pp]roposal|[Dd]eployment|[Cc]luster|[Ss]ervice|[Oo]rder|[Aa]llocation))\b/g;
const DATE_REGEX =
  /\b(?:\d{4}-\d{2}-\d{2}|today|tomorrow|yesterday|next week|next month|next friday|monday|tuesday|wednesday|thursday|friday|\d{1,2}:\d{2}\s*(?:AM|PM|UTC)?|Q[1-4](?:\s+20\d{2})?)\b/gi;
const ACTION_REGEX =
  /\b(send|forward|email|deploy|migrate|restrict|allocate|reallocate|reorder|draft|approve|export|update|schedule|rollback|review)\b/gi;

const NON_PERSON_PAIRS = new Set([
  "q3 report",
  "q4 report",
  "q3 finance",
  "finance report",
  "status review",
  "resolve x",
  "legacy auth",
  "initial context",
  "emergency override",
  "purchase order",
  "enterprise support",
  "data analytics",
]);

const GENERIC_OBJECT_WORDS = new Set([
  "report",
  "document",
  "file",
  "sheet",
  "spreadsheet",
  "proposal",
  "order",
  "allocation",
  "service",
  "cluster",
  "deployment",
  "the report",
  "that report",
  "the file",
  "that file",
  "this file",
  "the sheet",
  "that sheet",
  "the document",
  "that document",
  "the second file",
]);

export function createEmptySessionMemory(
  sessionId: string,
  title = "New Conversation Session",
): SessionContextMemory {
  return {
    sessionId,
    title,
    messages: [],
    entities: [],
    resolvedReferences: [],
    referenceConflicts: [],
  };
}

export function extractEntitiesFromMessage(
  sessionId: string,
  text: string,
  turnNumber: number,
  sourceRole: RememberedEntity["sourceRole"],
): RememberedEntity[] {
  const cleaned = text.trim();
  if (!cleaned) return [];

  const extracted: RememberedEntity[] = [];
  const seen = new Set<string>();

  const push = (category: MemoryEntityCategory, label: string, rawVal: string) => {
    const val = rawVal.replace(/\s+/g, " ").trim();
    if (!val) return;
    const key = `${category}::${val.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    extracted.push({
      id: `${sessionId}-t${turnNumber}-${category}-${extracted.length + 1}-${val.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
      sessionId,
      category,
      label,
      value: val,
      sourceTurn: turnNumber,
      sourceRole,
      sourceMessage: cleaned,
    });
  };

  for (const m of cleaned.match(EMAIL_REGEX) ?? []) {
    push("person", "Email Recipient", m);
  }
  for (const m of cleaned.match(NAMED_PERSON_REGEX) ?? []) {
    if (!NON_PERSON_PAIRS.has(m.toLowerCase())) {
      push("person", "Person", m);
    }
  }
  for (const match of cleaned.matchAll(PREP_PERSON_REGEX)) {
    const candidate = match[1];
    if (
      candidate &&
      !["today", "tomorrow", "friday", "monday", "report", "staging", "production"].includes(
        candidate.toLowerCase(),
      )
    ) {
      push("person", "Person Reference", candidate);
    }
  }

  for (const m of cleaned.match(FILE_OR_ID_REGEX) ?? []) {
    push("object", "File / Identifier", m);
  }
  for (const m of cleaned.match(ARTIFACT_OBJECT_REGEX) ?? []) {
    const normalized = m.replace(/\s+/g, " ").trim();
    if (normalized.length >= 4 && !GENERIC_OBJECT_WORDS.has(normalized.toLowerCase())) {
      push("object", "Artifact / Object", normalized);
    }
  }

  for (const m of cleaned.match(DATE_REGEX) ?? []) {
    push("date", "Date / Window", m);
  }
  for (const m of cleaned.match(ACTION_REGEX) ?? []) {
    push("action", "Action", m.toLowerCase());
  }

  return extracted;
}

export function resolveReferencesWithSessionMemory(
  latestInstruction: string,
  priorEntities: RememberedEntity[],
): {
  resolvedReferences: SessionReferenceResolution[];
  referenceConflicts: SessionReferenceResolution[];
} {
  const text = latestInstruction.trim();
  const lower = text.toLowerCase();
  if (!lower) return { resolvedReferences: [], referenceConflicts: [] };

  const dedupByCategory = (category: MemoryEntityCategory): RememberedEntity[] => {
    const byVal = new Map<string, RememberedEntity>();
    for (const ent of priorEntities) {
      if (ent.category === category) {
        byVal.set(ent.value.toLowerCase(), ent);
      }
    }
    return [...byVal.values()];
  };

  const people = dedupByCategory("person");
  const objects = dedupByCategory("object");
  const dates = dedupByCategory("date");

  const resolvedReferences: SessionReferenceResolution[] = [];
  const referenceConflicts: SessionReferenceResolution[] = [];

  // 1. Personal pronouns ('him', 'her')
  const pronounMatch = lower.match(/\b(him|her)\b/);
  if (pronounMatch?.[1]) {
    const token = pronounMatch[1];
    if (people.length === 1 && people[0]) {
      const m = people[0];
      resolvedReferences.push({
        referenceToken: token,
        category: "person",
        status: "resolved",
        resolvedValue: m.value,
        candidates: [m.value],
        sourceTurn: m.sourceTurn,
        sourceMessage: m.sourceMessage,
        explanation: `Resolved “${token}” to “${m.value}” remembered from Turn ${m.sourceTurn}.`,
      });
    } else if (people.length > 1) {
      const names = people.map((p) => p.value);
      referenceConflicts.push({
        referenceToken: token,
        category: "person",
        status: "conflicting",
        resolvedValue: null,
        candidates: names,
        explanation: `Session memory contains multiple people (${names.join(", ")}); “${token}” conflicts without clarification.`,
        clarificationQuestion: `Session memory tracks ${names.join(" and ")}. Who does “${token}” refer to?`,
      });
    } else {
      referenceConflicts.push({
        referenceToken: token,
        category: "person",
        status: "unclear",
        resolvedValue: null,
        candidates: [],
        explanation: `No person is remembered in this session to resolve “${token}”.`,
        clarificationQuestion: `Who does “${token}” refer to in this session?`,
      });
    }
  }

  // 2. Ordinal references ('the first one', 'the second one', 'the latter', 'the former')
  const ordMatch = lower.match(
    /\b(the\s+first\s+one|the\s+second\s+one|the\s+1st\s+one|the\s+2nd\s+one|the\s+latter|the\s+former)\b/,
  );
  if (ordMatch?.[1]) {
    const token = ordMatch[1];
    const index =
      token.includes("second") || token.includes("2nd") || token.includes("latter") ? 1 : 0;
    const pool =
      objects.length >= 2
        ? objects
        : people.length >= 2
          ? people
          : objects.length > 0
            ? objects
            : people;

    if (pool.length >= 2 && pool[index]) {
      const chosen = pool[index]!;
      resolvedReferences.push({
        referenceToken: token,
        category: "ordinal",
        status: "resolved",
        resolvedValue: chosen.value,
        candidates: pool.map((p) => p.value),
        sourceTurn: chosen.sourceTurn,
        sourceMessage: chosen.sourceMessage,
        explanation: `Resolved ordinal “${token}” to #${index + 1} (“${chosen.value}”) from Turn ${chosen.sourceTurn}.`,
      });
    } else {
      referenceConflicts.push({
        referenceToken: token,
        category: "ordinal",
        status: "unclear",
        resolvedValue: null,
        candidates: pool.map((p) => p.value),
        explanation: `Cannot resolve “${token}” because current session memory holds ${pool.length} candidate(s).`,
        clarificationQuestion: `Which specific item do you mean by “${token}”?`,
      });
    }
  }

  // 3. Object references ('that file', 'that report', 'that document', 'the sheet', 'this file')
  const objMatch = lower.match(
    /\b(that\s+file|that\s+report|that\s+document|that\s+sheet|this\s+file|the\s+second\s+file)\b/,
  );
  if (objMatch?.[1]) {
    const token = objMatch[1];
    if (objects.length === 1 && objects[0]) {
      const m = objects[0];
      resolvedReferences.push({
        referenceToken: token,
        category: "object",
        status: "resolved",
        resolvedValue: m.value,
        candidates: [m.value],
        sourceTurn: m.sourceTurn,
        sourceMessage: m.sourceMessage,
        explanation: `Resolved “${token}” to “${m.value}” from Turn ${m.sourceTurn}.`,
      });
    } else if (objects.length > 1) {
      const vals = objects.map((o) => o.value);
      referenceConflicts.push({
        referenceToken: token,
        category: "object",
        status: "conflicting",
        resolvedValue: null,
        candidates: vals,
        explanation: `Session memory contains multiple objects (${vals.join(", ")}); “${token}” is ambiguous.`,
        clarificationQuestion: `Multiple files/objects exist in memory (${vals.join(", ")}). Which one is “${token}”?`,
      });
    } else {
      referenceConflicts.push({
        referenceToken: token,
        category: "object",
        status: "unclear",
        resolvedValue: null,
        candidates: [],
        explanation: `No file or artifact is remembered in this session to resolve “${token}”.`,
        clarificationQuestion: `Which file or artifact do you mean by “${token}”?`,
      });
    }
  }

  // 4. Date references ('that date', 'that window', 'same time')
  const dateMatch = lower.match(/\b(that\s+date|that\s+window|same\s+time)\b/);
  if (dateMatch?.[1]) {
    const token = dateMatch[1];
    if (dates.length === 1 && dates[0]) {
      const m = dates[0];
      resolvedReferences.push({
        referenceToken: token,
        category: "date",
        status: "resolved",
        resolvedValue: m.value,
        candidates: [m.value],
        sourceTurn: m.sourceTurn,
        sourceMessage: m.sourceMessage,
        explanation: `Resolved “${token}” to “${m.value}” from Turn ${m.sourceTurn}.`,
      });
    } else if (dates.length > 1) {
      const vals = dates.map((d) => d.value);
      referenceConflicts.push({
        referenceToken: token,
        category: "date",
        status: "conflicting",
        resolvedValue: null,
        candidates: vals,
        explanation: `Multiple dates remembered in session (${vals.join(", ")}).`,
        clarificationQuestion: `Which date/window does “${token}” refer to: ${vals.join(" or ")}?`,
      });
    }
  }

  return { resolvedReferences, referenceConflicts };
}

function mergeEntitiesPreservingEdits(
  existing: RememberedEntity[],
  incoming: RememberedEntity[],
): RememberedEntity[] {
  const merged = [...existing];
  const existingKeys = new Set(merged.map((e) => `${e.category}::${e.value.toLowerCase()}`));
  for (const item of incoming) {
    const k = `${item.category}::${item.value.toLowerCase()}`;
    if (!existingKeys.has(k)) {
      existingKeys.add(k);
      merged.push(item);
    }
  }
  return merged;
}

export function appendMessageToSessionMemory(
  memory: SessionContextMemory,
  messageText: string,
  role: "user" | "clarification",
): SessionContextMemory {
  const cleaned = messageText.trim();
  if (!cleaned) return memory;

  const nextTurn = memory.messages.length + 1;
  // Resolve references inside the new message ONLY against PRIOR entities in this session
  const priorEntities = memory.entities;
  const { resolvedReferences, referenceConflicts } = resolveReferencesWithSessionMemory(
    cleaned,
    priorEntities,
  );

  const newlyExtracted = extractEntitiesFromMessage(
    memory.sessionId,
    cleaned,
    nextTurn,
    role === "clarification" ? "clarification" : "user",
  );
  const nextEntities = mergeEntitiesPreservingEdits(memory.entities, newlyExtracted);

  return {
    ...memory,
    title: memory.messages.length === 0 ? cleaned.slice(0, 48) : memory.title,
    messages: [
      ...memory.messages,
      {
        id: `${memory.sessionId}-msg-${nextTurn}`,
        turnNumber: nextTurn,
        role,
        content: cleaned,
        timestamp: new Date().toISOString(),
      },
    ],
    entities: nextEntities,
    resolvedReferences,
    referenceConflicts,
  };
}

export function recomputeMemoryReferencesForPrompt(
  memory: SessionContextMemory,
  latestPrompt: string,
): SessionContextMemory {
  // Include all entities except entities extracted solely from an identical single latest message when multiple turns exist
  const { resolvedReferences, referenceConflicts } = resolveReferencesWithSessionMemory(
    latestPrompt,
    memory.entities,
  );
  return {
    ...memory,
    resolvedReferences,
    referenceConflicts,
  };
}

export function serializeSessionMemoryForContext(memory: SessionContextMemory): string {
  const entityText = memory.entities
    .map((e) => `[${e.category}: ${e.value} (Turn ${e.sourceTurn})]`)
    .join("; ");
  const resolvedText = memory.resolvedReferences
    .map((r) => `${r.referenceToken} -> ${r.resolvedValue ?? "unresolved"}`)
    .join("; ");
  const parts: string[] = [];
  if (entityText) parts.push(`Remembered Entities: ${entityText}`);
  if (resolvedText) parts.push(`Resolved References: ${resolvedText}`);
  return parts.join(" | ");
}

export function mapBackendContextMemory(
  dto: BackendContextMemoryDTO | null | undefined,
  existingTitle = "Live Backend Session",
): SessionContextMemory | undefined {
  if (!dto) return undefined;
  return {
    sessionId: dto.session_id,
    title: existingTitle,
    messages: [],
    entities: dto.entities.map((e) => ({
      id: e.id,
      sessionId: e.session_id,
      category: e.category,
      label: e.label,
      value: e.value,
      sourceTurn: e.source_turn,
      sourceRole:
        e.source_role === "clarification" ||
        e.source_role === "context" ||
        e.source_role === "edited"
          ? e.source_role
          : "user",
      sourceMessage: e.source_message,
    })),
    resolvedReferences: dto.resolved_references.map((r) => ({
      referenceToken: r.reference_token,
      category: r.category,
      status: r.status,
      resolvedValue: r.resolved_value,
      candidates: r.candidates,
      sourceTurn: r.source_turn ?? undefined,
      sourceMessage: r.source_message ?? undefined,
      explanation: r.explanation,
      clarificationQuestion: r.clarification_question ?? undefined,
    })),
    referenceConflicts: dto.reference_conflicts.map((c) => ({
      referenceToken: c.reference_token,
      category: c.category,
      status: c.status,
      resolvedValue: c.resolved_value,
      candidates: c.candidates,
      sourceTurn: c.source_turn ?? undefined,
      sourceMessage: c.source_message ?? undefined,
      explanation: c.explanation,
      clarificationQuestion: c.clarification_question ?? undefined,
    })),
  };
}

export function applySessionMemoryToAnalysis(
  analysis: AnalysisResult,
  memory: SessionContextMemory,
): AnalysisResult {
  if (
    memory.resolvedReferences.length === 0 &&
    memory.referenceConflicts.length === 0 &&
    memory.entities.length === 0
  ) {
    return analysis;
  }

  // Enrich spans when pronouns/references were resolved from session memory
  const enrichedSpans: AmbiguitySpan[] = analysis.spans.map((span) => {
    const resolved = memory.resolvedReferences.find(
      (r) =>
        r.referenceToken.toLowerCase() === span.token.toLowerCase() ||
        span.token.toLowerCase().includes(r.referenceToken.toLowerCase()),
    );
    if (resolved?.resolvedValue) {
      return {
        ...span,
        severity: Math.max(22, span.severity - 45),
        reason: `${resolved.explanation} (Source Turn ${resolved.sourceTurn ?? 1}: “${resolved.sourceMessage ?? ""}”)`,
        candidateMeanings: [
          `${resolved.resolvedValue} (From Session Memory)`,
          ...span.candidateMeanings.filter((m) => m !== resolved.resolvedValue),
        ],
      };
    }

    const conflict = memory.referenceConflicts.find(
      (c) => c.referenceToken.toLowerCase() === span.token.toLowerCase(),
    );
    if (conflict) {
      return {
        ...span,
        severity: Math.max(span.severity, 90),
        reason: conflict.explanation,
        candidateMeanings:
          conflict.candidates.length > 0 ? conflict.candidates : span.candidateMeanings,
      };
    }
    return span;
  });

  // Inject conflict clarification questions if missing from existing clarificationQuestions
  const updatedQuestions: ClarificationQuestion[] = [...analysis.clarificationQuestions];
  memory.referenceConflicts.forEach((conflict, idx) => {
    const qText =
      conflict.clarificationQuestion ??
      `Clarify ambiguous reference “${conflict.referenceToken}”: ${conflict.explanation}`;
    const alreadyExists = updatedQuestions.some(
      (q) =>
        q.targetToken.toLowerCase() === conflict.referenceToken.toLowerCase() ||
        q.question.toLowerCase() === qText.toLowerCase(),
    );
    if (!alreadyExists) {
      updatedQuestions.unshift({
        id: `cq-mem-${conflict.referenceToken.replace(/\s+/g, "-")}-${idx + 1}`,
        targetSpanId:
          enrichedSpans.find((s) => s.token.toLowerCase() === conflict.referenceToken.toLowerCase())
            ?.id ?? `span-mem-${idx + 1}`,
        targetToken: conflict.referenceToken,
        category: "Referential",
        question: qText,
        rationale: conflict.explanation,
        importanceScore: 98,
        essentialField: "Target Entity",
        isEssential: true,
        estimatedClarityGain: 32,
        necessityReason:
          "Conflicting or missing reference in session context memory prevents safe resolution.",
        selectionExplanation:
          "Prioritized #1 because session memory detected a conflicting/unresolved coreference.",
        options:
          conflict.candidates.length > 0
            ? conflict.candidates.map((cand, optIdx) => ({
                id: `opt-mem-${idx}-${optIdx}`,
                label: cand,
                description: `Bind “${conflict.referenceToken}” to remembered ${cand}.`,
                resolvesTo: cand,
              }))
            : [],
      });
    }
  });

  // Update What-If Interpretations with resolved/conflicting entities from memory
  const resolvedRecipient = memory.resolvedReferences.find(
    (r) => r.category === "person" && r.resolvedValue,
  )?.resolvedValue;
  const resolvedObject = memory.resolvedReferences.find(
    (r) => (r.category === "object" || r.category === "ordinal") && r.resolvedValue,
  )?.resolvedValue;
  const resolvedDate = memory.resolvedReferences.find(
    (r) => r.category === "date" && r.resolvedValue,
  )?.resolvedValue;

  const updatedInterpretations = analysis.interpretations.map((interp, idx) => {
    const conflictCandidates =
      memory.referenceConflicts.find((c) => c.candidates.length >= 2)?.candidates ?? [];
    const candidateOverride = conflictCandidates[idx];
    return {
      ...interp,
      simulatedIntent: {
        ...interp.simulatedIntent,
        recipient: candidateOverride ?? resolvedRecipient ?? interp.simulatedIntent.recipient,
        object: resolvedObject ?? interp.simulatedIntent.object,
        date: resolvedDate ?? interp.simulatedIntent.date,
      },
      assumptions: [
        ...interp.assumptions,
        ...memory.resolvedReferences.map(
          (r) => `Memory: “${r.referenceToken}” → ${r.resolvedValue} (Turn ${r.sourceTurn ?? 1})`,
        ),
      ].slice(0, 4),
    };
  });

  return {
    ...analysis,
    spans: enrichedSpans,
    clarificationQuestions: updatedQuestions,
    interpretations: updatedInterpretations,
    contextMemory: memory,
  };
}
