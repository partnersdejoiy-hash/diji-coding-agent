---
name: Diji
description: Dejoiy's coding agent, printed in two inks on newsprint paper.
colors:
  paper: "#f5f1ea"
  rail-paper: "#fbe7ef"
  rail-hover: "#f6d6e5"
  surface: "#fffdf9"
  surface-2: "#efe9e0"
  surface-3: "#e5ddd1"
  code-paper: "#f0eae0"
  rule: "#e0d7ca"
  rule-strong: "#cbbfae"
  ink: "#221a1f"
  ink-2: "#54484f"
  ink-3: "#74676e"
  pink: "#e8178a"
  pink-ink: "#b80f69"
  pink-tint: "#f9d2e4"
  blue: "#2f6bff"
  blue-ink: "#1d4bd1"
  blue-tint: "#cddbff"
  blue-soft: "#e2e9ff"
  plate: "rgb(47 107 255 / 0.5)"
  ok: "#157a52"
  ok-soft: "#dcf1e6"
  err: "#c01f4b"
  err-soft: "#fbe2e9"
  mochi-body: "#f25aa8"
  mochi-cheek: "#c80e72"
  paper-dark: "#19141a"
  rail-paper-dark: "#241921"
  surface-dark: "#211b21"
  surface-2-dark: "#2a232a"
  rule-dark: "#342b32"
  rule-strong-dark: "#4b4049"
  ink-dark: "#f4edf0"
  ink-3-dark: "#a19499"
  pink-dark: "#ff4fa6"
  pink-ink-dark: "#ff86c3"
  pink-tint-dark: "#6a2350"
  blue-ink-dark: "#9cb7ff"
  plate-dark: "rgb(111 150 255 / 0.55)"
typography:
  display:
    fontFamily: "Bricolage Grotesque, Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(30px, 4vw, 44px)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  wordmark:
    fontFamily: "Bricolage Grotesque, Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "23px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Bricolage Grotesque, Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Bricolage Grotesque, Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  reading:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.7
  body:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  ui:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13.5px"
    fontWeight: 500
    lineHeight: 1.45
  label:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "11.5px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.01em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: "6px"
  md: "9px"
  control: "10px"
  button: "11px"
  lg: "12px"
  card: "14px"
  xl: "16px"
  bubble: "20px"
  pill: "50%"
spacing:
  hair: "2px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  turn: "26px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    typography: "{typography.ui}"
    rounded: "{rounded.button}"
    padding: "0 16px"
    height: "38px"
  button-ghost:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "0 16px"
    height: "38px"
  button-ghost-hover:
    backgroundColor: "{colors.surface-3}"
  button-danger:
    backgroundColor: "{colors.err-soft}"
    textColor: "{colors.err}"
    rounded: "{rounded.button}"
    padding: "0 16px"
    height: "38px"
  button-send:
    backgroundColor: "{colors.pink}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    size: "36px"
  button-icon:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.control}"
    size: "36px"
  button-icon-hover:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
  button-new-chat:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "42px"
  pill-toggle:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "34px"
  chip:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "32px"
  chip-lit:
    backgroundColor: "{colors.blue-soft}"
    textColor: "{colors.blue-ink}"
  input-field:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "40px"
  input-field-focus:
    backgroundColor: "{colors.surface}"
  composer:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "12px 12px 10px 16px"
  selected-item:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  user-bubble:
    backgroundColor: "{colors.pink-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.bubble}"
    padding: "11px 16px"
  starter-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "13px 15px"
  file-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "10px 12px"
  file-icon:
    backgroundColor: "{colors.pink-tint}"
    textColor: "{colors.pink-ink}"
    rounded: "8px"
    size: "36px"
  tool-card:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.lg}"
    padding: "8px 10px 8px 12px"
  sidebar-rail:
    backgroundColor: "{colors.rail-paper}"
    textColor: "{colors.ink-2}"
    width: "272px"
  modal:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
---

# Design System: Diji

## Overview

**Creative North Star: "Printed, Not Rendered"**

