// The unlock popup, as Palmaris draws it (its docs/POPUP.md): one line, 16 of its pixels tall, a 12×10 gold trophy
// 4 pixels from the left and 3 from the top, then "Title (points)" in its 5×7 font from x 20, with 4 pixels after
// the last letter, in Palmaris's near-black and #EEEEEE when the look is dark and the other way round when it is
// light, the trophy gold in both. Its pixels are half the game's (at least 2 CSS px), so it sits small in the game's
// top-right corner, 4 of them from the edges, and it moves as RetroArch's achievement popup does with its anchor
// top right (gfx/widgets/gfx_widget_achievement_popup.c): the trophy's square drops in from the top edge of the
// game's screen, the box unfolds to the left to show the title, a light sweeps over it, and after 4 s it folds back
// and goes up again, each move 330 ms with an ease-out-quad, 5.32 s in all. Unlocks that come while one is up
// wait their turn.

import { font, trophy, GLYPH_W, CELL_W, CELL_H, TROPHY_W, TROPHY_H } from './pixels.js';
import { isDark } from '../ui/theme.js';

const H = 16, TEXT_X = 20, PAD = 3, MARGIN = 4;
// RetroArch's: MSG_QUEUE_ANIMATION_DURATION and CHEEVO_NOTIFICATION_DURATION, and EASING_OUT_QUAD
const MOVE = 330, HOLD = 4000, SHOWN = 4 * MOVE + HOLD;
const OUT_QUAD = 'cubic-bezier(.25, .46, .45, .94)';
// Palmaris's colours, its 5-bit ones at 8 bits: the box, the title, and the trophy's gold, shade and light
const GOLD = { G: '#ffc510', S: '#b57308', L: '#ffffa5' };
const LOOKS = { dark: { box: '#191919', ink: '#eeeeee' }, light: { box: '#eeeeee', ink: '#191919' } };
const still = matchMedia('(prefers-reduced-motion: reduce)');

const text = a => `${a.title} (${a.points})`;
// the box's width in the game's pixels: the text's cells after the trophy, the last cell's blank column and the
// padding after it
export const boxWidth = line => TEXT_X + CELL_W * line.length + PAD;

/** Draws the trophy on `ctx` at (x, y), one canvas pixel to its pixel, in `colours` (gold if not given). */
export function drawTrophy(ctx, x = 0, y = 0, colours = GOLD) {
  trophy.forEach((row, ty) => [...row].forEach((p, tx) => {
    if (p === '.') return;
    ctx.fillStyle = colours[p];
    ctx.fillRect(x + tx, y + ty, 1, 1);
  }));
}

function drawText(ctx, line, x, y, ink) {
  ctx.fillStyle = ink;
  [...line].forEach((ch, i) => {
    const code = ch.charCodeAt(0);
    const glyph = font[(code >= 0x20 && code <= 0x7e ? code : 0x3f) - 0x20];
    glyph.forEach((row, gy) => {
      for (let gx = 0; gx < GLYPH_W; gx++) if (row[gx] === '#') ctx.fillRect(x + i * CELL_W + gx, y + gy, 1, 1);
    });
  });
}

// a canvas of w × h of the game's pixels, shown at their size
const canvasOf = (cls, w, h) => {
  const c = document.createElement('canvas');
  c.className = cls; c.width = w; c.height = h;
  c.style.width = `calc(var(--dot) * ${w})`;
  c.style.height = `calc(var(--dot) * ${h})`;
  return c;
};

/**
 * Returns { show(achievement) } for popups over `screen` (the game's canvas, its pixels `screen.width` across),
 * in a layer added to `host` that covers the game's screen, so they come in from its edge.
 */
