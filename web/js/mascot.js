// Diji, the mascot: a squishy gradient squircle with a spark antenna, drawn from the Dejoiy "D" smile.
// Moods: idle, thinking, happy, oops. Set with setMood(el, mood).
let uid = 0;

export function diji(size = 40, mood = "idle") {
  const g = `dg${++uid}`;
  return `<span class="diji mood-${mood}" style="--s:${size}px" role="img" aria-label="Diji">
<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
  <defs>
    <linearGradient id="${g}" x1="8" y1="6" x2="58" y2="60" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#F0218F"/><stop offset=".55" stop-color="#8B3DF0"/><stop offset="1" stop-color="#2F6BFF"/>
    </linearGradient>
  </defs>
  <g class="d-bob">
    <g class="d-antenna"><path d="M32 12V5" stroke="#8B3DF0" stroke-width="3" stroke-linecap="round"/><circle class="d-spark" cx="32" cy="4.5" r="3.6" fill="#FFC93D"/></g>
    <rect x="6" y="11" width="52" height="47" rx="17" fill="url(#${g})"/>
    <path d="M14 22c2-6 7-8.5 14-8.5" stroke="#fff" stroke-opacity=".35" stroke-width="3" stroke-linecap="round" fill="none"/>
    <g class="d-eyes">
      <g class="d-open">
        <ellipse cx="23.5" cy="32" rx="5.6" ry="6.6" fill="#fff"/><ellipse cx="40.5" cy="32" rx="5.6" ry="6.6" fill="#fff"/>
        <g class="d-pupils"><circle cx="24.6" cy="33" r="2.9" fill="#121845"/><circle cx="41.6" cy="33" r="2.9" fill="#121845"/>
        <circle cx="25.6" cy="31.8" r=".95" fill="#fff"/><circle cx="42.6" cy="31.8" r=".95" fill="#fff"/></g>
      </g>
      <g class="d-joy" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round">
        <path d="M18.5 33.5q5-6.5 10 0"/><path d="M35.5 33.5q5-6.5 10 0"/>
      </g>
    </g>
    <circle cx="16" cy="42" r="3.2" fill="#FF8FC8" opacity=".55"/><circle cx="48" cy="42" r="3.2" fill="#FF8FC8" opacity=".55"/>
    <path class="d-smile" d="M25 43.5q7 6.5 14 0" stroke="#fff" stroke-width="3.2" stroke-linecap="round" fill="none"/>
    <path class="d-flat" d="M26.5 45.5h11" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>
  </g>
</svg></span>`;
}

export function setMood(el, mood) {
  const d = el?.classList?.contains("diji") ? el : el?.querySelector?.(".diji");
  if (!d) return;
  d.className = d.className.replace(/mood-\w+/, `mood-${mood}`);
}
