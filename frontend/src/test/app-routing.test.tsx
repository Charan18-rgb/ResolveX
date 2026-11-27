import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { DEMO_EVALUATION_DATA } from "@/data/mockData";
import { INITIAL_INVENTORY_MATERIALS } from "@/data/inventoryMockData";
import { routeTree } from "@/routeTree.gen";

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
});
