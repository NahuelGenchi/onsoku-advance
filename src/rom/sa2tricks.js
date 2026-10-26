// What the optional Sonic Advance 2 tricks take from the player's own Sonic Advance 2 ROM (sa2.js): Sonic's
// animations for the four tricks and the falls after them, the Humming Top's spin effect and the Bound's
// afterimage, drawn into a sprite sheet of their own, and the sounds they play (from its sound engine).

import { animationFrames, animationPalette, renderFrame } from './sprites.js';
import { packAtlas } from './extract.js';
import { RomError } from './identify.js';

// [animation id, variant] in Sonic Advance 2's sprite tables, as its character state table maps them for
// Sonic (charStates 33, 34, 35 and 36, and 14)
export const TRICK_ANIMATIONS = {
  // Hop Jump (R + up): the wind-up, the rise, and the fall once he comes down
  trickUp: [48, 0], trickUpRise: [48, 1], trickUpFall: [48, 2],
  // Humming Top (R + forward): the wind-up and the spin, then the fall it ends in (charState 14)
  trickForward: [49, 0], trickForwardSpin: [49, 1], trickFall: [13, 0],
  // Back Star (R alone or R + back): the wind-up and the flip
  trickBack: [50, 0], trickBackFlip: [50, 1],
  // Bound (R + down): the wind-up, the dive, and the rise after it bounces off the ground
  bound: [51, 0], boundDive: [51, 1], boundRise: [51, 2],
  // what goes with them: the Humming Top's spin effect and the Bound's afterimage
  trickForwardFx: [49, 2], boundTrail: [51, 3],
};
// the sounds (m4a song numbers): a trick's start plays the jump sound and the trick sound, and the Bound
// hitting the ground its own
export const SA2_SE = { jump: 116, trick: 230, boundImpact: 223 };

const unexpected = what => new RomError(`Unexpected data in the Sonic Advance 2 ROM: ${what}.`);

/** Reads the tricks' art: { atlas, frames, anims } like the Sonic Advance sprites (extract.js), each
 *  animation marked with this sheet so the game draws its frames from it, and `palette`, Sonic's row of
 *  colours they are drawn in (16 RGB colours, index 0 transparent). */
export function trickArt(sa2) {
  const { rom, tables, sound } = sa2;
  if (Object.values(SA2_SE).some(song => song >= sound.layout.songs)) throw unexpected('the tricks\' sounds are missing');
  const palette = animationPalette(rom, tables, TRICK_ANIMATIONS.trickUp[0]);
  const images = [], byKey = new Map(), anims = {};
  for (const [name, [anim, variant]] of Object.entries(TRICK_ANIMATIONS)) {
    const script = animationFrames(rom, tables, anim, variant, palette);
    const frames = script.frames.map(f => {
      if (f.frame < 0) return [-1, f.delay];
      const key = `${anim}:${f.frame}:${f.tilesAt}:${f.palette.join()}`;
      if (!byKey.has(key)) {
        const { img, layout } = renderFrame(rom, tables, anim, f.frame, f.tilesAt, f.palette, f.eightBpp);
        byKey.set(key, images.length);
        images.push({ img, anchorX: layout.anchorX, anchorY: layout.anchorY });
      }
      return f.boxes ? [byKey.get(key), f.delay, f.boxes] : [byKey.get(key), f.delay];
    });
    if (frames.length === 0) throw unexpected(`animation ${anim} has no frames`);
    anims[name] = { frames, loop: script.loop };
  }
  const { canvas, rects } = packAtlas(images);
  const art = { atlas: canvas, frames: rects, anims, palette: palette.slice(0, 16) };
  for (const def of Object.values(anims)) def.sheet = art;
  return art;
}
