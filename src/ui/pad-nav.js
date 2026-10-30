// Moving between a screen's buttons with a controller, shared by the start screen (setup-controller.js) and the
// settings (settings-pad.js): what the pads hold, and the button to go to from one toward a direction.

import { connectedPads } from '../engine/input.js';

const DEAD_ZONE = 0.5;
const BUTTONS = { a: 0, b: 1, menu: 9, up: 12, down: 13, left: 14, right: 15 };
export const REPEAT_AFTER = 380, REPEAT_EVERY = 130;   // ms: a held direction moves again, then keeps moving

/** What the connected pads hold, as a set of 'a', 'b', 'menu', 'up', 'down', 'left' and 'right'. */
export function padsHeld(pads = connectedPads()) {
  const now = new Set();
  for (const pad of pads) {
    for (const [name, i] of Object.entries(BUTTONS)) if (pad.buttons[i]?.pressed) now.add(name);
    for (const [x, y] of pad.mapping === 'standard' ? [[0, 1]] : [[0, 1], [6, 7]]) {
      const ax = pad.axes[x] ?? 0, ay = pad.axes[y] ?? 0;
      if (ax < -DEAD_ZONE) now.add('left');
      if (ax > DEAD_ZONE) now.add('right');
      if (ay < -DEAD_ZONE) now.add('up');
      if (ay > DEAD_ZONE) now.add('down');
    }
  }
  return now;
}

/**
 * The one of `all` to go to from `from` toward `dir` ('up', 'down', 'left' or 'right'), from where they are drawn
 * (`area(el)`, their box): the nearest line of them that way, then the one on it nearest across. Null if none is.
 */
export function toward(all, from, dir, area = el => el.getBoundingClientRect()) {
  const a = area(from), across = dir === 'left' || dir === 'right', sign = dir === 'up' || dir === 'left' ? -1 : 1;
  const centre = r => (across ? [r.left + r.width / 2, r.top + r.height / 2] : [r.top + r.height / 2, r.left + r.width / 2]);
  const [a1, a2] = centre(a);
  const ways = all.filter(el => el !== from).map(el => {
    const b = area(el), [b1, b2] = centre(b);
    return { el, ahead: (b1 - a1) * sign, aside: Math.abs(b2 - a2), line: across && Math.abs(b2 - a2) <= Math.max(a.height, b.height) / 2 };
  }).filter(w => w.ahead > 4 && (!across || w.line));
  if (!ways.length) return null;
  const nearest = Math.min(...ways.map(w => w.ahead));
  const line = ways.filter(w => w.ahead <= nearest + 12);
  return line.reduce((best, w) => (w.aside < best.aside ? w : best)).el;
}
