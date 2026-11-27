import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, Package, Box, Map as MapIcon } from "lucide-react";
import { useResolveX } from "@/context/useResolveX";
import { opsApi, type StorageBin, type WarehouseOverview } from "@/services/opsApi";
import { WarehouseScene3D } from "@/components/warehouse/WarehouseScene3D";

export const Route = createFileRoute("/warehouse")({
  validateSearch: (s: any): { material?: string; view?: "2d" | "3d" } => ({
    ...(typeof s["material"] === "string" ? { material: s["material"] } : {}),
    ...(s["view"] === "2d" || s["view"] === "3d" ? { view: s["view"] as "2d" | "3d" } : {}),
  }),
  component: WarehousePage,
});

const STATUS_COLOR: Record<string, string> = {
  AVAILABLE: "#0ea5e9",
  OCCUPIED: "#f59e0b",
  RESERVED: "#8b5cf6",
  INCOMING: "#10b981",
  RESTRICTED: "#ef4444",
};

function WarehousePage() {
  const { settings } = useResolveX();
  const [overview, setOverview] = useState<WarehouseOverview | null>(null);
  const [bins, setBins] = useState<StorageBin[]>([]);
  const [selected, setSelected] = useState<StorageBin | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"3d" | "2d">("3d");

  // Deep-link support: /warehouse?material=MAT-CHIP&view=2d
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get("material");
    const v = params.get("view");
    if (m) setQuery(m);
    if (v === "2d" || v === "3d") setViewMode(v);
  }, []);

  useEffect(() => {
    Promise.all([opsApi.warehouseOverview(settings.apiBaseUrl), opsApi.warehouseLocations(undefined, settings.apiBaseUrl)])
      .then(([o, l]) => { setOverview(o); setBins(l.locations); })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load warehouse data."));
  }, [settings.apiBaseUrl]);

  const highlightMat = useMemo(() => query.trim().toUpperCase(), [query]);
  const highlighted = useMemo(
    () => new Set(bins.filter((b) => b.material_id && (b.material_id === highlightMat || (b.material_sku ?? "").toUpperCase() === highlightMat || (b.material_name ?? "").toUpperCase().includes(highlightMat))).map((b) => b.id)),
    [bins, highlightMat],
  );

  const zones = useMemo(() => {
    const map = new Map<string, StorageBin[]>();
    for (const b of bins) {
      const arr = map.get(b.zone_code) ?? [];
      arr.push(b);
      map.set(b.zone_code, arr);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [bins]);

  const t = overview?.totals;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Warehouse</h1>
          <p className="text-sm text-slate-500">{overview?.warehouse?.name ?? "Storage facility"} — interactive storage map from configured warehouse records (seeded demonstration layout).</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find product (e.g. MAT-CHIP)" className="w-64 rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-cyan-500" />
          </div>
          <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
            <button onClick={() => setViewMode("3d")} className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${viewMode === "3d" ? "bg-cyan-600 text-white" : "text-slate-600"}`}><Box size={13} /> 3D</button>
            <button onClick={() => setViewMode("2d")} className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${viewMode === "2d" ? "bg-cyan-600 text-white" : "text-slate-600"}`}><MapIcon size={13} /> 2D</button>
          </div>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {t && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["Capacity", `${t.capacity_units} units`], ["Occupied", `${t.stored_units} units`], ["Free space", `${t.capacity_units - t.stored_units} units`], ["Utilization", `${t.utilization_pct}%`]].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">{k}</div><div className="text-xl font-semibold text-slate-900">{v}</div></div>
          ))}
        </div>
      )}

      {viewMode === "3d" ? (
        <div className="mb-6">
          <WarehouseScene3D
            bins={bins}
            highlightMaterial={highlightMat || null}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
          />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {viewMode === "2d" && (
        <div className="space-y-6 lg:col-span-2">
          {zones.map(([zone, zoneBins]) => (
            <section key={zone} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">Zone {zone}</h2>
                <span className="text-xs text-slate-500">{zoneBins.length} bins</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {zoneBins.map((b) => {
                  const isHi = highlighted.has(b.id);
                  const fill = Math.min(100, b.capacity_units > 0 ? (b.stored_qty / b.capacity_units) * 100 : 0);
                  return (
                    <button
                      key={b.id}
                      onClick={() => setSelected(b)}
                      title={`${b.material_name ?? b.material_sku ?? "Empty"} — ${b.stored_qty}/${b.capacity_units}`}
                      className={`flex h-14 w-14 flex-col items-center justify-center rounded-lg border text-[10px] font-medium transition ${selected?.id === b.id ? "ring-2 ring-cyan-500" : ""} ${isHi ? "ring-2 ring-emerald-500" : ""}`}
                      style={{ borderColor: STATUS_COLOR[b.status] ?? "#cbd5e1", backgroundColor: `${STATUS_COLOR[b.status] ?? "#cbd5e1"}22` }}
                    >
                      <span className="text-slate-700">{b.rack_code}-{b.shelf_code}</span>
                      <span className="text-slate-500">{Math.round(fill)}%</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
            {Object.entries(STATUS_COLOR).map(([k, c]) => (
              <span key={k} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded" style={{ backgroundColor: c }} />{k}</span>
            ))}
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded ring-2 ring-emerald-500" />Search match</span>
          </div>
        </div>
        )}

        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-4">
          {selected ? (
            <>
              <h3 className="font-semibold text-slate-900">Zone {selected.zone_code} — Rack {selected.rack_code} / Shelf {selected.shelf_code}</h3>
              <dl className="mt-3 space-y-2 text-sm">
                {[
                  ["Product", selected.material_name ?? "Empty bin"],
                  ["SKU", selected.material_sku ?? "—"],
                  ["Stored", `${selected.stored_qty} ${selected.material_unit ?? "units"}`],
                  ["Capacity", `${selected.capacity_units} units`],
                  ["Occupied", `${selected.capacity_units > 0 ? Math.round((selected.stored_qty / selected.capacity_units) * 100) : 0}%`],
                  ["Incoming", `${selected.incoming_qty} units`],
                  ["Status", selected.status],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-slate-100 py-1.5"><dt className="text-slate-500">{k}</dt><dd className="font-medium text-slate-900">{v}</dd></div>
                ))}
              </dl>
            </>
          ) : (
            <div className="py-8 text-center text-sm text-slate-500">
              <Package className="mx-auto mb-2 text-slate-300" size={28} />
              Select a bin to see product, quantity and capacity details.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
