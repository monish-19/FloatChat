'use client';

import { motion } from 'framer-motion';

const MAX_DEPTH_M = 2000;

type EntryPreloaderProps = {
  progress: number;
  exiting: boolean;
  onExitComplete: () => void;
};

export default function EntryPreloader({ progress, exiting, onExitComplete }: EntryPreloaderProps) {
  const clamped = Math.min(1, Math.max(0, progress));
  const depthM = Math.round(clamped * MAX_DEPTH_M);
  const barWidth = `${clamped * 100}%`;

  return (
    <motion.div
      className="entry-preloader"
      role="status"
      aria-live="polite"
      aria-label={`Initializing ocean scene, depth ${depthM} meters`}
      initial={{ opacity: 1 }}
      animate={{
        opacity: exiting ? 0 : 1,
        scale: exiting ? 1.03 : 1,
      }}
      transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
      onAnimationComplete={() => {
        if (exiting) onExitComplete();
      }}
    >
      <div className="entry-preloader__vignette" aria-hidden />

      <div className="entry-preloader__core">
        <p className="entry-preloader__label">Descent</p>
        <p className="entry-preloader__depth" aria-hidden={false}>
          <span className="entry-preloader__depth-value">{depthM}</span>
          <span className="entry-preloader__depth-unit">m</span>
        </p>
        <p className="entry-preloader__range" aria-hidden>
          0m → {MAX_DEPTH_M}m
        </p>

        <div className="entry-preloader__track" aria-hidden>
          <motion.div
            className="entry-preloader__fill"
            style={{ width: barWidth }}
            layout
            transition={{ type: 'spring', stiffness: 120, damping: 28 }}
          />
        </div>

        <p className="entry-preloader__status">
          {clamped >= 1 ? 'Surface lock' : 'Compiling shaders · loading scene'}
        </p>
      </div>
    </motion.div>
  );
}
