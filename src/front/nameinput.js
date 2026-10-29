// The name input (SAT-R decompilation, src/game/sa1/ui/player_name_input_menu.c: CreatePlayerNameInputMenu,
// sub_8058830 and Task_80595DC, ported from their assembly), from the player data menu's NAME. Over a picture
// (layer 2), a grid of characters (layer 1) eight rows of ten, six in view, with the name in a bar above it. It
// fades in from black over 32 frames to the player data's song, which goes on.
//
// The d-pad moves a pulsing cursor over the grid, wrapping round its columns and, past its top or bottom row,
// round its rows. A held direction repeats from its 16th frame, every 5 after that. The cell under the cursor is
// lit, but not on a frame a key is pressed or with six characters in the name. A adds the character to the name
// where its cursor (a bobbing mark under the bar) is, and moves that on; B takes out the character before it. L
// and R, and A on the grid's ← and →, move it. Start, or a sixth character, takes the grid's cursor to END; A on
// END with a name that isn't blank fades out over 32 frames, and 61 frames after END the name goes into the save,
// which is written if it changed, and the player data menu starts. The grid's characters glow, dimming and
// brightening every 47 frames.
//
// The name is kept as the bar's tiles, two rows of two a character, which go into layer 1's map every frame, in
// the rows above the grid that the scroll has taken out of view. The original goes to the multiplayer menu
// instead of the player data menu when the game is in its mode 2, which only the multiplayer menu sets; that menu
// isn't built.

import { KEY } from '../gba/engine.js';
import { SONG } from '../sound/songs.js';
import { WRITE_FRAMES } from '../engine/save.js';
import { SINE } from '../engine/trig.js';
import { createUiTask, uiGfxStackInit, uiGraphics, loadUiGfx, drawUiGlyphs, drawUiTextRotated, createFade, fadeStep } from './ui.js';
import { createPlayerDataMenu, NAME_LENGTH } from './playerdata.js';

const OBJ_VRAM = 0x10000;
const PICTURE_GFX = 0x23, GRID_GFX = 0x24, GLOW_GFX = 0x25, CURSORS_GFX = 0x26;
// from offsets.nameInputMaps: the picture's map, the grid's and the grid with its cells lit
const PICTURE_MAP = 0, GRID_MAP = 0x1000, LIT_MAP = 0x1800;
// from offsets.nameInputChars: the characters by grid cell, each character's tile from ' ', and the cursors'
// one-glyph strings
const TILES = 0x4E, GRID_CURSOR = 0x124, NAME_CURSOR = 0x128;
const COLUMNS = 10, ROWS_IN_VIEW = 6, LAST_TOP = 2;
// a cell's code, (row × 20 + column) × 2: its character's first tile from the grid's first; the bottom row's ←, →
// and END do what they say
const MOVE_LEFT = 0x126, MOVE_RIGHT = 0x128, END = 0x12A;
// a character's four tiles in the bar (palette row 2), from its code; a blank one's
const TOP_LEFT = 0x2001, TOP_RIGHT = 0x2002, BOTTOM_LEFT = 0x2015, BOTTOM_RIGHT = 0x2016;
const BLANK = [0x20DB, 0x20DC, 0x20EF, 0x20F0];
const REPEAT = 0xF, REPEAT_BACK = 5;
const s16 = v => (v << 16) >> 16;
const div = (a, b) => Math.trunc(a / b);

/**
 * CreatePlayerNameInputMenu. `ctx` has the engine, the save and the ROM's offsets (`uiGraphics`, `nameInputMaps`
 * and `nameInputChars`).
 */
