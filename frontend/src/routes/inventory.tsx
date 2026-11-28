import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bell,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Loader2,
  Package,
  Pencil,
  RefreshCw,
  Search,
  ShoppingCart,
  Sparkles,
  UserCheck,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge, type BadgeTone } from "@/components/resolvex/Badge";
import { Button } from "@/components/resolvex/Button";
import { Card } from "@/components/resolvex/Card";
import { DemoBanner } from "@/components/resolvex/DemoBanner";
import { SectionHeader } from "@/components/resolvex/SectionHeader";
import { useResolveX } from "@/context/useResolveX";
import { DEMO_ROLES } from "@/data/inventoryMockData";
import { resolveXService } from "@/services/api";
import type {
  BackendMaterialOverview,
  BackendOrderRiskItem,
  BackendPurchaseOrderProposal,
  UserDemoRole,
} from "@/types/resolvex";

export const Route = createFileRoute("/inventory")({
  component: InventoryHubPage,
});

type InventoryTab = "materials" | "orders" | "recommendations" | "approvals";

const STOCK_TONE: Record<BackendMaterialOverview["stock_status"], BadgeTone> = {
  HEALTHY: "emerald",
  LOW_STOCK: "amber",
  OUT_OF_STOCK: "rose",
};

const RISK_TONE: Record<BackendOrderRiskItem["risk_category"], BadgeTone> = {
  ON_TRACK: "emerald",
  AT_RISK: "amber",
  DELAYED: "rose",
  BLOCKED: "rose",
};

const PROPOSAL_TONE: Record<BackendPurchaseOrderProposal["status"], BadgeTone> = {
  PENDING_APPROVAL: "amber",
  APPROVED: "emerald",
  REJECTED: "rose",
  CANCELLED: "slate",
};

