// The player data menu (SAT-R decompilation, src/game/sa1/menus/player_data.c: CreatePlayerDataMenu and its task),
// from the Options menu's PLAYER DATA. It fades in from black over 32 frames to its own song: a picture with NAME,
// VS RECORD and OK down its left, the cursor beside the chosen one, which is drawn a little to the right, and the
// player's name in a box, six glyphs of the UI font. Up and Down move the cursor, wrapping round. A or B fades the
// menu out to black over 32 frames; then A opens the chosen screen, the name input (nameinput.js), the VS record
// (vsrecord.js) or, on OK, the Options menu, and B the Options menu.

import { createSprite, updateSprite, displaySprite } from '../gba/sprite.js';
import { KEY } from '../gba/engine.js';
import { SONG } from '../sound/songs.js';
import { createUiTask, uiGfxStackInit, uiGraphics, loadUiGfx, drawUiText, createFade, fadeStep } from './ui.js';
import { createOptionsMenu } from './options.js';
import { createNameInput } from './nameinput.js';
import { createVsRecord } from './vsrecord.js';

// by the save's language (0 Japanese, 1 English): the items' animation (the VS record's texts)
const ANIM_ITEMS = [869, 868];
const ANIM_CURSOR = 857;
// NAME, VS RECORD and OK: their variants, heights and tiles
const VARIANTS = [1, 0, 2], ITEM_Y = [0x41, 0x59, 0x81], ITEM_TILES = [8, 18, 14];
const NAME = 0, OK = 2;
const ASCII_GFX = 0, NAME_BOX_GFX = 60;
// the picture's colours, tiles and maps (Japanese, then English), one after the other (offsets.playerDataBackground)
const BACKGROUND = { palette: 0, tiles: 0x20, layouts: [0x10C0, 0xBC0], paletteSize: 0x20, tilesSize: 0xBA0, layoutSize: 0x500 };
/** The name's length in the save, and the characters the font has (UI graphics 0's glyphs, from ' '). */
export const NAME_LENGTH = 6, FIRST_CHAR = 0x20, CHAR_COUNT = 106;
/** The lowercase letters, drawn 8 pixels lower. */
export const LOWERCASE = 0x70, LOWERCASE_COUNT = 26;

// a sprite of the menu: its animation from the start, at normal speed, behind the others (order 15)
const sprite = (anim, dest, fields) => createSprite({ graphics: { src: 0, dest, size: 0, anim }, prevVariant: 0xFF, animSpeed: 0x10, oamFlags: 0x3C0, ...fields });

/**
 * CreatePlayerDataMenu. `ctx` has the engine, the sprite tables, the save and the ROM's offsets (`uiGraphics`
 * and `playerDataBackground`).
 */
export function createPlayerDataMenu(ctx) {
  const e = ctx.engine, { save, offsets } = ctx, lang = save.uiLanguage;
  e.dispCnt = 0x1140;
  e.bgCnt[0] = 0x1B04;
  e.bldCnt = 0;
  e.bldAlpha = 0;
  e.bldY = 0;
  e.bgScroll[0] = 0;
  e.bgScroll[1] = 0;
  const menu = {
    ctx, keys: 0, cursor: 0, chosen: 0,   // pressedKeys, unk118, unk119
    cursorSprite: sprite(ANIM_CURSOR, e.vramMalloc(22)),
    items: [],
  };
  e.createTask(chooseItem, menu, 0x2000, 0, freeMenu);
  updateSprite(e, ctx.sprites, menu.cursorSprite);
  for (let i = 0; i < VARIANTS.length; i++) {
    menu.items[i] = sprite(ANIM_ITEMS[lang], e.vramMalloc(ITEM_TILES[i]), { x: 25, y: ITEM_Y[i], variant: VARIANTS[i] });
    updateSprite(e, ctx.sprites, menu.items[i]);
  }
  createUiTask(e);
  uiGfxStackInit(e);

  // the picture into layer 0, its tiles from the block's first; the slot's layout is left as the stack held it
  const at = offsets.playerDataBackground;
  loadUiGfx(e, {
    uiGfxID: 128, unk2B: 0, unk28: 0, unk29: 0, unk2A: 0x15,
    tiles: at + BACKGROUND.tiles, tilesSize: BACKGROUND.tilesSize, palette: at + BACKGROUND.palette, paletteSize: BACKGROUND.paletteSize,
    layout: at + BACKGROUND.layouts[lang], layoutSize: BACKGROUND.layoutSize,
  });
  // the font's glyphs and colours into sprite palette row 1, for slot 1; then the name box's colours over them,
  // its slot 2 starting at the same tile
  const font = uiGraphics(e.rom, offsets.uiGraphics, ASCII_GFX);
  menu.font = e.vramMalloc(0xE0);
  loadUiGfx(e, {
    uiGfxID: ASCII_GFX, unk2B: 1, unk0: font.unk0, unk28: 1, unk2A: 0xD, vramC: menu.font,
    tiles: font.tiles, tilesSize: 0x1C00, palette: font.palette, paletteSize: 0x20,
  });
  const box = uiGraphics(e.rom, offsets.uiGraphics, NAME_BOX_GFX);
  loadUiGfx(e, {
    uiGfxID: NAME_BOX_GFX, unk2B: 2, unk0: box.unk0, unk28: 1, unk2A: 0xC, vramC: menu.font,
    tiles: box.tiles, tilesSize: 0x20, palette: box.palette, paletteSize: 0x20,
  });

  menu.text = { unk8: 0, unkA: 0x8C, unkC: 0x3D, unkE: 1, unk10: 1, unk12: 1, unk16: 1 };
  const name = save.playerName;
  for (let i = 0; i < NAME_LENGTH; i++) if (((name[i] - FIRST_CHAR) & 0xFF) >= CHAR_COUNT) name[i] = FIRST_CHAR;
  menu.fade = createFade(0, 1, 2, 0, 0x100, 0x10);
  fadeStep(e, menu.fade);
  e.playSong(SONG.PLAYER_DATA);
}

