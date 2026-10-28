// The Options menu (SAT-R decompilation, src/game/sa1/menus/options.c: CreateOptionsMenu and its tasks), from the
// main menu's Options. It fades in from black over 32 frames to the song of Scrap Brain Zone's remix: OPTIONS
// scrolling along a blue bar at the top, and under it the eight items with the cursor beside the chosen one, which
// is drawn a little to the right. Up and Down move it, wrapping round, with the main menu's key repeat.
//
// A on LEVEL, TIME UP or BUTTON CONFIG. lights the item, and Left and Right then set it (Easy or Normal, the time
// limit off or on, A and B swapped or not), straight into the save in memory; A or B again puts it down. A on
// DELETE GAME DATA asks DELETE ALL DATA? and then REALLY?, over the menu, Left and Right choosing YES or NO, lit by
// a window that brightens it; A on NO or B goes back a step. YES on both erases the flash, which keeps the CPU
// busy for a frame, and empties the save in memory but for its language; the music starts again. END, or B
// anywhere on the menu, fades it out to black, writes the save (14 frames in which nothing runs) and goes back to
// the main menu, which fades in with Game Start chosen and no music.
//
// The USA version shows the language as a value of the menu's own animation (variant 10, ENGLISH), where the
// decompilation's European one shows one of its six languages. Its save has no byte for those, so its last two
// settings are a byte earlier (engine/save.js).
//
// What isn't built yet goes nowhere: A on PLAYER DATA, SOUND TEST or LANGUAGE does nothing, where the original
// fades out to their screens (CreatePlayerDataMenu, CreateSoundTest and the language screen).

import { createSprite, updateSprite, displaySprite } from '../gba/sprite.js';
import { KEY } from '../gba/engine.js';
import { SONG } from '../sound/songs.js';
import { WRITE_FRAMES, ERASE_FRAMES } from '../engine/save.js';
import { createUiTask, uiGfxStackInit, loadUiGfx, createFade, fadeStep } from './ui.js';
import { createMainMenu } from './title.js';

// by the save's language (0 Japanese, 1 English): the items' and values' animation, and the scrolling title's
const ANIM_ITEMS = [866, 863], ANIM_TITLE = [865, 864];
const ANIM_CURSOR = 857, ANIM_BAR = 867, ANIM_PROMPT = 877, ANIM_COLOURS = 863;
const ITEMS = 8;
// PLAYER DATA (0), SOUND TEST (3) and LANGUAGE (4) are the items whose screens aren't built
const LEVEL = 1, TIME_UP = 2, BUTTON_CONFIG = 5, DELETE = 6, END = 7;
const ITEM_TILES = [0x1A, 0x0C, 0x10, 0x18, 0x14, 0x1E, 0x24, 0x08];
// the values' variants: LEVEL by difficultyLevel (NORMAL, EASY), TIME UP by timeLimitDisabled (ON, OFF), BUTTON
// CONFIG. by btnConfig (NORMAL, REVERSE), and the USA's language (ENGLISH)
const LEVEL_VARIANTS = [11, 12], TIME_UP_VARIANTS = [8, 9], BUTTON_VARIANTS = [13, 14], LANGUAGE_VARIANT = 10;
const COLOURS_VARIANT = 15;
const NORMAL = 0, EASY = 1;
// the prompt's variants: DELETE ALL DATA? by language, then REALLY? two on
const PROMPT_VARIANTS = [2, 0, 3, 1];
// the window over YES or NO (WIN1H, WIN1V), by language and then the choice (YES 1, NO 2)
const win = (a, b) => (a << 8) | b;
const PROMPT_WINDOWS = [
  [win(80, 110), win(86, 102)], [win(122, 158), win(86, 102)],
  [win(83, 116), win(86, 102)], [win(130, 156), win(86, 102)],
];
const YES = 1, NO = 2;
const BACKGROUND = { palette: 0, tiles: 0x20, layout: 0xC0, paletteSize: 0x20, tilesSize: 0xA0, layoutSize: 0x500 };
const WINDOWS_OFF = ~0xE000;   // DISPCNT_WIN0_ON | DISPCNT_WIN1_ON | DISPCNT_OBJWIN_ON

// a sprite of the menu: its animation from the start, at normal speed, behind the others (order 15)
const sprite = (anim, dest, fields) => createSprite({ graphics: { src: 0, dest, size: 0, anim }, prevVariant: 0xFF, animSpeed: 0x10, oamFlags: 0x3C0, ...fields });

