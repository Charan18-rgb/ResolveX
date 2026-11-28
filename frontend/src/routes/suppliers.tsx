import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useResolveX } from "@/context/useResolveX";
import { opsApi, type SupplierDetail, type SupplierPerf } from "@/services/opsApi";

export const Route = createFileRoute("/suppliers")({ component: SuppliersPage });

function SuppliersPage() {
  const { settings } = useResolveX();
  const [suppliers, setSuppliers] = useState<SupplierPerf[]>([]);
  const [detail, setDetail] = useState<SupplierDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    opsApi.suppliers(settings.apiBaseUrl)
      .then((r) => setSuppliers(r.suppliers))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load suppliers."));
  }, [settings.apiBaseUrl]);

  const open = async (s: SupplierPerf) => {
    try {
      setDetail(await opsApi.supplierDetail(s.supplier_id, settings.apiBaseUrl));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load supplier detail.");
    }
  };

  const perf = detail?.performance;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold text-white">Suppliers</h1>
      <p className="mb-6 text-sm text-slate-500">Delivery performance computed from recorded delivery history (seeded demonstration data). Sample sizes are shown; past performance does not guarantee future results.</p>
      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-slate-500">Supplier</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-slate-500">Deliveries</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-slate-500">On-time</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-slate-500">Late</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-slate-500">Failed</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-slate-500">Avg delay</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-slate-500">Pending</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {suppliers.map((s) => (
                <tr key={s.supplier_id} onClick={() => void open(s)} className="cursor-pointer hover:bg-cyan-50/50">
                  <td className="px-4 py-3"><div className="font-medium text-slate-900">{s.supplier_name}</div><div className="text-xs text-slate-400">{s.supplier_id} · {s.lead_time_days ?? "—"}d lead</div></td>
                  <td className="px-4 py-3 text-sm">{s.total_deliveries}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-emerald-700">{s.on_time_rate === null ? "—" : `${s.on_time_rate}%`}</td>
                  <td className="px-4 py-3 text-sm">{s.late}</td>
                  <td className="px-4 py-3 text-sm">{s.failed}</td>
                  <td className="px-4 py-3 text-sm">{s.avg_delay_days ? `${s.avg_delay_days}d` : "—"}</td>
                  <td className="px-4 py-3 text-sm">{s.pending}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-4">
          {detail && perf ? (
            <>
              <h3 className="font-semibold text-slate-900">{String(detail.supplier["name"] ?? perf.supplier_name)}</h3>
              <p className="mb-3 text-xs text-slate-500">{perf.sample_note}</p>
              <dl className="space-y-2 text-sm">
                {[["Total deliveries", perf.total_deliveries], ["Delivered", perf.delivered], ["On-time", perf.on_time], ["Late", perf.late], ["Failed", perf.failed], ["Cancelled", perf.cancelled], ["Pending", perf.pending], ["Last delivery", perf.last_delivery_date ?? "—"]].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between border-b border-slate-100 py-1.5"><dt className="text-slate-500">{k}</dt><dd className="font-medium">{v}</dd></div>
                ))}
              </dl>
              <h4 className="mb-2 mt-4 text-xs font-semibold uppercase text-slate-500">Recent deliveries</h4>
              <ul className="max-h-64 space-y-1.5 overflow-y-auto text-xs">
                {detail.deliveries.map((d) => (
                  <li key={d.id} className="flex justify-between rounded bg-slate-50 px-2 py-1.5">
                    <span>{d.material_name ?? d.material_id} · {d.quantity}</span>
                    <span className={d.status === "DELIVERED_ON_TIME" ? "text-emerald-600" : d.status === "DELIVERED_LATE" ? "text-amber-600" : "text-slate-500"}>
                      {d.status.replace(/_/g, " ")}{d.delay_days ? ` (+${d.delay_days}d)` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">Select a supplier to view profile and delivery history.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
