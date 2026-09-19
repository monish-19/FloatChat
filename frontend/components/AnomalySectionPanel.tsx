'use client';

/* ─────────────────────────────────────────────────────────────
   AnomalySectionPanel — section 04 list of live anomaly events
   Each card now has an inline SVG sparkline in its background:
   · Real depth-over-time profile if a trajectory exists for
     that float_id (data already fetched in page.tsx, no new
     API calls).
   · Deterministic synthetic waveform seeded from anomaly
     properties when no trajectory is available.
   Sparklines breathe at staggered intervals to feel alive.
───────────────────────────────────────────────────────────── */

import { useMemo } from 'react';
import { EyebrowReveal, HeadingReveal } from '@/components/SplitReveal';
import AnimatedNum from '@/components/AnimatedNum';
import type { OceanAnomaly, FloatTrajectory } from '@/components/OceanScene';

/* ── Sparkline dimensions ─────────────────────────────────── */
const SPK_W = 130;
const SPK_H = 40;

/* ── Inline sparkline component ───────────────────────────── */

type SparklineProps = {
  anomaly: OceanAnomaly;
  trajectory: FloatTrajectory | undefined;
  uid: string;
  /** Stagger delay in ms so nearby cards breathe out-of-phase */
  delayMs: number;
};

function AnomalySparkline({ anomaly, trajectory, uid, delayMs }: SparklineProps) {
  const points = useMemo<{ x: number; y: number }[]>(() => {
    if (trajectory && trajectory.path.length >= 3) {
      /* Real depth profile — sample last 24 fixes */
      const sample = trajectory.path.slice(-24);
      const depths = sample.map((p) => p.depth);
      const minD = Math.min(...depths);
      const maxD = Math.max(...depths);
      const rng = maxD - minD || 1;
      return sample.map((p, i) => ({
        x: (i / (sample.length - 1)) * SPK_W,
        /* Deeper = lower on screen (y inverted so shallow is high) */
        y: 4 + (1 - (p.depth - minD) / rng) * (SPK_H - 8),
      }));
    }

    /* Fallback: deterministic waveform from anomaly properties.
       Not random — same props always produce the same shape. */
    const seed = Math.abs(((anomaly.lat * 41 + anomaly.lon * 19) % 1 + 1) % 1);
    const freq = 0.35 + seed * 0.55;
    const phase = seed * Math.PI * 2;
    const amp = Math.min(0.4, 0.18 + (anomaly.severity ?? 1) * 0.035);
    return Array.from({ length: 24 }, (_, i) => ({
      x: (i / 23) * SPK_W,
      y: SPK_H / 2 + Math.sin(i * freq + phase) * (SPK_H * amp),
    }));
  }, [trajectory, anomaly]);

  const polyPts = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  /* Area fill path (under the line, fades to bottom) */
  const areaD = [
    `M ${points[0].x.toFixed(1)},${SPK_H}`,
    ...points.map((p) => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`),
    `L ${points[points.length - 1].x.toFixed(1)},${SPK_H} Z`,
  ].join(' ');

  const severe = (anomaly.severity ?? 0) >= 3;
  /* bio-400 teal for normal, coral-400 for severe */
  const rgb = severe ? '251,113,133' : '45,212,191';

  /* Gradient IDs must be unique in the DOM */
  const lineGradId = `spk-ln-${uid}`;
  const areaGradId = `spk-ar-${uid}`;

  return (
    <svg
      width={SPK_W}
      height={SPK_H}
      viewBox={`0 0 ${SPK_W} ${SPK_H}`}
      style={{
        position: 'absolute',
        right: 0,
        top: '50%',
        transform: 'translateY(-50%)',
        pointerEvents: 'none',
        /* Breathing animation — staggered per card */
        animation: `sparkline-breathe 3.8s ease-in-out ${delayMs}ms infinite`,
      }}
      aria-hidden
    >
      <defs>
        {/* Line gradient: transparent at left → full colour → fades at right */}
        <linearGradient id={lineGradId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%"   stopColor={`rgb(${rgb})`} stopOpacity="0" />
          <stop offset="28%"  stopColor={`rgb(${rgb})`} stopOpacity="1" />
          <stop offset="100%" stopColor={`rgb(${rgb})`} stopOpacity="0.5" />
        </linearGradient>
        {/* Area gradient: colour at top → transparent at baseline */}
        <linearGradient id={areaGradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor={`rgb(${rgb})`} stopOpacity="0.2" />
          <stop offset="100%" stopColor={`rgb(${rgb})`} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Area fill */}
      <path d={areaD} fill={`url(#${areaGradId})`} />

      {/* Line */}
      <polyline
        points={polyPts}
        fill="none"
        stroke={`url(#${lineGradId})`}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Terminal dot — marks latest position */}
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r="2"
        fill={`rgb(${rgb})`}
        opacity="0.9"
      />
    </svg>
  );
}

/* ── Panel ────────────────────────────────────────────────── */

type AnomalySectionPanelProps = {
  anomalies: OceanAnomaly[];
  /** Already-fetched trajectories from page.tsx — no new fetch */
  trajectories?: FloatTrajectory[];
  onSelect: (anomaly: OceanAnomaly) => void;
};

export default function AnomalySectionPanel({
  anomalies,
  trajectories = [],
  onSelect,
}: AnomalySectionPanelProps) {
  /* Build a float_id → trajectory lookup in O(n) */
  const trajMap = useMemo(() => {
    const m = new Map<string, FloatTrajectory>();
    for (const t of trajectories) {
      m.set(t.float_id, t);
    }
    return m;
  }, [trajectories]);

  return (
    <aside
      className="anomaly-section-panel glass-panel parallax-layer parallax-layer--far"
      data-parallax="far"
      aria-label="Anomaly events"
      data-cursor="interactive"
    >
      <EyebrowReveal text="Anomaly feed" className="eyebrow" staggerMs={20} />
      <HeadingReveal
        text="Detected events"
        className="anomaly-section-panel__title"
        as="h2"
        staggerMs={60}
        delayMs={120}
      />
      <p className="anomaly-section-panel__meta mono">
        <AnimatedNum target={anomalies.length} /> active marker{anomalies.length === 1 ? '' : 's'}
      </p>

      <ul className="anomaly-section-panel__list scroll-thread">
        {anomalies.length === 0 && (
          <li className="anomaly-section-panel__empty">No anomalies in the current window.</li>
        )}
        {anomalies.map((a, idx) => {
          const severe = (a.severity ?? 0) >= 3;
          /* uid uniquely identifies this card — used for SVG gradient IDs */
          const uid = `${a.float_id ?? 'anon'}-${idx}`;
          const traj = a.float_id ? trajMap.get(a.float_id) : undefined;
          /* Stagger breathe phase across cards: 0, 730, 1460 … ms (mod 3800) */
          const breatheDelay = (idx * 730) % 3800;

          return (
            <li key={uid}>
              <button
                type="button"
                className="anomaly-section-panel__row nested-surface"
                data-cursor="interactive"
                onClick={() => onSelect(a)}
                /* position:relative + overflow:hidden contain the sparkline */
                style={{ position: 'relative', overflow: 'hidden' }}
              >
                {/* Sparkline renders behind text via z-index on the text spans */}
                <AnomalySparkline
                  anomaly={a}
                  trajectory={traj}
                  uid={uid}
                  delayMs={breatheDelay}
                />

                <span
                  className="anomaly-section-panel__severity"
                  style={{
                    color: severe ? 'var(--coral-400)' : 'var(--bio-400)',
                    position: 'relative',
                    zIndex: 1,
                  }}
                  aria-hidden
                >
                  ●
                </span>

                <span
                  className="anomaly-section-panel__copy"
                  style={{ position: 'relative', zIndex: 1 }}
                >
                  <span className="anomaly-section-panel__headline">
                    {a.variable ?? 'Signal'} · {a.float_id ?? 'Unknown float'}
                  </span>
                  <span className="anomaly-section-panel__coords mono">
                    {a.lat.toFixed(2)}°, {a.lon.toFixed(2)}° · {a.depth.toFixed(0)} m
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
