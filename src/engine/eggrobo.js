// The Super Egg Robo, the Moon Zone's boss (SAT-R decompilation, src/game/sa1/stage/enemies/boss_xtra_super_egg_robot.c,
// and its attacks in src/game/sa1/stage/player_super_sonic.c, checked in the USA ROM). Its body is drawn on the
// rotating background BG2; its head, arms and legs are 18 sprites (and a knee), each a task that hangs from the
// one before it in its limb, turned by its own angle on top of its parent's. The robot walks on the ground the
// stage scrolls under it, raises an arm and swings it, digs the ground up with its hands, sweeps its laser over
// the ground and throws ring capsules that trap Super Sonic. Only a dash into its head hurts it: 8 hits on normal
// (6 on easy), then it falls back, spilling nuts and bolts, and the screen fades to white.
//
// Positions are the original's 8.8 fixed point integers, angles its u16 turns (0x10000 a turn).

import { makeSprite, startAnim, animate } from './objects.js';
import { overlap } from './collide.js';
import { tileFloor } from './terrain.js';
import { SINE } from './trig.js';
import { groundScroll, hurtSuperSonic, followGround, IA_OVERRIDE, HIDDEN, GOAL_REACHED, KEY_LEFT, KEY_RIGHT } from './supersonic.js';
import { SONG, EXTRA_SONG } from '../sound/songs.js';

export const BOSS = 0x2000, PARTS = 0x2001;     // the robot's task and its parts' (the entities manager's priority + 1)
const FALLING = 0x2, DEFEATED = 0x80, WAITING = 0x400000;   // flags58: in the air, beaten, held until the WARNING's 128th frame
const DISPCNT_WIN0 = 0x2000, DISPCNT_OBJWIN = 0x8000;

const I = q => q >> 8, Q = n => n * 256;
const s16 = v => (v << 16) >> 16, u16 = v => v & 0xFFFF;
const sin = a => SINE[a & 1023] >> 6, cos = a => SINE[(a & 1023) + 256] >> 6;
const div = (a, b) => Math.trunc(a / b);   // the BIOS's Div

// gUnknown_084AE560: the parts of the near arm and the near leg
const NEAR = [0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0];

// sub_804CFE0: turns `part.rel` toward `target` by `speed`; true once it is there
function ease(part, target, speed) {
  const v = part.rel;
  target = u16(target);
  if (target === v) return true;
  if (u16(target - v) < 0x8000) {
    const v2 = v + speed;
    part.rel = u16(v2);
    if (u16(target - v2) >= 0x8000) { part.rel = target; return true; }
  } else {
    const v2 = v - speed;
    part.rel = u16(v2);
    if (u16(target - v2) < 0x8000) { part.rel = target; return true; }
  }
  return false;
}

// a sprite's hitbox 1 against Super Sonic's body, hurting him (sub_800BFEC), and its hitbox 0 against his attack
// box (sub_800C0E0)
function hurts(s, x, y, w) {
  const p = w.player, b = p.sprite.boxes[0];
  if (!s.boxes[1] || !b || p.dead || !overlap(x, y, s.boxes[1], I(p.qx), I(p.qy), b)) return false;
  if (hurtSuperSonic(p, w)) w.hit();
  return true;
}
function struck(s, x, y, w) {
  const p = w.player, b = p.sprite.boxes[1];
  return !!s.boxes[0] && !!b && !p.dead && overlap(x, y, s.boxes[0], I(p.qx), I(p.qy), b);
}
const canHurt = (w, boss) => w.player.invulnerable === 0 && !(boss.flags & DEFEATED);

/**
 * The robot (CreateEntity_SuperEggRobot and sub_80504DC), made by the entities manager from its map entity at
 * (x, y): its main task, and its parts' tasks added after it at PARTS, in the original's order. `w` is the stage's
 * world (see createExtraStage). `difficulty` is the save's (0 normal, 1 easy).
 */
