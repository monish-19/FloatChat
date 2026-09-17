/* ─────────────────────────────────────────────────────────────
   FloatChat — Settings store
   Quality + audio preferences. localStorage-persisted.
───────────────────────────────────────────────────────────── */

export type QualityLevel = 'high' | 'medium' | 'low';

export type AppSettings = {
  quality: QualityLevel;
  soundEnabled: boolean;
};

export const QUALITY_PARTICLE_COUNT: Record<QualityLevel, number> = {
  high:   2000,
  medium:  700,
  low:       0,
};

/** DPR ceiling per quality level. Canvas uses [1, ceiling]. */
export const QUALITY_DPR: Record<QualityLevel, [number, number]> = {
  high:   [1, 1.8],
  medium: [1, 1.2],
  low:    [1, 1.0],
};

/** Bloom intensity per quality level. 0 = no bloom rendered. */
export const QUALITY_BLOOM: Record<QualityLevel, number> = {
  high:   1.4,
  medium: 0.8,
  low:    0,
};

const STORAGE_KEY = 'floatchat-settings-v1';

const DEFAULTS: AppSettings = {
  quality: 'high',
  soundEnabled: false,  // MUST be false — never autoplay with sound
};

export function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      quality: (['high', 'medium', 'low'] as QualityLevel[]).includes(parsed.quality as QualityLevel)
        ? (parsed.quality as QualityLevel)
        : DEFAULTS.quality,
      // Sound is ALWAYS loaded as false — user must re-enable each session
      soundEnabled: false,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: AppSettings): void {
  if (typeof window === 'undefined') return;
  try {
    // Never persist soundEnabled=true to storage — opt-in per session only
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...s, soundEnabled: false }));
  } catch { /* quota exceeded — ignore */ }
}
