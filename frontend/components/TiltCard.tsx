'use client';

import { HTMLAttributes, PropsWithChildren, useEffect, useRef } from 'react';

export default function TiltCard({ children, className = '', ...props }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || window.matchMedia('(pointer: coarse)').matches) return;

    let frame = 0;
    const update = (x: number, y: number) => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        node.style.setProperty('--fc-tilt-x', `${x.toFixed(2)}deg`);
        node.style.setProperty('--fc-tilt-y', `${y.toFixed(2)}deg`);
      });
    };

    const onMove = (event: MouseEvent) => {
      const bounds = node.getBoundingClientRect();
      const px = (event.clientX - bounds.left) / bounds.width;
      const py = (event.clientY - bounds.top) / bounds.height;
      update((0.5 - py) * 5.5, (px - 0.5) * 7.5);
    };

    const onLeave = () => update(0, 0);

    node.addEventListener('mousemove', onMove);
    node.addEventListener('mouseleave', onLeave);

    return () => {
      node.removeEventListener('mousemove', onMove);
      node.removeEventListener('mouseleave', onLeave);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ref} className={`tilt-card ${className}`} data-cursor="interactive" {...props}>
      {children}
    </div>
  );
}
