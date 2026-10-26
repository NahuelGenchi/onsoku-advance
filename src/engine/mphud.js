// What the multiplayer modes show over the stage (SAT-R decompilation: src/game/sa1/stage/mp_hud.c,
// src/game/shared/stage/mp_indicators.c, src/game/shared/stage/item_tasks.c Task_Item_Confusion,
// src/game/sa1/stage/mp_unk_0.c sub_801C704 and src/game/shared/stage/mp_finish.c): the clock and each
// player's Chao count, an arrow at the screen's edge toward each other player off screen, the bubble over a
// confused player, the darkness another player's mystery item box brings, and the round's end, its result
// over each player and the fade to white. Each is a task of one GBA's game; `mp` is that GBA's mode state
// (chaohunt.js).

import { makeSprite, animate } from './objects.js';
import { SINE, vectorAngle } from './trig.js';
import { SCREEN_W, SCREEN_H } from './constants.js';
import { SONG } from '../sound/songs.js';

const s16 = v => (v << 16) >> 16;
const bcd = n => parseInt(String(n), 16);   // Base10DigitsToHexNibbles
const sin = a => SINE[a & 1023] >> 6, cos = a => SINE[(a + 256) & 1023] >> 6;
const div = (a, b) => (b === 0 ? 0 : Math.trunc(a / b));
// the clock's hundredths for each of a second's 60 frames, as two decimal digits (gUnknown_080E0234)
const HUNDREDTHS = [
  0, 2, 3, 5, 7, 8, 16, 18, 19, 21, 23, 24, 32, 34, 35, 37, 39, 40, 48, 50, 51, 53, 55, 56, 64, 66, 67, 69, 71, 72,
  80, 82, 83, 85, 87, 88, 96, 98, 99, 101, 103, 104, 112, 114, 115, 117, 119, 120, 128, 130, 131, 133, 135, 136,
  144, 146, 147, 149, 151, 152,
];
const MINUTE = 3600;
const show = (ctx, s, x, y, affine = null) => ctx.drawOnScreen(s, x, y, affine);

/** The HUD (CreateChaoHuntHUD, Task_ChaoHuntHUD), made as the title card ends. */
export function hudTask(mp, anims) {
  const backdrop = makeSprite('chaoCounter', { order: 5, prio: 0 });
  animate(backdrop, anims);
  const digits = Array.from({ length: 22 }, (_, v) => {
    const s = makeSprite(`mpDigit${v}`, { order: 4, prio: 0 });
    animate(s, anims);
    return s;
  });
  return {
    run(ctx) {
      const t = mp.courseTime;
      // the clock blinks red in its last minute, two frames in four
      const set = t < MINUTE && (t & 2) ? digits.slice(11) : digits;
      if (!mp.actStart && t < MINUTE && t % 60 === 0) ctx.world.playSound(SONG.TIMER);
      show(ctx, set[10], 24, 32);
      show(ctx, set[10], 48, 32);
      const seconds = Math.trunc(t / 60), hs = HUNDREDTHS[t - seconds * 60];
      show(ctx, set[hs >> 4], 56, 32);
      show(ctx, set[hs & 0xF], 64, 32);
      const minutes = Math.trunc(seconds / 60), ss = bcd(seconds - minutes * 60);
      show(ctx, set[(ss >> 4) & 0xF], 32, 32);
      show(ctx, set[ss & 0xF], 40, 32);
      show(ctx, set[bcd(minutes % 60) & 0xF], 16, 32);
      // each player's Chao, by link id
      for (let i = 0; i < 4 && i < mp.count; i++) {
        const x = i * 20 + 8;
        show(ctx, backdrop, x, 8);
        const n = bcd(mp.charRings[i]);
        if (n >= 0x100) {
          show(ctx, digits[(n >> 8) & 0xF], x + 3, 14);
          show(ctx, digits[(n >> 4) & 0xF], x + 11, 14);
          show(ctx, digits[n & 0xF], x + 19, 14);
        } else if (n >= 0x10) {
          show(ctx, digits[(n >> 4) & 0xF], x + 7, 14);
          show(ctx, digits[n & 0xF], x + 15, 14);
        } else show(ctx, digits[n & 0xF], x + 11, 14);
      }
      return true;
    },
  };
}

/**
 * The arrow toward player `id` while they are off this screen (CreateOpponentPositionIndicator,
 * Task_801951C): at the screen's edge where the line from its middle to them leaves it, pointing at them,
 * larger the nearer they are and animated faster within 256 px.
 */
