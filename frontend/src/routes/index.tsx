import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot, Package, Warehouse, Truck, Users, Settings as SettingsIcon,
  Plus, Send, Loader2, AlertCircle, ChevronRight, MessageSquare, PlugZap,
  Trash2, Pencil,
} from "lucide-react";
import { useResolveX } from "@/context/useResolveX";
import { resolveXService, mapDemoRoleToBackendHeader } from "@/services/api";
import { opsApi, type OpsCard } from "@/services/opsApi";
import { OpsCardView } from "@/components/chat/OpsCardView";
import { createConvStateStore, NEW_CONV_KEY, type ConvStateStore } from "@/lib/convState";
import { RenameConversationDialog, DeleteConversationDialog } from "@/components/chat/ConversationDialogs";

export const Route = createFileRoute("/")({ component: HomePage });

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  text: string;
  card?: OpsCard | null;
  analysis?: { status: string; summary: string } | null;
  pending?: boolean;
}

const SUGGESTIONS = [
  "How much stock do I have?",
  "Which products are running low?",
  "Show me where my products are stored.",
  "How much warehouse space is remaining?",
  "Which suppliers have the best delivery history?",
  "Which orders might be delayed?",
  "What deliveries are expected today?",
];

const WELCOME =
  "Hello! I'm ResolveX. I can help you understand your business operations, manage inventory, locate products, monitor deliveries and identify potential problems.\n\nWhat would you like to do today?";

let msgSeq = 0;
const nextId = () => `m${++msgSeq}-${Date.now()}`;

interface HistoryItem { id: string; title: string }

function HistoryItems(props: {
  history: HistoryItem[];
  historyLoading: boolean;
  historyError: string | null;
  activeId: string | null;
  openingId: string | null;
  onOpen: (h: HistoryItem) => void;
  onRename: (h: HistoryItem) => void;
  onDelete: (h: HistoryItem) => void;
}) {
  const { history, historyLoading, historyError, activeId, openingId, onOpen, onRename, onDelete } = props;
  if (historyLoading) {
    return (
      <div className="flex items-center gap-2 px-2 py-2 text-xs text-slate-500">
        <Loader2 size={12} className="animate-spin" /> Loading…
      </div>
    );
  }
  if (historyError) return <div className="px-2 py-2 text-xs text-rose-400">{historyError}</div>;
  if (history.length === 0) return <p className="px-2 text-xs text-slate-500">No past conversations yet.</p>;
  return (
    <>
      {history.slice(0, 30).map((h) => (
        <div
          key={h.id}
          className={`group mb-1 flex items-center gap-1 rounded-md px-1 py-1 ${
            activeId === h.id ? "bg-slate-800" : "hover:bg-slate-800"
          }`}
        >
          <button
            onClick={() => onOpen(h)}
            disabled={openingId === h.id}
            className="flex min-w-0 flex-1 items-center gap-2 px-1 py-1 text-left text-xs text-slate-300"
          >
            {openingId === h.id ? (
              <Loader2 size={12} className="shrink-0 animate-spin text-cyan-400" />
            ) : (
              <MessageSquare size={12} className="shrink-0 text-slate-500" />
            )}
            <span className="truncate">{h.title}</span>
          </button>
          <button
            onClick={() => onRename(h)}
            className="shrink-0 rounded p-1 text-slate-600 hover:bg-slate-700 hover:text-slate-200"
            title="Rename"
            aria-label={`Rename ${h.title}`}
          >
            <Pencil size={11} />
          </button>
          <button
            onClick={() => onDelete(h)}
            className="shrink-0 rounded p-1 text-slate-600 hover:bg-slate-700 hover:text-rose-400"
            title="Delete"
            aria-label={`Delete ${h.title}`}
          >
            <Trash2 size={11} />
          </button>
        </div>
      ))}
    </>
  );
}

