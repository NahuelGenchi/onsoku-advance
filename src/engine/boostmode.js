// Sonic Advance 2's Boost Mode effects, run the way Sonic Advance 2 runs them (SAT-R decompilation of Sonic
// Advance 2, src/game/sa2/stage/boost_effect.c and boost_mode_particles.c), from the art in the player's own
// Sonic Advance 2 ROM (src/rom/sa2boost.js):
// - the afterimages: Sonic's position and sprite are kept for the last 16 frames, and three copies of him play
//   his animation as it was 2, 4 and 6 frames before, in his boost palette, just behind him. Each frame only one
//   of them shows, in turn. They show while he is alive and in Boost Mode, or boosting with the Rush boost.
// - the particles: Boost Mode's start throws sixteen of them out, moving with Sonic. For 10 frames eight
//   spread out ahead of him, then for 15 frames all sixteen sweep back past him, eight a frame in turn.
// Positions are 24.8 fixed point (1/256 px), as the original's are; angles are 256 steps per turn.

import { BOOST_MODE as B } from './constants.js';
import { makeAnimator, setAnim, tickAnim, frameOf } from './animator.js';
import { sin8, cos8 } from './trig.js';

const s16 = v => (v << 16) >> 16;
const mul = (a, b) => (a * b) >> 8;   // Q_MUL
const q8 = v => Math.round(v * 256);
const SLOW = 200, GROW = 257;         // Q(0.78125) and Q(1.00390625)
const RAND_CONST = 0x37119371;

// Sonic as the afterimages copy him: where he was and what his sprite showed
const snapshot = p => ({
  x: p.x, y: p.y, name: p.anim.name, speed: p.anim.speed, facing: p.facing, rotation: p.rotation,
  affine: p.state === 'walk' || p.state === 'bounce', prio: p.death || p.front ? 1 : 2,
});

/**
 * The effects' state for an act (re)started with Sonic as `p`: the history full of where he starts
 * (InitializePlayer), and the afterimages' turns from the start, as the stage's start makes them.
 */
export function createBoostFx(p) {
  const now = snapshot(p);
  return {
    history: Array.from({ length: B.history }, () => now), at: 0,
    afterimages: B.afterimages.map(() => ({ anim: makeAnimator(), turn: 0 })),
    bursts: [],
  };
}

/** Keeps Sonic's position and sprite at the end of his frame (BoostEffect_StorePlayerPos and StorePlayerState). */
export function recordSonic(fx, p) {
  fx.at = (fx.at + 1) % B.history;
  fx.history[fx.at] = snapshot(p);
}

/**
 * Runs the afterimages for a frame (Task_80159C8) while `active`, each stepping its own copy of the animation
 * Sonic had, and returns the one to draw, or null: { frame, x, y, flipX, affine, prio }. A rotated frame turns
 * the way he was turned then; none is moved the pixel Sonic's own sprite is.
 */
export function stepAfterimages(fx, anims, active) {
  if (!active) return null;
  let shown = null;
  fx.afterimages.forEach((a, k) => {
    const then = fx.history[(fx.at - B.afterimages[k] + B.history) % B.history];
    if (then.name !== null) {
      setAnim(a.anim, then.name);
      a.anim.speed = then.speed;
      tickAnim(a.anim, anims);
    }
    if (++a.turn > 2) a.turn = 0;
    if (a.turn !== k || then.name === null) return;
    const right = then.facing > 0;
    shown = {
      frame: frameOf(a.anim, anims), x: then.x, y: then.y, flipX: right, prio: then.prio,
      affine: then.affine ? { rotation: then.rotation << 2, scaleX: right ? -256 : 256, scaleY: 256, double: false } : null,
    };
  });
  return shown;
}

// SeedRng and Random: Sonic Advance 2's own random numbers, two 32-bit values summed
function rng(prev, cur) {
  return () => {
    const p = prev;
    prev = cur;
    cur = (p + RAND_CONST + cur) >>> 0;
    return cur >>> 16;
  };
}

// the angles of Sonic's way ahead and of its normal, from the ground's angle and the way he faces
const ahead = p => (p.facing < 0 ? (p.rotation + 128) & 0xFF : p.rotation);

/**
 * The particles of Boost Mode's start (CreateBoostModeParticles), from Sonic's position and angle and the
 * camera's left edge `camX`, which seed their random numbers. The first step of their animation is taken here.
 */
export function startBurst(fx, p, camX, anims) {
  const random = rng(q8(p.x) >>> 0, camX >>> 0), a = ahead(p), normal = p.facing < 0 ? (p.rotation + 192) & 0xFF : (p.rotation + 64) & 0xFF;
  const b = { frame: 0, end: false, anim: makeAnimator(), name: 'boostParticles', pos: [], acc: [], backX: 0, backY: 0 };
  setAnim(b.anim, b.name); tickAnim(b.anim, anims);
  for (let i = 0; i < B.particles; i++) {
    const r = s16((random() & 0x7FF) + 0x1000);
    b.pos.push([s16(mul(cos8(a), r)), s16(mul(sin8(a), r))]);
    const v = (random() & 0x3FF) + 512;
    b.acc.push([s16(mul(cos8(normal), v)), s16(mul(sin8(normal), v))]);
  }
  fx.bursts.push(b);
}

