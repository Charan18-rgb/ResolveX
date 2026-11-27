import { describe, expect, it } from "vitest";
import { computeClientConfidenceAssessment } from "@/data/confidenceEngine";
import {
  appendMessageToSessionMemory,
  applySessionMemoryToAnalysis,
  createEmptySessionMemory,
  extractEntitiesFromMessage,
  recomputeMemoryReferencesForPrompt,
} from "@/data/contextMemoryEngine";
import {
  analyzeCustomPromptMock,
  buildContextIntelligenceGraph,
  computeClarificationOptimizerState,
  computeResolutionFromInputs,
  computeResolutionVerification,
} from "@/data/mockData";

describe("Feature 8: Context Memory & Conversation Intelligence", () => {
  it("extracts people, objects, dates, and actions with exact source-message attribution", () => {
    const msg = "Review Q3_Finance_Report.pdf and Budget_2026.xlsx with Rahul Sharma tomorrow.";
    const entities = extractEntitiesFromMessage("sess-1", msg, 1, "user");

    expect(entities.some((e) => e.category === "person" && e.value === "Rahul Sharma")).toBe(true);
    expect(
      entities.some((e) => e.category === "object" && e.value === "Q3_Finance_Report.pdf"),
    ).toBe(true);
    expect(entities.some((e) => e.category === "object" && e.value === "Budget_2026.xlsx")).toBe(
      true,
    );
    expect(
      entities.some((e) => e.category === "date" && e.value.toLowerCase() === "tomorrow"),
    ).toBe(true);
    expect(
      entities.some((e) => e.category === "action" && e.value.toLowerCase() === "review"),
    ).toBe(true);

    for (const ent of entities) {
      expect(ent.sessionId).toBe("sess-1");
      expect(ent.sourceTurn).toBe(1);
      expect(ent.sourceMessage).toBe(msg);
    }
  });

  it("resolves pronouns ('him') and ordinals ('the second one') across turns", () => {
    const turn1Msg =
      "Review Q3_Finance_Report.pdf and Budget_2026.xlsx with Rahul Sharma tomorrow.";
    const turn2Msg = "Email him the second one next week.";

    let mem = createEmptySessionMemory("sess-multi");
    mem = appendMessageToSessionMemory(mem, turn1Msg, "user");
    mem = appendMessageToSessionMemory(mem, turn2Msg, "user");

    expect(mem.messages).toHaveLength(2);
    expect(mem.referenceConflicts).toHaveLength(0);

    const himRef = mem.resolvedReferences.find((r) => r.referenceToken === "him");
    expect(himRef).toBeDefined();
    expect(himRef?.resolvedValue).toBe("Rahul Sharma");
    expect(himRef?.sourceTurn).toBe(1);
    expect(himRef?.sourceMessage).toBe(turn1Msg);

    const ordinalRef = mem.resolvedReferences.find((r) => r.referenceToken === "the second one");
    expect(ordinalRef).toBeDefined();
    expect(ordinalRef?.resolvedValue).toBe("Budget_2026.xlsx");
    expect(ordinalRef?.sourceTurn).toBe(1);
  });

  it("detects conflicting references, requests clarification, and updates confidence", () => {
    let mem = createEmptySessionMemory("sess-conflict");
    mem = appendMessageToSessionMemory(
      mem,
      "Share Q3_Finance_Report.pdf with Rahul Sharma and Priya Nair today.",
      "user",
    );
    mem = appendMessageToSessionMemory(mem, "Send that file to him next week.", "user");

    expect(mem.referenceConflicts.length).toBeGreaterThanOrEqual(1);
    const himConflict = mem.referenceConflicts.find((c) => c.referenceToken === "him");
    expect(himConflict?.status).toBe("conflicting");
    expect(himConflict?.candidates).toContain("Rahul Sharma");
    expect(himConflict?.candidates).toContain("Priya Nair");

    const baseAnalysis = analyzeCustomPromptMock(
      "Send that file to him next week.",
      "General",
      "Balanced",
    );
    const syncedAnalysis = applySessionMemoryToAnalysis(baseAnalysis, mem);

    expect(
      syncedAnalysis.clarificationQuestions.some((q) =>
        q.question.toLowerCase().includes("rahul sharma"),
      ),
    ).toBe(true);
    expect(syncedAnalysis.interpretations[0]?.simulatedIntent.object).toBe("Q3_Finance_Report.pdf");

    const optimizer = computeClarificationOptimizerState(syncedAnalysis, [], 60, false, null);
    const verification = computeResolutionVerification(syncedAnalysis, [], null);
    const confidence = computeClientConfidenceAssessment({
      analysis: syncedAnalysis,
      clarificationAnswers: [],
      selectedInterpretation: syncedAnalysis.interpretations[0] ?? null,
      verificationReport: verification,
      optimizerState: optimizer,
    });

    expect(
      confidence.contradictingEvidence.some(
        (ev) =>
          ev.source === "session_memory" && ev.label.includes("Session reference conflicting"),
      ),
    ).toBe(true);
  });

  it("prevents memory leakage between isolated sessions and syncs graph/resolution edits", () => {
    let sessA = createEmptySessionMemory("sess-A");
    sessA = appendMessageToSessionMemory(
      sessA,
      "Review Q3_Finance_Report.pdf with Rahul Sharma tomorrow.",
      "user",
    );

    let sessB = createEmptySessionMemory("sess-B");
    sessB = appendMessageToSessionMemory(sessB, "Email him the file.", "user");

    // Session B must NOT know Rahul Sharma or Q3_Finance_Report.pdf from Session A
    expect(sessB.entities.some((e) => e.value === "Rahul Sharma")).toBe(false);
    expect(sessB.resolvedReferences).toHaveLength(0);
    expect(sessB.referenceConflicts.some((c) => c.referenceToken === "him")).toBe(true);

    // Editing remembered person in Session A updates recomputed resolution & Context Graph & Final Resolution
    const turn2 = appendMessageToSessionMemory(sessA, "Send that report to him.", "user");
    const editedMem = recomputeMemoryReferencesForPrompt(
      {
        ...turn2,
        entities: turn2.entities.map((e) =>
          e.category === "person" ? { ...e, value: "Ananya Rao" } : e,
        ),
      },
      "Send that report to him.",
    );

    const analysis = applySessionMemoryToAnalysis(
      analyzeCustomPromptMock("Send that report to him.", "General", "Balanced"),
      editedMem,
    );
    const optimizer = computeClarificationOptimizerState(analysis, [], 60, false, null);
    const graph = buildContextIntelligenceGraph(analysis, [], null, optimizer);
    expect(
      graph.nodes.some(
        (n) =>
          (n.label.includes("Ananya Rao") || n.resolvedValue === "Ananya Rao") &&
          n.state === "resolved",
      ),
    ).toBe(true);

    const resolved = computeResolutionFromInputs(
      analysis.prompt,
      analysis.spans,
      null,
      [],
      "General",
      analysis.clarificationQuestions,
      editedMem,
    );
    expect(resolved.structuredSpec.primarySubject).toContain("Ananya Rao");
    expect(resolved.structuredSpec.targetScope).toContain("Q3_Finance_Report.pdf");
  });
});
