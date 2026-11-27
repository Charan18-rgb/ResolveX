import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { DEFAULT_APP_SETTINGS, DEMO_EVALUATION_DATA } from "@/data/mockData";
import { INITIAL_INVENTORY_MATERIALS } from "@/data/inventoryMockData";
import { routeTree } from "@/routeTree.gen";
import { adaptBackendAnalysisToUi, mapDemoRoleToBackendHeader } from "@/services/api";

const EXPECTED_ROUTES = [
  "/",
  "/workspace",
  "/inventory",
  "/analysis",
  "/visualization",
  "/interpretations",
  "/clarification",
  "/resolution",
  "/evaluation",
  "/how-it-works",
  "/settings",
];

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches every unified PS6 and PS2 route instead of falling back to not found", () => {
    const router = createRouter({
      routeTree,
      context: { queryClient: new QueryClient() },
    });

    for (const path of EXPECTED_ROUTES) {
      const matches = router.matchRoutes(path);
      expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
    }
  });

  it("exposes clearly labeled demo datasets for both PS6 and PS2", () => {
    expect(DEMO_EVALUATION_DATA.isDemoData).toBe(true);
    expect(INITIAL_INVENTORY_MATERIALS.length).toBeGreaterThan(0);
  });

  it("defaults to live FastAPI mode and maps backend PS6+PS2 responses accurately", () => {
    expect(DEFAULT_APP_SETTINGS.integrationMode).toBe("live");
    expect(mapDemoRoleToBackendHeader("Procurement Manager")).toBe("PROCUREMENT_MANAGER");
    expect(mapDemoRoleToBackendHeader("Inventory Planner")).toBe("INVENTORY_PLANNER");

    const adapted = adaptBackendAnalysisToUi(
      "Convert 100 kilometers to miles.",
      {
        conversation_id: "conv-123",
        status: "RESOLVED",
        classification: "clear",
        ambiguity_types: [],
        needs_clarification: false,
        interpretations: [],
        missing_required_info: [],
        clarification_questions: [],
        resolved_intent: {
          action: "unit_conversion",
          parameters: { quantity: "100", from_unit: "kilometers", to_unit: "miles" },
          resolved_instruction: "Convert 100 kilometers to miles.",
          direct_answer: "62.1371 miles",
        },
        inventory_insight: null,
        turn_count: 1,
      },
      "General",
      "Balanced",
    );
    expect(adapted.isDemoData).toBe(false);
    expect(adapted.id).toBe("conv-123");
    expect(adapted.defaultResolution.verification?.allRequiredPassed).toBe(true);
    expect(adapted.defaultResolution.structuredSpec.intentType).toBe("unit_conversion");
  });
});
