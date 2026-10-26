// X Zone's last boss, Egg X (SAT-R decompilation, src/game/sa1/stage/enemies/boss_x3_egg_x.c; Task_803775C,
// Task_8039A64 and sub_803A170 don't match there, and were read from their assembly instead). Positions are in
// whole pixels, offsets and speeds in 1/256 px.
//
// Once the camera reaches it, its left and right bounds close round the arena and its top and bottom pan to it;
// the screen shakes, the boss's music starts and the machine rises into the arena with its rotary arm. Between
// attacks it bobs, turning its arm round at random intervals; then it picks an attack by how far Sonic is and
// whether he is in the air: bouncing balls, a laser along the floor, a claw on a chain that grabs Sonic, swings
// him round shaking his rings out and throws him, or a charge across the arena. Eggman's cockpit takes the hits
// while the arm is down; eight wreck it, and it falls to the floor in flames, which starts the normal ending.

import { makeSprite, startAnim, animate } from './objects.js';
import { tileFloor } from './terrain.js';
import { SINE } from './trig.js';
import { SCREEN_W, SCREEN_H } from './constants.js';
import { screenShake, SCREEN_SHAKE } from './screenshake.js';
import { preBossCameraPan, camBounds, setCamBounds, bossHit, bossShotHit, bossBodyHit, rectHit, grabTest, explosion, debris,
  HIT_ENEMY, HIT_PLAYER, s8, s16, I } from './xbosses.js';
import { endAttack, standUp } from './player.js';
import { normalEnding } from './xending.js';

const SE_BOSS_HIT = 143, SE_EXPLOSION = 144, SE_IMPACT = 145, SE_LASER = 0xAC, SE_CLAW = 0xB3;
const MUSIC_START = 0x16, MUSIC_END = 0x36;   // gMusicManagerState.unk1: boss song 6, then its end
const HITS = 8;
const COS = a => SINE[a + 256], SIN = a => SINE[a];
const bob = a => (COS(a) >> 6) >> 6;          // COS_24_8(a) >> 6: the bob, ±4 px
const ARM_UP = -0x1700;                        // the arm's rest height above the machine, 23 px

// the chances (in %) of attacks 1–4: on the ground or in the air, Sonic within 120 px or further
// (gUnknown_084ACF1C, 24, 2C and 34 in the European ROM, at 0x4A5E1C on in the American one)
const CHANCES = { near: [30, 10, 30, 30], nearAir: [50, 50, 0, 0], far: [20, 40, 20, 20], farAir: [30, 50, 0, 20] };

/**
 * CreateEntity_EggX: the boss's task (Task_EggXMain, then the others), at the objects' priority. It turns the
 * first window on over the whole screen with no effects in it, brightening by 12/16 set up for the laser, and
 * fills OBJ palette 12 with white for the hit flash.
 */
