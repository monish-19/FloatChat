'use client';

import { animate, useMotionValue, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

type AnimatedNumProps = {
  target: number | null;
  format?: (n: number) => string;
};

export default function AnimatedNum({ target, format }: AnimatedNumProps) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState<number | null>(
    target === null ? null : reduce ? target : 0,
  );
  const value = useMotionValue(reduce ? (target ?? 0) : 0);

  useEffect(() => {
    if (target === null) {
      setDisplay(null);
      return;
    }
    if (reduce) {
      setDisplay(target);
      return;
    }

    const controls = animate(value, target, {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setDisplay(Math.round(latest)),
    });

    return () => controls.stop();
  }, [target, value, reduce]);

  if (display === null) return <span style={{ opacity: 0.3 }}>—</span>;
  const out = format ? format(display) : display.toLocaleString();
  return (
    <span className="tabular-nums" aria-live="polite">
      {out}
    </span>
  );
}
