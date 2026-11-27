import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useResolveX } from '../../context/useResolveX'
import { Footer } from './Footer'
import { Navbar } from './Navbar'
import { PipelineStepper } from './PipelineStepper'

const PIPELINE_ROUTES = new Set([
  '/analysis',
  '/visualization',
  '/interpretations',
  '/clarification',
  '/resolution',
])

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { settings } = useResolveX()
  const showStepper = PIPELINE_ROUTES.has(location.pathname)

  return (
    <div className="relative min-h-screen flex flex-col bg-[#050814] text-slate-100">
      {/* Ambient navy/violet/cyan glows */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="bg-grid-pattern absolute inset-0 opacity-60" />
        <div className="absolute -top-40 left-1/4 h-[460px] w-[460px] rounded-full bg-violet-700/18 blur-[120px]" />
        <div className="absolute top-1/3 -right-24 h-[420px] w-[420px] rounded-full bg-cyan-500/14 blur-[120px]" />
        <div className="absolute -bottom-32 left-1/3 h-[380px] w-[380px] rounded-full bg-indigo-700/15 blur-[120px]" />
      </div>

      <Navbar />
      {showStepper && <PipelineStepper />}

      <main className="flex-1">
        <motion.div
          key={location.pathname}
          initial={settings.reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: settings.reduceMotion ? 0 : 0.25 }}
        >
          {children}
        </motion.div>
      </main>

      <Footer />
    </div>
  )
}
