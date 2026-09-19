'use client';

import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { QualityLevel } from '@/lib/settings';

type SoundEngine = {
  ctx: AudioContext;
  master: GainNode;
  stop: () => void;
};

function buildAmbientSound(): SoundEngine {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 2.5);
  master.connect(ctx.destination);
  const nodes: AudioNode[] = [];
  const makeOsc = (freq: number, type: OscillatorType, gain: number, detune = 0) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = type; osc.frequency.value = freq; osc.detune.value = detune;
    g.gain.value = gain; filter.type = 'lowpass'; filter.frequency.value = 320; filter.Q.value = 0.8;
    osc.connect(filter); filter.connect(g); g.connect(master); osc.start();
    nodes.push(osc, g, filter); return osc;
  };
  makeOsc(38, 'sine', 0.55); makeOsc(76, 'sine', 0.22, 4);
  makeOsc(57, 'triangle', 0.12, -6); makeOsc(114, 'sine', 0.08, 2);
  const lfo = ctx.createOscillator(); const lfoGain = ctx.createGain();
  lfo.type = 'sine'; lfo.frequency.value = 0.065; lfoGain.gain.value = 0.012;
  lfo.connect(lfoGain); lfoGain.connect(master.gain); lfo.start();
  nodes.push(lfo, lfoGain);
  const bufferSize = ctx.sampleRate * 2;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    data[i] = (b0 + b1 + b2 + white * 0.0556) / 7;
  }
  const noiseSource = ctx.createBufferSource(); noiseSource.buffer = noiseBuffer; noiseSource.loop = true;
  const noiseFilter = ctx.createBiquadFilter(); noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 180; noiseFilter.Q.value = 0.4;
  const noiseGain = ctx.createGain(); noiseGain.gain.value = 0.06;
  noiseSource.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(master); noiseSource.start();
  nodes.push(noiseSource, noiseFilter, noiseGain);
  const stop = () => {
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2);
    setTimeout(() => {
      nodes.forEach((n) => { try { (n as OscillatorNode | AudioBufferSourceNode).stop?.(); } catch { /**/ } });
      ctx.close();
    }, 1400);
  };
  return { ctx, master, stop };
}

function SoundOnIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
    </svg>
  );
}
function SoundOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <line x1="23" y1="9" x2="17" y2="15"/>
      <line x1="17" y1="9" x2="23" y2="15"/>
    </svg>
  );
}
function SettingsGearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

type SettingsPanelProps = {
  quality: QualityLevel;
  soundEnabled: boolean;
  onQualityChange: (q: QualityLevel) => void;
  onSoundChange: (enabled: boolean) => void;
};

const QUALITY_LEVELS: QualityLevel[] = ['high', 'medium', 'low'];
const QUALITY_LABELS: Record<QualityLevel, string> = { high: 'High', medium: 'Med', low: 'Low' };

