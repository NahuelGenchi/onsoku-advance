// Decodes the sprite tables: animation scripts, frame layouts (OAM pieces) and 4bpp/8bpp tiles.
// Formats as documented by the SAT-R decompilation (include/core.h, src/sprite.c).

import { readColors } from './colors.js';

// GBA object sizes indexed by shape * 4 + size
const OAM_SIZES = [[8, 8], [16, 16], [32, 32], [64, 64], [16, 8], [32, 8], [32, 16], [64, 32], [8, 16], [8, 32], [16, 32], [32, 64]];
// length in 32-bit words of each animation command, by command id
const CMD_WORDS = { [-1]: 3, [-2]: 3, [-3]: 2, [-4]: 1, [-5]: 2, [-6]: 3, [-7]: 2, [-8]: 3, [-9]: 2, [-10]: 4, [-11]: 2, [-12]: 2 };
const MAX_SCRIPT_WORDS = 600;

export function spriteTables(rom, at) {
  return {
    anims: rom.requirePtr(at, 'animation table'),
    dims: rom.requirePtr(at + 4, 'frame size table'),
    oam: rom.requirePtr(at + 8, 'OAM table'),
    palettes: rom.requirePtr(at + 12, 'sprite palettes'),
    tiles4: rom.requirePtr(at + 16, '4bpp tiles'),
    tiles8: rom.requirePtr(at + 20, '8bpp tiles'),
  };
}

/** Decodes animation `anim`, variant `variant` into a list of steps. */
export function parseScript(rom, tables, anim, variant = 0) {
  const variants = rom.requirePtr(tables.anims + anim * 4, `animation ${anim}`);
  const script = rom.requirePtr(variants + variant * 4, `animation ${anim} variant ${variant}`);
  const steps = [];
  for (let cur = 0, guard = 0; guard < MAX_SCRIPT_WORDS; guard++) {
    const at = script + cur * 4, id = rom.s32(at);
    if (id >= 0) { steps.push({ op: 'show', delay: id, frame: rom.s32(at + 4), at: cur }); cur += 2; continue; }
    const words = CMD_WORDS[id];
    if (!words) throw new Error(`Unknown animation command ${id} in animation ${anim}.`);
    if (id === -1) steps.push({ op: 'tiles', tileIndex: rom.s32(at + 4), count: rom.u32(at + 8), at: cur });
    else if (id === -2) steps.push({ op: 'palette', palId: rom.s32(at + 4), count: rom.u16(at + 8), insert: rom.u16(at + 10), at: cur });
    else if (id === -6) {
      // hitbox: slot, then left, top, right and bottom as signed bytes; all zero switches the slot off
      const box = [0, 1, 2, 3].map(k => (rom.u8(at + 8 + k) << 24) >> 24);
      steps.push({ op: 'hitbox', slot: rom.s32(at + 4) % 16, box: box.some(v => v) ? box : null, at: cur });
    }
    else if (id === -3) { steps.push({ op: 'jump', to: cur - rom.s32(at + 4), at: cur }); break; }
    else if (id === -4) { steps.push({ op: 'end', at: cur }); break; }
    else if (id === -9) { steps.push({ op: 'goto', anim: rom.u16(at + 4), variant: rom.u16(at + 6), at: cur }); break; }
    cur += words;
  }
  return steps;
}

/** Frame layout: 12 bytes per frame, indexed by animation. */
export function frameLayout(rom, tables, anim, frame) {
  const at = rom.requirePtr(tables.dims + anim * 4, `frame sizes of animation ${anim}`) + frame * 12;
  return {
    flip: rom.u8(at), oamIndex: rom.u8(at + 1), pieces: rom.u16(at + 2),
    width: rom.u16(at + 4), height: rom.u16(at + 6), anchorX: rom.s16(at + 8), anchorY: rom.s16(at + 10),
  };
}

// the OAM pieces of a frame: each one's size, its place in the frame, the flips its entry carries and a
// function giving the colour index of its pixel (px, py), unflipped (0 is transparent). A 256-colour piece's
// tile number counts whole 64-byte tiles: DisplaySprite doubles it for OAM, and sub_80039E4 writes a background
// sprite's straight into the background's map.
function oamPieces(rom, tables, anim, f, tilesAt, eightBpp, background = false) {
  const oamBase = rom.requirePtr(tables.oam + anim * 4, `OAM data of animation ${anim}`);
  return Array.from({ length: f.pieces }, (_, i) => {
    const o = oamBase + (f.oamIndex + i) * 6;
    const a0 = rom.u16(o), a1 = rom.u16(o + 2), a2 = rom.u16(o + 4);
    const [w, h] = OAM_SIZES[((a0 >> 14) & 3) * 4 + ((a1 >> 14) & 3)];
    const bpp8 = eightBpp || ((a0 >> 13) & 1) === 1;
    const tile0 = a2 & 0x3FF, bank = (a2 >> 12) & 15, tilesWide = w / 8;
    const color = (px, py) => {
      const tx = px >> 3, ty = py >> 3, ix = px & 7, iy = py & 7;
      if (bpp8) return rom.u8(tilesAt + tile0 * 64 + (ty * tilesWide + tx) * 64 + iy * 8 + ix);
      const b = rom.u8(tilesAt + (tile0 + ty * tilesWide + tx) * 32 + iy * 4 + (ix >> 1));
      const c = ix & 1 ? b >> 4 : b & 15;
      return c && c + bank * 16;
    };
    return { x: a1 & 0x1FF, y: a0 & 0xFF, w, h, hflip: (a1 >> 12) & 1, vflip: (a1 >> 13) & 1, color };
  });
}

