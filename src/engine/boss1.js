// Neo Green Hill's boss, the Egg Hammer Tank (SAT-R decompilation, src/game/sa1/stage/enemies/
// boss_1_egg_hammer_tank.c), at the end of act 2. Two enemy kinds make it:
// - 21, the intro: when its spawn point comes into range the camera's left edge follows the screen, its right
//   edge stops 64 px past the spawn point and its top and bottom close in on the arena. Once the spawn point is
//   176 px into the screen Sonic stops and his controls are taken, and the intro's song plays while Eggman, in
//   the Egg Mobile, taunts him. The Egg Mobile turns and flies off to the right at 2 px a frame; when it is
//   64 px off the screen Sonic gets his controls back and the right edge goes back to the act's end.
// - 22, the tank: the camera's target moves 56 px up, its bounds become the 360 px up to 64 px short of the spawn
//   point, and the boss's song starts. 121 frames later the tank rolls in from the right at 1 px a frame,
//   turning 64 px past either bound, its hammer swinging over it on five arm segments. Each time the hammer
//   reaches either end of its swing it hits the ground, shaking the screen. A jump into its body hits it: it
//   flashes white and can't be hit again for 32 frames, and after the fifth hit the hammer swings faster with
//   each one. The seventh sends it into its last phase, the hammer swinging right round and the tank vaulting
//   over it, and the eighth beats it: its belt, arms and hammer fly off, it falls smoking and throwing debris
//   for 4 seconds, then Eggman flies off in the Egg Mobile, the stage music comes back and the capsule drops
//   in (`world.bossDefeated`).
// Its parts (the arms and the hammer) are their own tasks at priorities 0x2000 to 0x2005, and they sit on the
// pivot the tank leaves each frame 36 px above itself (gSpriteTransformRotation, X and Y). All six share one
// rotation matrix, so every one of them is drawn with the hammer's, the last one written; each is placed by its
// own. Positions are whole pixels in the act and speeds 1/256 px a frame, as the original keeps them.

import { makeSprite, startAnim, animate } from './objects.js';
import { overlap } from './collide.js';
import { tileFloor } from './terrain.js';
import { SINE } from './trig.js';
import { screenShake, SCREEN_SHAKE, SHAKE } from './screenshake.js';
import { bossPart, bossDebris, bossExplosion, eggMobileEscape, preBossCameraPan } from './bosses.js';
import { SCREEN_W, SCREEN_H } from './constants.js';
import { SONG } from '../sound/songs.js';

export const EGG_HAMMER_TANK_INTRO = 21, EGG_HAMMER_TANK = 22;

const I = v => v >> 8;
const s8 = v => (v << 24) >> 24;
const s16 = v => (v << 16) >> 16;
const COS = a => SINE[a + 256], SIN = a => SINE[a];
const OBJECTS = 0x2000;
const INTRO_MUSIC = 0x11, BOSS_MUSIC = 0x10, STAGE_MUSIC = 0x30;   // gMusicManagerState.unk1
// Coll_Player_Boss_1's results (EHit)
const HIT_NONE = 0, HIT_ENEMY = 1, HIT_PLAYER = 2;
// the rotation matrix the arms and the hammer share (their frameFlags 0x2030)
const MATRIX = 16;
const SWING_LOW = -568, SWING_HIGH = 56;   // the hammer's swing, between the ground on either side
const ARMS = 5, ARM_STEP = 16, HAMMER_REACH = 96;
const PART_FRAMES = 180;   // the arms and the hammer last 181 frames once they fly off

// The scripts that end by going on to another (SetIdAndVariant): the next one's first frame shows at once,
// and the next update starts it over, its prevVariant -1 then, so that frame shows one frame longer.
const NEXT = {
  hammerTank: 'hammerTank2', hammerTank2: 'hammerTank',
  hammerTankEggmanLaugh: 'hammerTankEggman', hammerTankEggmanHurt: 'hammerTankEggman',
};
function update(s, anims) {
  if (s.again) { s.again = false; startAnim(s, s.anim.name, true); }
  const ended = animate(s, anims), next = NEXT[s.anim.name];
  if (!ended || !next) return ended;
  startAnim(s, next, true); animate(s, anims);
  s.again = true;
  return false;
}

// Sonic's own rectangle, ±spriteOffsetX by ±spriteOffsetY (Coll_Player_Entity_Intersection)
const sonicRect = p => [-6, -p.offsetY, 6, p.offsetY];

// the screen shake the hammer's blows and the capsule's landing make
const shake = ctx => ctx.add(screenShake(0x800, 0x40, 0x100, -1, SHAKE.VERTICAL), SCREEN_SHAKE);

