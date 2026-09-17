'use client';

/* ─────────────────────────────────────────────────────────────
   TimelineScrubber — full-width bottom-docked depth gauge
   Sonar-needle handle, IBM Plex Mono date readouts,
   play/pause + draw-transect controls.
───────────────────────────────────────────────────────────── */

import { useMemo } from 'react';

type TimelineScrubberProps = {
  cursor: number;                        // 0–1
  playing: boolean;
  drawing: boolean;
  hasData: boolean;
  timelineRange: [number, number];       // [minTs, maxTs] as epoch ms
  onCursorChange: (v: number) => void;
  onPlayingChange: (v: boolean) => void;
  onDrawToggle: () => void;
};

function formatTimestamp(epochMs: number): string {
  if (!Number.isFinite(epochMs) || epochMs === 0) return '—';
  const d = new Date(epochMs);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${y}-${mo}-${da} ${h}:${mi}`;
}

/* Build 8 tick-mark positions for the depth gauge aesthetic */
const TICKS = Array.from({ length: 9 }, (_, i) => i / 8);

export default function TimelineScrubber({
  cursor,
  playing,
  drawing,
  hasData,
  timelineRange,
  onCursorChange,
  onPlayingChange,
  onDrawToggle,
}: TimelineScrubberProps) {
  const [minTs, maxTs] = timelineRange;

  const currentTs = useMemo(
    () => minTs + (maxTs - minTs) * cursor,
    [cursor, minTs, maxTs],
  );

  const handlePlayPause = () => {
    if (!playing && cursor >= 1) onCursorChange(0);
    onPlayingChange(!playing);
  };

  return (
    <div
      id="timeline-scrubber"
      className="panel-mount"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        background: 'rgba(10,18,32,0.88)',
        backdropFilter: 'blur(20px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
        borderTop: '1px solid rgba(19,30,48,0.95)',
        padding: '10px 20px 12px',
      }}
      aria-label="Trajectory timeline scrubber"
    >
      {/* Top row: label + controls + timestamp */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
          gap: 12,
        }}
      >
        {/* Left: eyebrow label */}
        <div className="eyebrow" style={{ flexShrink: 0 }}>
          Trajectory
        </div>

        {/* Center: timestamp readout */}
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontVariantNumeric: 'tabular-nums',
            fontSize: 12,
            color: hasData ? 'var(--bio-400)' : 'var(--foam-400)',
            textShadow: hasData ? '0 0 8px rgba(45,212,191,0.4)' : 'none',
            letterSpacing: '0.04em',
          }}
          aria-live="polite"
          aria-label="Current timeline position"
        >
          {hasData ? formatTimestamp(currentTs) : 'no telemetry'}
        </div>

        {/* Right: controls */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
          {/* Draw transect */}
          <button
            id="draw-transect-btn"
            type="button"
            className={`btn-ghost${drawing ? ' active' : ''}`}
            onClick={onDrawToggle}
            aria-pressed={drawing}
            title={drawing ? 'Finish drawing transect' : 'Draw transect on map'}
          >
            {drawing ? '✓ Finish transect' : 'Draw transect'}
          </button>

          {/* Play / Pause */}
          <button
            id="play-pause-btn"
            type="button"
            disabled={!hasData}
            onClick={handlePlayPause}
            aria-label={playing ? 'Pause trajectory' : 'Play trajectory'}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: `1px solid ${hasData ? 'rgba(45,212,191,0.4)' : 'rgba(19,30,48,0.9)'}`,
              background: playing ? 'rgba(45,212,191,0.12)' : 'transparent',
              color: hasData ? 'var(--bio-400)' : 'var(--foam-400)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              transition: 'background 150ms ease, border-color 150ms ease',
              flexShrink: 0,
              cursor: hasData ? 'pointer' : 'not-allowed',
              opacity: hasData ? 1 : 0.4,
            }}
          >
            {playing ? '⏸' : '▶'}
          </button>
        </div>
      </div>

      {/* Tick marks + track */}
      <div style={{ position: 'relative', height: 20, paddingTop: 4 }}>
        {/* Tick marks — depth-gauge aesthetic */}
        {TICKS.map((t, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${t * 100}%`,
              top: 0,
              width: 1,
              height: i === 0 || i === TICKS.length - 1 ? 10 : i % 4 === 0 ? 8 : 5,
              background: 'rgba(125,148,163,0.3)',
              transform: 'translateX(-50%)',
            }}
          />
        ))}

        {/* Range track */}
        <input
          id="trajectory-timeline-input"
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={cursor}
          disabled={!hasData}
          onChange={(e) => onCursorChange(Number(e.target.value))}
          aria-label="Trajectory cursor"
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={cursor}
          aria-valuetext={formatTimestamp(currentTs)}
          className="timeline-track"
          style={{
            position: 'absolute',
            top: 6,
            left: 0,
            right: 0,
            width: '100%',
            opacity: hasData ? 1 : 0.4,
          }}
        />

        {/* Sonar needle at cursor position — visual-only */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: `${cursor * 100}%`,
            top: -2,
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            pointerEvents: 'none',
          }}
        >
          {/* Chevron cap */}
          <div style={{
            width: 0,
            height: 0,
            borderLeft: '4px solid transparent',
            borderRight: '4px solid transparent',
            borderTop: '5px solid var(--bio-400)',
            filter: 'drop-shadow(0 0 4px rgba(45,212,191,0.7))',
          }} />
        </div>
      </div>

      {/* Date labels */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 4,
          fontFamily: 'var(--font-mono)',
          fontVariantNumeric: 'tabular-nums',
          fontSize: 10,
          color: 'var(--foam-400)',
          letterSpacing: '0.03em',
        }}
      >
        <span>{formatTimestamp(minTs)}</span>
        <span>{formatTimestamp(maxTs)}</span>
      </div>
    </div>
  );
}
