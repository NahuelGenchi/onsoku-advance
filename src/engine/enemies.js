// Neo Green Hill act 1's enemies and their shots, following SA1's enemy code (SAT-R decompilation,
// src/game/sa1/stage/enemies/kiki.c, buzzer.c, gamigami.c, rhinotank.c and kerokero.c). Each one works
// out its position from its spawn point every frame and goes when both that and the screen leave the range
// around the camera; a defeated one is gone until the act starts over. Speeds and offsets in 1/256 px are
// kept as the original's integers. The quirks the original has are kept too: they are noted where they are.
//
// Each maker returns a task for objects.js: run(ctx) with ctx = { player, cam, world, anims, attack(s, x, y),
// projectile(s, x, y), add(task, priority = 0x2000), draw(s, x, y) }.

import { makeSprite, startAnim, animate } from './objects.js';
import { tileFloor } from './terrain.js';
import { SINE } from './trig.js';
import { drisame, DRISAME } from './drisame.js';
import { kuraa, KURAA } from './kuraa.js';
import { yukimaru, yukimaruWall, YUKIMARU, YUKIMARU_WALL } from './yukimaru.js';
import { pen, PEN } from './pen.js';

export const KIKI = 0, BUZZER = 1, GAMIGAMI = 2, RHINOTANK = 3, KEROKERO = 4;

export const TILE = 8;
export const I = v => v >> 8;                        // Q8.8 to pixels, rounding down
export const Div = (a, b) => Math.trunc(a / b);      // the BIOS divide, rounding toward 0
export const s8 = v => (v << 24) >> 24;
export const s16 = v => (v << 16) >> 16;
export const COS = a => SINE[a + 256], SIN = a => SINE[a];

// IS_OUT_OF_CAM_RANGE on a screen position, IS_OUT_OF_DISPLAY_RANGE on a world position
const offCam = (sx, sy) => ((sx + 128) & 0xFFFF) > 496 || sy + 128 < 0 || sy > 288;
const offDisplay = (wx, wy, cam) => wx > cam.x + 368 || wx < cam.x - 128 || wy > cam.y + 288 || wy < cam.y - 128;
export const gone = (spawnX, spawnY, x, y, cam) => offDisplay(spawnX, spawnY, cam) && offCam(x - cam.x, y - cam.y);

export const sonicX = ctx => Math.floor(ctx.player.x), sonicY = ctx => Math.floor(ctx.player.y);

// a new enemy's sprite has run its script once, so its hitbox is set from the first frame
export function sprite(name, anims, opts) {
  const s = makeSprite(name, opts);
  animate(s, anims);
  return s;
}

// the enemy record's data bytes: d0 and d1 signed, d2 and d3 not
export const data = e => ({ d0: s8(e.d[0]), d1: s8(e.d[1]), d2: e.d[2], d3: e.d[3] });

// Kiki (kiki.c): a monkey that climbs up and down its tree at 1 px a frame and throws a coconut on every
// second visit to the top. Facing right, it is drawn 8 px to the left of where it collides.
function kiki(e, slot, anims) {
  const { d1, d3 } = data(e), s = sprite('kikiBob', anims);
  let vel = 1, yoff = 0, tops = 0, t = 0, throwing = false;
  return {
    run(ctx) {
      const x = e.x, wasThrowing = throwing;
      if (!throwing) {
        yoff = s8(yoff + vel);
        if (yoff <= d1 * TILE) {
          tops = (tops + 1) & 0xFF; vel = 1;
          if (!(tops & 1)) { t = 0; startAnim(s, 'kikiThrow'); throwing = true; }
        } else if (yoff >= d1 * TILE + d3 * TILE) vel = -1;
      }
      const y = e.y + yoff;
      if (ctx.attack(s, x, y)) { slot.gone = true; slot.live = null; return false; }
      if (offCam(x - ctx.cam.x, y - ctx.cam.y)) { slot.live = null; return false; }
      s.flipX = !(sonicX(ctx) < x);
      // the throw counts from the frame after the top and ends on its 15th frame, before its animation does
      if (wasThrowing && ++t > 14) {
        throwing = false; startAnim(s, 'kikiBob');
        ctx.add(coconut(s.flipX ? x - 18 : x + 8, y - 8, ctx));
      }
      animate(s, ctx.anims);
      ctx.draw(s, s.flipX ? x - 8 : x, y);
      return true;
    },
  };
}