/**
 * Coll_Player_Boss_1: while Sonic attacks, the body's box 1 on his body hurts him and his attack box on its
 * box 0 hits it, sending him back the way he came (both speeds reversed); otherwise his body on box 0 hurts
 * him. A hurt counts whether or not he can be hurt then.
 */
function bossHit(s, x, y, ctx) {
  const p = ctx.player, [b0, b1] = s.boxes, [body, attack] = p.boxes;
  if (!b0 || !b1 || p.dead) return HIT_NONE;
  const px = Math.floor(p.x), py = Math.floor(p.y);
  if (attack) {
    if (overlap(x, y, b1, px, py, body)) { ctx.world.damage(); return HIT_PLAYER; }
    if (overlap(x, y, b0, px, py, attack)) { p.xsp = -p.xsp; p.ysp = -p.ysp; return HIT_ENEMY; }
  }
  if (body && overlap(x, y, b0, px, py, body)) { ctx.world.damage(); return HIT_PLAYER; }
  return HIT_NONE;
}

/** The intro's task (CreateEntity_EggHammerTank_Intro), for enemy kind 21. */
export function createEggHammerTankIntro(e, slot, anims, ctx) {
  slot.gone = true;
  const cam = ctx.world.camera;
  const s = makeSprite('eggMobile', { order: 19 }), s2 = makeSprite('eggman', { order: 18 });
  cam.minX = Math.max(0, e.x - SCREEN_W);
  cam.maxX = e.x + 64 - SCREEN_W;
  const bottom = s16(e.y + SCREEN_H - 48);
  ctx.add(preBossCameraPan(cam, s16(e.y - 48), bottom));
  if (bottom > Math.floor(cam.y) + SCREEN_H) cam.maxY = bottom - SCREEN_H;
  let qx = 0, phase = approach;

  function show(c, x) {
    const ended = [animate(s, anims), animate(s2, anims)];
    c.draw(s, x, e.y); c.draw(s2, x, e.y);
    return ended;
  }
  // Task_EggHammerTank_Intro: the left edge follows the screen until it reaches the right one
  function approach(c) {
    show(c, e.x);
    cam.minX = c.cam.x < cam.maxX ? c.cam.x & 0xFFFF : cam.maxX;
    if (e.x - c.cam.x <= SCREEN_W - 64) {
      const p = c.player;
      p.gsp = 0; p.ignoreInput = true;
      startAnim(s2, 'eggmanLaugh');
      c.world.musicState(INTRO_MUSIC);
      phase = taunt;
    }
    return true;
  }
  // Task_8025CC4, then Task_8025D80: Eggman's taunt, then the Egg Mobile turns round
  function taunt(c) {
    if (show(c, e.x)[1]) { startAnim(s, 'eggMobileTurn'); startAnim(s2, 'eggmanTurn'); phase = turn; }
    return true;
  }
  function turn(c) {
    if (!show(c, e.x)[0]) return true;
    startAnim(s, 'eggMobile'); startAnim(s2, 'eggman');
    s.flipX = s2.flipX = true;
    c.add(preBossCameraPan(cam, s16(e.y - 48), s16(e.y + SCREEN_H - 48)));
    phase = leave;
    return true;
  }
  // Task_8025E6C: off to the right; 64 px past the screen Sonic has his controls back, the buttons he holds not
  // counting as presses
  function leave(c) {
    qx += 512;
    const x = e.x + I(qx);
    if (x - c.cam.x > SCREEN_W + 64) {
      c.player.ignoreInput = false;
      c.input.jumpPressed = false; c.input.attackPressed = false; c.input.boostPressed = false;
      cam.maxX = c.world.terrain.width - SCREEN_W;
      return false;
    }
    show(c, x);
    return true;
  }
  return { priority: OBJECTS, run: c => phase(c) };
}