// Task_PlayerDataMenuInit: once the fade has come in, Up and Down choose, and A or B turns the fade round; once
// black, A opens the chosen screen and B the Options menu
function chooseItem(t) {
  const menu = t.data, e = menu.ctx.engine, fade = menu.fade;
  if (fadeStep(e, fade)) {
    if (fade.unk4 === 2) {
      if (e.repeated & KEY.UP) {
        e.playSong(SONG.MENU_CURSOR);
        menu.cursor = (menu.cursor - 1) & 0xFF;
        if (menu.cursor > OK) menu.cursor = OK;
      } else if (e.repeated & KEY.DOWN) {
        e.playSong(SONG.MENU_CURSOR);
        if (++menu.cursor > OK) menu.cursor = NAME;
      }
      if (e.pressed & (KEY.A | KEY.B)) {
        menu.keys = e.pressed;
        fade.unk4 = 1;
        fade.unk6 = 0;
        e.playSong(e.pressed & KEY.A ? SONG.SELECT : SONG.RETURN);
      }
    } else if (menu.keys & KEY.A) {
      menu.chosen = 1;
      PICK[menu.cursor](t);
      return;
    } else if (menu.keys & KEY.B) {
      pickOk(t);
      return;
    }
  }
  drawMenu(menu);
}

// sub_8011C94: the cursor, the items (the chosen one moved right) and the name, a glyph at a time
function drawMenu(menu) {
  const { ctx } = menu, e = ctx.engine, show = s => displaySprite(e, ctx.sprites, s);
  const s = menu.cursorSprite;
  s.x = 9;
  s.y = ITEM_Y[menu.cursor] - 2;
  show(s);
  menu.items.forEach((item, i) => {
    if (menu.cursor === i) {
      item.x = 30;
      item.palId = menu.chosen ? 1 : 0;
    } else item.x = 25;
    item.y = ITEM_Y[i];
    show(item);
  });
  const name = ctx.save.playerName, o = menu.text;
  for (let i = 0; i < NAME_LENGTH; i++) {
    o.unkA = i * 8 + 0x9F;
    o.unkC = ((name[i] - LOWERCASE) & 0xFF) < LOWERCASE_COUNT ? 0x44 : 60;
    drawUiText(e, () => name[i], o);
  }
}

// PlayerDataSelectName, PlayerDataSelectVsRecord and PlayerDataSelectOK
const pick = create => t => {
  const { ctx } = t.data;
  ctx.engine.destroyTask(t);
  create(ctx);
};
const pickOk = pick(createOptionsMenu);
const PICK = [pick(createNameInput), pick(createVsRecord), pickOk];

// TaskDestructor_PlayerDataMenu: the sprites' tiles and the font's freed
function freeMenu(t) {
  const menu = t.data, e = menu.ctx.engine;
  for (const s of [menu.cursorSprite, ...menu.items]) e.vramFree(s.graphics.dest);
  e.vramFree(menu.font);
}
