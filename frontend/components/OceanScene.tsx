'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line, PerspectiveCamera, useProgress } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { MutableRefObject, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { QualityLevel } from '@/lib/settings';
import { QUALITY_BLOOM, QUALITY_PARTICLE_COUNT } from '@/lib/settings';

/* ── Public types ─────────────────────────────────────────── */
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
  onAnomalyClick?: (anomaly: OceanAnomaly, screenPos: { x: number; y: number }) => void;
  onTransectDraw?: (points: TransectPoint[]) => void;
  parallaxRef?: MutableRefObject<{ x: number; y: number }>;
  cursorProp?: number;
  playing?: boolean;
  onCursorChange?: (v: number) => void;
  onPlayingChange?: (v: boolean) => void;
  drawing?: boolean;
  /** Normalized 0–1 scene boot progress (chunk load is tracked separately in EntryGate). */
  onBootProgress?: (progress: number) => void;
  /** Quality level drives: DPR, particle count, bloom intensity, caustic layer. */
  qualityLevel?: QualityLevel;
};

type Bounds = {
  minLat: number; maxLat: number;
  minLon: number; maxLon: number;
  maxDepth: number;
};

/* ── Design tokens (matches globals.css) ──────────────────── */
const T = {
  abyss950: '#030711',
  abyss900: '#0a1220',
  abyss800: '#131e30',
  bio400:   '#2dd4bf',
  bio300:   '#5eead4',
  coral400: '#fb7185',
  amber400: '#fbbf24',
  foam100:  '#e8f1f5',
  foam400:  '#7d94a3',
  tempCool: '#2d6cdf',
  tempWarm: '#d94a55',
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function temperatureColor(value: number | null | undefined, range: [number, number]) {
  if (value == null || !Number.isFinite(value)) return new THREE.Color(T.bio400);
  const n = clamp((value - range[0]) / Math.max(range[1] - range[0], 0.001), 0, 1);
  return new THREE.Color(T.tempCool).lerp(new THREE.Color(T.tempWarm), n);
}

/* ─────────────────────────────────────────────────────────────
   PROCEDURAL ARGO FLOAT HOUSING
   img2threejs spec: cylindrical aluminium body, sensor dome,
   drogue cone, antenna fin, breathing LED ring.
───────────────────────────────────────────────────────────── */
function FloatHousing({
  position,
  rotation,
  color,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  color: THREE.Color;
}) {
  const ledRef = useRef<THREE.Mesh>(null);
  const domeRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    // LED ring breathes — slow sine, not color cycling
    const breathe = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 1.4);
    if (ledRef.current) {
      (ledRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.6 + breathe * 1.2;
    }
    if (domeRef.current) {
      (domeRef.current.material as THREE.MeshPhysicalMaterial).emissiveIntensity =
        0.08 + breathe * 0.18;
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Main cylindrical body — dark anodised aluminium */}
      <mesh>
        <cylinderGeometry args={[0.095, 0.115, 0.56, 20]} />
        <meshStandardMaterial
          color={T.abyss800}
          metalness={0.82}
          roughness={0.22}
        />
      </mesh>

      {/* Top sensor dome — tinted glass with transmission */}
      <mesh ref={domeRef} position={[0, 0.3, 0]}>
        <sphereGeometry args={[0.095, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.12}
          metalness={0.1}
          roughness={0.05}
          transmission={0.55}
          thickness={0.4}
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* LED status ring — bioluminescent bio-400 glow */}
      <mesh ref={ledRef} position={[0, 0.22, 0]}>
        <torusGeometry args={[0.097, 0.008, 8, 40]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.2}
          roughness={0.3}
        />
      </mesh>

      {/* Bottom drogue cone */}
      <mesh position={[0, -0.3, 0]}>
        <coneGeometry args={[0.115, 0.16, 20]} />
        <meshStandardMaterial
          color={T.abyss900}
          metalness={0.65}
          roughness={0.3}
        />
      </mesh>

      {/* Antenna fin */}
      <mesh position={[0, 0.06, 0.098]}>
        <boxGeometry args={[0.014, 0.18, 0.024]} />
        <meshStandardMaterial
          color={T.abyss950}
          metalness={0.4}
          roughness={0.7}
        />
      </mesh>

      {/* Pressure sensor nub */}
      <mesh position={[0, -0.14, 0.098]}>
        <cylinderGeometry args={[0.018, 0.018, 0.04, 10]} />
        <meshStandardMaterial
          color={T.bio400}
          emissive={T.bio400}
          emissiveIntensity={0.4}
        />
      </mesh>
    </group>
  );
}

