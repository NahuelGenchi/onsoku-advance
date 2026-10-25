// The players as the multiplayer modes see them (SAT-R decompilation, src/game/shared/stage/mp_player.c, the
// SA1 Task_CreateMultiplayerPlayer and sub_8016D20, sub_8017F34 and sub_8018300, with collision_1.c
// sub_800DA4C and collision_2.c sub_800DD54 and sub_800DE44). Each GBA has one of these tasks for every player
// on the link, its own among them, and draws every player, itself too, from the packets the link brings it:
// where they were two frames ago, the animation they showed, and how they were flipped, turned and layered.
// Sonic's own sprite isn't drawn in these modes. The tasks of the others also run what touching them does to
// this GBA's Sonic: his attack box on another's body knocks them back (as their GBA sees it), their attack box
// on his body knocks him, and a knock takes the Chao the one knocked carries over to the other.

import { makeAnimator, setAnim, tickAnim, frameOf } from './animator.js';
import { overlap } from './collide.js';
import { tileEdge, PROBE_FLOOR, PROBE_WALL } from './terrain.js';
import { standUp } from './player.js';
import { solidPlayer } from './mpsolid.js';
import { SONIC_ANIMATIONS } from '../rom/extract.js';
import { SONG } from '../sound/songs.js';

const STALE = 30;           // frames the others wait after a knock before touching again (unk60)
const LINK_TIMEOUT = 30;    // frames without a packet before the link error
const KNOCK_TIME = 120;     // PLAYER_INVULNERABLE_DURATION
const KNOCK_X = 1.5, KNOCK_Y = 3;
const SOX = 6;              // spriteOffsetX
const I = q => q >> 8;
// the packet's flag bits (the player's sub_8024B10, chaohunt.js)
export const FLAG = {
  ROTATED: 1, FACING_RIGHT: 2, UNTOUCHABLE: 4, GRAVITY: 8, PRIORITY: 0x30, HIDDEN: 0x40, LAYER: 0x80,
  CARRIED: 0x100, NEW_ANIM: 0x800, STANDING_ON: 0x600,
};
// Sonic's animations by [animation, variant], as the packets carry them
const BY_ID = {};
for (const [name, [anim, variant]] of Object.entries(SONIC_ANIMATIONS)) BY_ID[`${anim}:${variant}`] ??= name;
export const animationIds = name => SONIC_ANIMATIONS[name];

const box = () => ({ active: false, b: [0, 0, 0, 0] });
const flipped = ([l, t, r, b], flipX, flipY) => {
  if (flipY) [t, b] = [-b, -t];
  if (flipX) [l, r] = [-r, -l];
  return [l, t, r, b];
};

/**
 * Player `id`'s task on this GBA (CreateMultiplayerPlayer): it starts where this GBA's own player starts,
 * whoever it is, until its packets come in. `mp` is the mode's shared state.
 */
