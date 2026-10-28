// What the optional Boost Mode takes from the player's own Sonic Advance 2 ROM (opened by sa2.js): Sonic's boost
// palette, which his afterimages are drawn in, the particles that burst from him as it starts, and its start
// sound, played on Sonic Advance 2's own sound engine.

import { RomError } from './identify.js';
import { parseScript, animationFrames, animationPalette, renderFrame } from './sprites.js';
import { readColors } from './colors.js';

const BOOST_PALETTE = 74;   // Sonic's boost palette (SA2_CHAR_ANIM_BOOST_PALETTE), 16 colours for OBJ palette 1
const PARTICLES = 873;      // the particles of Boost Mode's start (SA2_ANIM_SONIC_BOOM_PARTICLES)
export const BOOST_MODE_SE = 221;   // its start sound (SE_221)
// the particles' two variants: a two-frame loop, and the one that plays out and ends
export const PARTICLE_ANIMATIONS = { boostParticles: 0, boostParticlesEnd: 1 };

const unexpected = what => new RomError(`unexpected data in the Sonic Advance 2 rom: ${what}.`);

// the particles' frames, each drawn once, and their animations with indices into those frames
function particles(rom, tables) {
  const palette = animationPalette(rom, tables, PARTICLES), images = [], byKey = new Map(), anims = {};
  for (const [name, variant] of Object.entries(PARTICLE_ANIMATIONS)) {
    const script = animationFrames(rom, tables, PARTICLES, variant, palette);
    const frames = script.frames.map(f => {
      if (f.frame < 0) return [-1, f.delay];
      const key = `${f.frame}:${f.tilesAt}`;
      if (!byKey.has(key)) {
        const { img, layout } = renderFrame(rom, tables, PARTICLES, f.frame, f.tilesAt, f.palette, f.eightBpp);
        if (img.width !== 8 || img.height !== 8) throw unexpected('a boost particle is not 8 × 8');
        byKey.set(key, images.length);
        images.push({ img, anchorX: layout.anchorX, anchorY: layout.anchorY });
      }
      return [byKey.get(key), f.delay];
    });
    if (frames.length === 0) throw unexpected('the boost particles have no frames');
    anims[name] = { frames, loop: script.loop };
  }
  return { images, anims };
}

/**
 * Reads what Boost Mode needs from `sa2` (openSa2): the boost palette (16 RGB colours, index 0 transparent) and
 * the particles' frames and animations. Throws RomError with a message meant for the player when they, or its
 * start sound, are missing.
 */
export function readBoostArt({ rom, tables, sound }) {
  const load = parseScript(rom, tables, BOOST_PALETTE).find(s => s.op === 'palette');
  if (!load || load.count !== 16) throw unexpected('Sonic\'s boost palette is missing');
  if (sound.layout.songs <= BOOST_MODE_SE) throw unexpected('the boost sound is missing');
  return { palette: readColors(rom, tables.palettes + load.palId * 32, 16), particles: particles(rom, tables) };
}
