'use client';

/* -----------------------------------------------------------------
   SplitReveal — word-by-word / char-by-char stagger reveal
   Built on framer-motion. No GSAP SplitText dep.

   Design rules (DESIGN.md §Motion):
   · Under 600ms total per element
   · subtle: y + clipPath, not scale + bounce
   · prefers-reduced-motion: instant, no animation
----------------------------------------------------------------- */

import { motion, useReducedMotion } from 'framer-motion';
import { ReactNode, useMemo } from 'react';

/* ── Shared variants ──────────────────────────────────────── */

const containerVariants = {
  hidden: {},
  visible: (staggerMs: number) => ({
    transition: {
      staggerChildren: staggerMs / 1000,
      delayChildren: 0,
    },
  }),
};

const wordVariants = {
  hidden: {
    y: '60%',
    opacity: 0,
    clipPath: 'inset(0 0 100% 0)',
  },
  visible: {
    y: 0,
    opacity: 1,
    clipPath: 'inset(0 0 0% 0)',
  },
};

/* ── HeadingReveal ────────────────────────────────────────── */

export function HeadingReveal({
  text,
  staggerMs = 55,
  durationMs = 340,
  delayMs = 0,
  as: Tag = 'div',
  className,
  style,
}: {
  text: string;
  staggerMs?: number;
  durationMs?: number;
  delayMs?: number;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  style?: React.CSSProperties;
}) {
  const reduceMotion = useReducedMotion();
  const words = useMemo(() => text.split(' ').filter(Boolean), [text]);

  if (reduceMotion) {
    return <Tag className={className} style={style}>{text}</Tag>;
  }

  return (
    <Tag
      className={className}
      style={{ ...style, display: 'block' }}
      aria-label={text}
    >
      <motion.span
        style={{ display: 'inline' }}
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        custom={staggerMs}
      >
        {words.map((word, i) => (
          <span
            key={i}
            style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom' }}
            aria-hidden
          >
            <motion.span
              style={{ display: 'inline-block' }}
              variants={wordVariants}
              transition={{
                duration: durationMs / 1000,
                ease: [0.22, 1, 0.36, 1],
                delay: delayMs / 1000,
              }}
            >
              {word}
            </motion.span>
            {i < words.length - 1 ? ' ' : ''}
          </span>
        ))}
      </motion.span>
    </Tag>
  );
}

/* ── EyebrowReveal ────────────────────────────────────────── */

export function EyebrowReveal({
  text,
  staggerMs = 18,
  durationMs = 200,
  delayMs = 0,
  className,
  style,
}: {
  text: string;
  staggerMs?: number;
  durationMs?: number;
  delayMs?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const reduceMotion = useReducedMotion();
  const chars = useMemo(() => Array.from(text), [text]);

  if (reduceMotion) {
    return <div className={className} style={style}>{text}</div>;
  }

  return (
    <div
      className={className}
      style={{ ...style, display: 'inline-flex', flexWrap: 'wrap' }}
      aria-label={text}
    >
      <motion.span
        style={{ display: 'inline-flex', flexWrap: 'wrap' }}
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        custom={staggerMs}
      >
        {chars.map((char, i) => (
          <motion.span
            key={i}
            aria-hidden
            style={{ display: 'inline-block', whiteSpace: 'pre' }}
            variants={wordVariants}
            transition={{
              duration: durationMs / 1000,
              ease: [0.22, 1, 0.36, 1],
              delay: delayMs / 1000,
            }}
          >
            {char}
          </motion.span>
        ))}
      </motion.span>
    </div>
  );
}

/* ── PanelReveal ──────────────────────────────────────────── */

export function PanelReveal({
  children,
  className,
  style,
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  delayMs?: number;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduceMotion ? 0.01 : 0.2,
        ease: 'easeOut',
        delay: delayMs / 1000,
      }}
    >
      {children}
    </motion.div>
  );
}
