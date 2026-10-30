---
name: motion
description: Purposeful animation with CSS, Motion or GSAP that respects reduced motion.
---
# Motion & Animation

- Every animation answers "what changed?" (enter, exit, state, focus) or "where did it go?" (spatial continuity). Decoration-only motion gets cut.
- One authored hero moment per page beats many identical fade-ins.
- Durations: micro 120–200ms, UI transitions 200–350ms, page/hero 500–900ms. Ease-out (e.g. `cubic-bezier(.16,1,.3,1)`) for entrances, ease-in for exits.
- Animate `transform`, `opacity`, `filter`, `clip-path` for smoothness; avoid animating layout properties.
- Plain web: CSS transitions/keyframes, View Transitions API, IntersectionObserver for scroll reveals.
- React: Motion (`motion/react`) with `AnimatePresence` for exits and `layout` for shared transitions.
- Complex timelines/scroll scrubbing: GSAP + ScrollTrigger.
- Always wrap non-essential motion in `@media (prefers-reduced-motion: no-preference)` or provide a reduced fallback.
