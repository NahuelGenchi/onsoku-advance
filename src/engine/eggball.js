// Casino Paradise's boss, the Egg Ball (SAT-R decompilation, src/game/sa1/stage/enemies/boss_3_egg_ball.c):
// Eggman in his mobile and a spiked ball roll across the arena along two of eight straight paths, picked
// together at random for each pass, faster with each of the eight hits it takes. Eight pipes slide out of the
// walls and the floor as the fight starts, the two in the floor solid to stand on. Beaten, it falls and bounces,
// shedding bolts and explosions, the ball flies off, and four seconds later Eggman escapes in the Egg Mobile.
// Positions are worked out from the spawn point every frame, as the original does; speeds and offsets in 1/256 px
// are its integers.

import { makeSprite, startAnim, animate } from './objects.js';
import { platform } from './collide.js';
import { tileFloor, LAYER_BACK } from './terrain.js';
import { SONG } from '../sound/songs.js';
import { SCREEN_W, SCREEN_H } from './constants.js';
import {
  HIT_ENEMY, HIT_PLAYER, bossHit, bossShotHit, setBossCamBounds, preBossCameraPan, bossDebris, bossExplosion, bossPart,
  eggMobileEscape,
} from './bosses.js';

const I = v => v >> 8;
const s16 = v => (v << 16) >> 16;

export const EGG_BALL = 24;

const EGG_BALL_PRIORITY = 0x2100, PIPE_PRIORITY = 0x2200, SPIKE_BALL_PRIORITY = 0x2800;
const THIN_PLATFORMS = [0x2010, 0x2011];   // the priority of the thin platforms, which go when it is beaten
const MUSIC_BOSS = 0x10, MUSIC_BOSS_OVER = 0x30;   // gMusicManagerState.unk1: start the boss song, end it
const HITS = 8;

// the speed of a pass for each number of hits taken, in tenths (gUnknown_084ACDC0)
const SPEEDS = [10, 10, 10, 10, 12, 12, 14, 16, 16];
// the eight paths, each from where it starts off one side of the arena to where it leaves the other, relative to
// the spawn point, in 1/256 px: [x, y, vx, vy] (gUnknown_084ACE24)
const PATHS = [
  [-79872, -32000, 489, 0], [-79872, -11008, 489, 0], [8192, -32000, -489, 0], [8192, -11008, -489, 0],
  [-49920, -53248, 0, 352], [-21760, -53248, 0, 352], [-49920, 10240, 0, -352], [-21760, 10240, 0, -352],
];
// the eight choices a pass picks from: the mobile's path and the ball's (gUnknown_084ACEA4)
const CHOICES = [[0, 3], [5, 1], [3, 6], [4, 5], [1, 7], [6, 2], [2, 4], [7, 0]];
// the pipes: where each sits from the spawn point, its variant (the floor's and ceiling's, or the walls') and
// flips (gUnknown_084ACDD2), and how far out of place it starts before sliding in (gUnknown_084ACE12)
const PIPES = [
  [-223, 16, 'eggBallPipe', false, false], [-113, 16, 'eggBallPipe', false, false],
  [0, -71, 'eggBallPipeSide', true, false], [0, -153, 'eggBallPipeSide', true, false],
  [-113, -184, 'eggBallPipe', false, true], [-223, -184, 'eggBallPipe', false, true],
  [-280, -71, 'eggBallPipeSide', false, false], [-280, -153, 'eggBallPipeSide', false, false],
];
const PIPE_STARTS = [[0, 32], [0, 32], [32, 0], [32, 0], [0, -32], [0, -32], [-32, 0], [-32, 0]];
const PIPE_DELAY = 90;
// mirrored when it comes in from the left half of the arena
const FACES_RIGHT = q => q < -140 * 256;
// leaves the arena: past 312 px left of the spawn point or 32 px right of it, above 208 px up or 40 px down
const OUT = (qx, qy) => ((qx + 312 * 256) >>> 0) > 344 * 256 || qy < -208 * 256 || qy > 40 * 256;

// a variant change that keeps the animation where it was when it is the same one, as when only the
// animation's end flag is cleared
function setVariant(s, name) {
  if (s.anim.name === name) s.anim.done = false;
  else startAnim(s, name);
}

