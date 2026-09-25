# CourseMind — Brand & Theme

**Status:** Concept v1 (palette measured from source)
**Last updated:** 2026-09-25
**Source sheet:** [`coursemind-brand-concept.png`](./coursemind-brand-concept.png)

---

## Concept — "The Learning Page"

The mark combines a **"C"** (for *Course*) with an **open page/book**, formed inside
a hexagon/cube. Three horizontal violet bars sit inside the mark: they represent
**content lines from the lecturer's own materials** — the foundation of every
answer. The product thesis rendered as a logo: *grounded in your materials.*

The wordmark pairs **"Course"** (light) with **"Mind"** (violet accent).

## Assets

Exported from the concept sheet (see resolution note below):

| File | What | Bg | Use |
| --- | --- | --- | --- |
| [`app-icon-dark.png`](./app-icon-dark.png) | violet square, white mark | violet | **dark-mode / primary app icon** |
| [`logo-light.png`](./logo-light.png) | white square, dark mark | white | **light-mode logo** |
| [`favicon.png`](./favicon.png) | mark only, **transparent bg** | — | **favicon**, browser tab |
| [`favicon-on-dark.png`](./favicon-on-dark.png) | mark only, on dark | dark | favicon fallback where transparency isn't wanted |
| [`coursemind-brand-concept.png`](./coursemind-brand-concept.png) | full concept sheet | dark | reference only |

> **Resolution note:** these were extracted from the 512-px-wide source sheet, so
> `app-icon-dark`/`logo-light` are ~114 px and `favicon` is ~43 px. Fine for web/tab
> use. For app-store icons (≥512 px) and crisp scaling, **recreate the mark as an
> SVG** (or regenerate at high resolution) — tracked in TODO.

## Logo usage

| Variant | Use on | Notes |
| --- | --- | --- |
| App icon (dark) | dark backgrounds, PWA icon | primary |
| Light logo | light backgrounds, docs, invoices | keep the violet bars |
| Favicon | browser tab, small sizes | mark only, no wordmark |

**Do:** keep clear space around the mark equal to one inner bar's height; use the
mark alone when space is tight.
**Don't:** recolour the mark outside the palette, stretch it, add drop shadows, or
place the dark icon on a busy photo.

## Colour palette (measured from source)

Values below were sampled from the concept sheet (mean/dominant-colour analysis),
not guessed.

### Core

| Token | Hex | Source | Role |
| --- | --- | --- | --- |
| `--bg` | `#090E19` | measured (89% of sheet) | Near-black app background |
| `--ink` | `#090E19` | measured (dark mark ≈ bg) | Mark colour on light surfaces |
| `--surface` | `#12172A` | derived from `--bg` | Cards, panels, raised surfaces |
| `--border` | `#2D304F` | measured | Subtle dividers / hairlines |
| `--text` | `#F4F5F6` | measured | Primary text ("Course" white) |
| `--text-muted` | `#979EA9` | measured | Secondary text |

### Violet accent ramp

| Token | Hex | Source | Role |
| --- | --- | --- | --- |
| `--accent-300` | `#CEC7FB` | measured (light tint) | Bars highlight, small text on dark |
| `--accent-400` | `#9B85F9` | derived | Hover on dark, subtle fills |
| `--accent-500` | `#6C51F7` | measured (primary) | Primary accent ("Mind"), buttons, links |
| `--accent-600` | `#5A3FE0` | derived | Hover / pressed |
| `--accent-700` | `#4A30C6` | derived | Deep accent, gradients |

### Semantic (retrieval-aware — fits the product)

| Token | Hex | Role |
| --- | --- | --- |
| `--cited` | `#6C51F7` | Citation chips / "answer grounded in materials" |
| `--refused` | `#F59E0B` | "Not in your course materials" refusal state |
| `--error` | `#EF4444` | Errors |

## Design tokens (for `apps/web`)

```ts
// tailwind.config → theme.extend.colors
colors: {
  bg:       '#090E19',
  ink:      '#090E19',
  surface:  '#12172A',
  border:   '#2D304F',
  text:     { DEFAULT: '#F4F5F6', muted: '#979EA9' },
  accent:   { 300: '#CEC7FB', 400: '#9B85F9', 500: '#6C51F7', 600: '#5A3FE0', 700: '#4A30C6' },
  cited:    '#6C51F7',
  refused:  '#F59E0B',
  error:    '#EF4444',
}
```

```css
:root {
  --bg: #090E19;
  --ink: #090E19;
  --surface: #12172A;
  --border: #2D304F;
  --text: #F4F5F6;
  --text-muted: #979EA9;
  --accent-300: #CEC7FB;
  --accent-400: #9B85F9;
  --accent-500: #6C51F7;
  --accent-600: #5A3FE0;
  --accent-700: #4A30C6;
  --cited: #6C51F7;
  --refused: #F59E0B;
  --error: #EF4444;
}
```

## Typography (direction)

- **Wordmark / headings:** a geometric sans (e.g. Space Grotesk, Sora, or Inter Tight)
  to match the constructed, hexagonal mark.
- **Body / UI:** Inter or system UI for readability on low-end Android.
- Keep weights lean; the brand reads modern, not heavy.

## Accessibility notes

- `--accent-500 (#6C51F7)` on `--bg (#090E19)` is fine for **large text, buttons, and
  non-text UI**, but is borderline for small body text — use `--accent-300 (#CEC7FB)`
  for small accent text on dark. Verify each pairing against WCAG AA (4.5:1) *(NFR-9)*.
- Never signal refusal by colour alone — pair `--refused` with an icon + label
  ("Not in your course materials").

## Low-data note

The dark theme and flat mark keep the UI light in bytes, fitting the low-data goal
*(FR-14, NFR-2)*. Ship the logo as an optimised **SVG**; avoid large raster assets in
the critical path.

## TODO
- [x] Lock exact hex values from the source (measured above).
- [x] Split favicon + light/dark logo variants into separate files.
- [ ] Recreate the mark as **SVG** and export hi-res app icons (≥512 px) + full icon set.
- [ ] Run WCAG contrast checks on the final tokens once used in `apps/web`.
