import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Line } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { StorageBin } from "../../services/opsApi";

const STATUS_COLOR: Record<string, string> = {
  AVAILABLE: "#38bdf8",
  OCCUPIED: "#f59e0b",
  RESERVED: "#8b5cf6",
  INCOMING: "#10b981",
  RESTRICTED: "#ef4444",
};

interface LayoutBin {
  bin: StorageBin;
  position: [number, number, number];
  size: [number, number, number];
  zoneIndex: number;
}

/** Deterministic layout: zones in a row, racks along X, shelves stacked on Y. */
function layoutBins(bins: StorageBin[]): { items: LayoutBin[]; zoneOrigins: { code: string; x: number; z: number }[] } {
  const byZone = new Map<string, StorageBin[]>();
  for (const b of bins) {
    const arr = byZone.get(b.zone_code) ?? [];
    arr.push(b);
    byZone.set(b.zone_code, arr);
  }
  const zoneCodes = [...byZone.keys()].sort();
  const items: LayoutBin[] = [];
  const zoneOrigins: { code: string; x: number; z: number }[] = [];
  const ZONE_W = 14;
  zoneCodes.forEach((code, zi) => {
    const zoneBins = byZone.get(code)!.sort((a, b) =>
      a.rack_code.localeCompare(b.rack_code) || a.shelf_code.localeCompare(b.shelf_code) || a.position_index - b.position_index,
    );
    const originX = zi * ZONE_W;
    zoneOrigins.push({ code, x: originX, z: 0 });
    // group into racks
    const racks = new Map<string, StorageBin[]>();
    for (const b of zoneBins) {
      const arr = racks.get(b.rack_code) ?? [];
      arr.push(b);
      racks.set(b.rack_code, arr);
    }
    const rackCodes = [...racks.keys()].sort();
    rackCodes.forEach((rc, ri) => {
      const shelfBins = racks.get(rc)!.sort((a, b) => a.shelf_code.localeCompare(b.shelf_code));
      shelfBins.forEach((b, si) => {
        items.push({
          bin: b,
          position: [originX + ri * 3.2, 0.6 + si * 1.4, 0],
          size: [2.4, 1.1, 1.6],
          zoneIndex: zi,
        });
      });
    });
  });
  return { items, zoneOrigins };
}

function BinMesh({ item, selected, highlighted, onSelect }: {
  item: LayoutBin; selected: boolean; highlighted: boolean; onSelect: (b: StorageBin) => void;
}) {
  const [hover, setHover] = useState(false);
  const fill = item.bin.capacity_units > 0 ? Math.min(1, item.bin.stored_qty / item.bin.capacity_units) : 0;
  const color = STATUS_COLOR[item.bin.status] ?? "#94a3b8";
  return (
    <group position={item.position}>
      {/* rack upright */}
      <mesh position={[0, 0.9, -0.9]}>
        <boxGeometry args={[0.12, 2.4, 0.12]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
      <mesh position={[0, 0.9, 0.9]}>
        <boxGeometry args={[0.12, 2.4, 0.12]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
      {/* shelf bin */}
      <mesh
        onClick={(e) => { e.stopPropagation(); onSelect(item.bin); }}
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = "auto"; }}
      >
        <boxGeometry args={item.size} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={selected ? 1 : hover || highlighted ? 0.95 : 0.75}
          emissive={highlighted ? "#10b981" : selected ? "#0891b2" : "#000000"}
          emissiveIntensity={highlighted ? 0.55 : selected ? 0.4 : hover ? 0.15 : 0}
        />
      </mesh>
      {/* fill indicator: stored fraction as inner box */}
      {fill > 0 && (
        <mesh position={[0, -item.size[1] / 2 + (item.size[1] * fill) / 2 + 0.02, 0]}>
          <boxGeometry args={[item.size[0] * 0.9, item.size[1] * fill, item.size[1] * 0.9]} />
          <meshStandardMaterial color="#0f172a" transparent opacity={0.55} />
        </mesh>
      )}
      {(hover || selected || highlighted) && (
        <Html position={[0, item.size[1] / 2 + 0.5, 0]} center distanceFactor={12} style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded-md bg-slate-900/90 px-2 py-1 text-[11px] text-white shadow">
            {item.bin.zone_code} · {item.bin.rack_code} · {item.bin.shelf_code}
            <br />
            <span className="text-slate-300">{item.bin.material_name ?? "Empty"} — {item.bin.stored_qty}/{item.bin.capacity_units}</span>
          </div>
        </Html>
      )}
    </group>
  );
}