// the floor under a falling part, 24 px below its centre on the back layer (sub_801F100)
const floor = (ctx, x, y) => tileFloor(ctx.world.terrain, x, y + 24, LAYER_BACK);

// the hit's flash (Task_802F0D0): the mobile is the white OBJ window on every other pair of the first 16 of the 32
// frames after a hit, while Sonic is alive; `flash` counts them down
function flashing(boss, p) {
  if (boss.flash === 0) return false;
  boss.flash--;
  return boss.flash > 0x10 && !(boss.flash & 2) && !p.dead;
}

/** CreateEntity_EggBall: the boss's task, its pipes', and the arena's camera bounds; the boss music starts. */
export function eggBall(e, slot, anims, ctx0) {
  ctx0.world.setSeed(ctx0.world.frameCount);   // gPseudoRandom = gFrameCount
  const x0 = e.x, y0 = e.y, world = ctx0.world;
  const s = makeSprite('eggBallMobile', { order: 21 }), s2 = makeSprite('eggBallEggman', { order: 22 });
  const boss = {
    qx: 0, qy: 0, qvx: 0, qvy: 0, t: 0, hits: 0, flash: 0, path: 0, qvFall: 0, ball: null, eggman: s2,
    // hit four times, it is in a pinch (unk8C); nothing reads it
    pinch: false,
  };
  for (let i = 0; i < PIPES.length; i++) ctx0.add(pipe(i, x0, y0, boss), PIPE_PRIORITY);
  ctx0.add(setBossCamBounds(world.camera, y0 - 184, y0 + 16, x0 - 280, x0));
  world.musicState(MUSIC_BOSS);

  const pos = () => [x0 + I(boss.qx), y0 + I(boss.qy)];
  const show = (ctx, x, y) => { animate(s, ctx.anims); animate(s2, ctx.anims); ctx.draw(s, x, y); ctx.draw(s2, x, y); };
  // Eggman goes back to his still frame once laughing or wincing is over (sub_8030814)
  const settle = () => { if (s2.anim.name !== 'eggBallEggman' && s2.anim.done) startAnim(s2, 'eggBallEggman', true); };
  // each 8th frame of its fall and wreck: a piece flies off and an explosion goes off around it
  const shed = (ctx, x, y) => { if ((boss.t & 7) === 0) bossDebris(ctx, x, y + 32); };

  const states = {
    // Task_EggBallMain: two seconds, then it appears 85 px left of the spawn point and starts rising, its
    // animation stepping twice and drawn twice that frame
    start(ctx) {
      if (boss.t++ <= 120) return;
      boss.qx = -85 * 256; boss.qy = 0; boss.qvy = -256;
      show(ctx, ...pos());
      boss.t = 60; state = 'rise';
      states.rise(ctx);
    },
    // Task_802F56C: up a pixel a frame to 80 px, then a second there, and Eggman laughs
    rise(ctx) {
      if (boss.qy <= -80 * 256) {
        if (--boss.t === 0) { startAnim(s2, 'eggBallEggmanLaugh'); boss.t = 60; state = 'climb'; }
      } else boss.qy -= 256;
      show(ctx, ...pos());
    },
    // Task_802F644: once he has laughed, a second, then up a pixel a frame to 208 px, out of sight, where it
    // lets the spike ball go
    climb(ctx) {
      if (s2.anim.name === 'eggBallEggman') {
        if (boss.t === 0) {
          boss.qy -= 256;
          if (boss.qy <= -208 * 256) {
            boss.t = 60; state = 'wait';
            boss.ball = spikeBall(boss, x0, y0);
            ctx.add(boss.ball, SPIKE_BALL_PRIORITY);
          }
        } else boss.t--;
      }
      if (s2.anim.name === 'eggBallEggmanLaugh' && s2.anim.done) { boss.t = 60; startAnim(s2, 'eggBallEggman'); }
      show(ctx, ...pos());
    },
    // Task_802F804: unseen, a second between passes, then a pass at random: the mobile's path and the ball's
    wait(ctx) {
      if ((boss.t = (boss.t - 1) & 0xFFFF) === 0) {
        boss.path = ctx.world.random() & 7;
        const [qx, qy, qvx, qvy] = PATHS[CHOICES[boss.path][0]];
        boss.qx = qx; boss.qy = qy;
        boss.qvx = Math.trunc(qvx * SPEEDS[boss.hits] / 10); boss.qvy = Math.trunc(qvy * SPEEDS[boss.hits] / 10);
        s.flipX = s2.flipX = FACES_RIGHT(boss.qx);
        boss.ball.go = true;
        state = 'pass';
      }
      boss.flash = 0;
      animate(s, ctx.anims); animate(s2, ctx.anims);
      settle();
    },
    // Task_802F9F8: along its path until it leaves the arena. Hit, it flashes for 32 frames and can't be hit
    // again in them; the eighth hit beats it.
    pass(ctx) {
      boss.qx += boss.qvx; boss.qy += boss.qvy;
      if (OUT(boss.qx, boss.qy)) { boss.t = 60; state = 'wait'; }
      const [x, y] = pos();
      animate(s, ctx.anims); animate(s2, ctx.anims);
      // sub_802EF94
      if (boss.flash === 0) {
        const hit = bossHit(s, x, y, ctx);
        if (hit === HIT_ENEMY) {
          boss.hits++; boss.flash = 32;
          if (boss.hits === 4) boss.pinch = true;
          setVariant(s2, 'eggBallEggmanHit');
          ctx.world.playSound(SONG.BOSS_HIT);
        } else if (hit === HIT_PLAYER) setVariant(s2, 'eggBallEggmanLaugh');
      }
      if (boss.hits >= HITS) { beaten(ctx); return; }
      settle();
      // Task_802F0D0
      ctx.draw({ ...s, white: flashing(boss, ctx.player) }, x, y);
      ctx.draw(s2, x, y);
    },
    // Task_802FC14: it drops, bouncing off the floor with three quarters of its speed until it is slower than
    // a pixel a frame
    fall(ctx) {
      boss.qvFall = s16(boss.qvFall + 0x28);
      boss.qy += boss.qvFall;
      const [x, y] = pos(), d = floor(ctx, x, y);
      if (d < 0) {
        boss.qy += d * 256;
        boss.qvFall = s16((boss.qvFall >> 2) - boss.qvFall);
        if (boss.qvFall > -256) { boss.qvFall = 0; state = 'wreck'; }
      }
      boss.t = (boss.t + 1) & 0xFFFF;
      shed(ctx, x, y);
      show(ctx, x, y);
    },
    // Task_802FE88: it lies wrecked until 241 frames from its beating, then Eggman escapes, its star disc flies
    // off, and the act's end can start (where the original makes the capsule)
    wreck(ctx) {
      const [x, y] = pos();
      if (boss.t++ > 240) {
        ctx.add(eggMobileEscape(x, y - 8, ctx.anims));
        ctx.world.bossDefeated(x, y);
        ctx.world.musicState(MUSIC_BOSS_OVER);
        const right = s.flipX;
        ctx.add(bossPart(x, y, 'eggBallStarDisc', ctx.anims, { vx: right ? 4 * 256 : -4 * 256, vy: -2 * 256, spin: 0x80, grow: 0, scaleX: right ? -256 : 256, frames: 60 }));
        return false;
      }
      shed(ctx, x, y);
      show(ctx, x, y);
    },
  };

  // sub_802FB2C: Eggman winces, it explodes and starts falling, the ball flies off, the thin platforms go, the
  // camera stops across and its top bound drops 40 px, and 1000 points
  function beaten(ctx) {
    startAnim(s2, 'eggBallEggmanHit');
    boss.qvFall = -0x200;
    ctx.world.playSound(SONG.EXPLOSION);
    boss.ball.blow();
    ctx.removeTasks(...THIN_PLATFORMS);
    ctx.player.onObject = null;
    const cam = ctx.world.camera, { minY, maxY } = cam;
    cam.minX = cam.maxX = Math.floor(cam.x);
    ctx.add(preBossCameraPan(cam, minY + 40, maxY + SCREEN_H));
    cam.minY = minY; cam.maxY = maxY;
    ctx.world.addScore(1000);
    state = 'fall';
    states.fall(ctx);
  }

  let state = 'start';
  return {
    priority: EGG_BALL_PRIORITY,
    run(ctx) { return states[state](ctx) !== false; },
  };
}

