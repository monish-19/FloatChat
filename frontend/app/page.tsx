'use client';

/* ─────────────────────────────────────────────────────────────
   FloatChat — Deep-Ocean Immersive Interface
   Fixed viewport. Canvas at z-0. HUD panels float above.

   Layer order:
     z-0  OceanScene (full-bleed R3F canvas)
     z-10 ChatPanel (left-docked glass rail)
     z-10 TimelineScrubber (bottom-docked depth gauge)
     z-20 HudCluster (top-right, 3 glowing numbers)
     z-30 AnomalyCallout (positioned over 3D marker)
     z-35 Transect scrim
     z-40 TransectSheet (bottom sheet)
───────────────────────────────────────────────────────────── */

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import ChatPanel from '@/components/ChatPanel';
import HudCluster from '@/components/HudCluster';
import TimelineScrubber from '@/components/TimelineScrubber';
import AnomalyCallout from '@/components/AnomalyCallout';
import TransectSheet from '@/components/TransectSheet';
import type { FloatTrajectory, OceanAnomaly, TransectPoint } from '@/components/OceanScene';

/* Dynamically imported — R3F must be client-only, no SSR */
const OceanScene = dynamic(() => import('@/components/OceanScene'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--abyss-950)',
      }}
    />
  ),
});

type Transect = {
  variable: 'temperature' | 'salinity';
  distance_km: number[];
  depths: number[];
  grid: { depth: number; values: (number | null)[] }[];
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/* ── Build timeline range from trajectory data ─────────────── */
function getTimelineRange(trajectories: FloatTrajectory[]): [number, number] {
  const ts = trajectories
    .flatMap((t) => t.path)
    .map((p) => Date.parse(p.timestamp))
    .filter(Number.isFinite);
  if (!ts.length) return [0, 1];
  return [Math.min(...ts), Math.max(...ts)];
}

export default function Page() {
  /* ── Data state ─────────────────────────────────────────── */
  const [trajectories, setTrajectories] = useState<FloatTrajectory[]>([]);
  const [anomalies, setAnomalies] = useState<OceanAnomaly[]>([]);
  const [profileCount, setProfileCount] = useState<number | null>(null);
  const [anomalyCount, setAnomalyCount] = useState<number | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [isLive, setIsLive] = useState(false);

  /* ── Transect state ─────────────────────────────────────── */
  const [transectVariable, setTransectVariable] = useState<'temperature' | 'salinity'>('temperature');
  const [transect, setTransect] = useState<Transect | null>(null);
  const [transectLoading, setTransectLoading] = useState(false);
  const [transectOpen, setTransectOpen] = useState(false);
  const [drawnPoints, setDrawnPoints] = useState<TransectPoint[]>([]);
  const [drawing, setDrawing] = useState(false);

  /* ── UI state ───────────────────────────────────────────── */
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [selectedAnomaly, setSelectedAnomaly] = useState<OceanAnomaly | null>(null);
  const [anomalyScreenPos, setAnomalyScreenPos] = useState<{ x: number; y: number } | null>(null);
  const [anomalySeed, setAnomalySeed] = useState<string | undefined>();

  /* ── Timeline state ─────────────────────────────────────── */
  const [cursor, setCursor] = useState(1);
  const [playing, setPlaying] = useState(false);

  /* ── Parallax ───────────────────────────────────────────── */
  const parallaxRef = useRef({ x: 0, y: 0 });
  const parallaxTarget = useRef({ x: 0, y: 0 });

  /* ── Mouse parallax ─────────────────────────────────────── */
  useEffect(() => {
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    if (coarsePointer) return;

    const onMove = (e: MouseEvent) => {
      parallaxTarget.current.x = clamp((e.clientX / window.innerWidth - 0.5) * 2, -1, 1);
      parallaxTarget.current.y = clamp((e.clientY / window.innerHeight - 0.5) * 2, -1, 1);
    };
    window.addEventListener('mousemove', onMove, { passive: true });

    let frame = 0;
    const loop = () => {
      parallaxRef.current.x += (parallaxTarget.current.x - parallaxRef.current.x) * 0.08;
      parallaxRef.current.y += (parallaxTarget.current.y - parallaxRef.current.y) * 0.08;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  /* ── API: metrics + trajectories refresh (30s) ──────────── */
  useEffect(() => {
    let active = true;

    const refresh = async () => {
      try {
        const [healthRes, anomaliesRes, floatsRes, metricsRes] = await Promise.all([
          fetch('/api/health'),
          fetch('/api/anomalies'),
          fetch('/api/floats'),
          fetch('/api/metrics'),
        ]);

        if (!active) return;

        const health = healthRes.ok ? await healthRes.json() : null;
        const anomaliesData = anomaliesRes.ok ? await anomaliesRes.json() : null;
        const floatsData = floatsRes.ok ? await floatsRes.json() : { float_ids: [] };
        const metricsData = metricsRes.ok ? await metricsRes.json() : { percentiles: {} };

        const liveAnomalies = (anomaliesData?.events ?? []) as OceanAnomaly[];
        if (active) {
          setAnomalies(liveAnomalies);
          setProfileCount(Number(health?.profiles ?? 0));
          setAnomalyCount(Number(anomaliesData?.count ?? 0));
          setIsLive(health?.status === 'ok');

          const percentiles = metricsData?.percentiles ?? {};
          const totalP50 = Number(percentiles.total_ms?.p50 ?? 0);
          setLatencyMs(totalP50 || null);
        }

        // Load trajectories for up to 8 floats
        const floatIds = Array.from(
          new Set(
            (floatsData.float_ids ?? [])
              .concat(liveAnomalies.map((a: OceanAnomaly) => a.float_id).filter(Boolean))
          )
        ).slice(0, 8) as string[];

        const trajs = await Promise.all(
          floatIds.map(async (id) => {
            const r = await fetch(`/api/floats/${encodeURIComponent(id)}/trajectory`);
            if (!r.ok) return null;
            return (await r.json()) as FloatTrajectory;
          })
        );

        if (active) {
          const valid = trajs.filter((t): t is FloatTrajectory => Boolean(t?.path?.length));
          setTrajectories(valid);
        }
      } catch {
        // Backend offline — keep stale state
      }
    };

    refresh();
    const interval = window.setInterval(refresh, 30_000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  /* ── API: transect data ──────────────────────────────────── */
  useEffect(() => {
    if (!transectOpen) return;
    let active = true;
    setTransectLoading(true);
    fetch(`/api/transect?variable=${transectVariable}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Transect | null) => {
        if (active) setTransect(data?.grid?.length ? data : null);
      })
      .catch(() => { if (active) setTransect(null); })
      .finally(() => { if (active) setTransectLoading(false); });
    return () => { active = false; };
  }, [transectVariable, transectOpen]);

  /* ── Timeline range ─────────────────────────────────────── */
  const timelineRange = useMemo(() => getTimelineRange(trajectories), [trajectories]);

  /* ── Anomaly select ─────────────────────────────────────── */
  const handleAnomalyClick = (a: OceanAnomaly, screenPos: { x: number; y: number }) => {
    setSelectedAnomaly(a);
    setAnomalyScreenPos(screenPos);
  };

  /* ── Transect draw finish ───────────────────────────────── */
  const handleTransectDraw = (pts: TransectPoint[]) => {
    setDrawnPoints(pts);
    setTransectOpen(true);
  };

  const handleDrawToggle = () => {
    if (drawing && drawnPoints.length >= 2) {
      handleTransectDraw(drawnPoints);
    }
    setDrawing((d) => !d);
    if (drawing) setDrawnPoints([]);
  };

  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--abyss-950)',
        overflow: 'hidden',
      }}
      aria-label="FloatChat — Ocean Intelligence Interface"
    >
      {/* ── z-0: Full-bleed 3D canvas ────────────────────── */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <OceanScene
          trajectories={trajectories}
          anomalies={anomalies}
          onAnomalyClick={handleAnomalyClick}
          onTransectDraw={handleTransectDraw}
          parallaxRef={parallaxRef}
          cursorProp={cursor}
          playing={playing}
          onCursorChange={setCursor}
          onPlayingChange={setPlaying}
          drawing={drawing}
        />
      </div>

      {/* ── z-10: Left-docked chat panel ─────────────────── */}
      <ChatPanel
        questionSeed={anomalySeed}
        collapsed={chatCollapsed}
        onCollapsedChange={setChatCollapsed}
      />

      {/* ── z-10: Bottom timeline scrubber ───────────────── */}
      <TimelineScrubber
        cursor={cursor}
        playing={playing}
        drawing={drawing}
        hasData={trajectories.some((t) => t.path.length > 0)}
        timelineRange={timelineRange}
        onCursorChange={setCursor}
        onPlayingChange={setPlaying}
        onDrawToggle={handleDrawToggle}
      />

      {/* ── z-20: Top-right HUD cluster ──────────────────── */}
      <HudCluster
        profileCount={profileCount}
        anomalyCount={anomalyCount}
        latencyMs={latencyMs}
        isLive={isLive}
      />

      {/* ── z-30: Anomaly callout (if selected) ──────────── */}
      {selectedAnomaly && anomalyScreenPos && (
        <AnomalyCallout
          anomaly={selectedAnomaly}
          screenPos={anomalyScreenPos}
          onClose={() => { setSelectedAnomaly(null); setAnomalyScreenPos(null); }}
          onAskAbout={(prompt) => {
            setAnomalySeed(prompt);
            setChatCollapsed(false);
          }}
        />
      )}

      {/* ── z-35/40: Transect sheet (if open) ────────────── */}
      {transectOpen && (
        <TransectSheet
          transect={transect}
          loading={transectLoading}
          variable={transectVariable}
          drawnPoints={drawnPoints.length}
          onVariableChange={setTransectVariable}
          onClose={() => setTransectOpen(false)}
        />
      )}
    </main>
  );
}
