// The language screen (CreateEditLanguageScreen and its tasks, as the USA ROM has them; the decompilation's
// European version has a screen for its six languages in their place). A new game, with no save, starts with it,
// and the Options menu's LANGUAGE opens it. It fades in from black over 32 frames: LANGUAGE on an orange band, にほんご
// (Japanese) and ENGLISH in a black box, the cursor beside the save's language, and the buttons along the bottom,
// all of it in the language the cursor is on. Once it has faded in, Up or Down moves the cursor to the other one.
// A (or Start, at power-on) keeps the choice in the save, and B (from the Options menu only) leaves the save as it
// was; either way the screen fades out to black over 32 frames. At power-on the music then stops, the save is
// written (14 frames in which nothing runs) and the SEGA logo starts; from the Options menu, the menu opens again.
//
// A and Start are read from the first frame, before the fade in has ended: pressed then, the screen turns at once to
// fading out, from full brightness. At power-on the screen leaves its sixth sprite (A OK) out, though it loads it.
//
// A ROM without the USA screen's picture (the European one, whose screen is for its six languages) has none: the
// game starts with the logos, and LANGUAGE in the Options menu does nothing.

import { createSprite, updateSprite, displaySprite } from '../gba/sprite.js';
import { KEY } from '../gba/engine.js';
import { SONG } from '../sound/songs.js';
import { WRITE_FRAMES } from '../engine/save.js';
import { createUiTask, uiGfxStackInit, loadUiGfx, createFade, fadeStep } from './ui.js';
import { createSegaLogo } from './logos.js';
import { createOptionsMenu } from './options.js';

// the sprites: by the language (0 Japanese, 1 English) their animation, then their variant, their tiles and where
// they are
const TITLE = { anims: [865, 864], variant: 2, tiles: 26, x: 120, y: 17 };
const JAPANESE = { anims: [866, 866], variant: 10, tiles: 12, x: 141, y: 70 };
const ENGLISH = { anims: [863, 863], variant: 10, tiles: 16, x: 147, y: 98 };
const button = (variant, tiles, x) => ({ anims: [862, 861], variant, tiles, x, y: 140 });
const SELECT = button(0, 20, 56), OK = button(1, 20, 124), BACK = button(2, 16, 196), START_OK = button(3, 32, 164);
// from the Options menu, then at power-on, and how many of them are shown
const SPRITES = [[TITLE, JAPANESE, ENGLISH, SELECT, OK, BACK], [TITLE, JAPANESE, ENGLISH, SELECT, START_OK, OK]];
const SHOWN = [6, 5];
const ANIM_CURSOR = 857, CURSOR_TILES = 4;
// the cursor, beside the language: (x, y) by language
const CURSOR = [[81, 62], [73, 91]];
// the picture: 256 colours, its 8-bit tiles and its map, one after the other (offsets.languageBackground); the
// original copies 0x1140 bytes of tiles, on past them into the map and beyond
const BACKGROUND = { palette: 0, tiles: 0x200, layout: 0xB40, paletteSize: 0x200, tilesSize: 0x1140, layoutSize: 0x500 };

// a sprite of the screen: its animation from the start, at normal speed, in front (order 18)
const sprite = (anim, dest, fields) => createSprite({ graphics: { src: 0, dest, size: 0, anim }, prevVariant: 0xFF, animSpeed: 0x10, frameFlags: 0x2000, oamFlags: 0x480, ...fields });

/** Whether the ROM has the screen (`offsets` from locate.js). */
export const hasLanguageScreen = offsets => offsets.languageBackground != null;

/**
 * CreateEditLanguageScreen: at power-on with `newGame` (the Options menu's LANGUAGE without). `ctx` has the
 * engine, the sprite tables, the save and the ROM's offsets (`languageBackground`).
 */
