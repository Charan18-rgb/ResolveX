/**
 * Operations API client — warehouse, suppliers, orders, and conversational ops queries.
 * All data comes from deterministic backend calculations over real SQLite records.
 */
import { ENV_CONFIG } from "../config/env";
import { ApiServiceError } from "./api";

function base(baseUrl?: string): string {
  return (baseUrl ?? ENV_CONFIG.apiBaseUrl).trim().replace(/\/+$/, "") || ENV_CONFIG.apiBaseUrl;
}

async function req<T>(path: string, init?: RequestInit, baseUrl?: string): Promise<T> {
  const res = await fetch(`${base(baseUrl)}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!res.ok) {
    const detail = (body as { detail?: string })?.detail ?? `Request failed (${res.status})`;
    throw new ApiServiceError(detail, { status: res.status, code: `HTTP_${res.status}` });
  }
  return body as T;
}

export interface WarehouseZone {
  zone_code: string; bin_count: number; capacity_units: number;
  stored_units: number; incoming_units: number; free_units: number; utilization_pct: number;
}
export interface WarehouseOverview {
  warehouse: { id: string; code: string; name: string } | null;
  zones: WarehouseZone[];
  totals: { bin_count: number; capacity_units: number; stored_units: number; incoming_units: number; utilization_pct: number };
}
export interface StorageBin {
  id: string; zone_code: string; rack_code: string; shelf_code: string;
  position_index: number; capacity_units: number; material_id: string | null;
  stored_qty: number; incoming_qty: number; status: string;
  material_name?: string | null; material_sku?: string | null; material_unit?: string | null;
}
export interface MaterialLocation {
  material: any & { id: string; name?: string; sku?: string; unit?: string };
  balance: any | null;
  locations: StorageBin[];
}
export interface SupplierPerf {
  supplier_id: string; supplier_name: string; lead_time_days: number | null;
  total_deliveries: number; delivered: number; on_time: number; late: number;
  failed: number; cancelled: number; pending: number;
  on_time_rate: number | null; avg_delay_days: number; last_delivery_date: string | null;
  sample_note: string;
}
export interface SupplierDelivery {
  id: number; delivery_ref: string; material_id: string; material_name?: string;
  quantity: number; expected_date: string; actual_date: string | null;
  status: string; delay_days: number;
}
export interface SupplierDetail { supplier: any; performance: SupplierPerf | null; deliveries: SupplierDelivery[]; }

export interface OrderTimelineStage { key: string; label: string; status: string; detail: string; evidence: string; }
export interface OrderTimeline {
  order: any & { id?: string; order_id?: string; customer_name?: string; product_code?: string; quantity?: number; customer_request_date?: string; status?: string };
  allocations: any[]; related_proposals: any[];
  risk: any | null; stages: OrderTimelineStage[]; computed_at: string | null;
}
export interface OpsCard { card_type: string; title: string; summary?: string; data: unknown; }

export const opsApi = {
  warehouseOverview: (b?: string) => req<WarehouseOverview>("/api/warehouse/overview", undefined, b),
  warehouseLocations: (materialId?: string, b?: string) =>
    req<{ locations: StorageBin[] }>(`/api/warehouse/locations${materialId ? `?material_id=${encodeURIComponent(materialId)}` : ""}`, undefined, b),
  materialLocation: (ref: string, b?: string) => req<MaterialLocation>(`/api/warehouse/materials/${encodeURIComponent(ref)}/location`, undefined, b),
  suppliers: (b?: string) => req<{ suppliers: SupplierPerf[] }>("/api/suppliers", undefined, b),
  supplierDetail: (ref: string, b?: string) => req<SupplierDetail>(`/api/suppliers/${encodeURIComponent(ref)}`, undefined, b),
  compareSuppliers: (a: string, bId: string, b?: string) =>
    req<{ a: SupplierDetail; b: SupplierDetail }>(`/api/suppliers/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(bId)}`, undefined, b),
  orderTimeline: (orderId: string, b?: string) => req<OrderTimeline>(`/api/orders/${encodeURIComponent(orderId)}/timeline`, undefined, b),
  query: (question: string, b?: string, context?: Record<string, any>) =>
    req<OpsCard>("/api/ops/query", { method: "POST", body: JSON.stringify({ question, context: context ?? null }) }, b),
};
