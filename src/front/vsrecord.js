// The VS record (SAT-R decompilation, src/game/sa1/ui/vs_record.c: CreateVsRecord and its two tasks), from the
// player data menu's VS RECORD. It fades in from black over 32 frames to its own song. At the top, over a frame,
// are the player's name and their own multiplayer wins, losses and draws; under it a list of the ten players
// they have met, by most wins, each with the wins, losses and draws against them. Up and Down, held, scroll the
// list a pixel a frame, nine rows in view at a time, and arrows show which way it goes on. B, once the fade is
// three quarters in, turns it round, and when it is three quarters dark again the player data menu starts.
//
// The list is a layer of its own (layer 1) under the frame (layer 0), and its rows are sprites behind the frame,
// so they scroll out under it.

import { createSprite, updateSprite, displaySprite } from '../gba/sprite.js';
import { KEY } from '../gba/engine.js';
import { SONG } from '../sound/songs.js';
import { createUiTask, uiGfxStackInit, uiGraphics, loadUiGfx, drawUiGlyphs, createFade, fadeStep } from './ui.js';
import { createPlayerDataMenu, NAME_LENGTH, LOWERCASE, LOWERCASE_COUNT } from './playerdata.js';

const OBJ_VRAM = 0x10000;
const ANIM_ARROW = 745, ANIM_COVER = 872;
const ASCII_GFX = 0, NAME_BOX_GFX = 60;
// the frame (layer 0) and the list (layer 1), each Japanese then English: colours, tiles and map, one after the
// other from offsets.vsRecordBackgrounds
const picture = (at, tilesSize, layoutSize) => ({ palette: at, tiles: at + 0x20, tilesSize, layout: at + 0x20 + tilesSize, layoutSize });
const FRAMES = [picture(0, 0x7C0, 0x500), picture(0xCE0, 0x940, 0x500)];
const LISTS = [picture(0x1B40, 0x620, 0x580), picture(0x2700, 0x600, 0x580)];
const RECORDS = 10, RECORD_SIZE = 16, ROWS = 9;
// a record: the player's id (4 bytes), their name (8), wins (0xFF for no player), losses and draws, and a byte
// that stays where it is when records swap
const NAME = 4, WINS = 12, LOSSES = 13, DRAWS = 14;
const NO_PLAYER = 0xFF;
const SCROLL_END = 0x4200;   // how far the list scrolls, in 8.8 pixels
const COVER = 0x8A;   // a glyph past the font's characters, which covers the plural's S
const DIGIT = 0x30;

/**
 * CreateVsRecord. `ctx` has the engine, the sprite tables, the save and the ROM's offsets (`uiGraphics` and
 * `vsRecordBackgrounds`).
 */
export function createVsRecord(ctx) {
  const e = ctx.engine, { save } = ctx;
  createUiTask(e);
  e.dispCnt = 0x1340;
  e.stopSong(SONG.PLAYER_DATA);
  e.playSong(SONG.VS_RECORD);
  e.bgCnt[0] = 0x1F00;
  e.bgCnt[1] = 0x1E07;
  e.bgScroll.fill(0, 0, 4);
  loadGraphics(ctx);

  const fade = createFade(0, 1, 2, 0, 0x100, 8);
  const screen = { ctx, fade, frame: 0, scroll: 0 };   // unk40, unk44
  e.createTask(scrollList, screen, 0x2000, 0, () => {});
  const list = {
    ctx, frame: 0, scroll: 0,   // unkE8, unkEC
    text: { unk8: 0, unkA: 0, unkC: 0, unkE: 0, unk10: 2, unk12: 2, unk16: 1 },
    cover: sprite(ANIM_COVER, 0x17080),
    records: save.multiplayerScores.slice(),
  };
  screen.list = e.createTask(drawRecords, list, 0x2030);
  updateSprite(e, ctx.sprites, list.cover);
  screen.arrow = sprite(ANIM_ARROW, 0x16400);
  updateSprite(e, ctx.sprites, screen.arrow);

  // the records by wins, most first, as signed bytes (so no player last); a swap leaves each record's last byte
  const wins = i => (list.records[i * RECORD_SIZE + WINS] << 24) >> 24;
  for (let i = 0; i < RECORDS - 1; i++) {
    for (let j = i + 1; j < RECORDS; j++) if (wins(i) < wins(j)) swapRecords(list.records, i, j);
  }
  fadeStep(e, fade);
  e.playSong(SONG.VS_RECORD);
}