export function createLanguageScreen(ctx, newGame) {
  const e = ctx.engine, at = newGame ? 1 : 0;
  e.firstRepeat.fill(20);
  e.nextRepeat.fill(8);
  createUiTask(e);
  e.dispCnt = 0x1140;
  e.bgCnt[0] = 0x1E83;
  uiGfxStackInit(e);
  e.bgScroll[0] = 0;
  e.bgScroll[1] = 0;
  const screen = { ctx, at, lang: ctx.save.uiLanguage, sprites: [] };   // unk28C, unk28D
  e.createTask(choose, screen, 0x2000, 0, freeScreen);
  for (const d of SPRITES[at]) {
    const s = sprite(d.anims[screen.lang], e.vramMalloc(d.tiles), { x: d.x, y: d.y, variant: d.variant });
    updateSprite(e, ctx.sprites, s);
    screen.sprites.push(s);
  }
  screen.cursor = sprite(ANIM_CURSOR, e.vramMalloc(CURSOR_TILES), { x: 33, y: 25 });
  updateSprite(e, ctx.sprites, screen.cursor);
  screen.fade = createFade(0, 1, 2, 0, 0x100, 0x10);
  fadeStep(e, screen.fade);
  const bg = ctx.offsets.languageBackground;
  loadUiGfx(e, {
    uiGfxID: 0x80, unk28: 0, unk29: 0, unk2A: 0x15,
    tiles: bg + BACKGROUND.tiles, tilesSize: BACKGROUND.tilesSize, palette: bg + BACKGROUND.palette, paletteSize: BACKGROUND.paletteSize,
    layout: bg + BACKGROUND.layout, layoutSize: BACKGROUND.layoutSize,
  });
}

// Task_EditLanguageScreenInit: once the fade has come in, Up or Down to the other language; A (or Start at power-on)
// keeps it, and B from the Options menu doesn't; either turns the fade round, to black from the next frame
function choose(t) {
  const screen = t.data, { ctx } = screen, e = ctx.engine;
  let lang = screen.lang;
  if (fadeStep(e, screen.fade)) {
    if (e.repeated & KEY.DOWN) {
      e.playSong(SONG.MENU_CURSOR);
      lang = lang !== 0 ? 0 : 1;
    } else if (e.repeated & KEY.UP) {
      e.playSong(SONG.MENU_CURSOR);
      lang = lang !== 0 ? lang - 1 : 1;
    }
  }
  screen.lang = lang;
  if (e.pressed & (screen.at ? KEY.A | KEY.START : KEY.A)) {
    e.playSong(SONG.SELECT);
    ctx.save.uiLanguage = screen.lang;
    turnFade(t);
  } else if (e.pressed & KEY.B && !screen.at) {
    e.playSong(SONG.RETURN);
    turnFade(t);
  }
  draw(screen);
}

function turnFade(t) {
  const { fade } = t.data;
  fade.unk4 = 1;
  fade.unk6 = 0;
  t.main = fadeOut;
}

// Task_806AA00: once black, the screen ends; at power-on the music stops and the save is written, then the SEGA
// logo starts (sLangScreenReturnProcs), or from the Options menu the menu opens again
function fadeOut(t) {
  const screen = t.data, { ctx } = screen, e = ctx.engine;
  if (!fadeStep(e, screen.fade)) {
    draw(screen);
    return;
  }
  e.dispCnt &= 0x1FFF;
  e.bldCnt = 0;
  e.bldY = 0;
  e.destroyTask(t);
  if (!screen.at) {
    createOptionsMenu(ctx);
    return;
  }
  e.stopAllSongs();
  const after = () => createSegaLogo(ctx);
  if (ctx.save.write()) e.stall(WRITE_FRAMES, after);
  else after();
}

// sub_806AB70: the sprites in the language chosen, each started over, and the cursor beside it
function draw(screen) {
  const { ctx, at, lang } = screen, e = ctx.engine;
  for (let i = 0; i < SHOWN[at]; i++) {
    const s = screen.sprites[i], d = SPRITES[at][i];
    s.graphics.anim = d.anims[lang];
    s.variant = d.variant;
    s.x = d.x;
    s.y = d.y;
    s.prevVariant = 0xFF;
    updateSprite(e, ctx.sprites, s);
    displaySprite(e, ctx.sprites, s);
  }
  [screen.cursor.x, screen.cursor.y] = CURSOR[lang];
  displaySprite(e, ctx.sprites, screen.cursor);
}

// TaskDestructor_EditLanguageScreen: the sprites' tiles freed
function freeScreen(t) {
  const screen = t.data, e = screen.ctx.engine;
  for (const s of [...screen.sprites, screen.cursor]) e.vramFree(s.graphics.dest);
}
