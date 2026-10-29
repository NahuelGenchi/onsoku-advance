// X Zone's first boss, the Egg Wrecker (SAT-R decompilation, src/game/sa1/stage/enemies/boss_x1_egg_wrecker.c;
// where its C does not match the ROM, Task_80352C0, Task_8035354, Task_803540C, Task_80354F4 and Task_8035588,
// this follows their assembly in asm/non_matching/game/sa1/stage/enemies/). Eggman's ship swings a wrecking
// ball on a chain, as in Sonic 1's Green Hill Zone. Positions are in whole pixels, its offsets and speeds in
// 1/256 px.
//
// The camera stops at the arena's left edge, 120 px left of the boss's spawn point, with its right edge 240 px
// on; once it has panned down to the arena the boss's music starts and the ship comes down and to the left,
// then drops its ball. It swings across the arena, the ball swinging under it; four hits wreck it.

import { makeSprite, startAnim, animate } from './objects.js';
import { SCREEN_W, SCREEN_H } from './constants.js';
import { preBossCameraPan, camBounds, setCamBounds, bossHit, bossShotHit, explosion, debris, flashing, HIT_ENEMY, HIT_PLAYER, sin, cos, s16, I } from './xbosses.js';

const SE_BOSS_HIT = 143, SE_EXPLOSION = 144;
const MUSIC_START = 0x14, MUSIC_END = 0x34;   // gMusicManagerState.unk1: boss song 4 (MUS_BOSS_EGG_WRECKER), then its end
const LINKS = 4;   // NUM_CHAIN_SEGMENTS

