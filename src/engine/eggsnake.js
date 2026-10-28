// Cosmic Angel's boss, the Egg Snake (SAT-R decompilation, src/game/sa1/stage/enemies/boss_6_egg_snake.c; the
// segments' task, Task_8033AA0, follows its assembly, which the C doesn't match). Its body is nine segments in
// a row, 32 px apart, that Sonic stands on; its head sways along them, riding their bumps. Landing on a segment
// faster than 4 px a frame bounces the segments around it, and when the head is within two segments of that
// one, it opens up: Eggman is exposed inside it for 480, 300, 180 or 90 frames, and hitting him from the air
// counts. A hit makes the head sway faster for 120 frames. Bursts of three laser shots fly at Sonic every 600
// frames, sooner with each hit. Eight hits beat it, six on Easy: its spikes fly off, it falls through the arena,
// throwing debris, and after 60 frames on the floor below Eggman rises in the Egg Mobile, Sonic is held still
// and then walks after him, and the act's results come (`world.stageResults`, the end-of-act flow).

import { makeSprite, startAnim, animate } from './objects.js';
import { platformTop } from './collide.js';
import { tileFloor, LAYER_BACK } from './terrain.js';
import { SINE } from './trig.js';
import { setBossCamBounds, preBossCameraPan, bossPart, bossDebris, bossExplosion, bossHit26, HIT_ENEMY, HIT_PLAYER } from './bosses.js';
import { SONG } from '../sound/songs.js';
import { SCREEN_W, SCREEN_H } from './constants.js';

export const EGG_SNAKE = 27;

const I = v => v >> 8;
const s8 = v => (v << 24) >> 24, s16 = v => (v << 16) >> 16;
const Div = (a, b) => Math.trunc(a / b);
const q8 = v => Math.round(v * 256);

const SEGMENTS = 9;
// the tasks: the segments' manager, then each segment, the boss, its laser and its shots
const MANAGER = 0x2000, SEGMENT = 0x2001, BOSS = 0x2100, LASER = 0x2200, SHOTS = 0x2300;
const MUSIC_BOSS = 0x13, MUSIC_BOSS_OVER = 0x33;   // gMusicManagerState.unk1: boss song 3, and back to the act's
const HITS = 8;                                  // unk9A past 7; Easy starts it at 2
// the sway's speed after a hit, by the hits taken (gUnknown_084ACEE4), the frames to the next laser burst
// (gUnknown_084ACEF6), and how long the head stays open, picked at random (gUnknown_084ACF08)
const SWAY = [512, 512, 512, 512, 563, 614, 1536, 2304, 2304];
const BURST_WAIT = [600, 600, 600, 600, 499, 428, 375, 300, 300];
const OPEN_FOR = [480, 300, 180, 90];
// the halfword before the sine table in the ROM (0x0809B3EE), the top of a pointer, which an angle of -1 reads
const SINE_BEFORE = 0x0800;
// the head's and Eggman's variants: the head closes, opens, is open, and is shut; Eggman inside it, open and
// shut, as he is, laughing when Sonic is hurt, and hit
const HEAD = ['eggSnakeClose', 'eggSnakeOpen', 'eggSnakeOpened', 'eggSnakeHead'];
const EGGMAN = ['eggSnakeEggmanOpen', 'eggSnakeEggmanOpenLaugh', 'eggSnakeEggmanOpenHit', 'eggSnakeEggman', 'eggSnakeEggmanLaugh', 'eggSnakeEggmanHit'];
const EGG_MOBILE = ['eggMobile', 'eggMobileTurn'];
const FLEEING = { 4: 'eggmanFlee', 6: 'eggmanFly', 7: 'eggmanTaunt', 9: 'eggmanTurn' };
// what the beaten boss holds for Sonic's controls (heldInput): nothing, or the way he must walk
const PAD = { left: false, right: false, up: false, down: false, jump: false, attack: false, boost: false, jumpPressed: false, attackPressed: false, boostPressed: false };
const HOLD_RIGHT = { ...PAD, right: true }, HOLD_LEFT = { ...PAD, left: true };