export function createSuperEggRobo(e, w, difficulty = 0) {
  const boss = {
    qx: -0x10000, qy: -0x3600, vx: 0, vy: 0, ax: 0, ay: 0,
    timer: 0,          // qUnk54
    rounds: 0,         // qUnk56: the laser rounds in a row
    flags: WAITING | FALLING,
    done: 0,           // unk5C: a bit for each part that finished its move
    offsetX: 0, baseY: e.y,   // unk60, qUnk64
    hits: 8 - difficulty * 2, // unk68
    flash: 0,          // unk69: the frames left of the hit flash
    capsule: 240,      // unk6C: the frames to the next ring capsule
    state: 0, next: 0, // unk6E, unk6F
    parts: [],
  };
  w.robo = boss;
  const add = (kind, parent, ox, oy, order, prio, anim, extra = {}) => {
    const part = {
      kind, index: boss.parts.length, parent, ox, oy, dx: 0, dy: 0, qx: 0, qy: 0, angle: 0, rel: 0, count: 0, ...extra,
      sprite: makeSprite(anim, { order, prio }),
    };
    if (kind !== 'knee') boss.parts.push(part);
    w.add(partTask(part, boss, w), PARTS);
    return part;
  };
  const body = add('body', null, 0, 0, 21, 2, null);
  add('head', body, 0x400, -0x1C00, 22, 2, 'roboHead');
  for (const [first, prio, orders] of [[[0xB00, -0x1700], 1, [15, 16, 15, 16, 14]], [[-0x500, -0x1900], 2, [27, 28, 27, 28, 26]]]) {
    const shoulder = add('bearing', body, ...first, orders[0], prio, 'roboJoint', { scale: 384 });
    const upper = add('joint', shoulder, 0, 0x1400, orders[1], prio, 'roboJoint');
    const elbow = add('elbow', upper, 0, 0x1200, orders[2], prio, 'roboJoint', { scale: 320 });
    const lower = add('joint', elbow, 0, 0x1200, orders[3], prio, 'roboJoint');
    add('hand', lower, 0, 0x800, orders[4], prio, 'roboHand');
  }
  const thigh = add('thigh', body, 0x200, 0x500, 20, 1, 'roboThigh', { rel: 0xE000 });
  add('knee', thigh, 0, 0, 19, 1, 'roboKnee');
  const shin = add('shin', thigh, -0x900, 0xC00, 18, 1, 'roboShin');
  add('foot', shin, 0x300, 0x1B00, 17, 1, 'roboFoot');
  const farThigh = add('thigh', body, -0x600, 0x500, 23, 2, 'roboThighFar', { rel: 0x2000 });
  const farShin = add('shin', farThigh, -0x900, 0xB00, 22, 2, 'roboShinFar');
  add('foot', farShin, 0x300, 0x1B00, 24, 2, 'roboFootFar');
  // the body is a background sprite, its frames the stage's own art
  body.sprite = makeSprite('roboBody', { order: 21, prio: 2 });
  return { priority: BOSS, run: () => mainTask(boss, w) };
}

// sub_8050194: how far the ground is below the robot: under each foot, from two points along it, and under the
// body's front, each where the scrolling has put the ground; feet on the ground may kick up dust
function groundCheck(boss, w) {
  const [body, foot, shin, farFoot, farShin] = [0, 14, 13, 17, 16].map(i => boss.parts[i]);
  const wrapped = x => groundScroll(x, w.tick);   // the ground's x under world x
  const under = (x, y) => tileFloor(w.terrain, x, y, 1);
  const legs = [[foot, shin, 1], [farFoot, farShin, 0]].map(([f, s, odd]) => {
    const x = wrapped(I(f.qx)), a = f.angle >> 6, b = s.angle >> 6;
    const y1 = I(f.qy) + ((cos(a) * Q(9) - (sin(a) << 12)) >> 16) + 6;
    const d1 = under(x + 16, y1);
    const y2 = I(f.qy) + ((sin(b) * Q(21) + (cos(b) << 11)) >> 16) + 6;
    const d = Math.min(under(x + 21, y2), d1);
    if (d <= 0 && boss.state !== 1 && (w.tick & 1) === odd && !(w.random() & 0x30000)) w.brakeDust(I(f.qx), Math.max(y1, y2) - 2, -4);
    return d;
  });
  const a = body.angle >> 6;
  const y = I(body.qy) + ((sin(a) * Q(27) - cos(a) * Q(22)) >> 16);
  const x = wrapped(I(body.qx) + ((cos(a) * Q(27) + sin(a) * Q(22)) >> 16));
  return Math.min(under(x, y), legs[1], legs[0]);
}

function move(boss) {
  boss.qx += boss.vx; boss.qy += boss.vy;
  boss.vx = s16(boss.vx + boss.ax); boss.vy = s16(boss.vy + boss.ay);
}