/* ─────────────────────────────────────────────────────────────
   SURFACE BUOY with tether
───────────────────────────────────────────────────────────── */
function SurfaceBuoy({
  position,
  tetherTo,
  color,
}: {
  position: [number, number, number];
  tetherTo: [number, number, number];
  color: THREE.Color;
}) {
  const beaconRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (beaconRef.current) {
      (beaconRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.8 + 0.6 * Math.sin(clock.elapsedTime * 2.1);
    }
  });

  return (
    <group>
      {/* Tether line */}
      <Line
        points={[position, tetherTo]}
        color={T.foam400}
        transparent
        opacity={0.3}
        lineWidth={0.5}
      />
      <group position={position}>
        {/* Buoy body */}
        <mesh>
          <sphereGeometry args={[0.11, 18, 12]} />
          <meshStandardMaterial
            color={T.abyss800}
            metalness={0.7}
            roughness={0.25}
            emissive={color}
            emissiveIntensity={0.1}
          />
        </mesh>
        {/* Mast */}
        <mesh position={[0, 0.16, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.18, 8]} />
          <meshStandardMaterial color={T.foam400} metalness={0.5} />
        </mesh>
        {/* Beacon */}
        <mesh ref={beaconRef} position={[0, 0.27, 0]}>
          <sphereGeometry args={[0.025, 10, 8]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={1.0}
          />
        </mesh>
      </group>
    </group>
  );
}

