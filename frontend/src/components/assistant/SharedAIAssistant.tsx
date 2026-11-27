import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Bot, Send, Sparkles, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useResolveX } from "@/context/useResolveX";
import { Badge } from "../resolvex/Badge";
import { Button } from "../resolvex/Button";

const SUGGESTED_QUERIES = [
  "Which materials are in shortage?",
  "Show CRD at-risk orders",
  "What PO approvals are pending?",
  "Explain current verification status",
  "Why are spans ambiguous in the active prompt?",
];

export function SharedAIAssistant() {
  const navigate = useNavigate();
  const { assistantOpen, setAssistantOpen, assistantMessages, sendAssistantQuery, activeRole } =
    useResolveX();

  const [input, setInput] = useState("");

  if (!assistantOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendAssistantQuery(input);
    setInput("");
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
              <Badge tone="cyan">DEMO</Badge>
            </div>
            <p className="text-[11px] text-slate-400">
              PS6 Language + PS2 Inventory • Role: {activeRole}
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close AI assistant"
          onClick={() => setAssistantOpen(false)}
          className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Quick Prompts */}
      <div className="border-b border-white/10 px-4 py-3 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Ask Across PS6 & PS2
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_QUERIES.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => sendAssistantQuery(q)}
              className="cursor-pointer rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 hover:border-cyan-400/50 hover:text-white transition-colors"
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
            className={`rounded-2xl border p-3.5 text-xs sm:text-sm space-y-2 ${
              msg.sender === "user"
                ? "ml-8 border-violet-500/35 bg-violet-500/12 text-white"
                : "mr-4 border-white/10 bg-[#0b1124] text-slate-200"
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
              <span className="inline-flex items-center gap-1 font-semibold text-cyan-300">
                <Sparkles className="h-3 w-3" />
                {msg.sender === "user" ? "You" : msg.domainTag}
              </span>
              <span>{msg.timestamp}</span>
            </div>
            <p className="leading-relaxed">{msg.text}</p>
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
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-white/10 p-4 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about shortages, CRD risks, ambiguities..."
          className="flex-1 rounded-xl border border-white/12 bg-[#050814]/90 px-3.5 py-2 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none"
        />
        <Button type="submit" size="sm" iconLeft={<Send className="h-3.5 w-3.5" />}>
          Send
        </Button>
      </form>
    </div>
  );
}