// Task_SuperEggRobotInit: the robot's moves and its states
function mainTask(boss, w) {
  if (!(boss.flags & WAITING)) {
    if (boss.flags & FALLING) {
      move(boss);
      boss.vy = s16(boss.vy + 16);
      const d = groundCheck(boss, w);
      if (d < 0) { boss.qy += Q(d); boss.flags &= ~FALLING; boss.vy = 0; }
    } else {
      const d = groundCheck(boss, w);
      if (d <= 3) boss.vy = Q(d); else boss.flags |= FALLING;
      move(boss);
    }
  }
  switch (boss.state) {
    // it lands, waits a second, raises the near arm and swings it (4, 5), then the far one (6, 7), digs with
    // both hands (8, 9), opens its mouth (10), sweeps the laser (11) and sets the ground on fire (12) four times
    case 2: if (!(boss.flags & FALLING)) boss.next++; break;
    case 3: if (boss.timer++ >= 60) boss.next++; boss.timer = s16(boss.timer); break;
    case 9:
      if (boss.timer++ >= 300) { boss.rounds = 0; boss.next++; }
      boss.timer = s16(boss.timer);
      break;
    case 4: case 5: case 6: case 7: case 8: case 10: case 11:
      if (boss.done !== 0) boss.next++;
      break;
    case 12:
      if (boss.done !== 0) boss.next = ++boss.rounds < 4 ? 11 : 3;
      break;
    // it flies in high from the left at 4 px a frame and drops in at x 416
    case 0:
      if (boss.qx < Q(416)) { boss.qy = -Q(128); boss.vy = 0; boss.vx = Q(4); } else { boss.ax = -16; boss.next = 1; }
      break;
    case 1:
      if (boss.qx < Q(416)) { boss.ax = 0; boss.vx = 0; boss.qx = Q(416); boss.next = 2; } else boss.vx = Math.max(-Q(2), boss.vx);
      break;
    // beaten: it rears up, then falls back and slides off to the left
    case 13: if (boss.done !== 0) boss.next = 14; break;
    case 14:
      if (!(boss.flags & FALLING)) {
        boss.ax = -16;
        if (boss.vx < -Q(6)) { boss.vx = -Q(6); boss.ax = 0; }
        if (boss.qx <= -Q(120)) boss.vx = 0;
      }
      break;
    default: boss.vx = 0; boss.ax = 0; break;
  }
  if (boss.flags & DEFEATED) {
    // two seconds after the last hit the screen fades to white, 1/16 every 4 frames, then the stage ends
    const fade = Math.min(Math.max(boss.timer - 120, 0) >> 2, 16);
    if (boss.flash === 0) {
      w.display.dispcnt &= ~DISPCNT_OBJWIN;
      w.display.winOut = 0x3F3F; w.display.bldCnt = 0xBF; w.display.bldY = fade;
    }
    if (fade === 16) { w.defeated(); return false; }
    debris(boss, w);
    if (boss.timer < 0x7FFF) boss.timer++;
  } else if (boss.state > 1 && --boss.capsule <= 0) {
    boss.capsule = 240;
    w.add(capsule(Q(boss.offsetX) + boss.qx - Q(21), Q(boss.baseY) + boss.qy - Q(10), w), PARTS);
  }
  if (boss.state !== boss.next) {
    for (const part of boss.parts) part.count = 0;
    boss.done = 0; boss.timer = 0; boss.state = boss.next;
  }
  return true;
}

// sub_80520B8: while it is beaten, a burst of nuts and bolts somewhere on it every 16 frames, every 8 as it falls
function debris(boss, w) {
  if ((w.tick & 0xF) && !(boss.state === 14 && !(w.tick & 7))) return;
  const dx = ((w.random() << 10) >>> 18) - Q(32), dy = ((w.random() << 9) >>> 17) - Q(64);
  w.add(nutsAndBolts(boss.qx + Q(boss.offsetX) + dx, boss.qy + Q(boss.baseY) + dy, w), BOSS);
}

// sub_8017540 and Task_NutsAndBolts: a burst that stays put, gone when its animation ends or it is off screen
function nutsAndBolts(qx, qy, w) {
  w.random();   // its flips, which the robot clears again
  const s = makeSprite('roboBlast', { order: 14, prio: 1 });
  return {
    run() {
      const x = I(qx) - w.cam.x, y = I(qy) - w.cam.y;
      if (x < -32 || x > 272 || y - 32 > 160 || animate(s, w.anims)) return false;
      w.draw(s, I(qx), I(qy));
      return true;
    },
  };
}

function partTask(part, boss, w) {
  return { run: () => { PART_TASKS[part.kind](part, boss, w); return true; } };
}

// each part's place: its offset from its parent, turned by the parent's angle, and its own angle on top
function place(part) {
  const parent = part.parent, a = parent.angle >> 6;
  part.dx = (part.ox * cos(a) - part.oy * sin(a)) >> 8;
  part.dy = (part.ox * sin(a) + part.oy * cos(a)) >> 8;
  part.qx = (part.dx + parent.qx) | 0; part.qy = (part.dy + parent.qy) | 0;
  part.angle = u16(part.rel + parent.angle);
}
const turned = (part, rotation = part.angle >> 6, scale = 256, double = false) => ({ rotation, scaleX: scale, scaleY: scale, double });
const near = part => (NEAR[part.index] & 1) === 1;
const finish = (part, boss) => { boss.done |= 1 << part.index; };

