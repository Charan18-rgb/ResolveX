import {
  Activity,
  ChevronDown,
  FolderGit2,
  Menu,
  Settings,
  Sparkles,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'

const PIPELINE_LINKS = [
  { to: '/analysis', label: 'Analysis' },
  { to: '/visualization', label: 'Ambiguity Visualization' },
  { to: '/interpretations', label: 'Interpretations' },
  { to: '/clarification', label: 'Clarification' },
  { to: '/resolution', label: 'Final Resolution' },
]

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [pipelineOpen, setPipelineOpen] = useState(false)
  const location = useLocation()

  const isPipelineActive = PIPELINE_LINKS.some(
    (link) => location.pathname === link.to,
  )

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium transition-colors ${
      isActive
        ? 'text-cyan-300'
        : 'text-slate-300 hover:text-white'
    }`

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#050814]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="flex items-center gap-2.5 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-lg"
          onClick={() => setMobileOpen(false)}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 shadow-lg shadow-violet-500/25">
            <Sparkles className="h-4 w-4 text-white" aria-hidden="true" />
          </span>
          <span className="text-lg font-semibold tracking-tight">
            Resolve<span className="text-cyan-400">X</span>
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav
          aria-label="Primary Navigation"
          className="hidden lg:flex items-center gap-6"
        >
          <NavLink to="/" end className={navLinkClass}>
            Home
          </NavLink>
          <Link
            to="/#features"
            className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
          >
            Features
          </Link>
          <NavLink to="/workspace" className={navLinkClass}>
            Workspace
          </NavLink>

          <div
            className="relative"
            onMouseEnter={() => setPipelineOpen(true)}
            onMouseLeave={() => setPipelineOpen(false)}
          >
            <button
              type="button"
              onClick={() => setPipelineOpen((prev) => !prev)}
              aria-expanded={pipelineOpen}
              className={`inline-flex cursor-pointer items-center gap-1 text-sm font-medium transition-colors ${
                isPipelineActive
                  ? 'text-cyan-300'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <span>Pipeline</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${
                  pipelineOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {pipelineOpen && (
              <div className="absolute left-0 top-full pt-2 w-56">
                <div className="glass-panel rounded-xl border border-white/12 p-1.5 shadow-2xl">
                  {PIPELINE_LINKS.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setPipelineOpen(false)}
                      className={({ isActive }) =>
                        `block rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                          isActive
                            ? 'bg-violet-500/20 text-cyan-200'
                            : 'text-slate-300 hover:bg-white/5 hover:text-white'
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            )}
          </div>

          <NavLink to="/evaluation" className={navLinkClass}>
            Evaluation
          </NavLink>
          <NavLink to="/how-it-works" className={navLinkClass}>
            How It Works
          </NavLink>
        </nav>

        {/* Desktop Actions */}
        <div className="hidden lg:flex items-center gap-3">
          <NavLink
            to="/settings"
            aria-label="Settings"
            className={({ isActive }) =>
              `inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/25 hover:text-white'
              }`
            }
          >
            <Settings className="h-3.5 w-3.5" />
            <span>Settings</span>
          </NavLink>

          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub Repository"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-white/25 hover:text-white transition-colors"
          >
            <FolderGit2 className="h-3.5 w-3.5" />
            <span>GitHub</span>
          </a>

          <Link
            to="/workspace"
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-violet-500/20 hover:from-violet-500 hover:to-cyan-400 transition-all"
          >
            <Activity className="h-3.5 w-3.5" />
            <span>Launch Studio</span>
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileOpen}
          className="inline-flex lg:hidden cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-white/5 p-2 text-slate-200 hover:bg-white/10"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-white/10 bg-[#070b1a]/95 backdrop-blur-xl px-4 py-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <NavLink
              to="/"
              end
              onClick={() => setMobileOpen(false)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/5"
            >
              Home
            </NavLink>
            <NavLink
              to="/workspace"
              onClick={() => setMobileOpen(false)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/5"
            >
              Workspace
            </NavLink>
            <NavLink
              to="/evaluation"
              onClick={() => setMobileOpen(false)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/5"
            >
              Evaluation
            </NavLink>
            <NavLink
              to="/how-it-works"
              onClick={() => setMobileOpen(false)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/5"
            >
              How It Works
            </NavLink>
            <NavLink
              to="/settings"
              onClick={() => setMobileOpen(false)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/5"
            >
              Settings
            </NavLink>
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/5"
            >
              <FolderGit2 className="h-4 w-4" />
              <span>GitHub</span>
            </a>
          </div>

          <div className="border-t border-white/10 pt-3">
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Pipeline Views
            </p>
            <div className="grid grid-cols-1 gap-1">
              {PIPELINE_LINKS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2 text-sm font-medium ${
                      isActive
                        ? 'bg-violet-500/20 text-cyan-200'
                        : 'text-slate-300 hover:bg-white/5'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
