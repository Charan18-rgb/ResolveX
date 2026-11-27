import {
  CheckCircle2,
  Eye,
  GitBranch,
  MessageSquareMore,
  SearchCheck,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'

const STEPS = [
  { to: '/analysis', label: '1. Analysis', icon: SearchCheck },
  { to: '/visualization', label: '2. Visualization', icon: Eye },
  { to: '/interpretations', label: '3. Interpretations', icon: GitBranch },
  { to: '/clarification', label: '4. Clarification', icon: MessageSquareMore },
  { to: '/resolution', label: '5. Final Resolution', icon: CheckCircle2 },
]

export function PipelineStepper() {
  return (
    <div className="border-b border-white/10 bg-[#080d1e]/75 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-4 py-2.5 sm:px-6 lg:px-8">
        {STEPS.map((step) => {
          const Icon = step.icon
          return (
            <NavLink
              key={step.to}
              to={step.to}
              className={({ isActive }) =>
                `inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                  isActive
                    ? 'border-cyan-400/50 bg-gradient-to-r from-violet-600/30 to-cyan-500/25 text-white shadow-sm'
                    : 'border-white/8 bg-white/3 text-slate-400 hover:border-white/20 hover:text-slate-200'
                }`
              }
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{step.label}</span>
            </NavLink>
          )
        })}
      </div>
    </div>
  )
}
