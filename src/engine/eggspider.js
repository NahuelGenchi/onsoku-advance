// Ice Mountain's boss, the Egg Spider (SAT-R decompilation, src/game/sa1/stage/enemies/boss_4_egg_spider.c): it
// walks in along the arena's ceiling while the camera pans up and Eggman laughs, then walks to one of nine places
// picked at random, stops, and drops icicles from the ceiling for two seconds, more often with each of the eight
// hits it takes. The icicles fall slowly under the water, and Sonic can stand on them there. Beaten, it falls
// apart and drops to the floor, shedding bolts and explosions, the water goes down 160 px, and five seconds later
// Eggman escapes in the Egg Mobile.
// Positions are worked out from the spawn point every frame, as the original does; speeds and offsets in 1/256 px
// are its integers.

import { makeSprite, startAnim, animate } from './objects.js';
import { platformTop, overlap } from './collide.js';
import { tileFloor, LAYER_BACK } from './terrain.js';
import { screenShake, SCREEN_SHAKE } from './screenshake.js';
import { SONG } from '../sound/songs.js';
import { SCREEN_W, SCREEN_H } from './constants.js';
import { KNUCKLES } from './player.js';
import { HIT_ENEMY, HIT_PLAYER, bossHit, setBossCamBounds, preBossCameraPan, bossDebris, bossPart, eggMobileEscape } from './bosses.js';

const I = v => v >> 8;

export const EGG_SPIDER = 25;

const ICICLE_PRIORITY = 0x2200, WATER_PALETTES = 0xFFFD;
const MUSIC_BOSS = 0x10, MUSIC_BOSS_OVER = 0x30;   // gMusicManagerState.unk1: start the boss song, end it
const HITS = 8;

// how often it drops an icicle, in frames, for each number of hits taken (gUnknown_084ACEB4, 0x084A5DB4 in the
// USA ROM)
const DROP_EVERY = [59, 59, 59, 59, 39, 39, 39, 29, 19];
// the nine places it walks to, in px from the spawn point (gUnknown_084ACEC6, 0x084A5DC6)
const STOPS = [-288, -256, -224, -192, -160, -128, -96, -64, -32];
// how far Eggman sits lower than its top, by the first OAM entry of its frame (gUnknown_084ACED8, 0x084A5DD8)
const EGGMAN_DROP = [0, 1, 0, 1, 1, -1];

// a variant change that keeps the animation where it was when it is the same one, as when only the animation's
// end flag is cleared
function setVariant(s, name) {
  if (s.anim.name === name) s.anim.done = false;
  else startAnim(s, name);
}

// what his held controls stay at: nothing, or down for Knuckles floating on the water (animation 269)
const HOLD_DOWN = { left: false, right: false, up: false, down: true, jump: false, attack: false, boost: false, trick: false,
  jumpPressed: false, attackPressed: false, boostPressed: false, trickPressed: false };

