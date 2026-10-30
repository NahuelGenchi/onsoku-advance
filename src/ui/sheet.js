// The settings as one sheet in the middle of the screen, over the game, which waits behind it, blurred (main.js),
// drawn like the dreamports.net launcher and light or dark as it is. The settings are its first view; the
// achievements, Your ROMs, the asset viewer and the controls are views it grows into from them, each with its way
// back. It rises in as it opens and fades as it closes.
//
// With a keyboard the arrows move to the nearest button that way, Z or Enter presses it, Q and E go through a
// view's tabs, and Esc, X or Backspace goes back a step, closing the sheet from the settings (H closes it from
// anywhere, main.js). With a controller View + Menu held together open and close it (the game sees neither then),
// the d-pad or the left stick moves, A presses, B goes back a step, LB and RB go through the tabs and the right
// stick scrolls. A box that scrolls, once picked, scrolls with the arrows or the d-pad before they move on.

import { connectedPads, holdsSettingsCombo } from '../engine/input.js';
import { padsHeld, rightStick, toward, REPEAT_AFTER, REPEAT_EVERY } from './pad-nav.js';
import { isDark } from './theme.js';
import { keyHtml } from './keys.js';

const still = matchMedia('(prefers-reduced-motion: reduce)');
const RISE = 'cubic-bezier(.2, .9, .25, 1)', GROW = 'cubic-bezier(.65, 0, .2, 1)';
const STEP = 80;          // px a box scrolls each press of an arrow or the d-pad
const STICK = 18;         // px a frame the right stick scrolls, leant all the way
const PRESSABLE = 'button:not(:disabled), a[href], input:not([type=file]):not(:disabled), [data-nav]';
const pixels = (w, h, d) => `<svg viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true"><path d="${d}"/></svg>`;
const BACK = pixels(7, 7, 'M3 0h1v1H3zM2 1h1v1H2zM1 2h1v1H1zM0 3h7v1H0zM1 4h1v1H1zM2 5h1v1H2zM3 6h1v1H3z');
const PAUSED = pixels(7, 9, 'M0 0h2v9H0zM5 0h2v9H5z');
// the keys each view's foot names, for a keyboard and for a controller; `tabs` only where the view has tabs
const KEYS = [['↑↓←→', 'Move'], ['Z', 'Pick'], ['Q E', 'Tabs', 'tabs'], ['Esc', 'Back'], ['H', 'Close']];
const PAD = [['D-pad', 'Move'], ['A', 'Pick'], ['LB RB', 'Tabs', 'tabs'], ['B', 'Back'], ['View Menu', 'Close']];

/**
 * Makes the sheet in `wrap` (a child of `stage`, holding `.sheet-veil` and `.sheet`). `onOpen()` and `onClose()`
 * are told as it opens and closes, `canOpen()` says whether View + Menu may open it, and `blocked(el)` is told when
 * A pressed a button that opens the file list, which browsers open only from the mouse or the keyboard.
 */
