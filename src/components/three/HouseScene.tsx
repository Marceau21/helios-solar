"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { panelSlots, segmentYaw, slopeLength } from "@/lib/solar/geometry";
import type { BuildingModel, PanelLayout, PlacedPanel, PowerSnapshot, RoofSegment } from "@/types/energy";
import { ENERGY } from "../energy-colors";

export interface HouseSceneProps {
  building: BuildingModel;
  layout: PanelLayout;
  snapshot?: PowerSnapshot | null;
  hasBattery?: boolean;
  /** Heure locale décimale (0–24), pilote la position du soleil et le ciel. */
  localHour?: number;
  editable?: boolean;
  onLayoutChange?: (l: PanelLayout) => void;
}

const rad = (d: number) => (d * Math.PI) / 180;

function skyFor(hour: number) {
  // Jour → bleu clair ; aube/crépuscule → orangé ; nuit → bleu nuit
  const day = new THREE.Color("#cfe3ee");
  const dusk = new THREE.Color("#e9c9a8");
  const night = new THREE.Color("#1b2836");
  const elev = Math.sin(Math.PI * Math.min(1, Math.max(0, (hour - 5.8) / 13.8)));
  if (hour < 5.3 || hour > 20.1) return night;
  if (elev < 0.25) return dusk.clone().lerp(day, elev / 0.25).lerp(night, hour < 6 || hour > 19.6 ? 0.5 : 0);
  return day;
}

/* ---------------------------------------------------------------- */

function Walls({ b, night }: { b: BuildingModel; night: boolean }) {
  const { width, depth } = b.footprint;
  const gable = b.roofSegments.length === 2 && b.source !== "google_solar";
  const pitch = b.roofSegments[0]?.pitchDeg ?? 22;
  const ridge = (depth / 2) * Math.tan(rad(pitch));

  const gableGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const h = b.wallHeight;
    const v = new Float32Array([0, h, -depth / 2, 0, h, depth / 2, 0, h + ridge, 0]);
    g.setAttribute("position", new THREE.BufferAttribute(v, 3));
    g.computeVertexNormals();
    return g;
  }, [b.wallHeight, depth, ridge]);

  const windowColor = night ? "#ffd27a" : "#5f7b8c";
  const windows = useMemo(() => {
    const list: [number, number][] = [];
    const n = Math.max(2, Math.floor(width / 3.2));
    for (let i = 0; i < n; i++) list.push([(i - (n - 1) / 2) * (width / n), 1.45]);
    return list;
  }, [width]);

  return (
    <group>
      <mesh position={[0, b.wallHeight / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, b.wallHeight, depth]} />
        <meshStandardMaterial color="#e8e2d6" roughness={0.9} />
      </mesh>
      {gable &&
        [-1, 1].map((s) => (
          <mesh key={s} geometry={gableGeo} position={[(s * width) / 2, 0, 0]} castShadow>
            <meshStandardMaterial color="#e8e2d6" roughness={0.9} side={THREE.DoubleSide} />
          </mesh>
        ))}
      {/* Fenêtres façades nord et sud */}
      {[-1, 1].flatMap((side) =>
        windows.map(([x, y], i) => (
          <mesh key={`${side}-${i}`} position={[x, y, side * (depth / 2 + 0.01)]} rotation={[0, side > 0 ? 0 : Math.PI, 0]}>
            <planeGeometry args={[1.4, 1.1]} />
            <meshStandardMaterial color={windowColor} emissive={night ? "#ffb347" : "#000"} emissiveIntensity={night ? 0.8 : 0} roughness={0.2} />
          </mesh>
        )),
      )}
      {/* Porte */}
      <mesh position={[width / 4, 1.05, -depth / 2 - 0.012]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[1, 2.1]} />
        <meshStandardMaterial color="#4a5a63" />
      </mesh>
    </group>
  );
}

function Panel({ p, layout, onRemove }: { p: PlacedPanel; layout: PanelLayout; onRemove?: () => void }) {
  const w = p.orientation === "portrait" ? layout.panelWidth : layout.panelHeight;
  const h = p.orientation === "portrait" ? layout.panelHeight : layout.panelWidth;
  return (
    <group position={[p.u, 0.09, -p.v]}>
      <mesh
        castShadow
        onPointerDown={
          onRemove
            ? (e: ThreeEvent<PointerEvent>) => {
                e.stopPropagation();
                onRemove();
              }
            : undefined
        }
      >
        <boxGeometry args={[w, 0.04, h]} />
        <meshStandardMaterial color="#18263a" metalness={0.6} roughness={0.25} />
      </mesh>
      {/* Cadre alu fin */}
      <mesh position={[0, 0.021, 0]}>
        <planeGeometry args={[w * 0.96, h * 0.97]} />
        <meshStandardMaterial color="#25406a" metalness={0.8} roughness={0.15} />
      </mesh>
    </group>
  );
}

