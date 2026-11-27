import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  Bell,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FolderGit2,
  GitBranch,
  HelpCircle,
  Home,
  LayoutDashboard,
  Menu,
  MessageSquareMore,
  Package,
  PlusCircle,
  Search,
  SearchCheck,
  Settings,
  Sparkles,
  UserCheck,
  X,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { SharedAIAssistant } from "@/components/assistant/SharedAIAssistant";
import { Badge } from "@/components/resolvex/Badge";
import { useResolveX } from "@/context/useResolveX";
import { DEMO_ROLES } from "@/data/inventoryMockData";
import type { UserDemoRole } from "@/types/resolvex";
import { Footer } from "./Footer";
import { PipelineStepper } from "./PipelineStepper";

const PIPELINE_ROUTES = new Set([
  "/analysis",
  "/visualization",
  "/interpretations",
  "/clarification",
  "/resolution",
]);

const PS6_NAV = [
  { to: "/workspace", label: "Workspace", icon: LayoutDashboard },
  { to: "/analysis", label: "Analysis", icon: SearchCheck },
  { to: "/visualization", label: "Context Graph", icon: Eye },
  { to: "/interpretations", label: "What-If Simulator", icon: GitBranch },
  { to: "/clarification", label: "Clarification", icon: MessageSquareMore },
  { to: "/resolution", label: "Resolution", icon: CheckCircle2 },
] as const;

const PS2_NAV = [{ to: "/inventory", label: "Inventory & CRD Hub", icon: Package }] as const;