const PART_TASKS = {
  // sub_8050888: the body, on BG2 turned round 4 px left of its point; it leans with the swinging arm
  body(part, boss, w) {
    part.qx = part.dx + Q(boss.offsetX) + boss.qx;
    part.qy = part.dy + Q(boss.baseY) + boss.qy;
    part.angle = part.rel;
    if (canHurt(w, boss)) hurts(part.sprite, I(part.qx), I(part.qy), w);
    animate(part.sprite, w.bodyAnims);
    w.body(part.sprite, I(part.qx) - w.cam.x, I(part.qy) - w.cam.y, part.angle >> 6);
    const lean = arm => s16(s16(u16(boss.parts[arm].rel - 0x4000)) >> 2);
    switch (boss.state) {
      case 4: ease(part, lean(2), 64); break;
      case 5: part.rel = u16(lean(2)); break;
      case 6: ease(part, lean(7), 64); break;
      case 7: part.rel = u16(lean(7)); break;
      case 0: ease(part, 0x800, 0x80); break;
      case 1: ease(part, 0xF800, 0x80); break;
      case 13: ease(part, 0, 0x80); break;
      case 14: ease(part, 0x4000, 0x200); break;
      default: ease(part, 0, 0x80); break;
    }
  },

  // sub_8050A88: the head. A dash into it is a hit: it flashes white for 32 frames, in which it can't be hit,
  // and Super Sonic bounces back. It opens its mouth for the laser and sets the ground on fire.
  head(part, boss, w) {
    place(part);
    const s = part.sprite, x = I(part.qx), y = I(part.qy), p = w.player, d = w.display;
    if (p.dashing && struck(s, x, y, w)) {
      if (!(boss.flags & DEFEATED) && boss.flash <= 0) {
        boss.flash = 0x20;
        p.dashing = false; p.invulnerable = 8; p.vx = -Q(2); p.gsp = -Q(2);
        if (--boss.hits <= 0) {
          d.dispcnt &= ~DISPCNT_WIN0; d.bldCnt = 0; d.win0 = null;
          boss.state = boss.next = 13;
          boss.vx = 0x180; boss.vy = -0x100;
          boss.flags |= DEFEATED; boss.timer = 0;
          w.stopClock();
          w.addScore(1000);
        }
      }
    } else if (canHurt(w, boss)) hurts(s, x, y, w);
    let window = false;
    if (!(boss.flags & DEFEATED) || boss.flash !== 0) {
      if (!p.dead) { d.dispcnt &= ~DISPCNT_OBJWIN; d.winOut = 0; d.bldCnt = 0; d.bldY = 0; }
      if (boss.flash !== 0) {
        // the head's shape becomes the OBJ window, inside which the screen is turned full white
        if (!(w.tick & 2)) { window = true; d.dispcnt |= DISPCNT_OBJWIN; d.winOut = 0x3F1F; d.bldCnt = 0xBF; d.bldY = 16; }
        boss.flash--;
      }
    }
    animate(s, w.anims);
    w.draw(s, x, y, turned(part), { window });
    switch (boss.state) {
      case 2: case 3: ease(part, 0, 0x200); break;
      case 10: if (ease(part, 0xF000, 0x200)) finish(part, boss); break;
      case 11: {
        d.dispcnt &= ~DISPCNT_WIN0;
        if (part.count === 0) { startAnim(s, 'roboHeadLaser', true); w.play(EXTRA_SONG.LASER); }
        if (part.count === 10) w.stop(EXTRA_SONG.LASER);
        if (part.count > 15) {
          finish(part, boss);
          d.bldCnt = 0; d.win0 = null;
          startAnim(s, 'roboHead', true);
        } else {
          const a = u16((256 - cos(((part.count << 10) >> 6) & 0x3FF)) * 32 + Q(92));
          if (!p.dead && !laser(x - w.cam.x, y - w.cam.y, a, part, d)) d.win0 = null;
          part.count++;
        }
        break;
      }
      case 12:
        // a fire every 8 frames, each 32 px further left, until one would start off the left of the screen
        if (!(part.count & 7)) {
          const fx = part.qx - (part.count << 10) - Q(100);
          if (fx < -Q(32)) finish(part, boss);
          else w.add(groundFire(fx, Q(boss.baseY), w), PARTS + 1);
        }
        part.count++;
        break;
      case 13: ease(part, 0x1800, 0x100); break;
      case 14: ease(part, 0x2000, 0x100); break;
      default: ease(part, 0, 0x100); break;
    }
  },

  // sub_8050FB4: the shoulder's bearing, drawn 1.5 times its size and never turned; it raises the arm, swings
  // it down and digs
  bearing(part, boss, w) {
    place(part);
    animate(part.sprite, w.anims);
    w.draw(part.sprite, I(part.qx), I(part.qy), turned(part, 0, part.scale, true));
    const mine = near(part);
    switch (boss.state) {
      case 2: ease(part, 0, 0x100); break;
      case 3: ease(part, mine ? 0x1000 : 0x2000, 0x200); break;
      case 4: case 6:
        if (mine === (boss.state === 4)) {
          ease(part, 0x6000, 0x100);
          if (part.rel === 0x6000 && part.count++ >= 30) finish(part, boss);
        }
        break;
      case 5: case 7:
        if (mine === (boss.state === 5)) {
          const k = Math.min(part.count, 16);
          const drop = ((((256 - cos(((k << 26) >>> 22))) << 16) >>> 0) >>> 10);
          ease(part, (boss.state === 5 ? 0x5800 : 0x6000) - drop, 0x800);
          if (part.count++ >= 76) finish(part, boss);
        }
        break;
      case 8: case 9:
        if (ease(part, 0xF000, 0x100)) {
          if (boss.timer++ >= 60) finish(part, boss);
          boss.timer = s16(boss.timer);
        }
        break;
      case 13: ease(part, 0xD000, 0x400); break;
      case 14: ease(part, 0xF000, 0x100); break;
      default: ease(part, 0, 0x100); break;
    }
  },

  // sub_8051344: the elbow's bearing, 1.25 times its size; it shakes while digging
  elbow(part, boss, w) {
    place(part);
    animate(part.sprite, w.anims);
    w.draw(part.sprite, I(part.qx), I(part.qy), turned(part, 0, part.scale, true));
    const mine = near(part);
    switch (boss.state) {
      case 2: ease(part, 0, 0x100); break;
      case 3: ease(part, mine ? 0x6000 : 0x6800, 0x200); break;
      case 4: if (mine) ease(part, 0x6000, 0x100); break;
      case 5: if (mine) ease(part, 0x1000, 0x400); break;
      case 6: if (!mine) ease(part, 0x6000, 0x100); break;
      case 7: if (!mine) ease(part, 0x1000, 0x400); break;
      case 8: ease(part, 0x4000, 0x200); break;
      case 9: ease(part, 0x4000 - ((w.random() << 12) >>> 20), 0x1000); break;
      case 13: ease(part, 0x2000, 0x400); break;
      case 14: ease(part, 0x1000, 0x100); break;
      default: ease(part, 0, 0x100); break;
    }
  },

  // sub_80518E8: the bearing between two arm pieces, a plain sprite
  joint(part, boss, w) {
    place(part);
    animate(part.sprite, w.anims);
    w.draw(part.sprite, I(part.qx), I(part.qy));
    ease(part, 0, 0x100);
  },

  // sub_8051604: the hand, turned a quarter less than its angle, its hitbox 23 px along it; digging, it throws up
  // a rock every 32 frames
  hand(part, boss, w) {
    place(part);
    const s = part.sprite, b = u16(part.angle - 0x4000) >> 6;
    if (canHurt(w, boss)) {
      hurts(s, I(part.qx) + ((-(cos(b) * Q(23))) >> 16), I(part.qy) + ((-(sin(b) * 0x1700)) >> 16), w);
    }
    animate(s, w.anims);
    w.draw(s, I(part.qx), I(part.qy), turned(part, b));
    switch (boss.state) {
      case 2: ease(part, 0x4000, 0x200); break;
      case 3: ease(part, 0, 0x200); break;
      // against the arm's turn, so the hand stays level (the decomp's C has the hand's own angle; its
      // assembly has the parent's)
      case 8: ease(part, -part.parent.angle, 0x200); break;
      case 9:
        ease(part, -part.parent.angle, 0x200);
        if (!(w.tick & 0x1F)) w.add(rock(part.qx, part.qy + 0x1700, !(w.random() & 0x30000) ? 1 : 0, w), PARTS + 1);
        break;
      case 13: ease(part, 0xB000, 0x400); break;
      case 14: ease(part, 0, 0x100); break;
      default: ease(part, 0, 0x100); break;
    }
  },

  // sub_80519E8: the thigh; when beaten, the near one says it is done once the hit flash is over
  thigh(part, boss, w) {
    place(part);
    animate(part.sprite, w.anims);
    w.draw(part.sprite, I(part.qx), I(part.qy), turned(part));
    switch (boss.state) {
      case 2: case 3: ease(part, 0, 0x200); break;
      case 4: ease(part, part.parent.rel, 0x100); break;
      case 5: if (!near(part)) ease(part, 0xE800, 0x200); break;
      case 6: break;
      case 7: if (near(part)) ease(part, 0xE800, 0x200); break;
      case 0: ease(part, 0x1000, 0x80); break;
      case 13:
        ease(part, 0x4000, 0x200);
        if (boss.flash === 0 && part.rel === 0x4000) finish(part, boss);
        break;
      case 14: ease(part, 0xE800, 0x100); break;
      default: ease(part, 0, 0x80); break;
    }
  },

  // sub_805202C: the knee, a plain sprite on the thigh's point
  knee(part, boss, w) {
    const parent = part.parent;
    part.qx = (part.dx + parent.qx) | 0; part.qy = (part.dy + parent.qy) | 0;
    part.angle = u16(part.rel + parent.angle);
    animate(part.sprite, w.anims);
    w.draw(part.sprite, I(part.qx), I(part.qy));
    ease(part, 0, 0x100);
  },

  // sub_8051C44
  shin(part, boss, w) {
    place(part);
    animate(part.sprite, w.anims);
    w.draw(part.sprite, I(part.qx), I(part.qy), turned(part));
    switch (boss.state) {
      case 2: ease(part, 0, 0x200); break;
      case 8: case 9: ease(part, 0, 0x200); break;
      case 0: ease(part, 0x2000, 0x80); break;
      case 1: ease(part, 0xE000, 0x80); break;
      case 13: ease(part, 0, 0x400); break;
      case 14: ease(part, 0x1800, 0x100); break;
      default: ease(part, 0x2000, 0x100); break;
    }
  },

  // sub_8051E38: the foot keeps flat on the ground while an arm swings
  foot(part, boss, w) {
    place(part);
    animate(part.sprite, w.anims);
    w.draw(part.sprite, I(part.qx), I(part.qy), turned(part));
    switch (boss.state) {
      case 2: case 3: break;
      case 4: case 5: case 6: case 7: ease(part, part.angle < 0x1000 ? -part.angle : 0, 0x100); break;
      case 0: case 11: case 12: ease(part, 0xE000, 0x100); break;
      case 13: ease(part, 0xF800, 0x400); break;
      default: ease(part, 0, 0x100); break;
    }
  },
};

