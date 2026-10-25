// X Zone's second boss, the Egg Drillster (SAT-R decompilation, src/game/sa1/stage/enemies/boss_x2_egg_drillster.c):
// Eggman's drill car from Sonic 2's Emerald Hill Zone. Positions are in whole pixels, its offsets and speeds in
// 1/256 px.
//
// The camera's left and right edges close round the arena, 152 px to either side of the boss's spawn point,
// once the camera reaches it, then its top and bottom pan to the 160 px above the spawn point; the boss's music
// starts and the car drives in from the right, Eggman laughs, and it drives back and forth across the arena,
// turning round at each end. After three hits its drill flies off at Sonic once he is in front of it; four
// wreck it.

import { makeSprite, startAnim, animate } from './objects.js';
import { tileFloor } from './terrain.js';
import { SCREEN_W, SCREEN_H } from './constants.js';
import { preBossCameraPan, setCamBounds, bossHit, bossShotHit, explosion, debris, eggMobileEscape, flashing, HIT_ENEMY, HIT_PLAYER, s16, I } from './bosses.js';

const SE_BOSS_HIT = 143, SE_EXPLOSION = 144;
const MUSIC_START = 0x15, MUSIC_END = 0x35;   // gMusicManagerState.unk1: boss song 5, then its end
const WHEELS = 4;                              // NUM_WHEELS
const WIDTH = 72;                              // SA1_ANIM_BOSS_X2_EGGDRILLSTER_WIDTH

/**
 * CreateEntity_EggDrillster: the boss's task (Task_EggDrillsterInit, then the others), at the objects'
 * priority. It isn't made once a checkpoint has been passed (gBossIndex): the act's only one is past it.
 */
