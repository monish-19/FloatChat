'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { ReactNode } from 'react';
import type { DashboardSectionId } from '@/lib/sections';

type SectionLayerProps = {
  id: DashboardSectionId;
  active: boolean;
  direction: number;
  children: ReactNode;
};

export default function SectionLayer({ id, active, direction, children }: SectionLayerProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      id={`section-panel-${id}`}
      role="tabpanel"
      aria-labelledby={`section-tab-${id}`}
      aria-hidden={!active}
      className="section-layer"
      initial={false}
      animate={{
        opacity: active ? 1 : 0,
        x: active || reduceMotion ? 0 : direction * 26,
        y: active || reduceMotion ? 0 : direction * 6,
      }}
      transition={{
        duration: reduceMotion ? 0.15 : 0.48,
        ease: [0.22, 1, 0.36, 1],
      }}
      style={{
        pointerEvents: active ? 'auto' : 'none',
        visibility: active ? 'visible' : 'hidden',
      }}
    >
      {children}
    </motion.div>
  );
}
