# CourseMind — Brand & Theme

**Status:** Concept v1
**Last updated:** 2026-09-25
**Source:** [`coursemind-brand-concept.png`](./coursemind-brand-concept.png)

---

## Concept — "The Learning Page"

The mark combines a **"C"** (for *Course*) with an **open page/book**, formed inside
a hexagon/cube. Three horizontal violet bars sit inside the mark: they represent
**content lines from the lecturer's own materials** — the foundation of every
answer. This is the product thesis rendered as a logo: *grounded in your materials.*

The wordmark pairs **"Course"** (light) with **"Mind"** (violet accent).

## Logo usage

| Variant | Use on | Notes |
| --- | --- | --- |
| App icon (dark) | dark backgrounds, PWA icon | primary |
| Light variant | light backgrounds, docs, invoices | keep the violet accent |
| Favicon | browser tab, small sizes | mark only, no wordmark |

**Do:** keep clear space around the mark equal to the height of one inner bar;
use the mark alone when space is tight.
**Don't:** recolour the mark outside the palette, stretch it, add drop shadows, or
put the dark icon on a busy photo.

## Colour palette

> Values below are eyedropped approximations from the concept sheet — **confirm exact
> hex against the source file before locking design tokens.** Structure matters more
> than the last digit: one dark base, a violet accent ramp, and neutral text.

### Core

| Token | Hex (approx) | Role |
| --- | --- | --- |
| `--bg` | `#0B0B10` | Near-black app background |
| `--surface` | `#15151C` | Cards, panels, raised surfaces |
| `--border` | `#26263140` | Subtle dividers |
| `--text` | `#F5F5F7` | Primary text ("Course" white) |
| `--text-muted` | `#A1A1AA` | Secondary text |

### Violet accent ramp

| Token | Hex (approx) | Role |
| --- | --- | --- |
| `--accent-300` | `#C4B5FD` | The three bars / highlights |
| `--accent-500` | `#8B5CF6` | Primary accent ("Mind"), buttons, links |
| `--accent-600` | `#7C3AED` | Hover / pressed |
| `--accent-700` | `#6D28D9` | Deep accent, gradients |

### Semantic (retrieval-aware — fits the product)

| Token | Hex (approx) | Role |
| --- | --- | --- |
| `--cited` | `#8B5CF6` | Citation chips / "answer grounded in materials" |
| `--refused` | `#F59E0B` | "Not in your course materials" refusal state |
| `--error` | `#EF4444` | Errors |

## Design tokens (draft — for `apps/web`)

Tailwind theme extension, to drop into the web app once scaffolded:

```ts
// tailwind.config theme.extend.colors (draft — confirm hex from source)
colors: {
  bg:       '#0B0B10',
  surface:  '#15151C',
  border:   'rgba(38,38,49,0.25)',
  text:     { DEFAULT: '#F5F5F7', muted: '#A1A1AA' },
  accent:   { 300: '#C4B5FD', 500: '#8B5CF6', 600: '#7C3AED', 700: '#6D28D9' },
  cited:    '#8B5CF6',
  refused:  '#F59E0B',
}
```

```css
/* CSS custom properties equivalent */
:root {
  --bg: #0B0B10;
  --surface: #15151C;
  --border: rgba(38,38,49,0.25);
  --text: #F5F5F7;
  --text-muted: #A1A1AA;
  --accent-300: #C4B5FD;
  --accent-500: #8B5CF6;
  --accent-600: #7C3AED;
  --accent-700: #6D28D9;
  --cited: #8B5CF6;
  --refused: #F59E0B;
}
```

## Typography (direction)

- **Wordmark / headings:** a geometric sans (e.g. Space Grotesk, Sora, or Inter Tight)
  to match the constructed, hexagonal mark.
- **Body / UI:** Inter or system UI for readability on low-end Android.
- Keep weights lean; the brand reads modern, not heavy.

## Accessibility notes

- Violet accent on the near-black `--bg` must meet WCAG AA (4.5:1) for text; use
  `--accent-300` for small text on dark, reserve `--accent-500/600` for large text,
  buttons, and non-text UI. **Verify contrast once exact hex is confirmed** *(NFR-9)*.
- Don't signal refusal by colour alone — pair `--refused` with an icon + label
  ("Not in your course materials").

## Low-data note

The dark theme and flat mark keep the icon and UI light in bytes, which fits the
low-data mode goal *(FR-14, NFR-2)*. Ship the logo as an optimised SVG; avoid large
raster assets in the critical path.

## TODO
- [ ] Eyedrop and lock exact hex values from the source file.
- [ ] Export SVG logo variants (dark icon, light, favicon) into `brand/`.
- [ ] Run WCAG contrast checks on final tokens.
