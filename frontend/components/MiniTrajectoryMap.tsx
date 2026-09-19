'use client';

/* ─────────────────────────────────────────────────────────────
   MiniTrajectoryMap — compact SVG overview of all float paths
   Rendered inside the "02 Traces" section panel.
   Uses FloatTrajectory data already fetched in page.tsx.
   No API calls, no new state.
───────────────────────────────────────────────────────────── */

import { useMemo } from 'react';
import type { FloatTrajectory } from '@/components/OceanScene';

const W = 248;
const H = 90;
const PAD = 10;

/* Each float gets a distinct bioluminescent hue */
const PALETTE = [
  '45,212,191',   // bio-400 teal
  '56,189,248',   // sky
  '94,234,212',   // bio-300
  '167,139,250',  // violet
  '251,191,36',   // amber (used sparingly — warm accent)
  '96,165,250',   // cornflower
  '52,211,153',   // emerald
  '248,113,113',  // soft coral
];

type Props = { trajectories: FloatTrajectory[] };

export default function MiniTrajectoryMap({ trajectories }: Props) {
  const { floatPaths, hasData } = useMemo(() => {
    const allPts = trajectories.flatMap((t) => t.path);
    if (allPts.length < 2) return { floatPaths: [], hasData: false };

    const lats = allPts.map((p) => p.lat);
    const lons = allPts.map((p) => p.lon);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    /* Pad bounds slightly so paths don't touch edges */
    const latR = (maxLat - minLat) * 1.12 || 1;
    const lonR = (maxLon - minLon) * 1.12 || 1;
    const latOff = (latR - (maxLat - minLat)) / 2;
    const lonOff = (lonR - (maxLon - minLon)) / 2;

    const iW = W - PAD * 2;
    const iH = H - PAD * 2;
    const toX = (lon: number) => PAD + ((lon - minLon + lonOff) / lonR) * iW;
    /* Latitude: higher lat = lower y (screen coords inverted) */
    const toY = (lat: number) => PAD + ((maxLat + latOff - lat) / latR) * iH;

    const floatPaths = trajectories.map((traj, i) => {
      /* Sample up to 32 most-recent points to avoid over-drawing */
      const pts = traj.path.slice(-32);
      const polyline = pts
        .map((p) => `${toX(p.lon).toFixed(1)},${toY(p.lat).toFixed(1)}`)
        .join(' ');
      const last = pts[pts.length - 1];
      return {
        id: traj.float_id,
        color: PALETTE[i % PALETTE.length],
        polyline,
        endX: last ? toX(last.lon) : -999,
        endY: last ? toY(last.lat) : -999,
      };
    });

    return { floatPaths, hasData: true };
  }, [trajectories]);

  if (!hasData) return null;

  return (
    <div
      style={{
        position: 'relative',
        marginTop: 10,
        borderRadius: 'var(--radius-md)',
        border: '1px solid rgba(19,30,48,0.9)',
        background: 'rgba(3,7,17,0.55)',
        overflow: 'hidden',
      }}
      aria-hidden="true"
    >
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block', width: '100%' }}
      >
        {/* Subtle grid — just 2 horizontal reference lines */}
        {[0.33, 0.67].map((f) => (
          <line
            key={f}
            x1={PAD}
            y1={PAD + f * (H - PAD * 2)}
            x2={W - PAD}
            y2={PAD + f * (H - PAD * 2)}
            stroke="rgba(19,30,48,0.8)"
            strokeWidth="0.5"
            strokeDasharray="2 5"
          />
        ))}

        {/* Float trajectories */}
        {floatPaths.map((fp) => (
          <g key={fp.id}>
            {/* Path */}
            <polyline
              points={fp.polyline}
              fill="none"
              stroke={`rgba(${fp.color}, 0.6)`}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Pulsing dot at latest fix */}
            {fp.endX > -900 && (
              <circle
                cx={fp.endX}
                cy={fp.endY}
                r="2.5"
                fill={`rgba(${fp.color}, 0.95)`}
                className="anomaly-pulse"
              />
            )}
          </g>
        ))}
      </svg>

      {/* Label */}
      <div
        style={{
          position: 'absolute',
          top: 4,
          left: 7,
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'rgba(125,148,163,0.55)',
          pointerEvents: 'none',
        }}
      >
        Float paths · {trajectories.length}
      </div>
    </div>
  );
}
