---
name: frontend-design
description: Distinctive, production-grade UI with a clear point of view instead of template defaults.
---
# Frontend Design

Decide before you draw:
1. Who uses this, where, and what success looks like (decide, buy, finish a task, read).
2. Pick ONE committed direction: a type pairing, a palette of 1 ink + 1 surface + 1–2 accents, a corner radius and a spacing scale. Write them as CSS custom properties on `:root`.
3. Choose light or dark from the use scene, and support the other with `prefers-color-scheme`.

Build rules:
- Typography carries hierarchy: 3–4 sizes with clear steps, body 16px+ at 65–75ch, headings balanced with `text-wrap: balance`.
- Spacing: tight inside groups, generous between them. More space above a heading than below.
- Real content, not lorem ipsum. Buttons name their action ("Start free trial", not "Submit").
- Every interactive element has hover, focus-visible, active, disabled and loading states.
- Theme the browser surfaces: `::selection`, `caret-color`, scrollbars, focus rings.
- Shadows have offset and blur; avoid zero-offset glow halos as decoration.
- Icons from one drawn set (inline SVG or a library), never emoji as icons.

Avoid the template look: identical icon-heading-text card grids, gradient text, eyebrow labels above every heading, glassmorphism as decoration, "01/02/03" section numbers, purple-blue gradients on everything.

Ship: semantic HTML, responsive from 320px, `prefers-reduced-motion` respected, contrast ≥ 4.5:1 for body text.
