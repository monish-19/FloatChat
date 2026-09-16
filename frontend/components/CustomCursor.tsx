'use client';

import { useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';

type Ripple = { id: number; x: number; y: number };

const INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, [role="button"], .panel, [data-cursor="interactive"]';

export default function CustomCursor() {
  const reduceMotion = useReducedMotion();
  const [touchDevice, setTouchDevice] = useState(false);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const pointer = useRef({ x: 0, y: 0, visible: false });
  const eased = useRef({ x: 0, y: 0 });
  const ring = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLDivElement>(null);
  const trail = useRef(Array.from({ length: 6 }, () => ({ x: 0, y: 0 })));
  const trailRefs = useRef<(HTMLDivElement | null)[]>([]);
  const interactive = useRef(false);

  useEffect(() => {
    const hasTouch = window.matchMedia('(pointer: coarse)').matches;
    setTouchDevice(hasTouch);
  }, []);

  useEffect(() => {
    if (reduceMotion || touchDevice) return;
    document.body.classList.add('custom-cursor-active');

    let frame = 0;
    const update = () => {
      eased.current.x += (pointer.current.x - eased.current.x) * 0.18;
      eased.current.y += (pointer.current.y - eased.current.y) * 0.18;

      if (dot.current) {
        dot.current.style.transform = `translate3d(${eased.current.x}px, ${eased.current.y}px, 0)`;
        dot.current.style.opacity = pointer.current.visible ? '1' : '0';
      }
      if (ring.current) {
        ring.current.style.transform = `translate3d(${eased.current.x}px, ${eased.current.y}px, 0) scale(${interactive.current ? 1.55 : 1})`;
        ring.current.style.opacity = pointer.current.visible ? '1' : '0';
      }

      trail.current.forEach((bubble, index) => {
        const follow = index === 0 ? eased.current : trail.current[index - 1];
        bubble.x += (follow.x - bubble.x) * (0.12 - index * 0.012);
        bubble.y += (follow.y - bubble.y) * (0.12 - index * 0.012);
        const bubbleNode = trailRefs.current[index];
        if (bubbleNode) {
          bubbleNode.style.transform = `translate3d(${bubble.x}px, ${bubble.y}px, 0) scale(${1 - index * 0.1})`;
          bubbleNode.style.opacity = pointer.current.visible ? `${0.28 - index * 0.03}` : '0';
        }
      });

      frame = window.requestAnimationFrame(update);
    };

    frame = window.requestAnimationFrame(update);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.classList.remove('custom-cursor-active');
    };
  }, [reduceMotion, touchDevice]);

  useEffect(() => {
    if (reduceMotion) return;

    const onMove = (event: PointerEvent) => {
      pointer.current.x = event.clientX;
      pointer.current.y = event.clientY;
      pointer.current.visible = true;
      const target = event.target as Element | null;
      interactive.current = Boolean(target?.closest(INTERACTIVE_SELECTOR));
    };
    const onEnter = () => {
      pointer.current.visible = true;
    };
    const onLeave = () => {
      pointer.current.visible = false;
    };
    const onTouch = (event: TouchEvent) => {
      if (!touchDevice) return;
      const point = event.touches[0];
      if (!point) return;
      const id = Date.now();
      setRipples((current) => [...current, { id, x: point.clientX, y: point.clientY }]);
      window.setTimeout(() => {
        setRipples((current) => current.filter((ripple) => ripple.id !== id));
      }, 540);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerenter', onEnter);
    window.addEventListener('pointerleave', onLeave);
    window.addEventListener('touchstart', onTouch, { passive: true });

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerenter', onEnter);
      window.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('touchstart', onTouch);
    };
  }, [reduceMotion, touchDevice]);

  const bubbles = useMemo(() => Array.from({ length: 6 }), []);

  return (
    <>
      {!reduceMotion && !touchDevice && (
        <div className="pointer-events-none fixed inset-0 z-[90]">
          {bubbles.map((_, index) => (
            <div
              key={`trail-${index}`}
              ref={(node) => {
                trailRefs.current[index] = node;
              }}
              className="cursor-bubble"
            />
          ))}
          <div ref={ring} className="cursor-ring" />
          <div ref={dot} className="cursor-dot" />
        </div>
      )}
      {touchDevice && (
        <div className="pointer-events-none fixed inset-0 z-[90]">
          {ripples.map((ripple) => (
            <span key={ripple.id} className="tap-ripple" style={{ left: ripple.x, top: ripple.y }} />
          ))}
        </div>
      )}
    </>
  );
}
