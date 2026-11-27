export interface PendingClarify {
  conversationId: string;
}

export interface ConvUIState {
  pendingClarify: PendingClarify | null;
  draft: Record<string, any> | null;
}

export const NEW_CONV_KEY = "__new__";

const EMPTY_STATE: ConvUIState = { pendingClarify: null, draft: null };

/**
 * Per-conversation UI state (pending clarification + active draft card).
 * Keyed by backend conversation id; NEW_CONV_KEY covers chats that have not
 * yet produced a conversation record. State never leaks across keys.
 */
export function createConvStateStore() {
  const states = new Map<string, ConvUIState>();
  return {
    get(key: string): ConvUIState {
      return states.get(key) ?? EMPTY_STATE;
    },
    set(key: string, patch: Partial<ConvUIState>) {
      states.set(key, { ...this.get(key), ...patch });
    },
    clear(key: string) {
      states.delete(key);
    },
    has(key: string) {
      return states.has(key);
    },
  };
}

export type ConvStateStore = ReturnType<typeof createConvStateStore>;
