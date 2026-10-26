// The capsule a beaten boss leaves (SAT-R decompilation, src/game/sa1/stage/enemies/bosses_misc.c:
// CreateBossCapsule and the tasks it runs), as it ends a zone's second act in single player. It rises from the
// boss small and spinning, growing to full size, then drops into the middle of the screen, shaking it; landing
// on Sonic, it knocks him aside. It is solid, and Sonic landing on its switch opens it: the clock and the rings
// stop, he loses his controls and walks off to whichever side of the screen he is on, the shell flies off in
// two halves and the zone's animals jump out, two kinds hopping about and two birds circling. Once he
// stands in his act-clear pose, a second after it plays through (or four seconds after he stops), the act's
// results start. Positions are whole pixels in the act and speeds 1/256 px a frame, as the original keeps them.

import { makeSprite, startAnim, animate } from './objects.js';
import { overlap, platform, LANDED } from './collide.js';
import { tileFloor } from './terrain.js';
import { knockAside } from './player.js';
import { SINE } from './trig.js';
import { screenShake, SCREEN_SHAKE, SHAKE } from './screenshake.js';
import { bossPart } from './bosses.js';
import { SCREEN_W } from './constants.js';
import { SONG } from '../sound/songs.js';

const I = v => v >> 8;
const s16 = v => (v << 16) >> 16;
const COS = a => SINE[a + 256], SIN = a => SINE[a];
const OBJECTS = 0x2000;
const CENTRE = SCREEN_W / 2;
const SOX = 6;   // Sonic's spriteOffsetX
// what the walk-off holds for him: right, left, or nothing
const HOLD = dir => ({ left: dir < 0, right: dir > 0, up: false, down: false, jump: false, attack: false, boost: false,
  jumpPressed: false, attackPressed: false, boostPressed: false });