// a sprite picked by the original's variant numbers: another variant restarts at the next update, the same
// one carries on unless `restart` (prevVariant = 0xFF)
function variantSprite(names, variant, opts) {
  const s = makeSprite(names[variant], opts);
  s.names = names; s.variant = variant;
  return s;
}
function setVariant(s, variant, restart = false) {
  s.variant = variant;
  startAnim(s, s.names[variant], restart);
}

/**
 * sub_8004418: the angle (1024 a turn) of (y, x), linear within each eighth of the turn; -1 for (0, 0). The
 * distances times 128 are kept to 16 bits, as the original's are.
 */
function octant(x, y) {
  if ((x | y) === 0) return -1;
  let index = 0, f;
  if (x <= 0) { x = s16(-x); index = 4; }
  if (y <= 0) { y = s16(-y); index += 2; }
  if (x >= y) { y = s16(y * 128); f = s16(x === 0 ? y : Div(y, x)); }
  else { index++; x = s16(x * 128); f = s16(y === 0 ? x : Div(x, y)); }
  const a = [1, 0, 2, 3, 6, 7, 5, 4][index];
  if (a & 1) f = s16(128 - f);
  return (f + a * 128) & 0x3FF;
}

/** The Egg Snake (CreateEntity_EggSnake): its arena's camera bounds close in from the frame it spawns. */
export function eggSnake(e, slot, anims, ctx0) {
  const x0 = e.x, y0 = e.y, cam = ctx0.world.camera;
  const b = {
    s: variantSprite(HEAD, 3, { order: 22 }), s2: variantSprite(EGGMAN, 3, { order: 21 }), body: true,
    sx: 0, sy: 0,             // the head's place on the screen (s->x, s->y), which the laser takes
    bumps: new Int16Array(SEGMENTS),   // gUnknown_03005870: each segment's offset down
    timer: 120, flash: 0, phase: 0, laserOn: false, hits: 0, hitsAtOpen: 0, eggman: 0,
    laserGone: false, slotTaken: false,   // the laser's task freed, and then taken over by the boss's debris
    qx: 0x1000, qy: 0, vx: 0, vy: 0, angle: 0, speed: 0x200, accel: 0, target: 0, swayX: 0, swayY: 0,
    fallSpeed: 0, baseX: 0, baseY: 0,
  };
  if (ctx0.world.difficulty !== 0) b.hits = 2;   // Easy
  const m = { mode: 0, bounced: 0, stoodOn: 0, rising: 0, after: 0, depth: 0, push: 0, frames: 0 };
  ctx0.add(setBossCamBounds(cam, y0 - 128, y0 + 32, x0 - 144, x0 + 176));

  // where the head is drawn, and Eggman in it (sub_803426C, sub_803424C)
  const place = (ctx, x, y) => { b.sx = s16(x - ctx.cam.x); b.sy = s16(y - ctx.cam.y); };
  const draw = (ctx, s) => ctx.draw(s, b.sx + ctx.cam.x, b.sy + ctx.cam.y);
  // the hit flash for 16 of the 32 frames after a hit, two frames in four (sub_8031ED0)
  function show(ctx) {
    const { s, s2 } = b;
    if (b.flash !== 0 && --b.flash > 16 && !(b.flash & 2) && !ctx.player.dead) s.white = true;
    draw(ctx, s);
    if (b.eggman === 0) draw(ctx, s2);
  }
  // Sonic against the head: hitting Eggman in it from the air counts while it isn't flashing, and Eggman
  // laughs when it hurts him (sub_8031D88)
  function collide(ctx, x, y) {
    const { s, s2 } = b;
    s.white = false;
    if (b.flash !== 0) return;
    const hit = bossHit26(s, x, y, ctx);
    if (hit === HIT_ENEMY) {
      b.hits++; b.flash = 32;
      if (s.variant === 2) setVariant(s2, 2);
      if (s.variant === 3) setVariant(s2, 5);
      s2.anim.done = false; over2 = null;
      ctx.world.playSound(SONG.BOSS_HIT);
    } else if (hit === HIT_PLAYER) {
      if (s.variant === 2) setVariant(s2, 1);
      if (s.variant === 3) setVariant(s2, 4);
      s2.anim.done = false; over2 = null;
    }
  }
  // Eggman back as he was once he has laughed or been hit (sub_8031F74)
  function settle() {
    const { s, s2 } = b;
    if (s2.variant === 0 || s2.variant === 3 || !(over2 ?? s2.anim.done)) return;
    setVariant(s2, s.variant === 2 ? 0 : s.variant === 3 ? 3 : s2.variant, true);
  }
  // a variant set alone, as a shot sets Eggman's, leaves the last animation's end flag (ANIM_OVER) as it was
  // until the sprite next updates: `over2` holds it meanwhile
  let over2 = null;
  const animate2 = ctx => { animate(b.s2, ctx.anims); over2 = null; };

  // Task_EggSnakeInit: the head waits shut 120 frames, the boss music starts, and 60 frames later Eggman
  // laughs; 60 frames after that the fight starts
  function intro(ctx) {
    const { s, s2 } = b;
    if (b.timer === 120 && b.phase === 0) {
      ctx.add(manager(), MANAGER);
      ctx.add(laser(), LASER);
    }
    const r = (SINE[b.angle] * 15) >> 11;
    const x = s16(x0 + I(b.qx) + r);
    let k = s16(r + 0x90);
    if (k < 0) k += 31;
    place(ctx, x, s16(b.bumps[k >> 5] + y0 + I(b.qy)));
    animate(s, ctx.anims); animate2(ctx);
    show(ctx);
    switch (b.phase) {
      case 0:
        if (--b.timer === 0) { ctx.world.musicState(MUSIC_BOSS); b.timer = 60; b.phase++; }
        break;
      case 1:
        if (--b.timer === 0) { setVariant(s2, 4); b.phase++; }
        break;
      case 2:
        if (s2.anim.done) { setVariant(s2, 3); b.timer = 60; b.phase++; }
        break;
      case 3:
        if (--b.timer === 0) { b.laserOn = true; b.phase = 0; step = fight; }
        break;
    }
    return true;
  }

  // Task_8032370: the head sways along the body, by the sine of an angle that turns `speed` / 256 steps a
  // frame, its height read between the two segments under it
  function fight(ctx) {
    const { s, s2 } = b;
    b.speed = s16(b.speed + b.accel);
    b.angle = (b.angle - I(b.speed)) & 0x3FF;
    const r = (SINE[b.angle] * 15) >> 11, x = s16(x0 + I(b.qx) + r);
    const t = s16(r + 0x80), n = (t < 0 ? t + 31 : t) >> 5, at = n & 0xFF, frac = s16(t - (n << 5));
    let d = (b.bumps[at + 1] - b.bumps[at]) * frac;
    if (d < 0) d += 31;
    const dy = s16(b.bumps[at] + (d >> 5)), y = s16(dy + y0 + I(b.qy));
    b.swayX = r; b.swayY = dy;
    collide(ctx, x, y);
    if (b.hits >= HITS) return beaten(ctx);
    place(ctx, x, y);
    settle();
    animate(s, ctx.anims);
    if (b.eggman === 0) animate2(ctx);
    show(ctx);
    switch (b.phase) {
      case 0: {
        // swaying: a bounce within two segments of the one under the head, neither end, opens it
        if (b.speed < 0x200) { b.speed = 0x200; b.accel = 0; }
        let k = r + 0x90;
        if (k < 0) k += 31;
        const under = (k >> 5) & 0xFF;
        if (under !== 0 && under !== 8 && m.bounced !== 0 && m.bounced !== 8 && s8(under) >= s8(m.bounced - 2)
          && s8(under) <= s8(m.bounced + 2) && m.rising !== 0) {
          b.speed = 0x200; b.accel = 0; b.phase++;
        }
        break;
      }
      case 1:
        // it opens once the bounce comes back up, Eggman hidden until it is open
        if (s.variant !== 1) {
          if (m.push >= 0) return true;
          setVariant(s, 1, true); b.eggman = 0xFF;
          return true;
        }
        if (!s.anim.done) return true;
        setVariant(s, 2, true); setVariant(s2, 0); b.eggman = 0;
        b.timer = OPEN_FOR[((ctx.world.random() + ctx.world.tick) >>> 0) & 3];
        b.hitsAtOpen = b.hits; b.phase++;
        break;
      case 2:
        // open until its time is up, or until the flash after a hit is half over
        if (b.flash !== 0) {
          if (b.flash > 16) return true;
        } else if ((b.timer = (b.timer - 1) & 0xFFFF) !== 0) break;
        setVariant(s, 0, true); b.eggman = 0xFF; b.phase++;
        break;
      case 3:
        // shut again: after a hit it sways faster for 120 frames
        if (!s.anim.done) break;
        setVariant(s, 3, true); setVariant(s2, 3); b.eggman = 0;
        b.accel = 0x40; b.target = SWAY[b.hits]; b.timer = 120;
        b.phase += b.hits === b.hitsAtOpen ? 2 : 1;
        break;
      case 4:
        if (b.speed >= b.target) { b.speed = b.target; b.accel = 0; }
        if ((b.timer = (b.timer - 1) & 0xFFFF) === 0) { b.accel = -0x40; b.phase = 0; }
        break;
      case 5:
        if (b.speed >= 0x200) { b.speed = 0x200; b.accel = 0; b.phase = 0; }
        break;
    }
    return true;
  }

  // sub_80327C4: the eighth hit. Its four spikes fly off, the camera stops sideways and may go 160 px lower
  // (the widescreen view's arena with it), the clock, the rings and the entities stop (gStageFlags |= 3), 1000
  // points, and it starts to fall
  function beaten(ctx) {
    b.qx += b.swayX << 8; b.qy += b.swayY << 8;
    const x = s16(x0 + I(b.qx)), y = s16(y0 + I(b.qy));
    setVariant(b.s2, 2);
    b.fallSpeed = -0x80;
    ctx.world.playSound(SONG.EXPLOSION);
    for (const [dx, dy, vx, spin] of [[0, 0, -0x100, 0x100], [16, 16, -0x400, 0x200], [-16, 16, 0x200, 0x300], [-16, 16, 0x80, 0x380]]) {
      ctx.add(bossPart(x + dx, y + dy, 'eggSnakeSpike', ctx.anims, { vx, vy: -0x200, spin, grow: 0 }));
    }
    cam.minX = ctx.cam.x; cam.maxX = ctx.cam.x;
    cam.arena = { minX: cam.minX, maxX: cam.maxX + SCREEN_W, minY: cam.maxY, maxY: cam.maxY + 320 };
    ctx.add(preBossCameraPan(cam, cam.maxY, cam.maxY + 320));
    ctx.world.stopStage();
    ctx.world.addScore(1000);
    step = falling;
    return falling(ctx);
  }

  // Task_8032AF8: it falls, 5/256 px a frame faster each frame, throwing debris every 8 frames, until it is
  // inside the floor (sub_801F100)
  function falling(ctx) {
    const { s, s2 } = b;
    b.fallSpeed = s16(b.fallSpeed + 5);
    b.qy += b.fallSpeed;
    const x = s16(x0 + I(b.qx)), y = s16(y0 + I(b.qy));
    if (tileFloor(ctx.world.terrain, x, y, LAYER_BACK) < 0) { b.timer = 60; step = landed; return true; }
    s.white = false;
    b.timer = (b.timer + 1) & 0xFFFF;
    if ((b.timer & 7) === 0) { bossDebris(ctx, x, y + 32, 5); if (b.laserGone) b.slotTaken = true; }
    place(ctx, x, y);
    animate(s, ctx.anims); animate2(ctx);
    draw(ctx, s); draw(ctx, s2);
    return true;
  }

  // sub_8032D44: 60 frames where it landed; then the segments let Sonic go and blink, the camera (and the
  // widescreen view's arena) may go down to 2208, the act's music comes back, and Eggman is in the Egg Mobile
  function landed(ctx) {
    if ((b.timer = (b.timer - 1) & 0xFFFF) !== 0) {
      place(ctx, s16(x0 + I(b.qx)), s16(y0 + I(b.qy)));
      animate(b.s, ctx.anims); animate2(ctx);
      draw(ctx, b.s); draw(ctx, b.s2);
      return true;
    }
    m.after = 0xFF;
    ctx.player.onObject = null;
    cam.maxY = 2208; cam.arena.maxY = cam.maxY + SCREEN_H;
    ctx.world.musicState(MUSIC_BOSS_OVER);
    b.baseX = s16(x0 + I(b.qx)); b.baseY = s16(y0 + I(b.qy));
    b.qx = 0; b.qy = 0; b.vx = 0; b.vy = -0x80; b.phase = 0;
    b.s = variantSprite(EGG_MOBILE, 0, { order: 19 }); b.s2 = variantSprite(FLEEING, 4, { order: 18 });
    b.body = false;
    step = escape;
    return true;
  }

  // sub_8032F58: the Egg Mobile rises 90 px at 0.5 px a frame while Sonic, once on the ground, is held still;
  // Eggman turns to face right if he must, taunts, and flies off at 2.5 px a frame, Sonic walking after him
  // until he is 120 px past the screen's right edge. The results start when Eggman is 120 px past it, and
  // 180 frames later the boss is gone.
  function escape(ctx) {
    const { s, s2 } = b, p = ctx.player, px = Math.floor(p.x);
    b.qx += b.vx; b.qy += b.vy;
    const x = s16(I(b.qx) + b.baseX), y = s16(I(b.qy) + b.baseY);
    if (b.phase <= 4) {
      place(ctx, x, y);
      animate(s, ctx.anims); animate(s2, ctx.anims);
      draw(ctx, s); draw(ctx, s2);
    }
    // in the last two steps he walks right while he is more than 96 px behind, and stops past the screen
    const follow = () => {
      if (px < x - 96) p.heldInput = HOLD_RIGHT;
      if (px > ctx.cam.x + 360) { p.xsp = 0; p.ysp = 0; p.gsp = 0; p.heldInput = null; }
    };
    const turned = () => s2.anim.done;
    switch (b.phase) {
      case 0:
        if (!p.air && !p.onObject) {
          if (!p.ignoreInput) {
            p.xsp = 0; p.ysp = 0; p.gsp = 0;
            p.ignoreInput = true; p.heldInput = x > px ? HOLD_RIGHT : HOLD_LEFT;
            cam.speedX = 0; cam.maxX = ctx.cam.x + 240; cam.arena.maxX = cam.maxX + SCREEN_W;
          } else p.heldInput = null;
        }
        if (b.qy < -90 * 256) { b.qy = -90 * 256; b.vy = 0; }
        if (b.vy === 0 && p.ignoreInput) {
          if (x > px) { b.phase += 2; setVariant(s2, 7, true); }
          else { b.phase++; setVariant(s, 1, true); setVariant(s2, 9, true); }
        }
        break;
      case 1:
        if (turned()) { b.phase++; setVariant(s, 0, true); setVariant(s2, 7, true); s.flipX = s2.flipX = true; }
        break;
      case 2:
        if (!turned()) break;
        if (s2.flipX) { b.phase += 2; setVariant(s2, 6, true); b.vx = 0x280; }
        else { b.phase++; setVariant(s, 1, true); setVariant(s2, 9, true); }
        break;
      case 3:
        if (turned()) { b.phase++; setVariant(s, 0, true); setVariant(s2, 6, true); s.flipX = s2.flipX = true; b.vx = 0x280; }
        break;
      case 4:
        follow();
        if (x - ctx.cam.x > 360) { b.phase++; b.timer = 180; ctx.world.stageResults?.(); }
        break;
      case 5:
        follow();
        if ((b.timer = (b.timer - 1) & 0xFFFF) === 0) return false;
        break;
    }
    return true;
  }

  // sub_8033878, Task_8033924, Task_8033AA0: the segments' manager. Sonic stands on the first segment he
  // touches, carried down a pixel and by its bump each frame. A landing faster than 4 px a frame (the speed
  // he had on the frame before) bounces it down by that speed, to 8 px at the ends and 32 between, and back
  // up past where it was by half that, the two either side following by thirds; otherwise the segment he
  // stands on sinks 1 px a frame (2 while above its place), to 8 px at the ends and 16 between, and the others
  // ease 1 px a frame toward a slope down to it, settling back once he is off. Once the boss is gone they
  // hold nobody, and the manager goes when Sonic is on the ground.
  function manager() {
    const ms = makeSprite('eggSnakeSegment', { order: 23 }), segs = [];
    const bumps = b.bumps;
    let before = null, first = true;
    // the bumps either side of segment k, down to it from both ends of the body
    const slope = (k, clampEach) => {
      for (let i = 0; i < SEGMENTS; i++) {
        if (i === k) continue;
        let d = s8(k - i), n = k;
        if (d < 0) { d = -d; n = 8 - k; }
        const t = s16(bumps[k] - Div(d * bumps[k], s8(n + 1)));
        if (t > bumps[i]) bumps[i]++;
        if (t < bumps[i]) bumps[i]--;
        if (clampEach) ends();
      }
    };
    // the two either side of a bounce, by thirds
    const thirds = k => {
      for (let i = 0; i < SEGMENTS; i++) {
        if (i === k) continue;
        const d = Math.abs(s8(k - i));
        if (d <= 2) bumps[i] = bumps[k] - Div(bumps[k] * d, 3);
      }
    };
    const ends = () => { if (bumps[0] > 8) bumps[0] = 8; if (bumps[8] > 8) bumps[8] = 8; };
    // the bounce's segment moves by `push` until it is `depth` down, then rises back
    const bounce = k => {
      bumps[k] += m.push;
      if (bumps[k] >= m.depth) { bumps[k] = m.depth; m.push = s16(1 - m.push); m.rising = 0; }
      return bumps[k] + Div(m.depth, 2) <= 0;
    };
    return {
      run(ctx) {
        const p = ctx.player;
        if (first) {
          first = false;
          before = { air: p.air, ysp: q8(p.ysp) };
          bumps.fill(0);
          animate(ms, ctx.anims);
          for (let i = 0; i < SEGMENTS; i++) {
            // each segment's own sprite in the original, which Sonic stands on (its x and box)
            const g = { x: x0 + i * 32 - 112, y: y0, boxes: [ms.boxes[0], null] };
            segs.push(g);
            ctx.add(segment(g, i, ms), SEGMENT + i);
          }
          return true;
        }
        const was = Int16Array.from(bumps);
        m.frames = (m.frames + 1) & 0xFFFF;
        let on = -1, done = false;
        if (m.after === 0) {
          for (let i = 0; i < SEGMENTS; i++) {
            const g = segs[i];
            if (platformTop(g, s16(g.x), s16(g.y + bumps[i]), g.boxes[0], p)) { on = i; break; }
          }
        } else if (!p.air && !p.onObject) done = true;
        if (on >= 0) {
          const k = on;
          let depth = k === 0 || k === 8 ? 8 : 16;
          m.stoodOn = k;
          if (before.air && before.ysp > 0x400) {
            m.mode = 2; m.bounced = k; m.rising = 0xFF;
            if (depth !== 8) depth *= 2;
            m.depth = depth;
            for (let i = 0; i < SEGMENTS; i++) {
              if (i !== k) { bumps[i] = 0; continue; }
              m.push = before.ysp >> 8;
              bumps[i] += m.push;
              if (bumps[i] > depth) bumps[i] = depth;
            }
          } else if (m.mode === 2) {
            if (bounce(k)) { bumps[k] = -Div(m.depth, 2); m.mode = 1; }
            thirds(k);
            ends();
          } else {
            m.mode = 1;
            bumps[k] += bumps[k] < 0 ? 2 : 1;
            if (bumps[k] > depth) bumps[k] = depth;
            slope(k, false);
            ends();
          }
          p.y += 1 + (bumps[k] - was[k]);
        } else if (m.mode === 2) {
          const k = m.bounced;
          if (bounce(k)) { bumps[k] = -Div(m.depth, 2); m.push = 0; m.mode = 0; }
          thirds(k);
          ends();
        } else {
          const k = m.stoodOn;
          m.mode = 0;
          if (bumps[k] > 0) bumps[k]--;
          if (bumps[k] < 0) { bumps[k] += 2; if (bumps[k] > 0) bumps[k] = 0; }
          slope(k, true);
        }
        before = { air: p.air, ysp: q8(p.ysp) };
        return !done;
      },
    };
  }

  // Task_8034098: a segment, drawn with the manager's sprite; once the boss is gone, only on the manager's
  // even frames (frozen when the manager goes), and gone 240 px above the screen
  function segment(g, i, ms) {
    return {
      run(ctx) {
        const y = s16(g.y + b.bumps[i]);
        if (y - ctx.cam.y < -240) return false;
        if (m.after === 0 || !(m.frames & 1)) ctx.draw(ms, s16(g.x), y);
        return true;
      },
    };
  }

  // sub_803330C, Task_8033480: the laser at the head's mouth. From the fight's start, every 600 frames (fewer
  // after hits) it fires three shots 60 frames apart, each as its flash plays, upside down while the head is
  // shut; it waits while the head opens or closes, and goes when the boss is beaten
  function laser() {
    const s = makeSprite('eggSnakeLaser', { order: 21 }), s2 = makeSprite('eggSnakeLaser', { order: 21, flipX: true });
    let wait = 600, shots = 0;
    return {
      run(ctx) {
        if (b.hits >= HITS) { b.laserGone = true; return false; }
        if (!b.laserOn) return true;
        const v = b.s.variant;
        if (wait !== 0) {
          if (--wait !== 0) return true;
          s.flipY = s2.flipY = false;
          if (v !== 2 && v !== 3) { wait = 1; return true; }
          if (v === 3) s.flipY = s2.flipY = true;
          startAnim(s, 'eggSnakeLaser', true); startAnim(s2, 'eggSnakeLaser', true);
          shots++;
          ctx.add(shot(ctx), SHOTS);
        } else if (s.anim.done || (v !== 2 && v !== 3)) {
          if (shots !== 3) wait = 60;
          else { wait = BURST_WAIT[b.hits]; shots = 0; }
        } else {
          animate(s, ctx.anims); draw(ctx, s);
          animate(s2, ctx.anims); draw(ctx, s2);
        }
        return true;
      },
    };
  }

  // CreateProjectile, Task_8033730: a shot from 16 px right of the head, at where Sonic is, 1 px a frame. It
  // goes once it is past the screen's side it flies toward while more than 32 px above it or 16 below it,
  // and blows up when it finds the boss beaten. It makes Eggman laugh when it hurts Sonic.
  //
  // It finds the boss as its task's parent's parent, through the laser's task. The laser goes on the frame the
  // boss is beaten, and its freed task no longer leads to the boss: the shots fly on, still able to hurt
  // Sonic, until the next task made takes that task over, the boss's next debris, and then they blow up (an
  // original-game bug; what they read meanwhile is taken as not beaten, as in mGBA).
  function shot(ctx0) {
    const s = makeSprite('eggSnakeShot', { order: 15 }), p = ctx0.player;
    let qx = (b.swayX + 16) << 8, qy = b.swayY << 8;
    const dx = s16(Math.floor(p.x) - (x0 + I(qx))), dy = s16(Math.floor(p.y) - (y0 + I(qy)));
    const a = octant(Div(dy, 2), Div(dx, 2));
    // from right where Sonic is, the angle is -1, and its sine is read from the halfword before the table
    const vx = SINE[a + 256] >> 6, vy = (a < 0 ? SINE_BEFORE : SINE[a]) >> 6;
    return {
      run(ctx) {
        qx += vx; qy += vy;
        const x = s16(x0 + I(qx)), y = s16(y0 + I(qy)), sx = s16(x - ctx.cam.x), sy = s16(y - ctx.cam.y);
        if ((sy < -32 || sy > 176) && (vx >= 0 ? sx > 256 : sx < -32)) return false;
        const found = !b.laserGone || b.slotTaken;
        if (found && b.hits >= HITS) { ctx.add(bossExplosion(ctx, x << 8, y << 8)); return false; }
        if (ctx.projectile(s, x, y) && found && b.body) {
          const { name } = b.s2.anim, over = over2 ?? b.s2.anim.done;
          if (b.s.variant === 2) setVariant(b.s2, 1);
          if (b.s.variant === 3) setVariant(b.s2, 4);
          if (b.s2.anim.name !== name) over2 = over;
        }
        animate(s, ctx.anims);
        ctx.draw(s, x, y);
        return true;
      },
    };
  }

  let step = intro;
  return { priority: BOSS, run: ctx => step(ctx) };
}
