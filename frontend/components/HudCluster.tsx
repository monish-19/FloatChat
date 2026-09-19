'use client';

/* ─────────────────────────────────────────────────────────────
   HudCluster — top-right compact instrument readouts
   Three glowing numbers only: profiles · anomalies · latency
   No cards-in-cards. One glass strip, three data points.
───────────────────────────────────────────────────────────── */

import AnimatedNum from '@/components/AnimatedNum';

type HudProps = {
  profileCount: number | null;
  anomalyCount: number | null;
  latencyMs: number | null;
  isLive: boolean;
};

export default function HudCluster({ profileCount, anomalyCount, latencyMs, isLive }: HudProps) {
  const hasAnomaly = anomalyCount !== null && anomalyCount > 0;

  return (
    <div
      className="panel-mount glass-panel parallax-layer parallax-layer--far"
      data-parallax="far"
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 20,
        display: 'flex',
        alignItems: 'stretch',
        gap: 0,
        background: 'rgba(10,18,32,0.72)',
        border: '1px solid rgba(125,148,163,0.1)',
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
