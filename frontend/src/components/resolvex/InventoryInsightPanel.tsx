import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Clock, Package, ShieldAlert } from "lucide-react";
import type { BackendInventoryInsight } from "@/types/resolvex";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Card } from "./Card";

interface InventoryInsightPanelProps {
  insight: BackendInventoryInsight;
  compact?: boolean | undefined;
}

export function InventoryInsightPanel({
  insight,
  compact = false,
}: InventoryInsightPanelProps) {
  const navigate = useNavigate();
  const { inventory_overview: ov, shortages, order_risks: risks } = insight;

  return (
    <Card className="border-cyan-500/30 bg-cyan-950/15 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm sm:text-base font-semibold text-white">
            PS2 Smart Inventory Insight (Database-Grounded)
          </h3>
          <Badge tone="cyan">{insight.intent_action}</Badge>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void navigate({ to: "/inventory" })}
          iconRight={<ArrowRight className="h-3.5 w-3.5" />}
        >
          Open Inventory Hub
        </Button>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
        <div className="rounded-xl border border-white/10 bg-[#050814]/80 p-3">
          <span className="block text-[10px] uppercase tracking-wider text-slate-400">
            Materials
          </span>
          <span className="font-mono text-lg font-bold text-white">{ov.total_materials}</span>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#050814]/80 p-3">
          <span className="block text-[10px] uppercase tracking-wider text-slate-400">
            Out of Stock
          </span>
          <span className="font-mono text-lg font-bold text-rose-300">
            {ov.out_of_stock_count}
          </span>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#050814]/80 p-3">
          <span className="block text-[10px] uppercase tracking-wider text-slate-400">
            Low Stock
          </span>
          <span className="font-mono text-lg font-bold text-amber-300">{ov.low_stock_count}</span>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#050814]/80 p-3">
          <span className="block text-[10px] uppercase tracking-wider text-slate-400">
            At-Risk Orders
          </span>
          <span className="font-mono text-lg font-bold text-amber-300">
            {risks.filter((r) => r.risk_category !== "ON_TRACK").length} / {risks.length}
          </span>
        </div>
      </div>

      {!compact && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Shortages */}
          <div className="space-y-2">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-200">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
              Active Material Shortages ({shortages.length})
            </p>
            <div className="space-y-2">
              {shortages.length === 0 ? (
                <p className="text-xs text-slate-400">No shortages detected.</p>
              ) : (
                shortages.map((s) => (
                  <div
                    key={s.material_id}
                    className="rounded-xl border border-white/10 bg-[#050814]/80 p-3 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-cyan-300">
                        {s.material_id} ({s.sku})
                      </span>
                      <Badge tone={s.unmet_order_demand > 0 ? "rose" : "amber"}>
                        Net: {s.net_availability} {s.unit}
                      </Badge>
                    </div>
                    <p className="text-slate-200">{s.material_name}</p>
                    <p className="text-[11px] text-slate-400">
                      On-hand: {s.on_hand} • Incoming: {s.incoming} • Allocated: {s.allocated} •
                      Unmet demand: <strong className="text-rose-300">{s.unmet_order_demand}</strong>{" "}
                      • Rec. PO: <strong className="text-emerald-300">+{s.recommended_purchase_qty}</strong>
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Order Delivery Risks */}
          <div className="space-y-2">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-200">
              <Clock className="h-3.5 w-3.5 text-amber-400" />
              Open Order CRD Risks ({risks.length})
            </p>
            <div className="space-y-2">
              {risks.map((r) => (
                <div
                  key={r.order_id}
                  className="rounded-xl border border-white/10 bg-[#050814]/80 p-3 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold text-white">
                      {r.order_id} — {r.customer_name}
                    </span>
                    <Badge
                      tone={
                        r.risk_category === "ON_TRACK"
                          ? "emerald"
                          : r.risk_category === "AT_RISK"
                            ? "amber"
                            : "rose"
                      }
                    >
                      {r.risk_category}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    CRD: {r.customer_request_date} • Ship:{" "}
                    {r.projected_ship_date ?? r.ship_date_status}
                  </p>
                  <p className="text-[11px] text-slate-300">{r.explanation}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <ShieldAlert className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
        <span>{insight.note}</span>
      </p>
    </Card>
  );
}