export function createUnlockPopup(host, screen) {
  const layer = document.createElement('div');
  layer.className = 'unlock-layer';
  const said = document.createElement('p');
  said.className = 'unlock-said';
  said.setAttribute('role', 'status');
  host.append(layer, said);
  let queue = Promise.resolve();

  // the layer over the game's screen, and the popup's pixel: half the game's, on whole device pixels
  function place() {
    const r = screen.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    Object.assign(layer.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    const dot = Math.max(2, Math.round(r.width / screen.width / 2 * dpr) / dpr);
    layer.style.setProperty('--dot', `${dot}px`);
    return dot;
  }

  async function run(a) {
    const line = text(a), w = boxWidth(line), look = LOOKS[isDark() ? 'dark' : 'light'];
    const el = document.createElement('div');
    el.className = 'unlock';
    el.style.setProperty('--w', w);
    el.style.setProperty('--box', look.box);
    el.innerHTML = '<div class="unlock-box"><span class="unlock-shine"></span></div>';
    const box = el.firstChild;
    const cup = canvasOf('unlock-trophy', TROPHY_W, TROPHY_H), words = canvasOf('unlock-text', CELL_W * line.length, CELL_H);
    drawTrophy(cup.getContext('2d'));
    drawText(words.getContext('2d'), line, 0, 0, look.ink);
    // the title in its own strip after the trophy, clipped there as it comes in, as RetroArch's scissor does
    const strip = document.createElement('div');
    strip.className = 'unlock-strip';
    strip.append(words);
    box.append(strip, cup);
    const dot = place();
    addEventListener('resize', place);
    layer.append(el);
    said.textContent = `Achievement unlocked: ${a.title}, ${a.points} points`;

    const at = ms => ms / SHOWN, timing = { duration: SHOWN, fill: 'both' };
    if (still.matches) {
      await el.animate([{ opacity: 0 }, { opacity: 1, offset: at(200) }, { opacity: 1, offset: at(SHOWN - 300) }, { opacity: 0 }], timing).finished;
    } else {
      // slide_v, then unfold with slide_h, the hold, fold with slide_h, and slide_v back: folded, the box shows only
      // the trophy's square, kept at the right; unfolding, the title comes from half its width to the left
      const folded = (w - TEXT_X) * dot, up = -(MARGIN + H) * dot, half = -CELL_W * line.length * dot / 2;
      const steps = [0, MOVE, 2 * MOVE, 2 * MOVE + HOLD, 3 * MOVE + HOLD, SHOWN];
      const frames = values => values.map((v, k) => ({ ...v, offset: at(steps[k]), easing: OUT_QUAD }));
      await Promise.all([
        el.animate(frames([
          { transform: `translate(${folded}px, ${up}px)` }, { transform: `translate(${folded}px, 0)` }, { transform: 'none' },
          { transform: 'none' }, { transform: `translate(${folded}px, 0)` }, { transform: `translate(${folded}px, ${up}px)` },
        ]), timing).finished,
        box.animate(frames([
          { clipPath: `inset(0 ${folded}px 0 0)` }, { clipPath: `inset(0 ${folded}px 0 0)` }, { clipPath: 'inset(0)' },
          { clipPath: 'inset(0)' }, { clipPath: `inset(0 ${folded}px 0 0)` }, { clipPath: `inset(0 ${folded}px 0 0)` },
        ]), timing).finished,
        words.animate(frames([
          { transform: `translateX(${half}px)` }, { transform: `translateX(${half}px)` }, { transform: 'none' },
          { transform: 'none' }, { transform: `translateX(${half}px)` }, { transform: `translateX(${half}px)` },
        ]), timing).finished,
        box.firstChild.animate([
          { transform: 'translateX(-100%)' },
          { transform: 'translateX(-100%)', offset: at(2 * MOVE + 150), easing: 'cubic-bezier(.4, 0, .2, 1)' },
          { transform: `translateX(${w * dot}px)`, offset: at(2 * MOVE + 950) },
          { transform: `translateX(${w * dot}px)` },
        ], timing).finished,
      ]);
    }
    removeEventListener('resize', place);
    el.remove();
  }

  return {
    show(a) { queue = queue.then(() => run(a)).catch(err => console.warn('Unlock popup:', err)); },
  };
}
