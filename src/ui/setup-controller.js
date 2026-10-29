// The start screen with a controller: the badge that lights up while an Xbox controller is connected, with a
// short note as it comes and goes, and the screen's links and buttons run from the pad. The d-pad or the left
// stick moves between them, A presses the one picked, Menu presses Play and B the way back. Browsers only show a
// controller to the page once one of its buttons is pressed.

import { connectedPads, xboxConnected } from '../engine/input.js';
import { padsHeld, toward, REPEAT_AFTER, REPEAT_EVERY } from './pad-nav.js';

const PRESSABLE = 'a[href], button:not([hidden]):not(:disabled), input:not([type=file]):not(:disabled)';

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
    pick(toward(all, from, dir, area));
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

  // the pads, read each frame while the screen shows. A, Menu and B act when they're let go, so the game that Menu
  // or A starts (or B goes back to) doesn't find them still held; a button already down when the screen came back
  // does nothing.
  const held = new Set(), armed = new Set(), since = {};
  let showing = false;
  function read(time) {
    requestAnimationFrame(read);
    const pads = connectedPads();
    if (host.hidden || !pads.length) { showing = false; return; }
    const now = padsHeld(pads);
    if (!showing) { showing = true; held.clear(); armed.clear(); now.forEach(b => held.add(b)); return; }
    for (const dir of ['up', 'down', 'left', 'right']) {
      if (!now.has(dir)) continue;
      if (!held.has(dir)) { since[dir] = time + REPEAT_AFTER; move(dir); }
      else if (time >= since[dir]) { since[dir] = time + REPEAT_EVERY; move(dir); }
    }
    const pressed = { a: () => document.activeElement, menu: () => host.querySelector('.play'), b: () => host.querySelector('.setup-back') };
    for (const b of ['a', 'menu', 'b']) {
      if (now.has(b) && !held.has(b)) armed.add(b);
      if (!now.has(b) && armed.delete(b)) press(pressed[b]());
    }
    held.clear();
    now.forEach(b => held.add(b));
  }
  requestAnimationFrame(read);
  showBadge();
}
