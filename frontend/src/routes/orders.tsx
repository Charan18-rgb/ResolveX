import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useResolveX } from "@/context/useResolveX";
import { resolveXService } from "@/services/api";
import { opsApi, type OrderTimeline } from "@/services/opsApi";
import type { BackendOrderRiskItem, BackendOrderRow } from "@/types/resolvex";

export const Route = createFileRoute("/orders")({ component: OrdersPage });

const RISK_TONE: Record<string, string> = {
  ON_TRACK: "bg-emerald-50 text-emerald-700",
  AT_RISK: "bg-amber-50 text-amber-700",
  DELAYED: "bg-orange-50 text-orange-700",
  BLOCKED: "bg-red-50 text-red-700",
};

function OrdersPage() {
  const { settings } = useResolveX();
  const [risks, setRisks] = useState<BackendOrderRiskItem[]>([]);
  const [orders, setOrders] = useState<BackendOrderRow[]>([]);
  const [timeline, setTimeline] = useState<OrderTimeline | null>(null);
  const [activeOrder, setActiveOrder] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      resolveXService.getOrderRisks(settings.apiBaseUrl),
      resolveXService.getOrders(settings.apiBaseUrl),
    ])
      .then(([r, o]) => {
        setRisks(r);
        setOrders(o.orders);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load orders."));
  }, [settings.apiBaseUrl]);

  const openTimeline = async (id: string) => {
    setActiveOrder(id);
    setTimeline(null);
    try {
      setTimeline(await opsApi.orderTimeline(id, settings.apiBaseUrl));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load order timeline.");
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900">Orders & Delivery</h1>
      <p className="mb-6 text-sm text-slate-500">Live fulfilment status, delay risk and evidence-based timelines.</p>
      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {risks.map((r) => {
            const risk = String(r.risk_category ?? "ON_TRACK");
            return (
              <button
                key={r.order_id}
                onClick={() => void openTimeline(r.order_id)}
                className={`w-full rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-cyan-400 ${activeOrder === r.order_id ? "border-cyan-500 ring-1 ring-cyan-500" : "border-slate-200"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900">{r.order_id} — {r.customer_name}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${RISK_TONE[risk] ?? RISK_TONE["AT_RISK"]}`}>{risk.replace("_", " ")}</span>
                </div>
                <p className="mt-1.5 text-sm text-slate-600">{r.explanation}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                  <span>{r.quantity} × {r.product_code}</span>
                  <span>Required: {r.customer_request_date}</span>
                  {r.projected_ship_date ? <span>Projected ship: {r.projected_ship_date} ({r.ship_date_status})</span> : null}
                </div>
              </button>
            );
          })}
          {risks.length === 0 && <p className="text-sm text-slate-500">No order risk data available.</p>}
        </div>

        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-4">
          {timeline ? (
            <>
              <h3 className="font-semibold text-slate-900">{String(timeline.order.order_id ?? timeline.order.id)} — timeline</h3>
              <ol className="mt-3 space-y-3">
                {timeline.stages.map((s) => (
                  <li key={s.key} className="flex gap-3">
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${s.status === "completed" ? "bg-emerald-500" : s.status === "warning" ? "bg-amber-500" : s.status === "blocked" ? "bg-red-500" : "bg-slate-300"}`} />
                    <div>
                      <div className="text-sm font-medium text-slate-800">{s.label}</div>
                      <div className="text-xs text-slate-500">{s.detail}</div>
                    </div>
                  </li>
                ))}
              </ol>
              {timeline.allocations.length > 0 && (
                <>
                  <h4 className="mb-2 mt-4 text-xs font-semibold uppercase text-slate-500">Material reservations</h4>
                  <ul className="space-y-1 text-xs">
                    {timeline.allocations.map((a, i) => (
                      <li key={i} className="flex justify-between rounded bg-slate-50 px-2 py-1.5">
                        <span>{String(a["material_id"])}</span>
                        <span>{String(a["allocated_qty"] ?? "—")}/{String(a["required_qty"] ?? "—")}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">Select an order to view its fulfilment timeline and reservation details.</p>
          )}
        </aside>
      </div>

      {orders.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">All orders</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  {["Order", "Customer", "Product", "Qty", "Required date", "Status"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((o) => (
                  <tr key={o.id} onClick={() => void openTimeline(o.id)} className="cursor-pointer hover:bg-cyan-50/50">
                    <td className="px-4 py-2.5 text-sm font-medium">{o.id}</td>
                    <td className="px-4 py-2.5 text-sm">{o.customer_name}</td>
                    <td className="px-4 py-2.5 text-sm">{o.product_code}</td>
                    <td className="px-4 py-2.5 text-sm">{o.quantity}</td>
                    <td className="px-4 py-2.5 text-sm">{o.customer_request_date}</td>
                    <td className="px-4 py-2.5 text-sm">{o.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
