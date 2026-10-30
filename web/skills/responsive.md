---
name: responsive
description: Layouts that work from 320px phones to ultrawide monitors.
---
# Every Screen Size

- Mobile first. Base styles for ~360px, then `min-width` breakpoints where the layout actually breaks (often ~640, 768, 1024, 1280).
- Use `100dvh` not `100vh`, `env(safe-area-inset-*)` for notches, and `viewport-fit=cover` in the meta viewport.
- Fluid type and spacing with `clamp()`. Body never below 16px on inputs (prevents iOS zoom).
- Grids: `repeat(auto-fit, minmax(…, 1fr))` before media queries. Flex with `min-width: 0` on children to stop overflow.
- Touch: targets ≥ 44×44px, no hover-only actions (`@media (hover: none)`), swipe-friendly horizontal scrollers with `scroll-snap`.
- Images: `max-width: 100%`, `aspect-ratio` to avoid layout shift, `loading="lazy"`.
- Test at 320, 375, 768, 1024, 1440 and 1920 widths, landscape phone included. No horizontal page scroll at any size.