/**
 * CreateOptionsMenu. `ctx` has the engine, the sprite tables, the save (`save`, engine/save.js) and the ROM's
 * offsets (`offsets`, with the background's at `optionsBackground`).
 */
export function createOptionsMenu(ctx) {
  const e = ctx.engine, { save } = ctx, lang = save.uiLanguage;
  e.dispCnt = 0x1140;
  e.bgCnt[0] = 0x1E03;
  e.bgScroll[0] = 0;
  e.bgScroll[1] = 0;
  createUiTask(e);
  uiGfxStackInit(e);
  e.dispCnt &= 0x1FFF;
  e.bldCnt = 0;
  e.bldY = 0;

  const value = (y, tiles, variant) => sprite(ANIM_ITEMS[lang], e.vramMalloc(tiles), { x: 220, y, variant });
  const menu = {
    ctx, state: 0, scroll: 0, cursor: 0,   // unk33F, unk33C, unk33E
    cursorSprite: sprite(ANIM_CURSOR, e.vramMalloc(0x16)),
    items: [],
  };
  e.createTask(chooseItem, menu, 0x2000, 0, freeMenu);
  updateSprite(e, ctx.sprites, menu.cursorSprite);
  for (let i = 0; i < ITEMS; i++) {
    menu.items[i] = sprite(ANIM_ITEMS[lang], e.vramMalloc(ITEM_TILES[i]), { x: 25, y: 38 + i * 16, variant: i });
    updateSprite(e, ctx.sprites, menu.items[i]);
  }
  menu.level = value(54, 0x10, LEVEL_VARIANTS[save.difficultyLevel]);
  updateSprite(e, ctx.sprites, menu.level);
  menu.timeUp = value(70, 8, TIME_UP_VARIANTS[save.timeLimitDisabled]);
  updateSprite(e, ctx.sprites, menu.timeUp);
  menu.language = value(102, 0x10, LANGUAGE_VARIANT);
  updateSprite(e, ctx.sprites, menu.language);
  menu.buttons = value(118, 0x10, BUTTON_VARIANTS[save.btnConfig]);
  updateSprite(e, ctx.sprites, menu.buttons);
  menu.prompt = sprite(ANIM_PROMPT, e.vramMalloc(0x90), { x: 120, y: 80, oamFlags: 0, variant: PROMPT_VARIANTS[lang] });
  updateSprite(e, ctx.sprites, menu.prompt);
  menu.bar = sprite(ANIM_BAR, e.vramMalloc(12), { y: 7, oamFlags: 0x40 });
  updateSprite(e, ctx.sprites, menu.bar);
  menu.title = sprite(ANIM_TITLE[lang], e.vramMalloc(0x16), { y: 17, oamFlags: 0 });
  updateSprite(e, ctx.sprites, menu.title);
  // never shown: it loads the lit items' colours
  menu.colours = sprite(ANIM_COLOURS, e.vramMalloc(1), { x: 239, y: 159, oamFlags: 0, variant: COLOURS_VARIANT, frameFlags: 0x80000 });
  updateSprite(e, ctx.sprites, menu.colours);

  const at = ctx.offsets.optionsBackground;
  loadUiGfx(e, {
    uiGfxID: 128, unk28: 0, unk29: 0, unk2A: 0x15,
    tiles: at + BACKGROUND.tiles, tilesSize: BACKGROUND.tilesSize, palette: at + BACKGROUND.palette, paletteSize: BACKGROUND.paletteSize,
    layout: at + BACKGROUND.layout, layoutSize: BACKGROUND.layoutSize,
  });
  menu.fade = createFade(0, 1, 2, 0, 0x100, 0x10);
  fadeStep(e, menu.fade);
  e.playSong(SONG.OPTIONS);
}

// Task_OptionsMenuMain: once the fade has come in, Up and Down choose and A picks; B ends the menu. The original
// fades out before PLAYER DATA's, SOUND TEST's and LANGUAGE's screens, which aren't built: A does nothing there.
function chooseItem(t) {
  const menu = t.data, e = menu.ctx.engine, fade = menu.fade;
  menu.state = 0;
  e.bgScroll[0] = 0;
  if (fadeStep(e, fade)) {
    if (fade.unk4 === 2) {
      if (e.repeated & KEY.UP) {
        e.playSong(SONG.MENU_CURSOR);
        menu.cursor = (menu.cursor - 1) & 0xFF;
        if (menu.cursor > ITEMS - 1) menu.cursor = ITEMS - 1;
      } else if (e.repeated & KEY.DOWN) {
        e.playSong(SONG.MENU_CURSOR);
        if (++menu.cursor > ITEMS - 1) menu.cursor = 0;
      }
      if (e.pressed & KEY.A && PICK[menu.cursor]) {
        e.playSong(SONG.SELECT);
        menu.state = 1;
        PICK[menu.cursor](t);
        return;
      } else if (!(e.pressed & KEY.A) && e.pressed & KEY.B) {
        e.playSong(SONG.RETURN);
        pickEnd(t);
        return;
      }
    }
  }
  drawMenu(menu);
}

