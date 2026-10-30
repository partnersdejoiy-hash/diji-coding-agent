---
name: accessibility
description: Keyboard, screen reader, contrast and motion support built in.
---
# Accessibility

- Semantic HTML first: `button` for actions, `a` for navigation, real `label`s on inputs, headings in order, landmarks (`header`, `nav`, `main`).
- Keyboard: everything reachable with Tab in a logical order, visible `:focus-visible` styles, Escape closes dialogs, focus moves into and back out of modals.
- Screen readers: meaningful alt text (empty alt for decoration), `aria-label` on icon-only buttons, `aria-live` for async updates, ARIA only when HTML cannot express it.
- Contrast: 4.5:1 for body text, 3:1 for large text and UI boundaries. Never rely on colour alone.
- Motion: honour `prefers-reduced-motion`. No flashing above 3 times per second.
- Forms: errors next to the field, described with `aria-describedby`, and the message says how to fix it.
- Touch targets ≥ 44px. Zoom to 200% without loss of content.
