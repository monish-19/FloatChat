'use client';

import { EyebrowReveal, HeadingReveal } from '@/components/SplitReveal';
import type { OceanAnomaly } from '@/components/OceanScene';

type AnomalySectionPanelProps = {
  anomalies: OceanAnomaly[];
  onSelect: (anomaly: OceanAnomaly) => void;
};

export default function AnomalySectionPanel({ anomalies, onSelect }: AnomalySectionPanelProps) {
  return (
    <aside
      className="anomaly-section-panel glass-panel"
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
        {anomalies.length.toLocaleString()} active marker{anomalies.length === 1 ? '' : 's'}
      </p>

      <ul className="anomaly-section-panel__list scroll-thread">
        {anomalies.length === 0 && (
          <li className="anomaly-section-panel__empty">No anomalies in the current window.</li>
        )}
        {anomalies.map((a, idx) => {
          const severe = (a.severity ?? 0) >= 3;
          return (
            <li key={`${a.float_id ?? 'a'}-${a.time ?? idx}`}>
              <button
                type="button"
                className="anomaly-section-panel__row"
                data-cursor="interactive"
                onClick={() => onSelect(a)}
              >
                <span
                  className="anomaly-section-panel__severity"
                  style={{ color: severe ? 'var(--coral-400)' : 'var(--bio-400)' }}
                  aria-hidden
                >
                  ●
                </span>
                <span className="anomaly-section-panel__copy">
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
