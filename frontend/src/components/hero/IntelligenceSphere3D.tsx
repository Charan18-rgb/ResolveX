import { motion } from "framer-motion";
import { CheckCircle2, GitBranch, Package, Sparkles } from "lucide-react";
import { useState } from "react";

const FRAGMENTS = [
  { label: "“deploy it soon”", angle: -24, x: "-38%", y: "-28%", tone: "amber" },
  { label: "“MCU shortage?”", angle: 16, x: "34%", y: "-32%", tone: "cyan" },
  { label: "“ಬೇಗ update”", angle: -12, x: "-40%", y: "24%", tone: "violet" },
  { label: "“CRD risk 5d”", angle: 20, x: "32%", y: "28%", tone: "emerald" },
] as const;

export function IntelligenceSphere3D({
  reduceMotion = false,
}: {
  reduceMotion?: boolean | undefined;
}) {
  const [mode, setMode] = useState<"ambiguous" | "resolved">("ambiguous");

  return (
    <div className="perspective-scene relative mx-auto flex h-[320px] sm:h-[360px] w-full max-w-[480px] flex-col items-center justify-center">
      {/* Orbital Rings (CSS 3D depth) */}
      <div
        className="pointer-events-none absolute h-64 w-64 sm:h-72 sm:w-72 rounded-full border border-violet-500/25"
        style={{ transform: "rotateX(66deg) rotateZ(-14deg)" }}
      />
      <div
        className="pointer-events-none absolute h-52 w-52 sm:h-60 sm:w-60 rounded-full border border-cyan-400/30"
        style={{ transform: "rotateY(62deg) rotateX(18deg)" }}
      />

      {/* Central Intelligence Sphere */}
      <motion.button
        type="button"
        onClick={() => setMode((prev) => (prev === "ambiguous" ? "resolved" : "ambiguous"))}
        animate={
          reduceMotion
            ? { scale: 1 }
            : {
                scale: [1, 1.03, 1],
              }
        }
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className={`relative z-10 flex h-36 w-36 sm:h-40 sm:w-40 cursor-pointer flex-col items-center justify-center rounded-full border p-4 text-center shadow-2xl transition-all ${
          mode === "resolved"
            ? "border-emerald-400/60 bg-gradient-to-br from-emerald-600/35 via-cyan-600/30 to-slate-900/90 shadow-emerald-500/25"
            : "border-violet-400/50 bg-gradient-to-br from-violet-600/40 via-indigo-900/70 to-cyan-500/25 shadow-violet-500/30"
        }`}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 mb-2">
          {mode === "resolved" ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-300" />
          ) : (
            <Sparkles className="h-5 w-5 text-cyan-300" />
          )}
        </div>
        <span className="text-xs font-semibold text-white">
          {mode === "resolved" ? "Intent Verified" : "ResolveX Core"}
        </span>
        <span className="mt-0.5 font-mono text-[10px] text-cyan-200">
          {mode === "resolved" ? "Clarity 96% • Click" : "Ambiguity → Clarity"}
        </span>
      </motion.button>

      {/* Floating Language & Supply-Chain Fragments */}
      {FRAGMENTS.map((frag, idx) => (
        <motion.div
          key={frag.label}
          animate={
            reduceMotion
              ? { y: 0 }
              : {
                  y: [0, idx % 2 === 0 ? -7 : 7, 0],
                }
          }
          transition={{
            duration: 3.2 + idx * 0.4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{
            transform: `translate(${frag.x}, ${frag.y})`,
          }}
          className="absolute z-20 rounded-xl border border-white/15 bg-[#080d1e]/90 px-3 py-1.5 text-[11px] font-medium text-slate-200 shadow-lg backdrop-blur-md"
        >
          <span className="inline-flex items-center gap-1.5">
            {idx % 2 === 0 ? (
              <GitBranch className="h-3 w-3 text-violet-400" />
            ) : (
              <Package className="h-3 w-3 text-cyan-400" />
            )}
            <span className="font-mono">{frag.label}</span>
          </span>
        </motion.div>
      ))}

      {/* Bottom Interactive Hint */}
      <p className="absolute bottom-0 text-[11px] text-slate-400">
        Click sphere to toggle Ambiguity ↔ Clarity preview
      </p>
    </div>
  );
}