/** CreateEntity_EggWrecker: the boss's task (Task_EggWreckerInit, then the others), at the objects' priority. */
export function eggWrecker(e, slot) {
  const b = {
    worldX: e.x, worldY: e.y,
    qx: 0x4000, qy: -0x6000, vx: 0, vy: 0,   // unk6C, unk70: the offset from the spawn point; unk74, unk78
    x: 0, y: 0,           // unk80, unk82: where it is this frame
    timer: 120,           // unk84
    hits: 0,              // unk86
    flash: 0,             // unk87: the frames left of a hit's flash and of the time it can't be hit
    phase: 0,             // unk8D
    moving: 0,            // unk8C: set once it starts to swing across, which shows its flame
    swing: 0,             // unk88: the swing's angle, 1024 a turn
    ball: 0,              // unk8A: the ball's angle under the ship
    ship: makeSprite('eggWreckerMobile', { order: 22 }),
    eggman: { ...makeSprite('eggWreckerEggman0', { order: 21 }), variant: 0, anim694: false },
  };
  const { ship, eggman } = b;
  let main = waitForCamera;

  // Eggman's variants: 0 at rest, 1 laughing, 2 hurt (animation 686), or animation 694's after the defeat
  function setEggman(variant) {
    eggman.variant = variant;
    startAnim(eggman, eggman.anim694 ? `eggman${variant}` : `eggWreckerEggman${variant}`, true);
  }
  b.laugh = () => setEggman(1);   // the ball hit Sonic (sub_803582C)

  // where the sprites are drawn, and Eggman in the ship (sub_8035904): 3 px higher once he's animation 694
  function draw(ctx, window = false) {
    ctx.draw({ ...ship, white: window }, b.x, b.y);
    ctx.draw(eggman, b.x, b.y - (eggman.anim694 ? 3 : 0));
  }

  // Task_EggWreckerInit: the camera's left and right edges close round the arena once it reaches it, then its
  // top and bottom pan to it; the fight starts when both are in place. Nothing is drawn meanwhile.
  function waitForCamera(ctx) {
    const cam = ctx.world.cam;
    if (b.phase === 0) {
      if (b.worldX - SCREEN_W / 2 <= ctx.cam.x) {
        setCamBounds(cam, { minX: b.worldX - SCREEN_W / 2, maxX: b.worldX - SCREEN_W / 2 + SCREEN_W });
        b.phase = 1;
      }
    } else if (b.phase === 1) {
      if (b.worldY - 64 <= ctx.cam.y) {
        const pan = preBossCameraPan(cam, b.worldY, b.worldY + SCREEN_H);
        ctx.add(pan, pan.priority);
        b.phase = 2;
      }
    }
    const bounds = camBounds(cam);
    if (bounds.minX === b.worldX - SCREEN_W / 2 && bounds.maxY === b.worldY + SCREEN_H) {
      b.phase = 0;
      b.vy = 0x100;
      main = arrive;
      ctx.world.musicState(MUSIC_START);
    }
  }

  // sub_80343E0: the hit flash, then both sprites
  function show(ctx) {
    draw(ctx, flashing(b, ctx.player));
  }

  function move() {
    b.qx += b.vx; b.qy += b.vy;
    b.x = s16(b.worldX + I(b.qx)); b.y = s16(b.worldY + I(b.qy));
  }

  // Task_8034718: down 1 px a frame to 32 px below the spawn point, then left to it, rising slowly; four
  // frames later Eggman laughs and the chain and ball come out; once he's done and 64 frames have passed it
  // starts to swing, and the camera's top pans up 80 px
  function arrive(ctx) {
    move();
    animate(ship, ctx.anims); animate(eggman, ctx.anims);
    show(ctx);
    switch (b.phase) {
      case 0:
        if (b.qy >= 32 << 8) { b.qy = 32 << 8; b.vx = -0x100; b.vy = -16; b.phase++; }
        break;
      case 1:
        if (b.qx <= 0) { b.qx = 0; b.vx = 0; b.vy = 0; b.timer = 4; b.phase++; }
        break;
      case 2:
        if (--b.timer === 0) {
          setEggman(1);
          b.swing = 0x100; b.ball = 0x100; b.timer = 64; b.phase++;
          createParts(ctx);
        }
        break;
      case 3: {
        if (b.timer > 0) b.timer--;
        if (eggman.anim.done) setEggman(0);
        if (eggman.variant === 0 && b.timer === 0) {
          b.vx = -48; b.moving = 0xFF; b.phase = 0;
          main = fight;
          const cam = ctx.world.cam, bounds = camBounds(cam);
          const pan = preBossCameraPan(cam, bounds.minY - SCREEN_H / 2, bounds.maxY);
          ctx.add(pan, pan.priority);
        }
        break;
      }
    }
  }

  // sub_80342A0: Sonic against the ship, unless it is still flashing from the last hit
  function hitTest(ctx, x, y) {
    if (b.flash !== 0) return;
    const hit = bossHit(ship, x, y, ctx);
    if (hit === HIT_ENEMY) {
      b.hits++;
      b.flash = 0x20;
      setEggman(2);
      ctx.world.playSound(SE_BOSS_HIT);
    } else if (hit === HIT_PLAYER) setEggman(1);
  }

  // Task_803491C: the swing, 4/1024 of a turn a frame, the ship turning round at each end, bobbing up and
  // down and moving across at 0.75 px a frame on the swing's way out; the ball's angle follows it
  function fight(ctx) {
    b.qx += b.vx; b.qy += b.vy;
    b.swing = (b.swing - 4) & 0x3FF;
    if ((b.swing & 0x1FF) === 0x100) { ship.flipX = !ship.flipX; eggman.flipX = !eggman.flipX; }
    const bob = s16(cos(((b.swing + 0x100) * 2) & 0x3FF) >> 13);
    const x = s16(b.worldX + I(b.qx)), y = s16(bob + b.worldY + I(b.qy));
    b.x = x; b.y = y;
    b.ball = Math.min(cos(b.swing) >> 6, 0xFF) + 0x300;
    hitTest(ctx, x, y);
    if (b.hits > 3) { wrecked(ctx); return; }
    if (eggman.variant !== 0 && eggman.anim.done) setEggman(0);
    animate(ship, ctx.anims); animate(eggman, ctx.anims);
    show(ctx);
    switch (b.phase) {
      case 0: if (b.swing > 0x100 && b.swing <= 0x300) { b.vx = 0; b.phase++; } break;
      case 1: if (b.swing <= 0x200) { b.vx = 0xC0; b.phase++; } break;
      case 2: if (b.swing <= 0x100) { b.vx = 0; b.phase++; } break;
      case 3: if (b.swing === 0 || b.swing > 0x100) { b.vx = -0xC0; b.phase = 0; } break;
    }
  }

  // sub_8034B7C: the fourth hit stops it where it bobbed to, Eggman hurt; an explosion's sound and 1000 points
  function wrecked(ctx) {
    b.phase = 0; b.timer = 60; b.vx = 0; b.vy = 0;
    b.qy += (cos(((b.swing + 0x100) * 2) & 0x3FF) >> 13) << 8;
    setEggman(2);
    ctx.world.playSound(SE_EXPLOSION);
    ctx.world.addScore(1000);
    main = falling;
    falling(ctx);
  }

  // Task_8034CA0: debris every 8 frames for a second; then Eggman (now animation 694) sinks and rises again,
  // turns round and flies off to the right, rising; past 304 px right of the spawn point the camera's bounds
  // open up again, all but the left one, and the act's music comes back
  function falling(ctx) {
    move();
    if (!(b.timer & 7)) debris(ctx, b.x, b.y);
    animate(ship, ctx.anims); animate(eggman, ctx.anims);
    draw(ctx);
    switch (b.phase) {
      case 0:
        if (--b.timer === 0) {
          b.timer = 0x5A; b.phase++;
          eggman.anim694 = true; eggman.order = 23;
          setEggman(4);
        }
        break;
      case 1:
        b.vy += 3;
        if (--b.timer === 0) { b.timer = 30; b.phase++; }
        break;
      case 2:
        b.vy -= 0x18;
        if (--b.timer === 0) {
          b.vx = 0x200; b.vy = -0x40; b.timer = 1; b.phase++;
          setEggman(6);
          ship.flipX = true; eggman.flipX = true;
        }
        break;
      case 3:
        if (b.qx > 0x13000) {
          const cam = ctx.world.cam;
          setCamBounds(cam, { minY: 0, maxY: cam.height, maxX: cam.width });
          ctx.world.musicState(MUSIC_END);
          ctx.world.bossBeaten('egg-wrecker');
          slot.gone = true;
          return false;
        }
        break;
    }
    return true;
  }

  // sub_8035010: the parts that hang from the ship, each its own task after the ship's
  function createParts(ctx) {
    ctx.add(hook(b), 0x2100);
    for (let i = 0; i < LINKS; i++) ctx.add(link(b, i), 0x2100 | i);
    ctx.add(ball(b), 0x2104);
    ctx.add(flame(b), 0x2105);
  }

  return {
    run(ctx) {
      const r = main(ctx);
      return r !== false;
    },
  };
}