// sub_8052150: the laser's beam from the mouth down to the left at angle `a`, as window 0's triangle (the lines'
// edges written for the HBlank copy to WIN0H), brightened by 14/16. False when it is off the screen.
function laser(sx, sy, a, head, d) {
  const c = cos(head.angle >> 6), s = sin(head.angle >> 6);
  let r7 = sx + (((s << 12) - c * 0xF00) >> 16);
  let r5 = sy + (((0 - (c << 12)) - s * 0xF00) >> 16);
  let r6 = r5 + 3, sl = 0, sp8 = 0;
  const slope = s16(div(sin(a >> 6) << 8, cos(a >> 6))), inverse = div(0x10000, slope);
  let r1 = r5 - ((r7 * slope) >> 8), r8 = r1 + 3;
  if (r7 > 239) { const k = I(slope * (240 - r7)); r5 += k; r6 += k; r7 = 239; }
  if (r5 >= 159) return false;
  let sb = r7, r4 = r7;
  if (r5 < 0) {
    r4 = r7 - ((r5 * inverse) >> 8); r5 = 0;
    if (r6 < 0) { sb = r7 - ((r6 * inverse) >> 8); r6 = 0; }
  }
  const clamp = (v, hi) => Math.min(Math.max(v, 0), hi);
  r5 = clamp(r5, 159); r6 = clamp(r6, 159);
  if (r8 > 159) {
    sp8 += ((160 - r8) * inverse) >> 8; r8 = 159;
    if (r1 > 159) { sl += (inverse * (160 - r1)) >> 8; r1 = 159; }
  }
  if (sl >= 239 || r5 >= 159 || r7 === sl || r5 === r1 || r6 === r8) return false;
  sl = clamp(sl, 239);
  const r2 = clamp(sp8, 239);
  d.win0Lines ??= new Uint8Array(320);
  triangle(d.win0Lines, [r4, r5, sl, r1, sb, r6, r2, r8].map(v => v & 0xFF), r7 + 1);
  d.dispcnt |= DISPCNT_WIN0;
  d.win0 = { top: clamp(r5, 159), bottom: clamp(r8, 159), lines: d.win0Lines };
  d.winOut = 0x1F1F; d.winIn = 0x3F3F; d.bldCnt = 0x3FBF; d.bldY = 14;
  return true;
}

