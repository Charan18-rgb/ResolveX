import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot, Package, Warehouse, Truck, Users, Settings as SettingsIcon,
  Plus, Send, Loader2, AlertCircle, ChevronRight, MessageSquare, PlugZap,
} from "lucide-react";
import { useResolveX } from "@/context/useResolveX";
import { resolveXService, mapDemoRoleToBackendHeader } from "@/services/api";
import { opsApi, type OpsCard } from "@/services/opsApi";
import { OpsCardView } from "@/components/chat/OpsCardView";

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

function HomePage() {
  const { settings, activeRole } = useResolveX();
  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: "welcome", role: "assistant", text: WELCOME, card: null, analysis: null },
  ]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<{ id: string; title: string }[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingClarify = useRef<{ conversationId: string } | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    resolveXService
      .listConversations(15, 0, settings.apiBaseUrl)
      .then((res) => {
        const convs = res.conversations ?? [];
        setHistory(
          convs.map((c) => ({
            id: c.id,
            title: c.original_instruction?.slice(0, 60) || "Conversation",
          })),
        );
      })
      .catch(() => setHistory([]));
  }, [settings.apiBaseUrl]);

  const patchMsg = useCallback((id: string, patch: Partial<ChatMsg>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      setInput("");
      const userMsg: ChatMsg = { id: nextId(), role: "user", text, card: null };
      const aiId = nextId();
      setMessages((prev) => [...prev, userMsg, { id: aiId, role: "assistant", text: "", card: null, pending: true }]);

      const base = settings.apiBaseUrl;
      try {
        const card = await opsApi.query(text, base);
        if (card.card_type !== "help") {
          pendingClarify.current = null;
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

      // Fall back to the language-understanding pipeline for instructions/clarifications.
      try {
        // Multi-turn: if the previous turn asked for clarification, continue that conversation.
        const resp = pendingClarify.current
          ? await resolveXService.clarifyWithBackend(pendingClarify.current.conversationId, text, base)
          : await resolveXService.analyzeWithBackend(text, undefined, base);
        pendingClarify.current =
          resp.status === "NEEDS_CLARIFICATION" ? { conversationId: resp.conversation_id } : null;
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
    },
    [settings.apiBaseUrl, patchMsg],
  );

  const newChat = useCallback(() => {
    pendingClarify.current = null;
    setMessages([{ id: nextId(), role: "assistant", text: WELCOME, card: null, analysis: null }]);
    inputRef.current?.focus();
  }, []);

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
            <div className="text-[11px] text-slate-400">Understand the Unclear. Resolve the Intent.</div>
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
          {history.length === 0 && <p className="px-2 text-xs text-slate-500">No past conversations yet.</p>}
          {history.slice(0, 20).map((h) => (
            <button key={h.id} onClick={newChat} className="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-800">
              <MessageSquare size={12} className="shrink-0 text-slate-500" />
              <span className="truncate">{h.title}</span>
            </button>
          ))}
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
          <span className="mr-2 text-sm font-bold text-white">ResolveX</span>
          {navItems.map((item) => (
            <Link key={item.to} to={item.to} className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white">
              <item.icon size={14} /> {item.label}
            </Link>
          ))}
        </div>
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div>
            <h1 className="text-base font-semibold text-slate-900">Business Assistant</h1>
            <p className="text-xs text-slate-500">Answers use live inventory, warehouse, supplier and order data.</p>
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
    </div>
  );
}
