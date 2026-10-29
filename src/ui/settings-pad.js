// The game's settings with a controller, or the arrow keys: Y opens and closes them, as H does; while they are open
// the d-pad, the left stick or the arrows move between them, A presses the one picked, left and right move the
// Opacity slider, and B closes them. In a dialog opened from them the d-pad scrolls it (B closes it, dialog.js).

import { connectedPads } from '../engine/input.js';
import { padsHeld, toward, REPEAT_AFTER, REPEAT_EVERY } from './pad-nav.js';

const SCROLL = 60;   // px a dialog scrolls each step

/**
 * Binds the settings in `panel` (the help panel, whose `.actions` hold them). `canOpen()` says whether the game
 * shows, so Y may open them; `show(open)` opens or closes them; `dialog()` is the dialog open over the game, if any.
 */
export function bindSettingsPad(panel, { canOpen, show, dialog }) {
  const items = () => [...panel.querySelectorAll('.actions > :is(button, a, label)')]
    .filter(el => el.getClientRects().length && !el.matches(':disabled'));
  const target = el => (el.matches('label') ? el.querySelector('input') : el);
  const row = el => el.closest('.actions > *') ?? el;

  // the pick is marked as well as focused, so its ring shows even while the window itself isn't focused
  function pick(el) {
    if (!el) return;
    panel.querySelector('.pad-at')?.classList.remove('pad-at');
    row(el).classList.add('pad-at');
    target(el).focus({ focusVisible: true });
    row(el).scrollIntoView({ block: 'nearest' });
  }
  const current = () => items().find(el => el === row(document.activeElement));
  function move(dir) {
    const all = items(), from = current();
    if (!from) return pick(all[0]);
    const slider = from.querySelector('input[type=range]');
    if (slider && (dir === 'left' || dir === 'right')) {
      slider[dir === 'left' ? 'stepDown' : 'stepUp']();
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    pick(toward(all, from, dir) ?? from);
  }
  function scroll(box, dir) {
    if (dir === 'up' || dir === 'down') box.scrollBy({ top: dir === 'up' ? -SCROLL : SCROLL });
  }
  function open() { show(true); pick(items()[0]); }
  function step(dir) {
    const d = dialog();
    if (d) scroll(d.querySelector('.dialog-panel'), dir);
    else if (!panel.hidden) move(dir);
  }

  // the mouse takes over: its own look again
  addEventListener('pointerdown', () => panel.querySelector('.pad-at')?.classList.remove('pad-at'), true);

  // the arrow keys, while the settings are open or a dialog from them is
  addEventListener('keydown', e => {
    const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.code];
    if (!dir || e.altKey || e.ctrlKey || e.metaKey || (panel.hidden && !dialog())) return;
    if (!dialog() && document.activeElement?.matches('input[type=range]') && (dir === 'left' || dir === 'right')) return;
    e.preventDefault();
    step(dir);
  });

  // the pads, read each frame; a button acts as it goes down, A as it's let go, so what it opens or shows doesn't
  // find it still held, and a button already down when they open does nothing
  const held = new Set(), since = {};
  let armedA = false;
  function read(time) {
    requestAnimationFrame(read);
    const pads = connectedPads();
    if (!pads.length) { held.clear(); return; }
    const now = padsHeld(pads), down = b => now.has(b) && !held.has(b);
    const d = dialog();
    if (d) {
      if (down('y')) d.close();
    } else if (!panel.hidden) {
      if (down('b') || down('y')) show(false);
      if (down('a')) armedA = true;
      if (!now.has('a') && armedA) { armedA = false; const el = current(); if (el) target(el).click(); }
    } else if (down('y') && canOpen()) {
      open();
    }
    if (d || !panel.hidden) {
      for (const dir of ['up', 'down', 'left', 'right']) {
        if (!now.has(dir)) continue;
        if (!held.has(dir)) { since[dir] = time + REPEAT_AFTER; step(dir); }
        else if (time >= since[dir]) { since[dir] = time + REPEAT_EVERY; step(dir); }
      }
    }
    if (panel.hidden) armedA = false;
    held.clear();
    now.forEach(b => held.add(b));
  }
  requestAnimationFrame(read);

  return { open };
}