export function createNameInput(ctx) {
  const e = ctx.engine, { save, offsets } = ctx;
  e.bgCnt[1] = 0x1C06;
  e.bgCnt[2] = 0x1A09;
  e.bgScroll.fill(0, 2, 6);
  e.dispCnt = 0x3640;
  e.bldCnt = 0x1F;
  e.winRegs[0] = 1;
  e.winRegs[2] = 1;
  createUiTask(e);
  const input = {
    ctx,
    column: 0, row: 0, top: 0,   // unk24, unk28 (the row in view) and unk54 (the first row in view)
    pulse: 0, glow: 0, frames: 0,   // unk2C, unk30 and unkFC
    // how long Right, Left, Down and Up have been held (unk58, unk5C, unk60 and unk64); the original leaves them
    // as its memory held them, which only counts for a direction held as the screen opens
    held: { [KEY.RIGHT]: 0, [KEY.LEFT]: 0, [KEY.DOWN]: 0, [KEY.UP]: 0 },
    // the cursors' glyphs (unk0, a Strc_8052C84 that is also drawn as a GameOverB)
    o: { unk0: 0, unk2: 0, unk4: 0, unk6: 0, unk8: 0, unkA: 0x1E, unkC: 0x1E, unkE: 1, unk10: 3, unk12: 0, unk16: 1 },
    fade: createFade(0, 1, 2, 0, 0x100, 1),
    colours: new Uint16Array(16),   // unk34
    // the bar's two rows of tiles (unkC8 and unkE0) and the cursor in the name (unkF8)
    bar: [new Uint16Array(NAME_LENGTH * 2), new Uint16Array(NAME_LENGTH * 2)], length: 0,
    // the copies into layer 1's map (gfx68 to gfxBC)
    gfx: Array.from({ length: 8 }, () => ({ src: 0, dest: 0, size: 0, ram: null })),
  };
  e.createTask(nameLoop, input, 0x2000);

  const chars = offsets.nameInputChars, name = save.playerName;
  for (let i = 0; i < NAME_LENGTH; i++) {
    if (((name[i] - 0x20) & 0xFF) > 0x69) name[i] = 0x20;
    // the table's tiles are 0x1000 on from the grid's codes
    setChar(input, i, e.rom.u16(chars + TILES + (name[i] - 0x20) * 2) + (TOP_LEFT - 0x1000));
  }
  let last = NAME_LENGTH - 1;
  while (last >= 0 && name[last] === 0x20) last--;
  input.length = last + 1;

  uiGfxStackInit(e);
  const maps = offsets.nameInputMaps;
  const picture = uiGraphics(e.rom, offsets.uiGraphics, PICTURE_GFX);
  loadUiGfx(e, {
    uiGfxID: PICTURE_GFX, unk2B: 0, unk0: picture.unk0, unk28: 0, unk29: 2, unk2A: 0x15,
    tiles: picture.tiles, tilesSize: 0x5000, palette: picture.palette, paletteSize: 0x20, layout: maps + PICTURE_MAP, layoutSize: 0x500,
  });
  const grid = uiGraphics(e.rom, offsets.uiGraphics, GRID_GFX);
  loadUiGfx(e, {
    uiGfxID: GRID_GFX, unk2B: 1, unk0: grid.unk0, unk28: 0, unk29: 1, unk2A: 0x15,
    tiles: grid.tiles, tilesSize: 0x2800, palette: grid.palette, paletteSize: 0x20, layout: maps + GRID_MAP, layoutSize: 0x800,
  });
  const glow = uiGraphics(e.rom, offsets.uiGraphics, GLOW_GFX);
  loadUiGfx(e, { uiGfxID: GLOW_GFX, unk2B: 1, unk0: glow.unk0, unk28: 2, unk29: 1, unk2A: 4, palette: glow.palette, paletteSize: 0x20 });
  const cursors = uiGraphics(e.rom, offsets.uiGraphics, CURSORS_GFX);
  loadUiGfx(e, {
    uiGfxID: CURSORS_GFX, unk2B: 3, unk0: cursors.unk0, unk28: 0, unk2A: 0xD, vramC: OBJ_VRAM + 0x2000,
    tiles: cursors.tiles, tilesSize: 0x100, palette: cursors.palette, paletteSize: 0x20,
  });
  fadeStep(e, input.fade);
  e.playSongOrChange(SONG.PLAYER_DATA);
}

// a character of the bar from its first tile
function setChar(input, i, tile) {
  const [top, bottom] = input.bar;
  top[i * 2] = tile;
  top[i * 2 + 1] = tile + (TOP_RIGHT - TOP_LEFT);
  bottom[i * 2] = tile + (BOTTOM_LEFT - TOP_LEFT);
  bottom[i * 2 + 1] = tile + (BOTTOM_RIGHT - TOP_LEFT);
}

// the code of the cell under the grid's cursor
const cellCode = input => (((((input.top + input.row) & 0xFFFF) & 7) * 20 + (input.column & 0xFFFF)) * 2) & 0xFFFF;

