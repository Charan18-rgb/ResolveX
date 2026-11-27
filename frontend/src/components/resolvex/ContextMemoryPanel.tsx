import {
  AlertTriangle,
  Brain,
  Check,
  CheckCircle2,
  Edit3,
  Link2,
  MessageSquare,
  Plus,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import { useState } from "react";
import { useResolveX } from "@/context/useResolveX";
import type { MemoryEntityCategory } from "@/types/resolvex";
import { Badge, type BadgeTone } from "./Badge";
import { Button } from "./Button";
import { Card } from "./Card";

const CATEGORY_TONE: Record<MemoryEntityCategory, BadgeTone> = {
  person: "cyan",
  object: "violet",
  date: "rose",
  action: "emerald",
  reference: "amber",
};

interface ContextMemoryPanelProps {
  compact?: boolean | undefined;
  onResolveConflictClick?: ((targetToken: string) => void) | undefined;
  title?: string | undefined;
}

export function ContextMemoryPanel({
  compact = false,
  onResolveConflictClick,
  title = "Session Context Memory & Conversation Intelligence",
}: ContextMemoryPanelProps) {
  const {
    activeSessionId,
    sessionMemory,
    startNewIsolatedSession,
    updateMemoryEntity,
    deleteMemoryEntity,
    clearCurrentSessionMemory,
  } = useResolveX();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const handleStartEdit = (id: string, currentVal: string) => {
    setEditingId(id);
    setEditValue(currentVal);
  };

  const handleSaveEdit = (id: string) => {
    if (editValue.trim()) {
      updateMemoryEntity(id, editValue.trim());
    }
    setEditingId(null);
    setEditValue("");
  };

  return (
    <Card className="space-y-4 border-cyan-500/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Brain className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm sm:text-base font-semibold text-white">{title}</h3>
            <Badge tone="cyan">Session {activeSessionId.slice(-8)}</Badge>
            <Badge tone="emerald">Isolated Memory (Zero Cross-Session Leakage)</Badge>
          </div>
          <p className="text-xs text-slate-400">
            Tracks people, objects, dates, actions, and coreferences inside this session with exact
            source messages. Edits sync live across Graph, Clarification, Confidence, What-If, and
            Resolution.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={startNewIsolatedSession}
            iconLeft={<Plus className="h-3.5 w-3.5" />}
          >
            New Isolated Session
          </Button>
          {(sessionMemory.entities.length > 0 || sessionMemory.messages.length > 0) && (
            <Button
              size="sm"
              variant="outline"
              onClick={clearCurrentSessionMemory}
              iconLeft={<Trash2 className="h-3.5 w-3.5 text-rose-400" />}
            >
              Clear Memory
            </Button>
          )}
        </div>
      </div>

      {/* Reference Resolutions & Conflicts */}
      {(sessionMemory.resolvedReferences.length > 0 ||
        sessionMemory.referenceConflicts.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {sessionMemory.resolvedReferences.length > 0 && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/8 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-200">
                <span className="inline-flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5" />
                  Resolved Coreferences ({sessionMemory.resolvedReferences.length})
                </span>
                <Badge tone="emerald">Auto-Bound</Badge>
              </div>
              <div className="space-y-1.5">
                {sessionMemory.resolvedReferences.map((ref) => (
                  <div
                    key={`${ref.referenceToken}-${ref.resolvedValue ?? "none"}`}
                    className="rounded-lg border border-white/10 bg-[#050814]/80 p-2 text-xs space-y-0.5"
                  >
                    <p className="font-medium text-white">
                      <span className="font-mono text-cyan-300">“{ref.referenceToken}”</span> →{" "}
                      <span className="text-emerald-300">{ref.resolvedValue}</span>
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Turn {ref.sourceTurn ?? 1}: “{ref.sourceMessage}”
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sessionMemory.referenceConflicts.length > 0 && (
            <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-rose-200">
                <span className="inline-flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Conflicting / Unclear References ({sessionMemory.referenceConflicts.length})
                </span>
                <Badge tone="rose">Clarification Required</Badge>
              </div>
              <div className="space-y-1.5">
                {sessionMemory.referenceConflicts.map((conf) => (
                  <div
                    key={`${conf.referenceToken}-${conf.status}`}
                    className="rounded-lg border border-rose-500/25 bg-[#050814]/80 p-2 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-amber-200">
                        “{conf.referenceToken}” ({conf.status})
                      </span>
                      {onResolveConflictClick && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => onResolveConflictClick(conf.referenceToken)}
                        >
                          Clarify Reference
                        </Button>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-300">{conf.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Remembered Entities with Source Attribution & Inline Edit */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-300 inline-flex items-center gap-1.5">
            <UserCheck className="h-3.5 w-3.5 text-violet-400" />
            Remembered Session Entities ({sessionMemory.entities.length})
          </span>
          {sessionMemory.editedAt && (
            <span className="text-[11px] text-cyan-300">Edited in active session</span>
          )}
        </div>

        {sessionMemory.entities.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/12 p-4 text-xs text-slate-400">
            Session memory is currently empty. Analyze a prompt or submit a follow-up message to
            track people, objects, dates, actions, and resolved references.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
            {sessionMemory.entities.map((ent) => {
              const isEditing = editingId === ent.id;
              return (
                <div
                  key={ent.id}
                  className="rounded-xl border border-white/10 bg-[#050814]/80 p-2.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <Badge tone={CATEGORY_TONE[ent.category]}>{ent.category}</Badge>
                      {ent.editedByUser && <Badge tone="cyan">Edited</Badge>}
                    </div>
                    <div className="flex items-center gap-1">
                      {!isEditing && (
                        <button
                          type="button"
                          aria-label={`Edit remembered ${ent.category} ${ent.value}`}
                          onClick={() => handleStartEdit(ent.id, ent.value)}
                          className="cursor-pointer rounded p-1 text-slate-400 hover:bg-white/10 hover:text-cyan-300"
                        >
                          <Edit3 className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`Remove remembered ${ent.category} ${ent.value}`}
                        onClick={() => deleteMemoryEntity(ent.id)}
                        className="cursor-pointer rounded p-1 text-slate-400 hover:bg-white/10 hover:text-rose-300"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleSaveEdit(ent.id);
                          }
                        }}
                        className="w-full rounded-lg border border-cyan-400/50 bg-[#070b1a] px-2 py-1 text-xs text-white focus:outline-none"
                      />
                      <button
                        type="button"
                        aria-label="Save edited entity"
                        onClick={() => handleSaveEdit(ent.id)}
                        className="cursor-pointer rounded-lg bg-emerald-500/20 p-1.5 text-emerald-300 hover:bg-emerald-500/30"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <p
                      className="font-mono text-xs font-semibold text-white truncate"
                      title={ent.value}
                    >
                      {ent.value}
                    </p>
                  )}

                  <p className="text-[11px] text-slate-400 truncate" title={ent.sourceMessage}>
                    Turn {ent.sourceTurn} ({ent.sourceRole}): “{ent.sourceMessage}”
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Turn History (shown in full mode) */}
      {!compact && sessionMemory.messages.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-white/10">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 inline-flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-cyan-400" />
            Conversation Turns in This Session ({sessionMemory.messages.length})
          </span>
          <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
            {sessionMemory.messages.map((m) => (
              <div
                key={m.id}
                className="flex items-start gap-2 rounded-lg border border-white/6 bg-white/3 px-2.5 py-1.5 text-xs"
              >
                <span className="font-mono text-[11px] text-cyan-300 shrink-0">
                  Turn {m.turnNumber} ({m.role})
                </span>
                <span className="text-slate-200">{m.content}</span>
                <CheckCircle2 className="h-3 w-3 text-emerald-400/70 shrink-0 ml-auto mt-0.5" />
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
