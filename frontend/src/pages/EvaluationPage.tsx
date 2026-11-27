import { FlaskConical, TrendingUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { SectionHeader } from '../components/ui/SectionHeader'
import { DEMO_EVALUATION_DATA } from '../data/mockData'
import { resolveXService } from '../services/api'
import type { EvaluationDataset } from '../types/resolvex'

type CaseFilter = 'All' | 'Resolved' | 'Needs Review'

export function EvaluationPage() {
  const [dataset, setDataset] = useState<EvaluationDataset>(DEMO_EVALUATION_DATA)
  const [filter, setFilter] = useState<CaseFilter>('All')

  useEffect(() => {
    void resolveXService.getEvaluationDataset().then(setDataset)
  }, [])

  const filteredCases = dataset.benchmarkCases.filter((item) =>
    filter === 'All' ? true : item.status === filter,
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 space-y-8">
      <SectionHeader
        eyebrow="Benchmark & Telemetry"
        title="Evaluation Metrics (DEMO DATA)"
        description={`${dataset.benchmarkName} • ${dataset.sampleCount} synthetic prompts • Updated ${dataset.lastUpdated}`}
        actions={<Badge tone="amber">DEMO DATA — SIMULATED BENCHMARKS</Badge>}
      />

      {/* Explicit DEMO DATA Warning Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/35 bg-amber-500/10 px-5 py-4">
        <div className="flex items-start sm:items-center gap-3">
          <FlaskConical className="h-5 w-5 shrink-0 text-amber-300" />
          <div>
            <p className="text-sm font-semibold text-amber-100">
              DEMO DATA ONLY — No Live Model or Database Telemetry
            </p>
            <p className="text-xs text-amber-200/80">
              All precision, recall, clarity gain, and latency numbers below are
              illustrative synthetic figures prepared for the future FastAPI
              evaluation endpoint.
            </p>
          </div>
        </div>
        <Badge tone="amber">DEMO DATA</Badge>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {dataset.overview.map((metric) => (
          <Card key={metric.label} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-400">
                {metric.label}
              </span>
              <Badge tone="cyan">DEMO DATA</Badge>
            </div>
            <p className="font-mono text-3xl font-bold text-white">
              {metric.value}
            </p>
            <p className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>{metric.delta}</span>
            </p>
            <p className="text-[11px] text-slate-400">{metric.note}</p>
          </Card>
        ))}
      </div>

      {/* Recharts Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-white">
                Category Precision / Recall / F1
              </h3>
              <p className="text-xs text-slate-400">
                Simulated span detection accuracy by ambiguity taxonomy
              </p>
            </div>
            <Badge tone="amber">DEMO DATA</Badge>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dataset.categoryPerformance}
                margin={{ top: 10, right: 12, left: -16, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(148,163,184,0.12)"
                />
                <XAxis
                  dataKey="category"
                  tick={{ fill: '#cbd5e1', fontSize: 11 }}
                />
                <YAxis
                  domain={[60, 100]}
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0a0f1f',
                    borderColor: 'rgba(255,255,255,0.14)',
                    borderRadius: '12px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="precision" name="Precision %" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="recall" name="Recall %" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                <Bar dataKey="f1" name="F1 %" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-white">
                Clarity Progression Across Turns
              </h3>
              <p className="text-xs text-slate-400">
                ResolveX vs. Single-Turn LLM vs. Raw Prompt (Synthetic Eval)
              </p>
            </div>
            <Badge tone="amber">DEMO DATA</Badge>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={dataset.baselineComparison}
                margin={{ top: 10, right: 16, left: -16, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(148,163,184,0.12)"
                />
                <XAxis
                  dataKey="turn"
                  tick={{ fill: '#cbd5e1', fontSize: 11 }}
                />
                <YAxis
                  domain={[20, 100]}
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0a0f1f',
                    borderColor: 'rgba(255,255,255,0.14)',
                    borderRadius: '12px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line
                  type="monotone"
                  dataKey="resolveXPipeline"
                  name="ResolveX Pipeline"
                  stroke="#06b6d4"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="singleTurnLLM"
                  name="Single-Turn LLM"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="rawPromptClarity"
                  name="Raw Prompt Baseline"
                  stroke="#64748b"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Latency + Cases Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-white">
                Simulated Stage Latency (ms)
              </h3>
              <p className="text-xs text-slate-400">
                Target per-stage FastAPI budget
              </p>
            </div>
            <Badge tone="amber">DEMO DATA</Badge>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dataset.latencyDistribution}
                layout="vertical"
                margin={{ top: 5, right: 16, left: 20, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(148,163,184,0.12)"
                />
                <XAxis
                  type="number"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                />
                <YAxis
                  dataKey="stage"
                  type="category"
                  width={120}
                  tick={{ fill: '#cbd5e1', fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0a0f1f',
                    borderColor: 'rgba(255,255,255,0.14)',
                    borderRadius: '12px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <Bar
                  dataKey="latencyMs"
                  name="Latency (ms)"
                  fill="#06b6d4"
                  radius={[0, 6, 6, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card padding="none" className="lg:col-span-7 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-white">
                Sample Benchmark Cases
              </h3>
              <Badge tone="amber">DEMO DATA</Badge>
            </div>
            <div className="flex gap-1.5">
              {(['All', 'Resolved', 'Needs Review'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilter(tab)}
                  className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    filter === tab
                      ? 'bg-violet-500/25 text-white border border-violet-400/40'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[540px] text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3">Case</th>
                  <th className="px-4 py-3">Primary Type</th>
                  <th className="px-4 py-3">Spans</th>
                  <th className="px-4 py-3">Clarity</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {filteredCases.map((row) => (
                  <tr key={row.id} className="hover:bg-white/3">
                    <td className="px-4 py-3">
                      <span className="font-mono text-[11px] text-cyan-300">
                        {row.id}
                      </span>
                      <p className="text-xs text-slate-300 mt-0.5">
                        {row.promptSnippet}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-300">
                      {row.category}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-300">
                      {row.detectedSpans}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-emerald-300">
                      {row.finalClarity}%
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={row.status === 'Resolved' ? 'emerald' : 'amber'}
                      >
                        {row.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}