export function eggX(e, slot, anims, ctx) {
  const b = {
    x0: e.x, y0: e.y,
    qx: 116 << 8, qy: 232 << 8, vx: 0, vy: 0, ax: 0,   // qUnk74 … qUnk80, unk84: the offset from the spawn point
    x: 0, y: 0,          // unk8C, unk8E: where it is this frame, with the bob
    bobAngle: 0,         // unk90
    timer: 120,          // unk92
    hits: 0,             // unk94 (2 to start with on the hard difficulty, which the engine doesn't have)
    flash: 0,            // unk95: the frames left of a hit's flash and of the time it can't be hit
    armed: 0,            // unk98: set once it has risen in, which lets its arm hurt
    phase: 0,            // unk99
    attack: 0,           // unk9A
    body: makeSprite('eggX', { order: 22 }),
    eggman: { ...makeSprite('eggXEggman0', { order: 21 }), variant: 0 },
    arm: null,           // task9C's data
  };
  const { body, eggman } = b;
  if (!ctx.player.dead) Object.assign(ctx.world.display, { win0: true, win0h: SCREEN_W, win0v: SCREEN_H, winIn: 0x1F1F, winOut: 0x1F1F, bldCnt: 0xBF, bldY: 12 });
  let main = waitForCamera;

  // Eggman's variants (animation 691): 0 at rest, 1 laughing as it arrives, 2 hurt, 3 laughing at Sonic
  function setEggman(variant) {
    eggman.variant = variant;
    startAnim(eggman, `eggXEggman${variant}`, true);
  }
  b.laugh = () => setEggman(3);   // something of the boss's hurt Sonic

  // Task_EggXMain: the camera's left and right bounds close round the arena, 144 px either side of the spawn
  // point, once the camera is 120 px from it; then its top and bottom pan to 40 px above it and 160 below, and
  // once they are there it rises. Nothing is drawn meanwhile.
  function waitForCamera(ctx) {
    const cam = ctx.world.cam;
    switch (b.phase) {
      case 0:
        if (b.x0 - SCREEN_W / 2 <= ctx.cam.x) {
          setCamBounds(cam, { minX: (b.x0 & 0xFFFF) - (SCREEN_W / 2 + 24), maxX: (b.x0 & 0xFFFF) + (SCREEN_W / 2 + 24) });
          b.phase = 1;
        }
        return;
      case 1:
        if (b.y0 - 40 <= ctx.cam.y) {
          const pan = preBossCameraPan(cam, b.y0 - 40, b.y0 + SCREEN_H);
          ctx.add(pan, pan.priority);
          b.phase = 2;
        }
        return;
      case 2: {
        const bounds = camBounds(cam);
        if (bounds.minY === b.y0 - 40 && bounds.maxY === b.y0 + SCREEN_H) b.phase = 3;
        return;
      }
      case 3:
        b.phase = 0;
        b.vy = -0x100;
        b.x = s16(b.x0 + I(b.qx)); b.y = s16(b.y0 + I(b.qy));
        b.arm = rotaryArm(b);
        ctx.add(b.arm.task, 0x2001);
        main = arrive;
        ctx.add(screenShake(0x400, 4, 0x100, 0x7A, 0x80), SCREEN_SHAKE);
        ctx.world.musicState(MUSIC_START);
    }
  }

  // its offset moves and it bobs 8/1024 of a turn a frame while it isn't rising or falling
  function place() {
    b.x = s16(b.x0 + I(b.qx)); b.y = s16(b.y0 + I(b.qy));
    if (b.vy === 0) {
      b.bobAngle = (b.bobAngle + 8) & 0x3FF;
      b.y = s16(b.y + bob(b.bobAngle));
    } else b.bobAngle = 0;
  }

  // sub_80370B4: for the first 16 of the 32 frames after a hit, every other two, the machine is drawn in
  // OBJ palette 12, all white (palId 253 on its palette 15), while Sonic is alive; then both sprites
  function show(ctx) {
    if (b.flash !== 0 && --b.flash > 16 && !(b.flash & 2) && !ctx.player.dead) body.allWhite = true;
    ctx.draw(body, b.x, b.y);
    ctx.draw(eggman, b.x, b.y);
  }

  // Task_803753C: up at 1 px a frame to 110 px below the spawn point; 15 frames later its arm comes down,
  // Eggman laughs once it's there, then the arm goes back up, and 15 frames after that the fight starts
  function arrive(ctx) {
    const arm = b.arm;
    b.qx += b.vx; b.qy += b.vy;
    place();
    animate(body, ctx.anims); animate(eggman, ctx.anims);
    show(ctx);
    switch (b.phase) {
      case 0:
        if (b.qy <= 110 << 8) { b.qy = 110 << 8; b.vx = 0; b.vy = 0; b.timer = 15; b.phase++; }
        break;
      case 1:
        if (--b.timer === 0) { arm.state = 1; b.phase++; }
        break;
      case 2:
        if (arm.state === 4) { setEggman(1); b.phase++; }
        break;
      case 3:
        if (eggman.anim.done) { arm.state = 5; setEggman(0); b.phase++; }
        break;
      case 4:
        if (arm.state === 7) { b.timer = 15; b.phase++; }
        break;
      case 5:
        if (--b.timer === 0) { b.armed = 0xFF; b.phase = 0; main = fight; }
        break;
    }
  }

  // sub_8036E20: the flash goes, then, unless it is still flashing from the last hit, Sonic's attack on the
  // cockpit (only while the arm isn't all the way up) and the machine's body on Sonic
  function hitTest(ctx) {
    if (!ctx.player.dead) body.allWhite = false;
    if (b.flash !== 0) return;
    let hit = 0;
    if (!(b.arm.flags & 4)) hit = bossHit(body, b.x, b.y, ctx);
    if (hit === 0) hit = bossBodyHit(body, b.x, b.y, ctx);
    if (hit === HIT_ENEMY) {
      b.hits++;
      b.flash = 0x20;
      setEggman(2);
      ctx.world.playSound(SE_BOSS_HIT);
    } else if (hit === HIT_PLAYER) setEggman(3);
  }

  // sub_803711C: attack 1 to 4 at random, by CHANCES
  function pickAttack(ctx, x) {
    const d = Math.abs(s16(Math.floor(ctx.player.x) - x));
    const chances = ctx.player.air ? (d > 120 ? CHANCES.farAir : CHANCES.nearAir) : (d > 120 ? CHANCES.far : CHANCES.near);
    let r = ctx.world.random() % 100, i = 0;
    for (; i < 4; i++) {
      r -= chances[i];
      if (r <= 0) break;
    }
    return i + 1;
  }

  // the laser's band (Task_803775C's case 0x20, from its assembly): up to 12 px above and below the machine's
  // middle, the window's height growing and shrinking over its 30 frames; inside the first window everything
  // is brightened, from 32 px in front of the machine to the screen's edge, and touching that hurts Sonic
  function laser(ctx) {
    const display = ctx.world.display, alive = !ctx.player.dead || ctx.world.lives !== 0;
    if (--b.timer === 0) {
      b.phase = 4;
      if (alive) Object.assign(display, { winIn: 0x1F1F, win0h: SCREEN_W, win0v: SCREEN_H });
      return;
    }
    if (alive) display.winIn = 0x3F3F;
    let half = 15 - Math.abs(s16(b.timer - 15)), reach = half;
    if (half > 11) { half = 12; reach = 11; }
    const sx = s16(b.x - ctx.cam.x), sy = s16(b.y - ctx.cam.y);
    const top = s16(sy - half);
    let bottom = s16(sy + half);
    if (bottom > SCREEN_H) bottom = SCREEN_H;
    const rect = body.flipX ? [s8(sx - 88), -reach, 120, reach] : [-120, -reach, s8(sx - 152), reach];
    if (alive) {
      display.win0h = (body.flipX ? ((sx + 32) << 8) | SCREEN_W : sx - 32) & 0xFFFF;
      display.win0v = ((top << 8) | bottom) & 0xFFFF;
    }
    if (rectHit(rect, s16(ctx.cam.x + SCREEN_W / 2), b.y, ctx) === HIT_PLAYER) setEggman(3);
  }

  // whether it has reached `limit` on its offset, the way it is going (left unflipped, right flipped)
  const reached = (left, right) => (body.flipX ? b.qx >= right : b.qx <= left);
  function turnRound() { body.flipX = !body.flipX; eggman.flipX = !eggman.flipX; }

  // Task_803775C: the fight
  function fight(ctx) {
    const arm = b.arm;
    b.vx += b.ax;
    b.qx += body.flipX ? -b.vx : b.vx;
    b.qy += b.vy;
    place();
    hitTest(ctx);
    if (b.hits >= HITS) { wrecked(ctx); return; }
    if (eggman.variant !== 0 && eggman.anim.done) setEggman(0);
    animate(body, ctx.anims); animate(eggman, ctx.anims);
    show(ctx);
    switch (b.phase) {
      case 0:
        // the arm turns round between attacks for 90, 180 or 240 frames
        b.attack = 0;
        arm.state = 8;
        b.phase++;
        b.timer = [0x5A, 0xB4, 0xF0, 0x5A][(ctx.world.random() & 0x30) >> 4];
        // falls through
      case 1:
        if (--b.timer !== 0) return;
        b.attack = pickAttack(ctx, b.x);
        if (b.attack !== 4) { b.timer = 10; b.phase++; } else { arm.state = 10; b.timer = 0x14; b.phase = 0x40; }
        break;
      case 2:
        arm.flags &= 1;
        if (arm.flags === 0) return;
        if (--b.timer === 0) { b.timer = 10; b.phase++; arm.state = 10; }
        break;
      case 3:
        if (!(arm.flags & 2) || --b.timer !== 0) return;
        arm.state = 13;
        b.phase = b.attack * 0x10;
        if (b.attack === 2) { b.timer = 30; ctx.world.playSound(SE_LASER); } else if (b.attack === 1) b.timer = 0;
        break;
      case 4:
        arm.state = 15;
        b.attack = 0;
        b.phase++;
        break;
      case 5:
        if (arm.flags & 4) b.phase = 0;
        break;
      // attack 1: a ball shot forward, which throws the machine back 2 px a frame, slowing by 1/4 px a frame
      // and then less, until it is back where it was
      case 0x10:
        ctx.add(bouncingBall(b, ctx), 0x2100);
        b.timer++;
        b.vx = 0x200; b.ax = -0x40;
        b.phase++;
        break;
      case 0x11: {
        if (b.vx <= 0) b.ax -= Math.trunc(b.ax / 4);
        let stop = false;
        if (body.flipX ? b.qx >= -0x7400 : b.qx <= 0x7400) { b.qx = body.flipX ? -0x7400 : 0x7400; stop = true; }
        if (stop) { b.vx = 0; b.ax = 0; b.phase = b.timer !== 0 ? 4 : 0x10; }
        break;
      }
      case 0x20: laser(ctx); break;
      // attack 3: the claw; it sets the phase on to 0x32 when it comes back empty, or to 0x33 once it has
      // swung Sonic round four times
      case 0x30:
        ctx.add(claw(b, ctx), 0x2100);
        b.phase++;
        break;
      case 0x32: b.phase = 4; break;
      // with Sonic, it charges back 2 px a frame to 208 px off the spawn point, turns round, and comes back to
      // its side
      case 0x33:
        b.vx = -0x200; b.timer = 0;
        b.phase++;
        break;
      case 0x34:
        if (b.timer !== 0) { arm.state = 15; b.timer = 0; }
        if (reached(-0xD000, 0xD000)) {
          b.qx = body.flipX ? 0xD000 : -0xD000;
          turnRound();
          b.phase++;
        }
        break;
      case 0x35:
        if (reached(0x7400, -0x7400)) { b.qx = body.flipX ? -0x7400 : 0x7400; b.vx = 0; b.phase = 0; }
        break;
      // attack 4: with the arm down, it charges forward at 3 px a frame to 208 px off the spawn point, turns
      // round and comes back at 2 px a frame to the other side, and waits there for the arm to go up
      case 0x40:
        if ((arm.flags & 2) && --b.timer === 0) { b.vx = -0x300; b.phase++; }
        break;
      case 0x41:
        if (reached(-0xD000, 0xD000)) {
          b.vx = -0x200;
          arm.state = 0x13;
          b.qx = body.flipX ? 0xD000 : -0xD000;
          turnRound();
          b.phase++;
        }
        break;
      case 0x42:
        if (reached(116 << 8, -116 << 8)) {
          b.qx = body.flipX ? -116 << 8 : 116 << 8;
          b.vx = 0;
          if (arm.flags & 4) b.phase = 0;
        }
        break;
    }
  }

  // sub_803803C: the eighth hit stops it, Eggman hurt, and the camera stays where it is; an explosion's sound,
  // the first window and the brightening go, Sonic's controls are taken from him, the clock, the rings and the
  // act's objects stop, and 1000 points
  function wrecked(ctx) {
    b.phase = 0; b.vx = 0; b.vy = 0;
    setEggman(2);
    setCamBounds(ctx.world.cam, { minX: ctx.cam.x, maxX: ctx.cam.x + SCREEN_W });
    ctx.world.playSound(SE_EXPLOSION);
    if (!ctx.player.dead) Object.assign(ctx.world.display, { win0: false, winOut: 0, bldCnt: 0, bldY: 0 });
    const p = ctx.player;
    p.gsp = 0; p.ignoreInput = true; p.heldInput = null;
    ctx.world.freezeStage();
    ctx.world.addScore(1000);
    main = falling;
    falling(ctx);
  }

  // Task_8038154: it drops to the floor, throwing debris every 8 frames, and bounces back up a quarter as fast
  // until it lands for good; that starts the ending. 240 frames later four explosions go off round it and the
  // act's music comes back, and it is gone (Eggman doesn't flee in the normal ending)
  function falling(ctx) {
    if (b.phase <= 1) {
      if (b.phase === 0) b.vy += 0x10;
      b.qx += b.vx; b.qy += b.vy;
      b.x = s16(b.x0 + I(b.qx)); b.y = s16(b.y0 + I(b.qy));
      if (!(b.timer & 7)) debris(ctx, b.x, b.y + 16, b.y + 32);
      animate(body, ctx.anims); animate(eggman, ctx.anims);
      ctx.draw(body, b.x, b.y);
      ctx.draw(eggman, b.x, b.y);
    }
    switch (b.phase) {
      case 0: {
        b.timer = (b.timer - 1) & 0xFFFF;
        const d = tileFloor(ctx.world.terrain, b.x, b.y + 20, 1);
        if (d < 0) {
          b.qy += d << 8;
          b.vy = (b.vy >> 2) - b.vy;
          if (b.vy > -0x100) {
            b.vy = 0; b.timer = 240; b.phase++;
            ctx.add(normalEnding(), 0x1FFF);
          }
        }
        break;
      }
      case 1:
        if (--b.timer === 0) {
          ctx.world.musicState(MUSIC_END);
          for (const [dx, dy] of [[0, -24], [-16, 0], [16, 0], [0, 24]]) {
            const ex = explosion(ctx, (b.x + dx) << 8, (b.y + dy) << 8);
            ctx.add(ex, ex.priority);
          }
          b.phase++;
        }
        break;
      case 2:
        slot.gone = true;
        return false;
    }
    return true;
  }

  return { run: ctx => main(ctx) !== false };
}

