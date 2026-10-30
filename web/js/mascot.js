// Diji, the mascot: a pink mochi with a little sprout, printed in two inks (Dejoiy pink and blue).
// The blue plate sits a hair off-register behind the pink one, like a risograph print.
// Moods: idle, thinking (squishes), happy (hops, eyes curve), oops (wobbles, mouth flat).

const BODY = "M9 47.5C9 30 18.5 17 32 17s23 13 23 30.5c0 6.8-6.5 9.5-23 9.5S9 54.3 9 47.5Z";

export function diji(size = 40, mood = "idle") {
  return `<span class="diji mood-${mood}" style="--s:${size}px" role="img" aria-label="Diji">
<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
  <g class="d-bob">
    <g class="d-squish">
      <path class="d-plate-blue" d="${BODY}" transform="translate(2.2 1.6)"/>
      <path class="d-plate-pink" d="${BODY}"/>
      <path class="d-shine" d="M17 31c1.6-5.4 5.6-9.2 11-10.4" fill="none" stroke-width="2.6" stroke-linecap="round"/>
      <g class="d-sprout">
        <path class="d-stem" d="M32 17.5c0-3.4.6-5.8 2-8" fill="none" stroke-width="2.2" stroke-linecap="round"/>
        <path class="d-leaf" d="M34 9.6c1.3-3.3 4.6-4.9 8.2-4.3-.9 3.6-4.2 5.6-8.2 4.3Z"/>
        <path class="d-leaf" d="M33.4 11.4c-1.9-2.7-5.1-3.4-7.9-2 1.6 2.7 4.8 3.6 7.9 2Z"/>
      </g>
      <g class="d-face">
        <g class="d-open">
          <ellipse class="d-eye" cx="24.5" cy="38" rx="2.7" ry="3.3"/><ellipse class="d-eye" cx="39.5" cy="38" rx="2.7" ry="3.3"/>
          <circle class="d-glint" cx="25.4" cy="36.8" r=".9"/><circle class="d-glint" cx="40.4" cy="36.8" r=".9"/>
        </g>
        <g class="d-joy" fill="none" stroke-width="2.4" stroke-linecap="round">
          <path d="M21.6 38.8q2.9-3.6 5.8 0"/><path d="M36.6 38.8q2.9-3.6 5.8 0"/>
        </g>
        <ellipse class="d-cheek" cx="18.6" cy="43.4" rx="3.2" ry="2"/><ellipse class="d-cheek" cx="45.4" cy="43.4" rx="3.2" ry="2"/>
        <path class="d-smile" d="M29 43.2q1.5 1.9 3 0q1.5 1.9 3 0" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
        <path class="d-flat" d="M29 44.4h6" fill="none" stroke-width="1.9" stroke-linecap="round"/>
      </g>
    </g>
  </g>
</svg></span>`;
}

export function setMood(el, mood) {
  const d = el?.classList?.contains("diji") ? el : el?.querySelector?.(".diji");
  if (!d) return;
  d.className = d.className.replace(/mood-\w+/, `mood-${mood}`);
}