/* ─────────────────────────────────────────────────────────────
   CURRENT / FLOW RIBBON
   Animated shader ribbon following trajectory points.
───────────────────────────────────────────────────────────── */
function CurrentRibbon({ points }: { points: [number, number, number][] }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const w = 0.04;
    const verts: number[] = [];
    const uvs: number[] = [];
    points.forEach((pt, i) => {
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      const tan = new THREE.Vector3(
        next[0] - prev[0], 0, next[2] - prev[2]
      ).normalize();
      const nor = new THREE.Vector3(-tan.z, 0, tan.x).multiplyScalar(w);
      const t = i / (points.length - 1);
      const fadeW = Math.sin(t * Math.PI) * w; // fade at ends
      verts.push(
        pt[0] - nor.x * (fadeW / w), pt[1] + 0.018, pt[2] - nor.z * (fadeW / w),
        pt[0] + nor.x * (fadeW / w), pt[1] + 0.018, pt[2] + nor.z * (fadeW / w),
      );
      uvs.push(t, 0, t, 1);
    });
    const idx: number[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const s = i * 2;
      idx.push(s, s + 1, s + 2, s + 1, s + 3, s + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [points]);

  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = clock.elapsedTime;
  });

  if (!geometry) return null;
  return (
    <mesh ref={meshRef} geometry={geometry}>
      <shaderMaterial
        ref={matRef}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
        uniforms={{ uTime: { value: 0 }, uColor: { value: new THREE.Color(T.bio400) } }}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform float uTime;
          uniform vec3 uColor;
          varying vec2 vUv;
          void main() {
            float flow = fract(vUv.x * 3.0 - uTime * 0.22);
            float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(0.0, 0.18, 1.0 - vUv.x);
            float alpha = flow * 0.22 * edge;
            gl_FragColor = vec4(uColor, alpha);
          }
        `}
      />
    </mesh>
  );
}

/* ─────────────────────────────────────────────────────────────
   ANOMALY MARKER — pulsing sphere in 3D space
   bio-400 (normal) or coral-400 (severe ≥ 3)
   Pulse: opacity + scale over 2s ease-in-out, not color cycling
───────────────────────────────────────────────────────────── */
function AnomalyMarker({
  position,
  severity = 1,
  onClick,
}: {
  position: [number, number, number];
  severity?: number;
  onClick?: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const severe = severity >= 3;
  const baseColor = severe ? T.coral400 : T.bio400;

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    // 2s ease-in-out loop via sine
    const t = (Math.sin(clock.elapsedTime * Math.PI) + 1) / 2; // 0→1 ease-in-out
    meshRef.current.scale.setScalar(1 + t * 0.22);
    (meshRef.current.material as THREE.MeshStandardMaterial).opacity = 0.6 + t * 0.4;
  });

  return (
    <mesh
      ref={meshRef}
      position={position}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      onPointerOver={() => {
        if (!document.body.classList.contains('custom-cursor-active')) {
          document.body.style.cursor = 'pointer';
        }
      }}
      onPointerOut={() => {
        if (!document.body.classList.contains('custom-cursor-active')) {
          document.body.style.cursor = '';
        }
      }}
    >
      <sphereGeometry args={[0.085, 16, 16]} />
      <meshStandardMaterial
        color={baseColor}
        emissive={baseColor}
        emissiveIntensity={2.4}
        transparent
        opacity={0.8}
        depthWrite={false}
      />
    </mesh>
  );
}

/* ─────────────────────────────────────────────────────────────
   BIOPLANKTON FIELD — quality-driven floating particle cloud
   Additive-blended points, animated with sinusoidal drift.
   count = 0 on Low quality (component returns null immediately).
───────────────────────────────────────────────────────────── */
function BioplanktonField({ count }: { count: number }) {
  const meshRef = useRef<THREE.Points>(null);

  const { positions, seeds } = useMemo(() => {
    if (count === 0) return { positions: new Float32Array(0), seeds: new Float32Array(0) };
    const pos = new Float32Array(count * 3);
    const s   = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 8.0;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 3.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 6.0;
      s[i] = Math.random() * Math.PI * 2;
    }
    return { positions: pos, seeds: s };
  }, [count]);

  useFrame(({ clock }) => {
    if (!meshRef.current || count === 0) return;
    const pos = meshRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const t = clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const seed = seeds[i];
      pos.array[i * 3]     = (pos.array[i * 3]     + Math.sin(t * 0.18 + seed * 1.7) * 0.0004) as number;
      pos.array[i * 3 + 1] = (pos.array[i * 3 + 1] + Math.sin(t * 0.12 + seed * 2.3) * 0.0006) as number;
      pos.array[i * 3 + 2] = (pos.array[i * 3 + 2] + Math.cos(t * 0.15 + seed * 1.1) * 0.0003) as number;
      if (pos.array[i * 3 + 1] >  1.65) pos.array[i * 3 + 1] = -1.75;
      if (pos.array[i * 3 + 1] < -2.2)  pos.array[i * 3 + 1] =  1.62;
    }
    pos.needsUpdate = true;
  });

  if (count === 0) return null;

  return (
    <points ref={meshRef} key={count}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={count}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        color={T.bio400}
        size={0.028}
        transparent
        opacity={0.5}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

/* ─────────────────────────────────────────────────────────────
   OCEAN FLOOR PLANE — subtle dark disc
───────────────────────────────────────────────────────────── */
function OceanFloor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.2, 0]}>
      <circleGeometry args={[6, 72]} />
      <meshStandardMaterial
        color={T.abyss800}
        transparent
        opacity={0.65}
        roughness={0.95}
        metalness={0.1}
      />
    </mesh>
  );
}

/* ─────────────────────────────────────────────────────────────
   CAUSTIC SURFACE LAYER — animated light ripples
───────────────────────────────────────────────────────────── */
function CausticLayer() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = clock.elapsedTime;
  });
  return (
    <mesh position={[0, 1.32, -1.0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[11, 9]} />
      <shaderMaterial
        ref={matRef}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{ uTime: { value: 0 }, uColor: { value: new THREE.Color(T.bio400) } }}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform float uTime;
          uniform vec3 uColor;
          varying vec2 vUv;
          void main() {
            float a = sin(vUv.x * 14.0 + uTime * 0.7);
            float b = cos(vUv.y * 16.0 - uTime * 0.6);
            float ripple = smoothstep(0.78, 1.4, a * b + 1.0);
            float fade = smoothstep(0.0,0.14,vUv.x)*smoothstep(0.0,0.14,1.0-vUv.x)*smoothstep(0.0,0.18,vUv.y)*smoothstep(0.0,0.18,1.0-vUv.y);
            gl_FragColor = vec4(uColor, ripple * 0.07 * fade);
          }
        `}
      />
    </mesh>
  );
}