// sub_8006DB4: a triangle's two edges, from (t[0], t[1]) to (t[2], t[3]) and from (t[4], t[5]) to (t[6], t[7]),
// walked down line by line (Bresenham), written as each line's [right, left] bytes; the right edge goes no
// further than `right`
function triangle(buf, t, right) {
  const u8 = v => v & 0xFF;
  let line = Math.min(t[1], t[5]), end = Math.max(t[1], t[5]), at = line * 2;
  const dx = [s16(t[2] - t[0]), s16(t[6] - t[4])], dy = [s16(t[3] - t[1]), s16(t[7] - t[5])];
  const ax = [s16(Math.abs(dx[0]) * 2), s16(Math.abs(dx[1]) * 2)], ay = [s16(Math.abs(dy[0]) * 2), s16(Math.abs(dy[1]) * 2)];
  const edge = [t[0], t[4]], err = [s16(-dy[0]), s16(-dy[1])];
  const put = (k, v) => { if (at + k < buf.length) buf[at + k] = u8(v); };
  // each edge's steps across for one line down; the left edge's last step left is the line's start, the right
  // edge's last step right one past its end
  const left = () => {
    while (err[0] >= 0) {
      if (dx[0] > 0) { if (right > edge[0]) edge[0] = u8(edge[0] + 1); err[0] = s16(err[0] - ay[0]); }
      else { if (edge[0] !== 0) edge[0] = u8(edge[0] - 1); err[0] = s16(err[0] - ay[0]); if (err[0] >= 0) put(1, edge[0]); }
    }
  };
  const rightEdge = () => {
    while (err[1] >= 0) {
      if (dx[1] > 0) { if (right > edge[1]) edge[1] = u8(edge[1] + 1); err[1] = s16(err[1] - ay[1]); if (err[1] >= 0) put(0, edge[1] + 1); }
      else { if (edge[1] !== 0) edge[1] = u8(edge[1] - 1); err[1] = s16(err[1] - ay[1]); }
    }
  };
  if (line !== end && t[1] < t[5]) {
    for (; line < end; line++, at += 2) { put(0, right); put(1, edge[0]); err[0] = s16(err[0] + ax[0]); left(); }
  } else {
    for (; line < end; line++, at += 2) { put(0, edge[1]); put(1, 0); err[1] = s16(err[1] + ax[1]); rightEdge(); }
  }
  end = Math.min(t[3], t[7]);
  for (; line < end; line++, at += 2) {
    put(0, edge[1]); put(1, edge[0]);
    err[0] = s16(err[0] + ax[0]); err[1] = s16(err[1] + ax[1]);
    left(); rightEdge();
  }
  end = Math.max(t[3], t[7]);
  if (t[3] <= t[7]) {
    for (; line < end; line++, at += 2) { put(0, edge[1]); put(1, 0); err[1] = s16(err[1] + ax[1]); rightEdge(); }
  } else {
    for (; line < end; line++, at += 2) { put(0, right); put(1, edge[0]); err[0] = s16(err[0] + ax[0]); left(); }
  }
}