export function eggDrillster(e, slot, anims, ctx) {
  if (ctx.world.checkpointIndex !== 0) return { run: () => false };
  const b = {
    worldX: e.x, worldY: e.y,
    qx: 0xC020, qy: -40 << 8, vx: 0, vy: 0,   // unk6C, unk70: the offset from the spawn point; unk74, unk78
    x: 0, y: 0,           // unk80, unk82: where it is this frame
    timer: 120,           // unk84
    hits: 0,              // unk86
    flash: 0,             // unk87: the frames left of a hit's flash and of the time it can't be hit
    phase: 0,             // unk8D
    moving: 0,            // unk8C: set once it has driven in, which lets its drill hurt
    window: false,        // the car is the hit flash's OBJ window this frame (its OBJ mode, which the parts copy)
    car: makeSprite('eggDrillster', { order: 22 }),
    eggman: { ...makeSprite('drillsterEggman0', { order: 21 }), variant: 0 },
  };
  const { car, eggman } = b;
  let main = waitForCamera;

  // Eggman's variants (animation 680): 0 at rest, 1 laughing, 2 hurt
  function setEggman(variant) {
    eggman.variant = variant;
    startAnim(eggman, `drillsterEggman${variant}`, true);
  }
  b.laugh = () => setEggman(1);   // the drill hit Sonic (sub_8036CF4)

  // Task_EggDrillsterInit: the camera's left and right bounds close round the arena once it reaches it, then
  // its top and bottom pan to it, and the fight starts at once. Nothing is drawn meanwhile.
  function waitForCamera(ctx) {
    const cam = ctx.world.cam;
    if (b.phase === 0) {
      if (b.worldX - SCREEN_W / 2 <= ctx.cam.x) {
        setCamBounds(cam, { minX: b.worldX - SCREEN_W / 2 - 32, maxX: b.worldX + SCREEN_W / 2 + 32 });
        b.phase = 1;
      }
    } else if (b.phase === 1) {
      if (b.worldY - 224 <= ctx.cam.y) {
        const pan = preBossCameraPan(cam, b.worldY - SCREEN_H, b.worldY);
        ctx.add(pan, pan.priority);
        b.phase = 2;
      }
    }
    if (b.phase === 2) {
      b.phase = 0;
      b.vx = -0x180;
      createParts(ctx);
      main = arrive;
      ctx.world.musicState(MUSIC_START);
    }
  }

  function move() {
    b.qx += b.vx; b.qy += b.vy;
    b.x = s16(b.worldX + I(b.qx)); b.y = s16(b.worldY + I(b.qy));
  }

  // sub_8035AAC: the hit flash, then both sprites
  function show(ctx) {
    if (flashing(b, ctx.player)) b.window = true;
    ctx.draw({ ...car, window: b.window }, b.x, b.y);
    ctx.draw(eggman, b.x, b.y);
  }

  // Task_8035DD4: in from the right at 1.5 px a frame to the spawn point; 15 frames later Eggman laughs, and 15
  // frames after he's done it drives off to the left
  function arrive(ctx) {
    move();
    animate(car, ctx.anims); animate(eggman, ctx.anims);
    show(ctx);
    switch (b.phase) {
      case 0:
        if (b.qx <= 0) { b.qx = 0; b.vx = 0; b.vy = 0; b.timer = 15; b.phase++; }
        break;
      case 1:
        if (--b.timer === 0) { setEggman(1); b.phase++; }
        break;
      case 2:
        if (eggman.anim.done) { setEggman(0); b.timer = 15; b.phase++; }
        break;
      case 3:
        if (--b.timer === 0) { b.vx = -0x200; b.moving = 0xFF; b.phase = 0; main = fight; }
        break;
    }
  }

  // sub_803596C: the flash's window goes, then Sonic against the car, unless it is still flashing from the
  // last hit
  function hitTest(ctx, x, y) {
    b.window = false;
    if (b.flash !== 0) return;
    const hit = bossHit(car, x, y, ctx);
    if (hit === HIT_ENEMY) {
      b.hits++;
      b.flash = 0x20;
      setEggman(2);
      ctx.world.playSound(SE_BOSS_HIT);
    } else if (hit === HIT_PLAYER) setEggman(1);
  }

  // Task_8035F70: across the arena at 2 px a frame, 192 px left of the spawn point and back to it, waiting
  // 30 frames and turning round at each end
  function fight(ctx) {
    move();
    hitTest(ctx, b.x, b.y);
    if (b.hits > 3) { wrecked(ctx); return; }
    if (eggman.variant !== 0 && eggman.anim.done) setEggman(0);
    animate(car, ctx.anims); animate(eggman, ctx.anims);
    show(ctx);
    switch (b.phase) {
      case 0:
        if (b.qx <= -192 << 8) { b.vx = 0; b.timer = 30; b.phase++; }
        break;
      case 1:
        if (--b.timer === 0) { b.vx = 0x200; car.flipX = true; eggman.flipX = true; b.phase++; }
        break;
      case 2:
        if (b.qx > 0xBFFF) { b.vx = 0; b.timer = 30; b.phase++; }
        break;
      case 3:
        if (--b.timer === 0) { b.vx = -0x200; car.flipX = false; eggman.flipX = false; b.phase = 0; }
        break;
    }
  }

  // sub_8036150: the fourth hit stops it, Eggman hurt, and the camera stays where it is; an explosion's sound
  // and 1000 points
  function wrecked(ctx) {
    b.phase = 0; b.vx = 0; b.vy = 0;
    setEggman(2);
    setCamBounds(ctx.world.cam, { minX: ctx.cam.x, maxX: ctx.cam.x + SCREEN_W });
    ctx.world.playSound(SE_EXPLOSION);
    b.window = false;
    ctx.world.addScore(1000);
    main = falling;
    falling(ctx);
  }

  // Task_803623C: it drops to the floor, throwing debris every 8 frames; 240 frames after it lands Eggman flees
  // in his Egg Mobile amid four explosions and the act's music comes back, and 240 frames later the car goes
  // and the camera's bounds open up again, all but the left one
  function falling(ctx) {
    if (b.phase < 2) {
      if (b.phase === 0) b.vy += 0x10;
      move();
      if (!(b.timer & 7)) debris(ctx, b.x, b.y + 16, b.y + 32);
      animate(car, ctx.anims); animate(eggman, ctx.anims);
      ctx.draw(car, b.x, b.y);
      ctx.draw(eggman, b.x, b.y);
    }
    switch (b.phase) {
      case 0: {
        b.timer = (b.timer - 1) & 0xFFFF;
        const d = tileFloor(ctx.world.terrain, b.x, b.y + 20, 1);
        if (d < 0) { b.qy += d << 8; b.vy = 0; b.timer = 240; b.phase++; }
        break;
      }
      case 1:
        if (--b.timer === 0) {
          const escape = eggMobileEscape(b.x, b.y);
          ctx.add(escape, escape.priority);
          ctx.world.musicState(MUSIC_END);
          for (const [dx, dy] of [[16, -16], [-16, -16], [20, 16], [-20, 16]]) {
            const ex = explosion(ctx, (b.x + dx) << 8, (b.y + dy) << 8);
            ctx.add(ex, ex.priority);
          }
          b.timer = 240; b.phase++;
        }
        break;
      case 2:
        if (--b.timer === 0) {
          const cam = ctx.world.cam;
          setCamBounds(cam, { minY: 0, maxY: cam.height, maxX: cam.width });
          slot.gone = true;
          return false;
        }
        break;
    }
    return true;
  }

  // CreateFalloffComponents: the drill and the wheels, each its own task after the car's
  function createParts(ctx) {
    ctx.add(drill(b), 0x2100);
    for (let i = 0; i < WHEELS; i++) ctx.add(wheel(b, i), 0x2100 | i);
  }

  return {
    run(ctx) {
      const r = main(ctx);
      return r !== false;
    },
  };
}