Diji is a familiar chat-plus-workspace app pulled through a two-ink risograph press. The ground is newsprint paper (warm off-white by day, plum-black paper by night) with a faint fractal grain; the left rail is pink-tinted paper; reading surfaces are clean sheets laid on top, separated by 1px ink rules rather than glass, glow or gradients. Only two inks touch the page: Dejoiy magenta for actions, brand and the mascot, and Dejoiy blue for links, selection, focus and code. Text is a warm near-black ink.

The one printing accident the system allows on purpose is misregistration. Anything selected or active is printed twice: the paper card, and a blue plate a few pixels off-register behind it (a hard, unblurred offset shadow). The greeting gets the same treatment in pink. The plates sit side by side and never blend; pink laid over blue would print purple, and that look was explicitly rejected. Diji the mascot is printed the same way: a pink mochi body with a blue plate peeking out at the lower right.

Density is calm and conversational: a 780px reading column, generous turn spacing, small radii, and a single heavy display face reserved for the greeting, headings and the wordmark. Light and dark are equal citizens; every ink and paper has a tuned dark twin rather than an inverted one. The system refuses the category default for AI tools: navy surfaces, glass, glow and blue-violet gradients.

**Key Characteristics:**
- Newsprint paper ground with grain; sheets of paper for reading surfaces; 1px rules for structure.
- Exactly two brand inks (pink, blue) plus warm ink neutrals; status green and red are functional only.
- Misregistered blue plate (`3px 2.5px 0`) marks every selected or active thing.
- Bricolage Grotesque for display, Schibsted Grotesk for UI and reading, JetBrains Mono for code.
- Small radii (6 to 16px), soft ambient shadows for lift, hard offset plates for state.
- Diji the pink mochi carries the personality: it squishes while working, hops when done, wobbles on error.

## Colors

A two-ink risograph palette: Dejoiy magenta and Dejoiy blue printed on warm paper, with warm near-black ink for text.

### Primary
- **Dejoiy Press Pink** (`pink`): the action ink. The send button, the caret and text cursor, counts and badges, the "connected" dot, the agent toast icon. In dark mode it brightens to `pink-dark` so it still reads on plum paper.
- **Deep Press Pink** (`pink-ink`): pink as text. The `diji` wordmark, keyword tokens in code, file-card icon glyphs. Holds 5.4:1 on the pink rail.
- **Blush Tint** (`pink-tint`): the pink plate at low density. User message bubbles and file-card icon wells. Dark twin `pink-tint-dark` is a deep wine.

### Secondary
- **Dejoiy Press Blue** (`blue`): the second ink, used mostly through its derived plate and the mascot's sprout and back plate.
- **Deep Press Blue** (`blue-ink`): blue as text and line. Links, the focus outline, tool icons, title and function tokens in code, lit chips, "Undo"-style toast actions.
- **Blue Plate** (`plate`, 50% blue; `plate-dark`, 55%): the misregistered offset printed behind selected things. Never used as a fill.
- **Pale Blue Wash** (`blue-soft`) and **Selection Blue** (`blue-tint`): lit chip backgrounds, unread notifications, and `::selection`.

### Neutral
- **Newsprint** (`paper`): the app ground, under the grain. Dark twin **Plum-Black Paper** (`paper-dark`).
- **Pink Rail Paper** (`rail-paper`) with **Rail Hover** (`rail-hover`): the sidebar only.
- **Clean Sheet** (`surface`): composer, cards, popovers, modals, the workspace panel. `surface-2` and `surface-3` are the recessed and pressed sheets (ghost buttons, inputs at rest, code headers, segmented tracks). `code-paper` is the code block ground.
- **Hairline Rule** (`rule`) and **Firm Rule** (`rule-strong`): 1px borders. `rule-strong` frames the composer, the new-chat button and the inset edge of selected items.
- **Warm Ink** (`ink`), **Soft Ink** (`ink-2`), **Faint Ink** (`ink-3`): primary text, secondary text, and meta/placeholder text. `ink-3` holds 4.5:1 or better on both paper and rail.
- **Functional status** (`ok`, `ok-soft`, `err`, `err-soft`): success and error only, in toasts, test results, tool status and error callouts.

