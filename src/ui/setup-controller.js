// The start screen with a controller: the badge that lights up while an Xbox controller is connected, with a
// short note as it comes and goes, and the screen's links and buttons run from the pad. The d-pad or the left
// stick moves between them, A presses the one picked and Menu presses Play. Browsers only show a controller to the
// page once one of its buttons is pressed.

import { connectedPads, xboxConnected } from '../engine/input.js';

const DEAD_ZONE = 0.5;
const REPEAT_AFTER = 380, REPEAT_EVERY = 130;   // ms: a held direction moves again, then keeps moving
const PRESSABLE = 'a[href], button:not([hidden]):not(:disabled), input:not([type=file]):not(:disabled)';
const A = 0, MENU = 9;

/**
 * Binds the controller to the screen in `host`. `blocked(el)` is told when A pressed `el` but the browser
 * wouldn't take it from a controller (it opens the file list only from the mouse or the keyboard).
 */
export function bindController(host, { blocked }) {
  const badge = host.querySelector('.pad'), note = badge.querySelector('.pad-note');
  let timer = 0;

  // the badge: on with a note while an Xbox controller is in, off with a note, then gone, once none is
  function showBadge() {
    const on = xboxConnected();
    const was = badge.dataset.state;
    if (on === (was === 'on')) return;
    clearTimeout(timer);
    badge.dataset.state = on ? 'on' : 'off';
    note.textContent = on ? 'Controller on' : 'Controller off';
    badge.classList.add('noting');
    timer = setTimeout(() => {
      badge.classList.remove('noting');
      if (!on) timer = setTimeout(() => { badge.dataset.state = 'gone'; }, 350);
    }, on ? 2400 : 1600);
  }
  addEventListener('gamepadconnected', showBadge);
  addEventListener('gamepaddisconnected', showBadge);

  // moving between the screen's buttons, toward `dir`, from where they are drawn: to the nearest line of them
  // that way, then the one on it nearest across. The first move picks Play, or while it waits for a ROM the
  // first button, never the link out of the game.
  const area = el => (el.closest('.switch') ?? el).getBoundingClientRect();
  function move(dir) {
    const all = [...host.querySelectorAll(PRESSABLE)].filter(el => el.getClientRects().length);
    const from = all.includes(document.activeElement) ? document.activeElement : null;
    if (!from) return pick(host.querySelector('.play:not(:disabled)') ?? all.find(el => !el.matches('a')) ?? all[0]);
    const a = area(from), across = dir === 'left' || dir === 'right', sign = dir === 'up' || dir === 'left' ? -1 : 1;
    const centre = r => (across ? [r.left + r.width / 2, r.top + r.height / 2] : [r.top + r.height / 2, r.left + r.width / 2]);
    const [a1, a2] = centre(a);
    const ways = all.filter(el => el !== from).map(el => {
      const b = area(el), [b1, b2] = centre(b);
      return { el, ahead: (b1 - a1) * sign, aside: Math.abs(b2 - a2), line: across && Math.abs(b2 - a2) <= Math.max(a.height, b.height) / 2 };
    }).filter(w => w.ahead > 4 && (!across || w.line));
    if (!ways.length) return;
    const nearest = Math.min(...ways.map(w => w.ahead));
    const line = ways.filter(w => w.ahead <= nearest + 12);
    pick(line.reduce((best, w) => (w.aside < best.aside ? w : best)).el);
  }
  // the pick is marked as well as focused, so its ring shows even while the window itself isn't focused
  function pick(el) {
    if (!el) return;
    host.querySelector('.pad-at')?.classList.remove('pad-at');
    el.classList.add('pad-at');
    host.classList.add('pad-nav');
    el.focus({ focusVisible: true });
    (el.closest('.switch') ?? el).scrollIntoView({ block: 'nearest' });
  }
  function press(el) {
    if (!el || !host.contains(el) || !el.matches(PRESSABLE)) return;
    const picker = el.matches('.rom-add, .rom-change');
    if (picker && navigator.userActivation && !navigator.userActivation.isActive) return blocked(el);
    el.click();
  }
  // the mouse or the keyboard takes over: their own focus ring again
  for (const type of ['pointerdown', 'keydown', 'focusin']) {
    addEventListener(type, e => { if (type !== 'focusin' || !e.target.classList.contains('pad-at')) host.classList.remove('pad-nav'); }, true);
  }

  // the pads, read each frame while the screen shows. A and Menu act when they're let go, so the game that Menu
  // or A starts doesn't find them still held; a button already down when the screen came back does nothing.
  const held = new Set(), armed = new Set(), since = {};
  let showing = false;
  function read(time) {
    requestAnimationFrame(read);
    const pads = connectedPads();
    if (host.hidden || !pads.length) { showing = false; return; }
    const now = new Set();
    for (const pad of pads) {
      const on = i => pad.buttons[i]?.pressed;
      if (on(A)) now.add('a');
      if (on(MENU)) now.add('menu');
      if (on(12)) now.add('up');
      if (on(13)) now.add('down');
      if (on(14)) now.add('left');
      if (on(15)) now.add('right');
      for (const [x, y] of pad.mapping === 'standard' ? [[0, 1]] : [[0, 1], [6, 7]]) {
        const ax = pad.axes[x] ?? 0, ay = pad.axes[y] ?? 0;
        if (ax < -DEAD_ZONE) now.add('left');
        if (ax > DEAD_ZONE) now.add('right');
        if (ay < -DEAD_ZONE) now.add('up');
        if (ay > DEAD_ZONE) now.add('down');
      }
    }
    if (!showing) { showing = true; held.clear(); armed.clear(); now.forEach(b => held.add(b)); return; }
    for (const dir of ['up', 'down', 'left', 'right']) {
      if (!now.has(dir)) continue;
      if (!held.has(dir)) { since[dir] = time + REPEAT_AFTER; move(dir); }
      else if (time >= since[dir]) { since[dir] = time + REPEAT_EVERY; move(dir); }
    }
    for (const b of ['a', 'menu']) {
      if (now.has(b) && !held.has(b)) armed.add(b);
      if (!now.has(b) && armed.delete(b)) press(b === 'a' ? document.activeElement : host.querySelector('.play'));
    }
    held.clear();
    now.forEach(b => held.add(b));
  }
  requestAnimationFrame(read);
  showBadge();
}
