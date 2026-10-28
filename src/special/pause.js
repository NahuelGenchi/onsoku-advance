// The pause menu (SAT-R decompilation, src/game/shared/stage/pause_menu.c: CreatePauseMenu and its tasks), as the
// special stage opens it (sub_802D680) on the GBA engine. Its task makes the sign, PAUSE over its background in
// the middle of the screen, in front of everything (priority 0, OAM order 1); their animations load their
// colours into row 6 of the sprite palette as they start, and nothing loads that row's own colours back after.
// On its first frame it stops every music player but the pause sound's, plays the sound and pauses the game, so
// from the next frame its task is the only one that runs (engine.js). Each frame after it shows the sign,
// semi-transparent while the screen is faded (gBldRegs.bldY above 0), until Start goes on with the game: every
// music player goes on from where it stopped, and the sign goes.

import { createSprite, updateSprite, displaySprite, SPRITE } from '../gba/sprite.js';
import { FLAGS, TASK, KEY } from '../gba/engine.js';
import { SONG } from '../sound/songs.js';

export const ANIM_PAUSE = 718, ANIM_PAUSE_BACKGROUND = 720;
export const SIGN_X = 120, SIGN_Y = 80;   // the sign's place, the middle of the screen
// ALLOC_TILES: room for the animation's whole size (SA1_ANIM_PAUSE_WIDTH × _HEIGHT, …), in tiles
const PAUSE_TILES = (80 / 8) * (16 / 8), BACKGROUND_TILES = (96 / 8) * (32 / 8);
const PRIORITY = 0xFFFE;   // -2: after every task but the list's end
const ORDER = 1 << 6;   // SPRITE_OAM_ORDER(1)
const SEMI_TRANSPARENT = 0x80;   // SPRITE_FLAG(OBJ_MODE, 1)

/** CreatePauseMenu, on `ctx.engine`, with the sprites of `ctx.sprites`. */
export function createPauseMenu(ctx) {
  const e = ctx.engine;
  const pm = { ctx, s: null, s2: null };
  e.createTask(pauseMenuInit, pm, PRIORITY, TASK.RUNS_PAUSED, destroy);
  // in Time Attack the sign is the Time Attack one (#138): its background (809) and PAUSE taking turns with
  // its Time Attack variant (810) each second
  const sprite = (anim, tiles) => {
    const s = createSprite({
      graphics: { src: 0, dest: e.vramMalloc(tiles), size: 0, anim }, oamFlags: ORDER, variant: 0, animCursor: 0,
      qAnimDelay: 0, prevVariant: 0xFF, animSpeed: 0x10, palId: 0, x: SIGN_X, y: SIGN_Y, frameFlags: 0,
    });
    updateSprite(e, ctx.sprites, s);
    return s;
  };
  pm.s = sprite(ANIM_PAUSE_BACKGROUND, BACKGROUND_TILES);
  pm.s2 = sprite(ANIM_PAUSE, PAUSE_TILES);
}

// Task_PauseMenuInit
function pauseMenuInit(t) {
  const e = t.data.ctx.engine;
  e.pauseSongs(SONG.PAUSE);
  e.flags |= FLAGS.PAUSE_GAME;
  t.main = pauseMenuUpdate;
}

// Task_PauseMenuUpdate
function pauseMenuUpdate(t) {
  const pm = t.data, e = pm.ctx.engine, tables = pm.ctx.sprites;
  if (e.pressed & KEY.START) {
    e.flags &= ~FLAGS.PAUSE_GAME;
    e.continueSongs();
    e.destroyTask(t);
    return;
  }
  // in Time Attack, A leaves for the Time Attack lobby here (#138)
  for (const s of [pm.s2, pm.s]) s.frameFlags = e.bldY > 0 ? s.frameFlags | SEMI_TRANSPARENT : s.frameFlags & ~SPRITE.OBJ_MODE;
  displaySprite(e, tables, pm.s2);
  displaySprite(e, tables, pm.s);
}

// TaskDestructor_PauseMenu
function destroy(t) {
  const e = t.data.ctx.engine;
  e.vramFree(t.data.s2.graphics.dest);
  e.vramFree(t.data.s.graphics.dest);
}