### Named Rules
**The Two Inks Rule.** Pink and blue are the only chromatic inks in the chrome. Pink means "act / this is Diji"; blue means "go / selected / focused / code". Green and red appear only to report status.

**The No Overprint Rule.** Pink and blue never overlap with a blend mode. The blue plate is an offset box-shadow beside the paper card, not a multiply layer under pink, because pink multiplied over blue prints purple.

**The Paper First Rule.** Grain lives on the ground only (`body::before`, multiply at 0.9 in light, screen at 0.4 in dark). Reading surfaces are clean sheets; never put grain, gradients or tints behind long text.

## Typography

**Display Font:** Bricolage Grotesque (with Schibsted Grotesk, system sans fallback)
**Body Font:** Schibsted Grotesk (with ui-sans-serif, system-ui)
**Label/Mono Font:** JetBrains Mono (with ui-monospace, SF Mono, Menlo)

**Character:** A chunky, slightly quirky grotesque for the few loud moments, over a crisp newspaper grotesk that stays out of the way for hours of reading. Mono is reserved for code, file names and URLs.

### Hierarchy
- **Display** (700, `clamp(30px, 4vw, 44px)`, 1.08, -0.035em): the empty-state greeting only, balanced wrap, printed with a pink misregistered text-shadow.
- **Wordmark** (700, 23px, 1, -0.04em): lowercase `diji` in the rail, in Deep Press Pink.
- **Headline** (700, 21px, 1.2): modal titles (Settings, Skills).
- **Title** (650, 18px, 1.25): section headings inside settings. Markdown headings in replies use the display face at 650 scaled from the reply size (1.45em / 1.25em / 1.1em / 1em).
- **Reading** (400, 16px, 1.7): assistant replies, in a column capped at 780px (860px above 1700px). User bubbles run 15.5px / 1.6.
- **Body** (400, 15px, 1.55): base UI text and the page default.
- **UI** (500 to 550, 13 to 14px): buttons (14px / 550), tabs, chips, popover items, toasts.
- **Label** (600, 11.5px, +0.01em, sentence case): sidebar date groups and popover group headings. Never uppercase.
- **Mono** (400, 13.5px, 1.6): code blocks; 12 to 13.5px for file names, URLs and code headers; inline code at 0.86em on a `surface-2` chip.

### Named Rules
**The One Loud Face Rule.** Bricolage appears only in the greeting, the wordmark, modal and section titles, and markdown headings. Every control, label and paragraph is Schibsted Grotesk.

**The Mono Means Machine Rule.** JetBrains Mono marks things a machine reads: code, file names, paths, URLs, keyboard hints. Never use it for decoration.

## Layout

A three-column app shell: a 272px pink rail on the left, the chat in the middle, and the workspace panel on the right (`clamp(400px, 44vw, 820px)`, tightened to `clamp(380px, 40vw, 620px)` when the rail is also open between 1180 and 1440px). The chat column is centred at 780px with 24px side gutters; the topbar is 56px tall and carries the chat title plus the Workspace and Browser toggles.

When the chat is empty the thread collapses and the greeting block (mascot, display greeting, subline capped at 52ch, a two-by-two starter grid) sits vertically centred directly above the composer. Messages are spaced 26px apart; assistant turns put a 30px mascot avatar in a 14px-gap gutter; tool cards indent 44px to align with the reply text.

Spacing runs on a 4px base with 2px hairline steps: 4, 8, 12, 16 and 24px carry most layout; 6 and 10px are common control gaps.

Responsive behaviour:
- **Below 1180px** the rail and the panel float over the chat as fixed sheets with `shadow-lg` and a scrim.
- **Below 768px** the topbar drops to 52px, pill toggles become 38px icon squares with corner counts, the thread gutter narrows to 16px, the avatar shrinks to 26px, starters stack to one column and show only two, the composer gets a 20px radius, the panel becomes a full-screen sheet that rises from below, modals go full-bleed, and settings navigation becomes a horizontal scroller.
- **Below 361px** chip labels hide entirely.
- **At 1700px and up** the reading column widens to 860px.

