import { useEffect } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { ResolveXProvider } from './context/ResolveXContext'
import { AnalysisPage } from './pages/AnalysisPage'
import { ClarificationPage } from './pages/ClarificationPage'
import { EvaluationPage } from './pages/EvaluationPage'
import { HowItWorksPage } from './pages/HowItWorksPage'
import { InterpretationsPage } from './pages/InterpretationsPage'
import { LandingPage } from './pages/LandingPage'
import { ResolutionPage } from './pages/ResolutionPage'
import { SettingsPage } from './pages/SettingsPage'
import { VisualizationPage } from './pages/VisualizationPage'
import { WorkspacePage } from './pages/WorkspacePage'

function ScrollManager() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) {
      const targetId = hash.replace('#', '')
      const el = document.getElementById(targetId)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' })
        return
      }
    }
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname, hash])

  return null
}

function App() {
  return (
    <BrowserRouter>
      <ResolveXProvider>
        <ScrollManager />
        <AppLayout>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/workspace" element={<WorkspacePage />} />
            <Route path="/analysis" element={<AnalysisPage />} />
            <Route path="/visualization" element={<VisualizationPage />} />
            <Route path="/interpretations" element={<InterpretationsPage />} />
            <Route path="/clarification" element={<ClarificationPage />} />
            <Route path="/resolution" element={<ResolutionPage />} />
            <Route path="/evaluation" element={<EvaluationPage />} />
            <Route path="/how-it-works" element={<HowItWorksPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppLayout>
      </ResolveXProvider>
    </BrowserRouter>
  )
}

export default App
