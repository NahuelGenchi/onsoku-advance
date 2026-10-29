// The staff credits and, without all seven Chaos Emeralds, the message after them (SAT-R decompilation,
// src/game/sa1/ui/staff_credits.c and collect_chaos_emeralds_msg.c, checked in the USA ROM).
//   - The credits: the list scrolls up from below, its lines written in sprites, one per letter, between a
//     black band 36 lines tall at the top and one 28 tall at the bottom (the two windows, darkened all the way);
//     the company logos come up among the lines, the last one stopping in the middle with the copyright under
//     it. One task counts the frames, a second writes the lines and a third shows the logos; the count stops
//     at 8334, and from 8520 frames the screen fades to black.
//   - The message: "Hey, go collect all the Chaos Emeralds!" under Eggman holding one, in from black and out to
//     it after 340 frames; then the SEGA logo (`onEnd`).

import { createFade, runFade, plainDisplay, TO_BLACK, FROM_BLACK } from './screenfade.js';
import { makeSprite, startAnim, animate } from './objects.js';

export const STAFF_CREDITS_SONG = 40;   // MUS_STAFF_CREDITS

const I = v => v >>> 8;
const STOP = 8334, FADE_AT = 8520, END_AT = 8550;   // Task_805E698
// the list's scroll, 8.8 px a frame on the even frames: Div(0x143000, 0x201C) + 1
const SPEED = Math.trunc(0x143000 / 0x201C) + 1;
const ROWS = 7;                                      // the lines Task_805E758 looks at
const MESSAGE = 400, MESSAGE_FADE = 340;             // Task_80698F4
const MESSAGE_TEXT = ['emeraldTextJapanese', 'emeraldText'];   // by the save's language

/**
 * The staff credits, from `art` (normalEndingArt's `credits`), then the message unless `emeralds` (all seven
 * collected), in `language` (the save's uiLanguage: 0 Japanese, 1 English), then `onEnd()` on the frame the SEGA
 * logo would come up. `step()` runs one frame; `state` is what the ending's renderer draws: { display, sprites,
 * done }, the letters as sprites with `glyph` [row, code].
 */
export function createStaffCredits(anims, sound, art, { emeralds = false, language = 1, onEnd = () => {} } = {}) {
  const { lines, logoRows } = art;
  // CreateStaffCredits: BG1 (the black tiles) and the sprites, the two windows and their darkening
  const display = {
    ...plainDisplay(), scene: 'credits', scroll: [0],
    win0: [0, 36], win1: [132, 160], winIn: 0x3F3F, winOut: 0x1F, bldCnt: 0x1FDF, bldY: 16,
  };
  const state = { display, sprites: [], done: false };
  const fade = createFade({ mode: TO_BLACK, speed: 0x80, targets: 8 });
  let count = 0x30;             // the main task's unk14
  let shown = 0x30;             // what it gives the other two (unk78)
  let scroll = 0;               // their unk7C
  const logo = makeSprite('logo0', { order: 18, prio: 0 });
  const copyright = makeSprite('copyright', { order: 18, prio: 0 });
  let logoName = 'logo0';
  let message = null;
  sound.play(STAFF_CREDITS_SONG);

  const show = (s, x, y) => { if (s.frame >= 0) state.sprites.push({ frame: s.frame, x, y, order: s.order, prio: s.prio }); };

  // sub_8053370: a line's letters, 8 px apart from `x`; a space only moves on, and the small letters (past
  // 0x60) are their own glyphs, drawn 8 px lower. Each letter has the OAM order of its place in the list
  function write(line, row, x, y) {
    for (let i = 0; i < line.length; i++, x += 8) {
      const c = line.text[i];
      if (c === 32) continue;
      const small = c > 96;
      state.sprites.push({ glyph: [line.palette, small ? c - 17 : c - 32], x, y: ((y & 0xFF) + (small ? 8 : 0)) & 0xFF, order: (row * 16 + i) >> 3, prio: 0 });
    }
  }

  // Task_805E758: the lines in the window, from the list's scroll
  function text() {
    if (!(shown & 1)) scroll = shown * SPEED;
    const top = I(scroll) - 12;
    const moving = (top >>> 0) > 0x8A;
    const first = moving ? (I(scroll) - 0x86) >>> 4 : 0;
    const offset = moving ? (I(scroll) - 0x96) % 16 + 8 : 0;
    const rows = first < 0x139 ? ROWS : (67 - first) & 0xFF;
    let y = 0x24;
    for (let i = 0; i < rows; i++) {
      const line = lines[first + i];
      if (!line.length) { y += 16; continue; }
      const at = ((moving ? line.dy + y - offset : line.dy + 0x8A - top + y) << 16) >> 16;
      if (at >= 0x8B) break;
      write(line, i, 120 - line.length * 4, at);
      y += 16;
    }
  }

  // Task_805E888: the logo whose row of the list is in sight, the last one held in the middle once it is
  // there, with the copyright 40 px under it. The animation only runs while it is shown
  function logos() {
    if (!(shown & 1)) scroll = shown * SPEED;
    const top = I(scroll) - 12;
    if ((top >>> 0) <= 0x9A) return;
    const row = (top - 0x8A) >>> 4, offset = (top - 0x8A - 0x10) % 16 + 4;
    let which = 0xFF, at = 0;
    search: for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 4; j++) if (logoRows[j] === row + i) { which = j; at = i; break search; }
    }
    if (row >= logoRows[3] - 3) { which = 3; at = 0; }
    if (which === 0xFF) return;
    let y = ((24 - offset + at * 16) << 16) >> 16;
    if (y > 0x9A) return;
    if (which > 0) {
      const name = `logo${which}`;
      if (name !== logoName) { logoName = name; startAnim(logo, name, true); }
    }
    if (which === 3) {
      if (y < 80) y = 80;
      animate(copyright, anims);
      show(copyright, 120, y + 40);
    }
    animate(logo, anims);
    show(logo, 120, y);
  }

  // CreateGetAllChaosEmeraldsMessage: BG0's tiles, the text in the save's language and Eggman (two sprites), in
  // from black
  function createMessage() {
    Object.assign(display, plainDisplay(), { scene: 'message' });
    const sprite = (name, x, y) => { const s = makeSprite(name, { order: 18, prio: 2 }); animate(s, anims); return { s, x, y }; };
    message = {
      count: 0,
      fade: createFade({ win1: true, mode: FROM_BLACK, speed: 0x100, targets: 8 }),
      sprites: [sprite(MESSAGE_TEXT[language], 120, 120), sprite('emeraldEggman0', 136, 90), sprite('emeraldEggman1', 136, 90)],
    };
    runFade(message.fade, display);
  }
  // Task_80698F4: the sprites stay on their first frame
  function messageStep() {
    if (++message.count > MESSAGE) {
      state.done = true;
      onEnd();
      return;
    }
    if (message.count === MESSAGE_FADE) { message.fade.level = 0; message.fade.mode = TO_BLACK; }
    runFade(message.fade, display);
    for (const { s, x, y } of message.sprites) show(s, x, y);
  }

  // Task_805E698, then the lines' task (0x6120) and the logos' (0x6200)
  function step() {
    if (state.done) return;
    state.sprites = [];
    if (message) { messageStep(); return; }
    shown = Math.min(count, STOP);
    count++;
    const faded = count > FADE_AT ? runFade(fade, display) : false;
    if (count > END_AT && faded) {
      if (emeralds) { state.done = true; onEnd(); return; }
      createMessage();
      return;
    }
    text();
    logos();
  }
  return { state, step };
}
