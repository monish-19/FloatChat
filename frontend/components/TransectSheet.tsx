'use client';

/* ─────────────────────────────────────────────────────────────
   TransectSheet — bottom sheet sliding up over the 3D scene
   Scene remains visible through semi-transparent scrim.
   Contains the temperature/salinity heatmap grid.
───────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from 'react';

type Transect = {
  variable: 'temperature' | 'salinity';
  distance_km: number[];
  depths: number[];
  grid: { depth: number; values: (number | null)[] }[];
};

type TransectSheetProps = {
  transect: Transect | null;
  loading: boolean;
  variable: 'temperature' | 'salinity';
  drawnPoints: number;
  onVariableChange: (v: 'temperature' | 'salinity') => void;
  onClose: () => void;
};

const TEMP_PALETTE = ['var(--temp-1)', 'var(--temp-2)', 'var(--temp-3)', 'var(--temp-4)', 'var(--temp-5)'];
const SAL_PALETTE  = ['var(--sal-1)',  'var(--sal-2)',  'var(--sal-3)',  'var(--sal-4)',  'var(--sal-5)'];

function lerp5(palette: string[], ratio: number): string {
  const idx = Math.min(4, Math.floor(Math.max(0, Math.min(1, ratio)) * 5));
  return palette[idx];
}

export default function TransectSheet({
  transect,
  loading,
  variable,
  drawnPoints,
  onVariableChange,
  onClose,
}: TransectSheetProps) {
  const [mounted, setMounted] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);

  useEffect(() => { requestAnimationFrame(() => setMounted(true)); }, []);

  // Swipe-down to close
  const handleTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (startY.current === null) return;
    const delta = e.changedTouches[0].clientY - startY.current;
    if (delta > 60) onClose();
    startY.current = null;
  };

  const values = transect?.grid.flatMap((r) => r.values.filter((v): v is number => v !== null)) ?? [];
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const palette = variable === 'temperature' ? TEMP_PALETTE : SAL_PALETTE;

  return (
    <>
      {/* Scrim — scene still visible behind it */}
      <div
        id="transect-scrim"
        className="scrim"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 35,
          cursor: 'pointer',
        }}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        id="transect-sheet"
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Transect cross-section"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          position: 'fixed',
          bottom: 72,           // above timeline scrubber
          left: 0,
          right: 0,
          zIndex: 40,
          height: '58vh',
          background: 'rgba(10,18,32,0.94)',
          backdropFilter: 'blur(24px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.5)',
          borderTop: '1px solid rgba(45,212,191,0.2)',
          borderRadius: '16px 16px 0 0',
          display: 'flex',
          flexDirection: 'column',
          transform: mounted ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 300ms ease-out',
          boxShadow: '0 -8px 48px rgba(3,7,17,0.7)',
        }}
      >
        {/* Drag handle */}
        <div
          aria-hidden="true"
          style={{
            display: 'flex',
            justifyContent: 'center',
            paddingTop: 10,
            paddingBottom: 6,
            flexShrink: 0,
          }}
        >
          <div style={{
            width: 36,
            height: 3,
            borderRadius: 2,
            background: 'rgba(125,148,163,0.3)',
          }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px 12px',
          flexShrink: 0,
          borderBottom: '1px solid rgba(19,30,48,0.9)',
        }}>
          <div>
            <div className="eyebrow">Observed transect</div>
            <div style={{
              fontFamily: 'var(--font-ui)',
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--foam-100)',
              marginTop: 2,
              letterSpacing: '-0.01em',
            }}>
              {variable === 'temperature' ? 'Temperature' : 'Salinity'} cross-section
            </div>
            {drawnPoints >= 2 && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--bio-400)', marginTop: 2 }}>
                · custom route · {drawnPoints} points
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Variable selector */}
            <label
              htmlFor="transect-variable-select"
              style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--foam-400)' }}
            >
              Variable
            </label>
            <select
              id="transect-variable-select"
              value={variable}
              onChange={(e) => onVariableChange(e.target.value as 'temperature' | 'salinity')}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--bio-400)',
                background: 'rgba(3,7,17,0.6)',
                border: '1px solid rgba(19,30,48,0.9)',
                borderRadius: 6,
                padding: '4px 10px',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="temperature">Temperature</option>
              <option value="salinity">Salinity</option>
            </select>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close transect sheet"
              style={{
                background: 'transparent',
                border: '1px solid rgba(19,30,48,0.9)',
                borderRadius: 6,
                color: 'var(--foam-400)',
                fontSize: 16,
                lineHeight: 1,
                padding: '4px 8px',
                cursor: 'pointer',
                transition: 'border-color 150ms ease, color 150ms ease',
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'hidden', padding: '12px 20px 0' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '24px 0' }}>
              <div className="wave-skeleton" style={{ height: 14, borderRadius: 4, width: '60%' }} />
              <div className="wave-skeleton" style={{ height: 10, borderRadius: 4, width: '40%' }} />
            </div>
          ) : transect?.grid.length ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Axis label top */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)',
                fontVariantNumeric: 'tabular-nums',
                fontSize: 10,
                color: 'var(--foam-400)',
                letterSpacing: '0.03em',
              }}>
                <span>Surface</span>
                <span>
                  {transect.distance_km.at(-1)?.toFixed(1) ?? 0} km transect
                </span>
                <span>Depth ↓</span>
              </div>

              {/* Heatmap grid */}
              <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden' }}>
                <div style={{ minWidth: 480 }}>
                  {transect.grid.map((row) => (
                    <div key={row.depth} style={{ display: 'flex', height: 8, gap: 1, marginBottom: 1 }}>
                      {row.values.map((val, ci) => {
                        const ratio = val == null ? null : (val - min) / Math.max(max - min, 0.001);
                        const bg = ratio == null ? 'rgba(19,30,48,0.9)' : lerp5(palette, ratio);
                        return (
                          <div
                            key={ci}
                            title={`${row.depth}m · ${val == null ? 'no observation' : val.toFixed(3)}`}
                            style={{
                              flex: 1,
                              borderRadius: 1,
                              backgroundColor: bg,
                              opacity: ratio == null ? 0.3 : 1,
                            }}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* Depth axis labels */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)',
                fontVariantNumeric: 'tabular-nums',
                fontSize: 10,
                color: 'var(--foam-400)',
                letterSpacing: '0.03em',
                paddingBottom: 8,
              }}>
                <span>{transect.depths[0] ?? 0} m</span>
                <span>{transect.depths.at(-1) ?? 0} m</span>
              </div>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              fontFamily: 'var(--font-ui)',
              fontSize: 13,
              color: 'var(--foam-400)',
              textAlign: 'center',
            }}>
              No {variable} measurements available for a cross-section.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
