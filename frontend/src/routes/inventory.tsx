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
  RefreshCw,
  ShoppingCart,
  Sparkles,
  UserCheck,
  XCircle,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Badge, type BadgeTone } from "@/components/resolvex/Badge";
import { Button } from "@/components/resolvex/Button";
import { Card } from "@/components/resolvex/Card";
import { DemoBanner } from "@/components/resolvex/DemoBanner";
import { SectionHeader } from "@/components/resolvex/SectionHeader";
import { useResolveX } from "@/context/useResolveX";
import { DEMO_ROLES } from "@/data/inventoryMockData";
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
    acknowledgeBackendAlert,
    decidePoProposal,
    runAnalysis,
    setAssistantOpen,
  } = useResolveX();

  const roleConfig = DEMO_ROLES.find((r) => r.role === activeRole) ?? DEMO_ROLES[0];
  const [activeTab, setActiveTab] = useState<InventoryTab>(roleConfig?.primaryTab ?? "materials");
  const [stockFilter, setStockFilter] = useState<
    BackendMaterialOverview["stock_status"] | "All"
  >("All");
  const [actionFeedback, setActionFeedback] = useState<{
    tone: "emerald" | "rose" | "amber";
    message: string;
  } | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  const materials = backendInventoryOverview?.materials ?? [];
  const totalOnHand = materials.reduce((sum, m) => sum + m.on_hand, 0);
  const totalIncoming = materials.reduce((sum, m) => sum + m.incoming, 0);
  const shortageCount = backendShortages.length;
  const crdRiskCount = backendOrderRisks.filter((o) => o.risk_category !== "ON_TRACK").length;
  const pendingProposalsCount = backendProposals.filter(
    (p) => p.status === "PENDING_APPROVAL",
  ).length;
  const unackAlerts = backendAlerts.filter((a) => !a.acknowledged);

  const filteredMaterials = materials.filter((m) =>
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
        eyebrow="PS2 — Smart Inventory Intelligence"
        title="Materials, CRD Risk & Procurement Hub"
        description="Authoritative SQLite inventory availability (on_hand + incoming - allocated), Earliest-CRD-First allocation, CRD risk assessment, proactive alerts, and HITL PO approvals."
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
              Demo Role Perspective (Sent via X-User-Role Header)
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
              <Badge tone="cyan">{backendBriefing.data_source}</Badge>
            </div>
          </div>
          {backendBriefing.ai_summary ? (
            <p className="whitespace-pre-line text-xs sm:text-sm leading-relaxed text-slate-200">
              {backendBriefing.ai_summary}
            </p>
          ) : (
            <p className="text-xs text-slate-300">
              {backendBriefing.ai_note ??
                `Loaded ${backendBriefing.sections.length} verified briefing sections from SQLite.`}
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
          <p className="text-xs text-slate-400">
            Out of {backendOrderRisks.length} OPEN orders
          </p>
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
          <span>Loading deterministic inventory state from SQLite backend...</span>
        </Card>
      )}

      {/* Tab 1: Materials & Net Availability */}
      {activeTab === "materials" && (
        <Card padding="none" className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5">
            <div>
              <h3 className="text-base font-semibold text-white">
                Material Stock &amp; Net Availability Matrix
              </h3>
              <p className="text-xs text-slate-400">
                Formula: Net Availability = On-Hand + Incoming − Allocated (SQLite authoritative)
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
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

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3">Material ID / SKU</th>
                  <th className="px-4 py-3">On-Hand</th>
                  <th className="px-4 py-3">Incoming</th>
                  <th className="px-4 py-3">Allocated</th>
                  <th className="px-4 py-3">Net Availability</th>
                  <th className="px-4 py-3">Threshold / Lead</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {filteredMaterials.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-xs text-slate-400">
                      No materials match the current filter or backend returned empty inventory.
                    </td>
                  </tr>
                ) : (
                  filteredMaterials.map((mat) => (
                    <tr key={mat.id} className="hover:bg-white/3">
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-xs text-cyan-300">
                          {mat.id} • {mat.sku}
                        </span>
                        <p className="font-medium text-white">{mat.name}</p>
                        <p className="text-[11px] text-slate-400">
                          {mat.supplier_name ?? "No preferred supplier"}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-slate-200">
                        {mat.on_hand} {mat.unit}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-cyan-300">
                        +{mat.incoming} {mat.unit}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-slate-400">
                        {mat.allocated} {mat.unit}
                      </td>
                      <td className="px-4 py-3.5 font-mono font-semibold text-white">
                        {mat.net_availability} {mat.unit}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-300">
                        {mat.reorder_threshold} {mat.unit} •{" "}
                        {mat.lead_time_days != null ? `${mat.lead_time_days}d lead` : "No lead time"}
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge tone={STOCK_TONE[mat.stock_status]}>{mat.stock_status}</Badge>
                      </td>
                    </tr>
                  ))
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
              No open orders returned by backend.
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
                      Analyze in PS6
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
                  Live Inventory Event Stream Tester (Idempotency &amp; Quarantine)
                </h3>
                <p className="text-xs text-slate-400">
                  Test real-time `POST /api/inventory/events`, duplicate event suppression, and
                  malformed payload quarantine (`FEED_FAILURE` alert).
                </p>
              </div>
              <Badge tone="cyan">POST /api/inventory/events</Badge>
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
                  Only <strong>Procurement Manager</strong> can approve or reject. Switch demo role
                  above to test backend <code>403 FORBIDDEN</code> enforcement.
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
              <Card className="py-6 text-center text-xs text-slate-400">
                No alerts recorded.
              </Card>
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
    </div>
  );
}
