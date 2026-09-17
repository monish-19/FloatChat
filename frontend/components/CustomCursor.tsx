'use client';

import { useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';

type TrailParticle = {
  x: number;
  y: number;
  life: number;
  size: number;
};

const INTERACTIVE_SELECTOR = [
  'button',
  'a',
  'input',
  'select',
  'textarea',
  'label',
  '[role="button"]',
  '[role="tab"]',
  '[role="slider"]',
  '[role="switch"]',
  '.panel',
  '.panel-mount',
  '.glass-panel-interactive',
  '.tilt-card',
  '.btn-bio',
  '.ocean-input',
  '[data-cursor="interactive"]',
].join(', ');

const MAX_PARTICLES = 28;
const PARTICLE_POOL = 28;

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

export default function CustomCursor() {
  const motionReduced = useReducedMotion();
  const [active, setActive] = useState(false);

  const pointer = useRef({ x: -100, y: -100, visible: false });
  const prevPointer = useRef({ x: -100, y: -100, t: 0 });
  const velocity = useRef(0);
  const dot = useRef({ x: -100, y: -100 });
  const ring = useRef({ x: -100, y: -100 });
  const ringScale = useRef(1);
  const dotScale = useRef(1);
  const interactive = useRef(false);

  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const particleRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const particles = useRef<TrailParticle[]>([]);

  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setActive(!coarse && !reduced && motionReduced !== true);
  }, [motionReduced]);

  useEffect(() => {
    if (!active) return;
    document.body.classList.add('custom-cursor-active');

    let frame = 0;
    const loop = () => {
      const follow = interactive.current ? 0.52 : 0.2;
      const ringFollow = interactive.current ? 0.38 : 0.14;

      dot.current.x += (pointer.current.x - dot.current.x) * follow;
      dot.current.y += (pointer.current.y - dot.current.y) * follow;
      ring.current.x += (pointer.current.x - ring.current.x) * ringFollow;
      ring.current.y += (pointer.current.y - ring.current.y) * ringFollow;

      const targetRing = interactive.current ? 1.72 : 1;
      const targetDot = interactive.current ? 1.35 : 1;
      ringScale.current += (targetRing - ringScale.current) * (interactive.current ? 0.42 : 0.16);
      dotScale.current += (targetDot - dotScale.current) * (interactive.current ? 0.45 : 0.18);

      const speed = velocity.current;
      const trailIntensity = clamp(speed / 900, 0, 1);
      const visible = pointer.current.visible;

      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${dot.current.x}px, ${dot.current.y}px, 0) scale(${dotScale.current})`;
        dotRef.current.style.opacity = visible ? '1' : '0';
      }
      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${ring.current.x}px, ${ring.current.y}px, 0) scale(${ringScale.current})`;
        ringRef.current.style.opacity = visible ? String(0.55 + trailIntensity * 0.35) : '0';
      }
      if (glowRef.current) {
        const glowSize = 18 + trailIntensity * 36;
        glowRef.current.style.transform = `translate3d(${dot.current.x}px, ${dot.current.y}px, 0) scale(${1 + trailIntensity * 0.8})`;
        glowRef.current.style.width = `${glowSize}px`;
        glowRef.current.style.height = `${glowSize}px`;
        glowRef.current.style.marginLeft = `${-glowSize / 2}px`;
        glowRef.current.style.marginTop = `${-glowSize / 2}px`;
        glowRef.current.style.opacity = visible ? String(0.12 + trailIntensity * 0.38) : '0';
      }

      for (let i = particles.current.length - 1; i >= 0; i -= 1) {
        const p = particles.current[i];
        p.life -= 0.035 + trailIntensity * 0.02;
        if (p.life <= 0) particles.current.splice(i, 1);
      }

      particleRefs.current.forEach((node, index) => {
        if (!node) return;
        const p = particles.current[index];
        if (!p || !visible) {
          node.style.opacity = '0';
          return;
        }
        node.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) scale(${p.size * p.life})`;
        node.style.opacity = String(p.life * (0.15 + trailIntensity * 0.55));
      });

      velocity.current *= 0.86;
      frame = window.requestAnimationFrame(loop);
    };

    frame = window.requestAnimationFrame(loop);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.classList.remove('custom-cursor-active');
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;

    const spawnParticle = (x: number, y: number, speed: number) => {
      if (particles.current.length >= MAX_PARTICLES) particles.current.shift();
      const size = 0.35 + clamp(speed / 520, 0, 1) * 1.1;
      particles.current.push({ x, y, life: 1, size });
    };

    const onMove = (event: PointerEvent) => {
      const now = performance.now();
      const dt = Math.max(8, now - (prevPointer.current.t || now));
      const dx = event.clientX - prevPointer.current.x;
      const dy = event.clientY - prevPointer.current.y;
      const speed = (Math.hypot(dx, dy) / dt) * 1000;
      velocity.current = speed;

      if (speed > 48 && prevPointer.current.t > 0) {
        const steps = clamp(Math.floor(speed / 220), 1, 3);
        for (let i = 0; i < steps; i += 1) {
          const t = (i + 1) / (steps + 1);
          spawnParticle(
            prevPointer.current.x + dx * t,
            prevPointer.current.y + dy * t,
            speed,
          );
        }
      }

      pointer.current.x = event.clientX;
      pointer.current.y = event.clientY;
      pointer.current.visible = true;
      prevPointer.current = { x: event.clientX, y: event.clientY, t: now };

      const target = event.target as Element | null;
      interactive.current = Boolean(target?.closest(INTERACTIVE_SELECTOR));
    };

    const onEnter = () => {
      pointer.current.visible = true;
    };
    const onLeave = () => {
      pointer.current.visible = false;
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerenter', onEnter);
    window.addEventListener('pointerleave', onLeave);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerenter', onEnter);
      window.removeEventListener('pointerleave', onLeave);
    };
  }, [active]);

  const pool = useMemo(() => Array.from({ length: PARTICLE_POOL }), []);

  if (!active) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[150]" aria-hidden>
      {pool.map((_, index) => (
        <span
          key={`cursor-particle-${index}`}
          ref={(node) => {
            particleRefs.current[index] = node;
          }}
          className="cursor-particle"
        />
      ))}
      <div ref={glowRef} className="cursor-glow" />
      <div ref={ringRef} className="cursor-ring" />
      <div ref={dotRef} className="cursor-dot" />
    </div>
  );
}