// sub_8038F04 and Task_8039264: the rotary arm, two sprites on the machine (animation 688: one variant for each
// of its turns and for each attack, and the second sprite's the next variant on), at OAM order 20, facing and
// flashing with it (palId 254 on its palette 14). `state` is the boss's to set (unk79): it lowers the arm
// to the machine and raises it, turns it round between attacks and points it for each one; `flags` (unk7A)
// tell the boss the arm has turned to where it was asked to (1), is down (2) and is all the way up (4).
// After the boss's arm has hurt Sonic, Eggman laughs.
function rotaryArm(b) {
  const s = { ...makeSprite('eggXArm8', { order: 20 }), variant: 8 }, s2 = { ...makeSprite('eggXArm11', { order: 20 }), variant: 11 };
  const arm = { state: 0, flags: 0, target: 0, timer: 0, ax: 0, ay: ARM_UP, vxA: 0, vyA: 0, task: null };
  const set = (sprite, variant) => { sprite.variant = variant; startAnim(sprite, `eggXArm${variant}`, true); };
  const pair = (v, v2) => { set(s, v); set(s2, v2); };

  // sub_8039074: pointed for attack 1 (variants 4, 5), 2 (2, 3) or 3 (6, 7)
  function point(attack) {
    if (attack === 1) { pair(4, 5); arm.target = 4; } else if (attack === 2) { pair(2, 3); arm.target = 2; } else if (attack === 3) { pair(6, 7); arm.target = 6; }
  }
  // sub_8039108: back from an attack's pose
  function unpoint() {
    if (s.variant === 4) { pair(14, 17); arm.target = 14; } else if (s.variant === 2) { pair(15, 18); arm.target = 15; } else if (s.variant === 6) { pair(16, 19); arm.target = 16; }
  }
  // sub_803918C: each time a turn ends, the next one starts (8, 10, 9 and round), unless it has reached the one
  // asked for; any other variant starts over
  function turn() {
    if (s.anim.done) {
      if (s.variant === arm.target) { arm.flags |= 1; return; }
      const next = { 8: [10, 13], 14: [10, 13], 9: [8, 11], 15: [8, 11], 10: [9, 12], 16: [9, 12] }[s.variant];
      if (next) pair(...next); else pair(s.variant, s2.variant);
    }
    arm.flags &= ~1;
  }
  // sub_803A900: the turn that points the arm for the attack
  const aim = attack => { if (attack >= 1 && attack <= 3) arm.target = attack + 7; };

  arm.task = {
    run(ctx) {
      s.flipX = s2.flipX = b.body.flipX;
      s.allWhite = s2.allWhite = !!b.body.allWhite;
      if (b.hits >= HITS) {
        if (arm.state !== 0) {
          if (s.variant !== 6) unpoint();
          arm.state = 0;
        }
        arm.vxA = 0; arm.vyA = 0;
        if (b.phase > 1) return false;
      } else {
        switch (arm.state) {
          case 1:
            arm.target = 8;
            if (arm.flags & 1) { arm.timer = 30; arm.state++; }
            break;
          case 2:
            if (--arm.timer === 0) { arm.vyA = 0x100; arm.state++; }
            break;
          case 3: case 11:
            if (arm.ay + arm.vyA >= 0) { arm.ay = 0; arm.vyA = 0; arm.state++; }
            break;
          case 5:
            arm.vyA = -0x100; arm.state++;
            break;
          case 8:
            arm.ay = ARM_UP; arm.target = 0; arm.state++;
            // falls through
          case 9:
            if (b.attack !== 0) aim(b.attack);
            break;
          case 10:
            arm.vyA = 0x200; arm.state++;
            if (arm.ay + arm.vyA >= 0) { arm.ay = 0; arm.vyA = 0; arm.state++; }
            break;
          case 13:
            point(b.attack); arm.state++;
            break;
          case 15:
            unpoint(); arm.timer = 10; arm.state++;
            // falls through
          case 16:
            if (--arm.timer === 0) { arm.vyA = -0x200; arm.state++; }
            break;
          case 19:
            arm.vyA = -0x200; arm.state += 2;
            break;
          case 6: case 17: case 21:
            if (arm.ay + arm.vyA <= ARM_UP) { arm.ay = ARM_UP; arm.vyA = 0; arm.state++; }
            break;
        }
      }
      arm.ax += arm.vxA; arm.ay += arm.vyA;
      if (arm.ay <= -23 << 8) arm.flags |= 4; else arm.flags &= ~4;
      if (arm.ay >= 0) arm.flags |= 2; else arm.flags &= ~2;
      const x = s16(I(arm.ax) + b.x), y = s16(I(arm.ay) + b.y);
      turn();
      if (b.armed !== 0 && b.flash === 0 && b.hits < HITS && bossShotHit(s, x, y, ctx) === HIT_PLAYER) b.laugh();
      animate(s, ctx.anims); animate(s2, ctx.anims);
      ctx.draw(s, x, y);
      ctx.draw(s2, x, y);
      return true;
    },
  };
  return arm;
}