// The spiked ball (Task_8030120 and Task_803020C): it waits unseen until the mobile starts a pass, then rolls
// along its own path of the pass until it leaves the arena; touching it hurts Sonic, and Eggman laughs when it
// does. When the mobile is beaten it flies up off the screen's middle, bouncing and exploding for three seconds.
function spikeBall(boss, x0, y0) {
  const s = makeSprite('eggBallSpikeBall', { order: 23 });
  let qx = boss.qx, qy = boss.qy, qvx = 0, qvy = 0, t = 0, state = 'wait';
  const pos = () => [x0 + I(qx), y0 + I(qy)];
  const states = {
    wait() {
      if (!task.go) return;
      const [px, py, pvx, pvy] = PATHS[CHOICES[boss.path & 7][1]];
      qx = px; qy = py;
      qvx = Math.trunc(pvx * SPEEDS[boss.hits] / 10); qvy = Math.trunc(pvy * SPEEDS[boss.hits] / 10);
      s.flipX = FACES_RIGHT(qx);
      task.go = false; state = 'roll';
    },
    roll(ctx) {
      qx += qvx; qy += qvy;
      if (OUT(qx, qy)) state = 'wait';
      const [x, y] = pos();
      animate(s, ctx.anims);
      // sub_8030778
      if (bossShotHit(s, x, y, ctx) === HIT_PLAYER) startAnim(boss.eggman, 'eggBallEggmanLaugh', true);
      ctx.draw(s, x, y);
    },
    // Task_8030364: off toward the middle of the screen at 2 px a frame, up at 6 px a frame or 3 px faster
    // than it was going
    blow(ctx) {
      const [x] = pos();
      qvx = x < ctx.cam.x + (SCREEN_W >> 1) ? 2 * 256 : -2 * 256;
      if (qvy === 0) qvy = -6 * 256; else if (qvy < 0) qvy -= 3 * 256; else qvy += 3 * 256;
      t = 0; state = 'tumble';
      return states.tumble(ctx);
    },
    // Task_8030414
    tumble(ctx) {
      if (t++ > 180) return false;
      qvy += 40; qx += qvx; qy += qvy;
      const [x, y] = pos();
      if (qvy > 0) {
        const d = floor(ctx, x, y);
        if (d < 0) { qy += d * 256; qvy = (qvy >> 2) - qvy; }
      }
      if ((t & 7) === 0) {
        const r = ctx.world.random();
        ctx.add(bossExplosion(ctx, (x + (r & 0x3F) - 32) << 8, (y + 32 - ((r & 0x3F0000) >>> 16)) << 8));
      }
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
    },
  };
  const task = {
    go: false,
    blow() { state = 'blow'; },
    run(ctx) { return states[state](ctx) !== false; },
  };
  return task;
}