/**
 * Draws one frame the way the game places its OAM pieces, facing the game's default direction (left).
 * `tilesAt` is the ROM offset of the tiles loaded by the frame's last GetTiles command; `background` draws it
 * as a background sprite.
 */
export function renderFrame(rom, tables, anim, frame, tilesAt, palette, eightBpp, { background = false } = {}) {
  const f = frameLayout(rom, tables, anim, frame);
  const img = new ImageData(Math.max(1, f.width), Math.max(1, f.height));
  for (const p of oamPieces(rom, tables, anim, f, tilesAt, eightBpp, background)) {
    let { x, y, w, h, hflip, vflip } = p;
    if (f.flip & 2) { vflip ^= 1; y = f.height - h - y; }
    if (f.flip & 1) { hflip ^= 1; x = f.width - w - x; }
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const c = p.color(px, py);
        if (!c) continue;
        const dx = x + (hflip ? w - 1 - px : px), dy = y + (vflip ? h - 1 - py : py);
        if (dx < 0 || dy < 0 || dx >= f.width || dy >= f.height) continue;
        const rgb = palette[c] ?? [255, 0, 255], k = (dy * f.width + dx) * 4;
        img.data[k] = rgb[0]; img.data[k + 1] = rgb[1]; img.data[k + 2] = rgb[2]; img.data[k + 3] = 255;
      }
    }
  }
  return { img, layout: f };
}

/**
 * A frame's OAM pieces as the rotation hardware gets them: each piece's place in the frame and its pixels as
 * its tiles hold them. DisplaySprite leaves the frame's flip out of a rotated sprite, and the hardware reads a
 * rotated entry's flip bits as part of its matrix number, so neither flips the pixels.
 */
export function framePieces(rom, tables, anim, frame, tilesAt, palette, eightBpp) {
  const f = frameLayout(rom, tables, anim, frame);
  return oamPieces(rom, tables, anim, f, tilesAt, eightBpp).map(p => {
    const img = new ImageData(p.w, p.h);
    for (let py = 0; py < p.h; py++) {
      for (let px = 0; px < p.w; px++) {
        const c = p.color(px, py);
        if (!c) continue;
        const rgb = palette[c] ?? [255, 0, 255], k = (py * p.w + px) * 4;
        img.data[k] = rgb[0]; img.data[k + 1] = rgb[1]; img.data[k + 2] = rgb[2]; img.data[k + 3] = 255;
      }
    }
    return { x: p.x, y: p.y, img };
  });
}

/**
 * Runs an animation script and returns the frames it shows, each with the tiles and palette
 * active at that moment and the hitboxes its commands set (`boxes`, by slot), plus where the script
 * loops. `skipPalette` ignores the script's palette commands, like the sprite flag some objects set.
 */
export function animationFrames(rom, tables, anim, variant, basePalette, { skipPalette = false } = {}) {
  const steps = parseScript(rom, tables, anim, variant);
  const palette = basePalette.slice();
  let tilesAt = null, eightBpp = false, boxes = null;
  const frames = [];
  for (const s of steps) {
    if (s.op === 'tiles') {
      eightBpp = s.tileIndex < 0;
      tilesAt = eightBpp ? tables.tiles8 + (s.tileIndex & 0x7FFFFFFF) * 64 : tables.tiles4 + s.tileIndex * 32;
    } else if (s.op === 'palette' && !skipPalette) {
      readColors(rom, tables.palettes + s.palId * 32, s.count).forEach((c, i) => { palette[s.insert + i] = c; });
    } else if (s.op === 'hitbox') {
      (boxes ??= {})[s.slot] = s.box;
    } else if (s.op === 'show') {
      frames.push(s.frame < 0 || tilesAt === null
        ? { delay: s.delay, frame: -1, at: s.at, boxes }
        : { delay: s.delay, frame: s.frame, tilesAt, eightBpp, palette: palette.slice(), at: s.at, boxes });
      boxes = null;
    }
  }
  const last = steps[steps.length - 1];
  let loop = null;
  if (last?.op === 'jump') {
    loop = frames.findIndex(f => f.at >= last.to);
    if (loop < 0) loop = 0;
  }
  return { frames, loop, end: last?.op ?? null };
}

/**
 * An animation that only loads colours, as the stage's palette animations do: the frames it shows, each with
 * its delay and the colours its commands load just before it ({ insert, colors }), and the frame it loops
 * back to (null when it ends).
 */
export function paletteAnimation(rom, tables, anim, variant = 0) {
  const steps = parseScript(rom, tables, anim, variant);
  const frames = [];
  let loads = [];
  for (const s of steps) {
    if (s.op === 'palette') loads.push({ insert: s.insert, colors: readColors(rom, tables.palettes + s.palId * 32, s.count) });
    else if (s.op === 'show') { frames.push({ delay: s.delay, loads, at: s.at }); loads = []; }
  }
  const last = steps[steps.length - 1];
  const loop = last?.op === 'jump' ? Math.max(0, frames.findIndex(f => f.at >= last.to)) : null;
  return { frames, loop };
}

/** The palette an animation loads with its first GetPalette command. */
export function animationPalette(rom, tables, anim) {
  const palette = new Array(256).fill(null).map(() => [255, 0, 255]);
  const load = parseScript(rom, tables, anim, 0).find(s => s.op === 'palette');
  if (load) readColors(rom, tables.palettes + load.palId * 32, load.count).forEach((c, i) => { palette[load.insert + i] = c; });
  return palette;
}