// sub_803967C and Task_80397A8: a ball (animation 690, variant 1, OAM order 23) shot from 20 px in front of the
// machine, at random either 3 px a frame forward and 2 up, falling 40/256 px a frame faster, or 1.5 forward and
// 5 up, falling 48/256 faster. It bounces off the floor coming back up 3/4 as fast, hurts Sonic until the boss
// is wrecked, and goes 208 px either side of the spawn point.
function bouncingBall(b, ctx) {
  const far = (ctx.world.random() & 0x800) !== 0;
  const g = far ? 40 : 48, speed = far ? 3 << 8 : 0x180;
  let vy = far ? -2 << 8 : -5 << 8, qx = b.qx + (b.body.flipX ? 20 << 8 : -20 << 8), qy = b.qy;
  const vx = b.body.flipX ? speed : -speed, x0 = b.x0, y0 = b.y0;
  const s = makeSprite('eggXBall1', { order: 23 });
  ctx.world.playSound(SE_IMPACT);
  return {
    run(ctx) {
      vy = s16(vy + g); qx += vx; qy += vy;
      const x = s16(I(qx) + x0), y = s16(I(qy) + y0);
      const d = tileFloor(ctx.world.terrain, x, y + 8, 1);
      if (d < 0) { qy += d << 8; vy = s16(-vy + Math.trunc(vy / 4)); }
      if (b.hits < HITS && bossShotHit(s, x, y, ctx) === HIT_PLAYER) b.laugh();
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      return ((qx + 0xD000) >>> 0) <= 0x1A000;
    },
  };
}

