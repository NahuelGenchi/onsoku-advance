// Reads an act's interactable objects. Format as documented by the SAT-R decompilation
// (src/game/shared/stage/entities_manager.c, src/game/sa1/stage/interactables/toggle_player_layer.c).
//
// Each level's list is RL-compressed. Decompressed, it is a grid of 256 × 256 px regions: a size word,
// the grid's width and height, one offset per region (0 when empty), then each region's 7-byte records
// { x, y, kind, d0..d3 } ending with 0xFF. x and y are in tiles inside the region.

const TOGGLE_FRONT = 17, TOGGLE_BACK = 18;   // interactable kinds of the layer toggles
const REGION = 256;

/** The GBA BIOS run-length format (RLUnComp): header 0x30 with the size, then runs and literal blocks. */
export function rlDecompress(rom, at) {
  const header = rom.u32(at);
  if ((header & 0xFF) !== 0x30) throw new Error(`Unexpected data in the ROM: no RL header at 0x${at.toString(16)}.`);
  const out = new Uint8Array(header >>> 8);
  let i = at + 4, n = 0;
  while (n < out.length) {
    const flag = rom.u8(i++);
    if (flag & 0x80) { const b = rom.u8(i++); for (let k = (flag & 0x7F) + 3; k > 0 && n < out.length; k--) out[n++] = b; }
    else for (let k = (flag & 0x7F) + 1; k > 0 && n < out.length; k--) out[n++] = rom.u8(i++);
  }
  return out;
}

/** Every interactable of `level`: { kind, x, y, d: [d0, d1, d2, d3] } with x and y in pixels. */
export function readInteractables(rom, tableAt, level) {
  const data = rlDecompress(rom, rom.requirePtr(tableAt + level * 4, `interactables of level ${level}`));
  const view = new DataView(data.buffer);
  const regionsX = view.getUint32(4, true), regionsY = view.getUint32(8, true);
  const list = [];
  for (let r = 0; r < regionsX * regionsY; r++) {
    const offset = view.getUint32(12 + r * 4, true);
    if (!offset) continue;
    for (let at = 4 + offset; data[at] !== 0xFF; at += 7) {
      list.push({
        kind: data[at + 2],
        x: data[at] * 8 + (r % regionsX) * REGION, y: data[at + 1] * 8 + Math.floor(r / regionsX) * REGION,
        d: [data[at + 3], data[at + 4], data[at + 5], data[at + 6]],
      });
    }
  }
  return list;
}

/** The layer toggles among them, as inclusive rectangles: { layer, x, y, w, h }. */
export function layerToggles(interactables) {
  return interactables.filter(e => e.kind === TOGGLE_FRONT || e.kind === TOGGLE_BACK)
    .map(e => ({ layer: e.kind === TOGGLE_FRONT ? 0 : 1, x: e.x, y: e.y, w: e.d[2] * 8, h: e.d[3] * 8 }));
}