// the coconut: thrown toward where Sonic is, up to 1.5 px a frame, it bounces once, rests for 96 frames and
// bursts; touching Sonic bursts it at once, even while he can't be hurt. In flight it never leaves.
function coconut(x0, y0, ctx) {
  const s = sprite('coconut', ctx.anims), px = sonicX(ctx);
  let vx = px < x0 ? -Div((x0 - px) * 400, 800) : Div((px - x0) * 400, 800);
  vx = Math.max(-60, Math.min(60, vx));
  let vy = -512, acc = 0, bounces = 0, x = x0, y = y0, resting = false, rest = 0;
  return {
    run(ctx) {
      if (!resting) {
        vy = s16(vy + 40); acc = s16(acc + vx);
        x = x0 + Div(acc, 40);
        y = s16(y + I(vy));
        if (vy > 0) {
          const d = tileFloor(ctx.world.terrain, x, y, 1);
          if (d < 0) {
            y += d;
            if (!bounces) { vy = -(vy >> 2); bounces++; } else { resting = true; rest = 0; vy = 0; }
          }
        }
      } else if (rest++ >= 0x60) { ctx.add(piece(x, y, ctx)); return false; }
      if (ctx.projectile(s, x, y)) { ctx.add(piece(x, y, ctx)); return false; }
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      return true;
    },
  };
}

// what is left of a coconut: it hurts Sonic for the 15 frames it shows
function piece(x, y, ctx) {
  const s = sprite('coconutPiece', ctx.anims);
  return {
    run(ctx) {
      ctx.projectile(s, x, y, true);
      if (animate(s, ctx.anims)) return false;
      ctx.draw(s, x, y);
      return true;
    },
  };
}

// Buzzer (buzzer.c): a wasp that flies back and forth at 1 px a frame and, once per leg, stops to shoot at
// Sonic when he is in a wedge below it on the side it faces. Its animation steps before it decides, so a
// change shows on the next frame. Absent on Easy in the original; this game has no difficulty setting.
function buzzer(e, slot, anims, ctx0) {
  const { d0, d2 } = data(e), s = makeSprite('buzzerFly');
  let vx = -256, off = 0, shot = false, t = 0, state = 'patrol';
  if (sonicX(ctx0) >= e.x) { vx = 256; s.flipX = true; }
  animate(s, anims);
  return {
    run(ctx) {
      if (state === 'patrol') off += vx;
      const x = e.x + I(off), y = e.y;
      if (state === 'shoot' && ++t === 10) ctx.add(buzzerShot(x, y + 6, ctx), 0x9000);
      if (offDisplay(x, y, ctx.cam) && offCam(x - ctx.cam.x, y - ctx.cam.y)) { slot.live = null; return false; }
      if (ctx.attack(s, x, y)) { slot.gone = true; slot.live = null; return false; }
      if (state === 'patrol') {
        animate(s, ctx.anims);
        ctx.draw(s, x, y);
        if (I(off) <= d0 * TILE) {
          vx = 256; startAnim(s, 'buzzerTurn', true); state = 'turn'; s.flipX = true;
        } else if (I(off) >= (d0 + d2) * TILE) {
          vx = -256; startAnim(s, 'buzzerTurn', true); state = 'turn'; s.flipX = false;
        } else if (!shot) {
          const py = sonicY(ctx);
          if (y <= py && y + 96 >= py) {
            const dy = py - y, dx = x - sonicX(ctx);
            let hi = s16(Div(dx * 17, 10)), lo = s16(Div(dx * 10, 17));
            // `frameFlags &= X_FLIP` where `&` was meant: it also clears the sprite's priority, so from now
            // on it is drawn over every background layer
            s.prio = 0;
            if (s.flipX) { hi = -hi; lo = -lo; }
            if (hi >= dy && lo <= dy) { startAnim(s, 'buzzerShoot', true); t = 0; state = 'shoot'; }
          }
        }
        return true;
      }
      if (state === 'shoot') {
        if (t >= 30) { startAnim(s, 'buzzerFly', true); state = 'patrol'; shot = true; }
        animate(s, ctx.anims);
      } else {
        shot = false;
        if (animate(s, ctx.anims)) { startAnim(s, 'buzzerFly'); state = 'patrol'; }
      }
      ctx.draw(s, x, y);
      return true;
    },
  };
}

