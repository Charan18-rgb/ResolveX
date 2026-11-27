import { Link } from "@tanstack/react-router";
import { FolderGit2, Sparkles } from "lucide-react";

const CURRENT_YEAR = 2026;

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#040610]/90">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div className="md:col-span-2 space-y-3">
            <Link to="/" className="inline-flex items-center gap-2 text-white">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-cyan-500">
                <Sparkles className="h-4 w-4 text-white" />
              </span>
              <span className="text-base font-semibold">
                Resolve<span className="text-cyan-400">X</span>
              </span>
            </Link>
            <p className="max-w-md text-xs sm:text-sm leading-relaxed text-slate-400">
              Unified AI platform combining Natural Language Ambiguity Resolution (PS6) and Smart
              Inventory & CRD Risk Intelligence (PS2).
            </p>
            <p className="text-xs text-slate-500">
              Frontend Demo Build • FastAPI integration ready via{" "}
              <code className="rounded bg-white/5 px-1.5 py-0.5 text-cyan-300">
                VITE_API_BASE_URL
              </code>
            </p>
          </div>

          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              PS6 & PS2 Suite
            </h3>
            <ul className="space-y-2 text-xs text-slate-400">
              <li>
                <Link to="/workspace" className="hover:text-cyan-300 transition-colors">
                  Language Workspace
                </Link>
              </li>
              <li>
                <Link to="/visualization" className="hover:text-cyan-300 transition-colors">
                  Context Intelligence Graph
                </Link>
              </li>
              <li>
                <Link to="/interpretations" className="hover:text-cyan-300 transition-colors">
                  What-If Simulator
                </Link>
              </li>
              <li>
                <Link to="/clarification" className="hover:text-cyan-300 transition-colors">
                  Clarification Optimizer
                </Link>
              </li>
              <li>
                <Link to="/inventory" className="hover:text-cyan-300 transition-colors">
                  Inventory & CRD Hub (PS2)
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Platform
            </h3>
            <ul className="space-y-2 text-xs text-slate-400">
              <li>
                <Link to="/how-it-works" className="hover:text-cyan-300 transition-colors">
                  How It Works
                </Link>
              </li>
              <li>
                <Link to="/evaluation" className="hover:text-cyan-300 transition-colors">
                  Unified Analytics (DEMO DATA)
                </Link>
              </li>
              <li>
                <Link to="/settings" className="hover:text-cyan-300 transition-colors">
                  API & Settings
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 hover:text-cyan-300 transition-colors"
                >
                  <FolderGit2 className="h-3.5 w-3.5" />
                  <span>GitHub</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-white/8 pt-6 text-xs text-slate-500">
          <p>© {CURRENT_YEAR} ResolveX Unified Frontend. Mock client simulation.</p>
          <p>
            Built with TanStack Start, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion &
            Recharts.
          </p>
        </div>
      </div>
    </footer>
  );
}