export function indicatorTask(mp, id, anims) {
  const s = makeSprite('indicator', { order: 1, prio: 0 });
  return {
    run(ctx) {
      const mpp = mp.players[id], cam = ctx.cam;
      const dx = mpp.pos.x - cam.x, dy = mpp.pos.y - cam.y;
      if (dx >= 0 && dx <= SCREEN_W && dy >= 0 && dy <= SCREEN_H) return true;
      const tx = s16(mpp.pos.x - 120 - cam.x), ty = s16(mpp.pos.y - 80 - cam.y);
      let r1 = tx, r4 = ty;
      if (tx !== 0 && ty !== 0) {
        while (Math.abs(r1) >= 128 || Math.abs(r4) >= 128) {
          r1 = Math.trunc(r1 / 2); r4 = Math.trunc(r4 / 2);
          if (Math.abs(r1) < 2 || Math.abs(r4) < 2) break;
        }
      }
      let rot;
      if (Math.abs(r1) < 2) rot = r4 > 0 ? 256 : 768;
      else if (Math.abs(r4) < 2) rot = r1 > 0 ? 0 : 512;
      else rot = s16(vectorAngle(r4, r1));
      const d = tx * tx + ty * ty;
      s.anim.speed = d < 0x10000 ? 0x18 : 0x10;
      let scale;
      if (d > 0x6000000) scale = 64;
      else if (d < 0x10000) scale = 480;
      else scale = div(((0x6000000 - d) >> 16) * 416, 1535) + 64;
      let x, y;
      if (rot === 0) { y = 80; x = SCREEN_W; }
      else if (rot === 256) { y = SCREEN_H; x = 120; }
      else if (rot === 512) { y = 80; x = 0; }
      else if (rot === 768) { y = 0; x = 120; }
      else {
        const slope = a => s16(div(sin(a) * 256, cos(a)));
        const far = tx > 0, k = far ? slope(rot) : slope((rot - 512) & 1023);
        y = s16(far ? ((k * 15) >> 5) + 80 : 80 - ((k * 15) >> 5));
        const side = far ? (256 - rot) & 1023 : (768 - rot) & 1023;
        if (ty > 0) {
          if (y >= SCREEN_H) { y = SCREEN_H; x = s16(((slope(side) * 5) >> 4) + 120); }
          else x = far ? SCREEN_W : 0;
        } else if (y < 0) { y = 0; x = s16(120 - ((slope(side) * 5) >> 4)); }
        else x = far ? SCREEN_W : 0;
      }
      animate(s, anims);
      show(ctx, s, x, y, { rotation: (rot + 256) & 1023, scaleX: scale, scaleY: scale, double: true });
      return true;
    },
  };
}

/**
 * The bubble over player `id` while their packets say they are confused (CreateItemTask_Confusion,
 * Task_Item_Confusion): it blinks, players with even and odd ids on opposite frames.
 */
export function confusionTask(mp, id, anims) {
  const s = makeSprite('confusion', { order: 8, prio: 2 });
  return {
    run(ctx) {
      const mpp = mp.players[id];
      if (!(mpp.items & 0x50)) return false;
      s.prio = (mpp.flags & 0x30) >> 4;
      s.flipY = false;
      animate(s, anims);
      const odd = id & 1;
      if (((ctx.world.tick & 2) && odd !== 1) || (!(ctx.world.tick & 2) && odd !== 0)) ctx.draw(s, mpp.pos.x, mpp.pos.y);
      return true;
    },
  };
}