export function createMultiplayerPlayer(mp, id, start, anims) {
  const own = id === mp.id;
  const m = {
    id, pos: { x: start.x, y: start.y },
    dx: 0, dy: 0,               // unk44, unk48: how far its last packet moved it
    qvx: 0, qvy: 0,             // unk66, unk68: that in 1/256 px, 0 after a jump of more than 64 px
    touch: 0,                   // unk4C: what the solidity test found last
    flags: 0,                   // unk54: its packet's flags
    items: 0x80,                // unk57: its packet's item effects
    state: 2,                   // unk5C: 1 out of the round, 2 the title card still running, 4 carried,
                                // 0x10000 << n carrying Chao n
    wait: own ? 0 : STALE,      // unk60
    missed: 0,                  // unk61: frames since its last packet
    standsOn: id,               // unk64
    offsetY: 0,                 // unk58[0]
    animId: 0, variant: 0, anim: makeAnimator(), shown: -1, frame: -1, rotation: 0,
    flipX: false, flipY: false, boxes: [box(), box()],
  };
  // its sprite, as what Sonic stands on (stoodObj) is read: its place and its body box
  m.sprite = { get x() { return m.pos.x; }, get y() { return m.pos.y; }, get boxes() { return [m.boxes[0].b, m.boxes[1].b]; } };
  setAnim(m.anim, BY_ID['0:0']);

  // UpdateSpriteAnimation: a box its script sets takes the sprite's flips of that moment
  function animate() {
    tickAnim(m.anim, anims);
    if (m.anim.i === m.shown) return;
    m.shown = m.anim.i;
    const boxes = anims[m.anim.name].frames[m.anim.i][2];
    if (boxes) {
      for (const [slot, b] of Object.entries(boxes)) {
        if (slot > 1) continue;
        m.boxes[slot] = b ? { active: true, b: flipped(b, m.flipX, m.flipY) } : { active: false, b: [0, 0, 0, 0] };
      }
    }
    m.frame = frameOf(m.anim, anims);
  }
  const lose = () => { m.boxes[0].active = false; m.boxes[1].active = false; };

  // a packet: where it is, how it moved, the items it newly has, its flags, and its animation
  function receive(r, ctx) {
    const p = ctx.player;
    m.missed = 0;
    m.dx = r.x - m.pos.x; m.dy = r.y - m.pos.y;
    m.pos.x = r.x; m.pos.y = r.y;
    if (Math.abs(m.dx) > 0x40 || Math.abs(m.dy) > 0x40) { m.qvx = 0; m.qvy = 0; }
    else { m.qvx = m.dx << 8 << 16 >> 16; m.qvy = m.dy << 8 << 16 >> 16; }
    const added = ~m.items & r.itemEffect;
    if (added & 0x50) mp.confusionBubble(id);
    m.items = r.itemEffect;
    m.flags = r.flags;
    if (!own) m.standsOn = (r.flags & FLAG.STANDING_ON) >> 9;
    else if (m.standsOn !== mp.id && mp.players[m.standsOn]?.standsOn === mp.id) {
      // two players standing on each other: this one drops off
      const o = mp.players[m.standsOn];
      m.standsOn = mp.id;
      p.onObject = null; p.pushing = false; p.curled = false; p.airLock = false; p.air = true;
      p.spinDashing = false; p.jumped = false;
      standUp(p);
      p.midAir = 0; p.attack = 0;
      p.state = 'walk';
      p.invulnerable = 60;
      p.carried = false;
      m.state &= ~4;
      if (o.state & 4) { p.carried = false; o.state &= ~4; }
    }
    // Chao Hunt: the animation, and the Chao the player carries in its top bits
    const animId = r.anim & 0x3FF;
    if (!own) m.state |= (r.anim >> 12) << 16;
    let n = 0;
    for (let k = 0; k < 3; k++) if (m.state & (0x10000 << k)) n++;
    mp.charRings[id] = n;
    const variant = r.variant & 7;
    if (m.animId !== animId || m.variant !== variant) lose();
    if (m.flags & FLAG.UNTOUCHABLE) {
      if (m.state & 4) { p.carried = false; m.state &= ~4; }
      if (p.onObject === m.sprite) { p.onObject = null; p.air = true; }
    }
    m.animId = animId; m.variant = variant;
    m.offsetY = (r.variant << 24 >> 24) >> 3;
    m.anim.speed = r.animSpeed;
    m.rotation = r.rotation * 4;
    const name = BY_ID[`${animId}:${variant}`];
    if (name && name !== m.anim.name) { setAnim(m.anim, name, true); m.shown = -1; }
  }

  // sub_8017F34: Sonic standing on it moves with it, unless it jumped more than 128 px; the terrain stops him
  function carry(p, t) {
    if (Math.abs(m.dx) > 0x80 || Math.abs(m.dy) > 0x80) { p.onObject = null; p.air = true; m.wait = STALE; return; }
    p.x += m.dx;
    p.y += m.dy + 1;
    const drop = () => { p.onObject = null; p.air = true; m.wait = STALE; };
    if (m.dy < 0) {
      const res = tileEdge(t, Math.floor(p.y) - p.offsetY, Math.floor(p.x), p.layer, -8, PROBE_FLOOR);
      if (res < 0) { p.y -= res; drop(); }
    } else if (m.dy > 0) {
      const res = tileEdge(t, Math.floor(p.y) + p.offsetY, Math.floor(p.x), p.layer, 8, PROBE_FLOOR);
      if (res < 0) { p.y += res; drop(); }
    }
    if (m.dx < 0) {
      const res = tileEdge(t, Math.floor(p.x) - SOX, Math.floor(p.y), p.layer, -8, PROBE_WALL);
      if (res < 0) p.x -= res;
    } else if (m.dx > 0) {
      const res = tileEdge(t, Math.floor(p.x) + SOX, Math.floor(p.y), p.layer, 8, PROBE_WALL);
      if (res < 0) p.x += res;
    }
  }

  // sub_800DA4C: this GBA's Sonic, as its own packets show him, against this player: his attack box on its
  // body (1, with the sides and heights he is on), or its attack box on his body (2), standing still too
  function contact(p) {
    if (p.dead || ((m.flags >> 7) & 1) !== p.layer) return 0;
    const me = mp.players[mp.id], [o0, o1] = m.boxes, [h0, h1] = me.boxes;
    let r = 0;
    if (p.xsp === 0 && p.ysp === 0 && o1.active && overlap(m.pos.x, m.pos.y, o1.b, me.pos.x, me.pos.y, h0.b)) r |= 2;
    if (h1.active && o0.active && overlap(m.pos.x, m.pos.y, o0.b, me.pos.x, me.pos.y, h1.b)) {
      r |= me.pos.x > m.pos.x ? 0x40000 : 0x20000;
      r |= me.pos.y > m.pos.y ? 0x10000 : 0x100000;
      r |= 1;
    } else if (h0.active && o1.active && overlap(m.pos.x, m.pos.y, o1.b, me.pos.x, me.pos.y, h0.b)) r |= 2;
    return r;
  }

  // sub_800DD54 (`state` 'hurt') and sub_800DE44 ('knocked', in which he keeps his air control): knocked up and
  // away from the way he faces (backwards when hurt), unless invincible or still blinking
  function knock(p, state, world) {
    if (p.invincible > 0 || p.invulnerable > 0) return false;
    p.invulnerable = KNOCK_TIME;
    const left = p.facing < 0;
    p.xsp = state === 'hurt' ? (left ? KNOCK_X : -KNOCK_X) : (left ? -KNOCK_X : KNOCK_X);
    p.ysp = -KNOCK_Y;
    p.onObject = null; p.pushing = false; p.airLock = false; p.air = true; p.spinDashing = false; p.jumped = false;
    p.state = state;
    standUp(p);
    p.midAir = 0; p.attack = 0;
    world.playSound(SONG.LIFE_LOST);
    return true;
  }

  // the solidity test's result, as sub_8016D20 and sub_8018300 keep it
  function solid(p, ctx, arg) {
    const val = solidPlayer(m, p, ctx, arg, knock);
    if ((m.touch & 0x20) && !(val & 0x20)) p.pushing = false;
    m.touch = val;
    if (val & 0x200000) m.wait = STALE;
  }

  // sub_8018300: true when a knock happened
  function versus(p, ctx) {
    if (m.wait !== 0) {
      m.wait--;
      if (p.onObject === m.sprite) solid(p, ctx, 0);
      return false;
    }
    const v = contact(p);
    if (v & 1) {
      if (p.midAir === 0 && (v & 0x20000)) { if (p.xsp > 0) { p.xsp = -p.xsp; p.gsp = -p.gsp; } }
      else if (p.midAir === 0 && (v & 0x40000)) { if (p.xsp < 0) { p.xsp = -p.xsp; p.gsp = -p.gsp; } }
      if ((v & 0x100000) && p.ysp > 0) p.ysp = -p.ysp;
      m.wait = STALE;
      if (!(v & 2)) return true;
    }
    if (v & 2) {
      if (v & 1) { p.facing = m.pos.x < Math.floor(p.x) ? 1 : -1; knock(p, 'knocked', ctx.world); }
      else { p.facing = m.pos.x < Math.floor(p.x) ? -1 : 1; knock(p, 'hurt', ctx.world); }
      m.wait = STALE;
      // the Chao he carries goes to this player
      const me = mp.players[mp.id];
      if (me.state & 0x70000) {
        let i = 0;
        while (i < 3 && !(me.state & (0x10000 << i))) i++;
        me.state &= ~(0x10000 << i);
        mp.chao[i].playerA = id;
        mp.sendEvent({ type: 9, id1: i, id2: id });
      }
      return true;
    }
    if (!p.boxes[1] && !m.boxes[1].active) solid(p, ctx, 0);
    else {
      if (p.onObject === m.sprite) { p.onObject = null; p.air = true; }
      if (m.touch & 0x20) p.pushing = false;
    }
    return false;
  }

  m.task = {
    run(ctx) {
      const p = ctx.player, r = mp.recv(id);
      if (r) m.missed = 0;
      if (r && r.kind === 0x1000) receive(r, ctx);
      else {
        m.pos.x += I(m.qvx); m.pos.y += I(m.qvy);
        if (m.missed++ > LINK_TIMEOUT) mp.linkError();
      }
      if (m.flags & FLAG.NEW_ANIM) { setAnim(m.anim, m.anim.name, true); m.shown = -1; lose(); }
      animate();

      const me = mp.players[mp.id];
      const free = !mp.actStart && !(m.flags & FLAG.UNTOUCHABLE) && !(me.items & 0x80);
      let apart = false;
      if (free && (p.itemEffect & 0x80)) apart = true;
      else if (free && !(m.items & 0x80) && !(me.state & 1) && p.invulnerable === 0 && !p.dead) {
        // sub_8016D20, as Sonic
        if (!own) {
          if (p.onObject === m.sprite) carry(p, ctx.world.terrain);
          if (versus(p, ctx) && (m.touch & 0x20)) { p.pushing = false; m.touch = 0; }
        }
      } else if ((p.itemEffect & 0x80) || (m.items & 0x80) || p.invulnerable !== 0 || p.dead || mp.ranks[id] !== -1) apart = true;
      if (apart && p.onObject === m.sprite) { p.onObject = null; p.air = true; m.wait = STALE; }

      // how it is drawn: through the rotation hardware, mirrored by a negative scale, or flipped
      let affine = null;
      if (m.flags & FLAG.ROTATED) {
        let scaleX = m.flags & FLAG.FACING_RIGHT ? -256 : 256;
        if (m.flags & FLAG.GRAVITY) scaleX = -scaleX;
        affine = { rotation: m.rotation, scaleX, scaleY: 256, double: false };
      } else {
        m.flipX = !!(m.flags & FLAG.FACING_RIGHT);
        m.flipY = !!(m.flags & FLAG.GRAVITY);
      }
      if (m.flags & FLAG.HIDDEN) return true;
      // blinking while untouchable, and hidden until the title card ends
      if ((ctx.world.tick & 2) || (m.items & 0x20) || (m.state & 1) || mp.ranks[id] !== -1
        || (m.wait === 0 && !(m.flags & FLAG.UNTOUCHABLE) && !(m.state & 2))) {
        // an invisible player is only a window onto the background, on the others' screens
        const window = (m.items & 0x20) && m.wait === 0 && !own;
        if (window) mp.objectWindow();
        ctx.draw({ frame: m.frame, flipX: m.flipX, flipY: m.flipY, order: m.flags & FLAG.LAYER ? 17 : 16,
          prio: (m.flags & FLAG.PRIORITY) >> 4, window }, m.pos.x, m.pos.y, affine);
      }
      return true;
    },
  };
  return m;
}
