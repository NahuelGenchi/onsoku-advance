// The title card (SAT-R decompilation, src/game/sa1/stage/stage_ui_z.c: sub_80550F8, Task_8055458 and the six
// tasks it makes), as it plays on the first act of a zone in single player. Six pieces slide in over the act
// while the screen fades in from black, hold, and slide out: the zigzag band down the left, the character's
// name on it, the white bar along the bottom, the zone's name scrolling across the bar, its Japanese name above
// and the act number below. Each piece is a row of sprites, all at background priority 0 in front of
// everything; while the screen is still fading they are semi-transparent, which keeps them out of the fade.
// On a zone's second act, the first time round, the white bar starts as the band the first act's results left at
// the top of the screen, and drops to its place. The main task counts the frames from the first it runs. On its
// 226th it ends, with the pieces, and the HUD takes their place a frame later. A press of A, B or the pad from its 36th frame to its 214th skips to its
// 215th, which starts the pieces sliding out and finishes the fade in ten more steps.

const s16 = v => (v << 16) >> 16;
const div = (a, b) => Math.trunc(a / b);   // the BIOS's Div rounds toward zero

export const CARD_SKIP_FROM = 35, CARD_SKIP_TO = 215, CARD_FRAMES = 225;
const FADE_FULL = 0x2000, FADE_SPEED = 96;

// The fade (sub_805423C, and sub_80543A4 on the frames that only hold it): window 0 over the whole screen with
// the brightness decrease on every layer, by (32 - level / 256) / 2 sixteenths, then the level rises by `speed`.
// Returns true once the level has reached full brightness.
function fadeStep(fade, advance) {
  fade.bldY = Math.min(32, 32 - (fade.level >> 8)) >> 1;
  if (!advance) return false;
  fade.level = s16(fade.level + fade.speed);
  if (fade.level < FADE_FULL) return false;
  fade.level = FADE_FULL;
  return true;
}

// A piece (Strc_Ui_24): `x`, `y` and `count` are qUnkA, unkC and unkE; `order` is its OAM order, `slot` its
// graphics, `rows` and `grid` the zigzag's five rows of three, and `mark` where the zone's name starts scrolling.
function piece(slot, x, y, count, order, extra = {}) {
  return { slot, x, y, count, order, rows: 1, grid: false, mark: 0, ...extra };
}

/**
 * The card as sub_80550F8 makes it. `gfx` is the extractor's titleCard: each slot's sprite shape, size, width
 * and height, and the pieces' glyph strings. `fromResults` is set on a zone's second act until its card has once
 * ended (gFinalBossActive is not the level yet). A `blank` card (its unk27, which Secret Base act 1's
 * spotlights set) leaves the screen's brightness alone after it is made, and its pieces stay semi-transparent.
 */
export function createTitleCard(gfx, { fromResults = false, blank = false } = {}) {
  const card = {
    frame: 0,     // unk24
    done: true,   // unk26: the fade's last result, true until its first step
    blank,
    fade: { level: 0, speed: FADE_SPEED, bldY: 0 },
    pieces: {
      zigzag: piece('zigzag', -80, 0, 3, 3, { rows: 5, grid: true }),
      name: piece('name', 20, 0, 1, 2),
      act: piece('act', 180, 160, 6, 0),
      bar: fromResults ? piece('bar', -16, 42, 8, 1, { drops: true }) : piece('bar', 240, 126, 8, 1),
      zoneJp: piece('zoneJp', 360, 114, 4, 0),
      zone: piece('zone', 256, 128, 9, 0),
    },
    sprites: [],   // this frame's OAM entries: { slot, glyph, a0, a1, order }
    gfx,
  };
  fadeStep(card.fade, true);   // once as it is made, its result unused
  return card;
}

// sub_8052F78 (semi-transparent) and sub_80530CC (normal): `count` sprites from `text` in a row from (x, y),
// or the zigzag's grid of `rows` rows, each starting at the column that's on screen, as OAM attributes. Each
// also keeps where it is before OAM wraps it, which only the widescreen view needs: its x, and its y as the 9-bit
// signed number the pieces work with (the name drops in from y 422 and up, that is from above the screen).
function put(card, p, [text, y = p.y], semi) {
  const { shape, size, w, h } = card.gfx.slots[p.slot];
  let a0 = (shape << 14) + (y & 0xFF) + (semi ? 0x400 : 0), top = (y << 23) >> 23;
  const emit = (a1, i, x) => card.sprites.push({ slot: p.slot, glyph: text[i], a0: a0 & 0xFFFF, a1: a1 & 0xFFFF, x, y: top, order: p.order });
  if (!p.grid) {
    let a1 = (size << 14) + (p.x & 0x1FF);
    for (let i = 0; i < p.count; i++, a1 += w) emit(a1, i, p.x + w * i);
    return;
  }
  for (let r = 0; r < p.rows; r++, a0 += h, top += h) {
    let a1 = (size << 14) + (p.x & 0x1FF), x = p.x;
    for (let i = (-p.x & 0x1FF) >> 7; i < p.count; i++, a1 += w, x += w) emit(a1, i, x);
  }
}