// sub_8004418: an angle (1024 per turn) from a distance, linear within each eighth of the turn
function octantAngle(a, b) {
  let index = 0;
  if (a <= 0) { a = -a; index = 4; }
  if (b <= 0) { b = -b; index += 2; }
  let frac;
  if (a >= b) frac = Div(b * 128, a);
  else { index++; frac = Div(a * 128, b); }
  const arr = [1, 0, 2, 3, 6, 7, 5, 4];
  if (arr[index] & 1) frac = 128 - frac;
  return (frac + arr[index] * 128) & 1023;
}

// the Buzzer's shot flies straight at where Sonic was, about 1.68 px a frame; it runs after Sonic and goes on
// through him
function buzzerShot(x0, y0, ctx) {
  const s = sprite('buzzerShot', ctx.anims);
  const a = octantAngle(sonicY(ctx) - y0, sonicX(ctx) - x0);
  const vx = Div(COS(a), 38), vy = Div(SIN(a), 38);
  let qx = x0 * 256, qy = y0 * 256;
  return {
    run(ctx) {
      qx += vx; qy += vy;
      const x = I(qx), y = I(qy);
      ctx.projectile(s, x, y);
      const sx = x - ctx.cam.x, sy = y - ctx.cam.y;
      if (((sx + 40) & 0xFFFF) > 280 || sy + 40 < 0 || sy > 200) return false;
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      return true;
    },
  };
}

// GamiGami (gamigami.c): a crab that walks at 0.625 px a frame and, at each end, raises its claws for 19
// frames and fires two shots on the 15th. It follows the ground, and its sprite never turns round.
function gamigami(e, slot, anims, ctx0) {
  const { d0, d2, d3 } = data(e), s = sprite('gamiWalk', anims), layer = d3 ? 1 : 0;
  let vx = -160, off = 0, yoff = 0, t = 0, right = false, turning = false;
  if (sonicX(ctx0) >= e.x) { vx = 160; right = true; }
  return {
    run(ctx) {
      if (!turning) off += vx;
      const x = e.x + Div(off, 256), y = e.y - 6 + yoff;
      if (turning && ++t === 15) {
        // the right one first; both run after Sonic, from this frame
        ctx.add(gamiShot((x + 14) * 4, 6, y - 20, ctx), 0x3000);
        ctx.add(gamiShot((x - 14) * 4, -6, y - 20, ctx), 0x3000);
      }
      if (gone(e.x, e.y, x, y, ctx.cam)) { slot.live = null; return false; }
      if (ctx.attack(s, x, y)) { slot.gone = true; slot.live = null; return false; }
      yoff += tileFloor(ctx.world.terrain, x, y, layer);
      if (!turning) {
        if (Div(off, 256) <= d0 * TILE) {
          if (!right) { vx = 160; t = 0; right = true; startAnim(s, 'gamiClaws'); turning = true; }
        } else if (Div(off, 256) >= (d0 + d2) * TILE) {
          if (right) { vx = -160; t = 0; right = false; startAnim(s, 'gamiClaws'); turning = true; }
        }
      } else if (t > 18) { startAnim(s, 'gamiWalk'); turning = false; }
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      return true;
    },
  };
}

// a crab's shot: 1.5 px a frame sideways, thrown up and falling through everything; it goes on through Sonic
function gamiShot(x4, dx, y0, ctx) {
  const s = sprite('gamiShot', ctx.anims, { order: 9 });
  let vy = -512, y = y0;
  return {
    run(ctx) {
      x4 += dx;
      const x = x4 >> 2;
      vy += 40; y += I(vy);
      ctx.projectile(s, x, y);
      const sx = x - ctx.cam.x, sy = y - ctx.cam.y;
      if (((sx + 20) & 0xFFFF) > 276 || sy + 20 < 0 || sy > 240) return false;
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      return true;
    },
  };
}