/** CreateBossCapsule: the capsule's task, at the boss's (x, y), in zone `zone` (LEVEL_TO_ZONE: 0 Neo Green Hill). */
export function createBossCapsule(x, y, anims, zone) {
  const s = makeSprite('capsuleSmall', { order: 19 }), s2 = makeSprite('capsuleSwitch', { order: 20 });
  // the rise's speed (unk74) and how far it has risen (offsetY); the turn and scale it is drawn with
  let speed = 0x800, rise = 0, rotation = 0, scale = 0x40;
  let phase = grow;

  // Task_BossCapsuleInit: rising small and spinning, growing until it is full size
  function grow(c) {
    if (scale < 0x100) scale += 8;
    rotation = (rotation + 0x10) & 0xFFFF;
    animate(s, anims);
    c.draw(s, x, y - rise, { rotation, scaleX: scale, scaleY: scale, double: false });
    speed = s16(speed - 0x10); rise = s16(rise + I(speed));
    if (rise > 0xE0) { startAnim(s, 'capsule'); phase = drop; }
    return true;
  }
  // Task_801623C: dropping in the middle of the screen until it meets the floor; there it shakes the screen and
  // knocks Sonic aside if it lands on him
  function drop(c) {
    const sy = y - c.cam.y - rise, cx = c.cam.x + CENTRE;
    if (sy >= 0) {
      animate(s, anims); animate(s2, anims);
      c.draw(s, cx, y - rise); c.draw(s2, cx, y - rise);
    }
    speed = s16(speed - 0x10);
    rise = s16(rise + I(speed));
    if (sy < 96) return true;
    const d = tileFloor(c.world.terrain, cx, c.cam.y + sy + 8, 1);
    if (d > 0) return true;
    y = s16(y - rise + d); x = cx;
    phase = closed;
    c.add(screenShake(0x800, 0x40, 0x100, -1, SHAKE.VERTICAL), SCREEN_SHAKE);
    c.world.playSound(SONG.CAPSULE_LANDS);
    const p = c.player;
    if (touches(s, p) || touches(s2, p)) {
      const left = Math.floor(p.x) < c.cam.x + CENTRE;
      knockAside(p, left ? -2 : 2, -0x4E0 / 256);
      const side = left ? x + s.boxes[0][0] - SOX : x + s.boxes[0][2] + SOX;
      if (left ? Math.floor(p.x) > side : Math.floor(p.x) < side) p.x = side;
    }
    return true;
  }
  // Coll_Player_Entity_Intersection: Sonic's own rectangle on the sprite's box at the capsule
  function touches(sp, p) {
    return !!sp.boxes[0] && !p.dead && overlap(x, y, sp.boxes[0], Math.floor(p.x), Math.floor(p.y), [-SOX, -p.offsetY, SOX, p.offsetY]);
  }
  // the capsule and its switch as solid objects, at (x, y) and (x, y + dy), with their sprites' boxes
  const body = { x: 0, y: 0, boxes: s.boxes }, button = { x: 0, y: 0, boxes: s2.boxes };
  function solid(c, o, sp, dy = 0) {
    o.x = x; o.y = y + dy;
    return platform(o, sp.boxes[0], c.player, c.world.terrain);
  }
  // Task_BossCapsuleUpdate: shut, until Sonic lands on the switch. Pushed down by the capsule or below its
  // bottom, he is put at its bottom left corner.
  function closed(c) {
    animate(s, anims); animate(s2, anims);
    c.draw(s, x, y); c.draw(s2, x, y);
    const p = c.player;
    let pressed = false;
    if (p.state !== 'hurt') {
      const before = Math.floor(p.y);
      solid(c, body, s);
      if (!p.dead && (before < Math.floor(p.y) || y < Math.floor(p.y))) {
        p.x = x + s.boxes[0][0] - SOX; p.y = y - p.offsetY;
      }
      if (solid(c, button, s2) & LANDED) pressed = true;
    }
    if (pressed) {
      phase = opening;
      c.world.stopStage();
      startAnim(s, 'capsuleOpening');
      c.world.playSound(SONG.CAPSULE_OPENS);
      p.gsp = 0; p.ignoreInput = true; p.heldInput = null;
      c.add(walkOff(p), OBJECTS);
    }
    return true;
  }
  // Task_8016650: the switch sinks 4 px and the capsule opens; then the shell's halves fly off and the animals
  // come out
  function opening(c) {
    const ended = animate(s, anims);
    animate(s2, anims);
    const p = c.player;
    if (p.state !== 'hurt') { solid(c, body, s); solid(c, button, s2, 4); }
    c.draw(s, x, y); c.draw(s2, x, y + 4);
    if (!ended) return true;
    if (p.onObject === button) { p.onObject = null; p.air = true; }
    phase = open;
    startAnim(s, 'capsuleOpen');
    c.add(bossPart(x, y, 'capsuleShell', anims, { vx: -256, vy: -512, spin: 4, grow: 0, frames: 60 }));
    c.add(bossPart(x, y, 'capsuleShell', anims, { vx: 256, vy: -512, spin: 4, grow: 0, scaleX: -256, frames: 60 }));
    c.add(animals(x, y, HOPPERS[zone], anims));
    return true;
  }
  // Task_801685C: open, a ledge Sonic can stand on
  function open(c) {
    animate(s, anims);
    if (c.player.state !== 'hurt') solid(c, body, s);
    c.draw(s, x, y);
    return true;
  }
  return { run: c => phase(c) };
}

// sub_801766C: Sonic walks off to the side of the screen he is on, 200 px or 40 px from its left, and stands in
// his act-clear pose facing left; the results come a second after it plays through (Task_8017400), or four
// seconds after he stops if it never does
function walkOff(p) {
  let posing = false, after = 0, waited = 0;
  return {
    run(c) {
      if (posing) {
        if (!p.air) p.state = 'actClearPose';
        if (p.anim.done && after++ > 60) { c.world.stageResults(); return false; }
        if (after === 0 && waited++ > 240) { c.world.stageResults(); return false; }
        return true;
      }
      const sx = Math.floor(p.x) - c.cam.x, right = sx > CENTRE;
      p.ignoreInput = true; p.heldInput = HOLD(right ? 1 : -1);
      if (right ? sx > 200 : sx < 40) {
        p.gsp = 0; p.xsp = 0; p.heldInput = null; p.facing = -1;
        p.state = 'actClearPose'; p.actClear = true;
        posing = true;
      }
      return true;
    },
  };
}