// each piece's task, run after the main task with its frame count `k`; each returns what it draws, as
// [text, y] with y its own by default
const TASKS = {
  // Task_8055730: in from the left 8 px a frame, and out the same way
  zigzag(p, k) {
    if (k > 215) p.x = s16(p.x - 8);
    else if (k > 10) p.x = 0;
    else if (k > 0) p.x = s16(p.x + 8);
    return [[p.text]];
  },
  // Task_8055798 (ported from its asm): four sprites down the zigzag, dropping in from the top from the 27th
  // frame and showing from the 33rd; out upward, each drawn while its top is below -32
  name(p, k) {
    const draws = [];
    if (k > 215) {
      const q = s16(div((k - 215) << 7, 10));
      for (let i = 0; i < 4; i++) {
        p.y = s16(-q + 32 * i);
        if (p.y >= -32) draws.push([p.text.slice(i), p.y]);
      }
    } else if (k > 31) {
      for (let i = 0; i < 4; i++) { p.y = 32 * i; draws.push([p.text.slice(i), p.y]); }
    } else if (k > 25) {
      const y = (div((k - 215) << 7, 6) - 176) & 0x1FF;
      if (y > 421) for (let i = 0; i < 4; i++) { p.y = s16(y + 32 * i); draws.push([p.text.slice(i), p.y]); }
    }
    return draws;
  },
  // Task_8055904: up from the bottom 3 px a frame to y 144, and back down 2 px a frame
  act(p, k) {
    if (k > 215) { if (p.y < 160) p.y = s16(p.y + 2); }
    else if (k > 35) { p.x = 180; p.y = 144; p.count = 6; }
    else if (k > 30) { if (p.y > 144) p.y = s16(p.y - 3); }
    return [[p.text]];
  },
  // Task_8055998: in from the right 26 px a frame to x -16 (or down from the top 9 px a frame to y 126), and
  // out to the left, a sprite fewer every 32 px
  bar(p, k) {
    if (k > 215) {
      if (p.x < -32) { p.x = s16(p.x + 32); if (p.count !== 0) p.count = s16(p.count - 1); }
      p.x = s16(p.x - 26);
    } else if (k > 25) p.x = -16;
    else if (k > 15 && p.drops) { p.x = -16; p.y = Math.min(126, s16(p.y + 9)); }
    else if (k > 15) { p.y = 126; p.x = s16(p.x - 26); if (p.x < -16) p.x = -16; }
    return [[p.text]];
  },
  // Task_8055AA0: in from the right 26 px a frame to x 112, and out to the left
  zoneJp(p, k) {
    if (k > 215) p.x = s16(p.x - 26);
    else if (k > 25) p.x = 112;
    else if (k > 15) { p.x = s16(p.x - 26); if (p.x < 112) p.x = 112; }
    return [[p.text]];
  },
  // Task_8055B18: in from the right 28 px a frame, then scrolling left 2 px a frame, a glyph on every 32 px;
  // out to the left 28 px a frame, a sprite fewer every 32 px
  zone(p, k) {
    const at = () => [p.text.slice(p.mark)];
    const wrap = () => { p.mark = (p.mark + 1) % 7; };
    if (k > 215) {
      const old = p.x;
      p.x = s16(p.x - 28);
      if (p.x < -31) { p.count = s16(p.count - 1); p.x = s16(old + 4); wrap(); }
      return [at()];
    }
    if (k > 25) {
      const old = p.x;
      p.x = s16(old - 2); p.count = 9;
      if (p.x < -31) { p.x = s16(old + 30); wrap(); }
      return [at()];
    }
    if (k > 15) {
      p.y = 128;
      const old = p.x;
      p.x = s16(p.x - 28);
      if (p.x < 240) {
        p.count = 9 - (p.x >> 5);
        if (p.x < -31) { p.x = s16(old + 4); wrap(); }
        return [at()];
      }
    }
    return [];
  },
};

/**
 * Runs the card's main task and then its pieces' for one frame. `pressed` is A, B or a pad direction pressed
 * this frame. Returns false on the frame it ends, with nothing drawn.
 */
export function runTitleCard(card, pressed) {
  const { fade } = card;
  if (pressed && card.frame > CARD_SKIP_FROM && card.frame < CARD_SKIP_TO) {
    card.frame = CARD_SKIP_TO;
    fade.speed = div(FADE_FULL - fade.level, 10);
    if (!card.blank) card.done = fadeStep(fade, true);
  }
  const k = card.frame, done = card.done;   // what the pieces see this frame
  if (!card.blank && (k <= 105 || !card.done)) {
    if (k > 20) card.done = fadeStep(fade, true);
    else fadeStep(fade, false);
  }
  card.sprites = [];
  if (++card.frame > CARD_FRAMES) return false;
  const semi = k <= 105 || !done || card.blank;
  for (const [name, p] of Object.entries(card.pieces)) {
    p.text ??= card.gfx.text[name];
    for (const draw of TASKS[name](p, k)) put(card, p, draw, semi);
  }
  return true;
}