export function createSheet(stage, wrap, { onOpen = () => {}, onClose = () => {}, canOpen = () => true, blocked = () => {} } = {}) {
  const sheet = wrap.querySelector('.sheet'), veil = wrap.querySelector('.sheet-veil');
  const views = new Map();
  let current = null, isOpen = false, pending = null, leaving = null, inerted = [];
  let how = 'pointer';   // what was used last: 'pointer', 'keys' or 'pad'

  /**
   * Adds the view `name`: `el` if given (the settings, written in the page), or a new one titled `title`, with the
   * way back, the title, a note beside it and its body. `show()` fills it as it comes in and `hide()` lets go of
   * what it holds once it's gone; `first()` is what to pick in it first, and `tabs()` its tabs, if it has any.
   * Returns { el, body, note }.
   */
  function view(name, { el = null, title = '', show = () => {}, hide = () => {}, first = () => null, tabs = null } = {}) {
    if (!el) {
      el = document.createElement('section');
      el.className = 'view';
      el.innerHTML = `
        <header class="sheet-head">
          <button type="button" class="sheet-back" data-back aria-label="Back to the settings" title="Back to the settings">${BACK}</button>
          <div class="sheet-title"><p class="sheet-crumb">Settings</p><h2 id="sheet-${name}-title">${title}</h2></div>
          <span class="sheet-note"></span>
          <span class="sheet-paused">${PAUSED}Paused</span>
          <button type="button" class="sheet-close" data-close aria-label="Close" title="Close">×</button>
        </header>
        <div class="sheet-body"></div>
        <footer class="sheet-foot" aria-hidden="true"></footer>`;
      el.setAttribute('aria-labelledby', `sheet-${name}-title`);
      sheet.append(el);
    }
    el.hidden = true;
    const v = { name, el, show, hide, first, tabs, opener: null, body: el.querySelector('.sheet-body'), note: el.querySelector('.sheet-note'), foot: el.querySelector('.sheet-foot') };
    views.set(name, v);
    el.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', back));
    el.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => close()));
    return v;
  }

  // the keys for this view in its foot: a controller's while one is connected, else the keyboard's
  function showKeys(v) {
    const pad = connectedPads().length > 0;
    v.foot.dataset.input = pad ? 'pad' : 'keys';
    v.foot.innerHTML = (pad ? PAD : KEYS).filter(([, , only]) => !only || v.tabs)
      .map(([keys, what]) => `<span>${keys.split(' ').map(k => keyHtml(k, pad)).join('')}${what}</span>`).join('');
  }

  function show(v) {
    for (const other of views.values()) other.el.hidden = other !== v;
    current = v;
    sheet.dataset.view = v.name;
    sheet.setAttribute('aria-labelledby', v.el.getAttribute('aria-labelledby'));
    showKeys(v);
  }

  // the rest of the stage takes no clicks, touches or focus while the sheet is open
  function setInert(on) {
    if (on) inerted = [...stage.children].filter(el => el !== wrap && !el.inert);
    for (const el of inerted) el.inert = on;
    if (!on) inerted = [];
  }

  // a morph or a fade still running, finished now
  const settle = () => { pending?.(); leaving?.(); };
  // when the last of `anims` ends, or now
  function after(anims, then) {
    const last = anims.reduce((a, b) => (b.effect.getComputedTiming().endTime > a.effect.getComputedTiming().endTime ? b : a));
    last.onfinish = then;
  }

  /** Opens the sheet on the view `name`. */
  function open(name = 'settings') {
    if (isOpen) return;
    settle();
    isOpen = true;
    wrap.dataset.look = isDark() ? 'dark' : 'light';
    const v = views.get(name);
    v.show();
    show(v);
    wrap.hidden = false;
    stage.classList.add('sheet-open');
    setInert(true);
    onOpen();
    // the veil comes over the game as the sheet rises into place, and what it holds a moment after it
    const quick = still.matches;
    const anims = [
      veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: quick ? 120 : 320, easing: 'ease-out' }),
      sheet.animate([{ opacity: 0, transform: quick ? 'none' : 'translateY(14px) scale(.94)' }, { opacity: 1, transform: 'none' }],
        { duration: quick ? 120 : 380, easing: RISE }),
    ];
    if (!quick) {
      [...v.el.querySelectorAll('.sheet-rise > *')].slice(0, 12).forEach((el, i) => anims.push(el.animate(
        [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
        { duration: 320, delay: 90 + i * 28, fill: 'backwards', easing: 'cubic-bezier(.2, .8, .2, 1)' })));
    }
    const done = () => { if (pending !== done) return; pending = null; anims.forEach(a => a.cancel()); };
    pending = done;
    after(anims, done);
    pick(v.first(), how !== 'pointer');
  }

  /** Closes the sheet: at once with `now`. */
  function close({ now = false } = {}) {
    if (!isOpen) return;
    settle();
    isOpen = false;
    const v = current;
    stage.classList.remove('sheet-open');
    setInert(false);
    clearMark();
    const done = () => {
      if (leaving !== done) return;
      leaving = null;
      anims.forEach(a => a.cancel());
      wrap.hidden = true;
      v.el.hidden = true;
      v.hide();
    };
    leaving = done;
    const quick = still.matches;
    const anims = now ? [] : [
      sheet.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: quick ? 'none' : 'scale(.97)' }], { duration: quick ? 120 : 180, easing: 'ease-in', fill: 'forwards' }),
      veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: quick ? 120 : 240, easing: 'ease-in', fill: 'forwards' }),
    ];
    onClose();
    if (anims.length) after(anims, done);
    else done();
  }

  /** Goes to the view `name`, the sheet growing or shrinking to it; back to the settings, to what opened it. */
  function go(name) {
    if (!isOpen || current.name === name) return;
    settle();
    const out = current, into = views.get(name);
    if (name !== 'settings') into.opener = document.activeElement;
    const pin = (el, r) => { el.style.cssText = `position: absolute; top: 0; left: 0; width: ${r.width}px; height: ${r.height}px`; };
    const a = sheet.getBoundingClientRect();
    pin(out.el, a);
    into.show();
    show(into);
    out.el.hidden = false;   // still there, fading, until the sheet has grown
    const quick = still.matches, d = quick ? 240 : 520;
    const anims = [];
    if (!quick) {
      // the sheet grows (or shrinks) from one size to the other, with each view held at its own size meanwhile, so
      // neither is laid out again on the way
      const b = sheet.getBoundingClientRect();
      pin(into.el, b);
      anims.push(sheet.animate([{ width: `${a.width}px`, height: `${a.height}px` }, { width: `${b.width}px`, height: `${b.height}px` }],
        { duration: d, easing: GROW, fill: 'forwards' }));
    }
    anims.push(out.el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: quick ? 'none' : 'scale(.985)' }],
      { duration: d * 0.3, easing: 'ease-in', fill: 'forwards' }));
    anims.push(into.el.animate([{ opacity: 0, transform: quick ? 'none' : 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
      { duration: d * 0.55, delay: d * 0.45, easing: RISE, fill: 'backwards' }));
    if (!quick) {
      [...into.el.querySelectorAll('.sheet-rise > *')].slice(0, 12).forEach((el, i) => anims.push(el.animate(
        [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
        { duration: 300, delay: d * 0.5 + i * 22, fill: 'backwards', easing: 'cubic-bezier(.2, .8, .2, 1)' })));
    }
    const done = () => {
      if (pending !== done) return;
      pending = null;
      anims.forEach(x => x.cancel());
      out.el.hidden = true;
      out.el.style.cssText = into.el.style.cssText = '';
      out.hide();
    };
    pending = done;
    after(anims, done);
    pick(name === 'settings' && out.opener?.isConnected ? out.opener : into.first(), how !== 'pointer');
  }

  /** A step back: to the settings, or closed from them. */
  function back() {
    if (!isOpen) return;
    if (current.name === 'settings') close();
    else go('settings');
  }

  // what can be picked in the view showing, and the box drawn around each (a switch's label, for its checkbox)
  const ring = el => el.closest('label') ?? el;
  const items = () => [...current.el.querySelectorAll(PRESSABLE)].filter(el => ring(el).getClientRects().length);
  const area = el => ring(el).getBoundingClientRect();
  function clearMark() { sheet.querySelectorAll('.pad-at').forEach(el => el.classList.remove('pad-at')); }
  // picks `el`: focused, and with the keyboard or a controller marked as well, so its ring shows even while the
  // window itself isn't focused
  function pick(el, marked = true) {
    el ??= items()[0];
    if (!el) return;
    clearMark();
    if (marked) ring(el).classList.add('pad-at');
    el.focus({ preventScroll: true, focusVisible: marked });
    if (marked) ring(el).scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // the nearest box around `el` that scrolls up and down, or else the first in the view showing
  const scrolls = p => ['auto', 'scroll'].includes(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight + 1;
  function scroller(el) {
    for (let p = el?.parentElement; p && p !== wrap; p = p.parentElement) if (scrolls(p)) return p;
    return [...current.el.querySelectorAll('.sheet-body, .split, .main, .side')].find(scrolls) ?? null;
  }
  // a picked box that scrolls (the asset viewer's sheets) scrolls toward `dir` while it can
  function scrollBox(el, dir) {
    if (!el.matches('[data-scroll]')) return false;
    const x = dir === 'left' ? -1 : dir === 'right' ? 1 : 0, y = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
    const can = x
      ? (x < 0 ? el.scrollLeft > 0 : el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
      : (y < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1);
    if (can) el.scrollBy({ left: x * STEP, top: y * STEP });
    return can;
  }
  // toward `dir`: the nearest button that way in the same column (up or down) or on the same line (left or right),
  // else the nearest more that way than aside. The head's buttons are reached only going up. With none up or down,
  // the box it's in scrolls.
  function step(dir) {
    if (pending) pending();
    const all = items(), at = all.includes(document.activeElement) ? document.activeElement : null;
    if (!at) return pick(current.first());
    if (scrollBox(at, dir)) return;
    // a slider moves along, by its step
    if (at.matches('input[type=range]') && (dir === 'left' || dir === 'right')) {
      if (dir === 'left') at.stepDown(); else at.stepUp();
      at.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const inHead = el => !!el.closest('.sheet-head');
    const ways = all.filter(el => dir === 'up' || inHead(at) || !inHead(el));
    const to = (dir === 'up' || dir === 'down' ? column(ways, at, dir) : toward(ways, at, dir, area)) ?? nearest(ways, at, dir);
    if (to) pick(to);
    else if (dir === 'up' || dir === 'down') scroller(at)?.scrollBy({ top: dir === 'up' ? -STEP : STEP });
  }
  function nearest(all, from, dir) {
    const a = area(from), sign = dir === 'up' || dir === 'left' ? -1 : 1, across = dir === 'left' || dir === 'right';
    const centre = r => [r.left + r.width / 2, r.top + r.height / 2];
    const [ax, ay] = centre(a);
    let best = null, score = Infinity;
    for (const el of all) {
      if (el === from) continue;
      const [bx, by] = centre(area(el));
      const ahead = (across ? bx - ax : by - ay) * sign, aside = Math.abs(across ? by - ay : bx - ax);
      if (ahead <= 4 || aside > ahead * 1.5) continue;
      if (ahead + aside * 2 < score) { score = ahead + aside * 2; best = el; }
    }
    return best;
  }
  // the nearest of `all` above or below `from` that shares some of its width
  function column(all, from, dir) {
    const a = area(from), sign = dir === 'up' ? -1 : 1, mid = r => r.top + r.height / 2;
    let best = null, score = Infinity;
    for (const el of all) {
      if (el === from) continue;
      const b = area(el), ahead = (mid(b) - mid(a)) * sign;
      if (ahead <= 4 || Math.min(a.right, b.right) - Math.max(a.left, b.left) <= 0) continue;
      const aside = Math.abs(b.left + b.width / 2 - (a.left + a.width / 2));
      if (ahead + aside / 4 < score) { score = ahead + aside / 4; best = el; }
    }
    return best;
  }
  // the next or the previous of the view's tabs (`by` 1 or -1), picked as well when it isn't the mouse
  function tab(by) {
    const list = current.tabs?.() ?? [];
    if (!list.length) return;
    const at = Math.max(0, list.findIndex(el => el.matches('[aria-current="true"], [aria-pressed="true"]')));
    const to = Math.min(list.length - 1, Math.max(0, at + by));
    if (to === at) return;
    list[to].click();
    pick(current.tabs()[to], how !== 'pointer');
  }
  function press(el) {
    if (!el || !current.el.contains(el) || !el.matches(PRESSABLE)) return;
    if (el.matches('[data-file]') && navigator.userActivation && !navigator.userActivation.isActive) return blocked(el);
    el.click();
  }

  wrap.addEventListener('click', e => { if (e.target === wrap || e.target === veil) close(); });
  addEventListener('pointerdown', () => { how = 'pointer'; clearMark(); }, true);
  addEventListener('keydown', e => {
    if (!isOpen || e.altKey || e.ctrlKey || e.metaKey) return;
    how = 'keys';
    const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.code];
    if (dir) {
      if (e.target.matches?.('input[type=range]') && (dir === 'left' || dir === 'right')) return;   // the slider moves
      e.preventDefault();
      step(dir);
    } else if (e.code === 'Escape' || e.code === 'Backspace' || e.code === 'KeyX') {
      e.preventDefault();
      if (!e.repeat) back();
    } else if (e.code === 'KeyZ') {
      e.preventDefault();
      if (!e.repeat) press(document.activeElement);
    } else if (e.code === 'KeyQ' || e.code === 'KeyE') {
      e.preventDefault();
      if (!e.repeat) tab(e.code === 'KeyQ' ? -1 : 1);
    }
  });

  // the pads, read each frame; a button acts as it goes down, A as it's let go, so what it opens doesn't find it
  // still held, and a button already down as the sheet opens does nothing
  const held = new Set(), since = {};
  let armed = false, comboBefore = false, padIn = false;
  function read(time) {
    requestAnimationFrame(read);
    const pads = connectedPads();
    if (padIn !== pads.length > 0) { padIn = pads.length > 0; if (isOpen) showKeys(current); }
    if (!pads.length) { held.clear(); comboBefore = armed = false; return; }
    const now = padsHeld(pads), down = b => now.has(b) && !held.has(b);
    const combo = pads.some(holdsSettingsCombo), toggle = combo && !comboBefore;
    comboBefore = combo;
    if ([...now].some(b => !held.has(b))) how = 'pad';
    if (toggle) {
      how = 'pad';
      if (isOpen) close();
      else if (canOpen()) open();
    } else if (isOpen) {
      if (down('b')) back();
      if (down('lb')) tab(-1);
      if (down('rb')) tab(1);
      if (down('a')) armed = true;
      if (!now.has('a') && armed) { armed = false; press(document.activeElement); }
      for (const dir of ['up', 'down', 'left', 'right']) {
        if (!now.has(dir) || !isOpen) continue;
        if (!held.has(dir)) { since[dir] = time + REPEAT_AFTER; step(dir); }
        else if (time >= since[dir]) { since[dir] = time + REPEAT_EVERY; step(dir); }
      }
      const [x, y] = rightStick(pads);
      if (x || y) {
        const at = document.activeElement, box = at?.matches?.('[data-scroll]') ? at : scroller(current.el.contains(at) ? at : null);
        box?.scrollBy({ left: x * STICK, top: y * STICK });
      }
    }
    if (!isOpen) armed = false;
    held.clear();
    now.forEach(b => held.add(b));
  }
  requestAnimationFrame(read);

  return {
    view, open, close, go, back,
    get isOpen() { return isOpen; },
    /** The view showing, while the sheet is open. */
    get current() { return isOpen ? current.name : null; },
    /** Picks `el` in the view showing, as the last input would. */
    pick: el => pick(el, how !== 'pointer'),
  };
}