export default function SettingsPanel({ quality, soundEnabled, onQualityChange, onSoundChange }: SettingsPanelProps) {
  const [open, setOpen] = useState(false);
  const rm = useReducedMotion();
  const soundEngineRef = useRef<SoundEngine | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const startSound = useCallback(() => {
    if (soundEngineRef.current) return;
    soundEngineRef.current = buildAmbientSound();
  }, []);

  const stopSound = useCallback(() => {
    soundEngineRef.current?.stop();
    soundEngineRef.current = null;
  }, []);

  useEffect(() => {
    if (soundEnabled) { startSound(); } else { stopSound(); }
  }, [soundEnabled, startSound, stopSound]);

  useEffect(() => { return () => { soundEngineRef.current?.stop(); }; }, []);

  const overlayGlass: React.CSSProperties = {
    background: 'rgba(10,18,32,0.92)',
    backdropFilter: 'blur(20px) saturate(1.4)',
    WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
    border: '1px solid rgba(19,30,48,0.95)',
  };
  const nestedControl: React.CSSProperties = {
    background: 'rgba(3,7,17,0.55)',
    border: '1px solid rgba(19,30,48,0.9)',
  };

  return (
    <div ref={panelRef} id="settings-panel" style={{ position: 'fixed', bottom: 88, right: 16, zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: rm ? 0 : 10, scale: rm ? 1 : 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: rm ? 0 : 6, scale: rm ? 1 : 0.97 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            style={{ ...overlayGlass, borderRadius: 12, padding: '16px 18px', width: 220, display: 'flex', flexDirection: 'column', gap: 16 }}
            data-cursor="interactive"
          >
            {/* Sound */}
            <div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--foam-400)', marginBottom: 8 }}>Ambient sound</div>
              <button
                id="settings-sound-toggle"
                type="button"
                onClick={() => onSoundChange(!soundEnabled)}
                aria-pressed={soundEnabled}
                aria-label={soundEnabled ? 'Disable ambient sound' : 'Enable ambient sound'}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', ...nestedControl, background: soundEnabled ? 'rgba(45,212,191,0.10)' : 'rgba(3,7,17,0.5)', border: soundEnabled ? '1px solid rgba(45,212,191,0.4)' : '1px solid rgba(19,30,48,0.9)', borderRadius: 8, padding: '8px 12px', color: soundEnabled ? 'var(--bio-400)' : 'var(--foam-400)', cursor: 'pointer', transition: 'all 160ms ease', fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500 }}
              >
                <span style={{ flexShrink: 0 }}>{soundEnabled ? <SoundOnIcon /> : <SoundOffIcon />}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{soundEnabled ? 'On \u00b7 water drone' : 'Off'}</span>
                <span style={{ position: 'relative', width: 32, height: 18, borderRadius: 999, background: soundEnabled ? 'var(--bio-400)' : 'rgba(19,30,48,0.9)', flexShrink: 0, transition: 'background 180ms ease', display: 'inline-block' }}>
                  <span style={{ position: 'absolute', top: 3, left: soundEnabled ? 15 : 3, width: 12, height: 12, borderRadius: '50%', background: soundEnabled ? 'var(--abyss-950)' : 'var(--foam-400)', transition: 'left 180ms ease' }} />
                </span>
              </button>
              {!soundEnabled && <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(125,148,163,0.55)' }}>Opt-in \u00b7 never autoplays</p>}
            </div>

            <div style={{ height: 1, background: 'rgba(19,30,48,0.9)' }} />

            {/* Quality */}
            <div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--foam-400)', marginBottom: 8 }}>Render quality</div>
              <div style={{ display: 'flex', gap: 4, background: 'rgba(3,7,17,0.6)', border: '1px solid rgba(19,30,48,0.9)', borderRadius: 8, padding: 3 }} role="radiogroup" aria-label="Render quality">
                {QUALITY_LEVELS.map((q) => {
                  const active = quality === q;
                  return (
                    <button id={`settings-quality-${q}`} key={q} type="button" role="radio" aria-checked={active} onClick={() => onQualityChange(q)}
                      style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: active ? '1px solid rgba(45,212,191,0.35)' : '1px solid transparent', background: active ? 'rgba(45,212,191,0.12)' : 'transparent', color: active ? 'var(--bio-300)' : 'var(--foam-400)', fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: active ? 600 : 400, cursor: 'pointer', transition: 'all 140ms ease' }}>
                      {QUALITY_LABELS[q]}
                    </button>
                  );
                })}
              </div>
              <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(125,148,163,0.55)' }}>
                {quality === 'high' && '2k particles \u00b7 bloom \u00b7 caustics'}
                {quality === 'medium' && '700 particles \u00b7 reduced bloom'}
                {quality === 'low' && 'No particles \u00b7 no bloom \u00b7 1\u00d7 DPR'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trigger */}
      <motion.button
        id="settings-trigger-btn"
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close settings' : 'Open settings'}
        aria-expanded={open}
        whileHover={{ scale: rm ? 1 : 1.05 }}
        whileTap={{ scale: rm ? 1 : 0.94 }}
        transition={{ type: 'spring', stiffness: 400, damping: 26 }}
        data-cursor="interactive"
        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', ...overlayGlass, borderRadius: 8, color: open ? 'var(--bio-400)' : 'var(--foam-400)', fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'background 150ms ease, border-color 150ms ease, color 150ms ease', background: open ? 'rgba(45,212,191,0.10)' : 'rgba(10,18,32,0.85)', border: open ? '1px solid rgba(45,212,191,0.4)' : '1px solid rgba(19,30,48,0.9)' }}
      >
        <SettingsGearIcon />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {soundEnabled ? '\u25c8' : '\u25c7'} {quality}
        </span>
      </motion.button>
    </div>
  );
}