// The title screen and the main menu (SAT-R decompilation, src/game/sa1/menus/title_screen.c: CreateTitleScreen,
// CreateMainMenu and the tasks after them), after the intro. The background fades in from white over 49 frames,
// then the logo zooms in from four times its size over 13, slowing as it comes. A second after the copyright line
// shows, "PRESS START" blinks above it, on and off every 32 frames, and Start opens the main menu: the five items
// where "PRESS START" was, the chosen one lit. Up and Down move through them, wrapping round, with the key
// repeat, and A on Game Start fades the screen to black and stops the music.
//
// What isn't built yet goes nowhere. The original starts a demo after 900 frames on the title screen; here the
// title screen stays as it is. A on VS, Time Attack, Options or Tiny Chao Garden does nothing, and Game Start
// goes to the act, where the character select would start. The screens are in English, the language screen's
// default for a new game; the saved language isn't read yet.

import { createSprite, updateSprite, displaySprite } from '../gba/sprite.js';
import { createBackground, drawBackground, transformBackground } from '../gba/background.js';
import { FLAGS, KEY } from '../gba/engine.js';
import { SONG } from '../sound/songs.js';

const UI_LANGUAGE = 1;   // English
const TM_TITLE_LOGO = 73 + UI_LANGUAGE, TM_TITLE_BG = 75;
const ANIM_CHAO_HOVER_SIDE = 699, ANIM_PRESS_START = 779, ANIM_TITLE_COPYRIGHT = 780;
// the tiles the original gives each sprite: "PRESS START"'s are the Japanese one's, the bigger of the two
const PRESS_START_TILES = 23 * 2, COPYRIGHT_TILES = 3 * 30;
const MENU_ITEMS = 5, MENU_TOP = 93, MENU_SPACE = 14;
const ITEM_TILES = [28, 16, 28, 20, 40];
const ITEM_VARIANTS = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5];   // by item, then language
const BLEND_STEP = 0x55, BLEND_END = 0x1000;
const RUNNING = 1, ENDED = 0;
const s16 = v => (v << 16) >> 16;

// a sprite of the title screen or the menu: its animation from the start, at normal speed
const sprite = (anim, dest, fields) => createSprite({ graphics: { src: 0, dest, size: 0, anim }, prevVariant: 0xFF, animSpeed: 0x10, ...fields });
// the logo's layer, `scale` / 256 times the logo's size with the logo's (141, 26) at (192, 30) on the screen
const placeLogo = (e, scale) => transformBackground(e.bgAffine[0], 0, scale, scale, 0x8D, 0x1A, 0xC0, 30);

/**
 * CreateTitleScreen. `ctx` has the engine (engine.js), the ROM's tilemap table (`tilemaps`), the sprite tables
 * (`sprites`, rom/sprites.js) and `play()`, called where the character select would start. With `playMusic`,
 * the title's music starts.
 */
export function createTitleScreen(ctx, playMusic) {
  const e = ctx.engine, vram = e.video.vram;
  e.dispCnt = 0x41;
  e.bgCnt[2] = 0x568D;
  e.bgCnt[0] = 0x1482;
  e.bgScroll.fill(0, 0, 6);
  // the layers' maps cleared, the logo's to tile 255, which is cleared too (and the sprites' first two tiles
  // with it)
  e.mapFill[0].value = 0;
  e.mapFill[0].rect.set([0, 0, 0xFF, 0x20]);
  e.mapFill[2].value = 0xFF;
  e.mapFill[2].rect.set([0, 0, 0xFF, 0x20]);
  vram.fill(0, 0, 64);
  vram.fill(0, 0xFFC0, 0xFFC0 + 0x80);
  // the title screen and the menu are made for the original screen alone: the widescreen view is black around it
  e.wideBars = true;

  const title = {
    ctx, qBlend: BLEND_END, unkE2: 0, unkE4: 0, unkE6: 0,
    s: sprite(ANIM_PRESS_START, e.vramMalloc(PRESS_START_TILES), { x: 120, y: 113, oamFlags: 0x400, frameFlags: 0x1000 }),
    s2: sprite(ANIM_TITLE_COPYRIGHT, e.vramMalloc(COPYRIGHT_TILES), { x: 0, y: 134, variant: UI_LANGUAGE, oamFlags: 0x400, frameFlags: 0x1000 }),
    bg: createBackground({ layoutVram: 20 * 0x800, tilemapId: TM_TITLE_BG, targetTilesX: 30, targetTilesY: 20, flags: 4 }),
    bg2: createBackground({
      graphics: { src: 0, dest: 3 * 0x4000, size: 0, anim: 0 }, layoutVram: 22 * 0x800, tilemapId: TM_TITLE_LOGO,
      targetTilesX: 24, targetTilesY: 10, flags: 4 | 2,
    }),
  };
  e.createTask(fadeIn, title, 0x2000, 0, freeTitle);
  e.bldCnt = 0x20A5;
  e.bldY = title.qBlend >> 8;
  updateSprite(e, ctx.sprites, title.s);
  updateSprite(e, ctx.sprites, title.s2);
  drawBackground(e, ctx.tilemaps, title.bg);
  if (playMusic) e.playSong(SONG.TITLE_FANFARE);
}