// sub_804A8A8 and Task_804AAC4: a rock thrown up by a hand (kinds 0 and 1) or a piece of one (2), spinning and
// falling; it hurts, and a dash breaks it into 3 - kind pieces
function rock(qx, qy, kind, w) {
  const s = makeSprite(['rockBig', 'rockMid', 'rockSmall'][kind], { order: 12, prio: 1 });
  let vx, vy;
  if (qx === Q(512)) { vx = s16(-((w.random() << 14) >>> 22)); vy = (w.random() & 0xFF00) >> 8; }
  else { vx = s16(((w.random() & 0x3FF00) >> 8) - 0x300); vy = s16(-((w.random() & 0x3FF00) >> 8) - 0x80); }
  if (kind === 2) { vx >>= 2; vy >>= 2; }
  let angle = u16(w.random() >>> 8), spin = s16(((w.random() << 11) >>> 19) - 0x1000), scaleX = 256, scaleY = 256;
  if (kind === 0) {
    spin >>= 1;
    scaleX -= (w.random() & 0x4000) >> 8;
    scaleY -= (w.random() & 0x4000) >> 8;
  }
  if (w.random() & 0x10000) scaleY = -scaleY;
  return {
    run() {
      if (qx < -Q(32) || qx > Q(512) || qy < -Q(32) || qy > Q(320)) return false;
      const p = w.player;
      if (p.dashing) {
        if (struck(s, I(qx), I(qy), w)) {
          for (let i = 3 - kind; i > 0; i--) w.add(rock(qx, qy, 2, w), PARTS + 2);
          w.play(EXTRA_SONG.ROCK_BREAK);
          return false;
        }
      } else if (canHurt(w, w.robo)) hurts(s, I(qx), I(qy), w);
      animate(s, w.anims);
      w.draw(s, I(qx), I(qy), { rotation: angle >> 6, scaleX, scaleY, double: false });
      qx += vx; qy += vy;
      vy = s16(vy + 7);
      angle = u16(angle + spin);
      return true;
    },
  };
}

// sub_804B570 and Task_804B420: fire running along the ground where the laser struck, hurting Super Sonic unless
// he dashes through it
function groundFire(qx, qy, w) {
  const s = makeSprite('groundFire', { order: 12, prio: 1 });
  return {
    run() {
      if (s.anim.done || qx < -Q(32) || qx > Q(512)) return false;
      qy += Q(tileFloor(w.terrain, I(qx) + groundScroll(w.cam.x, w.tick) - w.cam.x, I(qy), 1));
      const p = w.player;
      if (!p.dashing && canHurt(w, w.robo)) hurts(s, I(qx), I(qy), w);
      animate(s, w.anims);
      w.draw(s, I(qx), I(qy));
      return true;
    },
  };
}

