'use client';

/* ─────────────────────────────────────────────────────────────
   HudCluster — top-right compact instrument readouts
   Three glowing numbers only: profiles · anomalies · latency
   No cards-in-cards. One glass strip, three data points.
───────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from 'react';

type HudProps = {
  profileCount: number | null;
  anomalyCount: number | null;
  latencyMs: number | null;
  isLive: boolean;
};

function AnimatedNum({ target }: { target: number | null }) {
  const [display, setDisplay] = useState<number | null>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    if (target === null) { setDisplay(null); return; }
    if (display === null) { setDisplay(target); return; }
    const start = display;
    const duration = 600;
    const startTime = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - startTime) / duration, 1);
      // ease-out cubic
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(start + (target - start) * ease));
      if (p < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (display === null) return <span style={{ opacity: 0.3 }}>—</span>;
  return <>{display.toLocaleString()}</>;
}

export default function HudCluster({ profileCount, anomalyCount, latencyMs, isLive }: HudProps) {
  const hasAnomaly = anomalyCount !== null && anomalyCount > 0;

  return (
    <div
      className="panel-mount"
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 20,
        display: 'flex',
        alignItems: 'stretch',
        gap: 0,
        background: 'rgba(10,18,32,0.82)',
        backdropFilter: 'blur(16px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
        border: '1px solid rgba(19,30,48,0.9)',
        borderRadius: 10,
        overflow: 'hidden',
      }}
      role="status"
      aria-label="System status readouts"
      data-cursor="interactive"
    >
      {/* Profiles */}
      <HudCell label="Profiles" isAlert={false}>
        <AnimatedNum target={profileCount} />
      </HudCell>

      <div style={{ width: 1, background: 'rgba(19,30,48,0.9)', flexShrink: 0 }} />

      {/* Anomalies */}
      <HudCell label="Anomalies" isAlert={hasAnomaly}>
        <AnimatedNum target={anomalyCount} />
      </HudCell>

      <div style={{ width: 1, background: 'rgba(19,30,48,0.9)', flexShrink: 0 }} />

      {/* Latency */}
      <HudCell label="Latency" isAlert={latencyMs !== null && latencyMs > 3000} suffix=" ms">
        <AnimatedNum target={latencyMs !== null ? Math.round(latencyMs) : null} />
      </HudCell>

      {/* Live pulse */}
      <div
        style={{
          width: 1,
          background: 'rgba(19,30,48,0.9)',
          flexShrink: 0,
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: isLive ? 'var(--bio-400)' : 'var(--foam-400)',
            boxShadow: isLive ? '0 0 8px rgba(45,212,191,0.7)' : 'none',
            flexShrink: 0,
          }}
          title={isLive ? 'Live backend' : 'Demo / offline'}
        />
      </div>
    </div>
  );
}

function HudCell({
  label,
  isAlert,
  suffix = '',
  children,
}: {
  label: string;
  isAlert: boolean;
  suffix?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '10px 16px',
        gap: 3,
        minWidth: 72,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontVariantNumeric: 'tabular-nums',
          fontSize: 20,
          fontWeight: 600,
          lineHeight: 1,
          letterSpacing: '-0.02em',
          color: isAlert ? 'var(--coral-400)' : 'var(--bio-400)',
          textShadow: isAlert
            ? '0 0 12px rgba(251,113,133,0.6), 0 0 28px rgba(251,113,133,0.15)'
            : '0 0 12px rgba(45,212,191,0.6), 0 0 28px rgba(45,212,191,0.15)',
        }}
      >
        {children}{suffix && <span style={{ fontSize: 11, marginLeft: 2 }}>{suffix}</span>}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: 'var(--foam-400)',
        }}
      >
        {label}
      </div>
    </div>
  );
}