// Task_LoadGameLogo: the background and the sprites shown, the logo's picture loaded, and the screen less white
// each frame
function fadeIn(t) {
  const title = t.data, { ctx } = title, e = ctx.engine;
  e.dispCnt |= 0x100 | 0x1000;
  if (title.qBlend === BLEND_END) drawBackground(e, ctx.tilemaps, title.bg2);
  title.qBlend = s16(title.qBlend - BLEND_STEP);
  e.bldY = (title.qBlend >> 8) & 0xFFFF;
  if (title.qBlend <= 0) {
    title.unkE4 = 0x400;
    title.unkE6 = 0xFFF0;
    e.bldY = 0;
    t.main = zoomIn;
  }
}

// Task_800D7EC: the logo shown, coming in 16 / 256 of its size, then 8 more each frame, until it is its size
function zoomIn(t) {
  const title = t.data, e = title.ctx.engine;
  e.dispCnt |= 0x400;
  title.unkE4 = s16(title.unkE4 + title.unkE6);
  title.unkE6 = (title.unkE6 - 8) & 0xFFFF;
  if (title.unkE4 < 0x100) {
    title.unkE4 = 0x100;
    title.unkE2 = 0;
    t.main = waitForStart;
  }
  placeLogo(e, title.unkE4);
}

// sub_800D878: after 60 frames "PRESS START" blinks and Start opens the menu. After 900 the original starts a
// demo (Task_SwitchToDemoInit); demos aren't built, so the title screen goes on.
function waitForStart(t) {
  const title = t.data, { ctx } = title, e = ctx.engine;
  title.unkE2 = (title.unkE2 + 1) & 0xFFFF;
  if (title.unkE2 > 60) {
    if (e.pressed & KEY.START) {
      e.playSong(SONG.SELECT);
      t.main = toMenu;
      return;
    }
    if (!((title.unkE2 - 60) & 0x20)) displaySprite(e, ctx.sprites, title.s);
  }
  displaySprite(e, ctx.sprites, title.s2);
}

// Task_SwitchToMainMenu
function toMenu(t) {
  const { ctx } = t.data;
  ctx.engine.destroyTask(t);
  createMainMenu(ctx);
}

// TaskDestructor_TitleScreen: the sprites' tiles freed. It frees the running task's, which is always the title
// screen's, since only the title screen destroys itself.
function freeTitle(t) {
  const e = t.data.ctx.engine, title = e.curTask.data;
  e.vramFree(title.s.graphics.dest);
  e.vramFree(title.s2.graphics.dest);
}

/**
 * CreateMainMenu(0), as the title screen opens it: the title screen's layers stay as they are, the logo at its
 * size.
 */
export function createMainMenu(ctx) {
  const e = ctx.engine;
  e.dispCnt = 0x1541;
  e.bgCnt[2] = 0x568D;
  e.bgCnt[0] = 0x1482;
  e.bgScroll.fill(0, 0, 6);
  const menu = {
    ctx, selectedItem: 0, unk1B0: 0, items: [],
    s: sprite(1, 0x40, { x: 120, y: 80, frameFlags: 0x10000 }),
  };
  e.createTask(showMenu, menu, 0x2000);
  placeLogo(e, 0x100);
}

