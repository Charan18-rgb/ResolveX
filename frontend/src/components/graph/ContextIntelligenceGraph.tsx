import {
  ArrowRight,
  Box,
  CalendarClock,
  CheckCircle2,
  GitBranch,
  HelpCircle,
  Link2,
  MapPin,
  Maximize2,
  Play,
  Sparkles,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type {
  ContextGraphNode,
  ContextIntelligenceGraphData,
  GraphNodeKind,
  GraphNodeState,
} from "@/types/resolvex";
import { Badge, type BadgeTone } from "../resolvex/Badge";
import { Button } from "../resolvex/Button";
import { Card } from "../resolvex/Card";

const KIND_META: Record<
  GraphNodeKind,
  {
    label: string;
    tone: BadgeTone;
    stroke: string;
    bg: string;
    icon: typeof Play;
  }
> = {
  action: {
    label: "Action",
    tone: "violet",
    stroke: "#a78bfa",
    bg: "rgba(139, 92, 246, 0.16)",
    icon: Play,
  },
  person: {
    label: "Person / Actor",
    tone: "cyan",
    stroke: "#22d3ee",
    bg: "rgba(6, 182, 212, 0.16)",
    icon: Users,
  },
  object: {
    label: "Object / Entity",
    tone: "slate",
    stroke: "#818cf8",
    bg: "rgba(99, 102, 241, 0.16)",
    icon: Box,
  },
  date: {
    label: "Date / Timing",
    tone: "rose",
    stroke: "#fb7185",
    bg: "rgba(244, 63, 94, 0.15)",
    icon: CalendarClock,
  },
  location: {
    label: "Location / Scope",
    tone: "emerald",
    stroke: "#34d399",
    bg: "rgba(16, 185, 129, 0.15)",
    icon: MapPin,
  },
  ambiguous_reference: {
    label: "Ambiguous Ref",
    tone: "amber",
    stroke: "#fbbf24",
    bg: "rgba(245, 158, 11, 0.16)",
    icon: HelpCircle,
  },
};

const STATE_META: Record<GraphNodeState, { label: string; tone: BadgeTone; ringStroke: string }> = {
  ambiguous: {
    label: "Ambiguous",
    tone: "amber",
    ringStroke: "#f59e0b",
  },
  unresolved: {
    label: "Unresolved",
    tone: "slate",
    ringStroke: "#94a3b8",
  },
  resolved: {
    label: "Resolved",
    tone: "emerald",
    ringStroke: "#10b981",
  },
};

const NODE_WIDTH = 166;
const NODE_HEIGHT = 68;

interface ContextIntelligenceGraphProps {
  graph: ContextIntelligenceGraphData;
  onClarifyNode?: ((questionId: string) => void) | undefined;
  onOpenInterpretations?: (() => void) | undefined;
  title?: string | undefined;
}

export function ContextIntelligenceGraph({
  graph,
  onClarifyNode,
  onOpenInterpretations,
  title = "Context Intelligence Graph",
}: ContextIntelligenceGraphProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<GraphNodeState | "all">("all");
  const [kindFilter, setKindFilter] = useState<GraphNodeKind | "all">("all");

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragOriginRef = useRef<{
    pointerX: number;
    pointerY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.08 : -0.08;
      setZoom((z) => Math.max(0.6, Math.min(1.8, Number((z + delta).toFixed(2)))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const selectedNode: ContextGraphNode | null = useMemo(() => {
    if (selectedNodeId === "__closed__") return null;
    if (selectedNodeId) {
      const matched = graph.nodes.find((n) => n.id === selectedNodeId);
      if (matched) return matched;
    }
    return graph.nodes.find((n) => n.state === "ambiguous") ?? graph.nodes[0] ?? null;
  }, [graph.nodes, selectedNodeId]);

  const focusNodeId = hoveredNodeId ?? selectedNode?.id ?? null;

  const connectedNodeIds = useMemo(() => {
    const set = new Set<string>();
    if (!focusNodeId) return set;
    set.add(focusNodeId);
    for (const edge of graph.edges) {
      if (edge.source === focusNodeId) set.add(edge.target);
      if (edge.target === focusNodeId) set.add(edge.source);
    }
    return set;
  }, [focusNodeId, graph.edges]);

  const selectedNodeRelations = useMemo(() => {
    if (!selectedNode) return [];
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    return graph.edges
      .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
      .map((edge) => {
        const isOutgoing = edge.source === selectedNode.id;
        const otherId = isOutgoing ? edge.target : edge.source;
        return {
          edge,
          direction: isOutgoing ? ("outgoing" as const) : ("incoming" as const),
          otherNode: nodeById.get(otherId) ?? null,
        };
      });
  }, [graph.edges, graph.nodes, selectedNode]);

  const handleZoomIn = () => setZoom((z) => Math.min(1.8, Number((z + 0.15).toFixed(2))));
  const handleZoomOut = () => setZoom((z) => Math.max(0.6, Number((z - 0.15).toFixed(2))));
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setStateFilter("all");
    setKindFilter("all");
  };

  const handlePointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if ((e.target as HTMLElement).closest('[data-graph-node="true"]')) return;
    setIsDragging(true);
    dragOriginRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!isDragging || !dragOriginRef.current) return;
    const dx = e.clientX - dragOriginRef.current.pointerX;
    const dy = e.clientY - dragOriginRef.current.pointerY;
    setPan({
      x: dragOriginRef.current.startPanX + dx,
      y: dragOriginRef.current.startPanY + dy,
    });
  };

  const handlePointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    dragOriginRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const nodeMap = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base sm:text-lg font-semibold text-white">{title}</h3>
            <Badge tone="cyan">Avg Uncertainty {graph.summary.averageUncertainty}%</Badge>
          </div>
          <p className="text-xs text-slate-400">
            Click any node to inspect meaning, semantic relationships, uncertainty, and
            interpretations. Drag canvas to pan or scroll to zoom.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="amber">{graph.summary.ambiguousCount} Ambiguous</Badge>
          <Badge tone="slate">{graph.summary.unresolvedCount} Unresolved</Badge>
          <Badge tone="emerald">{graph.summary.resolvedCount} Resolved</Badge>
          {(graph.summary.contradictoryCount ?? 0) > 0 && (
            <Badge tone="rose">{graph.summary.contradictoryCount} Contradictory</Badge>
          )}
          {(graph.summary.missingContextCount ?? 0) > 0 && (
            <Badge tone="amber">{graph.summary.missingContextCount} Missing Ctx</Badge>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#050814]/75 px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: "all", label: "All States" },
              { id: "ambiguous", label: "Ambiguous" },
              { id: "unresolved", label: "Unresolved" },
              { id: "resolved", label: "Resolved" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setStateFilter(item.id)}
              className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                stateFilter === item.id
                  ? "bg-violet-500/25 text-white border border-violet-400/40"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              {item.label}
            </button>
          ))}

          <span className="mx-1 h-4 w-px bg-white/10" aria-hidden="true" />

          <select
            aria-label="Filter graph by node category"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as GraphNodeKind | "all")}
            className="rounded-lg border border-white/12 bg-[#0a0f1f] px-2.5 py-1 text-xs text-slate-200 focus:border-cyan-400/60 focus:outline-none"
          >
            <option value="all">All Node Types</option>
            <option value="action">Actions</option>
            <option value="person">People</option>
            <option value="object">Objects</option>
            <option value="date">Dates / Timing</option>
            <option value="location">Locations / Scopes</option>
            <option value="ambiguous_reference">Ambiguous References</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleZoomOut}
            aria-label="Zoom out graph"
            className="cursor-pointer rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-300 hover:border-white/25 hover:text-white"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-11 text-center font-mono text-xs text-slate-300">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            aria-label="Zoom in graph"
            className="cursor-pointer rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-300 hover:border-white/25 hover:text-white"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleResetView}
            aria-label="Reset graph view"
            className="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 hover:border-white/25 hover:text-white"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
        <div
          className={`relative overflow-hidden rounded-2xl border border-white/10 bg-[#040712] ${
            selectedNode ? "xl:col-span-8" : "xl:col-span-12"
          }`}
        >
          <svg
            ref={svgRef}
            viewBox="0 0 860 470"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className={`h-[390px] sm:h-[450px] w-full select-none touch-none ${
              isDragging ? "cursor-grabbing" : "cursor-grab"
            }`}
            role="img"
            aria-label="Interactive Context Intelligence Graph"
          >
            <defs>
              <marker
                id="rx-arrow-default"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#64748b" />
              </marker>
              <marker
                id="rx-arrow-active"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#22d3ee" />
              </marker>
              <marker
                id="rx-arrow-resolved"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#10b981" />
              </marker>
            </defs>

            <g
              transform={`translate(${pan.x} ${pan.y}) translate(430 235) scale(${zoom}) translate(-430 -235)`}
            >
              {graph.edges.map((edge) => {
                const sourceNode = nodeMap.get(edge.source);
                const targetNode = nodeMap.get(edge.target);
                if (!sourceNode || !targetNode) return null;

                const isHighlighted =
                  focusNodeId !== null &&
                  (edge.source === focusNodeId || edge.target === focusNodeId);
                const isDimmed = focusNodeId !== null && !isHighlighted;

                const dx = targetNode.x - sourceNode.x;
                const dy = targetNode.y - sourceNode.y;
                const dist = Math.hypot(dx, dy) || 1;
                const padStart = 52;
                const padEnd = 56;
                const x1 = sourceNode.x + (dx / dist) * padStart;
                const y1 = sourceNode.y + (dy / dist) * (padStart * 0.6);
                const x2 = targetNode.x - (dx / dist) * padEnd;
                const y2 = targetNode.y - (dy / dist) * (padEnd * 0.6);
                const midX = (x1 + x2) / 2;
                const midY = (y1 + y2) / 2;

                const strokeColor = isHighlighted
                  ? "#22d3ee"
                  : edge.state === "resolved"
                    ? "rgba(16, 185, 129, 0.55)"
                    : edge.state === "ambiguous"
                      ? "rgba(245, 158, 11, 0.5)"
                      : "rgba(148, 163, 184, 0.4)";

                const markerEnd = isHighlighted
                  ? "url(#rx-arrow-active)"
                  : edge.state === "resolved"
                    ? "url(#rx-arrow-resolved)"
                    : "url(#rx-arrow-default)";

                return (
                  <g
                    key={edge.id}
                    opacity={isDimmed ? 0.24 : 1}
                    style={{ transition: "opacity 180ms ease" }}
                  >
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={strokeColor}
                      strokeWidth={isHighlighted ? 2.4 : 1.6}
                      strokeDasharray={edge.state === "ambiguous" ? "5 4" : undefined}
                      markerEnd={markerEnd}
                    />
                    <rect
                      x={midX - 42}
                      y={midY - 10}
                      width={84}
                      height={19}
                      rx={9}
                      fill="#070b1a"
                      stroke={
                        isHighlighted ? "rgba(34, 211, 238, 0.55)" : "rgba(255, 255, 255, 0.12)"
                      }
                    />
                    <text
                      x={midX}
                      y={midY + 3}
                      textAnchor="middle"
                      fill={isHighlighted ? "#a5f3fc" : "#94a3b8"}
                      fontSize="10"
                      fontFamily="ui-monospace, monospace"
                    >
                      {edge.label}
                    </text>
                  </g>
                );
              })}

              {graph.nodes.map((node) => {
                const kindMeta = KIND_META[node.kind];
                const stateMeta = STATE_META[node.state];
                const isSelected = selectedNode?.id === node.id;
                const isConnected = connectedNodeIds.has(node.id);
                const matchesFilter =
                  (stateFilter === "all" || node.state === stateFilter) &&
                  (kindFilter === "all" || node.kind === kindFilter);

                const dimmedBySelection = focusNodeId !== null && !isConnected;
                const opacity = !matchesFilter ? 0.2 : dimmedBySelection ? 0.35 : 1;

                const left = node.x - NODE_WIDTH / 2;
                const top = node.y - NODE_HEIGHT / 2;

                const shortLabel =
                  node.label.length > 20 ? `${node.label.slice(0, 18)}…` : node.label;

                return (
                  <g
                    key={node.id}
                    data-graph-node="true"
                    transform={`translate(${left} ${top})`}
                    opacity={opacity}
                    onClick={() => setSelectedNodeId(node.id)}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                    className="cursor-pointer"
                    style={{ transition: "opacity 180ms ease" }}
                  >
                    {isSelected && (
                      <rect
                        x={-5}
                        y={-5}
                        width={NODE_WIDTH + 10}
                        height={NODE_HEIGHT + 10}
                        rx={17}
                        fill="none"
                        stroke="#22d3ee"
                        strokeWidth={2}
                        opacity={0.85}
                      />
                    )}

                    <rect
                      x={0}
                      y={0}
                      width={NODE_WIDTH}
                      height={NODE_HEIGHT}
                      rx={13}
                      fill="#0b1124"
                      stroke={isSelected ? "#22d3ee" : stateMeta.ringStroke}
                      strokeWidth={isSelected ? 2 : 1.6}
                      strokeDasharray={
                        node.state === "ambiguous"
                          ? "6 3"
                          : node.state === "unresolved"
                            ? "3 3"
                            : undefined
                      }
                    />

                    <rect
                      x={0}
                      y={0}
                      width={5}
                      height={NODE_HEIGHT}
                      rx={3}
                      fill={kindMeta.stroke}
                    />

                    <text
                      x={14}
                      y={19}
                      fill={kindMeta.stroke}
                      fontSize="9.5"
                      fontWeight="600"
                      fontFamily="ui-monospace, monospace"
                    >
                      {kindMeta.label.toUpperCase()}
                    </text>
                    <text
                      x={NODE_WIDTH - 10}
                      y={19}
                      textAnchor="end"
                      fill={
                        node.state === "resolved"
                          ? "#6ee7b7"
                          : node.state === "ambiguous"
                            ? "#fcd34d"
                            : "#94a3b8"
                      }
                      fontSize="9.5"
                      fontFamily="ui-monospace, monospace"
                    >
                      {node.state === "resolved" ? "✓ CLEAR" : `${node.uncertaintyScore}%?`}
                    </text>

                    <text x={14} y={40} fill="#f8fafc" fontSize="12.5" fontWeight="600">
                      {shortLabel}
                    </text>

                    <text
                      x={14}
                      y={56}
                      fill="#94a3b8"
                      fontSize="10"
                      fontFamily="ui-monospace, monospace"
                    >
                      {node.resolvedValue
                        ? `${node.resolvedValue.slice(0, 21)}${
                            node.resolvedValue.length > 21 ? "…" : ""
                          }`
                        : stateMeta.label}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-[#060a18]/90 px-4 py-2.5 text-[11px] text-slate-400">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border border-dashed border-amber-400 bg-amber-400/20" />
                Ambiguous
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border border-dotted border-slate-400 bg-slate-400/20" />
                Unresolved
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                Resolved
              </span>
            </div>
            {graph.summary.activeInterpretationTitle && (
              <span className="truncate text-cyan-300">
                Interpretation: {graph.summary.activeInterpretationTitle}
              </span>
            )}
          </div>
        </div>

        {selectedNode && (
          <div className="xl:col-span-4 rounded-2xl border border-white/12 bg-[#070b1a]/90 p-5 flex flex-col justify-between gap-4">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(() => {
                      const KindIcon = KIND_META[selectedNode.kind].icon;
                      return (
                        <Badge tone={KIND_META[selectedNode.kind].tone}>
                          <KindIcon className="h-3 w-3" />
                          {KIND_META[selectedNode.kind].label}
                        </Badge>
                      );
                    })()}
                    <Badge tone={STATE_META[selectedNode.state].tone}>
                      {selectedNode.state === "resolved" && <CheckCircle2 className="h-3 w-3" />}
                      {STATE_META[selectedNode.state].label}
                    </Badge>
                  </div>
                  <h4 className="text-lg font-semibold text-white">{selectedNode.label}</h4>
                </div>
                <button
                  type="button"
                  aria-label="Close node detail panel"
                  onClick={() => setSelectedNodeId("__closed__")}
                  className="cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#050814]/85 p-3 space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Contextual Meaning
                </p>
                <p className="text-xs sm:text-sm leading-relaxed text-slate-200">
                  {selectedNode.meaning}
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-300">Node Uncertainty</span>
                  <span className="font-mono text-cyan-300">{selectedNode.uncertaintyScore}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      selectedNode.state === "resolved"
                        ? "bg-emerald-400"
                        : selectedNode.state === "ambiguous"
                          ? "bg-amber-400"
                          : "bg-violet-400"
                    }`}
                    style={{ width: `${selectedNode.uncertaintyScore}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400">{selectedNode.uncertaintyReason}</p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedNode.abstained && (
                    <Badge tone="rose">Abstained (Insufficient Evidence)</Badge>
                  )}
                  {selectedNode.verifiedCorrectness && (
                    <Badge
                      tone={
                        selectedNode.verifiedCorrectness === "verified"
                          ? "emerald"
                          : selectedNode.verifiedCorrectness === "contradictory"
                            ? "rose"
                            : "amber"
                      }
                    >
                      Status: {selectedNode.verifiedCorrectness.replace("_", " ")}
                    </Badge>
                  )}
                </div>
              </div>

              {((selectedNode.supportingEvidence?.length ?? 0) > 0 ||
                (selectedNode.contradictingEvidence?.length ?? 0) > 0) && (
                <div className="rounded-xl border border-white/10 bg-[#050814]/80 p-3 space-y-2 text-[11px]">
                  {(selectedNode.supportingEvidence?.length ?? 0) > 0 && (
                    <div className="space-y-1">
                      <p className="font-semibold text-emerald-300 uppercase tracking-wider">
                        Supporting Evidence
                      </p>
                      {selectedNode.supportingEvidence?.map((ev) => (
                        <p key={ev} className="text-slate-300 leading-relaxed">
                          + {ev}
                        </p>
                      ))}
                    </div>
                  )}
                  {(selectedNode.contradictingEvidence?.length ?? 0) > 0 && (
                    <div className="space-y-1 pt-1 border-t border-white/10">
                      <p className="font-semibold text-rose-300 uppercase tracking-wider">
                        Contradicting Evidence
                      </p>
                      {selectedNode.contradictingEvidence?.map((ev) => (
                        <p key={ev} className="text-rose-200/90 leading-relaxed">
                          ! {ev}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <Link2 className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Semantic Relationships ({selectedNodeRelations.length})</span>
                </div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {selectedNodeRelations.map(({ edge, direction, otherNode }) => (
                    <button
                      key={edge.id}
                      type="button"
                      onClick={() => otherNode && setSelectedNodeId(otherNode.id)}
                      className="w-full cursor-pointer flex items-center justify-between gap-2 rounded-lg border border-white/8 bg-white/4 px-2.5 py-1.5 text-left text-xs hover:border-cyan-400/40 transition-colors"
                    >
                      <span className="text-slate-300 truncate">
                        {direction === "outgoing" ? "→ " : "← "}
                        <span className="font-mono text-cyan-300">{edge.label}</span>{" "}
                        <span className="text-white">{otherNode?.label ?? "Entity"}</span>
                      </span>
                      <ArrowRight className="h-3 w-3 shrink-0 text-slate-500" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <GitBranch className="h-3.5 w-3.5 text-violet-400" />
                  <span>Node Interpretations</span>
                </div>
                <ul className="space-y-1">
                  {selectedNode.interpretations.map((interp) => (
                    <li key={interp} className="flex items-start gap-1.5 text-xs text-slate-300">
                      <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-violet-400" />
                      <span>{interp}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-3 border-t border-white/10">
              {selectedNode.linkedQuestionId && onClarifyNode && (
                <Button
                  size="sm"
                  onClick={() => onClarifyNode(selectedNode.linkedQuestionId as string)}
                  iconRight={<ArrowRight className="h-3.5 w-3.5" />}
                >
                  {selectedNode.state === "resolved" ? "Edit Clarification" : "Clarify Node"}
                </Button>
              )}
              {onOpenInterpretations && (
                <Button size="sm" variant="secondary" onClick={onOpenInterpretations}>
                  Switch Interpretation
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
