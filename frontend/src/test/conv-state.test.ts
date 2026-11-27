import { describe, expect, it } from "vitest";
import { createConvStateStore, NEW_CONV_KEY } from "@/lib/convState";

describe("conversation UI state isolation", () => {
  it("keeps pending clarifications separate per conversation", () => {
    const s = createConvStateStore();
    s.set("conv-a", { pendingClarify: { conversationId: "conv-a" } });
    s.set("conv-b", { pendingClarify: { conversationId: "conv-b" } });
    expect(s.get("conv-a").pendingClarify?.conversationId).toBe("conv-a");
    expect(s.get("conv-b").pendingClarify?.conversationId).toBe("conv-b");
    s.set("conv-a", { pendingClarify: null });
    expect(s.get("conv-b").pendingClarify?.conversationId).toBe("conv-b");
  });

  it("keeps drafts separate per conversation", () => {
    const s = createConvStateStore();
    s.set("conv-a", { draft: { recipient: "alice@example.com", subject: "A" } });
    s.set("conv-b", { draft: { recipient: "bob@example.com", subject: "B" } });
    expect(s.get("conv-a").draft?.["recipient"]).toBe("alice@example.com");
    expect(s.get("conv-b").draft?.["recipient"]).toBe("bob@example.com");
  });

  it("returns clean state for unknown keys and the new-chat key", () => {
    const s = createConvStateStore();
    s.set("conv-a", { pendingClarify: { conversationId: "conv-a" }, draft: { x: 1 } });
    expect(s.get("conv-b")).toEqual({ pendingClarify: null, draft: null });
    expect(s.get(NEW_CONV_KEY)).toEqual({ pendingClarify: null, draft: null });
  });

  it("new conversation starts clean after clearing the new-chat key", () => {
    const s = createConvStateStore();
    s.set(NEW_CONV_KEY, { draft: { recipient: "x@y.z" }, pendingClarify: { conversationId: "old" } });
    s.clear(NEW_CONV_KEY);
    expect(s.get(NEW_CONV_KEY)).toEqual({ pendingClarify: null, draft: null });
  });

  it("deleting a conversation removes only its state", () => {
    const s = createConvStateStore();
    s.set("conv-a", { pendingClarify: { conversationId: "conv-a" } });
    s.set("conv-b", { draft: { recipient: "keep@example.com" } });
    s.clear("conv-a");
    expect(s.get("conv-a")).toEqual({ pendingClarify: null, draft: null });
    expect(s.get("conv-b").draft?.["recipient"]).toBe("keep@example.com");
  });

  it("state does not leak when switching keys", () => {
    const s = createConvStateStore();
    s.set("conv-a", { pendingClarify: { conversationId: "conv-a" } });
    // Simulate switching to conv-b: reads for conv-b must be empty.
    const bState = s.get("conv-b");
    expect(bState.pendingClarify).toBeNull();
    expect(bState.draft).toBeNull();
    // And conv-a's state survives the round trip.
    expect(s.get("conv-a").pendingClarify?.conversationId).toBe("conv-a");
  });
});
