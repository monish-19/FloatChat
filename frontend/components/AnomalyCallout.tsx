'use client';

/* ─────────────────────────────────────────────────────────────
   AnomalyCallout — glass HUD callout anchored to a 3D anomaly
   Positioned at projected screen coords with SVG leader line.
   "Ask about this" pre-fills chat and closes callout.
───────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from 'react';
import type { OceanAnomaly } from './OceanScene';
import { EyebrowReveal, HeadingReveal } from '@/components/SplitReveal';

type AnomalyCalloutProps = {
  anomaly: OceanAnomaly;
  screenPos: { x: number; y: number };   // projected 3D → screen coords (px)
  onClose: () => void;
  onAskAbout: (prompt: string) => void;
};

const CALLOUT_W = 240;
const CALLOUT_H = 170; // approx
const LEADER = 28;     // leader line length

export default function AnomalyCallout({
  anomaly,
  screenPos,
  onClose,
  onAskAbout,
}: AnomalyCalloutProps) {
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Trigger mount animation
    requestAnimationFrame(() => setMounted(true));
  }, []);

  // Decide callout placement to avoid viewport overflow
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const flipX = screenPos.x + LEADER + CALLOUT_W > vw - 20;
  const flipY = screenPos.y + CALLOUT_H > vh - 80;

  const calloutLeft = flipX
    ? screenPos.x - LEADER - CALLOUT_W
    : screenPos.x + LEADER;
  const calloutTop = flipY
    ? screenPos.y - CALLOUT_H
    : screenPos.y;

  // SVG leader line path
  const leaderX1 = flipX ? CALLOUT_W : 0;
  const leaderY1 = flipY ? CALLOUT_H : 0;
  const leaderX2 = flipX ? CALLOUT_W + LEADER : -LEADER;
  const leaderY2 = flipY ? CALLOUT_H + LEADER : -LEADER;

  const severe = (anomaly.severity ?? 1) >= 3;
  const accentColor = severe ? 'var(--coral-400)' : 'var(--bio-400)';
  const accentRgba = severe ? 'rgba(251,113,133,' : 'rgba(45,212,191,';

  const prompt = `Explain the ${anomaly.variable ?? 'ocean'} anomaly near ${anomaly.lat.toFixed(2)}°N, ${anomaly.lon.toFixed(2)}°E at ${anomaly.depth}m.`;

  return (
    <div
      style={{
        position: 'fixed',
        left: calloutLeft,
        top: calloutTop,
        zIndex: 30,
        pointerEvents: 'auto',
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'scale(1)' : 'scale(0.94)',
        transition: 'opacity 200ms ease-out, transform 200ms ease-out',
        transformOrigin: flipX ? 'right center' : 'left center',
      }}
      role="dialog"
      aria-modal="false"
      aria-label={`Anomaly callout: ${anomaly.variable ?? 'ocean event'}`}
    >
      {/* SVG leader line */}
      <svg
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: leaderY1 - Math.abs(leaderY2 - leaderY1),
          left: Math.min(leaderX1, leaderX2 + CALLOUT_W),
          overflow: 'visible',
          pointerEvents: 'none',
          zIndex: -1,
        }}
        width={CALLOUT_W + LEADER + 2}
        height={CALLOUT_H + LEADER + 2}
      >
        <line
          x1={leaderX1}
          y1={leaderY1}
          x2={leaderX2 + CALLOUT_W / 2}
          y2={leaderY2 + CALLOUT_H / 2}
          stroke={accentColor}
          strokeWidth={1}
          strokeOpacity={0.5}
          strokeDasharray="3 3"
        />
        {/* Anchor dot */}
        <circle
          cx={leaderX2 + CALLOUT_W / 2}
          cy={leaderY2 + CALLOUT_H / 2}
          r={3}
          fill={accentColor}
          opacity={0.8}
        />
      </svg>

      {/* Callout panel */}
      <div
        ref={ref}
        style={{
          width: CALLOUT_W,
          background: 'rgba(10,18,32,0.92)',
          backdropFilter: 'blur(20px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
          border: `1px solid ${accentRgba}0.35)`,
          borderRadius: 10,
          padding: '14px 16px',
          boxShadow: `0 0 0 1px ${accentRgba}0.1), 0 8px 32px rgba(3,7,17,0.6)`,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <EyebrowReveal
              text={severe ? 'Severe anomaly' : 'Anomaly detected'}
              className="eyebrow"
              style={{ color: accentColor }}
              staggerMs={20}
            />
            <HeadingReveal
              text={
                anomaly.variable
                  ? anomaly.variable.charAt(0).toUpperCase() + anomaly.variable.slice(1)
                  : 'Ocean event'
              }
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--foam-100)',
                marginTop: 2,
                letterSpacing: '-0.01em',
              }}
              staggerMs={60}
              delayMs={100}
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close anomaly callout"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--foam-400)',
              fontSize: 16,
              lineHeight: 1,
              padding: 2,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* Data rows — all values in mono */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
          <DataRow label="Lat / Lon">
            {anomaly.lat.toFixed(3)}°N&nbsp;&nbsp;{anomaly.lon.toFixed(3)}°E
          </DataRow>
          <DataRow label="Depth">
            {anomaly.depth}&nbsp;m
          </DataRow>
          {anomaly.severity != null && (
            <DataRow label="Severity" accent={accentColor}>
              {anomaly.severity.toFixed(1)}&nbsp;σ
            </DataRow>
          )}
          {anomaly.time && (
            <DataRow label="Time">
              {new Date(anomaly.time).toUTCString().replace('GMT', 'UTC').slice(0, 22)}
            </DataRow>
          )}
        </div>

        {/* Ask about this */}
        <button
          id="ask-about-anomaly-btn"
          type="button"
          className="btn-bio"
          style={{ width: '100%', fontSize: 12, padding: '7px 12px' }}
          onClick={() => {
            onAskAbout(prompt);
            onClose();
          }}
        >
          Ask about this →
        </button>
      </div>
    </div>
  );
}

function DataRow({
  label,
  accent,
  children,
}: {
  label: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
      <span style={{
        fontFamily: 'var(--font-ui)',
        fontSize: 11,
        color: 'var(--foam-400)',
        flexShrink: 0,
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 12,
        color: accent ?? 'var(--foam-100)',
        letterSpacing: '0.02em',
        textAlign: 'right',
      }}>
        {children}
      </span>
    </div>
  );
}
