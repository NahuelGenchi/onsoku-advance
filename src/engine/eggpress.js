// Secret Base's boss, the Egg Press (SAT-R decompilation, src/game/sa1/stage/enemies/boss_2_egg_press.c): Eggman
// on a spring-loaded press at the end of act 2. When its spawn point comes into range the camera closes in on
// the arena, 300 px wide and ending at the spawn point, and the boss music starts. 121 frames later the press
// drops in 60 px left of its spawn point, lands, and Eggman laughs. Then it hops at Sonic over and over: each
// hop takes 72 frames to reach where he stood, and after its fourth hit, every fourth jump is a leap off the top
// of the screen that follows Sonic and lands on him, shaking the screen and hurting him unless he is in the air
// (sliding from a glide counts as on the ground).
// A jump into the top of the press hits it; it flashes white and can't be hit again for 32 frames; it moves
// faster with each hit. The eighth hit beats it: the spring and the base fly off, the press drops to the floor
// and bounces, and for about 4 seconds it throws debris and explosions every 8 frames. Then Eggman flies off
// in the Egg Mobile, the stage music comes back, and the capsule drops in (`world.bossDefeated`).

import { makeSprite, startAnim, animate } from './objects.js';
import { tileFloor } from './terrain.js';
import { screenShake, SCREEN_SHAKE, SHAKE } from './screenshake.js';
import { setBossCamBounds, bossPart, bossDebris, eggMobileEscape, bossHit26, HIT_ENEMY, HIT_PLAYER } from './bosses.js';
import { SONG } from '../sound/songs.js';
import { SCREEN_W } from './constants.js';

export const EGG_PRESS = 23;

const I = v => v >> 8;
const Div = (a, b) => Math.trunc(a / b);
const s8 = v => (v << 24) >> 24;
const s16 = v => (v << 16) >> 16;
// how far Eggman sits above the press's point, by its frame's first OAM entry over 5 (gUnknown_084ACDA0)
const EGGMAN_RAISE = [0, -1, -2, 3, -11, -20];
// the press's speed after each hit, in tenths (gUnknown_084ACDAC)
const SPEEDS = [10, 10, 10, 10, 12, 12, 14, 16, 16, 0];
const BOSS_MUSIC = 0x10, STAGE_MUSIC = 0x30;   // gMusicManagerState.unk1: start the boss song 0, then go back

