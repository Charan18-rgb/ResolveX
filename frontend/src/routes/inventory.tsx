import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Package,
  ShoppingCart,
  Sparkles,
  UserCheck,
  XCircle,
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
  CrdRiskTier,
  InventoryApprovalItem,
  MaterialHealth,
  UserDemoRole,
} from "@/types/resolvex";

export const Route = createFileRoute("/inventory")({
  component: InventoryHubPage,
});

type InventoryTab = "materials" | "orders" | "recommendations" | "approvals";

const HEALTH_TONE: Record<MaterialHealth, BadgeTone> = {
  Healthy: "emerald",
  "Low Stock": "amber",
  Shortage: "rose",
};

const CRD_TONE: Record<CrdRiskTier, BadgeTone> = {
  "On Track": "emerald",
  "At Risk": "amber",
  "Critical Delay": "rose",
};

const APPROVAL_TONE: Record<InventoryApprovalItem["status"], BadgeTone> = {
  Pending: "amber",
  Approved: "emerald",
  Rejected: "rose",
  "Clarification Requested": "violet",
};

function InventoryHubPage() {
  const navigate = useNavigate();
  const {
    activeRole,
    setActiveRole,
    materials,
    orders,
    recommendations,
    approvals,
    draftPurchaseOrder,
    updateApprovalStatus,
    runAnalysis,
    setAssistantOpen,
  } = useResolveX();

  const roleConfig = DEMO_ROLES.find((r) => r.role === activeRole) ?? DEMO_ROLES[0];
  const [activeTab, setActiveTab] = useState<InventoryTab>(roleConfig?.primaryTab ?? "materials");
  const [healthFilter, setHealthFilter] = useState<MaterialHealth | "All">("All");

  const totalOnHand = materials.reduce((sum, m) => sum + m.onHand, 0);
  const shortageCount = materials.filter((m) => m.health === "Shortage").length;
  const crdRiskCount = orders.filter((o) => o.crdRisk !== "On Track").length;
  const pendingApprovals = approvals.filter((a) => a.status === "Pending").length;

  const filteredMaterials = materials.filter((m) =>
    healthFilter === "All" ? true : m.health === healthFilter,
  );

  const handleDisambiguateOrderNote = async (note: string) => {
    await runAnalysis(note, "Supply Chain & Inventory", "Balanced");
    void navigate({ to: "/analysis" });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-8">
      <SectionHeader
        eyebrow="PS2 — Smart Inventory Intelligence"
        title="Materials, CRD Risk & Procurement Hub"
        description="Unified inventory visibility, shortage forecasting, Customer Requested Date (CRD) risk monitoring, purchase recommendations, and approval workflows."
        actions={
          <div className="flex flex-wrap gap-2">
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

      <DemoBanner
        compact
        label="DEMO DATA • PS2"
        description="Simulated multi-warehouse stock, CRD schedules, and PO approvals. Switch demo roles below to tailor focus."
      />

      {/* Role-Based Demo View Selector */}
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-cyan-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Role-Based Demo Perspective
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

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total On-Hand Units</span>
            <Package className="h-4 w-4 text-cyan-400" />
          </div>
          <p className="font-mono text-3xl font-bold text-white">{totalOnHand.toLocaleString()}</p>
          <p className="text-xs text-slate-400">Across 3 regional hubs (DEMO DATA)</p>
        </Card>

        <Card className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Critical SKU Shortages</span>
            <AlertTriangle className="h-4 w-4 text-rose-400" />
          </div>
          <p className="font-mono text-3xl font-bold text-rose-300">{shortageCount}</p>
          <p className="text-xs text-slate-400">Below safety stock threshold</p>
        </Card>

        <Card className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>CRD At-Risk Orders</span>
            <Clock className="h-4 w-4 text-amber-400" />
          </div>
          <p className="font-mono text-3xl font-bold text-amber-300">{crdRiskCount}</p>
          <p className="text-xs text-slate-400">Require expedite or stock transfer</p>
        </Card>

        <Card className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Pending Approvals</span>
            <ClipboardCheck className="h-4 w-4 text-violet-400" />
          </div>
          <p className="font-mono text-3xl font-bold text-violet-300">{pendingApprovals}</p>
          <p className="text-xs text-slate-400">POs & inter-warehouse reallocations</p>
        </Card>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
        {(
          [
            { id: "materials", label: "Materials & Stock Availability" },
            { id: "orders", label: "Orders & CRD Risk Monitoring" },
            { id: "recommendations", label: "Shortages & PO Recommendations" },
            { id: "approvals", label: `Approval Management (${pendingApprovals})` },
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

      {/* Tab 1: Materials & Stock */}
      {activeTab === "materials" && (
        <Card padding="none" className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5">
            <div>
              <h3 className="text-base font-semibold text-white">
                Material Stock & Safety Buffer Matrix
              </h3>
              <p className="text-xs text-slate-400">
                Live demo inventory availability across BLR, MUM, and DEL hubs
              </p>
            </div>
            <div className="flex gap-1.5">
              {(["All", "Shortage", "Low Stock", "Healthy"] as const).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHealthFilter(h)}
                  className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium ${
                    healthFilter === h
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
            <table className="w-full min-w-[780px] text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3">SKU & Material</th>
                  <th className="px-4 py-3">Warehouse</th>
                  <th className="px-4 py-3">On Hand</th>
                  <th className="px-4 py-3">Allocated</th>
                  <th className="px-4 py-3">Available</th>
                  <th className="px-4 py-3">Safety / Lead</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {filteredMaterials.map((mat) => (
                  <tr key={mat.id} className="hover:bg-white/3">
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-xs text-cyan-300">{mat.sku}</span>
                      <p className="font-medium text-white">{mat.name}</p>
                      <p className="text-[11px] text-slate-400">{mat.supplier}</p>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-slate-300">
                      {mat.warehouse}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-slate-200">{mat.onHand}</td>
                    <td className="px-4 py-3.5 font-mono text-slate-400">{mat.allocated}</td>
                    <td className="px-4 py-3.5 font-mono font-semibold text-white">
                      {mat.available}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-300">
                      {mat.safetyStock} min • {mat.leadTimeDays}d lead
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge tone={HEALTH_TONE[mat.health]}>{mat.health}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab 2: Orders & CRD Risk + PS6 Cross-Link */}
      {activeTab === "orders" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {orders.map((order) => (
            <Card key={order.id} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono text-xs text-cyan-300">
                    {order.orderNumber} • {order.priority}
                  </span>
                  <h3 className="text-base font-semibold text-white">{order.customer}</h3>
                </div>
                <Badge tone={CRD_TONE[order.crdRisk]}>{order.crdRisk}</Badge>
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-[#050814]/80 p-3 text-xs">
                <div>
                  <span className="block text-[10px] text-slate-400">CRD</span>
                  <span className="font-mono text-white">{order.crdDate}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400">SKU</span>
                  <span className="font-mono text-cyan-300">{order.requiredSku}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400">Allocation</span>
                  <span className="font-mono text-white">
                    {order.allocatedQty}/{order.requiredQty} ({order.fulfillmentPct}
                    %)
                  </span>
                </div>
              </div>

              <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                <div
                  className={`h-full rounded-full ${
                    order.crdRisk === "On Track"
                      ? "bg-emerald-400"
                      : order.crdRisk === "At Risk"
                        ? "bg-amber-400"
                        : "bg-rose-400"
                  }`}
                  style={{ width: `${order.fulfillmentPct}%` }}
                />
              </div>

              <div className="rounded-xl border border-violet-500/25 bg-violet-500/8 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-violet-200">
                    <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
                    Dispatch Instruction Note
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleDisambiguateOrderNote(order.instructionNote)}
                    iconRight={<ArrowRight className="h-3 w-3" />}
                  >
                    Resolve Note in PS6
                  </Button>
                </div>
                <p className="text-xs text-slate-200">“{order.instructionNote}”</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Tab 3: Shortages & Purchase Recommendations */}
      {activeTab === "recommendations" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {recommendations.map((rec) => (
            <Card key={rec.id} className="flex flex-col justify-between gap-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge
                    tone={
                      rec.urgency === "Critical"
                        ? "rose"
                        : rec.urgency === "High"
                          ? "amber"
                          : "cyan"
                    }
                  >
                    {rec.urgency} Urgency
                  </Badge>
                  <Badge tone={rec.status === "PO Drafted" ? "emerald" : "slate"}>
                    {rec.status}
                  </Badge>
                </div>

                <div>
                  <span className="font-mono text-xs text-cyan-300">
                    {rec.sku} • {rec.supplier}
                  </span>
                  <h3 className="text-base font-semibold text-white">{rec.materialName}</h3>
                  <p className="mt-1 text-xs text-slate-300">{rec.rationale}</p>
                </div>

                <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-[#050814]/80 p-3 text-xs">
                  <div>
                    <span className="block text-[10px] text-slate-400">Net Shortage</span>
                    <span className="font-mono text-rose-300">-{rec.netShortage} units</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">Rec. Order</span>
                    <span className="font-mono text-emerald-300">+{rec.recommendedQty} units</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">Est. Cost</span>
                    <span className="font-mono text-white">
                      ${rec.estimatedCostUsd.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10">
                <span className="text-[11px] text-slate-400">
                  Lead time: {rec.leadTimeDays} days
                </span>
                <Button
                  size="sm"
                  disabled={rec.status === "PO Drafted"}
                  onClick={() => draftPurchaseOrder(rec.id)}
                  iconLeft={<ShoppingCart className="h-3.5 w-3.5" />}
                >
                  {rec.status === "PO Drafted" ? "Draft PO Queued" : "Draft PO for Approval"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Tab 4: Approval Management */}
      {activeTab === "approvals" && (
        <div className="space-y-4">
          {approvals.map((apr) => (
            <Card
              key={apr.id}
              className="flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={APPROVAL_TONE[apr.status]}>{apr.status}</Badge>
                  <Badge tone="violet">{apr.type}</Badge>
                  <span className="font-mono text-xs text-cyan-300">
                    {apr.sku} • {apr.qty} units • ${apr.amountUsd.toLocaleString()}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-white">{apr.title}</h3>
                <p className="text-xs text-slate-300">
                  Requested by {apr.requestedBy} • Target Owner:{" "}
                  <strong className="text-white">{apr.ownerRole}</strong> •{" "}
                  <span className="text-emerald-300">{apr.crdImpact}</span>
                </p>
                <p className="text-xs text-slate-400">{apr.note}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  disabled={apr.status === "Approved"}
                  onClick={() => updateApprovalStatus(apr.id, "Approved")}
                  iconLeft={<CheckCircle2 className="h-3.5 w-3.5" />}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={apr.status === "Clarification Requested"}
                  onClick={() => updateApprovalStatus(apr.id, "Clarification Requested")}
                >
                  Clarify
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={apr.status === "Rejected"}
                  onClick={() => updateApprovalStatus(apr.id, "Rejected")}
                  iconLeft={<XCircle className="h-3.5 w-3.5 text-rose-400" />}
                >
                  Reject
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