// Task_Drill: the drill, on the car's front, facing and flashing with it. It hurts Sonic once the car has
// driven in, and Eggman laughs when it does. After the third hit, a second on, it flies off at 3 px a frame
// the way the car faces once Sonic is more than 16 px in front of the car, and at once after the fourth
// (Task_8036B94); it goes 192 px either side of the spawn point (by the car's offset, compared unsigned).
function drill(b) {
  const s = makeSprite('drillsterDrill', { order: 20 });
  let wait = 60, flying = false, qx = 0, qy = 0, vx = 0, wx = 0, wy = 0;
  return {
    run(ctx) {
      if (flying) {
        qx += vx;
        const x = s16(wx + I(qx)), y = s16(wy + I(qy));
        if (b.hits < 4 && bossShotHit(s, x, y, ctx) === HIT_PLAYER) b.laugh();
        animate(s, ctx.anims);
        ctx.draw(s, x, y);
        return ((qx + (192 << 8)) >>> 0) <= (SCREEN_W + 2 * WIDTH) << 8;
      }
      s.flipX = b.car.flipX; s.window = b.window;
      const x = b.x, y = b.y;
      if (b.moving !== 0 && b.hits <= 3 && bossShotHit(s, x, y, ctx) === HIT_PLAYER) b.laugh();
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      if (b.hits > 2) {
        const sonic = Math.floor(ctx.player.x);
        let fire = false;
        if (wait !== 0) wait--;
        else if (s.flipX) fire = x + 16 < sonic;
        else fire = x - 16 > sonic;
        if (b.hits > 3) fire = true;
        if (fire) {
          qx = b.qx; qy = b.qy; wx = b.worldX; wy = b.worldY;
          vx = s.flipX ? 3 << 8 : -3 << 8;
          flying = true;
        }
      }
      return true;
    },
  };
}

// sub_803673C and Task_8036810: wheel `i`, on the car, facing and flashing with it and turning while it moves.
// Once the car is wrecked it stays where the car was; when the car has landed it bounces off, each wheel its
// own way (mirrored when the car faces right), falling 24/256 px a frame faster and coming back up 4/256 px a
// frame slower at each bounce; it goes when it bounces more than 32 px off the screen's sides.
const WHEEL_SPEEDS = [[-0xC0, -0x1B0], [-0x100, -0x180], [0x100, -0x190], [0xE0, -0x1A0]];
function wheel(b, i) {
  const s = makeSprite(`drillsterWheel${i}`, { order: i & 1 ? 23 : 19 });
  let off = false, qx = 0, qy = 0, vx = 0, vy = 0, wx = 0, wy = 0;
  return {
    run(ctx) {
      if (!off) {
        s.flipX = b.car.flipX; s.window = b.window;
        if (b.vx !== 0) animate(s, ctx.anims);
        ctx.draw(s, b.x, b.y);
        if (b.hits > 3) { wx = b.x; wy = b.y; off = true; }
        return true;
      }
      let x = wx, y = wy;
      if (b.phase !== 0) {
        if (vx === 0) {
          [vx, vy] = WHEEL_SPEEDS[i];
          if (b.car.flipX) vx = -vx;
        }
        vy = s16(vy + 24);
        qx += vx; qy += vy;
        x = s16(wx + I(qx)); y = s16(wy + I(qy));
        const d = tileFloor(ctx.world.terrain, x, y + 30, 1);
        if (d < 0) {
          qy += d << 8;
          vy = s16(-vy + 4);
          if (x < ctx.cam.x - 32 || x > ctx.cam.x + SCREEN_W + 32) return false;
        }
      }
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      return true;
    },
  };
}