// The animals: the zone's two kinds hopping about (sub_8016D80) and robins and parrots circling (sub_8016F44),
// let out four at a time every four frames, four times, the last time without the first kind or a robin
// (Task_8016B6C). Each draws on the game's random numbers; every other lot goes the other way.
// gUnknown_080BB43C, by zone: its first two columns are the hoppers; the third is never read
const HOPPERS = [
  ['animalGorilla', 'animalKangaroo'],   // Neo Green Hill
  ['animalGorilla', 'animalSkunk'],      // Secret Base
  ['animalPeacock', 'animalDeer'],       // Casino Paradise
  ['animalPenguin', 'animalRabbit'],     // Ice Mountain
  ['animalSkunk', 'animalKangaroo'],     // Angel Island
];
function animals(x, y, kinds, anims) {
  let n = 0, lot = 0;
  return {
    run(c) {
      if ((n++ & 3) === 0) {
        const odd = lot & 1;
        let r;
        if (n !== 5) { r = c.world.random(); c.add(hopper(x, y - 32, kinds[0], r, odd, anims)); }
        r = c.world.random(); c.add(hopper(x, y - 32, kinds[1], r, !odd, anims));
        if (n !== 5) { r = c.world.random(); c.add(bird(x, y - 32, 'animalRobin', r & 7, odd, Math.floor(c.player.y) - 32, anims)); }
        c.add(bird(x, y - 32, 'animalParrot', (r >> 8) & 7, odd, Math.floor(c.player.y) - 32, anims));
        lot++;
      }
      return n <= 12;
    },
  };
}

// sub_8016D80 and sub_8016E54: it jumps 4 px a frame up and 1 px a frame across plus a random part, falls 40/256 px
// a frame faster each frame and jumps again from the floor, turning back once it is 32 px out either way
function hopper(x, y, name, r, flip, anims) {
  const s = makeSprite(name, { order: 15 });
  let vy = -1024 + ((r & 0x1F00) >>> 4), jump = vy, vx = 256 + (r & 0xFF), dx = 0, dy = 0;
  if (flip) vx = -vx;
  return {
    run(c) {
      vy = s16(vy + 40); dy += vy; dx += vx;
      if (vy > 0 && tileFloor(c.world.terrain, x + I(dx), y + I(dy), 1) < 0) {
        vy = jump;
        if (I(dx) < -32 && vx < 0) vx = -vx;
        else if (I(dx) > 32 && vx > 0) vx = -vx;
      }
      s.flipX = vx >= 0;
      animate(s, anims);
      c.draw(s, x + I(dx), y + I(dy));
      return true;
    },
  };
}

// sub_8016F44 and sub_8017054: it circles 64 px either side of the capsule, bobbing 16 px up and down, its size
// going with how near it is, in front of Sonic on the near half and behind him on the far one, while it sinks or
// rises 1 px a frame to 32 px above where he was when it came out
function bird(x, y, name, r, flip, toY, anims) {
  const s = makeSprite(name, { order: 17 });
  let bob = 0, turn = 0, step = 1 + r;
  if (flip) { step = -step; turn = 0x200; }
  return {
    run(c) {
      bob = (bob + 0x10) & 0x3FF;
      turn = (turn + step) & 0x3FF;
      const dy = SIN(bob) >> 2, dx = SIN(turn), scale = s16((COS(turn) >> 8) + 256);
      s.order = scale > 256 ? 15 : 17;
      const back = ((turn - 256) & 0x200) !== 0;
      const scaleX = (step > 0) === back ? -scale : scale;
      if (y > toY) y--;
      else if (y < toY) y++;
      animate(s, anims);
      c.draw(s, x + I(dx), y + I(dy), { rotation: 0, scaleX, scaleY: scale, double: true });
      return true;
    },
  };
}