/** The Egg Press's task (CreateEntity_EggPress), for enemy kind 23. */
export function createEggPress(e, slot, anims, ctx) {
  // it never spawns again in this act, beaten or not
  slot.gone = true;
  const x0 = e.x, y0 = e.y, cam = ctx.world.camera;
  ctx.add(setBossCamBounds(cam, y0 - 144, y0 + 16, x0 - 300, x0));
  ctx.world.musicState(BOSS_MUSIC);
  // the press and Eggman; neither has run its script, so they are not solid yet
  const s = makeSprite('eggPressSquash', { order: 21 }), s2 = makeSprite('eggPressEggman', { order: 22 });
  // the offsets from the spawn point and their speeds in 1/256 px, the gravity of a hop, a frame counter, the
  // hits taken (unkAE), the frames left of a hit's flash (unkAF), the leap's turn (unkB0) and the beaten press's
  // fall (qUnkB2)
  let qx = 0, qy = 0, vx = 0, vy = 0, gravity = 0, count = 0, hits = 0, flash = 0, leaps = 0, fall = 0;
  if (ctx.world.difficulty !== 0) hits = 2;   // Easy
  let phase = wait;

  // the original's ANIM_OVER flag: set by the update that ends a one-shot, cleared by the next one that starts
  // an animation; and the first OAM entry of the press's frame on screen (its dimensions' oamIndex), kept until
  // an update shows another
  const update = sp => {
    animate(sp, ctx.anims); sp.over = sp.anim.done;
    if (sp === s && sp.anim.i >= 0) sp.oamIndex = anims[sp.anim.name].oamIndex?.[sp.anim.i];
  };
  const at = () => [s16(x0 + I(qx)), s16(y0 + I(qy))];
  function draw(c, x, y) {
    // Eggman sits on the press, or 46 px lower on what is left of it once it is beaten (sub_802D908)
    const ey = s.anim.name === 'eggPressNoSpring' ? y + 46 : y - EGGMAN_RAISE[Div(s.oamIndex, 5)];
    c.draw(s, x, y); c.draw(s2, x, ey);
  }
  // Sonic against the press, while it isn't flashing (sub_802D748)
  function hit(c, x, y) {
    s.white = false;
    if (flash !== 0) return;
    const result = bossHit26(s, x, y, c);
    if (result === HIT_ENEMY) {
      hits = s8(hits + 1); flash = 0x20;
      if (hits === 4) leaps = 1;
      startAnim(s2, 'eggPressEggmanHurt'); s2.over = false;
      c.world.playSound(SONG.BOSS_HIT);
    } else if (result === HIT_PLAYER) {
      startAnim(s2, 'eggPressEggmanLaugh'); s2.over = false;
    }
  }
  // the hit's flash, white on every other pair of its first 15 frames (sub_802D870), then both sprites
  function show(c, x, y) {
    if (flash !== 0) {
      flash = s8(flash - 1);
      if (flash > 0x10 && !(flash & 2) && !c.player.dead) s.white = true;
    }
    draw(c, x, y);
  }
  // Eggman's face goes back to normal when its animation ends (sub_802EF24)
  function face() {
    if (s2.anim.name !== 'eggPressEggman' && s2.over) startAnim(s2, 'eggPressEggman', true);
  }
  // the start of each of the fight's frames: the hit, the defeat once it has taken 8, otherwise its place
  function fight(c) {
    const [x, y] = at();
    hit(c, x, y);
    if (hits > 7) { beaten(c); return null; }
    face();
    return [x, y];
  }

  // Task_EggPressMain: nothing for 121 frames, then it shows 144 px up and starts to fall
  function wait(c) {
    if (count++ <= 120) return true;
    qx = -60 * 256; qy = -144 * 256; vy = 0;
    const [x, y] = at();
    update(s); update(s2);
    c.draw(s, x, y); c.draw(s2, x, y);
    phase = drop;
    return drop(c);
  }
  // Task_802DC3C: falling 32/256 px a frame faster each frame, landing on the spawn point's height
  function drop(c) {
    if (qy !== 0) {
      vy += 32; qy += vy;
      if (qy >= 0) {
        qy = 0;
        startAnim(s, 'eggPressSquash', true);
        update(s); update(s2);
        c.world.playSound(SONG.IMPACT);
      }
      draw(c, ...at());
      return true;
    }
    update(s); update(s2);
    draw(c, ...at());
    if (s.over) { phase = landed; startAnim(s, 'eggPress', true); count = 120; }
    return true;
  }
  // Task_802DDCC: 120 frames still, Eggman laughing after the first 60 (they wait while he does)
  function landed(c) {
    if (s2.anim.name === 'eggPressEggman') {
      count = (count - 1) & 0xFFFF;
      if (count === 60) startAnim(s2, 'eggPressEggmanLaugh', true);
      if (count === 0) {
        phase = ready; vy = 0;
        startAnim(s, 'eggPressSquash', true); startAnim(s2, 'eggPressEggman', true);
      }
    } else if (s2.over) startAnim(s2, 'eggPressEggman', true);
    update(s); update(s2);
    draw(c, ...at());
    return true;
  }
  // Task_802DEFC: crouching, then a hop toward Sonic or, on the leap's turn, a leap
  function ready(c) {
    const xy = fight(c);
    if (!xy) return true;
    update(s); update(s2);
    show(c, ...xy);
    if (!s.over) return true;
    if ((leaps & 3) === 1) {
      vx = 0; vy = -10 * 256;
      phase = leap;
    } else {
      const speed = SPEEDS[hits];
      vx = Div(Math.floor(c.player.x * 256) - xy[0] * 256, 72);
      vx = Div(speed * vx, 10); vy = Div(speed * -1152, 10); gravity = Div(speed * (speed * 0x20), 100);
      s.flipX = s2.flipX = vx >= 0;
      phase = hop;
    }
    if (leaps !== 0) leaps = s8(leaps + 1);
    return true;
  }
  // Task_802E130: the hop, its sprites still until it lands
  function hop(c) {
    vy += gravity; qx += vx; qy += vy;
    if (qy >= 0) {
      qy = 0; vx = 0; vy = 0;
      startAnim(s, 'eggPressSquash', true);
      update(s); update(s2);
      phase = landing;
      c.world.playSound(SONG.IMPACT);
    }
    const xy = fight(c);
    if (xy) show(c, ...xy);
    return true;
  }
  // Task_802E290: the landing's crouch, then a rest that is shorter the faster it is
  function landing(c) {
    const xy = fight(c);
    if (!xy) return true;
    update(s); update(s2);
    show(c, ...xy);
    if (s.over) { startAnim(s, 'eggPress', true); count = Div(300, SPEEDS[hits]); phase = rest; }
    return true;
  }
  // Task_802E3DC
  function rest(c) {
    const xy = fight(c);
    if (!xy) return true;
    update(s); update(s2);
    show(c, ...xy);
    count = (count - 1) & 0xFFFF;
    if (count === 0) { startAnim(s, 'eggPressSquash', true); phase = ready; }
    return true;
  }
  // Task_802E500: up 10 px a frame, slowing by 32/256; above 200 px it keeps over Sonic, and it lands on him
  function leap(c) {
    const p = c.player;
    vy += 32; qy += vy;
    if (qy < -200 * 256) qx = Math.floor(p.x * 256) - x0 * 256;
    if (qy >= 0) {
      qy = 0; vy = 0; count = 60;
      startAnim(s, 'eggPressStomp', true);
      phase = stomp;
      c.world.playSound(SONG.IMPACT);
      c.add(screenShake(0x800, 0x40, 0x100, -1, SHAKE.VERTICAL), SCREEN_SHAKE);
      // on the ground, or Knuckles sliding from a glide (charState 65)
      if (!p.air || p.state === 'glideSlide') {
        c.world.damage();
        startAnim(s2, 'eggPressEggmanLaugh'); s2.over = false;
      }
    }
    const xy = fight(c);
    if (xy) show(c, ...xy);
    return true;
  }
  // Task_802E714: the stomp's crouch, then 60 frames still
  function stomp(c) {
    const xy = fight(c);
    if (!xy) return true;
    update(s); update(s2);
    show(c, ...xy);
    if (s.anim.name === 'eggPressStomp') {
      if (s.over) startAnim(s, 'eggPress', true);
    } else {
      count = (count - 1) & 0xFFFF;
      if (count === 0) { startAnim(s, 'eggPressSquash', true); phase = ready; }
    }
    return true;
  }

  // sub_802E868: the eighth hit. What is left of the press jumps 48 px up, its spring and base fly off, the
  // camera stops where it is (and the widescreen view's arena closes in on it across), and the hit scores 1000
  // points.
  function beaten(c) {
    qy -= 48 * 256;
    const [x, y] = at();
    startAnim(s2, 'eggPressEggmanHurt');
    fall = -2 * 256;
    c.world.playSound(SONG.EXPLOSION);
    count = 0;
    startAnim(s, 'eggPressNoSpring', true);
    const right = s.flipX, part = { vy: -512, grow: 0, vx: right ? 4 * 256 : -4 * 256, scaleX: right ? -256 : 256, frames: 60 };
    c.add(bossPart(x, y, 'eggPressSpring', c.anims, { ...part, spin: 0x80 }));
    c.add(bossPart(x, y + 32, 'eggPressBase', c.anims, { ...part, spin: 0x180 }));
    cam.minX = Math.floor(cam.x); cam.maxX = Math.floor(cam.x);
    cam.arena = { minX: cam.minX, maxX: cam.maxX + SCREEN_W, minY: y0 - 144, maxY: y0 + 16 };
    c.world.addScore(1000);
    phase = falling;
    falling(c);
  }
  // Task_802EA8C: it falls 40/256 px a frame faster each frame and bounces off the floor at 3/4 of its speed
  // until that is under 1 px a frame
  function falling(c) {
    fall = s16(fall + 0x28); qy += fall;
    // it is drawn, and throws its debris, from where it was before the floor pushed it out
    const [x, y] = at();
    const d = tileFloor(c.world.terrain, x, y + 16, 1);
    if (d < 0) {
      qy += d * 256;
      fall = s16((fall >> 2) - fall);
      if (fall > -256) { fall = 0; phase = smoking; }
    }
    s.white = false;
    count = (count + 1) & 0xFFFF;
    if ((count & 7) === 0) bossDebris(c, x, y);
    update(s); update(s2);
    draw(c, x, y);
    return true;
  }
  // sub_802ECFC: on the floor, until 241 frames after it was beaten
  function smoking(c) {
    const [x, y] = at();
    if (count > 240) {
      c.add(eggMobileEscape(x, y - 4, c.anims));
      c.world.bossDefeated(x, y);
      c.world.musicState(STAGE_MUSIC);
      return false;
    }
    count = (count + 1) & 0xFFFF;
    if ((count & 7) === 0) bossDebris(c, x, y);
    update(s); update(s2);
    draw(c, x, y);
    return true;
  }

  return { run: c => phase(c) };
}
