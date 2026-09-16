# FloatChat Design Language

## Intent

FloatChat is an ocean-observation instrument panel, not a marketing surface. The
interface should help an operator answer three questions quickly:

1. What is the current state of the observing system?
2. Where is the evidence in the water column?
3. What did FloatChat use to reach its answer?

The visual language adapts Linear's dense product-console approach: near-black
surfaces, hairline separation, restrained accent use, compact typography, and
clear state changes. Depth, trajectory, and measurement colors carry meaning;
they are never used as decoration.

## Color tokens

All UI colors must come from these tokens. Data visualization colors are
reserved for the named variables and must not be reused for unrelated chrome.

### Base and chrome

| Token | Value | Use |
| --- | --- | --- |
| `--fc-canvas` | `#070A0D` | Application canvas |
| `--fc-surface-1` | `#0D1217` | Primary panel |
| `--fc-surface-2` | `#121A21` | Raised panel, selected cell |
| `--fc-surface-3` | `#18232B` | Hover, active control |
| `--fc-surface-inset` | `#090D11` | Inputs, scene inset |
| `--fc-line` | `#24313A` | Hairline borders and grid |
| `--fc-line-strong` | `#344650` | Focused or emphasized borders |
| `--fc-ink` | `#E8F0F2` | Primary text |
| `--fc-ink-muted` | `#A5B6BC` | Secondary text |
| `--fc-ink-subtle` | `#71838B` | Captions, axis labels |
| `--fc-ink-faint` | `#4A5B63` | Disabled or low-priority text |
| `--fc-focus` | `#79D9E8` | Keyboard focus ring |
| `--fc-accent` | `#5EC5D8` | Primary action and live state |
| `--fc-accent-strong` | `#8AE8F2` | Accent hover and critical readout |
| `--fc-success` | `#67D59A` | Healthy/connected |
| `--fc-warning` | `#F0B86A` | Attention, degraded |
| `--fc-danger` | `#F27672` | Error, severe anomaly |

### Measurement scales

These scales are intentionally distinct so an operator can identify a variable
without reading a legend. Each scale runs from low/cool to high/warm and should
be used consistently in trajectories, anomaly marks, transects, legends, and
tooltips.

#### Temperature — blue to red

`--fc-temp-1 #2D6CDF` · `--fc-temp-2 #36B7D4` · `--fc-temp-3 #F0D264` ·
`--fc-temp-4 #F28A4B` · `--fc-temp-5 #D94A55`

#### Salinity — indigo to lime

`--fc-sal-1 #3B4CC0` · `--fc-sal-2 #5E79D6` · `--fc-sal-3 #65C7B0` ·
`--fc-sal-4 #B6D95D` · `--fc-sal-5 #E6E86A`

#### Oxygen — violet to mint

`--fc-o2-1 #6E4BC3` · `--fc-o2-2 #5378D8` · `--fc-o2-3 #4AB6C2` ·
`--fc-o2-4 #65D6B1` · `--fc-o2-5 #B9F2C3`

#### Chlorophyll — navy to fluorescent green

`--fc-chl-1 #172B58` · `--fc-chl-2 #1C6290` · `--fc-chl-3 #1D9B72` ·
`--fc-chl-4 #75C84A` · `--fc-chl-5 #D8EF63`

#### Uncertainty and anomaly overlays

`--fc-uncertainty` is `#A5B6BC` at 35% opacity. Anomaly severity uses
`--fc-warning` for attention and `--fc-danger` for severe events. A marker must
also use shape, stroke, or label; color alone never communicates severity.

## Typography

Use IBM Plex for a technical instrument-panel voice and predictable rendering:

```css
--fc-font-sans: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
--fc-font-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace;
```

| Style | Size / line height | Weight | Use |
| --- | --- | --- | --- |
| `display` | 32px / 1.1 | 600 | Page identity, one per screen |
| `title` | 20px / 1.25 | 600 | Panel titles |
| `body` | 14px / 1.45 | 400 | Explanatory copy and chat |
| `label` | 12px / 1.3 | 500 | Controls and compact values |
| `caption` | 11px / 1.35 | 500 | Metadata and helper text |
| `eyebrow` | 10px / 1.2 | 600 | Uppercase section labels, 0.12em tracking |
| `data` | 13px / 1.35 | 500 | Measurements and status values |
| `data-large` | 24px / 1.1 | 600 | Metric readouts |

Numeric measurements, timestamps, API layer names, and axis labels use
`--fc-font-mono`. Text remains sentence case except for short eyebrows.

## Spacing and shape

Use a 4px base rhythm:

`--fc-space-1: 4px` · `--fc-space-2: 8px` · `--fc-space-3: 12px` ·
`--fc-space-4: 16px` · `--fc-space-5: 20px` · `--fc-space-6: 24px` ·
`--fc-space-7: 32px` · `--fc-space-8: 40px` · `--fc-space-9: 48px`

| Token | Value | Use |
| --- | --- | --- |
| `--fc-radius-sm` | `4px` | Inputs, chips, table cells |
| `--fc-radius-md` | `8px` | Controls and compact cards |
| `--fc-radius-lg` | `12px` | Panels and message groups |
| `--fc-radius-pill` | `999px` | Status and attribution tags |
| `--fc-panel-padding` | `20px` | Standard panel inset |
| `--fc-grid-gap` | `16px` | Dashboard layout gap |

Panels use a solid or near-solid surface, a 1px hairline border, and no large
drop shadow. Use a 2px accent rule or inset highlight only to identify a
selected/active state.

## Component states

Every interactive component defines these states:

- **Default:** `surface-1`, `line`, `ink-muted`.
- **Hover:** `surface-3`, `line-strong`, `ink`.
- **Focus-visible:** 2px `--fc-focus` outer ring with a 2px offset.
- **Pressed/selected:** `surface-2`, accent text, and a 2px accent edge.
- **Loading:** preserve layout; use a restrained shimmer or pulsing data
  cursor, never a full-screen spinner.
- **Empty:** explain what data is missing and name the API/source that would
  populate it.
- **Error:** use `--fc-danger`, a concise cause, and a retry action when
  retrying is meaningful.
- **Disabled:** reduce contrast and opacity, but retain readable labels.

Motion is functional: 160ms ease-out for control feedback, 240ms ease-out for
panel transitions, and 600ms linear for timeline/data playback. Respect
`prefers-reduced-motion`.

## Product-specific patterns

### Instrument header

The header is a compact status rail: product mark, current data window,
connection state, and the most important live count. It is not a hero.

### Metric rail

Metrics are four-up readouts with a label, `data-large` value, and one-line
status delta. The value gets priority; deltas never compete with it.

### Chat attribution

Every assistant answer may expose compact pill tags for `semantic`, `SQL`,
`LLM`, and `graph`. Tags use `surface-2` plus a 1px variable accent and are
evidence metadata, not decoration.

### 3D scene

The scene is a spatial view of trajectory data. Argo housings, buoys, and flow
ribbons must be anchored to real coordinates and timestamps. Empty-state scenes
show the coordinate frame and a clear "No trajectory data" message rather than
invented particles.

### Transect

Heatmap cells use the active measurement scale. The legend, axis labels,
selected cell, and tooltip must share the same scale. Missing values use the
uncertainty token with a hatch or explicit `No reading` label.