// A pipe (Task_PipeInitialDelay and Task_PipeExtend): a second and a half after the boss appears it slides a
// pixel a frame into place from 32 px out; the two in the floor are solid. Once the boss is beaten it slides
// back out at 2 px a frame and goes.
function pipe(i, x0, y0, boss) {
  const [dx, dy, name, flipX, flipY] = PIPES[i], [sx, sy] = PIPE_STARTS[i];
  const s = { ...makeSprite(name, { order: i & 2 ? 18 : 14, flipX, flipY }), x: 0, y: 0 };
  let delay = PIPE_DELAY, ox = 0, oy = 0;
  return {
    run(ctx) {
      if (delay > 0) {
        if (--delay === 0) { ox = sx; oy = sy; }
        return true;
      }
      if (boss.hits > HITS - 1) {
        ox = s16(ox + (sx >> 4)); oy = s16(oy + (sy >> 4));
        if (ox === sx && oy === sy) return false;
      } else {
        ox -= Math.sign(ox); oy -= Math.sign(oy);
      }
      s.x = x0 + dx + ox; s.y = y0 + dy + oy;
      if (!(6 & i)) platform(s, s.boxes[0], ctx.player, ctx.world.terrain);
      animate(s, ctx.anims);
      ctx.draw(s, s.x, s.y);
      return true;
    },
  };
}
