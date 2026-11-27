import type { AmbiguityCategory } from "@/types/resolvex";

export const CATEGORY_STYLE_MAP: Record<
  AmbiguityCategory,
  { badge: string; span: string; dot: string }
> = {
  Lexical: {
    badge: "border-violet-500/40 bg-violet-500/15 text-violet-200",
    span: "border-violet-400/70 bg-violet-500/20 text-violet-100 hover:bg-violet-500/30",
    dot: "bg-violet-400",
  },
  Syntactic: {
    badge: "border-indigo-500/40 bg-indigo-500/15 text-indigo-200",
    span: "border-indigo-400/70 bg-indigo-500/20 text-indigo-100 hover:bg-indigo-500/30",
    dot: "bg-indigo-400",
  },
  Referential: {
    badge: "border-cyan-500/40 bg-cyan-500/15 text-cyan-200",
    span: "border-cyan-400/70 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30",
    dot: "bg-cyan-400",
  },
  Scope: {
    badge: "border-amber-500/40 bg-amber-500/15 text-amber-200",
    span: "border-amber-400/70 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30",
    dot: "bg-amber-400",
  },
  Temporal: {
    badge: "border-rose-500/40 bg-rose-500/15 text-rose-200",
    span: "border-rose-400/70 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30",
    dot: "bg-rose-400",
  },
  Pragmatic: {
    badge: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
    span: "border-emerald-400/70 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30",
    dot: "bg-emerald-400",
  },
};