// a sprite of the screen, from fixed sprite tiles, in front of the others
const sprite = (anim, dest) => createSprite({ graphics: { src: 0, dest, size: 0, anim }, prevVariant: 0xFF, animSpeed: 0x10, oamFlags: 0 });

// SwapRecords: all but the last byte
function swapRecords(records, i, j) {
  for (let k = 0; k < RECORD_SIZE - 1; k++) {
    const a = i * RECORD_SIZE + k, b = j * RECORD_SIZE + k;
    [records[a], records[b]] = [records[b], records[a]];
  }
}

// sub_806012C: the frame and the list by language, their tiles from their blocks' first and their colours in
// palette rows 0 and 1; the font's glyphs at the start of sprite VRAM, in sprite palette row 2, for slot 2; then the
// name box's colours over them, its slot 3 starting at the same tile. The layers' slots are left as the stack held
// them.
function loadGraphics(ctx) {
  const e = ctx.engine, { offsets } = ctx, lang = ctx.save.uiLanguage, at = offsets.vsRecordBackgrounds;
  uiGfxStackInit(e);
  [FRAMES, LISTS].forEach((pictures, layer) => {
    const p = pictures[lang];
    loadUiGfx(e, {
      uiGfxID: 128, unk2B: layer, unk28: layer, unk29: layer, unk2A: 0x15,
      tiles: at + p.tiles, tilesSize: p.tilesSize, palette: at + p.palette, paletteSize: 0x20,
      layout: at + p.layout, layoutSize: p.layoutSize,
    });
  });
  const font = uiGraphics(e.rom, offsets.uiGraphics, ASCII_GFX);
  loadUiGfx(e, {
    uiGfxID: ASCII_GFX, unk2B: 2, unk0: font.unk0, unk28: 2, unk2A: 0xD, vramC: OBJ_VRAM,
    tiles: font.tiles, tilesSize: 0x1B80, palette: font.palette, paletteSize: 0x20,
  });
  const box = uiGraphics(e.rom, offsets.uiGraphics, NAME_BOX_GFX);
  loadUiGfx(e, {
    uiGfxID: NAME_BOX_GFX, unk2B: 3, unk0: box.unk0, unk28: 2, unk2A: 0xC, vramC: OBJ_VRAM,
    tiles: box.tiles, tilesSize: 0x20, palette: box.palette, paletteSize: 0x20,
  });
}

// Task_VsRecordInit: Up and Down, held, scroll the list; the fade; B once it is three quarters in turns it round,
// and three quarters out the screen ends. The arrows, above and below the list, while it can go that way.
function scrollList(t) {
  const screen = t.data, e = screen.ctx.engine, fade = screen.fade, list = screen.list.data;
  let scroll = screen.scroll;
  const frame = screen.frame + 1;
  if (scroll !== 0 && e.input & KEY.UP) {
    const next = (scroll - 0x100) >>> 0;
    scroll = next >>> 8 ? next : 0;
  } else if ((scroll >>> 0) < SCROLL_END && e.input & KEY.DOWN) {
    const next = (scroll + 0x100) >>> 0;
    scroll = (next >>> 8) < SCROLL_END ? next : SCROLL_END;
  }
  screen.frame = list.frame = frame;
  screen.scroll = list.scroll = scroll;
  fadeStep(e, fade);
  if (fade.unk6 > 0x1800) {
    if (e.pressed & KEY.B && fade.unk4 !== 1) {
      e.playSong(SONG.RETURN);
      fade.unk4 = 1;
      fade.unk6 = (0x2000 - (fade.unk6 & 0xFFFF)) << 16 >> 16;
      e.playSong(SONG.RETURN);
    }
    if (fade.unk6 > 0x1800 && fade.unk4 === 1) {
      e.stopSong(SONG.VS_RECORD);
      e.destroyTask(screen.list);
      e.destroyTask(t);
      // layers 1 and 2's maps cleared in the next V-blank
      for (const fill of [e.mapFill[1], e.mapFill[2]]) { fill.value = 0; fill.rect.set([0, 0, 0xFF, 0x20]); }
      createPlayerDataMenu(screen.ctx);
      return;
    }
  }
  const s = screen.arrow, { ctx } = screen;
  updateSprite(e, ctx.sprites, s);
  s.x = 233;
  if (scroll !== 0) {
    s.y = 70;
    s.frameFlags &= ~0x800;
    displaySprite(e, ctx.sprites, s);
  }
  if (scroll !== SCROLL_END) {
    s.y = 138;
    s.frameFlags |= 0x800;
    displaySprite(e, ctx.sprites, s);
  }
}

