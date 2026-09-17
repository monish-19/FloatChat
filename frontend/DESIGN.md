# FloatChat — Deep-Ocean Immersive Design System

## Intent

FloatChat is a deep-ocean instrument panel. The 3D scene is the primary surface, always full-bleed and visible. Glass HUD panels float over it — they do not cover it. The visual register is a submarine sonar control room: precise, calm, cinematic. Every design decision should feel like it belongs *inside* the water, not pasted on top of it.

Reference aesthetic: NASA JPL "Eyes on the Solar System" × submarine sonar HUD × Stripe dark-mode docs restraint.

**Do not introduce purple, indigo, or blue-to-purple gradients. That is the single most reliable AI-slop tell and must not appear anywhere.**

---

## Color Tokens

All UI colors come from these tokens only. Define them as CSS custom properties and reference them everywhere. Do not use Tailwind color utilities for brand/state colors — use `var(--token-name)`.

```css
/* ── Page + panel surfaces ────────────────────────────────── */
--abyss-950: #030711;   /* Page background. The deep water. */
--abyss-900: #0a1220;   /* Panel background (~85% opacity) with backdrop-blur */
--abyss-800: #131e30;   /* Panel borders, hover surfaces */

/* ── Primary accent — bioluminescent teal ─────────────────── */
--bio-400: #2dd4bf;     /* Active states, links, float marker glow */
--bio-300: #5eead4;     /* Hover / brighter bio variant */

/* ── Alert accents ────────────────────────────────────────── */
--coral-400: #fb7185;   /* Anomaly / severe alert accent — heatwave markers */
--amber-400: #fbbf24;   /* Warning-tier data, secondary alerts */

/* ── Text ─────────────────────────────────────────────────── */
--foam-100: #e8f1f5;    /* Primary text */
--foam-400: #7d94a3;    /* Secondary / muted text */

/* ── Measurement scales (data vis only, not UI chrome) ─────── */
--temp-1: #2d6cdf;
--temp-2: #36b7d4;
--temp-3: #f0d264;
--temp-4: #f28a4b;
--temp-5: #d94a55;

--sal-1: #3b4cc0;
--sal-2: #5e79d6;
--sal-3: #65c7b0;
--sal-4: #b6d95d;
--sal-5: #e6e86a;
```

### Usage rules

- `--abyss-950` is the only allowed fully-opaque background color (used on `<html>` and `<body>`).
- Every glass panel uses `--abyss-900` at ≥85% opacity **with** `backdrop-blur`. A fully-opaque panel is a design violation.
- `--bio-400` is the single accent. It appears on: active states, links, interactive borders on focus/hover, float marker glow, timeline scrubber needle.
- `--coral-400` is for anomaly severity ≥ 3 and error states only. Not decorative.
- `--amber-400` is for warning-tier data and secondary alerts only.
- Measurement-scale tokens (`--temp-*`, `--sal-*`) are exclusively for data visualization cells, legends, and trajectory line colors. Never for UI chrome.

---

## Typography

Two typefaces. No others.

```css
--font-ui: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif;
--font-mono: 'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace;
```

**Every number in the app uses `--font-mono`, tabular-nums.** This includes: lat/lon coordinates, depth values, temperature, salinity, timestamps, latency readouts, profile counts, anomaly counts. No exceptions.

`--font-ui` is used for all non-numeric text: headings, labels, body copy, button text, chat messages.

### Type scale

| Style | Font | Size | Line-height | Weight | Letter-spacing | Use |
|---|---|---|---|---|---|---|
| `display` | ui | 32px | 1.1 | 600 | -0.02em | Product title, one per screen |
| `title` | ui | 20px | 1.25 | 600 | -0.01em | Panel section headings |
| `body` | ui | 14px | 1.5 | 400 | 0 | Explanatory copy, chat messages |
| `label` | ui | 12px | 1.3 | 500 | -0.01em | Controls, compact values |
| `eyebrow` | ui | 10px | 1.2 | 600 | 0.10em | Uppercase section labels |
| `data` | mono | 13px | 1.35 | 500 | 0.02em | Coordinate readouts, measurements |
| `data-lg` | mono | 24px | 1.1 | 600 | -0.02em | HUD glowing metric numbers |
| `data-sm` | mono | 11px | 1.3 | 400 | 0.02em | Timestamps, axis labels, metadata |

---

## Spacing

4px base rhythm. Use multiples only.

```
4px · 8px · 12px · 16px · 20px · 24px · 32px · 40px · 48px · 64px
```

Panel internal padding: `20px`. Glass panel gap to viewport edge: `16px`.

---

## Shape

```css
--radius-sm: 4px;    /* Inputs, chips, inline tags */
--radius-md: 8px;    /* Buttons, compact controls */
--radius-lg: 12px;   /* Glass panels */
--radius-xl: 16px;   /* Bottom sheet, large callouts */
```

---

## Glass Panel Component

The foundational UI surface. Used for chat panel, HUD cluster, timeline scrubber, anomaly callout, transect sheet.