/* ─────────────────────────────────────────────────────────────
   IDLE CAMERA DRIFT — ~90s orbit period
   Pauses on user interaction, resumes after 3s idle
───────────────────────────────────────────────────────────── */
function IdleDrift({
  parallaxRef,
  interactingRef,
}: {
  parallaxRef?: MutableRefObject<{ x: number; y: number }>;
  interactingRef: MutableRefObject<boolean>;
}) {
  const { camera, gl } = useThree();
  const deepColor = useMemo(() => new THREE.Color('#020511'), []);
  const surfaceColor = useMemo(() => new THREE.Color(T.abyss950), []);
  const clearMix = useMemo(() => new THREE.Color(T.abyss950), []);

  const orbitRadius = 6.8;
  const orbitSpeedRad = (2 * Math.PI) / 90; // ~90s period

  useFrame(({ clock }) => {
    const px = parallaxRef?.current.x ?? 0;
    const py = parallaxRef?.current.y ?? 0;

    if (!interactingRef.current) {
      const t = clock.elapsedTime * orbitSpeedRad;
      // Subtle drift: ±0.4 on x/z, very slow
      const driftX = Math.sin(t) * 0.4;
      const driftZ = Math.cos(t) * 0.4;
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, driftX + px * -0.2, 0.012);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, orbitRadius + driftZ, 0.012);
    } else {
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, px * -0.2, 0.04);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, orbitRadius, 0.04);
    }
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, 0.5 + py * 0.06, 0.04);
    camera.lookAt(0, -0.12, 0);

    // Clear color stays at abyss-950; depth effect now via timeline, not scroll
    clearMix.copy(surfaceColor).lerp(deepColor, 0);
    gl.setClearColor(clearMix, 1);
  });

  return null;
}