// a count as two glyphs: a space and the digit under 10, else its tens and units
const twoDigits = n => (n > 9 ? [Math.trunc(n / 10) + DIGIT, (n % 10) + DIGIT] : [0x20, n + DIGIT]);

// Task_8060874: the list's layer scrolled; the player's name and own wins, losses and draws (a count under 2 with
// the cover over the plural's S, and in English a sprite over LOSSES' ES); then the rows in view
function drawRecords(t) {
  const list = t.data, { ctx } = list, e = ctx.engine, { save } = ctx, o = list.text, lang = save.uiLanguage;
  const scroll = list.scroll >>> 0;
  e.bgScroll[3] = ((scroll >>> 8) - 0x30) & 0x1FF;
  const draw = (chars, behind = false) => drawUiGlyphs(e, i => chars[i], o, behind);
  const lower = c => ((c - LOWERCASE) & 0xFF) < LOWERCASE_COUNT;
  const name = save.playerName;
  o.unkE = 1;
  for (let i = 0; i < NAME_LENGTH; i++) {
    o.unkA = i * 8 + 0x1B;
    o.unkC = lower(name[i]) ? 40 : 32;
    draw([name[i]]);
  }
  o.unkC = 32;
  // a count: two digits from x2, or one from x1, covered at `cover` when under 2 (`sprite` drawn first)
  const count = (n, x2, x1, cover, sprite = false) => {
    if (n > 9) {
      o.unkE = 2;
      o.unkA = x2;
      draw(twoDigits(n));
      return;
    }
    o.unkE = 1;
    o.unkA = x1;
    if (n < 2 && cover !== null) {
      if (sprite) {
        const s = list.cover;
        s.x = 152;
        s.y = 32;
        s.frameFlags &= ~0x800;
        displaySprite(e, ctx.sprites, s);
      }
      draw([n + DIGIT]);
      o.unkA = cover;
      draw([COVER]);
    } else draw([n + DIGIT]);
  };
  count(save.unk425, lang ? 0x5B : 0x59, lang ? 0x63 : 0x61, 0x7E);
  count(save.unk426, lang ? 0x88 : 0x89, lang ? 0x90 : 0x91, lang ? 0xB1 : null, true);
  count(save.unk427, 0xB9, 0xC1, 0xE2);

  const first = scroll >>> 12, fine = (scroll >>> 8) & 0xF;
  for (let i = 0; i < ROWS; i++) {
    const v = (i + first) & 0xFF;
    if (v > RECORDS - 1) continue;
    const rec = list.records.subarray(v * RECORD_SIZE, (v + 1) * RECORD_SIZE);
    const y = (i * 16 - (fine - 0x38)) & 0xFFFF;
    o.unkE = 1;
    for (let j = 0; j < NAME_LENGTH; j++) {
      o.unkA = j * 8 + 0x3C;
      o.unkC = lower(rec[NAME + j]) ? (y + 8) & 0xFFFF : y;
      draw([rec[NAME + j]], true);
    }
    o.unkC = y;
    o.unkA = 0x80;
    o.unkE = 2;
    draw(rec[WINS] === NO_PLAYER ? [0x20, DIGIT] : twoDigits(rec[WINS]), true);
    o.unkA = 0xA0;
    draw(twoDigits(rec[LOSSES]), true);
    o.unkA = 0xC0;
    draw(twoDigits(rec[DRAWS]), true);
  }
}