// Rhinotank (rhinotank.c): drives at 0.625 px a frame, slides round at each end, and charges at 3 px a frame
// when Sonic is within 80 px in front of it. It rounds its position down while turning or revving and toward
// 0 while driving, so the sprite can shift 1 px when it changes.
function rhinotank(e, slot, anims) {
  const { d0, d2 } = data(e), s = sprite('rhinoDrive', anims);
  let vx = -160, off = 0, yoff = 0, t = 0, tackle = false, state = 'patrol';
  return {
    run(ctx) {
      if (state === 'patrol') off += vx;
      const x = e.x + (state === 'patrol' ? Div(off, 256) : I(off)), y = e.y + yoff;
      if (gone(e.x, e.y, x, y, ctx.cam)) { slot.live = null; return false; }
      if (ctx.attack(s, x, y)) { slot.gone = true; slot.live = null; return false; }
      yoff += tileFloor(ctx.world.terrain, x, y, 1);
      if (state === 'patrol') {
        const px = sonicX(ctx), py = sonicY(ctx);
        // at either end it turns if it faces that way; facing away it doesn't look for Sonic that frame
        if (I(off) <= (d0 + 1) * TILE) {
          if (!s.flipX) {
            if (tackle) off += 768;
            t = 0; vx = 160; startAnim(s, 'rhinoTurn'); state = 'turn';
          }
        } else if (I(off) >= (d0 + d2 - 1) * TILE) {
          if (s.flipX) {
            if (tackle) off -= 768;
            t = 0; vx = -160; startAnim(s, 'rhinoTurn'); state = 'turn';
          }
        } else if (!tackle && y - 32 <= py && y + 8 >= py
          && (s.flipX ? x <= px && x + 80 >= px : x - 80 <= px && x >= px)) {
          tackle = true; t = 0; vx = s.flipX ? 768 : -768; startAnim(s, 'rhinoRev'); state = 'rev';
        }
      } else if (state === 'turn') {
        // it slides on the old way, slowing down and coming back a little at the end
        const k = Div(COS(t * 21), tackle ? 32 : 64);
        off += s.flipX ? k : -k;
        if (++t === 24) {
          startAnim(s, 'rhinoDrive'); off += vx; vx = s.flipX ? -160 : 160;
          s.flipX = !s.flipX; tackle = false; state = 'patrol';
        }
      } else if (++t === 25) { startAnim(s, 'rhinoDrive'); state = 'patrol'; }
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      return true;
    },
  };
}

// KeroKero (kerokero.c): a frog that jumps 1 px a frame toward Sonic when he is within 80 px on the side it
// faces, at any height, and croaks now and then. Sitting, its animation doesn't run, so it shows one frame.
const CROAK_STEPS = [54, 43, 34, 32, 12, 100, 25, 32];
function kerokero(e, slot, anims) {
  const { d0, d2, d3 } = data(e), s = sprite('keroJump', anims), layer = d3 ? 1 : 0;
  let off = 0, yoff = 0, vy = 0, cd = 0, i = 0, n = 0, state = 'idle';
  const face = ctx => { s.flipX = sonicX(ctx) > e.x + I(off); };
  return {
    run(ctx) {
      if (state === 'jump') {
        vy += 64; yoff += Div(vy, 256);
        off += s.flipX ? 256 : -256;
      }
      const x = e.x + I(off), y = e.y + yoff;
      if (gone(e.x, e.y, x, y, ctx.cam)) { slot.live = null; return false; }
      if (state === 'idle') n = s16(n + 1);
      if (ctx.attack(s, x, y)) { slot.gone = true; slot.live = null; return false; }
      const d = tileFloor(ctx.world.terrain, x, y, layer);
      if (state === 'idle') {
        yoff += d;
        face(ctx);
        const px = sonicX(ctx);
        if (n > 250) { cd = 0; n -= 250; startAnim(s, 'keroCroak'); state = 'croak'; }
        else if (cd !== 0) cd--;
        else if ((s.flipX && I(off) <= (d0 + d2 - 8) * TILE && x <= px && x + 80 >= px)
          || (!s.flipX && I(off) >= (d0 + 8) * TILE && x - 80 <= px && x >= px)) {
          vy = -1280; startAnim(s, 'keroJump'); n = s16(n + CROAK_STEPS[i]); i = (i + 1) & 7; state = 'jump';
        }
        ctx.draw(s, x, y);
        return true;
      }
      if (state === 'jump') {
        if (d <= 0) {
          cd = 5; yoff += d;
          startAnim(s, 'keroCroak'); animate(s, ctx.anims); startAnim(s, 'keroJump', true);
          state = 'idle';
          face(ctx);
        }
      } else {
        yoff += d;
        if (++cd > 60) { cd = 0; startAnim(s, 'keroJump'); state = 'idle'; }
      }
      animate(s, ctx.anims);
      ctx.draw(s, x, y);
      return true;
    },
  };
}

/** Makers by enemy kind (gSpriteInits_Enemies): (entity, slot, anims, ctx) → task. */
export const ENEMIES = { [KIKI]: kiki, [BUZZER]: buzzer, [GAMIGAMI]: gamigami, [RHINOTANK]: rhinotank, [KEROKERO]: kerokero,
  [YUKIMARU]: yukimaru, [YUKIMARU_WALL]: yukimaruWall, [DRISAME]: drisame, [KURAA]: kuraa, [PEN]: pen };