/* ─────────────────────────────────────────────────────────────
   TRAJECTORY LAYER — trajectories, housings, buoys, ribbons
───────────────────────────────────────────────────────────── */
function TrajectoryLayer({
  trajectories,
  anomalies,
  cursor,
  showAnomalies,
  drawing,
  onAnomalyClick,
  onDrawPoint,
}: {
  trajectories: FloatTrajectory[];
  anomalies: OceanAnomaly[];
  cursor: number;
  showAnomalies: boolean;
  drawing: boolean;
  onAnomalyClick?: (a: OceanAnomaly, screenPos: { x: number; y: number }) => void;
  onDrawPoint: (p: TransectPoint) => void;
}) {
  const { camera, size } = useThree();

  const { bounds, temperatureRange, timeline } = useMemo(() => {
    const pts = trajectories.flatMap((t) => t.path);
    const coords = [...pts, ...anomalies].filter(
      (p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)
    );
    const lats = coords.map((p) => p.lat);
    const lons = coords.map((p) => p.lon);
    const maxD = Math.max(...coords.map((p) => p.depth).filter(Number.isFinite), 1);
    const ts = pts.map((p) => Date.parse(p.timestamp)).filter(Number.isFinite);
    const temps = pts
      .map((p) => p.temperature)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    return {
      bounds: {
        minLat: lats.length ? Math.min(...lats) : -1,
        maxLat: lats.length ? Math.max(...lats) : 1,
        minLon: lons.length ? Math.min(...lons) : -1,
        maxLon: lons.length ? Math.max(...lons) : 1,
        maxDepth: maxD,
      } satisfies Bounds,
      temperatureRange: [
        temps.length ? Math.min(...temps) : 0,
        temps.length ? Math.max(...temps) : 1,
      ] as [number, number],
      timeline: [
        ts.length ? Math.min(...ts) : 0,
        ts.length ? Math.max(...ts) : 1,
      ] as [number, number],
    };
  }, [trajectories, anomalies]);

  const mapPoint = (p: Pick<TrajectoryPoint, 'lat' | 'lon' | 'depth'>): [number, number, number] => {
    const x = ((p.lon - bounds.minLon) / Math.max(bounds.maxLon - bounds.minLon, 0.001) - 0.5) * 6.0;
    const z = ((p.lat - bounds.minLat) / Math.max(bounds.maxLat - bounds.minLat, 0.001) - 0.5) * 4.0;
    const y = 1.6 - clamp(p.depth / Math.max(bounds.maxDepth, 1), 0, 1) * 3.2;
    return [x, y, z];
  };

  const currentTimestamp = timeline[0] + (timeline[1] - timeline[0]) * cursor;
  const surfaceY = 1.6;

  // Project 3D world pos → screen position for anomaly callout anchor
  const projectToScreen = (pos: [number, number, number]): { x: number; y: number } => {
    const v = new THREE.Vector3(...pos).project(camera);
    return {
      x: ((v.x + 1) / 2) * size.width,
      y: ((-v.y + 1) / 2) * size.height,
    };
  };

  return (
    <group>
      {/* Draw-transect invisible plane at surface */}
      <mesh
        position={[0, surfaceY, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(e) => {
          if (!drawing) return;
          e.stopPropagation();
          const b = bounds;
          const pt = e.point;
          onDrawPoint({
            lat: b.minLat + ((pt.z / 4.0 + 0.5) * Math.max(b.maxLat - b.minLat, 0.001)),
            lon: b.minLon + ((pt.x / 6.0 + 0.5) * Math.max(b.maxLon - b.minLon, 0.001)),
          });
        }}
      >
        <planeGeometry args={[14, 10]} />
        <meshBasicMaterial color={T.bio400} transparent opacity={0} />
      </mesh>

      {/* Trajectories */}
      {trajectories.map((traj) => {
        const visible = traj.path
          .filter((p) => Date.parse(p.timestamp) <= currentTimestamp)
          .map((p) => ({ p, pos: mapPoint(p) }));
        const fallback = traj.path[0]
          ? [{ p: traj.path[0], pos: mapPoint(traj.path[0]) }]
          : [];
        const items = visible.length ? visible : cursor === 0 ? fallback : [];
        const latest = items[items.length - 1];
        const prev = items[Math.max(0, items.length - 2)];
        const color = latest
          ? temperatureColor(latest.p.temperature, temperatureRange)
          : new THREE.Color(T.bio400);
        const rot: [number, number, number] =
          prev && latest
            ? [0, Math.atan2(latest.pos[0] - prev.pos[0], latest.pos[2] - prev.pos[2]), 0]
            : [0, 0, 0];

        return (
          <group key={traj.float_id}>
            {/* Trajectory lines, colored by temperature */}
            {items.slice(1).map((item, i) => (
              <Line
                key={`${traj.float_id}-seg-${i}`}
                points={[items[i].pos, item.pos]}
                color={temperatureColor(item.p.temperature, temperatureRange)}
                transparent
                opacity={0.7}
                lineWidth={1.4}
              />
            ))}
            {latest && (
              <>
                <FloatHousing position={latest.pos} rotation={rot} color={color} />
                <SurfaceBuoy
                  position={[latest.pos[0], surfaceY, latest.pos[2]]}
                  tetherTo={latest.pos}
                  color={color}
                />
                <CurrentRibbon points={items.map((it) => it.pos)} />
              </>
            )}
          </group>
        );
      })}

      {/* Anomaly markers */}
      {showAnomalies &&
        anomalies.map((a, idx) => {
          const pos = mapPoint(a);
          return (
            <AnomalyMarker
              key={`${a.float_id ?? 'a'}-${a.time ?? idx}`}
              position={pos}
              severity={a.severity}
              onClick={() => onAnomalyClick?.(a, projectToScreen(pos))}
            />
          );
        })}
    </group>
  );
}

/* ─────────────────────────────────────────────────────────────
   BOOT PROGRESS — drei LoadingManager + first rendered frame
   (shader compile happens on first draw)
───────────────────────────────────────────────────────────── */
function SceneBootReporter({ onBootProgress }: { onBootProgress?: (p: number) => void }) {
  const { progress, active } = useProgress();
  const firstFrame = useRef(false);
  const lastSent = useRef(0);

  const emit = (value: number) => {
    const next = Math.min(1, Math.max(0, value));
    if (next <= lastSent.current + 0.001 && next < 1) return;
    lastSent.current = next;
    onBootProgress?.(next);
  };

  useEffect(() => {
    emit(0.04);
  }, []);

  useEffect(() => {
    if (active) {
      emit(0.12 + (progress / 100) * 0.68);
    } else if (progress >= 100) {
      emit(Math.max(lastSent.current, 0.82));
    }
  }, [progress, active]);

  useFrame(() => {
    if (firstFrame.current) return;
    firstFrame.current = true;
    emit(1);
  });

  return null;
}

/* ─────────────────────────────────────────────────────────────
   SCENE INNER — inside Canvas context
───────────────────────────────────────────────────────────── */
function SceneInner({
  trajectories,
  anomalies,
  cursor,
  playing,
  showAnomalies,
  drawing,
  parallaxRef,
  onAnomalyClick,
  onDrawPoint,
  interactingRef,
  onBootProgress,
  qualityLevel = 'high',
}: {
  trajectories: FloatTrajectory[];
  anomalies: OceanAnomaly[];
  cursor: number;
  playing: boolean;
  showAnomalies: boolean;
  drawing: boolean;
  parallaxRef?: MutableRefObject<{ x: number; y: number }>;
  onAnomalyClick?: (a: OceanAnomaly, screenPos: { x: number; y: number }) => void;
  onDrawPoint: (p: TransectPoint) => void;
  interactingRef: MutableRefObject<boolean>;
  onBootProgress?: (progress: number) => void;
  qualityLevel?: QualityLevel;
}) {
  const bloomIntensity = QUALITY_BLOOM[qualityLevel];
  const particleCount  = QUALITY_PARTICLE_COUNT[qualityLevel];
  return (
    <>
      <SceneBootReporter onBootProgress={onBootProgress} />
      <PerspectiveCamera makeDefault position={[0, 0.5, 6.8]} fov={40} near={0.1} far={100} />

      {/* Lights */}
      <ambientLight intensity={0.55} color={T.foam100} />
      <directionalLight position={[2, 5, 3]} intensity={0.9} color={T.bio300} />
      <pointLight position={[-2, 2, 1]} intensity={0.6} color={T.bio400} />
      <pointLight position={[3, -1, -2]} intensity={0.25} color={T.abyss800} />

      {/* Idle camera drift */}
      <IdleDrift parallaxRef={parallaxRef} interactingRef={interactingRef} />

      {/* Scene elements */}
      <OceanFloor />
      {qualityLevel !== 'low' && <CausticLayer />}
      <BioplanktonField count={particleCount} />
      <TrajectoryLayer
        trajectories={trajectories}
        anomalies={anomalies}
        cursor={cursor}
        showAnomalies={showAnomalies}
        drawing={drawing}
        onAnomalyClick={onAnomalyClick}
        onDrawPoint={onDrawPoint}
      />

      {/* Post-processing — Bloom for bioluminescent glow.
          Omitted entirely on Low quality (bloomIntensity = 0). */}
      {bloomIntensity > 0 && (
        <EffectComposer>
          <Bloom
            luminanceThreshold={qualityLevel === 'medium' ? 0.6 : 0.55}
            luminanceSmoothing={0.4}
            intensity={bloomIntensity}
            mipmapBlur={qualityLevel === 'high'}
          />
        </EffectComposer>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   OCEAN SCENE — exported default
   Timeline controls are now PAGE-LEVEL (TimelineScrubber.tsx).
   This component only owns the canvas.
───────────────────────────────────────────────────────────── */
export default function OceanScene({
  trajectories = [],
  anomalies = [],
  onAnomalyClick,
  onTransectDraw,
  parallaxRef,
  cursorProp = 1,
  playing = false,
  onCursorChange,
  onPlayingChange,
  drawing = false,
  onBootProgress,
  qualityLevel = 'high',
}: OceanSceneProps) {
  const [showAnomalies] = useState(true);
  const [drawPoints, setDrawPoints] = useState<TransectPoint[]>([]);
  const interactingRef = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markInteracting = () => {
    interactingRef.current = true;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => { interactingRef.current = false; }, 3000);
  };

  // Timeline playback — controlled externally via cursorProp/playing
  useEffect(() => {
    if (!playing || trajectories.length === 0) return;
    const interval = window.setInterval(() => {
      const next = cursorProp + 0.008;
      if (next >= 1) {
        onPlayingChange?.(false);
        onCursorChange?.(1);
      } else {
        onCursorChange?.(next);
      }
    }, 60);
    return () => window.clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, trajectories.length]);

  // Forward drawn transect
  useEffect(() => {
    if (!drawing && drawPoints.length >= 2) {
      onTransectDraw?.(drawPoints);
    }
    if (!drawing) setDrawPoints([]);
  }, [drawing]); // eslint-disable-line

  const hasData = trajectories.some((t) => t.path.length > 0);

  return (
    <div className="absolute inset-0">
      <Canvas
        dpr={qualityLevel === 'high' ? [1, 1.8] : qualityLevel === 'medium' ? [1, 1.2] : [1, 1.0]}
        gl={{ antialias: qualityLevel !== 'low', alpha: false, powerPreference: 'high-performance' }}
        style={{ background: T.abyss950 }}
        onPointerMove={markInteracting}
        onWheel={markInteracting}
      >
        <SceneInner
          trajectories={trajectories}
          anomalies={anomalies}
          cursor={cursorProp}
          playing={playing}
          showAnomalies={showAnomalies}
          drawing={drawing}
          parallaxRef={parallaxRef}
          onAnomalyClick={onAnomalyClick}
          onDrawPoint={(pt) => setDrawPoints((prev) => [...prev, pt])}
          interactingRef={interactingRef}
          onBootProgress={onBootProgress}
          qualityLevel={qualityLevel}
        />
      </Canvas>

      {/* Empty state overlay */}
      {!hasData && (
        <div
          className="pointer-events-none absolute left-1/2 top-[44%] -translate-x-1/2"
          style={{
            background: 'rgba(10,18,32,0.75)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(19,30,48,0.9)',
            borderRadius: 8,
            padding: '8px 16px',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: 'var(--foam-400)',
          }}
        >
          No trajectory data · waiting for telemetry
        </div>
      )}
    </div>
  );
}