// sub_8004418: a coarse angle of (x, y), 0–1023 per turn: 128 steps an eighth of a turn, by the smaller side
// over the larger, and -1 for (0, 0)
function coarseAngle(x, y) {
  if ((x | y) === 0) return -1;
  const OCTANTS = [1, 0, 2, 3, 6, 7, 5, 4];
  let index = 0;
  if (x <= 0) { x = s16(-x); index = 4; }
  if (y <= 0) { y = s16(-y); index += 2; }
  let fraction;
  if (x >= y) {
    y = s16(y * 128);
    fraction = s16(x === 0 ? y : Math.trunc(y / x));
  } else {
    index++;
    x = s16(x * 128);
    fraction = s16(y === 0 ? x : Math.trunc(x / y));
  }
  if (OCTANTS[index] & 1) fraction = s16(128 - fraction);
  fraction = s16(fraction + OCTANTS[index] * 128);
  return (fraction << 22) >>> 22;
}

// the angle a claw piece is drawn at, mirrored when it faces right: its place on the circle and its rotation
function mirrored(angle, flip) {
  return flip ? [(-angle - 0x200) & 0x3FF, -angle & 0x3FF] : [angle, angle];
}
// a point `radius` (1/256 px) along `angle` from (cx, cy)
const along = (angle, radius, cx, cy) => [(((COS(angle) >> 6) * radius) >> 16) + cx, (((SIN(angle) >> 6) * radius) >> 16) + cy];

