# CourseMind web app — design canvas (v1)

Static design comps for the student chat, the lecturer dashboard, and every chat
state. Built on the [brand tokens](../../../brand/BRAND.md); source of truth for
behaviour stays the [PRD](../../PRD.md) and [SRS](../../SRS.md).

**Live canvas:** <https://claude.ai/artifact/3VQUQwBxsCvQJrthjWxQcE> (private until
shared from its Share menu). The files here are a snapshot of that canvas.

## Artboards

| File                         | Screen                                                                                             | Size      | Requirements               |
| ---------------------------- | -------------------------------------------------------------------------------------------------- | --------- | -------------------------- |
| `Main.dc.html`               | Onboarding: course pick, "how this tutor is different", consent                                    | 390×844   | PR-1, PR-2, PR-9           |
| `Chat-Empty.dc.html`         | Empty chat: suggested questions, topics covered, data meter                                        | 390×844   | FR-14                      |
| `Chat-Answer.dc.html`        | Cited answer + sources footer + feedback; follow-up streaming with stop                            | 390×844   | FR-11, FR-15, FR-16        |
| `Chat-Refusal.dc.html`       | Refusal card: nearest covered topics, flag to lecturer                                             | 390×844   | FR-10, FR-12               |
| `Source-Viewer.dc.html`      | Source drawer: cited passage in context, text-only by default                                      | 390×844   | FR-15, FR-14               |
| `Settings-Privacy.dc.html`   | Low-data toggle, data usage, install, consent record, delete my data                               | 390×844   | FR-14, NFR-2, PR-4, PR-5   |
| `Chat-Desktop.dc.html`       | Three-pane desktop chat with source panel open                                                     | 1440×900  | FR-11, FR-15               |
| `Lecturer-Dashboard.dc.html` | Accuracy vs gate, usage, cost per 1,000, refusal gaps, document status                             | 1440×960  | FR-22, NFR-7               |
| `States.dc.html`             | Searching, streaming, down-vote note, refused, error, connection lost, rate limit, source updating | 1440×1040 | FR-16, FR-30, NFR-1, NFR-9 |

`canvas.json` is the canvas index (artboard positions and titles).

## Notes for implementation

- **Tokens:** colours are the `BRAND.md` values; small violet text uses
  `--accent-300`; refusal is amber with a book icon, errors are red with a warning
  icon, so state never relies on colour alone.
- **Type:** Space Grotesk for headings; system UI for body (no body-font download in
  low-data mode).
- **Logo:** the mark in these files is a hand-drawn approximation. The official SVG
  master is still a TODO in `BRAND.md`.
- **Sample data:** course (CSC 201), documents and all dashboard figures are
  illustrative, not real metrics.
- **Format:** `.dc.html` files are Design Component sources for the canvas editor.
  They reference a `support.js` the canvas provides, so they don't render as plain
  pages outside it. Treat them as visual spec, not production code for `apps/web`.
