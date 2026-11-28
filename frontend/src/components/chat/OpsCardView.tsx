import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Box, Send } from "lucide-react";
import { opsApi, type OpsCard } from "../../services/opsApi";
import type { SupplierPerf, SupplierDetail, StorageBin, WarehouseOverview, OrderTimeline } from "../../services/opsApi";

const CARD_CLS = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm";
const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500";
const td = "px-3 py-2 text-sm text-slate-700";

function pct(v: number | null | undefined) {
  return v === null || v === undefined ? "—" : `${v}%`;
}
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function disp(v: unknown): string {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? "—" : String(n);
}

function SuppliersTable({ suppliers }: { suppliers: SupplierPerf[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-slate-200">
          <tr>
            <th className={th}>Supplier</th><th className={th}>Deliveries</th><th className={th}>On-time</th>
            <th className={th}>Late</th><th className={th}>Failed</th><th className={th}>Avg delay</th><th className={th}>Last delivery</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {suppliers.map((s) => (
            <tr key={s.supplier_id}>
              <td className={td}><div className="font-medium text-slate-900">{s.supplier_name}</div><div className="text-xs text-slate-400">{s.supplier_id}</div></td>
              <td className={td}>{s.total_deliveries}</td>
              <td className={td}>{pct(s.on_time_rate)}</td>
              <td className={td}>{s.late}</td>
              <td className={td}>{s.failed}</td>
              <td className={td}>{s.avg_delay_days ? `${s.avg_delay_days}d` : "—"}</td>
              <td className={td}>{s.last_delivery_date ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-400">{suppliers[0]?.sample_note ?? ""} Historical performance is not a guarantee of future results.</p>
    </div>
  );
}

function WarehouseCard({ data }: { data: WarehouseOverview | { overview?: WarehouseOverview; locations?: StorageBin[] } }) {
  const raw = data as {
    overview?: WarehouseOverview;
    locations?: Array<StorageBin & { material_name?: string; material_sku?: string; material_unit?: string }>;
    totals?: WarehouseOverview["totals"];
    zones?: WarehouseOverview["zones"];
  };
  const locations = Array.isArray(raw?.locations) ? raw.locations : [];
  const ov = raw?.overview ?? (raw?.totals ? (raw as WarehouseOverview) : undefined);
  const totals = ov?.totals;
  const zones = Array.isArray(ov?.zones) ? ov.zones : [];
  return (
    <div className="space-y-4">
      {locations.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr><th className={th}>Product</th><th className={th}>Zone</th><th className={th}>Rack</th><th className={th}>Shelf</th><th className={th}>Stored</th><th className={th}>Incoming</th><th className={th}>Status</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {locations.map((loc) => (
                <tr key={loc.id}>
                  <td className={td}>
                    <div className="font-medium text-slate-900">{String(loc.material_name ?? loc.material_id ?? "—")}</div>
                    {loc.material_sku && <div className="text-xs text-slate-400">{loc.material_sku}</div>}
                  </td>
                  <td className={`${td} font-medium`}>{loc.zone_code}</td>
                  <td className={td}>{loc.rack_code}</td>
                  <td className={td}>{loc.shelf_code}</td>
                  <td className={td}>{num(loc.stored_qty)} / {num(loc.capacity_units)}</td>
                  <td className={td}>{num(loc.incoming_qty)}</td>
                  <td className={td}>{loc.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {totals && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Storage used", `${num(totals.stored_units)} / ${num(totals.capacity_units)} units`],
            ["Free space", `${num(totals.capacity_units) - num(totals.stored_units)} units`],
            ["Incoming", `${num(totals.incoming_units)} units`],
            ["Utilization", pct(totals.utilization_pct)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500">{k}</div>
              <div className="text-lg font-semibold text-slate-900">{v}</div>
            </div>
          ))}
        </div>
      )}
      {zones.length > 0 && (
        <table className="w-full">
          <thead className="border-b border-slate-200">
            <tr><th className={th}>Zone</th><th className={th}>Bins</th><th className={th}>Used</th><th className={th}>Free</th><th className={th}>Incoming</th><th className={th}>Utilization</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {zones.map((z) => (
              <tr key={z.zone_code}>
                <td className={`${td} font-medium`}>{z.zone_code}</td>
                <td className={td}>{z.bin_count}</td>
                <td className={td}>{num(z.stored_units)}</td>
                <td className={td}>{num(z.free_units)}</td>
                <td className={td}>{num(z.incoming_units)}</td>
                <td className={td}>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 rounded bg-slate-200"><div className="h-2 rounded bg-cyan-600" style={{ width: `${Math.min(100, z.utilization_pct)}%` }} /></div>
                    {pct(z.utilization_pct)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function MaterialLocationCard({ data }: { data: { material: any; balance: any | null; locations: StorageBin[] } }) {
  const m = data.material;
  const bal = data.balance ?? {};
  return (
    <div>
      <div className="mb-3 text-sm text-slate-600">
        <span className="font-medium text-slate-900">{String(m.name ?? m.id)}</span>
        {" — "}on hand {num(bal.on_hand_qty ?? bal.on_hand)} · allocated {num(bal.allocated_qty ?? bal.allocated)} · available {num(bal.physical_available ?? bal.available_qty ?? bal.net_availability ?? bal.net_available)}
      </div>
      <table className="w-full">
        <thead className="border-b border-slate-200">
          <tr><th className={th}>Zone</th><th className={th}>Rack</th><th className={th}>Shelf</th><th className={th}>Stored</th><th className={th}>Capacity</th><th className={th}>Status</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.locations.map((l) => (
            <tr key={l.id}>
              <td className={td}>{l.zone_code}</td><td className={td}>{l.rack_code}</td><td className={td}>{l.shelf_code}</td>
              <td className={td}>{num(l.stored_qty)}</td><td className={td}>{num(l.capacity_units)}</td>
              <td className={td}><span className={`rounded px-2 py-0.5 text-xs font-medium ${l.status === "AVAILABLE" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{l.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.locations.length === 0 && <p className="py-3 text-sm text-slate-500">No storage bins recorded for this material.</p>}
      {data.locations.length > 0 && (
        <Link
          to="/warehouse"
          search={{ material: String(m.sku ?? m.id ?? ""), view: "3d" }}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500"
        >
          <Box size={13} /> Open in 3D warehouse
        </Link>
      )}
    </div>
  );
}

function SupplierCompareCard({ data }: { data: { a: SupplierDetail; b: SupplierDetail } }) {
  const perf = (d: SupplierDetail) => d.performance;
  const rows: [string, (p: SupplierPerf | null) => string][] = [
    ["Deliveries", (p) => String(p?.total_deliveries ?? "—")],
    ["On-time rate", (p) => pct(p?.on_time_rate)],
    ["Late", (p) => String(p?.late ?? "—")],
    ["Failed", (p) => String(p?.failed ?? "—")],
    ["Avg delay", (p) => p?.avg_delay_days ? `${p.avg_delay_days}d` : "—"],
    ["Pending", (p) => String(p?.pending ?? "—")],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-slate-200">
          <tr><th className={th}>Metric</th><th className={th}>{String(data.a.supplier.name ?? data.a.performance?.supplier_name ?? "Supplier A")}</th><th className={th}>{String(data.b.supplier.name ?? data.b.performance?.supplier_name ?? "Supplier B")}</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(([label, fn]) => (
            <tr key={label}><td className={`${td} font-medium`}>{label}</td><td className={td}>{fn(perf(data.a))}</td><td className={td}>{fn(perf(data.b))}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderRisksCard({ data }: { data: { orders: any[] } }) {
  return (
    <div className="space-y-2">
      {data.orders.map((o) => {
        const risk = String(o.risk_category ?? "ON_TRACK");
        const tone = risk === "ON_TRACK" ? "bg-emerald-50 text-emerald-700" : risk === "BLOCKED" || risk === "DELAYED" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700";
        return (
          <div key={String(o.order_id)} className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-900">{String(o.order_id)} — {String(o.customer_name ?? "")}</span>
              <span className={`rounded px-2 py-0.5 text-xs font-semibold ${tone}`}>{risk.replace("_", " ")}</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{String(o.explanation ?? "")}</p>
            {o.projected_ship_date ? <p className="mt-1 text-xs text-slate-400">Projected ship: {String(o.projected_ship_date)} · Required: {String(o.customer_request_date ?? "—")}</p> : null}
          </div>
        );
      })}
      {data.orders.length === 0 && <p className="text-sm text-slate-500">No open orders found.</p>}
    </div>
  );
}

function OrderDetailCard({ data }: { data: OrderTimeline }) {
  const o = data.order;
  return (
    <div>
      <div className="mb-3 text-sm text-slate-600">
        <span className="font-medium text-slate-900">{String(o.order_id ?? o.id)}</span>
        {" — "}{String(o.customer_name ?? "")} · {String(o.quantity ?? "—")} × {String(o.product_code ?? "")} · required {String(o.customer_request_date ?? "—")}
      </div>
      <ol className="space-y-2">
        {data.stages.map((s) => (
          <li key={s.key} className="flex gap-3">
            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${s.status === "completed" ? "bg-emerald-500" : s.status === "warning" ? "bg-amber-500" : s.status === "blocked" ? "bg-red-500" : "bg-slate-300"}`} />
            <div>
              <div className="text-sm font-medium text-slate-800">{s.label}</div>
              <div className="text-sm text-slate-500">{s.detail}</div>
            </div>
          </li>
        ))}
      </ol>
      {data.risk ? <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{String((data.risk as any).explanation ?? "")}</p> : null}
    </div>
  );
}

function PurchaseOrdersCard({ data }: { data: { shortages: unknown[]; proposals: any[] } }) {
  const pending = data.proposals.filter((p) => p.status === "PENDING_APPROVAL").length;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 text-slate-900">
        <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Material shortages</div><div className="text-lg font-semibold text-slate-900">{data.shortages.length}</div></div>
        <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Proposals awaiting approval</div><div className="text-lg font-semibold text-slate-900">{pending}</div></div>
      </div>
      {data.proposals.length > 0 && (
        <table className="w-full">
          <thead className="border-b border-slate-200"><tr><th className={th}>Proposal</th><th className={th}>Material</th><th className={th}>Qty</th><th className={th}>Status</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.proposals.slice(0, 8).map((p, i) => (
              <tr key={i}><td className={td}>{String(p.id ?? p.proposal_id ?? i)}</td><td className={td}>{String(p.material_id ?? "—")}</td><td className={td}>{num(p.quantity ?? p.qty)}</td>
                <td className={td}><span className={`rounded px-2 py-0.5 text-xs font-medium ${p.status === "APPROVED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{String(p.status ?? "")}</span></td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DeliveriesCard({ data }: { data: any }) {
  const rows = (data?.deliveries ?? []) as any[];
  if (rows.length === 0) return <p className="text-sm text-slate-500">No pending inbound deliveries are recorded.</p>;
  return (
    <table className="w-full">
      <thead className="border-b border-slate-200"><tr><th className={th}>Delivery</th><th className={th}>Material</th><th className={th}>Qty</th><th className={th}>Supplier</th><th className={th}>Expected</th><th className={th}>Status</th></tr></thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((r, i) => (
          <tr key={i}>
            <td className={td}>{String(r.delivery_ref ?? "—")}</td>
            <td className={td}><div className="font-medium">{String(r.material_name ?? "—")}</div><div className="text-xs text-slate-400">{String(r.material_sku ?? "")}</div></td>
            <td className={td}>{num(r.quantity)}</td>
            <td className={td}>{String(r.supplier_name ?? "—")}</td>
            <td className={td}>{String(r.expected_date ?? "—")}</td>
            <td className={td}><span className="rounded bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">{String(r.status ?? "").replace(/_/g, " ")}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MessageDraftCard({
  data,
  summary,
  onSelectOption,
}: {
  data: any;
  summary?: string | undefined;
  onSelectOption?: ((replyText: string) => void) | undefined;
}) {
  const draft = data ?? {};
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [sendError, setSendError] = useState<string | null>(null);
  const candidates = Array.isArray(draft.candidate_options) ? (draft.candidate_options as any[]) : [];

  const canSend = Boolean(draft.can_email_send) && typeof draft.recipient === "string" && draft.recipient.includes("@");
  const send = async () => {
    if (!window.confirm(`Send this email to ${draft.recipient}?`)) return;
    setSendState("sending");
    setSendError(null);
    try {
      const res = await opsApi.sendEmail({
        to: String(draft.recipient),
        subject: String(draft.subject ?? ""),
        body: String(draft.body ?? ""),
      });
      setSendState(res.sent ? "sent" : "failed");
      if (!res.sent) setSendError("The provider did not confirm sending.");
    } catch (err) {
      setSendState("failed");
      setSendError(err instanceof Error ? err.message : "Send failed.");
    }
  };

  if (draft.requires_clarification && !draft.body) {
    return (
      <div className="space-y-2">
        {summary && <p className="text-sm text-slate-700">{summary}</p>}
        {candidates.length > 0 && onSelectOption && (
          <div className="grid gap-2 sm:grid-cols-2">
            {candidates.map((c, idx) => (
              <button
                key={String(c.id ?? idx)}
                type="button"
                onClick={() => onSelectOption(String(c.reply_text ?? c.label ?? ""))}
                className="cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left hover:border-cyan-500 hover:bg-cyan-50"
              >
                <div className="text-xs font-semibold text-slate-900">{String(c.label ?? "")}</div>
                {c.subtitle && <div className="text-[11px] text-slate-500">{String(c.subtitle)}</div>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
        <span className={`rounded px-2 py-0.5 font-semibold ${sendState === "sent" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {sendState === "sent" ? "SENT" : "DRAFT ONLY — NOT SENT"}
        </span>
        {draft.recipient_confirmed === false && <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">Confirm recipient</span>}
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="text-xs text-slate-500">To: <span className="font-medium text-slate-800">{String(draft.recipient ?? "—")}</span></div>
        <div className="text-xs text-slate-500">Subject: <span className="font-medium text-slate-800">{String(draft.subject ?? "—")}</span></div>
        <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-slate-800">{String(draft.body ?? "")}</pre>
      </div>
      {draft.recipient_confirmed === false && candidates.length > 0 && onSelectOption && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {candidates.map((c, idx) => (
            <button
              key={String(c.id ?? idx)}
              type="button"
              onClick={() => onSelectOption(`Change recipient name to ${String(c.metadata?.full_name ?? c.reply_text ?? c.label)}`)}
              className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-cyan-500 hover:text-cyan-800"
            >
              Use {String(c.label ?? c.reply_text)}
            </button>
          ))}
        </div>
      )}
      {canSend && sendState !== "sent" && (
        <button
          onClick={() => void send()}
          disabled={sendState === "sending"}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
        >
          {sendState === "sending" ? "Sending…" : <><Send size={12} /> Send email</>}
        </button>
      )}
      {sendState === "sent" && <p className="mt-2 text-xs font-medium text-emerald-700">Email accepted by Gmail.</p>}
      {sendState === "failed" && <p className="mt-2 text-xs font-medium text-rose-600">{sendError ?? "Send failed."}</p>}
      {summary && <p className="mt-2 text-xs text-slate-500">{summary}</p>}
    </div>
  );
}

function InventorySummaryCard({ data }: { data: any }) {
  const items = (data.materials ?? data.items ?? []) as any[];
  const low = num(data.low_stock_count); const oos = num(data.out_of_stock_count); const total = num(data.total_materials);
  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-3 text-slate-900">
        {[["Products tracked", total], ["Low stock", low], ["Out of stock", oos]].map(([k, v]) => (
          <div key={String(k)} className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{k}</div><div className="text-lg font-semibold text-slate-900">{v}</div></div>
        ))}
      </div>
      {items.length > 0 && (
        <div>
          <div className="max-h-96 overflow-x-auto overflow-y-auto">
            <table className="w-full text-slate-800">
              <thead className="sticky top-0 border-b border-slate-200 bg-white"><tr><th className={th}>Product</th><th className={th}>On hand</th><th className={th}>Reserved</th><th className={th}>Available</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((it, i) => (
                  <tr key={i}>
                    <td className={td}><div className="font-medium text-slate-900">{String(it.name ?? it.material_name ?? it.id ?? "—")}</div><div className="text-xs text-slate-400">{String(it.sku ?? it.material_id ?? "")}</div></td>
                    <td className={td}>{num(it.on_hand_qty ?? it.on_hand)}</td>
                    <td className={td}>{num(it.allocated_qty ?? it.reserved ?? it.allocated)}</td>
                    <td className={td}>{num(it.physical_available ?? it.available_qty ?? it.net_availability ?? it.net_available ?? it.available)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
            Showing {items.length} catalog item{items.length === 1 ? "" : "s"}
          </div>
        </div>
      )}
    </div>
  );
}

export function OpsCardView({
  card,
  onSelectOption,
}: {
  card: OpsCard;
  onSelectOption?: ((replyText: string) => void) | undefined;
}) {
  const body = useMemo(() => {
    const d = card.data;
    switch (card.card_type) {
      case "inventory_summary": return <InventorySummaryCard data={d as any} />;
      case "shortages": return <ShortagesCard data={d} />;
      case "material_detail": return <MaterialDetailCard data={d} />;
      case "warehouse": return <WarehouseCard data={d as WarehouseOverview} />;
      case "material_location": return <MaterialLocationCard data={d as { material: any; balance: any | null; locations: StorageBin[] }} />;
      case "suppliers": return <SuppliersTable suppliers={(d as { suppliers: SupplierPerf[] }).suppliers ?? []} />;
      case "supplier_compare": return <SupplierCompareCard data={d as { a: SupplierDetail; b: SupplierDetail }} />;
      case "order_risks": return <OrderRisksCard data={d as { orders: any[] }} />;
      case "order_detail": return <OrderDetailCard data={d as OrderTimeline} />;
      case "purchase_orders": return <PurchaseOrdersCard data={d as { shortages: unknown[]; proposals: any[] }} />;
      case "deliveries": return <DeliveriesCard data={d} />;
      case "message_draft": return <MessageDraftCard data={d} summary={card.summary} onSelectOption={onSelectOption} />;
      default: return <p className="text-sm text-slate-500">{card.summary ?? "Ask about stock, storage, suppliers, orders, or purchase orders."}</p>;
    }
  }, [card, onSelectOption]);

  return (
    <div className={CARD_CLS}>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-900">{card.title}</h4>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">live data</span>
      </div>
      {body}
    </div>
  );
}

function ShortagesCard({ data }: { data: unknown }) {
  const list = Array.isArray(data) ? data : ((data as { shortages?: unknown[] })?.shortages ?? []);
  const rows = list as any[];
  if (rows.length === 0) return <p className="text-sm text-slate-500">No material shortages detected.</p>;
  return (
    <table className="w-full">
      <thead className="border-b border-slate-200"><tr><th className={th}>Material</th><th className={th}>On hand</th><th className={th}>Incoming</th><th className={th}>Net available</th><th className={th}>Unmet demand</th><th className={th}>Suggested buy</th></tr></thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((r, i) => (
          <tr key={i}>
            <td className={td}><div className="font-medium">{String(r.material_name ?? r.material_id ?? r.name ?? "—")}</div><div className="text-xs text-slate-400">{String(r.sku ?? r.material_id ?? "")}</div></td>
            <td className={td}>{num(r.on_hand ?? r.on_hand_qty)}</td>
            <td className={td}>{num(r.incoming ?? r.incoming_qty)}</td>
            <td className={td}>{num(r.net_availability ?? r.available_qty ?? r.available)}</td>
            <td className={`${td} font-semibold text-red-600`}>{num(r.unmet_order_demand ?? r.shortage_qty ?? r.shortage)}</td>
            <td className={td}>{num(r.recommended_purchase_qty ?? r.recommended_qty)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MaterialDetailCard({ data }: { data: unknown }) {
  const d = (data ?? {}) as Record<string, unknown>;
  if ("sku" in d || "on_hand" in d || "physical_available" in d) {
    const unit = d["unit"] ? ` ${String(d["unit"])}` : "";
    const onHand = num(d["on_hand_qty"] ?? d["on_hand"]);
    const alloc = num(d["allocated_qty"] ?? d["reserved"] ?? d["allocated"]);
    const avail = num(d["physical_available"] ?? d["available_qty"] ?? Math.max(0, onHand - alloc));
    const incoming = num(d["incoming_qty"] ?? d["incoming"]);
    const netAvail = num(d["net_availability"] ?? d["net_available"] ?? onHand + incoming - alloc);
    const rawBins = d["warehouse_locations"];
    const bins = Array.isArray(rawBins) && rawBins.length > 0 ? rawBins.join(", ") : "Warehouse";
    const rows: [string, string][] = [
      ["Material ID / SKU", `${String(d["id"] ?? "—")} · ${String(d["sku"] ?? "—")}`],
      ["Category", String(d["category"] ?? "General")],
      ["On Hand", `${onHand}${unit}`],
      ["Allocated / Reserved", `${alloc}${unit}`],
      ["Physically Available", `${avail}${unit}`],
      ["Incoming Supply", `+${incoming}${unit}`],
      ["Projected Net Availability", `${netAvail}${unit}`],
      ["Reorder Threshold", `${num(d["reorder_threshold"])}${unit}`],
      ["Status", String(d["stock_status"] ?? "—").replace(/_/g, " ")],
      ["Supplier", String(d["supplier_name"] ?? "—")],
      ["Warehouse Locations", bins],
    ];
    return (
      <div className="space-y-1.5 text-sm text-slate-800">
        {rows.map(([label, val]) => (
          <div key={label} className="flex justify-between gap-4 border-b border-slate-100 py-1">
            <span className="text-slate-500">{label}</span>
            <span className={`font-medium text-right ${label === "Physically Available" && avail <= 0 ? "text-rose-600" : "text-slate-900"}`}>
              {val}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-2 text-sm text-slate-700">
      {Object.entries(d).slice(0, 12).map(([k, v]) => (
        <div key={k} className="flex justify-between border-b border-slate-100 py-1">
          <span className="text-slate-500">{k.replace(/_/g, " ")}</span>
          <span className="font-medium text-slate-900">{typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}</span>
        </div>
      ))}
    </div>
  );
}