// sub_8058830: the keys, the cursors, the glow and the bar
function nameLoop(t) {
  const input = t.data, { ctx } = input, e = ctx.engine, fade = input.fade, o = input.o;
  const chars = ctx.offsets.nameInputChars, maps = ctx.offsets.nameInputMaps;
  let keys = e.pressed;
  input.pulse = s16(input.pulse + 1);
  if (input.pulse > 0x20) input.pulse = 0;
  input.glow = s16(input.glow + 1);
  if (input.glow > 0x2E) input.glow = 0;
  input.frames = s16(input.frames + 1);
  if (input.frames <= 59) fadeStep(e, fade);
  else input.frames = 60;
  for (const k of [KEY.RIGHT, KEY.LEFT, KEY.UP, KEY.DOWN]) input.held[k] = e.input & k ? (input.held[k] + 1) & 0xFFFF : 0;

  const column = input.column, row = input.row, top = input.top;
  // a direction pressed or held long enough, which comes back 5 frames later while held
  const moves = k => {
    if (!(e.pressed & k) && s16(input.held[k]) <= REPEAT) return false;
    e.playSong(SONG.MENU_CURSOR);
    input.held[k] = (input.held[k] - REPEAT_BACK) & 0xFFFF;
    keys |= k;
    return true;
  };
  if (moves(KEY.RIGHT)) {
    if (++input.column > COLUMNS - 1) input.column = 0;
  } else if (moves(KEY.LEFT)) {
    if (--input.column < 0) input.column = COLUMNS - 1;
  }
  if (moves(KEY.DOWN)) {
    if (++input.row > ROWS_IN_VIEW - 1) {
      input.row = ROWS_IN_VIEW - 1;
      if (++input.top > LAST_TOP) input.row = input.top = 0;
    }
  } else if (moves(KEY.UP)) {
    if (--input.row < 0) {
      input.row = 0;
      if (--input.top < 0) {
        input.row = ROWS_IN_VIEW - 1;
        input.top = LAST_TOP;
      }
    }
  }

  // the grid's cursor, swelling and shrinking over 33 frames, through affine parameters 2
  const p = input.pulse;
  o.unk0 = o.unk2 = s16((p <= 15 ? 16 - p : p - 15) * 6 + 0x100);
  o.unkA = s16((((input.column & 0xFFFF) << 4) + 0x20) - (((o.unk0 & 0xFFFF) - 0xF0) >> 7));
  o.unkC = s16((((input.row & 0xFFFF) << 4) + 0x28) - (((o.unk2 & 0xFFFF) - 0xF0) >> 7));
  o.unk4 = 0;
  o.unk6 = 2;
  const gridCursor = e.rom.u8(chars + GRID_CURSOR);
  drawUiTextRotated(e, () => gridCursor, o);

  // a cell's two rows in layer 1's map, from the grid's map or the lit one: the cell where the cursor was put
  // back after a key, and the one under it lit
  const base = (e.bgCnt[1] & 0x1F00) << 3;
  const queue = (g, src, dest, size, ram = null) => {
    Object.assign(g, { src, dest: dest + base, size, ram });
    e.queueGraphics(g);
  };
  const cell = (g, map, c, r, line) => {
    const at = ((c << 2) + line + (r << 7)) & 0x7FF;
    queue(g, maps + map + (at & 0x3FF), at, 4);
  };
  if ((e.prevInput | keys) & 0xF9) {
    cell(input.gfx[2], GRID_MAP, s16(column), s16(row) + s16(top), 0xA);
    cell(input.gfx[3], GRID_MAP, s16(column), s16(row) + s16(top), 0x4A);
  }
  let code = cellCode(input);
  if (e.pressed === 0 && s16(input.length) <= NAME_LENGTH - 1) {
    cell(input.gfx[0], LIT_MAP, s16(input.column), s16(input.row) + s16(input.top), 0xA);
    cell(input.gfx[1], LIT_MAP, s16(input.column), s16(input.row) + s16(input.top), 0x4A);
  }

  if (e.pressed & (KEY.L | KEY.R)) {
    if (e.pressed & KEY.L) {
      if (s16(input.length) !== 0) input.length--;
    } else if (s16(input.length) <= NAME_LENGTH - 2) input.length++;
  }
  if (e.pressed & KEY.A && !(e.pressed & KEY.B)) {
    if (code === MOVE_LEFT) {
      if (s16(input.length) !== 0) input.length--;
    } else if (code === MOVE_RIGHT) {
      if (s16(input.length) <= NAME_LENGTH - 1) input.length++;
    } else if (code === END) {
      if (input.bar[0].some((tile, i) => !(i & 1) && tile !== BLANK[0])) {
        fade.unk6 = 0;
        fade.unk4 = 1;
        input.frames = 0;
        t.main = closeInput;
      }
    } else if (s16(input.length) <= NAME_LENGTH - 1) {
      setChar(input, input.length++, code + TOP_LEFT);
    }
    e.playSong(SONG.SELECT);
  }
  if (e.pressed & KEY.START || (e.pressed & KEY.A && s16(input.length) === NAME_LENGTH)) {
    const t7 = input.top & 7;
    input.column = COLUMNS - 1;
    if (t7 <= 1) {
      input.top = LAST_TOP;
      input.row = ROWS_IN_VIEW - 1;
    } else input.row = 7 - t7;
  }
  if ((e.pressed & (KEY.A | KEY.B)) === KEY.B && s16(input.length) > 0) {
    input.length--;
    const [barTop, barBottom] = input.bar;
    let i = input.length & 0xFFFF;
    for (; i <= NAME_LENGTH - 2; i++) {
      for (const row of [barTop, barBottom]) {
        row[i * 2] = row[i * 2 + 2];
        row[i * 2 + 1] = row[i * 2 + 3];
      }
    }
    [barTop[i * 2], barTop[i * 2 + 1], barBottom[i * 2], barBottom[i * 2 + 1]] = BLANK;
    e.playSong(SONG.RETURN);
  }

  // the glow: the grid's colours (palette row 1) dimmed to between 18 and 31 thirty-seconds
  uiGfxStackInit(e);
  const g = s16(input.glow), d = g <= 0x16 ? 0x17 - g : g - 0x17;
  const k = div(d << 5, 23);
  let level = 31 - (s16(SINE[div((k << 5) >>> 0, 60)]) >> 7);
  if ((level >>> 0) > 31) level = 31;
  const glow = uiGraphics(e.rom, ctx.offsets.uiGraphics, GLOW_GFX);
  for (let i = 0; i < 16; i++) {
    const c = e.rom.u16(glow.palette + i * 2);
    const r = div(level * ((c & 0x7C00) >> 10), 0x20), gr = div(level * ((c & 0x3E0) >> 5), 0x20), b = div(level * (c & 0x1F), 0x20);
    input.colours[i] = ((r << 10) + (gr << 5) + b) & 0xFFFF;
  }
  loadUiGfx(e, { uiGfxID: GLOW_GFX, unk2B: 1, unk0: glow.unk0, unk28: 1, unk29: 1, unk2A: 4, colours: input.colours, paletteSize: 0x20 });

  // the name's cursor, bobbing, unless the name is full or the grid's cursor is on END
  code = cellCode(input);
  if (s16(input.length) <= NAME_LENGTH - 1 && code !== END) {
    o.unkA = ((input.length & 0xFFFF) * 16 + 0x78) & 0xFFFF;
    const q = s16(input.pulse);
    o.unkC = s16(0xD - ((q > 0x10 ? 0x10 - q : q - 0x10) >> 2));
    const nameCursor = e.rom.u8(chars + NAME_CURSOR);
    drawUiGlyphs(e, () => nameCursor, o);
  }

  // the bar into the two rows above the ones in view; when the grid has scrolled, the rows it was in put back
  const barRow = ((s16(input.top) - 2) << 7);
  queue(input.gfx[4], 0, (barRow + 0x1E) & 0x7FF, 0x18, new Uint8Array(input.bar[0].buffer));
  queue(input.gfx[5], 0, (barRow + 0x5E) & 0x7FF, 0x18, new Uint8Array(input.bar[1].buffer));
  if (s16(top) !== s16(input.top)) {
    const below = (s16(top) + 6) << 7, was = (s16(top) - 2) << 7;
    queue(input.gfx[6], maps + GRID_MAP + 0x1E + (below & 0x7FF), (was + 0x1E) & 0x7FF, 0x18);
    queue(input.gfx[7], maps + GRID_MAP + 0x1E + (((s16(input.row) === 0 ? was : below) + 0x40) & 0x7FF), ((s16(top) << 7) - 0xA2) & 0x7FF, 0x18);
  }
  e.bgScroll[3] = (((input.top & 0xFFFF) << 4) - 0x30) & 0x1FF;
}