## Elevation & Depth

A hybrid. Structure is flat: paper, sheets and 1px rules. Lift uses soft, warm-tinted ambient shadows (tinted plum `rgb(70 30 50)` in light, pure black in dark) for things that float: the composer, popovers, toasts, modals and overlay sheets. State uses the opposite: a hard, unblurred, off-register plate. Hover adds a 1px rise plus the next shadow step; press pushes the element 1px down and right, "into" the paper.

### Shadow Vocabulary
- **Sheet** (`box-shadow: 0 1px 2px rgb(70 30 50 / 0.07)`): resting buttons, file cards, the new-chat button.
- **Lift** (`box-shadow: 0 6px 18px -8px rgb(70 30 50 / 0.2), 0 1px 3px rgb(70 30 50 / 0.06)`): the composer, hover state of cards and primary buttons, the jump button.
- **Float** (`box-shadow: 0 22px 50px -18px rgb(70 30 50 / 0.34), 0 4px 12px rgb(70 30 50 / 0.08)`): popovers, toasts, modals, overlay rail and panel.
- **Misregistered Plate** (`box-shadow: inset 0 0 0 1px var(--line-2), 3px 2.5px 0 var(--plate)`): selected chat, selected tab, selected model, selected file, settings nav, provider and theme segment. Without the inset rule on user bubbles, pressed pill toggles and enabled skills.
- **Pink Plate** (`text-shadow: 3px 2px 0 color-mix(in srgb, var(--pink) 45%, transparent)`): the greeting only.

### Named Rules
**The Plate Means Selected Rule.** A hard offset shadow is reserved for state: selected, pressed, enabled, or "this is you" (user bubbles). It is never used for hover, for decoration, or for lift.

**The Soft For Float Rule.** Anything that floats above the page uses the blurred ambient ladder (Sheet, Lift, Float), never the plate.

## Shapes

Small, gently rounded corners on a stepped scale: 6px for inline code, kbd hints and tags; 8 to 10px for icon buttons, list rows, inputs and chips; 11px for buttons and segmented tracks; 12px for the send button, new chat and tool cards; 14px for starter and file cards and toasts; 16px for the composer, popovers and modals. User bubbles use a 20px radius with a 6px tail corner at the bottom right. Circles are reserved for status dots, the jump button and switch thumbs. Borders are always 1px; the only 2px stroke is the dashed drop target.

## Components

### Buttons
Quiet, paper-built and tactile: they rise a pixel on hover and press a pixel into the paper on click.
- **Shape:** gently rounded (11px), 38px tall, 0 16px padding, 14px / 550 label, 8px icon gap.
- **Primary:** Warm Ink fill with Clean Sheet text and a Sheet shadow; hover lifts 1px and steps up to Lift.
- **Ghost:** recessed `surface-2` with a hairline rule; hover deepens to `surface-3`. A 30px small size exists for in-pane actions.
- **Danger:** `err-soft` fill, `err` text.
- **Send:** a 36px Press Pink square (12px radius) with a white arrow; hover rises and scales 1.04. While streaming it becomes a Warm Ink stop button. This is the only solid-pink control.
- **Icon:** 36px (28px tiny) transparent squares in Soft Ink, `surface-2` on hover.
- **Pill toggle:** 34px Clean Sheet buttons with a hairline rule (Workspace, Browser); pressed state adds the blue plate. Counts sit in a pink lozenge.