const PLATFORM_NAV = [
  { to: "/evaluation", label: "Unified Analytics", icon: BarChart3 },
  { to: "/how-it-works", label: "How It Works", icon: HelpCircle },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function UnifiedAppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const {
    activeRole,
    setActiveRole,
    materials,
    orders,
    sessionHistory,
    loadHistorySession,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    globalSearchQuery,
    setGlobalSearchQuery,
    setAssistantOpen,
    settings,
  } = useResolveX();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [landingMenuOpen, setLandingMenuOpen] = useState(false);

  const isLanding = pathname === "/";
  const showStepper = PIPELINE_ROUTES.has(pathname);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const searchResults = useMemo(() => {
    const q = globalSearchQuery.trim().toLowerCase();
    if (!q) return [];
    const items: Array<{ label: string; sub: string; route: string }> = [];

    for (const m of materials) {
      if (
        m.sku.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.health.toLowerCase().includes(q)
      ) {
        items.push({
          label: `${m.sku} — ${m.name}`,
          sub: `Material • ${m.available} avail (${m.health})`,
          route: "/inventory",
        });
      }
    }

    for (const o of orders) {
      if (o.orderNumber.toLowerCase().includes(q) || o.customer.toLowerCase().includes(q)) {
        items.push({
          label: `${o.orderNumber} — ${o.customer}`,
          sub: `Order • CRD ${o.crdDate} (${o.crdRisk})`,
          route: "/inventory",
        });
      }
    }

    for (const s of sessionHistory) {
      if (s.prompt.toLowerCase().includes(q)) {
        items.push({
          label: s.prompt,
          sub: `Session • ${s.ambiguityScore}% ambiguity`,
          route: "/analysis",
        });
      }
    }

    return items.slice(0, 6);
  }, [globalSearchQuery, materials, orders, sessionHistory]);

  // Clean SaaS Landing Shell
  if (isLanding) {
    return (
      <div className="relative min-h-screen flex flex-col bg-[#050814] text-slate-100">
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="bg-grid-pattern absolute inset-0 opacity-60" />
          <div className="absolute -top-40 left-1/4 h-[460px] w-[460px] rounded-full bg-violet-700/18 blur-[120px]" />
          <div className="absolute top-1/3 -right-24 h-[420px] w-[420px] rounded-full bg-cyan-500/14 blur-[120px]" />
        </div>

        <header className="sticky top-0 z-40 border-b border-white/10 bg-[#050814]/80 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <Link to="/" className="flex items-center gap-2.5 text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 shadow-lg shadow-violet-500/25">
                <Sparkles className="h-4 w-4 text-white" />
              </span>
              <span className="text-lg font-semibold tracking-tight">
                Resolve<span className="text-cyan-400">X</span>
              </span>
            </Link>

            <nav className="hidden lg:flex items-center gap-6 text-sm font-medium">
              <Link to="/" className="text-cyan-300">
                Home
              </Link>
              <Link to="/workspace" className="text-slate-300 hover:text-white">
                Workspace
              </Link>
              <Link to="/inventory" className="text-slate-300 hover:text-white">
                Inventory Hub
              </Link>
              <Link to="/how-it-works" className="text-slate-300 hover:text-white">
                How It Works
              </Link>
              <Link to="/evaluation" className="text-slate-300 hover:text-white">
                Evaluation
              </Link>
              <Link to="/settings" className="text-slate-300 hover:text-white">
                Settings
              </Link>
            </nav>

            <div className="hidden lg:flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setAssistantOpen(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/12 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-400/50 hover:text-white transition-colors"
              >
                <Bot className="h-3.5 w-3.5 text-cyan-400" />
                <span>AI Assistant</span>
              </button>
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white"
              >
                <FolderGit2 className="h-3.5 w-3.5" />
                <span>GitHub</span>
              </a>
              <Link
                to="/workspace"
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-violet-500/20"
              >
                <Activity className="h-3.5 w-3.5" />
                <span>Get Started</span>
              </Link>
            </div>

            <button
              type="button"
              onClick={() => setLandingMenuOpen((p) => !p)}
              aria-label="Toggle menu"
              className="lg:hidden cursor-pointer rounded-lg border border-white/10 bg-white/5 p-2 text-slate-200"
            >
              {landingMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

          {landingMenuOpen && (
            <div className="lg:hidden border-t border-white/10 bg-[#070b1a] px-4 py-4 grid grid-cols-2 gap-2 text-sm">
              <Link
                to="/workspace"
                onClick={() => setLandingMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-slate-200 hover:bg-white/5"
              >
                Workspace
              </Link>
              <Link
                to="/inventory"
                onClick={() => setLandingMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-slate-200 hover:bg-white/5"
              >
                Inventory Hub
              </Link>
              <Link
                to="/how-it-works"
                onClick={() => setLandingMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-slate-200 hover:bg-white/5"
              >
                How It Works
              </Link>
              <Link
                to="/evaluation"
                onClick={() => setLandingMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-slate-200 hover:bg-white/5"
              >
                Evaluation
              </Link>
              <Link
                to="/settings"
                onClick={() => setLandingMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-slate-200 hover:bg-white/5"
              >
                Settings
              </Link>
              <button
                type="button"
                onClick={() => {
                  setLandingMenuOpen(false);
                  setAssistantOpen(true);
                }}
                className="rounded-lg px-3 py-2 text-left text-cyan-300 hover:bg-white/5"
              >
                AI Assistant
              </button>
            </div>
          )}
        </header>

        <main className="flex-1">{children}</main>
        <Footer />
        <SharedAIAssistant />
      </div>
    );
  }

  // Unified Studio + Inventory Intelligence Dashboard Shell
  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div className="flex h-full flex-col justify-between p-3">
      <div className="space-y-5">
        {/* Brand */}
        <div className="flex items-center justify-between px-1">
          <Link
            to="/"
            onClick={() => isMobile && setMobileSidebarOpen(false)}
            className="flex items-center gap-2.5 text-white"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500">
              <Sparkles className="h-4 w-4 text-white" />
            </span>
            {(!collapsed || isMobile) && (
              <span className="text-base font-semibold tracking-tight">
                Resolve<span className="text-cyan-400">X</span>
              </span>
            )}
          </Link>

          {!isMobile && (
            <button
              type="button"
              onClick={() => setCollapsed((p) => !p)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-white/8 hover:text-white"
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          )}
        </div>

        {/* New Analysis CTA */}
        <Link
          to="/workspace"
          onClick={() => isMobile && setMobileSidebarOpen(false)}
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 px-3 py-2 text-xs font-semibold text-white shadow-md shadow-violet-500/20 hover:from-violet-500 hover:to-cyan-400"
        >
          <PlusCircle className="h-4 w-4 shrink-0" />
          {(!collapsed || isMobile) && <span>New Analysis</span>}
        </Link>

        {/* Language & Intent */}
        <div className="space-y-1">
          {(!collapsed || isMobile) && (
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Language &amp; Intent
            </p>
          )}
          {PS6_NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => isMobile && setMobileSidebarOpen(false)}
                className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium transition-colors ${
                  active
                    ? "bg-violet-500/20 text-cyan-200 border border-violet-400/30"
                    : "text-slate-300 hover:bg-white/6 hover:text-white"
                }`}
                title={item.label}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {(!collapsed || isMobile) && <span>{item.label}</span>}
              </Link>
            );
          })}
        </div>

        {/* Inventory & Operations */}
        <div className="space-y-1">
          {(!collapsed || isMobile) && (
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Inventory &amp; Operations
            </p>
          )}
          {PS2_NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => isMobile && setMobileSidebarOpen(false)}
                className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium transition-colors ${
                  active
                    ? "bg-cyan-500/20 text-cyan-200 border border-cyan-400/35"
                    : "text-slate-300 hover:bg-white/6 hover:text-white"
                }`}
                title={item.label}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {(!collapsed || isMobile) && <span>{item.label}</span>}
              </Link>
            );
          })}
        </div>

        {/* Platform */}
        <div className="space-y-1">
          {(!collapsed || isMobile) && (
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Platform
            </p>
          )}
          <Link
            to="/"
            onClick={() => isMobile && setMobileSidebarOpen(false)}
            className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-300 hover:bg-white/6 hover:text-white"
          >
            <Home className="h-4 w-4 shrink-0" />
            {(!collapsed || isMobile) && <span>Landing Hero</span>}
          </Link>
          {PLATFORM_NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => isMobile && setMobileSidebarOpen(false)}
                className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium transition-colors ${
                  active
                    ? "bg-violet-500/20 text-cyan-200 border border-violet-400/30"
                    : "text-slate-300 hover:bg-white/6 hover:text-white"
                }`}
                title={item.label}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {(!collapsed || isMobile) && <span>{item.label}</span>}
              </Link>
            );
          })}
        </div>

        {/* Recent Sessions Quick List */}
        {(!collapsed || isMobile) && sessionHistory.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-white/8">
            <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Recent Sessions
            </p>
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {sessionHistory.slice(0, 3).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={async () => {
                    await loadHistorySession(s);
                    if (isMobile) setMobileSidebarOpen(false);
                    void navigate({ to: "/analysis" });
                  }}
                  className="w-full cursor-pointer rounded-lg px-2 py-1.5 text-left text-[11px] text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-colors"
                >
                  <p className="truncate text-slate-200">{s.prompt}</p>
                  <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                    <Clock className="h-2.5 w-2.5" />
                    {s.ambiguityScore}% ambig.
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Role Profile Footer */}
      {(!collapsed || isMobile) && (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/4 p-2.5 space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-300">
              <UserCheck className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-white">{activeRole}</p>
              <p className="text-[10px] text-slate-400">Demo Persona Active</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="relative min-h-screen flex bg-[#050814] text-slate-100">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="bg-grid-pattern absolute inset-0 opacity-50" />
        <div className="absolute -top-40 left-1/4 h-[440px] w-[440px] rounded-full bg-violet-700/16 blur-[120px]" />
        <div className="absolute top-1/3 -right-24 h-[400px] w-[400px] rounded-full bg-cyan-500/12 blur-[120px]" />
      </div>

      {/* Desktop Collapsible Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 border-r border-white/10 bg-[#060a18]/90 backdrop-blur-xl transition-all duration-200 ${
          collapsed ? "w-[68px]" : "w-64"
        }`}
      >
        <div className="sticky top-0 h-screen overflow-y-auto">
          <SidebarContent />
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside className="relative z-10 w-68 border-r border-white/10 bg-[#060a18] overflow-y-auto">
            <SidebarContent isMobile />
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Unified Top Navigation Bar */}
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#050814]/85 backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                aria-label="Open navigation sidebar"
                className="lg:hidden cursor-pointer rounded-lg border border-white/10 bg-white/5 p-2 text-slate-200"
              >
                <Menu className="h-4 w-4" />
              </button>

              {/* Global Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={globalSearchQuery}
                  onChange={(e) => setGlobalSearchQuery(e.target.value)}
                  placeholder="Search SKUs, orders, or language sessions..."
                  className="w-full rounded-xl border border-white/10 bg-[#0a0f1f]/90 py-1.5 pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none"
                />

                {searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 rounded-xl border border-white/12 bg-[#070b1a] p-1.5 shadow-2xl z-50">
                    {searchResults.map((res, idx) => (
                      <button
                        key={`${res.label}-${idx}`}
                        type="button"
                        onClick={() => {
                          setGlobalSearchQuery("");
                          void navigate({ to: res.route as "/" });
                        }}
                        className="w-full cursor-pointer rounded-lg px-3 py-2 text-left hover:bg-white/6 transition-colors"
                      >
                        <p className="truncate text-xs font-medium text-white">{res.label}</p>
                        <p className="text-[10px] text-cyan-300">{res.sub}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Controls: Role Switcher, Notifications, Shared AI Assistant */}
            <div className="flex items-center gap-2 sm:gap-3">
              <select
                aria-label="Active demo role"
                value={activeRole}
                onChange={(e) => setActiveRole(e.target.value as UserDemoRole)}
                className="hidden sm:block rounded-xl border border-white/12 bg-[#0a0f1f] px-2.5 py-1.5 text-xs font-medium text-slate-200 focus:border-cyan-400/60 focus:outline-none"
              >
                {DEMO_ROLES.map((r) => (
                  <option key={r.role} value={r.role}>
                    {r.role}
                  </option>
                ))}
              </select>

              {/* Notifications */}
              <div className="relative">
                <button
                  type="button"
                  aria-label="Toggle notifications"
                  onClick={() => setNotifOpen((p) => !p)}
                  className="relative cursor-pointer rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 hover:border-white/25 hover:text-white"
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 font-mono text-[10px] font-bold text-white">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl border border-white/12 bg-[#070b1a] p-3 shadow-2xl z-50 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white">
                        Unified Alerts ({unreadCount} unread)
                      </span>
                      <button
                        type="button"
                        onClick={markAllNotificationsRead}
                        className="cursor-pointer text-[11px] text-cyan-300 hover:underline"
                      >
                        Mark all read
                      </button>
                    </div>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            markNotificationRead(n.id);
                            setNotifOpen(false);
                            void navigate({ to: n.route as "/" });
                          }}
                          className={`w-full cursor-pointer rounded-xl border p-2.5 text-left transition-colors ${
                            n.read
                              ? "border-white/6 bg-white/2 opacity-70"
                              : "border-white/12 bg-white/6 hover:border-cyan-400/40"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <Badge
                              tone={
                                n.severity === "critical"
                                  ? "rose"
                                  : n.severity === "warning"
                                    ? "amber"
                                    : "cyan"
                              }
                            >
                              {n.category}
                            </Badge>
                          </div>
                          <p className="text-xs font-semibold text-white">{n.title}</p>
                          <p className="mt-0.5 text-[11px] text-slate-400">{n.detail}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Shared AI Assistant */}
              <button
                type="button"
                onClick={() => setAssistantOpen(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600/80 to-cyan-500/80 px-3 py-1.5 text-xs font-semibold text-white border border-white/15 hover:from-violet-500 hover:to-cyan-400 transition-all"
              >
                <Bot className="h-3.5 w-3.5" />
                <span className="hidden md:inline">AI Assistant</span>
              </button>
            </div>
          </div>
        </header>

        {showStepper && <PipelineStepper />}

        <main className="flex-1">
          <motion.div
            key={pathname}
            initial={settings.reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: settings.reduceMotion ? 0 : 0.22 }}
          >
            {children}
          </motion.div>
        </main>

        <Footer />
      </div>

      <SharedAIAssistant />
    </div>
  );
}