// Task_80595DC: the fade out; on the 61st frame after END the name into the save from the bar, the save written
// if it changed (with the music stopped and the time it changed as the player's id), and the player data menu
function closeInput(t) {
  const input = t.data, { ctx } = input, e = ctx.engine, { save } = ctx;
  fadeStep(e, input.fade);
  input.frames = s16(input.frames + 1);
  if (input.frames <= 60) return;
  const chars = ctx.offsets.nameInputChars, name = save.playerName;
  let changed = false;
  for (let i = 0; i < NAME_LENGTH; i++) {
    const code = (s16(input.bar[0][i * 2]) - TOP_LEFT) >>> 0;
    const c = e.rom.u8(chars + div(code, 40) * COLUMNS + ((code % 40) >>> 1));
    if (name[i] !== c) {
      changed = true;
      name[i] = c;
    }
  }
  const after = () => {
    e.destroyTask(t);
    // layers 1 and 2's maps cleared in the next V-blank
    for (const fill of [e.mapFill[1], e.mapFill[2]]) { fill.value = 0; fill.rect.set([0, 0, 0xFF, 0x20]); }
    createPlayerDataMenu(ctx);
  };
  if (changed) {
    save.unk4 = e.frameCount;
    e.stopAllSongs();
    if (save.write()) {
      e.stall(WRITE_FRAMES, after);
      return;
    }
  }
  after();
}
