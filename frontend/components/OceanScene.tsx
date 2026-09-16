'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { Line, PerspectiveCamera } from '@react-three/drei';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';

export type TrajectoryPoint = {
  lat: number;
  lon: number;
  depth: number;
  timestamp: string;
  temperature?: number | null;
  salinity?: number | null;
  [key: string]: unknown;
};

export type FloatTrajectory = {
  float_id: string;
  path: TrajectoryPoint[];
};

export type OceanAnomaly = {
  float_id?: string;
  lat: number;
  lon: number;
  depth: number;
  variable?: string;
  severity?: number;
  time?: string;
  [key: string]: unknown;
};

export type TransectPoint = { lat: number; lon: number };

type OceanSceneProps = {
  trajectories?: FloatTrajectory[];
  anomalies?: OceanAnomaly[];
  onAnomalyClick?: (anomaly: OceanAnomaly) => void;
  onTransectDraw?: (points: TransectPoint[]) => void;
};

type Bounds = {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  maxDepth: number;
};

const TOKENS = {
  canvas: '#070A0D',
  surfaceInset: '#090D11',
  line: '#24313A',
  inkMuted: '#A5B6BC',
  accent: '#5EC5D8',
  accentStrong: '#8AE8F2',
  warning: '#F0B86A',
  danger: '#F27672',
  tempCool: '#2D6CDF',
  tempWarm: '#D94A55',
} as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function temperatureColor(value: number | null | undefined, range: [number, number]) {
  if (value == null || !Number.isFinite(value)) return new THREE.Color(TOKENS.accent);
  const normalized = clamp((value - range[0]) / Math.max(range[1] - range[0], 0.001), 0, 1);
  return new THREE.Color(TOKENS.tempCool).lerp(new THREE.Color(TOKENS.tempWarm), normalized);
}

function FloatHousing({ position, rotation, color }: { position: [number, number, number]; rotation: [number, number, number]; color: THREE.Color }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <cylinderGeometry args={[0.105, 0.13, 0.62, 16]} />
        <meshStandardMaterial color={TOKENS.surfaceInset} metalness={0.75} roughness={0.28} />
      </mesh>
      <mesh position={[0, 0.32, 0]}>
        <sphereGeometry args={[0.105, 16, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} />
      </mesh>
      <mesh position={[0, -0.32, 0]}>
        <coneGeometry args={[0.13, 0.18, 16]} />
        <meshStandardMaterial color={TOKENS.line} metalness={0.65} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.04, 0.105]}>
        <boxGeometry args={[0.12, 0.15, 0.018]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
      </mesh>
    </group>
  );
}

function SurfaceBuoy({ position, tetherTo, color }: { position: [number, number, number]; tetherTo: [number, number, number]; color: THREE.Color }) {
  return (
    <group>
      <Line points={[position, tetherTo]} color={TOKENS.inkMuted} transparent opacity={0.42} lineWidth={0.7} />
      <group position={position}>
        <mesh>
          <sphereGeometry args={[0.13, 16, 10]} />
          <meshStandardMaterial color={TOKENS.accentStrong} emissive={color} emissiveIntensity={0.7} />
        </mesh>
        <mesh position={[0, 0.17, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.2, 8]} />
          <meshStandardMaterial color={TOKENS.line} metalness={0.6} />
        </mesh>
        <mesh position={[0, 0.29, 0]}>
          <sphereGeometry args={[0.045, 10, 6]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} />
        </mesh>
      </group>
    </group>
  );
}

function CurrentRibbon({ points }: { points: [number, number, number][] }) {
  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const vertices: number[] = [];
    const width = 0.055;
    points.forEach((point, index) => {
      const previous = points[Math.max(0, index - 1)];
      const next = points[Math.min(points.length - 1, index + 1)];
      const tangent = new THREE.Vector3(next[0] - previous[0], 0, next[2] - previous[2]).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(width);
      vertices.push(point[0] - normal.x, point[1] + 0.025, point[2] - normal.z);
      vertices.push(point[0] + normal.x, point[1] + 0.025, point[2] + normal.z);
    });
    const indices: number[] = [];
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = index * 2;
      indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    result.setIndex(indices);
    result.computeVertexNormals();
    return result;
  }, [points]);

  useFrame(({ clock }) => {
    if (geometry) geometry.attributes.position.needsUpdate = Math.floor(clock.elapsedTime * 2) % 2 === 0;
  });

  if (!geometry) return null;
  return <mesh geometry={geometry} rotation={[0, 0, 0]}><meshBasicMaterial color={TOKENS.accent} transparent opacity={0.18} side={THREE.DoubleSide} /></mesh>;
}