function RoofSegmentMesh({
  seg,
  layout,
  editable,
  onAdd,
  onRemove,
}: {
  seg: RoofSegment;
  layout: PanelLayout;
  editable?: boolean;
  onAdd: (u: number, v: number, key: string) => void;
  onRemove: (id: string) => void;
}) {
  const L = slopeLength(seg);
  const midHeight = seg.eaveHeight + (seg.depth / 2) * Math.tan(rad(seg.pitchDeg));
  const panels = layout.panels.filter((p) => p.segmentId === seg.id);
  const slots = useMemo(() => (editable ? panelSlots(seg, layout) : []), [editable, seg, layout]);
  const taken = new Set(panels.map((p) => p.id));

  return (
    <group position={[seg.center.x, midHeight, seg.center.z]} rotation={[0, segmentYaw(seg), 0]}>
      <group rotation={[rad(seg.pitchDeg), 0, 0]}>
        <mesh position={[0, 0, 0.18]} castShadow receiveShadow>
          <boxGeometry args={[seg.width + 0.35, 0.12, L + 0.45]} />
          <meshStandardMaterial color="#6b7378" roughness={0.75} />
        </mesh>
        {panels.map((p) => (
          <Panel key={p.id} p={p} layout={layout} onRemove={editable ? () => onRemove(p.id) : undefined} />
        ))}
        {slots
          .filter((s) => !taken.has(s.key))
          .map((s) => (
            <mesh
              key={s.key}
              position={[s.u, 0.075, -s.v]}
              rotation={[-Math.PI / 2, 0, 0]}
              onPointerDown={(e) => {
                e.stopPropagation();
                onAdd(s.u, s.v, s.key);
              }}
            >
              <planeGeometry args={[layout.panelWidth * 0.94, layout.panelHeight * 0.94]} />
              <meshBasicMaterial color={ENERGY.solar} transparent opacity={0.22} depthWrite={false} />
            </mesh>
          ))}
      </group>
    </group>
  );
}

/* ---------------------------------------------------------------- */
/* Flux d'énergie animés                                            */
/* ---------------------------------------------------------------- */

function Flow({ points, watts, color }: { points: THREE.Vector3[]; watts: number; color: string }) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points), [points]);
  const count = Math.min(14, Math.max(3, Math.round(watts / 500)));
  const ref = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const speed = 0.08 + Math.min(0.35, watts / 25_000);
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useFrame(({ clock }) => {
    if (!ref.current) return;
    for (let i = 0; i < count; i++) {
      const t = reduced ? i / count : (clock.elapsedTime * speed + i / count) % 1;
      tmp.position.copy(curve.getPointAt(t));
      tmp.scale.setScalar(0.6 + 0.4 * Math.sin(t * Math.PI));
      tmp.updateMatrix();
      ref.current.setMatrixAt(i, tmp.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });

  if (watts < 30) return null;
  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 40, 0.035, 6, false]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} />
      </mesh>
      <instancedMesh ref={ref} args={[undefined, undefined, count]}>
        <sphereGeometry args={[0.17, 12, 12]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

function GridPole({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 3.5, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.14, 7, 10]} />
        <meshStandardMaterial color="#6d5b47" roughness={0.9} />
      </mesh>
      <mesh position={[0, 6.6, 0]}>
        <boxGeometry args={[1.6, 0.12, 0.12]} />
        <meshStandardMaterial color="#6d5b47" />
      </mesh>
    </group>
  );
}

function Battery({ x, z, soc }: { x: number; z: number; soc: number | null }) {
  const level = soc == null ? 0 : soc / 100;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.65, 0]} castShadow>
        <boxGeometry args={[0.75, 1.3, 0.22]} />
        <meshStandardMaterial color="#f4f6f5" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.15 + level * 0.5, 0.115]}>
        <planeGeometry args={[0.08, Math.max(0.02, level)]} />
        <meshBasicMaterial color={ENERGY.battery} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ---------------------------------------------------------------- */