/**
 * Sonic, thrown out of the claw (sub_803A170): 2 px a frame away from the way the claw faces and 5.875 up,
 * blinking for 120 frames and knocked back, stood up out of a ball with his feet where they were.
 */
function throwSonic(p, flip) {
  p.invulnerable = 120;
  p.xsp = flip ? -2 : 2;
  p.ysp = -0x5E0 / 256;
  p.rotation = 0;
  p.carried = false; p.ignoreInput = false; p.onObject = null; p.pushing = false; p.spinDashing = false;
  p.air = true;
  p.state = 'hurt';
  standUp(p);
  endAttack(p);
}

/**
 * sub_8039940 and Task_8039A64: the claw (animation 689, through the rotation hardware) on its chain, 26 px in
 * front of the machine and turning round its middle. It pulls in for 17 frames, aims at Sonic for 3, 1, 0.3 or
 * 5 seconds at random, turning 6/1024 of a turn a frame toward him (never pointing up), then shoots out at 6 px
 * a frame to 16 px past where he was, letting out a chain ball every 16 px. If it catches him (unless he is
 * blinking or invincible; with no rings he is hurt instead) it closes on him, pulls him in to 36 px out and
 * swings him round, his rings coming out five at a time on each swing; on the fourth swing the machine starts its
 * charge and on the fifth it throws him. Empty or after the throw it closes, comes back to 20 px out, turns
 * back to level and pulls back into the machine. It hurts Sonic until it shoots out.
 */
