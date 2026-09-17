'use client';

import { motion } from 'framer-motion';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import EntryPreloader from '@/components/EntryPreloader';
import { hasCompletedEntrySession, markEntrySessionComplete } from '@/lib/entrySession';

type EntryGateProps = {
  children: ReactNode;
  /** 0–1 boot progress from R3F scene (shaders / loading manager). */
  sceneBootProgress: number;
  /** 0–1 when the OceanScene JS chunk has resolved. */
  chunkReady: boolean;
};

export default function EntryGate({ children, sceneBootProgress, chunkReady }: EntryGateProps) {
  const [hydrated, setHydrated] = useState(false);
  const [skipEntry, setSkipEntry] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [exiting, setExiting] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const exitTriggered = useRef(false);

  useEffect(() => {
    const done = hasCompletedEntrySession();
    setSkipEntry(done);
    if (done) {
      setOverlayVisible(false);
      setRevealed(true);
    }
    setHydrated(true);
  }, []);

  const loadProgress = useMemo(() => {
    const chunk = chunkReady ? 1 : 0;
    const scene = Math.min(1, Math.max(0, sceneBootProgress));
    return chunk * 0.22 + scene * 0.78;
  }, [chunkReady, sceneBootProgress]);

  useEffect(() => {
    if (!hydrated || skipEntry || exitTriggered.current) return;
    if (loadProgress < 1) return;

    exitTriggered.current = true;
    const t = window.setTimeout(() => setExiting(true), 180);
    return () => window.clearTimeout(t);
  }, [hydrated, skipEntry, loadProgress]);

  const handleExitComplete = () => {
    markEntrySessionComplete();
    setOverlayVisible(false);
    setRevealed(true);
  };

  if (!hydrated) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--abyss-950)',
        }}
      />
    );
  }

  return (
    <>
      <motion.div
        className="entry-dashboard"
        initial={skipEntry ? false : { opacity: 0, scale: 0.97 }}
        animate={
          revealed
            ? { opacity: 1, scale: 1 }
            : { opacity: 0, scale: 0.97 }
        }
        transition={{
          duration: 0.95,
          ease: [0.16, 1, 0.3, 1],
          delay: revealed && !skipEntry ? 0.08 : 0,
        }}
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: overlayVisible ? 'none' : 'auto',
        }}
      >
        {children}
      </motion.div>

      {overlayVisible && (
        <EntryPreloader
          progress={loadProgress}
          exiting={exiting}
          onExitComplete={handleExitComplete}
        />
      )}
    </>
  );
}