/** CreateEntity_EggSpider: the boss's task and the arena's camera bounds; Sonic's controls are held. */
export function eggSpider(e, slot, anims, ctx0) {
  const x0 = e.x, y0 = e.y, world = ctx0.world, p0 = ctx0.player;
  const s = makeSprite('eggSpiderStill', { order: 22 }), s2 = makeSprite('eggSpiderEggman', { order: 21 });
  // offsets and speeds; the timer, the flash's and the drops' cooldowns, the hits taken and the phase (unk8C)
  const boss = { qx: 48 * 256, qy: 16 * 256, qvx: 0, qvy: 0, t: 120, flash: 0, rest: 0, hits: 0, phase: 0, target: 0, qvFall: 0 };
  if (world.difficulty !== 0) boss.hits = 2;   // Easy
  ctx0.add(setBossCamBounds(world.camera, y0, y0 + SCREEN_H + 32, x0 - (SCREEN_W + 80), x0));
  // the colours under the water follow the stage's from now on (InitWaterPalettes as a task)
  ctx0.add({ run(ctx) { ctx.world.initWaterPalettes(); return true; } }, WATER_PALETTES);
  p0.gsp = 0;
  p0.ignoreInput = true;
  p0.heldInput = p0.character === KNUCKLES && p0.state === 'waterFloat' ? HOLD_DOWN : null;
  world.scatter.ceilings = true;

  const pos = () => [x0 + I(boss.qx), y0 + I(boss.qy)];
  // Eggman sits on it, lower by its frame while it is whole (sub_8031D0C)
  function show(ctx, x, y) {
    const k = s.anim.name.startsWith('eggSpider') && s.anim.name !== 'eggSpiderBody' ? anims[s.anim.name].oamIndex?.[s.anim.i] : undefined;
    ctx.draw(s, x, y);
    ctx.draw(s2, x, y - (k === undefined ? 0 : EGGMAN_DROP[(k << 24) >> 24]));
  }
  // the hit's flash (sub_80309CC): the spider is the white OBJ window on every other pair of the 120 frames
  // after a hit, while Sonic is alive
  function flashing(p) {
    if (boss.flash === 0 || --boss.flash === 0) return false;
    return !(boss.flash & 2) && !p.dead;
  }
  // a frame's end: the animations step, Eggman follows, and both are drawn
  function step(ctx, x, y) {
    animate(s, anims); animate(s2, anims);
    s.white = flashing(ctx.player);
    show(ctx, x, y);
  }

  const states = {
    // Task_EggSpiderInit: two seconds, then it walks in a pixel a frame to 120 px left of the spawn point while
    // the camera pans up 96 px, a second still, Eggman laughs, a second, and the fight starts
    intro(ctx) {
      boss.qx += boss.qvx; boss.qy += boss.qvy;
      const [x, y] = pos();
      step(ctx, x, y);
      const cam = ctx.world.camera;
      switch (boss.phase) {
        case 0:
          if (--boss.t === 0) { ctx.world.musicState(MUSIC_BOSS); startAnim(s, 'eggSpider'); boss.qvx = -256; boss.phase++; }
          break;
        case 1:
          if (boss.qx <= -120 * 256) { startAnim(s, 'eggSpiderStill'); boss.qx = -120 * 256; boss.qvx = 0; boss.t = 60; boss.phase++; }
          if (cam.shiftY !== -96) cam.shiftY--;
          break;
        case 2:
          if (--boss.t === 0) { startAnim(s2, 'eggSpiderEggmanLaugh'); boss.phase++; }
          break;
        case 3:
          if (s2.anim.done) { startAnim(s2, 'eggSpiderEggman'); boss.t = 60; boss.phase++; }
          break;
        case 4:
          if (--boss.t === 0) { cam.shiftY = 0; ctx.player.ignoreInput = false; boss.phase = 0; boss.t = 30; state = 'fight'; }
          break;
      }
    },
    // sub_8030EE4: from rest, to a place at random 1 px a frame (another one when it is already there), half a
    // second still, then two seconds shaking the screen and dropping icicles; after the drops two more places
    // before the next
    fight(ctx) {
      const p = ctx.player;
      boss.qx += boss.qvx; boss.qy += boss.qvy;
      const [x, y] = pos();
      // sub_80308A4: the blending off while Sonic is alive, and Sonic against it while it isn't flashing
      if (!p.dead) ctx.world.blendOff();
      if (boss.flash === 0) {
        const hit = bossHit(s, x, y, ctx);
        if (hit === HIT_ENEMY) {
          boss.hits++; boss.flash = 120;
          setVariant(s2, 'eggSpiderEggmanHit');
          ctx.world.playSound(SONG.BOSS_HIT);
        } else if (hit === HIT_PLAYER) setVariant(s2, 'eggSpiderEggmanLaugh');
      }
      if (boss.hits >= HITS) { beaten(ctx, x, y); return; }
      // Eggman goes back to his still frame once laughing or wincing is over (sub_8031CD0)
      if (s2.anim.name !== 'eggSpiderEggman' && s2.anim.done) startAnim(s2, 'eggSpiderEggman', true);
      step(ctx, x, y);
      if (boss.rest !== 0) boss.rest--;
      switch (boss.phase) {
        case 0: {
          if (--boss.t !== 0) return;
          startAnim(s, 'eggSpider');
          const r = ctx.world.random() % 9;
          boss.target = STOPS[r] * 256;
          if (boss.qx === boss.target) boss.target = STOPS[(r + 5) % 9] * 256;
          boss.qvx = boss.qx <= boss.target ? 256 : -256;
          boss.phase = 1;
          break;
        }
        case 1:
          if (boss.qvx > 0 ? boss.qx > boss.target : boss.qx < boss.target) {
            boss.qx = boss.target; boss.qvx = 0; boss.t = 30; boss.phase = 2;
            startAnim(s, 'eggSpiderStill');
          }
          break;
        case 2:
          if (--boss.t === 0) {
            if (boss.rest !== 0) { boss.t = 30; boss.phase = 0; }
            else {
              boss.t = 120; boss.phase = 3;
              startAnim(s, 'eggSpiderDrop');
              if (!p.dead) ctx.add(screenShake(0x400, 0, 0x100, 120, 0x80), SCREEN_SHAKE);
            }
          }
          break;
        case 3:
          if (--boss.t === 0) { boss.t = 30; boss.phase = 0; boss.rest = 120; startAnim(s, 'eggSpiderStill'); }
          else if (boss.t % DROP_EVERY[boss.hits] === 0 && !p.dead) {
            ctx.add(icicle(ctx, x0, y0, boss, anims), ICICLE_PRIORITY);
            ctx.world.playSound(SONG.IMPACT);
          }
          break;
      }
    },
    // Task_8031480: it falls 2/256 px a frame faster each frame, throwing debris, until 2 seconds have passed
    // and the floor is under its feet; the blending is off while Sonic is alive
    fall(ctx) {
      boss.qvFall += 2; boss.qy += boss.qvFall;
      const [x, y] = pos();
      if (boss.t > 120 && tileFloor(ctx.world.terrain, x, y + 56, LAYER_BACK) < 0) { boss.qvFall = 0; state = 'wreck'; }
      s.white = false;
      if (!ctx.player.dead) ctx.world.blendOff();
      if ((++boss.t & 7) === 0) bossDebris(ctx, x, y + 32, 5);
      animate(s, anims); animate(s2, anims);
      show(ctx, x, y);
    },
    // sub_803170C: on the floor, still throwing debris, until 5 seconds after it was beaten; then Eggman escapes,
    // the act's end is made and the level's song comes back
    wreck(ctx) {
      const [x, y] = pos();
      s.white = false;
      if (boss.t++ > 300) {
        ctx.add(eggMobileEscape(x, y + 40, anims));
        ctx.world.bossDefeated(x, y);
        ctx.world.musicState(MUSIC_BOSS_OVER);
        slot.gone = true;
        return false;
      }
      if ((boss.t & 7) === 0) bossDebris(ctx, x, y + 32, 5);
      // the blending off, whether Sonic is alive or not
      ctx.world.blendOff();
      animate(s, anims); animate(s2, anims);
      show(ctx, x, y);
    },
  };

  // sub_80311D4: the eighth hit. Eggman winces, three parts fly off, what is left starts falling, the camera stops
  // across and drops back to the arena's floor (the widescreen view's arena with it), the water goes down 160 px
  // and 1000 points are scored
  function beaten(ctx, x, y) {
    startAnim(s2, 'eggSpiderEggmanHit');
    boss.qvFall = 0; boss.t = 0;
    ctx.world.playSound(SONG.EXPLOSION);
    startAnim(s, 'eggSpiderBody', true);
    ctx.add(bossPart(x, y, 'eggSpiderPart', anims, { vx: -256, vy: 0, spin: 0x80, grow: 0 }));
    ctx.add(bossPart(x + 16, y + 16, 'eggSpiderLeg', anims, { vx: -1024, vy: 0, spin: 0x80, grow: 0 }));
    ctx.add(bossPart(x - 16, y + 16, 'eggSpiderLeg', anims, { vx: 1024, vy: 0, spin: 0x380, grow: 0 }));
    const cam = ctx.world.camera, cx = Math.floor(cam.x);
    cam.minX = cx; cam.maxX = cx;
    // the pan's start leaves the top and bottom edges where they were
    const { minY, maxY } = cam;
    ctx.add(preBossCameraPan(cam, maxY, maxY + SCREEN_H));
    cam.minY = minY; cam.maxY = maxY;
    cam.arena = { minX: cx, maxX: cx + SCREEN_W, minY: maxY, maxY: maxY + SCREEN_H };
    if (ctx.world.water) ctx.world.water.target += SCREEN_H;
    ctx.world.addScore(1000);
    state = 'fall';
    states.fall(ctx);
  }

  let state = 'intro';
  // `boss` is its state, which tests read and set as they poke the original's
  return { boss, run: ctx => states[state](ctx) !== false };
}