// the light's half widths for each line, from the line above the screen's first (WIN0H by H-blank DMA)
const LIGHT = [
  0, 12, 0, 12, 0, 12, 0, 12, 0, 11, 0, 11, 0, 11, 0, 11, 0, 11, 15, 19, 22, 24, 27, 29, 30, 32, 34, 35, 37, 38,
  39, 41, 42, 43, 44, 45, 46, 47, 48, 49, 49, 50, 51, 52, 52, 53, 54, 54, 55, 55, 56, 57, 57, 58, 58, 58, 59, 59,
  60, 60, 60, 61, 61, 61, 61, 62, 62, 62, 62, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 64, 63, 63, 63, 63, 63,
  63, 63, 63, 63, 63, 63, 62, 62, 62, 62, 61, 61, 61, 61, 60, 60, 60, 59, 59, 58, 58, 58, 57, 57, 56, 55, 55, 54,
  54, 53, 52, 52, 51, 50, 49, 49, 48, 47, 46, 45, 44, 43, 42, 41, 39, 38, 37, 35, 34, 32, 30, 29, 27, 24, 22, 19,
  15, 11, 16, 11, 16, 11, 16, 11, 16, 11, 17, 12, 17, 12, 17, 12, 17, 12,
];
const DARK_RISE = 64, DARK_FULL = 0x1000, DARK_TIME = 600;
const WIN_TOP = 17, WIN_BOTTOM = 144;
/** Each line's lit span [x1, x2) of the darkness's window. */
export const LIGHT_SPANS = Array.from({ length: SCREEN_H }, (_, line) => {
  const o = LIGHT[line === 0 ? 0 : line - 1];
  return line >= WIN_TOP && line < WIN_BOTTOM ? [120 - o, 120 + o] : null;
});

/**
 * The darkness (sub_801C704): everything but a lit oval in the screen's middle darkens over 64 frames,
 * stays dark for 600, and lightens again; it ends at once when this player's round is over.
 */
export function darknessTask(mp, game) {
  const fx = game.state;
  let level = 0, hold = DARK_TIME, phase = 'rising';
  const end = () => { fx.effects2d = { ...fx.effects2d, darkness: null }; return false; };
  return {
    run() {
      if (phase === 'rising') {
        level += DARK_RISE;
        if (level === DARK_FULL) phase = 'hold';
      } else if (phase === 'hold') {
        if (mp.ranks[mp.id] !== -1) return end();
        if (--hold === 0) phase = 'falling';
      } else {
        level -= DARK_RISE;
        if (level < 0 || mp.ranks[mp.id] !== -1) return end();
      }
      fx.effects2d = { ...fx.effects2d, darkness: { y: level >> 8, spans: LIGHT_SPANS } };
      return true;
    },
  };
}

/** A player's result over their head as the round ends (CreateMultiplayerFinishResult, Task_DisplayResult). */
function resultTask(mp, id, rank, anims) {
  const variant = rank === 5 ? 1 : rank === 4 ? 2 : rank;
  const s = makeSprite(['vsWin', 'vsLose', 'vsDraw'][variant], { order: 0, prio: 0 });
  animate(s, anims);
  mp.ranks[id] = rank < 6 ? rank : mp.count - 1;
  return { run(ctx) { const m = mp.players[id]; ctx.draw(s, m.pos.x, m.pos.y - 32); return true; } };
}

const WAIT = 240, FADE_STEP = 64, FADE_END = 0x1000;

/**
 * The round's end (CreateMultiplayerFinishTransition): the round-over sound, and each player's result from
 * the Chao they hold, ties drawn; once every message this GBA has to send is out, four more seconds, then
 * the sound fades and the screen whitens over 64 frames to the results (`done`).
 */
export function finishTask(mp, game, anims, done) {
  const { world, state } = game;
  world.playSound(SONG.ROUND_OVER);
  const counts = mp.charRings.slice(0, 4), order = [0, 1, 2, 3];
  while (counts.length < 4) counts.push(0);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3 - i; j++) {
      if (counts[j] < counts[j + 1]) {
        [counts[j], counts[j + 1]] = [counts[j + 1], counts[j]];
        [order[j], order[j + 1]] = [order[j + 1], order[j]];
      }
    }
  }
  for (let i = 0; i < 4; i++) {
    if (i !== 0) mp.ranks[order[i]] = counts[i] === counts[0] ? 4 : 1;
    else mp.ranks[order[0]] = counts[0] === counts[1] ? 4 : 0;
  }
  for (let i = 0; i < mp.count; i++) game.tasks.add(resultTask(mp, i, mp.ranks[i] & 0xFF, anims), 0x2010);
  let frame = 0, phase = 'wait';
  return {
    run() {
      if (phase === 'wait') {
        if (mp.queueEmpty() && frame++ > WAIT) {
          state.effects2d = { ...state.effects2d, fade: 0 };
          for (const player of [0, 1, 2, 3]) world.fadeOut(player, 4);
          frame = 0; phase = 'fade';
        }
        return true;
      }
      frame += FADE_STEP;
      state.effects2d = { ...state.effects2d, fade: frame >> 8 };
      if (frame >= FADE_END) {
        state.effects2d = { ...state.effects2d, fade: 0 };
        done();
        return false;
      }
      return true;
    },
  };
}
