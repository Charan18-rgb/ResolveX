import type { ReactNode } from 'react'

export type BadgeTone =
  | 'violet'
  | 'cyan'
  | 'amber'
  | 'rose'
  | 'emerald'
  | 'slate'

const TONE_CLASSES: Record<BadgeTone, string> = {
  violet: 'border-violet-500/30 bg-violet-500/15 text-violet-200',
  cyan: 'border-cyan-500/30 bg-cyan-500/15 text-cyan-200',
  amber: 'border-amber-500/30 bg-amber-500/15 text-amber-200',
  rose: 'border-rose-500/30 bg-rose-500/15 text-rose-200',
  emerald: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200',
  slate: 'border-white/15 bg-white/5 text-slate-300',
}

interface BadgeProps {
  children: ReactNode
  tone?: BadgeTone
  className?: string
}

export function Badge({
  children,
  tone = 'slate',
  className = '',
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
