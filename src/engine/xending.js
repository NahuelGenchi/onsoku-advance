// X Zone's normal ending, from Egg X's landing to the stage results (SAT-R decompilation,
// src/game/sa1/stage/enemies/boss_x3_egg_x.c, sub_803A594 and Task_Strc10_803891C).

import { SCREEN_W, SCREEN_H } from './constants.js';
import { setCamBounds, debris, s16 } from './bosses.js';

const RIGHT = { left: false, right: true, up: false, down: false, jump: false, attack: false, boost: false, jumpPressed: false, attackPressed: false, boostPressed: false };
const FADE_FROM = 3072;   // Sonic's x where the screen starts to fade to white (qWorldX > 0xBFFFF)

/**
 * The task the wrecked Egg X starts once it has landed (priority 0x1FFF, before the objects'): the base comes
 * down round Sonic, debris flying up at random all over the screen every 4 frames, and behind him more and
 * more often (every 32 frames at first, 2 fewer each time, down to every 4). Two seconds on, once he is on the
 * ground, he runs off to the right by himself and the camera's right bound opens to the act's end; from
 * x 3072 the screen fades to white over 128 frames as the camera falls behind him. Then he stops and is hidden,
 * every object's task goes, and the stage results come up with his rings and time (world.stageResults, the
 * end of the act's tally, #69).
 */
export function normalEnding() {
  let interval = 32, count = 0, tick = 0, timer = 120, phase = 0;
  return {
    run(ctx) {
      const { world, player: p } = ctx;
      tick = (tick + 1) & 0xFFFF;
      if ((tick & 3) === 0) {
        const x = s16(((world.random() | 0) % SCREEN_W) + ctx.cam.x);
        const y = s16(((world.random() | 0) % SCREEN_H) + ctx.cam.y);
        debris(ctx, x, y + 16, y + 32);
      }
      count = (count + 1) & 0xFFFF;
      if (count >= interval) {
        count = 0;
        interval -= 2;
        if (interval < 4) interval = 4;
        const x = s16(Math.floor(p.x) - 48), y = s16(Math.floor(p.y));
        debris(ctx, x, y + 16, y + 32);
      }
      const display = world.display;
      switch (phase) {
        case 0:
          if (timer !== 0) timer--;
          else if (!p.air) {
            p.forcedInput = RIGHT;
            setCamBounds(world.cam, { maxX: world.cam.width });
            phase++;
          }
          break;
        case 1:
          if (p.x >= FADE_FROM) {
            Object.assign(display, { winIn: 0x3F3F, win0h: SCREEN_W, win0v: SCREEN_H, bldCnt: 0xBF, bldY: 0, win0: true });
            timer = 0;
            phase++;
          }
          break;
        case 2:
          if (++timer > 128) {
            p.forcedInput = null;
            p.xsp = 0; p.ysp = 0; p.gsp = 0;
            p.vanished = true;
            world.destroyTasks(0x2000, 0x2FFF);
            display.bldCnt &= ~0x10;
            world.stageResults(world.ringCount, world.courseTime);
            return false;
          }
          display.bldY = timer >> 3;
          world.cam.shiftX = -(timer >> 1);
          break;
      }
      return true;
    },
  };
}
