---
name: threejs
description: Interactive WebGL scenes with Three.js or React Three Fiber.
---
# 3D with Three.js

- Plain HTML: import Three as an ES module from a CDN (`https://cdn.jsdelivr.net/npm/three@<version>/build/three.module.js`) via an import map, so the preview runs without a build.
- Setup: renderer with `antialias`, `setPixelRatio(Math.min(devicePixelRatio, 2))`, resize on `ResizeObserver`, `outputColorSpace = SRGBColorSpace`.
- Lighting: hemisphere + one directional key light; add an environment map for PBR materials. Tone mapping ACES.
- Performance: reuse geometries/materials, instanced meshes for many objects, cap shadow map size, pause the loop when the tab is hidden or the canvas is off-screen.
- Interaction: OrbitControls with damping, pointer raycasting for hover/click, keyboard alternative for key actions.
- Build procedural models from primitives when no asset is provided; keep a clean scene graph with named groups so parts can animate.
- Mobile: lower poly counts and pixel ratio; test that it holds ~60fps.
- Respect reduced motion: stop auto-rotation.
