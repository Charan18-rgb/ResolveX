import { useNavigate } from "@tanstack/react-router";
import { AlertCircle, ArrowRight, Bot, Loader2, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useResolveX } from "@/context/useResolveX";
import { Badge } from "../resolvex/Badge";
import { Button } from "../resolvex/Button";

const SUGGESTED_QUERIES = [
  "Show me current inventory shortages.",
  "Which open orders are at risk?",
  "Check MAT-CHIP availability and tell me whether upcoming orders will be affected.",
  "Which purchase orders need approval?",
  "Send the report to Rahul.",
];

export function SharedAIAssistant() {
  const navigate = useNavigate();
  const {
    assistantOpen,
    setAssistantOpen,
    assistantMessages,
    isAssistantLoading,
    assistantConversationId,
    resetAssistantConversation,
    sendAssistantQuery,
    activeRole,
    backendHealth,
  } = useResolveX();

  const [input, setInput] = useState("");

  if (!assistantOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isAssistantLoading) return;
    const text = input;
    setInput("");
    void sendAssistantQuery(text);
  };

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-white/12 bg-[#070b1a]/95 shadow-2xl backdrop-blur-xl"
      role="dialog"
      aria-label="ResolveX Unified AI Assistant"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500">
            <Bot className="h-4 w-4 text-white" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white">ResolveX Unified Assistant</h2>
              <Badge tone={backendHealth?.reachable ? "emerald" : "amber"}>
                {backendHealth?.reachable ? "LIVE" : "OFFLINE"}
              </Badge>
            </div>
            <p className="text-[11px] text-slate-400">
              Gemini AI + Live SQLite • Role: {activeRole}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {assistantConversationId && (
            <button
              type="button"
              title="Start new conversation thread"
              onClick={resetAssistantConversation}
              className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            aria-label="Close AI assistant"
            onClick={() => setAssistantOpen(false)}
            className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Quick Prompts */}
      <div className="border-b border-white/10 px-4 py-3 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Try Asking
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_QUERIES.map((q) => (
            <button
              key={q}
              type="button"
              disabled={isAssistantLoading}
              onClick={() => void sendAssistantQuery(q)}
              className="cursor-pointer rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-left text-[11px] text-slate-300 hover:border-cyan-400/50 hover:text-white transition-colors disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Message Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {assistantMessages.map((msg) => (
          <div
            key={msg.id}
            className={`rounded-2xl border p-3.5 text-xs sm:text-sm space-y-2.5 ${
              msg.sender === "user"
                ? "ml-8 border-violet-500/35 bg-violet-500/12 text-white"
                : msg.isError
                  ? "mr-4 border-rose-500/40 bg-rose-500/10 text-rose-100"
                  : "mr-4 border-white/10 bg-[#0b1124] text-slate-200"
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
              <span className="inline-flex items-center gap-1 font-semibold text-cyan-300">
                {msg.isError ? (
                  <AlertCircle className="h-3 w-3 text-rose-400" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                {msg.sender === "user" ? "You" : msg.domainTag}
              </span>
              <span>{msg.timestamp}</span>
            </div>

            <p className="leading-relaxed">{msg.text}</p>

            {/* Candidate Interpretations (PS6) */}
            {msg.interpretations && msg.interpretations.length > 0 && (
              <div className="space-y-1.5 pt-1 border-t border-white/10">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Possible Interpretations
                </p>
                {msg.interpretations.map((interp) => (
                  <button
                    key={interp.label}
                    type="button"
                    disabled={isAssistantLoading}
                    onClick={() => void sendAssistantQuery(`${interp.label}: ${interp.description}`)}
                    className="block w-full cursor-pointer rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-left text-[11px] hover:border-cyan-400/50 transition-colors"
                  >
                    <strong className="text-cyan-300">{interp.label}</strong>
                    <span className="block text-slate-400">{interp.description}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Database-Grounded Inventory Insight */}
            {msg.inventoryInsight && (
              <div className="rounded-xl border border-cyan-500/25 bg-cyan-950/25 p-2.5 text-[11px] space-y-1.5">
                <div className="flex items-center justify-between font-semibold text-cyan-300">
                  <span>Inventory Snapshot</span>
                  <span>
                    {msg.inventoryInsight.shortages.length} shortage(s) •{" "}
                    {
                      msg.inventoryInsight.order_risks.filter(
                        (r) => r.risk_category !== "ON_TRACK",
                      ).length
                    }{" "}
                    at-risk order(s)
                  </span>
                </div>
                {msg.inventoryInsight.shortages.slice(0, 3).map((s) => (
                  <div key={s.material_id} className="flex justify-between text-slate-300">
                    <span className="font-mono">{s.material_id}</span>
                    <span>
                      Net: {s.net_availability} {s.unit} (Unmet: {s.unmet_order_demand})
                    </span>
                  </div>
                ))}
              </div>
            )}

            {msg.suggestedRoute && msg.suggestedLabel && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setAssistantOpen(false);
                  void navigate({ to: msg.suggestedRoute as "/" });
                }}
                iconRight={<ArrowRight className="h-3 w-3" />}
              >
                {msg.suggestedLabel}
              </Button>
            )}
          </div>
        ))}

        {isAssistantLoading && (
          <div className="mr-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-[#0b1124] px-3.5 py-3 text-xs text-cyan-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Querying ResolveX backend...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-white/10 p-4 space-y-2">
        {assistantConversationId && (
          <p className="text-[10px] text-amber-300">
            Replying to clarification thread ({assistantConversationId.slice(0, 8)}…)
          </p>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            disabled={isAssistantLoading}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              assistantConversationId
                ? "Type your clarification reply..."
                : "Ask about shortages, CRD risks, ambiguities..."
            }
            className="flex-1 rounded-xl border border-white/12 bg-[#050814]/90 px-3.5 py-2 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none disabled:opacity-60"
          />
          <Button
            type="submit"
            size="sm"
            disabled={isAssistantLoading || !input.trim()}
            iconLeft={<Send className="h-3.5 w-3.5" />}
          >
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