// ExtraBossCapsule_UpdateSprite: the capsule's sprite is its top half, drawn again flipped upside down for the
// bottom
function drawCapsule(s, x, y, w) {
  animate(s, w.anims);
  w.draw({ ...s, flipY: true }, x, y);
  w.draw(s, x, y);
}

// sub_804B2BC and its tasks: a ring capsule thrown from the robot's middle. It drifts left for 48 frames, then
// homes in on Super Sonic's height and shoots left at 3 px a frame. A dash breaks it, scattering 8 rings;
// touching it otherwise shuts it round him (Task_804AE14), and it holds him for 4 seconds, less 20 frames for
// each press of left or right, while his rings run down (Task_804AF00). A hit frees him.
function capsule(qx, qy, w) {
  const s = makeSprite('capsule', { order: 12, prio: 1 });
  let vx = -Q(1), vy = 0, count = 48, stage = 'thrown', shake = 0;
  const p = w.player;
  const gone = () => qx < -Q(32) || qx > Q(480);
  // ExtraBoss__CapsuleGetCaptureState: -1 broken, 1 caught him, 0 neither
  const capture = () => {
    if (p.moveState & GOAL_REACHED) return 0;
    if (!struck(s, I(qx), I(qy), w)) return 0;
    if (p.dashing) {
      w.play(SONG.ENEMY_DEFEAT);   // SE_ITEM_BOX
      w.scatterRings(I(qx), I(qy), 8);
      halves(qx, qy, w);
      return -1;
    }
    if (p.invulnerable !== 0 || (w.robo.flags & DEFEATED)) return 0;
    startAnim(s, 'capsuleShut', true);
    p.moveState |= GOAL_REACHED;
    stage = 'closing';
    return 1;
  };
  const free = () => {
    p.moveState &= ~(GOAL_REACHED | IA_OVERRIDE | HIDDEN);
    halves(qx, qy, w);
    return false;
  };
  return {
    run() {
      const x = I(qx), y = I(qy);
      switch (stage) {
        case 'thrown':
          if (gone()) return false;
          drawCapsule(s, x, y, w);
          qx += vx; qy += vy;
          if (--count <= 0) { startAnim(s, 'capsuleChase', true); vx = 0; vy = 0; stage = 'homing'; }
          return true;
        case 'homing': case 'shooting': {
          if (gone()) return false;
          const caught = capture();
          if (caught < 0) return false;
          drawCapsule(s, x, y, w);
          if (caught > 0) return true;
          qx += vx; qy += vy;
          if (stage === 'shooting') return true;
          if (p.qy - qy < -Q(8)) { vy = -Q(1); return true; }
          if (p.qy - qy > Q(8)) { vy = Q(1); return true; }
          vx = -Q(3); vy = 0; stage = 'shooting';
          return true;
        }
        case 'closing':
          if (p.invulnerable !== 0) { p.moveState &= ~GOAL_REACHED; halves(qx, qy, w); return false; }
          qx = p.qx; qy = p.qy;
          drawCapsule(s, I(qx), I(qy), w);
          if (s.anim.done) {
            count = 240;
            p.gsp = 0; p.vx = 0; p.vy = 0; p.dashing = false;
            p.moveState |= IA_OVERRIDE | HIDDEN;
            startAnim(s, 'capsuleHold', true);
            stage = 'holding';
          }
          return true;
        case 'holding': {
          if (p.invulnerable !== 0 || --count < 0) return free();
          if (p.pressed & (KEY_LEFT | KEY_RIGHT)) count -= 20;
          followGround(p, w);
          qx = p.qx + shake; qy = p.qy;
          shake = (((p.pressed & KEY_RIGHT) << 1) - (p.pressed & KEY_LEFT)) << 5;
          drawCapsule(s, I(qx), I(qy), w);
          return true;
        }
      }
      return false;
    },
  };
}

// sub_804AFCC and Task_804B0D8: the capsule's two halves fall away, spinning, the second mirrored
function halves(qx, qy, w) {
  for (let i = 0; i < 2; i++) {
    let x = qx, y = qy, vx = s16(-(((w.random() & 0x7F00) >> 8) + 0x80));
    let vy = s16(((w.random() & 0x7F00) >> 8) + 0x40), angle = 0;
    const spin = s16(((w.random() << 13) >>> 21) - Q(4)), scaleX = i & 1 ? -256 : 256;
    if (i & 1) vx = s16(-vx);
    const s = makeSprite('capsuleHalf', { order: 12, prio: 1 });
    w.add({
      run() {
        if (x < -Q(32) || x > Q(512) || y < -Q(32) || y > Q(320)) return false;
        animate(s, w.anims);
        w.draw(s, I(x), I(y), { rotation: angle >> 6, scaleX, scaleY: 256, double: false });
        x += vx; y += vy;
        vy = s16(vy + 7);
        angle = u16(angle + spin);
        return true;
      },
    }, PARTS + 1);
  }
}

