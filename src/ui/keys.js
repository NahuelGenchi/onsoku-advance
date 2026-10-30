// A key or a controller button as the settings draw it, a key in the dreamports.net launcher's look: the arrows
// as pixel art, as the touch d-pad draws them (Monocraft's are too small to read on a key), and a controller's
// A, B, X and Y in the Xbox controller's colours.

const ARROWS = { '↑': 0, '→': 90, '↓': 180, '←': 270 };
const NAMES = { '↑': 'Up', '→': 'Right', '↓': 'Down', '←': 'Left' };
const arrow = c => `<svg class="key-arrow" viewBox="0 0 5 5" style="transform: rotate(${ARROWS[c]}deg)" shape-rendering="crispEdges" aria-hidden="true"><path d="M2 1h1v1H2zM1 2h3v1H1zM0 3h5v1H0z"/></svg>`;
const escape = text => String(text).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

/** `label` as a key: a controller's button when `pad`, so A, B, X and Y take their colours. */
export function keyHtml(label, pad = false) {
  const arrows = label.length > 0 && [...label].every(c => c in ARROWS);
  const inner = arrows
    ? `${[...label].map(arrow).join('')}<span class="key-name">${[...label].map(c => NAMES[c]).join(' ')}</span>`
    : escape(label);
  const face = pad && /^[ABXY]$/.test(label) ? ` key-${label.toLowerCase()}` : '';
  return `<kbd class="key${face}">${inner}</kbd>`;
}