// sub_8010CB4: the cursor, the items (the chosen one moved right, and lit while it is being set), the values as
// the save has them, the bar and OPTIONS scrolling left a pixel a frame
function drawMenu(menu) {
  const { ctx } = menu, e = ctx.engine, { save } = ctx, show = s => displaySprite(e, ctx.sprites, s);
  const s = menu.cursorSprite;
  s.x = 9;
  s.y = menu.cursor * 16 + 28;
  show(s);
  menu.items.forEach((item, i) => {
    if (menu.cursor === i) {
      item.palId = menu.state !== 0 ? 1 : 0;
      item.x = 30;
    } else item.x = 25;
    item.y = i * 16 + 38;
    show(item);
  });
  const value = (v, x, y, variant) => {
    v.x = x;
    v.y = y;
    v.prevVariant = 0xFF;
    v.graphics.anim = ANIM_ITEMS[save.uiLanguage];
    v.variant = variant;
    updateSprite(e, ctx.sprites, v);
    show(v);
  };
  value(menu.level, 220, 54, LEVEL_VARIANTS[save.difficultyLevel]);
  value(menu.timeUp, 220, 70, TIME_UP_VARIANTS[save.timeLimitDisabled]);
  menu.language.x = 220;
  menu.language.y = 102;
  show(menu.language);
  value(menu.buttons, 220, 118, BUTTON_VARIANTS[save.btnConfig]);
  for (let i = 0; i < 8; i++) {
    menu.bar.x = i * 32;
    menu.bar.y = 15;
    show(menu.bar);
  }
  if (++menu.scroll >= 100) menu.scroll -= 100;
  for (let i = 0; i < 4; i++) {
    menu.title.x = 100 * i - menu.scroll;
    menu.title.y = 17;
    show(menu.title);
  }
}

// sub_8010E90, sub_8010F00 and sub_8010F70: Left and Right set the item's save byte, A or B puts it down
const setting = (field, left, right) => function setItem(t) {
  const menu = t.data, e = menu.ctx.engine, { save } = menu.ctx;
  if (e.repeated & KEY.LEFT) {
    e.playSong(SONG.MENU_CURSOR);
    save[field] = left;
  } else if (e.repeated & KEY.RIGHT) {
    e.playSong(SONG.MENU_CURSOR);
    save[field] = right;
  }
  drawMenu(menu);
  if (e.pressed & (KEY.A | KEY.B)) {
    e.playSong(SONG.SELECT);
    t.main = chooseItem;
  }
};
const setLevel = setting('difficultyLevel', EASY, NORMAL);
const setTimeUp = setting('timeLimitDisabled', 1, 0);
const setButtons = setting('btnConfig', 0, 1);

// OptionsSelectDifficulty, OptionsSelectTimeUp and OptionsSelectButtonConfig
const pickSetting = task => t => { t.main = task; drawMenu(t.data); };

// OptionsSelectDeleteGameData: DELETE ALL DATA? from the next frame, NO chosen, and the window over NO brightened
function pickDelete(t) {
  const menu = t.data, e = menu.ctx.engine, lang = menu.ctx.save.uiLanguage;
  menu.state = NO;
  showPrompt(menu, PROMPT_VARIANTS[lang]);
  drawMenu(menu);
  e.dispCnt |= 0x4000;
  e.bldCnt = 0x3FBF;
  e.bldAlpha = 0x10;
  e.bldY = 12;
  [e.winRegs[1], e.winRegs[3]] = PROMPT_WINDOWS[lang * 2 + 1];
  e.winRegs[4] = 0x3F00;
  e.winRegs[5] = 0x1F;
  t.main = askDelete;
}

function showPrompt(menu, variant) {
  const s = menu.prompt;
  s.variant = variant;
  s.prevVariant = 0xFF;
  updateSprite(menu.ctx.engine, menu.ctx.sprites, s);
}

