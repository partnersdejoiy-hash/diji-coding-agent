---
name: react-next
description: Modern React and Next.js App Router patterns.
---
# React & Next.js

- Next.js App Router: server components by default; add `"use client"` only for state, effects, browser APIs or event handlers. Fetch data in server components or route handlers, not in `useEffect`.
- Mutations: Server Actions or route handlers with input validation (zod). Revalidate with `revalidatePath`/`revalidateTag`.
- State: local `useState` first, lift when shared, context for app-wide values, a store (Zustand) only when it truly helps. Derive values instead of syncing them with effects.
- Effects are for syncing with external systems only. Clean up subscriptions and timers.
- Lists need stable keys (ids, not indexes). Memoize only after measuring.
- Forms: controlled or `FormData` with progressive enhancement; show pending and error states.
- Styling: Tailwind with a small design token set, or CSS modules. Keep class lists readable.
- For the live preview in Diji (no build step), write React with ES module CDN imports (esm.sh) and an import map, or plain JSX via a small runtime only when asked.