/** The tank's task (CreateEntity_EggHammerTank), for enemy kind 22. */
export function createEggHammerTank(e, slot, anims, ctx) {
  slot.gone = true;
  const cam = ctx.world.camera;
  const s = makeSprite('hammerTank', { order: 19 }), s2 = makeSprite('hammerTankEggman', { order: 18 });
  cam.shiftY = -56;
  cam.maxX = e.x - 64 - SCREEN_W;
  cam.minX = e.x - 64 - 360;
  ctx.world.musicState(BOSS_MUSIC);
  // the swing's angle (unk94) and speed (unk96), the hits taken (unk9A) and the frames left of a hit's flash
  // (unk9B), a frame count (unk98), whether the hammer is on the ground in the last phase (unk9C), the tank's
  // offsets from its spawn point in 1/256 px (qUnk8C, qUnk90) and the beaten tank's fall speed (qUnk9E)
  let swing = 0, speed = -4, hits = 0, flash = 0, count = 0, grounded = 0, qx = 0, qy = 0, fall = 0;
  // (the hard difficulty starts it at two hits; this game plays the normal one)
  // the pivot the arms and the hammer hang from, on the screen: gSpriteTransformRotation, X and Y
  const pivot = { rotation: 0, x: 0, y: 0 };
  const arms = [];
  let hammer = null, phase = wait;

  // Sonic against the body while it isn't flashing; returns the result (sub_802611C's hit test)
  function hitTest(c, x, y) {
    s.white = false;
    if (flash !== 0) return HIT_NONE;
    return bossHit(s, x, y, c);
  }
  // the sprites at (x, y), Eggman a pixel higher on the body's second script, white on every other pair of a
  // hit's first 15 frames, then shown on every other pair of its last 16
  function show(c, x, y) {
    update(s, anims); update(s2, anims);
    const ey = s.anim.name === 'hammerTank2' ? y - 1 : y;
    if (flash !== 0) {
      flash = s8(flash - 1);
      if (flash > 16) {
        if (!(flash & 2) && !c.player.dead) s.white = true;
      } else if (!(flash & 2)) return;
    }
    c.draw(s, x, y); c.draw(s2, x, ey);
  }
  // the tank turns 64 px past either of the camera's bounds
  function turnAtEdges(x) {
    if (x < cam.minX - 64) s.flipX = s2.flipX = true;
    else if (x > cam.maxX + SCREEN_W + 64) s.flipX = s2.flipX = false;
  }
  function setPivot(c, x, y) {
    pivot.rotation = swing & 0x3FF; pivot.x = s16(x - c.cam.x); pivot.y = s16(y - c.cam.y - 36);
  }

  // Task_EggHammerTankMain: nothing for 121 frames, then the arms and the hammer, and the fight
  function wait(c) {
    if (count++ <= 120) return true;
    for (let i = 0; i < ARMS; i++) { arms.push(arm(i)); c.add(arms[i], OBJECTS | i); }
    hammer = hammerTask();
    c.add(hammer, OBJECTS + ARMS);
    phase = fight;
    return fight(c);
  }
  // Task_802611C: the swing, the tank rolling along, and the hits
  function fight(c) {
    swing = s16(swing + speed);
    if (!(swing > SWING_LOW && swing < SWING_HIGH)) {
      c.world.playSound(SONG.IMPACT);
      speed = s16(-speed);
      shake(c);
    }
    qx += s.flipX ? 256 : -256;
    const x = s16(e.x + I(qx)), y = e.y;
    const result = hitTest(c, x, y);
    if (result === HIT_ENEMY) {
      hits = s8(hits + 1); flash = 0x20;
      if (hits === 7) { flash = 0x40; phase = lastPhase; }
      else if (hits > 4) speed = speed > 0 ? hits + 1 : ~hits;
      startAnim(s2, 'hammerTankEggmanHurt');
      c.world.playSound(SONG.BOSS_HIT);
    } else if (result === HIT_PLAYER) startAnim(s2, 'hammerTankEggmanLaugh');
    turnAtEdges(x);
    show(c, x, y);
    setPivot(c, x, y);
    return true;
  }
  // Task_80264C8: the hammer swings right round, faster with the hits taken, and the tank vaults over it while
  // it is on the ground
  function lastPhase(c) {
    speed = s16(s.flipX ? hits * 2 - 2 : -4 - (hits - 3) * 2);
    swing = s16(swing + speed);
    if (swing < -0x300) { swing = s16(swing + 0x400); qx -= COS(56) * 3; }
    else if (swing > 0x100) { swing = s16(swing - 0x400); qx += COS(56) * 3; }
    let dx = 0, dy = 0;
    if (swing <= SWING_LOW || swing > SWING_HIGH - 1) {
      if (grounded === 0) { grounded = 1; c.world.playSound(SONG.IMPACT); shake(c); }
      const theta = (swing <= SWING_LOW ? 0x200 - swing : swing) & 0x3FF;
      dx = ((COS(56) - COS(theta)) * 3) >> 9;
      if (swing <= SWING_LOW) dx = -dx;
      dy = -(((SIN(theta) - SIN(56)) * 3) >> 9);
    } else {
      grounded = 0;
      qx += s.flipX ? 256 : -256;
    }
    const x = s16(e.x + I(qx) + dx), y = s16(e.y + dy);
    if (hitTest(c, x, y) === HIT_ENEMY) { beaten(c, x, y, dx, dy); return phase(c); }
    if (dy === 0) turnAtEdges(x);
    show(c, x, y);
    setPivot(c, x, y);
    return true;
  }
  // the eighth hit: 1000 points, the belt flies off in four pieces, the arms and the hammer fly off, and the
  // camera holds still
  function beaten(c, x, y, dx, dy) {
    hits = s8(hits + 1); flash = 0x20;
    startAnim(s2, 'hammerTankEggmanHurt');
    fall = -512;
    c.world.addScore(1000);
    c.world.playSound(SONG.EXPLOSION);
    for (const a of arms) a.fly();
    hammer.fly();
    qx += dx << 8; qy = dy << 8;
    count = 0;
    startAnim(s, 'hammerTankBeaten');
    // the belt's front pieces fly the way the tank faces and the back ones the other way
    [['hammerTankBelt0', -1], ['hammerTankBelt1', -1], ['hammerTankBelt2', 1], ['hammerTankBelt3', 1]].forEach(([name, way]) => {
      c.add(bossPart(x, y, name, anims, { vx: (s.flipX ? -way : way) * 1024, vy: -512, spin: 0, grow: 0, scaleX: s.flipX ? -256 : 256, frames: 60 }));
    });
    cam.minX = c.cam.x; cam.maxX = c.cam.x;
    phase = falling;
  }
  // the debris and an explosion every 8 frames (Task_8026C44 and Task_8026ED0)
  function smoke(c, x, y) {
    count = (count + 1) & 0xFFFF;
    if (!(count & 7)) bossDebris(c, x, y - 32);
  }
  function showBeaten(c, x, y) {
    update(s, anims); update(s2, anims);
    c.draw(s, x, y); c.draw(s2, x, y);
  }
  // Task_8026C44: it falls 40/256 px a frame faster each frame and bounces on the floor until it settles
  function falling(c) {
    fall = s16(fall + 40); qy += fall;
    const x = s16(e.x + I(qx)), y = s16(e.y + I(qy));
    const d = tileFloor(c.world.terrain, x, y - 8, 1);
    if (d < 0) {
      qy += d << 8;
      fall = s16((fall >> 2) - fall);
      if (fall > -256) { fall = 0; phase = settled; }
    }
    s.white = false;
    smoke(c, x, y);
    showBeaten(c, x, y);
    return true;
  }
  // Task_8026ED0: 240 frames on the ground, then Eggman flies off, the capsule comes and the music goes back
  function settled(c) {
    const x = s16(e.x + I(qx)), y = s16(e.y + I(qy));
    if (count > SCREEN_W) {
      c.add(eggMobileEscape(x, y - 32, anims));
      c.world.bossDefeated(x, y);
      c.world.musicState(STAGE_MUSIC);
      return false;
    }
    smoke(c, x, y);
    showBeaten(c, x, y);
    return true;
  }

  // An arm segment (CreateEHTArm), `i` × 16 px along the arm from the pivot, drawn at the pivot's angle
  // (UnusedTransform). Flying off (Task_80271E4, Task_80272D0), the odd ones go right at 2 px a frame and the
  // even ones left, from 6 px a frame up, falling 40/256 px a frame faster each frame, bouncing on the floor and
  // off the screen's sides, with an explosion every 8 frames, for 181 frames.
  function arm(i) {
    const a = makeSprite('hammerTankArm', { order: 17 });
    animate(a, anims);
    let flying = false, ax = 0, ay = 0, qax = 0, qay = 0, vx = 0, vy = 0, t = 0;
    return {
      fly() { flying = true; t = -1; },
      run(c) {
        if (flying) {
          if (t === -1) {
            const g = pivot.rotation;
            ax = s16(((COS(g) << 4) * i >> 14) + ((c.cam.x + pivot.x) & 0xFFFF));
            ay = s16(((SIN(g) << 4) * i >> 14) + ((c.cam.y + pivot.y) & 0xFFFF));
            vx = i & 1 ? 0x200 : -0x200; vy = -0x600; qax = 0; qay = 0; t = 0;
          }
          if (t++ > PART_FRAMES) return false;
          ({ qx: qax, qy: qay, vy } = flyStep(c, ax, ay, qax, qay, vx, vy));
          const x = ax + I(qax);
          if (x > c.cam.x + SCREEN_W || x < c.cam.x) vx = -vx;
          if (!(t & 7)) c.add(bossExplosion(c, (ax << 8) + qax, (ay << 8) + qay));
          c.draw(a, x, ay + I(qay));
          return true;
        }
        const [x, y] = placed(c, i * ARM_STEP);
        c.draw(a, x, y, { rotation: pivot.rotation, scaleX: 256, scaleY: 256, double: false, matrix: MATRIX });
        return true;
      },
    };
  }

  // The hammer (CreateEHTHammer) at the arm's end, 96 px from the pivot. It keeps its first frame's box and,
  // while the tank isn't flashing, hurts Sonic when his own rectangle touches it, Eggman laughing at him even
  // when he can't be hurt then. Its own angle keeps it level until the arm is half way down either side
  // (Task_EHTHammer). Flying off (Task_8027600, Task_8027714), it goes 2 px a frame toward the screen's middle,
  // from 6 px a frame up, spinning 42 steps a frame and the other way at each bounce on the floor, with an
  // explosion every 8 frames, for 181 frames.
  function hammerTask() {
    const h = makeSprite('hammerTankHammer', { order: 17 });
    animate(h, anims);
    let flying = false, rotation = 0, hx = 0, hy = 0, qhx = 0, qhy = 0, vx = 0, vy = 0, spin = 0, t = 0;
    const angle = () => (swing < 0 ? Math.max(0, s16(-swing - 512)) : swing > 0 ? -swing : 0);
    return {
      fly() { flying = true; t = -1; },
      run(c) {
        if (flying) {
          if (t === -1) {
            const g = pivot.rotation;
            rotation = (angle() + g) & 0xFFFF;
            hx = s16(((COS(g) * 3) >> 9) + ((c.cam.x + pivot.x) & 0xFFFF));
            hy = s16(((SIN(g) * 3) >> 9) + ((c.cam.y + pivot.y) & 0xFFFF));
            vx = hx < c.cam.x + SCREEN_W / 2 ? 0x200 : -0x200; vy = -0x600; qhx = 0; qhy = 0; spin = 42; t = 0;
          }
          if (t++ > PART_FRAMES) return false;
          let bounced;
          ({ qx: qhx, qy: qhy, vy, bounced } = flyStep(c, hx, hy, qhx, qhy, vx, vy));
          if (bounced) spin = -spin;
          if (!(t & 7)) c.add(bossExplosion(c, (hx << 8) + qhx, (hy << 8) + qhy));
          rotation = (rotation + spin) & 0x3FF;
          c.draw(h, hx + I(qhx), hy + I(qhy), { rotation, scaleX: 256, scaleY: 256, double: false, matrix: MATRIX });
          return true;
        }
        const own = angle();
        const [x, y] = placed(c, HAMMER_REACH);
        if (flash === 0) {
          const g = pivot.rotation, p = c.player;
          const cx = s16(pivot.x + c.cam.x + ((COS(g) * 3) >> 9)), cy = s16(pivot.y + c.cam.y + ((SIN(g) * 3) >> 9));
          if (h.boxes[0] && !p.dead && overlap(cx, cy, h.boxes[0], Math.floor(p.x), Math.floor(p.y), sonicRect(p))) {
            c.world.damage();
            startAnim(s2, 'hammerTankEggmanLaugh');
          }
        }
        c.draw(h, x, y, { rotation: (own + pivot.rotation) & 0x3FF, scaleX: 256, scaleY: 256, double: false, matrix: MATRIX });
        return true;
      },
    };
  }

  // where UnusedTransform puts a part `reach` px along the arm: the pivot, plus the reach turned by the pivot's
  // angle, its sine and cosine cut to 8.8 first; returned in the act, for drawing through the part's own angle
  function placed(c, reach) {
    const g = pivot.rotation;
    const x = (((SINE[g + 256] >> 6) * reach) + (pivot.x << 8)) >> 8;
    const y = (((SINE[g] >> 6) * reach) + (pivot.y << 8)) >> 8;
    return [s16(x) + c.cam.x, s16(y) + c.cam.y];
  }

  return { priority: OBJECTS, run: c => phase(c) };
}

// a flying part's frame: it falls 40/256 px a frame faster, and coming down onto the floor it bounces back up
// at three quarters of its speed
function flyStep(c, x, y, qx, qy, vx, vy) {
  vy = s16(vy + 40); qx += vx; qy += vy;
  let bounced = false;
  if (vy > 0) {
    const d = tileFloor(c.world.terrain, x + I(qx), y + I(qy), 1);
    if (d < 0) { qy += d << 8; vy = s16((vy >> 2) - vy); bounced = true; }
  }
  return { qx, qy, vy, bounced };
}