### Chips
- **Style:** 32px, 10px radius, hairline rule, transparent, Soft Ink 13px text (the composer's skills chip).
- **State:** "lit" (skills active) switches to a Pale Blue Wash fill with Deep Press Blue text and a 40% blue rule. Attachment chips are 26px recessed sheets with an inline remove button.

### Cards / Containers
- **Corner Style:** 14px for starter and file cards, 12px for tool and skill cards.
- **Background:** Clean Sheet; tool cards sit recessed on `surface-2` until hovered.
- **Shadow Strategy:** Sheet at rest, Lift on hover with a 1px rise; enabled skill cards carry the blue plate.
- **Border:** 1px `rule`, firming to `rule-strong` on hover.
- **Internal Padding:** 10 to 15px.
- **File card:** a 36px Blush Tint icon well with a Deep Press Pink glyph, mono file name, Faint Ink line count, chevron. While a file is being written the icon well pulses.

### Inputs / Fields
- **Style:** 40px, 10px radius, recessed `surface-2` fill, hairline rule, 14px text; labels are 13px / 550 Soft Ink above the field. Selects use a custom chevron.
- **Focus:** the fill lifts to Clean Sheet and the rule tints toward blue (55% `blue-ink` mix). The caret is always Press Pink.
- **Composer:** a 16px-radius Clean Sheet with a firm rule and Lift shadow; on focus the rule darkens to Faint Ink with a 1px ring. 16px input text so phones never zoom.
- **Toggles:** switches are 38 by 22px tracks in `rule-strong` that fill with Press Pink when on; segmented controls are recessed 11px tracks whose checked segment gets the plate.

### Navigation
- **Rail:** pink-tinted paper with a hairline right rule. Wordmark plus 28px mascot at the top, then New chat (a 42px Clean Sheet with a firm rule and a mono `Ctrl K` hint), search, date-grouped chats (14px Soft Ink, single line), and Skills, Settings, theme, notifications and source at the foot above a rule.
- **States:** hover tints the row `rail-hover`; the current chat becomes a Clean Sheet card with Warm Ink 600 text and the blue plate. Row actions appear on hover or focus (always visible on touch).
- **Tabs:** a recessed 11px track with 30px tabs; the selected tab is a Clean Sheet card with the plate.
- **Mobile:** the rail becomes an overlay sheet with a scrim.

### Diji, the mascot (signature)
An original pink mochi with a two-leaf sprout, bean eyes with glints and blushing cheeks, drawn as inline SVG on a 64px grid. The body is printed twice: Mochi Pink on top and a blue plate offset 2.2 by 1.6 units behind it, so blue shows only at the lower-right edge. Moods drive motion: idle blinks and the sprout sways; thinking squishes on a 1s loop with a wiggling sprout; happy hops once with curved eyes; oops wobbles once with a flat mouth. Sizes in use: 28px (wordmark), 30px (avatar, 26px on phones), 44px (empty notifications), 88px (greeting, 72px on phones).

### Toasts and Popovers
Floating Clean Sheets with a hairline rule and the Float shadow. Toasts (14px radius, max 380px) enter from below on desktop and from the top on tablets and phones; their 24px icon well is tinted by kind (ok, error, or solid pink for agent events). Popovers (16px radius) hold 9px-radius rows; the chosen model is marked with the plate.

## Do's and Don'ts

### Do:
- **Do** mark every selected or active element with the misregistered blue plate (`3px 2.5px 0` of `plate`) on a Clean Sheet card with a `rule-strong` inset.
- **Do** keep pink for actions and Diji, and blue for links, focus, selection and code.
- **Do** separate regions with 1px rules (`rule`, `rule-strong`) and tonal paper steps, not with heavy shadows.
- **Do** give every color a tuned dark-mode twin and check both themes; dark mode is plum-black paper, not navy.
- **Do** let Diji react to state (thinking, happy, oops) instead of adding spinners or banners where the mascot is present.
- **Do** honour `prefers-reduced-motion`; the build collapses all animation and transition durations to near zero.

### Don't:
- **Don't** let pink and blue overlap through a blend mode or translucent layers; overlap prints purple, which was rejected. (Blending a single ink or the grain against paper, as the mascot's back plate and the ground grain do, is fine.)
- **Don't** use navy-dominant surfaces, glass, glow, or blue-violet gradients as decoration.
- **Don't** use the hard offset plate for hover, decoration or elevation; it means "selected".
- **Don't** put paper grain or tints behind long-form reading text.
- **Don't** use Bricolage Grotesque for controls or body copy, or uppercase small labels.
- **Don't** add a third brand hue; Dejoiy violet survives only as a legacy variable name aliased to pink.