function HomePage() {
  const { settings, activeRole } = useResolveX();
  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: "welcome", role: "assistant", text: WELCOME, card: null, analysis: null },
  ]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<{ id: string; title: string }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [activeConv, setActiveConv] = useState<{ id: string; title: string } | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [convDialog, setConvDialog] = useState<null | { type: "rename" | "delete"; conv: HistoryItem }>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const convStates = useRef<ConvStateStore | null>(null);
  if (!convStates.current) convStates.current = createConvStateStore();
  const convStore = convStates.current;
  const sendingRef = useRef(false);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    setHistoryError(null);
    resolveXService
      .listConversations(30, 0, settings.apiBaseUrl)
      .then((res) => {
        const convs = res.conversations ?? [];
        setHistory(
          convs.map((c) => ({
            id: c.id,
            title: c.original_instruction?.slice(0, 60) || "Conversation",
          })),
        );
      })
      .catch(() => setHistoryError("Couldn't load conversation history."))
      .finally(() => setHistoryLoading(false));
  }, [settings.apiBaseUrl]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const patchMsg = useCallback((id: string, patch: Partial<ChatMsg>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || sendingRef.current) return;
      sendingRef.current = true;
      setInput("");
      const userMsg: ChatMsg = { id: nextId(), role: "user", text, card: null };
      const aiId = nextId();
      setMessages((prev) => [...prev, userMsg, { id: aiId, role: "assistant", text: "", card: null, pending: true }]);

      const base = settings.apiBaseUrl;
      const convKey = activeConv?.id ?? NEW_CONV_KEY;
      const cs = convStore.get(convKey);
      try {
        try {
          const card = await opsApi.query(
            text,
            base,
            cs.draft ? { last_message_draft: cs.draft } : undefined,
            activeConv?.id ?? undefined,
          );
          if (card.card_type !== "help") {
            // The backend persists ops turns into conversations and returns the
            // id — adopt it so drafts/history attach to the right conversation.
            const cid = card.conversation_id ?? convKey;
            if (cid !== convKey) {
              convStore.set(cid, { pendingClarify: null });
              if (convKey === NEW_CONV_KEY) convStore.clear(NEW_CONV_KEY);
              setActiveConv({ id: cid, title: text.slice(0, 60) });
              loadHistory();
            }
            if (card.card_type === "message_draft") {
              convStore.set(cid, { draft: card.data as Record<string, any> });
            } else {
              convStore.set(cid, { draft: null, pendingClarify: null });
            }
            patchMsg(aiId, {
              pending: false,
              text: card.summary ?? card.title,
              card,
            });
            return;
          }
        } catch {
          // ops router unreachable — fall through to language pipeline
        }
        convStore.set(convKey, { draft: null });

        // Fall back to the language-understanding pipeline for instructions/clarifications.
        try {
          // Multi-turn: if the previous turn asked for clarification, continue that conversation.
          const resp = cs.pendingClarify
            ? await resolveXService.clarifyWithBackend(cs.pendingClarify.conversationId, text, base)
            : await resolveXService.analyzeWithBackend(text, undefined, base);
          const pending =
            resp.status === "NEEDS_CLARIFICATION" ? { conversationId: resp.conversation_id } : null;
          const newKey = resp.conversation_id;
          convStore.set(newKey, { pendingClarify: pending, draft: null });
          if (newKey !== convKey) convStore.set(convKey, { pendingClarify: null });
          setActiveConv({ id: resp.conversation_id, title: text.slice(0, 60) });
          loadHistory();
          const top = resp.interpretations?.[0];
          const status = String(resp.status ?? "");
          const direct = resp.resolved_intent?.direct_answer;
          const summary =
            status === "NEEDS_CLARIFICATION"
              ? `I need a bit more detail before I can resolve that.${resp.clarification_questions?.length ? ` ${resp.clarification_questions[0]}` : ""}`
              : direct || top?.label || top?.description || "I processed your request.";
          patchMsg(aiId, {
            pending: false,
            text: summary,
            analysis: { status, summary },
            card: null,
          });
        } catch (err) {
          patchMsg(aiId, {
            pending: false,
            text: `I couldn't reach the analysis service${err instanceof Error ? ` (${err.message})` : ""}. Please check that the backend is running, or try a business question like "Which orders might be delayed?"`,
          });
        }
      } finally {
        sendingRef.current = false;
      }
    },
    [settings.apiBaseUrl, patchMsg, loadHistory, activeConv?.id, convStore],
  );

  const openConversation = useCallback(
    async (h: { id: string; title: string }) => {
      if (openingId === h.id) return;
      setOpeningId(h.id);
      try {
        const detail = await resolveXService.getConversationDetail(h.id, settings.apiBaseUrl);
        const conv = detail.conversation;
        const loaded: ChatMsg[] = (detail.messages ?? [])
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m, i) => ({
            id: `h${h.id}-${i}`,
            role: m.role === "user" ? "user" : "assistant",
            text: m.content,
            card: null,
            analysis: null,
          }));
        const persistedDraft = detail.draft?.draft ?? null;
        const msgs: ChatMsg[] = loaded.length
          ? [...loaded]
          : [{ id: nextId(), role: "assistant", text: WELCOME, card: null, analysis: null }];
        // Re-render the persisted draft card so it survives refreshes.
        if (persistedDraft && typeof persistedDraft === "object" && "body" in persistedDraft) {
          msgs.push({
            id: nextId(),
            role: "assistant",
            text: "",
            card: {
              card_type: "message_draft",
              title: `Message Draft — ${String(persistedDraft["recipient"] ?? "there")}`,
              summary: "Draft restored from this conversation. Still not sent — no messaging provider is connected.",
              data: persistedDraft,
            },
            analysis: null,
          });
        }
        setMessages(msgs);
        setActiveConv({ id: h.id, title: conv.original_instruction?.slice(0, 60) || h.title });
        convStore.set(h.id, {
          pendingClarify:
            conv.status === "NEEDS_CLARIFICATION" ? { conversationId: h.id } : null,
          draft: persistedDraft,
        });
      } catch {
        setMessages([
          { id: nextId(), role: "assistant", text: "I couldn't load that conversation. Please try again.", card: null, analysis: null },
        ]);
      } finally {
        setOpeningId(null);
      }
    },
    [openingId, settings.apiBaseUrl, convStore],
  );

  const newChat = useCallback(() => {
    convStore.clear(NEW_CONV_KEY);
    setActiveConv(null);
    setMessages([{ id: nextId(), role: "assistant", text: WELCOME, card: null, analysis: null }]);
    inputRef.current?.focus();
  }, [convStore]);

  const openRenameDialog = useCallback((h: HistoryItem) => {
    setDialogError(null);
    setDialogBusy(false);
    setConvDialog({ type: "rename", conv: h });
  }, []);

  const openDeleteDialog = useCallback((h: HistoryItem) => {
    setDialogError(null);
    setDialogBusy(false);
    setConvDialog({ type: "delete", conv: h });
  }, []);

  const closeDialog = useCallback(() => {
    if (dialogBusy) return;
    setConvDialog(null);
    setDialogError(null);
  }, [dialogBusy]);

  const submitRename = useCallback(
    async (title: string) => {
      if (!convDialog || convDialog.type !== "rename") return;
      const h = convDialog.conv;
      setDialogBusy(true);
      setDialogError(null);
      try {
        await resolveXService.renameConversation(h.id, title, settings.apiBaseUrl);
        if (activeConv?.id === h.id) setActiveConv({ id: h.id, title: title.slice(0, 60) });
        setConvDialog(null);
        loadHistory();
      } catch {
        setDialogError("Couldn't rename the conversation. Please try again.");
      } finally {
        setDialogBusy(false);
      }
    },
    [convDialog, activeConv, settings.apiBaseUrl, loadHistory],
  );

  const confirmDelete = useCallback(async () => {
    if (!convDialog || convDialog.type !== "delete") return;
    const h = convDialog.conv;
    setDialogBusy(true);
    setDialogError(null);
    try {
      await resolveXService.deleteConversation(h.id, settings.apiBaseUrl);
      convStore.clear(h.id);
      if (activeConv?.id === h.id) newChat();
      setConvDialog(null);
      loadHistory();
    } catch {
      setDialogError("Couldn't delete the conversation. Please try again.");
    } finally {
      setDialogBusy(false);
    }
  }, [convDialog, activeConv, settings.apiBaseUrl, loadHistory, convStore, newChat]);

  const navItems = [
    { to: "/inventory", label: "Inventory", icon: Package },
    { to: "/warehouse", label: "Warehouse", icon: Warehouse },
    { to: "/orders", label: "Orders", icon: Truck },
    { to: "/suppliers", label: "Suppliers", icon: Users },
    { to: "/integrations", label: "Integrations", icon: PlugZap },
    { to: "/settings", label: "Settings", icon: SettingsIcon },
  ] as const;

  return (
    <div className="flex h-screen bg-slate-100">
      {/* Left sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-900 text-slate-200 md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400"><Bot size={20} /></div>
          <div>
            <div className="text-sm font-bold text-white">ResolveX</div>
            <div className="text-[11px] text-slate-400">Business Operations Assistant</div>
          </div>
        </div>
        <button
          onClick={newChat}
          className="mx-4 mb-3 flex items-center justify-center gap-2 rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
        >
          <Plus size={16} /> New conversation
        </button>
        <div className="flex-1 overflow-y-auto px-3">
          <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">History</div>
          <HistoryItems
            history={history}
            historyLoading={historyLoading}
            historyError={historyError}
            activeId={activeConv?.id ?? null}
            openingId={openingId}
            onOpen={(h) => void openConversation(h)}
            onRename={openRenameDialog}
            onDelete={openDeleteDialog}
          />
        </div>
        <nav className="border-t border-slate-800 p-3">
          {navItems.map((item) => (
            <Link key={item.to} to={item.to} className="mb-0.5 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white">
              <item.icon size={16} /> {item.label}
            </Link>
          ))}
          <div className="mt-2 flex items-center justify-between rounded-md bg-slate-800/70 px-2.5 py-2">
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-white">{activeRole}</div>
              <div className="text-[10px] text-slate-400">{mapDemoRoleToBackendHeader(activeRole)}</div>
            </div>
            <ChevronRight size={14} className="text-slate-500" />
          </div>
        </nav>
      </aside>

      {/* Main chat */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Mobile nav strip (sidebar hidden below md) */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 bg-slate-900 px-3 py-2 md:hidden">
          <span className="mr-1 shrink-0 text-sm font-bold text-white">ResolveX</span>
          <button
            onClick={() => setMobileHistoryOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <MessageSquare size={14} /> History
          </button>
          <button
            onClick={newChat}
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <Plus size={14} /> New
          </button>
          {navItems.map((item) => (
            <Link key={item.to} to={item.to} className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white">
              <item.icon size={14} /> {item.label}
            </Link>
          ))}
        </div>
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-900">
              {activeConv ? activeConv.title : "Business Assistant"}
            </h1>
            <p className="text-xs text-slate-500">
              {activeConv ? "Conversation in progress" : "Answers use live inventory, warehouse, supplier and order data."}
            </p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">● Live data</span>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          <div className="mx-auto max-w-3xl space-y-5">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] ${m.role === "user" ? "order-2" : ""}`}>
                  {m.role === "assistant" && (
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                      <Bot size={14} className="text-cyan-600" /> ResolveX
                    </div>
                  )}
                  {m.pending ? (
                    <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                      <Loader2 size={15} className="animate-spin" /> Thinking…
                    </div>
                  ) : (
                    <div className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${m.role === "user" ? "rounded-tr-sm bg-cyan-600 text-white" : "rounded-tl-sm bg-white text-slate-800"}`}>
                      {m.text}
                    </div>
                  )}
                  {m.card && !m.pending && <div className="mt-3"><OpsCardView card={m.card} /></div>}
                  {m.analysis && m.analysis.status === "NEEDS_CLARIFICATION" && (
                    <Link to="/clarification" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-cyan-700 hover:underline">
                      Open clarification flow <ChevronRight size={12} />
                    </Link>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-slate-200 bg-white px-4 pb-4 pt-3 sm:px-8">
          <div className="mx-auto max-w-3xl">
            {messages.length <= 2 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => void send(s)} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-800">
                    {s}
                  </button>
                ))}
              </div>
            )}
            <form
              onSubmit={(e) => { e.preventDefault(); void send(input); }}
              className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-sm focus-within:border-cyan-500"
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
                rows={1}
                placeholder="Ask about stock, storage, suppliers, orders…"
                className="max-h-32 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
              <button type="submit" disabled={!input.trim()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-40" aria-label="Send">
                <Send size={16} />
              </button>
            </form>
            <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-400">
              <AlertCircle size={11} /> Consequential actions like purchase-order approval always require an authorized role.
            </p>
          </div>
        </div>
      </main>

      {/* Mobile history drawer */}
      {mobileHistoryOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-slate-950/50" onClick={() => setMobileHistoryOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-slate-900 text-slate-200 shadow-xl">
            <div className="flex items-center justify-between px-4 py-4">
              <span className="text-sm font-bold text-white">History</span>
              <button onClick={() => setMobileHistoryOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close history">
                ✕
              </button>
            </div>
            <button
              onClick={() => { newChat(); setMobileHistoryOpen(false); }}
              className="mx-4 mb-3 flex items-center justify-center gap-2 rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
            >
              <Plus size={16} /> New conversation
            </button>
            <div className="flex-1 overflow-y-auto px-3">
              <HistoryItems
                history={history}
                historyLoading={historyLoading}
                historyError={historyError}
                activeId={activeConv?.id ?? null}
                openingId={openingId}
                onOpen={(h) => { setMobileHistoryOpen(false); void openConversation(h); }}
                onRename={openRenameDialog}
                onDelete={openDeleteDialog}
              />
            </div>
          </div>
        </div>
      )}

      <RenameConversationDialog
        open={convDialog?.type === "rename"}
        initialTitle={convDialog?.type === "rename" ? convDialog.conv.title : ""}
        busy={dialogBusy}
        error={dialogError}
        onCancel={closeDialog}
        onSubmit={(t) => void submitRename(t)}
      />
      <DeleteConversationDialog
        open={convDialog?.type === "delete"}
        title={convDialog?.type === "delete" ? convDialog.conv.title : ""}
        busy={dialogBusy}
        error={dialogError}
        onCancel={closeDialog}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
