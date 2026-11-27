import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Sheet, FileSpreadsheet, Building2, Truck, Calculator, PlugZap,
  CheckCircle2, AlertCircle, Clock, Mail,
} from "lucide-react";
import { opsApi } from "@/services/opsApi";

export const Route = createFileRoute("/integrations")({ component: IntegrationsPage });

type ConnStatus = "connected" | "not_connected" | "connection_required" | "error";

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: typeof Sheet;
  status: ConnStatus;
  lastSync?: string | null;
  requirements: string[];
  configOptions: string[];
}

// Honest status: none of these external integrations are implemented yet.
// The architecture below is designed so real connectors can be added per-provider.
const INTEGRATIONS: Integration[] = [
  {
    id: "google-sheets",
    name: "Google Sheets",
    description: "Import/export inventory balances, orders and supplier records via a configured spreadsheet.",
    icon: Sheet,
    status: "connection_required",
    requirements: ["Google account authorization (OAuth 2.0)", "Spreadsheet ID shared with the service account"],
    configOptions: ["Spreadsheet ID", "Sync direction (import / export / both)", "Sync interval"],
  },
  {
    id: "excel",
    name: "Microsoft Excel / CSV",
    description: "Upload or poll Excel workbooks and CSV exports for inventory and order data.",
    icon: FileSpreadsheet,
    status: "connection_required",
    requirements: ["File upload or network share access", "Column mapping configuration"],
    configOptions: ["File source", "Column mapping", "Header row"],
  },
  {
    id: "erp",
    name: "ERP Systems",
    description: "Two-way sync with ERP platforms (SAP, Oracle NetSuite, Microsoft Dynamics) for materials, orders and POs.",
    icon: Building2,
    status: "connection_required",
    requirements: ["ERP endpoint URL", "API credentials or certificate", "Network allow-listing"],
    configOptions: ["Endpoint URL", "Auth method", "Entity mapping"],
  },
  {
    id: "supplier-apis",
    name: "Supplier APIs",
    description: "Pull live lead times, pricing and confirmation status directly from supplier systems.",
    icon: Truck,
    status: "connection_required",
    requirements: ["Per-supplier API credentials", "Supplier onboarding approval"],
    configOptions: ["Supplier endpoint", "API key", "Refresh interval"],
  },
  {
    id: "logistics",
    name: "Logistics Services",
    description: "Track shipments and carrier ETAs from freight providers to refine delivery forecasts.",
    icon: Truck,
    status: "connection_required",
    requirements: ["Carrier API account", "Webhook or polling endpoint"],
    configOptions: ["Carrier", "Tracking mode", "ETA refresh"],
  },
  {
    id: "accounting",
    name: "Accounting Systems",
    description: "Post purchase orders and receipts into accounting ledgers (QuickBooks, Xero, Tally).",
    icon: Calculator,
    status: "connection_required",
    requirements: ["Accounting API credentials", "Chart-of-accounts mapping"],
    configOptions: ["System", "Credentials", "Posting rules"],
  },
];

const STATUS_META: Record<ConnStatus, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  connected: { label: "Connected", cls: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  not_connected: { label: "Not connected", cls: "bg-slate-100 text-slate-600", icon: AlertCircle },
  connection_required: { label: "Connection required", cls: "bg-amber-50 text-amber-700", icon: Clock },
  error: { label: "Error", cls: "bg-red-50 text-red-700", icon: AlertCircle },
};

function IntegrationsPage() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<{ connected: boolean; sender?: string | null; note?: string } | null>(null);

  useEffect(() => {
    opsApi.emailStatus().then(setEmailStatus).catch(() => setEmailStatus({ connected: false }));
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Integrations</h1>
        <p className="mt-1 text-sm text-slate-500">
          Connect external systems so ResolveX can exchange inventory, orders and supplier data.
          Integrations are enabled one provider at a time through a controlled backend connector layer —
          credentials are stored server-side only and never in the browser.
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <PlugZap className="mt-0.5 h-5 w-5 text-cyan-600" />
          <div className="text-sm text-slate-600">
            <span className="font-medium text-slate-900">How it works:</span> each connector implements a
            standard interface (<code className="rounded bg-slate-100 px-1 text-xs">fetch</code>,{" "}
            <code className="rounded bg-slate-100 px-1 text-xs">push</code>,{" "}
            <code className="rounded bg-slate-100 px-1 text-xs">sync</code>,{" "}
            <code className="rounded bg-slate-100 px-1 text-xs">health</code>) on the backend. The assistant
            can only invoke connectors that are implemented and authenticated — nothing runs on unverified data.
          </div>
        </div>
      </div>

      {/* Gmail — live status from the backend email service */}
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Mail size={20} /></div>
            <div>
              <h3 className="font-semibold text-slate-900">Email — Gmail</h3>
              <p className="text-xs text-slate-500">
                Send drafted emails through your own Gmail account via OAuth 2.0. Passwords are never requested or stored; tokens stay server-side.
              </p>
            </div>
          </div>
          <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            emailStatus?.connected ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}>
            {emailStatus?.connected ? <CheckCircle2 size={11} /> : <Clock size={11} />}
            {emailStatus?.connected ? `Connected${emailStatus.sender ? ` — ${emailStatus.sender}` : ""}` : "Connection required"}
          </span>
        </div>
        <p className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
          {emailStatus?.note ?? "Checking connection status…"}
          {" "}To enable: create OAuth credentials in Google Cloud, grant the gmail.send scope, and set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_SENDER and GMAIL_REFRESH_TOKEN in backend/.env. Every send requires explicit confirmation and reports the provider's real result.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {INTEGRATIONS.map((it) => {
          const meta = STATUS_META[it.status];
          const Icon = it.icon;
          const StatusIcon = meta.icon;
          const open = expanded === it.id;
          return (
            <div key={it.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Icon size={20} /></div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{it.name}</h3>
                    <p className="text-xs text-slate-500">{it.description}</p>
                  </div>
                </div>
                <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.cls}`}>
                  <StatusIcon size={11} /> {meta.label}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-slate-400">Last sync: {it.lastSync ?? "Never"}</span>
                <button
                  onClick={() => setExpanded(open ? null : it.id)}
                  className="text-xs font-medium text-cyan-700 hover:underline"
                >
                  {open ? "Hide details" : "Connection details"}
                </button>
              </div>
              {open && (
                <div className="mt-3 space-y-3 border-t border-slate-100 pt-3 text-xs">
                  <div>
                    <div className="mb-1 font-semibold uppercase tracking-wide text-slate-500">Requirements</div>
                    <ul className="list-inside list-disc space-y-0.5 text-slate-600">{it.requirements.map((r) => <li key={r}>{r}</li>)}</ul>
                  </div>
                  <div>
                    <div className="mb-1 font-semibold uppercase tracking-wide text-slate-500">Configuration</div>
                    <div className="flex flex-wrap gap-1.5">{it.configOptions.map((c) => <span key={c} className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">{c}</span>)}</div>
                  </div>
                  <p className="rounded-lg bg-amber-50 p-2 text-amber-800">
                    This integration is not yet implemented. It will show "Connected" only after credentials are configured and a health check passes.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
