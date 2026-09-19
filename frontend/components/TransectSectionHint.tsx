'use client';

import { EyebrowReveal, HeadingReveal } from '@/components/SplitReveal';

type TransectSectionHintProps = {
  drawing: boolean;
  drawnPoints: number;
  onDrawToggle: () => void;
};

export default function TransectSectionHint({
  drawing,
  drawnPoints,
  onDrawToggle,
}: TransectSectionHintProps) {
  return (
    <div
      className="transect-section-hint glass-panel parallax-layer parallax-layer--mid"
      data-parallax="mid"
      data-cursor="interactive"
    >
      <EyebrowReveal text="Cross-section" className="eyebrow" staggerMs={22} />
      <HeadingReveal
        as="p"
        text="Draw a route on the surface plane to sample temperature or salinity along a transect."
        className="transect-section-hint__body"
        staggerMs={28}
        durationMs={280}
        delayMs={100}
      />
      <button type="button" className="btn-bio transect-section-hint__cta" onClick={onDrawToggle}>
        {drawing ? 'Finish route' : 'Draw transect'}
      </button>
      {drawnPoints > 0 && (
        <p className="transect-section-hint__meta mono">{drawnPoints} surface point{drawnPoints === 1 ? '' : 's'}</p>
      )}
    </div>
  );
}