// Task_80352C0: the hook under the ship, rising 8 px into place over its first 64 frames; it explodes 20 px
// lower once the ship is wrecked
function hook(b) {
  const s = makeSprite('eggWreckerHook', { order: 24 });
  let t = 0x40;
  return {
    run(ctx) {
      let lift = 0;
      if (t !== 0) { t--; lift = t >> 3; }
      const x = b.x, y = s16(b.y - lift);
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      if (b.hits > 3) { const ex = explosion(ctx, x << 8, (y + 20) << 8); ctx.add(ex, ex.priority); return false; }
      return true;
    },
  };
}

// Task_8035354 and Task_803540C: chain link `i`, let down from 14 px under the ship to (14i + 35) px over 64
// frames, then hanging at (14i + 13) px along the ball's angle and 22 px lower; once the ship is wrecked each
// explodes, the top one 8 frames on and each next one 8 frames later
function link(b, i) {
  const s = makeSprite('eggWreckerLink', { order: 25 });
  let t = 0x40, hanging = false;
  return {
    run(ctx) {
      let x, y;
      if (!hanging) {
        let dy;
        if (--t !== 0) dy = s16(14 * i - (((t * 4 * (14 * i + 21)) << 8) >> 16) + 35);
        else { dy = 14 * i + 35; t = 8 * i + 8; hanging = true; }
        x = b.x; y = s16(dy + b.y);
        animate(s, ctx.anims);
        ctx.draw(s, x, y);
        return true;
      }
      const r = 14 * i + 13;
      x = s16(((cos(b.ball) * r * 4) >> 16) + b.x);
      y = s16(b.y + ((sin(b.ball & 0x1FF) * r * 4) >> 16) + 22);
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      if (b.hits > 3 && --t === 0) { const ex = explosion(ctx, x << 8, y << 8); ctx.add(ex, ex.priority); return false; }
      return true;
    },
  };
}

// Task_80354F4 and Task_8035588: the ball, let down to 99 px under the ship over 64 frames, then swinging 77 px
// out along its angle and 22 px lower. It hurts Sonic, and Eggman laughs when it does. Once the ship is
// wrecked it explodes every 8 frames for a second, then goes.
function ball(b) {
  const s = makeSprite('eggWreckerBall', { order: 23 });
  let t = 0x40, swinging = false;
  return {
    run(ctx) {
      let x, y;
      if (!swinging) {
        let dy;
        if (--t !== 0) dy = s16(99 - (((t * 4 * 93) << 8) >> 16));
        else { dy = 99; t = 60; swinging = true; }
        x = b.x; y = s16(b.y + dy);
        animate(s, ctx.anims);
        ctx.draw(s, x, y);
        return true;
      }
      x = s16(b.x + ((cos(b.ball) * 77) >> 14));
      y = s16(b.y + ((sin(b.ball & 0x1FF) * 77) >> 14) + 22);
      if (b.hits < 4 && bossShotHit(s, x, y, ctx) === HIT_PLAYER) b.laugh();
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      if (b.hits > 3) {
        if (!(t & 7)) {
          const r = ctx.world.random();
          const ex = explosion(ctx, (x + (r & 0x1F) - 15) << 8, (y + ((r & 0x1F0000) >> 16) - 15) << 8);
          ctx.add(ex, ex.priority);
        }
        if (--t === 0) return false;
      }
      return true;
    },
  };
}

// Task_8035768: the ship's flame, shown while it moves across once the swinging has started, facing its way;
// it goes past 300 px right of the spawn point
function flame(b) {
  const s = makeSprite('eggWreckerFlame', { order: 24 });
  return {
    run(ctx) {
      if (b.moving === 0 || b.vx === 0) return true;
      if (b.qx > 300 << 8) return false;
      s.flipX = b.ship.flipX;
      animate(s, ctx.anims);
      ctx.draw(s, b.x, b.y);
      return true;
    },
  };
}