function TrajectoryLayer({ trajectories, anomalies, cursor, showAnomalies, drawing, onAnomalyClick, onDrawPoint }: { trajectories: FloatTrajectory[]; anomalies: OceanAnomaly[]; cursor: number; showAnomalies: boolean; drawing: boolean; onAnomalyClick?: (anomaly: OceanAnomaly) => void; onDrawPoint: (point: TransectPoint) => void }) {
  const { bounds, temperatureRange, timeline } = useMemo(() => {
    const points = trajectories.flatMap((trajectory) => trajectory.path);
    const coordinates = [...points, ...anomalies].filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
    const lats = coordinates.map((point) => point.lat);
    const lons = coordinates.map((point) => point.lon);
    const maxDepth = Math.max(...coordinates.map((point) => point.depth).filter(Number.isFinite), 1);
    const timestamps = points.map((point) => Date.parse(point.timestamp)).filter(Number.isFinite);
    const temperatures = points.map((point) => point.temperature).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    return {
      bounds: { minLat: lats.length ? Math.min(...lats) : -1, maxLat: lats.length ? Math.max(...lats) : 1, minLon: lons.length ? Math.min(...lons) : -1, maxLon: lons.length ? Math.max(...lons) : 1, maxDepth } satisfies Bounds,
      temperatureRange: [temperatures.length ? Math.min(...temperatures) : 0, temperatures.length ? Math.max(...temperatures) : 1] as [number, number],
      timeline: [timestamps.length ? Math.min(...timestamps) : 0, timestamps.length ? Math.max(...timestamps) : 1] as [number, number],
    };
  }, [trajectories, anomalies]);

  const mapPoint = (point: Pick<TrajectoryPoint, 'lat' | 'lon' | 'depth'>): [number, number, number] => {
    const x = ((point.lon - bounds.minLon) / Math.max(bounds.maxLon - bounds.minLon, 0.001) - 0.5) * 6.4;
    const z = ((point.lat - bounds.minLat) / Math.max(bounds.maxLat - bounds.minLat, 0.001) - 0.5) * 4.2;
    const y = 1.65 - clamp(point.depth / Math.max(bounds.maxDepth, 1), 0, 1) * 3.4;
    return [x, y, z];
  };
  const currentTimestamp = timeline[0] + (timeline[1] - timeline[0]) * cursor;
  const surfaceY = 1.65;
  const drawPlaneSize = 12;
  const drawPoint = (point: THREE.Vector3) => ({
    lat: bounds.minLat + ((point.z / 4.2 + 0.5) * Math.max(bounds.maxLat - bounds.minLat, 0.001)),
    lon: bounds.minLon + ((point.x / 6.4 + 0.5) * Math.max(bounds.maxLon - bounds.minLon, 0.001)),
  });

  return (
    <group>
      <mesh
        position={[0, surfaceY, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(event) => {
          if (!drawing) return;
          event.stopPropagation();
          onDrawPoint(drawPoint(event.point));
        }}
      >
        <planeGeometry args={[drawPlaneSize, drawPlaneSize]} />
        <meshBasicMaterial color={TOKENS.accent} transparent opacity={0} />
      </mesh>
      {trajectories.map((trajectory) => {
        const visible = trajectory.path.filter((point) => Date.parse(point.timestamp) <= currentTimestamp).map((point) => ({ point, position: mapPoint(point) }));
        const fallback = trajectory.path[0] ? [{ point: trajectory.path[0], position: mapPoint(trajectory.path[0]) }] : [];
        const items = visible.length ? visible : cursor === 0 ? fallback : [];
        const latest = items[items.length - 1];
        const previous = items[Math.max(0, items.length - 2)];
        const color = latest ? temperatureColor(latest.point.temperature, temperatureRange) : new THREE.Color(TOKENS.accent);
        const rotation: [number, number, number] = previous && latest ? [0, Math.atan2(latest.position[0] - previous.position[0], latest.position[2] - previous.position[2]), 0] : [0, 0, 0];
        const ribbonPoints = items.map((item) => item.position);
        return (
          <group key={trajectory.float_id}>
            {items.slice(1).map((item, index) => <Line key={`${trajectory.float_id}-segment-${index}`} points={[items[index].position, item.position]} color={temperatureColor(item.point.temperature, temperatureRange)} transparent opacity={0.86} lineWidth={1.6} />)}
            {latest && <><FloatHousing position={latest.position} rotation={rotation} color={color} /><SurfaceBuoy position={[latest.position[0], surfaceY, latest.position[2]]} tetherTo={latest.position} color={color} /><CurrentRibbon points={ribbonPoints} /></>}
          </group>
        );
      })}
      {showAnomalies && anomalies.map((anomaly, index) => {
        const severe = (anomaly.severity ?? 1) >= 3;
        return <mesh key={`${anomaly.float_id ?? 'anomaly'}-${anomaly.time ?? index}`} position={mapPoint(anomaly)} scale={1 + clamp(anomaly.severity ?? 1, 0, 5) * 0.08} onClick={(event) => { event.stopPropagation(); onAnomalyClick?.(anomaly); }}>
          <octahedronGeometry args={[0.12, 1]} />
          <meshStandardMaterial color={severe ? TOKENS.danger : TOKENS.warning} emissive={severe ? TOKENS.danger : TOKENS.warning} emissiveIntensity={2.2} />
        </mesh>;
      })}
    </group>
  );
}

function TimelineControls({ cursor, playing, showAnomalies, drawing, onCursorChange, onPlayingChange, onAnomalyToggle, onDrawToggle, hasData }: { cursor: number; playing: boolean; showAnomalies: boolean; drawing: boolean; onCursorChange: (value: number) => void; onPlayingChange: (value: boolean) => void; onAnomalyToggle: () => void; onDrawToggle: () => void; hasData: boolean }) {
  return <div className="pointer-events-auto absolute bottom-5 left-5 w-[min(380px,calc(100%-2.5rem))] rounded-lg border border-[var(--fc-line)] bg-[var(--fc-surface-1)]/95 p-3 text-[var(--fc-ink)] shadow-lg backdrop-blur-md">
    <div className="mb-2 flex items-center justify-between gap-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--fc-ink-muted)]">Trajectory timeline</span>
      <div className="flex gap-2">
        <button type="button" onClick={onAnomalyToggle} className="rounded border border-[var(--fc-line)] px-2 py-1 text-[11px] text-[var(--fc-ink-muted)] hover:border-[var(--fc-line-strong)] hover:text-[var(--fc-ink)]">{showAnomalies ? 'Hide anomalies' : 'Show anomalies'}</button>
        <button type="button" onClick={onDrawToggle} className={`rounded border px-2 py-1 text-[11px] ${drawing ? 'border-[var(--fc-accent)] bg-[var(--fc-accent)]/10 text-[var(--fc-accent-strong)]' : 'border-[var(--fc-line)] text-[var(--fc-ink-muted)]'}`}>{drawing ? 'Finish transect' : 'Draw transect'}</button>
        {hasData && <button type="button" onClick={() => { if (!playing && cursor >= 1) onCursorChange(0); onPlayingChange(!playing); }} className="rounded border border-[var(--fc-accent)]/60 px-2 py-1 text-[11px] text-[var(--fc-accent-strong)]">{playing ? 'Pause' : 'Play'}</button>}
      </div>
    </div>
    <input aria-label="Trajectory timeline" type="range" min="0" max="1" step="0.001" value={cursor} disabled={!hasData} onChange={(event) => onCursorChange(Number(event.target.value))} className="w-full accent-[var(--fc-accent)] disabled:opacity-40" />
    <div className="mt-1 flex justify-between font-mono text-[10px] text-[var(--fc-ink-muted)]"><span>earliest</span><span>{hasData ? `${Math.round(cursor * 100)}%` : 'waiting for telemetry'}</span><span>latest</span></div>
  </div>;
}

export default function OceanScene({ trajectories = [], anomalies = [], onAnomalyClick, onTransectDraw }: OceanSceneProps) {
  const [cursor, setCursor] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [showAnomalies, setShowAnomalies] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [drawPoints, setDrawPoints] = useState<TransectPoint[]>([]);

  useEffect(() => {
    if (!playing || trajectories.length === 0) return;
    const interval = window.setInterval(() => setCursor((current) => { const next = current + 0.008; if (next >= 1) { setPlaying(false); return 1; } return next; }), 60);
    return () => window.clearInterval(interval);
  }, [playing, trajectories.length]);

  useEffect(() => {
    if (trajectories.length === 0) { setPlaying(false); setCursor(1); }
  }, [trajectories.length]);

  const hasData = trajectories.some((trajectory) => trajectory.path.length > 0);
  return <div className="absolute inset-0">
    <Canvas dpr={[1, 1.8]}>
      <color attach="background" args={[TOKENS.canvas]} />
      <PerspectiveCamera makeDefault position={[0, 0.5, 6.8]} fov={42} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[2, 5, 4]} intensity={1.1} color={TOKENS.accentStrong} />
      <TrajectoryLayer trajectories={trajectories} anomalies={anomalies} cursor={cursor} showAnomalies={showAnomalies} drawing={drawing} onAnomalyClick={onAnomalyClick} onDrawPoint={(point) => setDrawPoints((current) => [...current, point])} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.2, 0]}><circleGeometry args={[5.5, 64]} /><meshStandardMaterial color={TOKENS.surfaceInset} transparent opacity={0.75} /></mesh>
    </Canvas>
    {!hasData && <div className="pointer-events-none absolute left-1/2 top-[42%] -translate-x-1/2 rounded-md border border-[var(--fc-line)] bg-[var(--fc-surface-inset)]/90 px-3 py-2 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--fc-ink-subtle)]">No trajectory data</div>}
    <TimelineControls
      cursor={cursor}
      playing={playing}
      showAnomalies={showAnomalies}
      drawing={drawing}
      onCursorChange={setCursor}
      onPlayingChange={setPlaying}
      onAnomalyToggle={() => setShowAnomalies((value) => !value)}
      onDrawToggle={() => {
        if (drawing && drawPoints.length >= 2) onTransectDraw?.(drawPoints);
        setDrawing((value) => !value);
        if (drawing) setDrawPoints([]);
      }}
      hasData={hasData}
    />
  </div>;
}
