import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, RotateCcw, Server, Shield, Sliders, Trash2, UserCog } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Badge } from "@/components/resolvex/Badge";
import { Button } from "@/components/resolvex/Button";
import { Card } from "@/components/resolvex/Card";
import { DemoBanner } from "@/components/resolvex/DemoBanner";
import { SectionHeader } from "@/components/resolvex/SectionHeader";
import { ENV_CONFIG } from "@/config/env";
import { useResolveX } from "@/context/useResolveX";
import { DEMO_ROLES } from "@/data/inventoryMockData";
import { resolveXService } from "@/services/api";
import type {
  BackendHealthStatus,
  DomainContext,
  StrictnessLevel,
  UserDemoRole,
} from "@/types/resolvex";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

const DOMAINS: DomainContext[] = [
  "Software Engineering",
  "Data & Analytics",
  "Enterprise Support",
  "Product & Ops",
  "General",
];

const STRICTNESS: StrictnessLevel[] = ["Balanced", "Strict", "Exploratory"];

function SettingsPage() {
  const {
    settings,
    updateSettings,
    resetSettings,
    clearHistory,
    activeRole,
    setActiveRole,
    backendHealth,
  } = useResolveX();

  const [apiUrlInput, setApiUrlInput] = useState(settings.apiBaseUrl);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [historyClearedNotice, setHistoryClearedNotice] = useState(false);
  const [healthPreview, setHealthPreview] = useState<BackendHealthStatus | null>(backendHealth);
  const [isTestingHealth, setIsTestingHealth] = useState(false);

  const handleSaveApiConfig = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = apiUrlInput.trim();
    if (!trimmed) {
      setUrlError("API Base URL cannot be empty.");
      return;
    }
    try {
      new URL(trimmed);
    } catch {
      setUrlError("Enter a valid URL such as http://localhost:8000");
      return;
    }
    setUrlError(null);
    updateSettings({ apiBaseUrl: trimmed.replace(/\/+$/, "") });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const handlePreviewConnection = async () => {
    setIsTestingHealth(true);
    try {
      const status = await resolveXService.previewBackendConnection(
        apiUrlInput,
        settings.integrationMode,
      );
      setHealthPreview(status);
    } finally {
      setIsTestingHealth(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 space-y-8">
      <SectionHeader
        eyebrow="Configuration"
        title="Settings, Demo Role & FastAPI Readiness"
        description="Configure client-side detection defaults, active PS2 demo persona, motion preferences, and target VITE_API_BASE_URL for future backend integration."
        actions={
          <Button
            variant="secondary"
            iconLeft={<RotateCcw className="h-4 w-4" />}
            onClick={() => {
              resetSettings();
              setApiUrlInput(ENV_CONFIG.apiBaseUrl);
              setUrlError(null);
              setHealthPreview(null);
            }}
          >
            Reset Defaults
          </Button>
        }
      />

      <DemoBanner compact />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* API Readiness Card */}
        <Card className="space-y-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-cyan-400" />
              <h3 className="text-base font-semibold text-white">API Endpoint Configuration</h3>
            </div>
            <Badge tone={settings.integrationMode === "live" ? "emerald" : "amber"}>
              {settings.integrationMode === "live" ? "Live FastAPI Backend" : "Local Mock Mode"}
            </Badge>
          </div>

          <form onSubmit={handleSaveApiConfig} className="space-y-4">
            <div>
              <label
                htmlFor="api-base-url"
                className="mb-1.5 block text-xs font-medium text-slate-300"
              >
                VITE_API_BASE_URL (Env Default: {ENV_CONFIG.apiBaseUrl})
              </label>
              <input
                id="api-base-url"
                type="text"
                value={apiUrlInput}
                onChange={(e) => {
                  setApiUrlInput(e.target.value);
                  if (urlError) setUrlError(null);
                }}
                placeholder="http://localhost:8000"
                className="w-full rounded-xl border border-white/12 bg-[#050814]/85 px-3.5 py-2.5 font-mono text-sm text-slate-100 focus:border-cyan-400/60 focus:outline-none"
              />
              {urlError && <p className="mt-1.5 text-xs text-rose-300">{urlError}</p>}
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-slate-300">
                Execution Mode
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                {(
                  [
                    { id: "live", label: "Live FastAPI + Gemini" },
                    { id: "mock", label: "Offline Mock Fallback" },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => updateSettings({ integrationMode: mode.id })}
                    className={`cursor-pointer rounded-xl border px-3 py-2.5 text-xs font-medium transition-all ${
                      settings.integrationMode === mode.id
                        ? "border-cyan-400/60 bg-cyan-500/15 text-white"
                        : "border-white/10 bg-white/4 text-slate-300 hover:border-white/25"
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button type="submit" size="sm">
                Save Endpoint
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                isLoading={isTestingHealth}
                onClick={() => void handlePreviewConnection()}
              >
                Test Backend Health (/health)
              </Button>
              {savedNotice && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Saved
                </span>
              )}
            </div>
          </form>

          {healthPreview && (
            <div
              className={`rounded-xl border p-3.5 space-y-1 text-xs ${
                healthPreview.reachable
                  ? "border-emerald-500/35 bg-emerald-950/20"
                  : "border-rose-500/35 bg-rose-950/20"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="font-mono text-cyan-300">{healthPreview.baseUrl}</p>
                <Badge tone={healthPreview.reachable ? "emerald" : "rose"}>
                  {healthPreview.reachable ? "REACHABLE" : "UNREACHABLE"}
                </Badge>
              </div>
              <p className="text-slate-200">{healthPreview.message}</p>
            </div>
          )}
        </Card>

        {/* Detection & UI Preferences */}
        <Card className="space-y-5">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-violet-400" />
            <h3 className="text-base font-semibold text-white">
              Detection &amp; Interface Preferences
            </h3>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="default-domain"
                  className="mb-1.5 block text-xs font-medium text-slate-300"
                >
                  Default Domain
                </label>
                <select
                  id="default-domain"
                  value={settings.defaultDomain}
                  onChange={(e) =>
                    updateSettings({
                      defaultDomain: e.target.value as DomainContext,
                    })
                  }
                  className="w-full rounded-xl border border-white/12 bg-[#050814]/85 px-3 py-2 text-xs sm:text-sm text-slate-100 focus:border-cyan-400/60 focus:outline-none"
                >
                  {DOMAINS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="default-strictness"
                  className="mb-1.5 block text-xs font-medium text-slate-300"
                >
                  Default Sensitivity
                </label>
                <select
                  id="default-strictness"
                  value={settings.defaultStrictness}
                  onChange={(e) =>
                    updateSettings({
                      defaultStrictness: e.target.value as StrictnessLevel,
                    })
                  }
                  className="w-full rounded-xl border border-white/12 bg-[#050814]/85 px-3 py-2 text-xs sm:text-sm text-slate-100 focus:border-cyan-400/60 focus:outline-none"
                >
                  {STRICTNESS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <label htmlFor="threshold-range" className="font-medium text-slate-300">
                  Clarification Trigger Threshold
                </label>
                <span className="font-mono text-cyan-300">{settings.ambiguityThreshold}%</span>
              </div>
              <input
                id="threshold-range"
                type="range"
                min={30}
                max={90}
                step={5}
                value={settings.ambiguityThreshold}
                onChange={(e) =>
                  updateSettings({
                    ambiguityThreshold: Number(e.target.value),
                  })
                }
                className="w-full accent-cyan-400"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium text-slate-300">
                  Max Clarification Questions per Prompt
                </span>
                <span className="font-mono text-violet-300">
                  {settings.maxClarificationQuestions}
                </span>
              </div>
              <div className="flex gap-2">
                {[2, 3, 4, 5].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => updateSettings({ maxClarificationQuestions: count })}
                    className={`flex-1 cursor-pointer rounded-lg border py-1.5 font-mono text-xs transition-all ${
                      settings.maxClarificationQuestions === count
                        ? "border-violet-400/60 bg-violet-500/20 text-white"
                        : "border-white/10 bg-white/4 text-slate-400 hover:text-white"
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5 pt-2 border-t border-white/10">
              <label className="flex cursor-pointer items-center justify-between gap-3 text-xs sm:text-sm text-slate-200">
                <span>Show classifier confidence scores on spans</span>
                <input
                  type="checkbox"
                  checked={settings.showTokenConfidence}
                  onChange={(e) => updateSettings({ showTokenConfidence: e.target.checked })}
                  className="h-4 w-4 accent-cyan-400"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between gap-3 text-xs sm:text-sm text-slate-200">
                <span>Reduce page transition &amp; 3D animations</span>
                <input
                  type="checkbox"
                  checked={settings.reduceMotion}
                  onChange={(e) => updateSettings({ reduceMotion: e.target.checked })}
                  className="h-4 w-4 accent-violet-500"
                />
              </label>
            </div>

            <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
              {historyClearedNotice ? (
                <span className="text-xs text-emerald-300">Local session history cleared.</span>
              ) : (
                <span className="text-[11px] text-slate-400">
                  Stored only in browser localStorage
                </span>
              )}
              <Button
                size="sm"
                variant="outline"
                iconLeft={<Trash2 className="h-3.5 w-3.5 text-rose-400" />}
                onClick={() => {
                  clearHistory();
                  setHistoryClearedNotice(true);
                  setTimeout(() => setHistoryClearedNotice(false), 2000);
                }}
              >
                Clear Local Session History
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Role-Based Demo Persona + About ResolveX */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <UserCog className="h-4 w-4 text-cyan-400" />
              <h3 className="text-base font-semibold text-white">
                PS2 Inventory Role-Based Demo View
              </h3>
            </div>
            <Badge tone="violet">No Login Required</Badge>
          </div>
          <p className="text-xs text-slate-400">
            Switch personas to tailor Smart Inventory Intelligence, approvals, and shared AI
            Assistant priorities across the unified suite.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {DEMO_ROLES.map((item) => {
              const isSelected = activeRole === item.role;
              return (
                <button
                  key={item.role}
                  type="button"
                  onClick={() => {
                    const role = item.role as UserDemoRole;
                    setActiveRole(role);
                    updateSettings({ defaultRole: role });
                  }}
                  className={`cursor-pointer rounded-xl border p-3.5 text-left transition-all ${
                    isSelected
                      ? "border-cyan-400/60 bg-cyan-500/12"
                      : "border-white/10 bg-[#050814]/70 hover:border-white/25"
                  }`}
                >
                  <p className="text-xs font-semibold text-white">{item.role}</p>
                  <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">{item.headline}</p>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="lg:col-span-5 space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-emerald-400" />
            <h3 className="text-base font-semibold text-white">About {ENV_CONFIG.appName}</h3>
          </div>
          <p className="text-xs leading-relaxed text-slate-300">
            {ENV_CONFIG.appName} v{ENV_CONFIG.appVersion} unifies{" "}
            <strong className="text-white">PS6 Natural Language Ambiguity Resolution</strong> and{" "}
            <strong className="text-white">PS2 Smart Inventory Intelligence</strong> in one coherent
            workspace.
          </p>
          <div className="rounded-xl border border-white/10 bg-[#050814]/80 p-3 text-[11px] text-slate-400 space-y-1">
            <p>• Connected to FastAPI + SQLite + Google Gemini API (key kept strictly in backend/.env).</p>
            <p>• Role switching uses demo-level <code>X-User-Role</code> headers (not production auth).</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