```css
.glass-panel {
  background: rgba(10, 18, 32, 0.85);  /* --abyss-900 at 85% */
  backdrop-filter: blur(16px) saturate(1.4);
  -webkit-backdrop-filter: blur(16px) saturate(1.4);
  border: 1px solid rgba(19, 30, 48, 0.9);  /* --abyss-800 */
  border-radius: var(--radius-lg);
}

.glass-panel:hover {
  border-color: rgba(45, 212, 191, 0.25);  /* --bio-400 at 25% */
}
```

**Anti-pattern:** A card inside a card. Never nest a bordered surface inside another bordered glass panel. If grouping is needed, use spacing or a hairline rule, not a nested card.

---

## Interaction States

All interactive elements define these states:

| State | Border | Background | Text |
|---|---|---|---|
| Default | `--abyss-800` | transparent or `--abyss-900` | `--foam-100` |
| Hover | `--bio-400` at 40% + glow | `rgba(45,212,191,0.06)` | `--foam-100` |
| Focus-visible | 2px `--bio-400` outer ring | unchanged | unchanged |
| Active/selected | `--bio-400` solid | `rgba(45,212,191,0.12)` | `--bio-300` |
| Error | `--coral-400` at 40% | `rgba(251,113,133,0.08)` | `--coral-400` |
| Disabled | opacity 0.4 | unchanged | `--foam-400` |

Hover transition: `150ms ease` on `border-color` and `box-shadow`.

Hover glow: `box-shadow: 0 0 0 1px rgba(45,212,191,0.2), 0 0 16px rgba(45,212,191,0.08)`.

---

## Motion

- **Panel mount:** `opacity 0 → 1`, `scale 0.96 → 1`, `200ms ease-out`. No bounce, no spring overshoot.
- **Hover state:** `150ms ease` on border + glow.
- **Anomaly pulse:** `opacity + scale`, `2s ease-in-out infinite`. Not color-cycling.
- **Panel transitions (slide/collapse):** `240ms ease-out`.
- **3D idle orbit:** ~90s period. Pauses immediately on user camera interaction. Resumes after 3s idle.
- **Timeline playback:** linear.
- `prefers-reduced-motion`: disable all animations except functional state changes.

---

## Layout Zones

```
┌─────────────────────────────────────────────────────────┐
│  TOP-RIGHT HUD CLUSTER (fixed, z-20)                    │
│  3 glowing numbers: profiles · anomalies · latency       │
├────────┬────────────────────────────────────────────────┤
│ LEFT   │                                                 │
│ CHAT   │         R3F CANVAS (z-0, full-bleed)            │
│ PANEL  │       [anomaly callouts anchor here, z-30]      │
│ (z-10) │                                                 │
│ 360px  │                                                 │
│ or 48px│                                                 │
│ rail   ├────────────────────────────────────────────────┤
│        │  TIMELINE SCRUBBER (z-10, full-width bottom)   │
└────────┴────────────────────────────────────────────────┘
                  ↑ TRANSECT SHEET slides up over this (z-40)
                    with scrim (z-35) behind it
```

---

## Component Patterns

### HUD Cluster
- Three numbers only, rendered side by side as a minimal translucent strip (not separate bordered cards)
- Each number: `data-lg` style in `--bio-400`, soft text-shadow glow
- Label beneath each number: `eyebrow` style in `--foam-400`
- Strip: `--abyss-900` at 70% opacity, no heavy border, subtle top/bottom hairline

### Chat Panel
- Full viewport height, 360px wide, left-docked
- Collapses to 48px icon rail (icon + tooltip on hover)
- Header: product wordmark + collapse toggle
- Message thread: scrollable, glass bubble styling per role
- Input: glass aesthetic, `--bio-400` border on focus, mono placeholder

### Timeline Scrubber
- Full-width, ~72px tall, bottom-docked
- Depth-gauge track with fine tick marks (no filled bar, just marks)
- Scrub handle: thin vertical sonar needle, chevron cap
- Date readout at cursor position: IBM Plex Mono
- Play/pause icon button, draw-transect toggle

### Anomaly Callout
- Positioned via screen-projected 3D coords
- SVG leader line from callout corner to point
- Glass panel, ~240px wide
- Shows: variable name, coordinates (mono), depth (mono), severity σ (mono), time (mono)
- "Ask about this" button pre-fills chat and closes callout

### Transect Sheet
- Slides up from bottom, ~60vh height
- Full-width glass panel
- Semi-transparent scrim (`rgba(3,7,17,0.55)`) behind it at z-35
- 3D scene remains visible and slightly dimmed, not replaced
- Dismiss: drag handle or X at top-right

---

## Anti-Pattern Checklist (run before shipping)

- [ ] No `purple`, `indigo`, or blue-to-purple gradient anywhere
- [ ] No `font-family: 'Inter'` or `font-family: Inter` anywhere
- [ ] No bordered card nested inside another bordered card
- [ ] No rounded-square icon tile sitting above a heading as a decorative element
- [ ] No panel that is fully opaque (all panels have transparency + backdrop-blur)
- [ ] No data number (lat, lon, depth, temp, count, ms) rendered in the UI sans font