// the switch to the second part: new random speeds, from a new seed, and the sweep back the way he came
function turnBack(b, p, camX) {
  const random = rng(q8(p.x) >>> 0, camX >>> 0), a = ahead(p);
  b.name = 'boostParticlesEnd';
  for (let i = 0; i < B.particles; i++) {
    const angle = p.facing < 0 ? (random() + 64) & 0xFF : random() & 0xFF;
    b.backX = s16(cos8(a) * 4); b.backY = s16(sin8(a) * 4);
    const v = (random() & 0x3FF) + 0x600;
    b.acc[i] = [s16(mul(cos8(angle), v)), s16(mul(sin8(angle), v))];
  }
  b.end = true;
}

/**
 * Runs each burst for a frame (sub_8089E54, then sub_808A0A4) and calls `draw(frame, x, y)` for each particle
 * it shows, around Sonic as he is now. All of a frame's particles share one sprite's tiles, so they all show the
 * frame its animation is on when the last of them is put on screen.
 */
export function stepBursts(fx, p, camX, anims, draw) {
  fx.bursts = fx.bursts.filter(b => {
    const step = () => { setAnim(b.anim, b.name); tickAnim(b.anim, anims); };
    const shown = [];
    if (!b.end) {
      step();
      for (let i = 0; i < B.particles / 2; i++) {
        const [pos, acc] = [b.pos[i], b.acc[i]], sign = i & 1 ? 1 : -1;
        pos[0] = s16(pos[0] + sign * acc[0]); pos[1] = s16(pos[1] + sign * acc[1]);
        acc[0] = s16(mul(acc[0], SLOW)); acc[1] = s16(mul(acc[1], SLOW));
        shown.push(pos);
      }
      if (b.frame++ > B.burstFrames - 2) turnBack(b, p, camX);
    } else {
      if (b.frame++ > B.endFrame - 1) return false;
      for (let i = 0; i < B.particles; i++) {
        const [pos, acc] = [b.pos[i], b.acc[i]];
        pos[0] = s16(pos[0] + acc[0] - b.backX); pos[1] = s16(pos[1] + acc[1] - b.backY);
        acc[0] = s16(mul(acc[0], SLOW)); acc[1] = s16(mul(acc[1], SLOW));
        b.backX = s16(mul(b.backX, GROW)); b.backY = s16(mul(b.backY, GROW));
      }
      const odd = b.frame & 1;
      for (let i = 0; i < B.particles / 2; i++) {
        if (odd) step();
        shown.push(b.pos[odd ? i : i + B.particles / 2]);
      }
    }
    const frame = frameOf(b.anim, anims), x = Math.floor(p.x), y = Math.floor(p.y);
    for (const [px, py] of shown) draw(frame, x + (px >> 8), y + (py >> 8));
    return true;
  });
}

/**
 * The particles' animations, their frames numbered after the `count` frames of Sonic Advance's atlas, as the
 * boost atlas has them.
 */
export function particleAnims(art, count) {
  return Object.fromEntries(Object.entries(art.particles.anims).map(([name, { frames, loop }]) => [
    name, { frames: frames.map(([i, delay]) => [i < 0 ? -1 : i + count, delay]), loop },
  ]));
}

/**
 * The atlas the afterimages and the particles are drawn from: Sonic Advance's, with Sonic's frames in Sonic
 * Advance 2's boost palette (the two games' Sonic palettes have the same layout, so each colour takes the
 * boost palette's colour at its index), and the particles' frames after it. Returns { atlas, frames, pixels }.
 */
export function boostAtlas({ atlas, frames, sonic }, art) {
  const images = art.particles.images, top = atlas.height + 1, width = atlas.width;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = top + Math.max(...images.map(i => i.img.height));
  const g = canvas.getContext('2d');
  g.drawImage(atlas, 0, 0);
  let x = 0;
  const more = images.map(({ img, anchorX, anchorY }) => {
    g.putImageData(img, x, top);
    const rect = [x, top, img.width, img.height, anchorX, anchorY];
    x += img.width + 1;
    return rect;
  });
  const swap = new Map(sonic.colors.map((c, i) => [c.join(), art.palette[i]]).slice(1));
  const regions = sonic.frames.flatMap(i => {
    const [fx, fy, w, h, , , pieces] = frames[i];
    return [[fx, fy, w, h], ...(pieces ?? []).map(([, , pw, ph, tx, ty]) => [tx, ty, pw, ph])];
  });
  // read back once; a pixel two frames share is recoloured once
  const img = g.getImageData(0, 0, width, canvas.height), d = img.data, done = new Uint8Array(width * atlas.height);
  for (const [rx, ry, w, h] of regions) {
    for (let row = ry; row < ry + h; row++) {
      for (let i = row * width + rx, end = i + w; i < end; i++) {
        const k = 4 * i;
        if (done[i] || !d[k + 3]) continue;
        done[i] = 1;
        const to = swap.get(`${d[k]},${d[k + 1]},${d[k + 2]}`);
        if (to) [d[k], d[k + 1], d[k + 2]] = to;
      }
    }
  }
  g.putImageData(img, 0, 0);
  return { atlas: canvas, frames: [...frames, ...more], pixels: d };
}
