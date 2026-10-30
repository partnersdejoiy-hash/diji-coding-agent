---
name: data-viz
description: Honest, readable charts and dashboards.
---
# Charts & Dashboards

- Pick the form from the question: change over time → line; compare categories → sorted bar; part of whole (≤5 parts) → stacked bar or donut; distribution → histogram/box; relationship → scatter.
- Start bar axes at zero. Label axes with units. Direct-label lines instead of a distant legend when possible.
- Colour has a job: one highlight colour against muted greys; sequential palettes for magnitude, diverging for above/below a midpoint; check colour-blind safety and both light and dark themes.
- Dashboards: the 3–5 numbers that drive decisions at the top, each with comparison context (vs last period, vs target), details below. Tabular numerals for figures.
- Interaction: tooltips with exact values, keyboard-accessible, and a data table alternative.
- Plain web: Chart.js or Observable Plot from a CDN; React: Recharts. Keep the data in a separate array so it is easy to update.