// both questions: Left and Right choose, and the window moves to the choice
function choose(menu) {
  const e = menu.ctx.engine;
  if (e.repeated & KEY.LEFT) {
    e.playSong(SONG.MENU_CURSOR);
    menu.state = YES;
  } else if (e.repeated & KEY.RIGHT) {
    e.playSong(SONG.MENU_CURSOR);
    menu.state = NO;
  }
  [e.winRegs[1], e.winRegs[3]] = PROMPT_WINDOWS[menu.state - 1 + menu.ctx.save.uiLanguage * 2];
}

// sub_8011104: DELETE ALL DATA? A on YES asks REALLY?, NO chosen; A on NO or B closes it
function askDelete(t) {
  const menu = t.data, e = menu.ctx.engine;
  choose(menu);
  if (e.pressed & KEY.B || (e.pressed & KEY.A && menu.state !== YES)) {
    e.dispCnt &= WINDOWS_OFF;
    e.bldCnt = 0;
    e.bldY = 0;
    menu.state = 0;
    e.playSong(SONG.RETURN);
    t.main = chooseItem;
  } else if (e.pressed & KEY.A) {
    showPrompt(menu, PROMPT_VARIANTS[menu.ctx.save.uiLanguage + 2]);
    menu.state = NO;
    e.playSong(SONG.SELECT);
    t.main = confirmDelete;
  }
  displaySprite(e, menu.ctx.sprites, menu.prompt);
  drawMenu(menu);
}

// sub_801123C: REALLY? A on NO or B goes back to DELETE ALL DATA?; A on YES stops the music, erases the flash
// (sub_8012F6C) and empties the save (CreateEmptySaveGame), keeping its language, then the menu goes on with its
// music from the start
function confirmDelete(t) {
  const menu = t.data, { ctx } = menu, e = ctx.engine, { save } = ctx;
  const end = () => {
    displaySprite(e, ctx.sprites, menu.prompt);
    drawMenu(menu);
  };
  choose(menu);
  if (e.pressed & KEY.B || (e.pressed & KEY.A && menu.state !== YES)) {
    menu.state = NO;
    showPrompt(menu, PROMPT_VARIANTS[save.uiLanguage]);
    e.playSong(SONG.RETURN);
    t.main = askDelete;
  } else if (e.pressed & KEY.A) {
    const lang = save.uiLanguage;
    e.stopAllSongs();
    save.erase();
    e.stall(ERASE_FRAMES, () => {
      e.playSong(SONG.SELECT);
      save.reset();
      save.uiLanguage = lang;
      e.dispCnt &= WINDOWS_OFF;
      e.bldCnt = 0;
      e.bldY = 0;
      menu.state = 0;
      e.playSong(SONG.OPTIONS);
      t.main = chooseItem;
      end();
    });
    return;
  }
  end();
}

// OptionsSelectEnd: the fade turned round, to black from the next frame
function pickEnd(t) {
  const menu = t.data, fade = menu.fade;
  fade.unk4 = 1;
  fade.unk6 = 0;
  fadeStep(menu.ctx.engine, fade);
  t.main = fadeOut;
  drawMenu(menu);
}

// sub_801176C: once black, the music stops, and the menu ends on the next frame
function fadeOut(t) {
  const menu = t.data, e = menu.ctx.engine;
  if (fadeStep(e, menu.fade)) {
    e.stopAllSongs();
    t.main = leaveMenu;
  }
  drawMenu(menu);
}

// sub_80114A0: the save written (when it has changed), then the main menu, fading in
function leaveMenu(t) {
  const { ctx } = t.data, e = ctx.engine;
  e.destroyTask(t);
  e.stopAllSongs();
  const after = () => {
    e.dispCnt &= 0x1FFF;
    e.bldCnt = 0xFF;
    e.bldY = 0;
    createMainMenu(ctx, true);
  };
  if (ctx.save.write()) e.stall(WRITE_FRAMES, after);
  else after();
}

// TaskDestructor_OptionsMenu: the sprites' tiles freed
function freeMenu(t) {
  const menu = t.data, e = menu.ctx.engine;
  for (const s of [menu.cursorSprite, ...menu.items, menu.level, menu.timeUp, menu.language, menu.buttons, menu.prompt, menu.bar, menu.title, menu.colours]) {
    e.vramFree(s.graphics.dest);
  }
}

// sOptionsSelectFuncs, for the items built
const PICK = {
  [LEVEL]: pickSetting(setLevel), [TIME_UP]: pickSetting(setTimeUp), [BUTTON_CONFIG]: pickSetting(setButtons),
  [DELETE]: pickDelete, [END]: pickEnd,
};