function claw(b, ctx) {
  const flip = b.body.flipX;
  const c = {
    cx: s16(b.x0 + I(b.qx) + (flip ? 26 : -26)), cy: s16(b.y0 + I(b.qy)),
    radius: 14 << 8, target: 0, dr: -2 << 8, angle: 0, dAngle: 0, shown: 0, timer: 0x11, chain: 0, state: 0, caught: false,
  };
  const s = makeSprite('eggXHand0', { order: 23, flipX: flip });
  const scale = { scaleX: flip ? -0x100 : 0x100, scaleY: 0x100, double: false };
  let rotation = 0, falling = null;
  const setHand = variant => startAnim(s, `eggXHand${variant}`, true);
  const grab = (p, x, y) => { p.x = x; p.y = y; p.rotation = flip ? ((-s16(c.angle)) >> 2) & 0xFF : (c.angle & 0xFFFF) >> 2 & 0xFF; };

  return {
    run(ctx) {
      if (falling) return falling(ctx);
      if (b.hits < HITS) { c.cx = s16(b.x + (flip ? 26 : -26)); c.cy = b.y; }
      c.radius += c.dr;
      c.shown = c.angle;
      const [place, turned] = mirrored(c.angle & 0xFFFF, flip);
      const [x, y] = along(place, c.radius, c.cx, c.cy);
      rotation = turned;
      animate(s, ctx.anims);
      ctx.draw(s, x, y, { rotation, ...scale });
      if (b.hits >= HITS) {
        falling = fallingPiece(s, x, y, 0x50, { rotation, ...scale });
        s.order = 23;
        return true;
      }
      const p = ctx.player;
      let hit = 0;
      if (c.state <= 1) hit = bossShotHit(s, x, y, ctx);
      else if (c.state === 2) {
        hit = grabTest(s, x, y, ctx);
        if (hit === HIT_PLAYER && ctx.world.ringCount === 0) { b.laugh(); ctx.world.damage(); hit = 0; }
      }
      if (hit === HIT_PLAYER) b.laugh();
      switch (c.state) {
        case 0:
          if (--c.timer === 0) {
            const r = (ctx.world.random() | 0) % 100;
            c.dr = 0; c.state++;
            c.timer = r - 35 <= 0 ? 0xB4 : r - 70 <= 0 ? 0x3C : r - 90 <= 0 ? 0x12 : 0x12C;
          }
          break;
        case 1: {
          const dx = Math.abs(c.cx - Math.floor(p.x)), dy = c.cy - Math.floor(p.y);
          let want = coarseAngle(s16(dy), s16(dx)) & 0xFFFF;
          if (((want - 225) & 0xFFFF) <= 286) want = 224;
          if (((want - 513) & 0xFFFF) <= 286) want = 800;
          const now = ((c.angle << 22) >> 16), to = ((want << 22) >> 16);
          if (now > to) c.angle = now >= to + 0x180 ? c.angle - 6 : want;
          else if (now < to) c.angle = now > to - 0x180 ? want : c.angle + 6;
          c.angle &= 0x3FF;
          if (--c.timer === 0) {
            const ex = c.cx - Math.floor(p.x), ey = c.cy - Math.floor(p.y);
            c.target = -0x1000 - ((Math.floor(Math.sqrt((((ex * ex) << 8) + ((ey * ey) << 8)) >>> 0)) & 0xFFFF) << 4);
            c.dr = -6 << 8;
            c.chain = 0;
            c.state++;
            s.order = 15;
            setHand(1);
            ctx.world.playSound(SE_CLAW);
          }
          break;
        }
        case 2: {
          const links = ((((-c.radius) >> 8) - 20) >> 4) + 1 & 0xFF;
          if (c.chain < links) { c.chain = links; ctx.add(chainBall(c, s.flipX, b), 0x2101); }
          if (hit === HIT_PLAYER) {
            c.caught = true; c.dr = 0; c.state = 7;
            setHand(2);
            p.pushing = false; p.spinDashing = false; endAttack(p);
            p.xsp = 0; p.ysp = 0; p.gsp = 0;
            p.carried = true; p.ignoreInput = true; p.heldInput = null;
            grab(p, x, y);
            p.state = 'grabbed';
          } else if (c.radius <= c.target) { c.dr = 0; c.state++; setHand(2); }
          break;
        }
        case 3:
          if (s.anim.done) { c.dr = 0x200; c.state++; }
          break;
        case 4:
          if (c.radius >= -0x1400) { c.radius = -0x1400; c.dr = 0; s.order = 23; setHand(0); c.state++; }
          break;
        case 5: {
          const a = s16(c.angle);
          if (a === 0) { s.order = 23; c.dr = 0x100; c.state++; }
          else if (a > 0x200) { c.angle = (c.angle + 6) & 0x3FF; if (c.angle <= 6) c.angle = 0; }
          else { c.angle = (c.angle - 6) & 0x3FF; if (c.angle > 0x200) c.angle = 0; }
          break;
        }
        case 6:
          if (c.radius > 0xDFF) {
            if (!c.caught) b.phase++; else b.timer = 1;
            return false;
          }
          break;
        case 7:
          grab(p, x, y);
          if (s.anim.done) { c.dr = 0x600; c.state++; }
          break;
        case 8:
          grab(p, x, y);
          if (c.radius >= -0x2400) { c.radius = -0x2400; c.dr = 0; c.dAngle = 0x10; c.timer = 0; c.state++; }
          break;
        case 9:
          grab(p, x, y);
          c.angle = (c.angle + c.dAngle) & 0x3FF;
          if (c.angle > 0x1FF) {
            const rings = ctx.world.ringCount;
            if (rings > 0 && c.dAngle < 0) ctx.world.loseRings(Math.min(rings, 5));
            c.dAngle = 0x10;
          }
          if (((c.angle - 0x100) & 0xFFFF) <= 0xFF) {
            c.dAngle = -0x10;
            c.timer = (c.timer + 1) & 0xFFFF;
            if (c.timer === 4) b.phase = 0x33;
            if (c.timer === 5) { throwSonic(p, flip); c.state = 5; }
          }
          break;
      }
      return true;
    },
  };
}

