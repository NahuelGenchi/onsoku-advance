// The pause menu in an act (SAT-R decompilation, src/game/shared/stage/pause_menu.c: CreatePauseMenu and its
// tasks), as the stage clock's task opens it (Task_GameStage, game.js). Its task comes last among the act's, so
// on the frame Start opens it, it runs only when a task of its priority came before it (Ice Mountain's water);
// otherwise the act runs one more frame and it starts on the next. Its sign, PAUSE over its background, is made
// at once in the middle of the screen, and its animations load their colours into row 6 of the sprite palette,
// which shows them from that frame on: nothing loads that row's own colours back after the menu closes.
//
// On its first frame it stops every music player but the pause sound's, plays the sound and pauses the game
// (FLAGS_PAUSE_GAME): from the next frame only its task runs, and the screen keeps the act as that frame left it.
// Each frame after that it shows the sign in front of everything, out of any fade (it is semi-transparent while
// the screen is faded), until Start goes on with the game: every music player goes on from where it stopped,
// and the sign goes. The act's tasks run again from the frame after.

import { makeSprite, animate } from './objects.js';
import { SONG } from '../sound/songs.js';

export const PAUSE_PRIORITY = 0xFFFE;   // -2: after every task but the list's end
const SIGN_X = 120, SIGN_Y = 80;          // the middle of the screen
const ORDER = 1;                          // SPRITE_OAM_ORDER(1), in front of the HUD

/**
 * CreatePauseMenu: the menu's task, to run at PAUSE_PRIORITY, with the act's `state`, `anims` and `sound`, and
 * `startPressed()`, whether Start was pressed this frame. `state.pauseGame` is FLAGS_PAUSE_GAME, and
 * `state.pauseSign` the sign's sprites on the frames it shows them.
 */
export function createPauseMenu({ state, anims, sound, startPressed }) {
  // in Time Attack the sign is the Time Attack one (#138): its background (809) and PAUSE taking turns with
  // its Time Attack variant (810) each second
  const sign = [makeSprite('pause', { order: ORDER, prio: 0 }), makeSprite('pauseBackground', { order: ORDER, prio: 0 })];
  for (const s of sign) animate(s, anims);
  let started = false;
  return {
    runsPaused: true,   // TASK_x0004
    run() {
      // Task_PauseMenuInit
      if (!started) {
        started = true;
        sound.pause(SONG.PAUSE);
        state.pauseGame = true;
        return true;
      }
      // Task_PauseMenuUpdate
      if (startPressed()) {
        state.pauseGame = false;
        sound.continueAll();
        return false;
      }
      // in Time Attack, A leaves for the Time Attack lobby here (#138)
      state.pauseSign = sign.map(s => ({ frame: s.frame, x: SIGN_X, y: SIGN_Y, flipX: false, flipY: false, order: s.order, prio: s.prio, screen: true }));
      return true;
    },
  };
}