function Floor({ zones, bins }: { zones: { code: string; x: number; z: number }[]; bins: LayoutBin[] }) {
  const maxX = Math.max(...zones.map((z) => z.x), 0) + 14;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[maxX / 2 - 7, -0.01, 0]} receiveShadow>
        <planeGeometry args={[maxX + 14, 16]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
      {/* zone pads */}
      {zones.map((z, i) => {
        const count = bins.filter((b) => b.zoneIndex === i).length;
        const racks = new Set(bins.filter((b) => b.zoneIndex === i).map((b) => b.bin.rack_code)).size;
        const w = Math.max(racks * 3.2 + 2, 8);
        return (
          <group key={z.code}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[z.x + w / 2 - 1, 0.005, 0]} receiveShadow>
              <planeGeometry args={[w, 10]} />
              <meshStandardMaterial color={i % 2 === 0 ? "#f1f5f9" : "#eef2f7"} />
            </mesh>
            <Line
              points={[[z.x - 0.5, 0.02, -5], [z.x + w - 0.5, 0.02, -5], [z.x + w - 0.5, 0.02, 5], [z.x - 0.5, 0.02, 5], [z.x - 0.5, 0.02, -5]]}
              color="#94a3b8"
              lineWidth={1}
            />
            <Html position={[z.x + w / 2 - 1, 0.1, -5.6]} center distanceFactor={14} style={{ pointerEvents: "none" }}>
              <div className="rounded bg-slate-800/85 px-2 py-0.5 text-[11px] font-semibold text-white">{z.code} · {count} bins</div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

function CameraRig({ focus }: { focus: [number, number, number] | null }) {
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3());
  useEffect(() => {
    if (focus) {
      target.current.set(focus[0], 2.2, focus[2] + 7);
      camera.position.lerp(target.current, 0.9);
      camera.lookAt(focus[0], 1, focus[2]);
    }
  }, [focus, camera]);
  return null;
}

export function WarehouseScene3D({ bins, highlightMaterial, selectedId, onSelect }: {
  bins: StorageBin[];
  highlightMaterial?: string | null;
  selectedId?: string | null;
  onSelect?: (bin: StorageBin) => void;
}) {
  const { items, zoneOrigins } = useMemo(() => layoutBins(bins), [bins]);
  const highlighted = useMemo(() => {
    const q = (highlightMaterial ?? "").trim().toUpperCase();
    if (!q) return new Set<string>();
    return new Set(
      bins
        .filter((b) => b.material_id && (b.material_id === q || (b.material_sku ?? "").toUpperCase() === q || (b.material_name ?? "").toUpperCase().includes(q)))
        .map((b) => b.id),
    );
  }, [bins, highlightMaterial]);

  const focus = useMemo(() => {
    const first = items.find((i) => highlighted.has(i.bin.id));
    return first ? [first.position[0], first.position[1], first.position[2]] as [number, number, number] : null;
  }, [items, highlighted]);

  const maxX = Math.max(...zoneOrigins.map((z) => z.x), 0) + 14;

  return (
    <div className="relative h-[480px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      <Canvas shadows camera={{ position: [maxX / 2, 10, 14], fov: 45 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[8, 14, 6]} intensity={1.1} castShadow />
        <Floor zones={zoneOrigins} bins={items} />
        {items.map((item) => (
          <BinMesh
            key={item.bin.id}
            item={item}
            selected={selectedId === item.bin.id}
            highlighted={highlighted.has(item.bin.id)}
            onSelect={(b) => onSelect?.(b)}
          />
        ))}
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} maxPolarAngle={Math.PI / 2.15} minDistance={4} maxDistance={60} />
        <CameraRig focus={focus} />
      </Canvas>
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/85 px-2 py-1 text-[11px] text-slate-600">
        Drag to rotate · scroll to zoom · click a bin for details
      </div>
    </div>
  );
}