function InventoryHubPage() {
  const navigate = useNavigate();
  const {
    activeRole,
    setActiveRole,
    isLoadingInventory,
    ps2Error,
    backendInventoryOverview,
    backendOrderRisks,
    backendShortages,
    backendProposals,
    backendAlerts,
    backendBriefing,
    refreshInventoryData,
    generatePoProposals,
    recalculateInventoryAllocations,
    ingestInventoryEvent,
    updateMaterialStock,
    acknowledgeBackendAlert,
    decidePoProposal,
    runAnalysis,
    setAssistantOpen,
    settings,
  } = useResolveX();

  const roleConfig = DEMO_ROLES.find((r) => r.role === activeRole) ?? DEMO_ROLES[0];
  const [activeTab, setActiveTab] = useState<InventoryTab>(roleConfig?.primaryTab ?? "materials");
  const [stockFilter, setStockFilter] = useState<BackendMaterialOverview["stock_status"] | "All">(
    "All",
  );
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [serverSearchResults, setServerSearchResults] = useState<BackendMaterialOverview[] | null>(
    null,
  );
  const [actionFeedback, setActionFeedback] = useState<{
    tone: "emerald" | "rose" | "amber";
    message: string;
  } | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<BackendMaterialOverview | null>(null);
  const [editOnHand, setEditOnHand] = useState<string>("0");
  const [editIncoming, setEditIncoming] = useState<string>("0");
  const [editThreshold, setEditThreshold] = useState<string>("0");
  const [editReason, setEditReason] = useState<string>("");
  const [editError, setEditError] = useState<string | null>(null);

  const materials = backendInventoryOverview?.materials ?? [];
  const categories = useMemo(
    () => [
      "All",
      ...Array.from(new Set(materials.map((m) => m.category || "General"))).sort(),
    ],
    [materials],
  );

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setServerSearchResults(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      resolveXService
        .searchInventoryMaterials(q, categoryFilter, settings.apiBaseUrl)
        .then((res) => {
          if (!cancelled) setServerSearchResults(res);
        })
        .catch(() => {
          if (!cancelled) setServerSearchResults(null);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, categoryFilter, settings.apiBaseUrl]);

  const totalOnHand = materials.reduce((sum, m) => sum + m.on_hand, 0);
  const totalIncoming = materials.reduce((sum, m) => sum + m.incoming, 0);
  const shortageCount = backendShortages.length;
  const crdRiskCount = backendOrderRisks.filter((o) => o.risk_category !== "ON_TRACK").length;
  const pendingProposalsCount = backendProposals.filter(
    (p) => p.status === "PENDING_APPROVAL",
  ).length;
  const unackAlerts = backendAlerts.filter((a) => !a.acknowledged);

  const baseList = useMemo(() => {
    if (serverSearchResults !== null && searchQuery.trim()) return serverSearchResults;
    const q = searchQuery.trim().toLowerCase();
    return materials.filter((m) => {
      if (categoryFilter !== "All" && (m.category || "General") !== categoryFilter) return false;
      if (!q) return true;
      return (
        m.id.toLowerCase().includes(q) ||
        m.sku.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        (m.category || "").toLowerCase().includes(q) ||
        (m.aliases ?? []).some((a) => a.toLowerCase().includes(q))
      );
    });
  }, [serverSearchResults, searchQuery, materials, categoryFilter]);

  const filteredMaterials = baseList.filter((m) =>
    stockFilter === "All" ? true : m.stock_status === stockFilter,
  );

  const handleDisambiguateOrder = async (text: string) => {
    try {
      await runAnalysis(text, "Supply Chain & Inventory", "Balanced");
      void navigate({ to: "/analysis" });
    } catch {
      // surfaced in context
    }
  };

  const openStockEditor = (mat: BackendMaterialOverview) => {
    setEditingMaterial(mat);
    setEditOnHand(String(mat.on_hand));
    setEditIncoming(String(mat.incoming));
    setEditThreshold(String(mat.reorder_threshold));
    setEditReason("");
    setEditError(null);
  };

  const handleSaveStockEdit = async () => {
    if (!editingMaterial || isMutating) return;
    const onHandNum = Number(editOnHand);
    const incomingNum = Number(editIncoming);
    const thresholdNum = Number(editThreshold);
    if (
      !Number.isFinite(onHandNum) ||
      !Number.isFinite(incomingNum) ||
      !Number.isFinite(thresholdNum) ||
      onHandNum < 0 ||
      incomingNum < 0 ||
      thresholdNum < 0
    ) {
      setEditError("All stock quantities and thresholds must be valid numbers >= 0.");
      return;
    }
    setIsMutating(true);
    setEditError(null);
    setActionFeedback(null);
    try {
      const updated = await updateMaterialStock(editingMaterial.id, {
        on_hand: onHandNum,
        incoming: incomingNum,
        reorder_threshold: thresholdNum,
        ...(editReason.trim() ? { reason: editReason.trim() } : {}),
        actor: activeRole,
      });
      setEditingMaterial(null);
      setActionFeedback({
        tone: updated.on_hand <= 0 || updated.stock_status === "OUT_OF_STOCK" ? "amber" : "emerald",
        message:
          updated.on_hand <= 0
            ? `Updated ${updated.name} (${updated.sku}): stock set to 0 ${updated.unit} (OUT OF STOCK). Dispatch requests for this item will prompt users to choose another item.`
            : `Updated ${updated.name} (${updated.sku}): on-hand ${updated.on_hand} ${updated.unit}, incoming +${updated.incoming} ${updated.unit} (${updated.stock_status}).`,
      });
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update stock levels.");
    } finally {
      setIsMutating(false);
    }
  };

  const handleGenerateProposals = async () => {
    if (isMutating) return;
    setIsMutating(true);
    setActionFeedback(null);
    try {
      const created = await generatePoProposals();
      setActionFeedback({
        tone: "emerald",
        message:
          created.length > 0
            ? `Generated ${created.length} PENDING_APPROVAL purchase order proposal(s). Human approval is still required before issuing.`
            : "All current material shortages already have PENDING_APPROVAL proposals.",
      });
    } catch (err) {
      setActionFeedback({
        tone: "rose",
        message: err instanceof Error ? err.message : "Failed to generate proposals.",
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleRecalculate = async () => {
    if (isMutating) return;
    setIsMutating(true);
    setActionFeedback(null);
    try {
      await recalculateInventoryAllocations();
      setActionFeedback({
        tone: "emerald",
        message: "Recalculated Earliest-CRD-First allocations and refreshed order delivery risks.",
      });
    } catch (err) {
      setActionFeedback({
        tone: "rose",
        message: err instanceof Error ? err.message : "Failed to recalculate allocations.",
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleProposalDecision = async (proposalId: string, decision: "approve" | "reject") => {
    if (isMutating) return;
    setIsMutating(true);
    setActionFeedback(null);
    try {
      const res = await decidePoProposal(
        proposalId,
        decision,
        `Decision submitted via Inventory Hub as ${activeRole}`,
      );
      setActionFeedback({
        tone: res.ok ? "emerald" : "rose",
        message: res.message,
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleSimulateEvent = async (kind: "receive" | "duplicate" | "malformed") => {
    if (isMutating) return;
    setIsMutating(true);
    setActionFeedback(null);
    try {
      const payload =
        kind === "receive"
          ? {
              event_id: `UI-EVT-${Date.now()}`,
              event_type: "STOCK_RECEIVED",
              entity_ref: "MAT-CHIP",
              payload: { quantity: 10 },
              simulated: true,
            }
          : kind === "duplicate"
            ? {
                event_id: "UI-DUP-TEST-001",
                event_type: "STOCK_RECEIVED",
                entity_ref: "MAT-BOLT",
                payload: { quantity: 5 },
                simulated: true,
              }
            : {
                event_id: `UI-BAD-${Date.now()}`,
                event_type: "STOCK_RECEIVED",
                entity_ref: "MAT-CHIP",
                payload: { quantity: -25 },
                simulated: true,
              };

      const res = await ingestInventoryEvent(payload);
      setActionFeedback({
        tone: res.status === "MALFORMED" ? "amber" : "emerald",
        message: `Event ${res.event_id} → ${res.status}: ${res.message}`,
      });
    } catch (err) {
      setActionFeedback({
        tone: "rose",
        message: err instanceof Error ? err.message : "Event ingestion failed.",
      });
    } finally {
      setIsMutating(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-8">
      <SectionHeader
        eyebrow="Inventory & Operations Hub"
        title="Materials, CRD Risk & Procurement Hub"
        description="Live inventory availability (on-hand + incoming − allocated), earliest-CRD-first allocation, delivery-risk assessment, proactive alerts, and approval-gated purchase orders."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              isLoading={isLoadingInventory}
              iconLeft={<RefreshCw className="h-4 w-4 text-cyan-400" />}
              onClick={() => void refreshInventoryData()}
            >
              Refresh Data
            </Button>
            <Button
              variant="secondary"
              iconLeft={<Bot className="h-4 w-4 text-cyan-400" />}
              onClick={() => setAssistantOpen(true)}
            >
              Ask Inventory AI
            </Button>
            <Button
              onClick={() => void navigate({ to: "/evaluation" })}
              iconRight={<ArrowRight className="h-4 w-4" />}
            >
              Unified Analytics
            </Button>
          </div>
        }
      />

      <DemoBanner compact />

      {ps2Error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-500/12 px-4 py-3 text-xs sm:text-sm text-rose-100"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{ps2Error}</span>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void refreshInventoryData()}>
            Retry
          </Button>
        </div>
      )}

      {actionFeedback && (
        <div
          role="status"
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs sm:text-sm ${
            actionFeedback.tone === "emerald"
              ? "border-emerald-500/35 bg-emerald-500/12 text-emerald-100"
              : actionFeedback.tone === "amber"
                ? "border-amber-500/35 bg-amber-500/12 text-amber-100"
                : "border-rose-500/40 bg-rose-500/12 text-rose-100"
          }`}
        >
          <span>{actionFeedback.message}</span>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="cursor-pointer text-xs underline opacity-80 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Role-Based Demo View Selector */}
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-cyan-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Active Workspace Role Perspective
            </span>
          </div>
          <Badge tone="violet">{activeRole}</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {DEMO_ROLES.map((item) => {
            const isSelected = item.role === activeRole;
            return (
              <button
                key={item.role}
                type="button"
                onClick={() => {
                  setActiveRole(item.role as UserDemoRole);
                  setActiveTab(item.primaryTab);
                }}
                className={`cursor-pointer rounded-xl border p-3.5 text-left transition-all ${
                  isSelected
                    ? "border-cyan-400/65 bg-cyan-500/12 shadow-md shadow-cyan-500/10"
                    : "border-white/10 bg-[#050814]/70 hover:border-violet-400/40"
                }`}
              >
                <p className="text-sm font-semibold text-white">{item.role}</p>
                <p className="mt-1 text-xs text-cyan-300">{item.headline}</p>
                <p className="mt-1 text-[11px] text-slate-400">{item.focusSummary}</p>
              </button>
            );
          })}
        </div>
      </Card>

      {/* AI-Enriched Role Briefing */}
      {backendBriefing && (
        <Card className="border-violet-500/25 bg-violet-950/15 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-white">
                Role Briefing: {backendBriefing.role}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={backendBriefing.ai_enriched ? "emerald" : "amber"}>
                {backendBriefing.ai_enriched ? "AI Enriched (Gemini)" : "Deterministic Summary"}
              </Badge>
              <Badge tone="cyan">Live Database Grounded</Badge>
            </div>
          </div>
          {backendBriefing.ai_summary ? (
            <div className="space-y-1.5 text-xs sm:text-sm leading-relaxed text-slate-200">
              {backendBriefing.ai_summary
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line, idx) => {
                  const isBullet = line.startsWith("* ") || line.startsWith("- ");
                  const cleaned = (isBullet ? line.slice(2) : line).replace(/\*\*/g, "");
                  return isBullet ? (
                    <div key={idx} className="flex items-start gap-2 pl-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
                      <span>{cleaned}</span>
                    </div>
                  ) : (
                    <p key={idx} className="font-medium text-white">
                      {cleaned}
                    </p>
                  );
                })}
            </div>
          ) : (
            <p className="text-xs text-slate-300">
              {backendBriefing.ai_note ??
                `Loaded ${backendBriefing.sections.length} verified briefing sections from the inventory database.`}
            </p>
          )}
        </Card>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total On-Hand / Incoming</span>
            <Package className="h-4 w-4 text-cyan-400" />
          </div>
          <p className="font-mono text-3xl font-bold text-white">
            {totalOnHand.toLocaleString()}{" "}
            <span className="text-sm font-normal text-cyan-300">+{totalIncoming}</span>
          </p>
          <p className="text-xs text-slate-400">
            {backendInventoryOverview?.total_materials ?? 0} tracked raw materials
          </p>
        </Card>

        <Card className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Material Shortages</span>
            <AlertTriangle className="h-4 w-4 text-rose-400" />
          </div>
          <p className="font-mono text-3xl font-bold text-rose-300">{shortageCount}</p>
          <p className="text-xs text-slate-400">
            {backendInventoryOverview?.out_of_stock_count ?? 0} out of stock •{" "}
            {backendInventoryOverview?.low_stock_count ?? 0} low stock
          </p>
        </Card>

        <Card className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>CRD At-Risk Orders</span>
            <Clock className="h-4 w-4 text-amber-400" />
          </div>
          <p className="font-mono text-3xl font-bold text-amber-300">{crdRiskCount}</p>
          <p className="text-xs text-slate-400">Out of {backendOrderRisks.length} OPEN orders</p>
        </Card>

        <Card className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Pending PO Proposals</span>
            <ClipboardCheck className="h-4 w-4 text-violet-400" />
          </div>
          <p className="font-mono text-3xl font-bold text-violet-300">{pendingProposalsCount}</p>
          <p className="text-xs text-slate-400">
            {unackAlerts.length} active alert(s) • HITL approval required
          </p>
        </Card>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
        {(
          [
            { id: "materials", label: `Materials & Net Availability (${materials.length})` },
            { id: "orders", label: `Orders & CRD Risk (${backendOrderRisks.length})` },
            { id: "recommendations", label: `Shortages & Events (${shortageCount})` },
            {
              id: "approvals",
              label: `PO Approvals & Alerts (${pendingProposalsCount} / ${unackAlerts.length})`,
            },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`cursor-pointer rounded-xl border px-3.5 py-2 text-xs sm:text-sm font-medium transition-all ${
              activeTab === tab.id
                ? "border-cyan-400/60 bg-gradient-to-r from-violet-600/30 to-cyan-500/25 text-white"
                : "border-white/10 bg-white/4 text-slate-400 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading Skeleton */}
      {isLoadingInventory && materials.length === 0 && (
        <Card className="flex items-center justify-center gap-2 py-12 text-sm text-cyan-300">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading inventory data...</span>
        </Card>
      )}

      {/* Tab 1: Materials & Net Availability */}
      {activeTab === "materials" && (
        <Card padding="none" className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-white">
                  Material Stock &amp; Net Availability Matrix
                </h3>
                <Badge tone="slate">Seeded Demo Catalog + SQLite Balances</Badge>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Physical Available = On-Hand − Allocated/Reserved • Projected (Net) = On-Hand + Incoming − Allocated
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name, synonym (screw jack), SKU..."
                  aria-label="Search materials"
                  className="w-60 rounded-lg border border-white/12 bg-[#050814]/80 py-1.5 pl-8 pr-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none"
                />
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Filter by category"
                className="rounded-lg border border-white/12 bg-[#050814]/80 px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-400/60 focus:outline-none"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat} className="bg-[#0a0f1f]">
                    {cat === "All" ? "All Categories" : cat}
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap gap-1">
                {(["All", "OUT_OF_STOCK", "LOW_STOCK", "HEALTHY"] as const).map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setStockFilter(h)}
                    className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium ${
                      stockFilter === h
                        ? "bg-violet-500/25 text-white border border-violet-400/40"
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3">Product / Category / Location</th>
                  <th className="px-4 py-3">Physical On-Hand</th>
                  <th className="px-4 py-3">Allocated / Reserved</th>
                  <th className="px-4 py-3">Phys. Available</th>
                  <th className="px-4 py-3">Incoming</th>
                  <th className="px-4 py-3">Projected Net Avail</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Supply Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {filteredMaterials.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-xs text-slate-400">
                      No materials match the current search/filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredMaterials.map((mat) => {
                    const physAvail = mat.physical_available ?? Math.max(0, mat.on_hand - mat.allocated);
                    const binLabel = (mat.warehouse_locations ?? []).join(", ") || "Unassigned";
                    return (
                      <tr
                        key={mat.id}
                        className={`hover:bg-white/3 ${mat.on_hand <= 0 ? "bg-rose-500/5" : ""}`}
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-xs text-cyan-300">
                              {mat.id} • {mat.sku}
                            </span>
                            <Badge tone="slate">{mat.category ?? "General"}</Badge>
                          </div>
                          <p className="font-medium text-white mt-0.5">{mat.name}</p>
                          <p className="text-[11px] text-slate-400">
                            {mat.supplier_name ?? "No preferred supplier"} • Bin: {binLabel}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-slate-200">
                          {mat.on_hand} {mat.unit}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-slate-400">
                          {mat.allocated} {mat.unit}
                        </td>
                        <td
                          className={`px-4 py-3.5 font-mono ${
                            physAvail <= 0 ? "text-rose-300 font-semibold" : "text-emerald-300"
                          }`}
                        >
                          {physAvail} {mat.unit}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-cyan-300">
                          +{mat.incoming} {mat.unit}
                        </td>
                        <td className="px-4 py-3.5 font-mono font-semibold text-white">
                          {mat.net_availability} {mat.unit}
                          <p className="text-[10px] font-normal text-slate-400">
                            Threshold: {mat.reorder_threshold} {mat.unit}
                          </p>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col gap-1 items-start">
                            <Badge tone={STOCK_TONE[mat.stock_status]}>{mat.stock_status}</Badge>
                            <span className="text-[10px] uppercase tracking-wider text-slate-500">
                              {mat.data_origin === "LIVE_EVENT" ? "Live Updated" : "Seeded Demo"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <Button
                            size="sm"
                            variant="secondary"
                            aria-label={`Edit stock for ${mat.name}`}
                            iconLeft={<Pencil className="h-3.5 w-3.5 text-cyan-400" />}
                            onClick={() => openStockEditor(mat)}
                          >
                            Edit Stock
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab 2: Orders & CRD Risk Monitoring */}
      {activeTab === "orders" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-400">
              Allocation Policy: <strong className="text-slate-200">Earliest-CRD-First</strong>{" "}
              (physical on_hand only; tie-broken by created_at ASC, id ASC).
            </p>
            <Button
              size="sm"
              variant="secondary"
              isLoading={isMutating}
              onClick={() => void handleRecalculate()}
              iconLeft={<Zap className="h-3.5 w-3.5 text-cyan-400" />}
            >
              Recalculate Allocations
            </Button>
          </div>

          {backendOrderRisks.length === 0 ? (
            <Card className="py-8 text-center text-xs text-slate-400">
              No open orders found.
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {backendOrderRisks.map((order) => (
                <Card key={order.order_id} className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs text-cyan-300">
                        {order.order_id} • {order.product_code} ({order.quantity} units)
                      </span>
                      <h3 className="text-base font-semibold text-white">{order.customer_name}</h3>
                    </div>
                    <Badge tone={RISK_TONE[order.risk_category]}>{order.risk_category}</Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-[#050814]/80 p-3 text-xs">
                    <div>
                      <span className="block text-[10px] text-slate-400">Customer Req Date</span>
                      <span className="font-mono text-white">{order.customer_request_date}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400">Projected Ship</span>
                      <span className="font-mono text-cyan-300">
                        {order.projected_ship_date ?? "UNAVAILABLE"}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400">Date Confidence</span>
                      <span className="font-mono text-white">{order.ship_date_status}</span>
                    </div>
                  </div>

                  {order.missing_materials.length > 0 && (
                    <div className="space-y-1.5 rounded-xl border border-rose-500/25 bg-rose-950/15 p-3 text-xs">
                      <p className="font-semibold text-rose-200">Missing Material Breakdown:</p>
                      {order.missing_materials.map((mm) => (
                        <div key={mm.material_id} className="flex justify-between text-slate-300">
                          <span>
                            {mm.material_id} ({mm.material_name})
                          </span>
                          <span className="font-mono text-rose-300">
                            Alloc {mm.allocated_qty}/{mm.required_qty} (Short {mm.shortage_qty})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-500/25 bg-violet-500/8 p-3">
                    <p className="text-xs text-slate-200 flex-1">{order.explanation}</p>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void handleDisambiguateOrder(
                          `Check ${order.order_id} delivery risk and missing materials for ${order.customer_name}.`,
                        )
                      }
                      iconRight={<ArrowRight className="h-3 w-3" />}
                    >
                      Analyze in ResolveX
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Shortages, PO Proposal Generation & Event Ingestion */}
      {activeTab === "recommendations" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-white">
                Detected Material Shortages ({backendShortages.length})
              </h3>
              <p className="text-xs text-slate-400">
                Generating proposals creates PENDING_APPROVAL records only — never auto-issued.
              </p>
            </div>
            <Button
              size="sm"
              isLoading={isMutating}
              onClick={() => void handleGenerateProposals()}
              iconLeft={<ShoppingCart className="h-3.5 w-3.5" />}
            >
              Generate PO Proposals from Shortages
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {backendShortages.map((s) => (
              <Card key={s.material_id} className="flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={s.unmet_order_demand > 0 ? "rose" : "amber"}>
                      {s.unmet_order_demand > 0 ? "Critical Order Shortage" : "Below Threshold"}
                    </Badge>
                    <span className="font-mono text-xs text-cyan-300">
                      {s.material_id} ({s.sku})
                    </span>
                  </div>
                  <div>
                    <h4 className="text-base font-semibold text-white">{s.material_name}</h4>
                    <p className="text-xs text-slate-400">
                      Supplier: {s.supplier_name ?? "Unassigned"} • Lead Time:{" "}
                      {s.lead_time_days != null ? `${s.lead_time_days} days` : "Unknown"}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-[#050814]/80 p-3 text-xs">
                    <div>
                      <span className="block text-[10px] text-slate-400">Net Availability</span>
                      <span className="font-mono text-rose-300">
                        {s.net_availability} {s.unit}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400">Unmet Demand</span>
                      <span className="font-mono text-amber-300">
                        {s.unmet_order_demand} {s.unit}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400">Rec. Purchase</span>
                      <span className="font-mono text-emerald-300">
                        +{s.recommended_purchase_qty} {s.unit}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-300">
                    Affected Orders:{" "}
                    <span className="font-mono text-cyan-300">
                      {s.affected_orders.length > 0 ? s.affected_orders.join(", ") : "Safety stock"}
                    </span>
                  </p>
                </div>
              </Card>
            ))}
          </div>

          {/* Idempotent Event Ingestion Simulator */}
          <Card className="space-y-3 border-cyan-500/20">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Inventory Event Tester (Duplicate &amp; Invalid Event Handling)
                </h3>
                <p className="text-xs text-slate-400">
                  Simulate stock receipts, duplicate events, and invalid payloads to verify idempotent processing and quarantine handling.
                </p>
              </div>
              <Badge tone="cyan">Live Event Feed</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={isMutating}
                onClick={() => void handleSimulateEvent("receive")}
              >
                Simulate +10 MAT-CHIP Received
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={isMutating}
                onClick={() => void handleSimulateEvent("duplicate")}
              >
                Test Duplicate Event Idempotency
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={isMutating}
                onClick={() => void handleSimulateEvent("malformed")}
              >
                Test Malformed Event Quarantine
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 4: HITL Approval Management & Alerts */}
      {activeTab === "approvals" && (
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-white">
                  Purchase Order Proposals (Human-in-the-Loop Gate)
                </h3>
                <p className="text-xs text-slate-400">
                  Only <strong>Procurement Manager</strong> or <strong>Admin</strong> can approve or reject. Switch the role selector above to verify permission enforcement.
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                isLoading={isMutating}
                onClick={() => void handleGenerateProposals()}
              >
                Sync Proposals from Shortages
              </Button>
            </div>

            {backendProposals.length === 0 ? (
              <Card className="py-6 text-center text-xs text-slate-400">
                No purchase order proposals generated yet. Click &ldquo;Sync Proposals from
                Shortages&rdquo; above.
              </Card>
            ) : (
              backendProposals.map((p) => (
                <Card
                  key={p.id}
                  className="flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={PROPOSAL_TONE[p.status]}>{p.status}</Badge>
                      <Badge tone="violet">PROPOSED PO (NOT ISSUED)</Badge>
                      <span className="font-mono text-xs text-cyan-300">
                        {p.id} • {p.material_id} • Qty: {p.suggested_quantity}
                      </span>
                    </div>
                    <h4 className="text-base font-semibold text-white">
                      {p.material_name} — {p.supplier_name ?? "Unassigned Supplier"}
                    </h4>
                    <p className="text-xs text-slate-300">{p.reason}</p>
                    <p className="text-[11px] text-emerald-300">{p.estimated_impact}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      disabled={isMutating || p.status !== "PENDING_APPROVAL"}
                      onClick={() => void handleProposalDecision(p.id, "approve")}
                      iconLeft={<CheckCircle2 className="h-3.5 w-3.5" />}
                    >
                      Approve PO
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isMutating || p.status !== "PENDING_APPROVAL"}
                      onClick={() => void handleProposalDecision(p.id, "reject")}
                      iconLeft={<XCircle className="h-3.5 w-3.5 text-rose-400" />}
                    >
                      Reject
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </div>

          {/* Alerts Section */}
          <div className="space-y-3 pt-4 border-t border-white/10">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-amber-400" />
              <h3 className="text-base font-semibold text-white">
                Proactive Inventory &amp; Feed Alerts ({backendAlerts.length})
              </h3>
            </div>
            {backendAlerts.length === 0 ? (
              <Card className="py-6 text-center text-xs text-slate-400">No alerts recorded.</Card>
            ) : (
              <div className="space-y-2.5">
                {backendAlerts.map((alert) => (
                  <Card
                    key={alert.id}
                    padding="sm"
                    className="flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          tone={
                            alert.severity === "CRITICAL"
                              ? "rose"
                              : alert.severity === "HIGH"
                                ? "amber"
                                : "cyan"
                          }
                        >
                          {alert.alert_type} • {alert.severity}
                        </Badge>
                        <span className="font-mono text-xs text-slate-300">{alert.entity_id}</span>
                        {alert.acknowledged && <Badge tone="emerald">ACKNOWLEDGED</Badge>}
                      </div>
                      <p className="text-xs text-slate-200">{alert.message}</p>
                    </div>
                    {!alert.acknowledged && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void acknowledgeBackendAlert(alert.id)}
                      >
                        Acknowledge
                      </Button>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {editingMaterial && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-stock-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-slate-900 p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-mono uppercase tracking-wider text-cyan-300">
                  {editingMaterial.id} • {editingMaterial.sku}
                </p>
                <h3 id="edit-stock-dialog-title" className="text-lg font-semibold text-white mt-0.5">
                  Edit Stock Supply — {editingMaterial.name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Bins: {(editingMaterial.warehouse_locations ?? []).join(", ") || "Unassigned"} •
                  Reserved by open orders: {editingMaterial.allocated} {editingMaterial.unit}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close stock editor"
                onClick={() => setEditingMaterial(null)}
                className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400 mr-1">Quick supply presets:</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditOnHand("0")}
                className="border-rose-500/40 text-rose-200 hover:bg-rose-500/15"
              >
                Set On-Hand to 0 (Out of Stock)
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setEditOnHand(String(Math.max(0, (Number(editOnHand) || 0) + 10)))
                }
              >
                +10 {editingMaterial.unit}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setEditOnHand(String(Math.max(0, (Number(editOnHand) || 0) - 10)))
                }
              >
                -10 {editingMaterial.unit}
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="edit-on-hand-input"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Physical On-Hand ({editingMaterial.unit})
                </label>
                <input
                  id="edit-on-hand-input"
                  type="number"
                  min={0}
                  step="any"
                  value={editOnHand}
                  onChange={(e) => setEditOnHand(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-slate-950/80 px-3 py-2 font-mono text-sm text-white focus:border-cyan-400 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="edit-incoming-input"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Incoming ({editingMaterial.unit})
                </label>
                <input
                  id="edit-incoming-input"
                  type="number"
                  min={0}
                  step="any"
                  value={editIncoming}
                  onChange={(e) => setEditIncoming(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-slate-950/80 px-3 py-2 font-mono text-sm text-white focus:border-cyan-400 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="edit-threshold-input"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Reorder Threshold
                </label>
                <input
                  id="edit-threshold-input"
                  type="number"
                  min={0}
                  step="any"
                  value={editThreshold}
                  onChange={(e) => setEditThreshold(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-slate-950/80 px-3 py-2 font-mono text-sm text-white focus:border-cyan-400 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="edit-stock-reason-input"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                Update Reason / Audit Note (optional)
              </label>
              <input
                id="edit-stock-reason-input"
                type="text"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="e.g., Physical cycle count adjustment"
                className="w-full rounded-xl border border-white/15 bg-slate-950/80 px-3 py-2 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              />
            </div>

            {(() => {
              const previewOnHand = Number(editOnHand);
              const previewIncoming = Number(editIncoming);
              const previewThreshold = Number(editThreshold);
              const valid =
                Number.isFinite(previewOnHand) &&
                Number.isFinite(previewIncoming) &&
                Number.isFinite(previewThreshold) &&
                previewOnHand >= 0 &&
                previewIncoming >= 0 &&
                previewThreshold >= 0;
              if (!valid) return null;
              const projectedNet =
                previewOnHand + previewIncoming - editingMaterial.allocated;
              const previewStatus: BackendMaterialOverview["stock_status"] =
                projectedNet <= 0
                  ? "OUT_OF_STOCK"
                  : projectedNet <= previewThreshold
                    ? "LOW_STOCK"
                    : "HEALTHY";
              return (
                <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-slate-300">
                      Preview Phys. Available:{" "}
                      <strong className="font-mono text-white">
                        {Math.max(0, previewOnHand - editingMaterial.allocated)}{" "}
                        {editingMaterial.unit}
                      </strong>
                      {" · "}Net:{" "}
                      <strong className="font-mono text-white">
                        {projectedNet} {editingMaterial.unit}
                      </strong>
                    </span>
                    <Badge tone={STOCK_TONE[previewStatus]}>{previewStatus}</Badge>
                  </div>
                  {previewOnHand === 0 && (
                    <p className="text-amber-200">
                      At 0 {editingMaterial.unit}, this item is finished / out of stock — dispatch
                      requests will alert the operator and prompt to choose another item.
                    </p>
                  )}
                </div>
              );
            })()}

            {editError && (
              <div
                role="alert"
                className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs text-rose-200"
              >
                {editError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <Button variant="secondary" onClick={() => setEditingMaterial(null)}>
                Cancel
              </Button>
              <Button isLoading={isMutating} onClick={() => void handleSaveStockEdit()}>
                Save Stock
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