// sub_803A1D8 and Task_803A2F8: a chain ball (animation 690, variant 0, OAM order 24), the `n`th 16 px along the
// chain from the claw back toward the machine. It goes once it is more than 8 px out the other side, or the
// claw is pulling back in.
function chainBall(c, flip, b) {
  const n = c.chain, s = makeSprite('eggXBall0', { order: 24, flipX: flip });
  const scale = { scaleX: flip ? -0x100 : 0x100, scaleY: 0x100, double: false };
  let falling = null;
  return {
    run(ctx) {
      if (falling) return falling(ctx);
      const [place, rotation] = mirrored(s16(c.shown) & 0xFFFF, flip);
      const radius = c.radius + ((n * 16 + 8) << 8);
      const [x, y] = along(place, radius, c.cx, c.cy);
      animate(s, ctx.anims);
      ctx.draw(s, x, y, { rotation, ...scale });
      if (radius > 0x800 || c.state === 6) return false;
      if (b.hits >= HITS) falling = fallingPiece(s, x, y, 0x50 - n * 4, { rotation, ...scale });
      return true;
    },
  };
}

// Task_803A46C: once the boss is wrecked, a claw piece falls from (x, y), 32/256 px a frame faster, bouncing
// off the floor a quarter as fast the other way, and after `timer` frames it blows up
function fallingPiece(s, x, y, timer, affine) {
  let vy = 0, qy = y << 8;
  const qx = x << 8;
  return ctx => {
    vy = s16(vy + 0x20); qy += vy;
    const wx = I(qx), wy = I(qy);
    const d = tileFloor(ctx.world.terrain, wx, wy + 8, 1);
    if (d < 0) { qy += d << 8; vy = s16((vy >> 2) - vy); }
    animate(s, ctx.anims);
    ctx.draw(s, wx, wy, affine);
    if (--timer === 0) {
      const ex = explosion(ctx, wx << 8, wy << 8);
      ctx.add(ex, ex.priority);
      return false;
    }
    return true;
  };
}