// CreateIciclePlatform and sub_8031AB4: an icicle from 32 px above the spawn point, 10 to 310 px left of it in
// steps of 20, falling faster by 10 to 25/256 px a frame each frame, an eighth as fast under the water while the
// boss is whole. Under the water Sonic can land on it and is taken down with it, a pixel a frame faster, until it
// is more than 196 px down; its point hurts him while the boss is whole. It goes 208 px down.
function icicle(ctx0, x0, y0, boss, anims) {
  const random = ctx0.world.random;
  const qx = -((((random() >>> 1) & 0xF) * 20) + 10) * 256;
  random();
  const accel = (random() & 0xF) + 10;
  const s = makeSprite('icicle', { order: 20 });
  let qy = -32 * 256, vy = 0;
  return {
    run(ctx) {
      const p = ctx.player, w = ctx.world.water, level = w ? w.level : -1;
      let under = false, moved;
      if (y0 + I(qy) - 17 < level) {
        vy += accel; qy += vy; moved = vy;
      } else {
        under = true;
        vy += boss.hits >= HITS ? accel : Math.trunc(accel / 8);
        moved = Math.trunc(vy / 8);
        qy += moved;
      }
      if (qy > 208 * 256) return false;
      const x = x0 + I(qx), y = y0 + I(qy);
      animate(s, anims);
      // sub_800BFEC: its point (box 1) on Sonic's body hurts him
      if (boss.hits < HITS && !p.dead && s.boxes[1] && p.boxes[0] && overlap(x, y, s.boxes[1], Math.floor(p.x), Math.floor(p.y), p.boxes[0])) ctx.world.damage();
      if (under) platformTop(s, x, y, s.boxes[0], p);
      if (p.onObject === s) {
        if (qy > 196 * 256) p.onObject = null;
        else p.y += (256 + moved) / 256;
      }
      ctx.draw(s, x, y);
      return true;
    },
  };
}