// Task_MainMenuInit: the Chao, which the menu animates but never shows, and the items, shown from the next frame;
// the key repeat set to 20 frames, then 8, and the windows and the blend off
function showMenu(t) {
  const menu = t.data, { ctx } = menu, e = ctx.engine, s = menu.s;
  if (s.graphics.size === 0) {
    Object.assign(s, { x: 0, y: 0, oamFlags: 0x3C0, variant: 0, animCursor: 0, qAnimDelay: 0, prevVariant: 0xFF, animSpeed: 0x10, palId: 0, frameFlags: 0x400 });
    Object.assign(s.graphics, { dest: 0x10000, size: 0, anim: ANIM_CHAO_HOVER_SIDE });
    t.main = chooseItem;
  }
  for (let i = 0; i < MENU_ITEMS; i++) {
    menu.items[i] = sprite(ANIM_PRESS_START, e.vramMalloc(ITEM_TILES[i]), {
      x: 120, y: i * MENU_SPACE + MENU_TOP, variant: ITEM_VARIANTS[UI_LANGUAGE + i * 2], oamFlags: 0x3C0,
    });
    updateSprite(e, ctx.sprites, menu.items[i]);
  }
  e.firstRepeat.fill(20);
  e.nextRepeat.fill(8);
  e.dispCnt &= 0x9FFF;
  e.bldCnt = 0;
  e.bldY = 0;
}

// Task_MainMenu_Select: Up and Down choose, the chosen item a palette row on (Game Start's, unchosen, a row back)
function chooseItem(t) {
  const menu = t.data, { ctx } = menu, e = ctx.engine;
  if (e.repeated & KEY.UP) {
    e.playSong(SONG.MENU_CURSOR);
    menu.selectedItem = (menu.selectedItem - 1) & 0xFF;
    if (menu.selectedItem > MENU_ITEMS - 1) menu.selectedItem = MENU_ITEMS - 1;
  } else if (e.repeated & KEY.DOWN) {
    e.playSong(SONG.MENU_CURSOR);
    if (++menu.selectedItem > MENU_ITEMS - 1) menu.selectedItem = 0;
  }
  const s = menu.s;
  s.x = 72;
  s.y = menu.selectedItem * MENU_SPACE + 107;
  for (let result; (result = updateSprite(e, ctx.sprites, s)) !== RUNNING;) if (result === ENDED) break;
  menu.items.forEach((item, i) => {
    if (i === menu.selectedItem) item.palId = i !== 0 ? 1 : 0;
    else item.palId = i !== 0 ? 0 : 255;
    updateSprite(e, ctx.sprites, item);
    displaySprite(e, ctx.sprites, item);
  });
  // the other items' screens aren't built: A on them does nothing (the original fades out to them too)
  if (e.pressed & KEY.A && menu.selectedItem === 0) {
    e.playSong(SONG.SELECT);
    t.main = fadeOut;
    menu.unk1B0 = 0;
    e.bldCnt = 0xFF;   // 0xBF for Tiny Chao Garden
    e.bldY = 0;
  }
}

// Task_800DE44: darker each frame; once black, the layers' maps are cleared
function fadeOut(t) {
  const menu = t.data, { ctx } = menu, e = ctx.engine;
  menu.unk1B0 = s16(menu.unk1B0 + BLEND_STEP);
  if (menu.unk1B0 >= BLEND_END) {
    menu.unk1B0 = BLEND_END;
    t.main = leaveMenu;
    for (const bg of [0, 2]) {
      e.mapFill[bg].value = 0;
      e.mapFill[bg].rect.set([0, 0, 0xFF, 0x20]);
    }
    e.flags &= ~FLAGS.HBLANK_COPY;
  }
  e.bldY = menu.unk1B0 >> 8;
  for (const item of menu.items) displaySprite(e, ctx.sprites, item);
}

// Task_800DEE4: the items' tiles freed and the music stopped (a song started on its player, the player cleared
// and the song stopped), then the character select, which isn't built, so the act
function leaveMenu(t) {
  const menu = t.data, { ctx } = menu, e = ctx.engine;
  for (const item of menu.items) e.vramFree(item.graphics.dest);
  e.destroyTask(t);
  e.playSong(SONG.BOSS_FIGHT);
  e.stopSong(SONG.BOSS_FIGHT);
  ctx.play();
}
