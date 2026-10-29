// The unlock popup, as Palmaris draws it (its docs/POPUP.md): one line, 16 of
// the game's pixels tall, a 12×10 gold trophy 4 pixels from the left and 3 from the top, then "Title (points)" in
// its 5×7 font from x 20, with 4 pixels after the last letter. It is drawn at the game's own pixel size, centred
// 8 pixels above the bottom of the game's screen, in Palmaris's near-black and #EEEEEE when the look is dark and
// the other way round when it is light, the trophy gold in both. It grows out of the trophy, a light sweeps over
// it, and after 5.3 s, as long as Palmaris keeps one up, it folds back into the trophy and goes. Unlocks that come
// while one is up wait their turn.

import { font, trophy, GLYPH_W, CELL_W, CELL_H, TROPHY_W, TROPHY_H } from './pixels.js';
import { isDark } from '../ui/theme.js';

const H = 16, TROPHY_X = 4, TROPHY_Y = 3, TEXT_X = 20, TEXT_Y = 4, PAD = 3, MARGIN = 8;
const SHOWN = 5300;
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
 * added to `host`.
 */
export function createUnlockPopup(host, screen) {
  const said = document.createElement('p');
  said.className = 'unlock-said';
  said.setAttribute('role', 'status');
  host.append(said);
  let queue = Promise.resolve();

  function place(el, w) {
    const r = screen.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    const dot = r.width / screen.width, snap = v => Math.round(v * dpr) / dpr;
    el.style.setProperty('--dot', `${dot}px`);
    el.style.left = `${snap(r.left + (r.width - w * dot) / 2)}px`;
    el.style.top = `${snap(r.bottom - (H + MARGIN) * dot)}px`;
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
    box.append(words, cup);
    let dot = place(el, w);
    const follow = () => { dot = place(el, w); };
    addEventListener('resize', follow);
    host.append(el);
    said.textContent = `Achievement unlocked: ${a.title}, ${a.points} points`;

    const at = ms => ms / SHOWN, timing = { duration: SHOWN, fill: 'both' };
    if (still.matches) {
      await el.animate([{ opacity: 0 }, { opacity: 1, offset: at(200) }, { opacity: 1, offset: at(SHOWN - 300) }, { opacity: 0 }], timing).finished;
    } else {
      // the box opens from the trophy's square to its whole width, and closes back into it
      const shut = `inset(0 ${(w - TEXT_X) * dot}px 0 0)`, open = 'inset(0 0 0 0)';
      const out = 'cubic-bezier(.2, .9, .25, 1)', back = 'cubic-bezier(.55, 0, .75, .2)';
      const lift = MARGIN * dot;
      await Promise.all([
        el.animate([
          { opacity: 0, transform: `translateY(${lift}px) scale(.82)`, easing: 'cubic-bezier(.25, 1.5, .5, 1)' },
          { opacity: 1, transform: 'none', offset: at(420) },
          { opacity: 1, transform: 'none', offset: at(5000), easing: back },
          { opacity: 0, transform: `translateY(${lift / 2}px) scale(.9)` },
        ], timing).finished,
        box.animate([
          { clipPath: shut },
          { clipPath: shut, offset: at(320), easing: out },
          { clipPath: open, offset: at(820) },
          { clipPath: open, offset: at(4650), easing: 'cubic-bezier(.6, 0, .4, 1)' },
          { clipPath: shut, offset: at(5000) },
          { clipPath: shut },
        ], timing).finished,
        cup.animate([
          { transform: 'scale(0) rotate(-25deg)', easing: 'cubic-bezier(.3, 1.6, .5, 1)' },
          { transform: 'scale(0) rotate(-25deg)', offset: at(120) },
          { transform: 'scale(1.3) rotate(8deg)', offset: at(460), easing: 'ease-in-out' },
          { transform: 'none', offset: at(700) },
          { transform: 'none', offset: at(4900), easing: back },
          { transform: 'scale(.4)' },
        ], timing).finished,
        words.animate([
          { opacity: 0, transform: `translateX(${-CELL_W * dot}px)` },
          { opacity: 0, transform: `translateX(${-CELL_W * dot}px)`, offset: at(430), easing: out },
          { opacity: 1, transform: 'none', offset: at(900) },
          { opacity: 1, transform: 'none', offset: at(4600) },
          { opacity: 0, offset: at(4850) },
          { opacity: 0 },
        ], timing).finished,
        box.firstChild.animate([
          { transform: 'translateX(-100%)' },
          { transform: 'translateX(-100%)', offset: at(850), easing: 'cubic-bezier(.4, 0, .2, 1)' },
          { transform: `translateX(${w * dot}px)`, offset: at(1650) },
          { transform: `translateX(${w * dot}px)` },
        ], timing).finished,
      ]);
    }
    removeEventListener('resize', follow);
    el.remove();
  }

  return {
    show(a) { queue = queue.then(() => run(a)).catch(err => console.warn('Unlock popup:', err)); },
  };
}