function Scene(props: HouseSceneProps) {
  const { building: b, layout, snapshot, editable, onLayoutChange, hasBattery } = props;
  const hour = props.localHour ?? 12;
  const night = hour < 6 || hour > 19.8;
  const { width, depth } = b.footprint;

  // Soleil : se lève à l'est (+x), culmine au nord (−z, hémisphère sud), se couche à l'ouest.
  const sunT = Math.min(1, Math.max(0, (hour - 5.8) / 13.8));
  const sunPos: [number, number, number] = [Math.cos(Math.PI * sunT) * 30, Math.max(2, Math.sin(Math.PI * sunT) * 32), -14];

  const ridgeY = b.wallHeight + Math.max(...b.roofSegments.map((s) => s.depth * Math.tan(rad(s.pitchDeg)))) * 0.5;
  const roofTop = new THREE.Vector3(0, ridgeY + 0.6, -depth * 0.1);
  const meterPt = new THREE.Vector3(-width / 2 - 0.3, 1.3, depth * 0.15);
  const poleX = -width / 2 - 6;
  const poleZ = -depth / 2 - 3;
  const batteryX = -width / 2 - 0.25;
  const batteryZ = -depth * 0.2;

  const flows = useMemo(() => {
    if (!snapshot) return [];
    const s = snapshot;
    const f: { key: string; pts: THREE.Vector3[]; w: number; color: string }[] = [];
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    f.push({ key: "pv", pts: [roofTop, v(-width / 4, ridgeY + 1.2, depth * 0.2), meterPt], w: s.productionW ?? 0, color: ENERGY.solar });
    f.push({ key: "exp", pts: [meterPt, v((meterPt.x + poleX) / 2, 4.5, (meterPt.z + poleZ) / 2), v(poleX, 6.6, poleZ)], w: s.gridExportW ?? 0, color: ENERGY.solar });
    f.push({ key: "imp", pts: [v(poleX, 6.6, poleZ), v((meterPt.x + poleX) / 2, 4.5, (meterPt.z + poleZ) / 2), meterPt], w: s.gridImportW ?? 0, color: ENERGY.grid });
    if (hasBattery) {
      const bt = v(batteryX - 0.2, 1, batteryZ);
      f.push({ key: "chg", pts: [meterPt, v(batteryX - 0.6, 1.2, (meterPt.z + batteryZ) / 2), bt], w: s.batteryChargeW ?? 0, color: ENERGY.battery });
      f.push({ key: "dis", pts: [bt, v(batteryX - 0.6, 1.2, (meterPt.z + batteryZ) / 2), meterPt], w: s.batteryDischargeW ?? 0, color: ENERGY.battery });
    }
    return f;
  }, [snapshot, hasBattery, width, depth, ridgeY]); // eslint-disable-line react-hooks/exhaustive-deps

  const addPanel = (segmentId: string, u: number, v: number, key: string) =>
    onLayoutChange?.({ ...layout, panels: [...layout.panels, { id: key, segmentId, u, v, orientation: "portrait" }] });
  const removePanel = (id: string) => onLayoutChange?.({ ...layout, panels: layout.panels.filter((p) => p.id !== id) });

  const sky = skyFor(hour);

  return (
    <>
      <color attach="background" args={[sky]} />
      <fog attach="fog" args={[sky, 40, 90]} />
      <hemisphereLight args={[night ? "#3a4c66" : "#ffffff", "#7a8a5a", night ? 0.35 : 0.75]} />
      <directionalLight
        position={sunPos}
        intensity={night ? 0.15 : 2.2}
        color={hour < 7.5 || hour > 17.5 ? "#ffd2a1" : "#fff8ec"}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.04}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[60, 64]} />
        <meshStandardMaterial color={night ? "#2d3b2c" : "#9db07c"} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[width / 4, 0.01, -depth / 2 - 4]} receiveShadow>
        <planeGeometry args={[3, 8]} />
        <meshStandardMaterial color="#b9b2a4" roughness={1} />
      </mesh>

      <Walls b={b} night={night} />
      {b.roofSegments.map((seg) => (
        <RoofSegmentMesh
          key={seg.id}
          seg={seg}
          layout={layout}
          editable={editable}
          onAdd={(u, v, key) => addPanel(seg.id, u, v, key)}
          onRemove={removePanel}
        />
      ))}
      <GridPole x={poleX} z={poleZ} />
      {hasBattery && <Battery x={batteryX} z={batteryZ} soc={snapshot?.batterySocPct ?? null} />}
      {!editable && flows.map((f) => <Flow key={f.key} points={f.pts} watts={f.w} color={f.color} />)}

      <OrbitControls
        makeDefault
        enableDamping
        minDistance={10}
        maxDistance={60}
        maxPolarAngle={Math.PI / 2.15}
        target={[0, b.wallHeight * 0.8, 0]}
      />
    </>
  );
}

export default function HouseScene(props: HouseSceneProps) {
  const narrow = typeof window !== "undefined" && window.innerWidth < 640;
  const span = Math.max(props.building.footprint.width, props.building.footprint.depth) * (narrow ? 1.55 : 1);
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [span * 0.75, span * 0.8, -span * 1.3], fov: 38 }}>
      <Scene {...props} />
    </Canvas>
  );
}
