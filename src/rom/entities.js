// Reads an act's interactable objects and rings. Format as documented by the SAT-R decompilation
// (src/game/shared/stage/entities_manager.c, rings_manager.c, src/game/sa1/stage/interactables/
// toggle_player_layer.c).
//
// Each level's list is RL-compressed. Decompressed, it is a grid of 256 × 256 px regions: a size word,
// the grid's width and height, one offset per region (0 when empty), then each region's records ending
// with 0xFF: 7 bytes { x, y, kind, d0..d3 } for interactables and enemies, 3 bytes { x, y, kind } for item boxes,
// 2 bytes { x, y } for rings. x and y are in tiles inside the region.

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

// one level's list, decompressed, with its grid's width and height
function readGrid(rom, tableAt, level, what) {
  const data = rlDecompress(rom, rom.requirePtr(tableAt + level * 4, `${what} of level ${level}`));
  const view = new DataView(data.buffer);
  return { data, view, regionsX: view.getUint32(4, true), regionsY: view.getUint32(8, true) };
}

/**
 * The rings of `level`, kept in their 256 × 256 px regions because the ring manager searches them by region:
 * { regionsX, regionsY, regions }, where regions[x + y * regionsX] lists { x, y } in pixels. The ring
 * lists use the same grid with 2-byte records { x, y }; the original draws a ring with its bottom centre
 * at that point.
 */
export function readRings(rom, tableAt, level) {
  const { data, view, regionsX, regionsY } = readGrid(rom, tableAt, level, 'rings');
  const regions = [];
  for (let r = 0; r < regionsX * regionsY; r++) {
    const offset = view.getUint32(12 + r * 4, true), list = [];
    if (offset) {
      for (let at = 4 + offset; data[at] !== 0xFF; at += 2) {
        list.push({ x: data[at] * 8 + (r % regionsX) * REGION, y: data[at + 1] * 8 + Math.floor(r / regionsX) * REGION });
      }
    }
    regions.push(list);
  }
  return { regionsX, regionsY, regions };
}

/**
 * Every interactable (or, from the enemy table, every enemy) of `level`, region by region in the list's order:
 * { kind, x, y, d: [d0, d1, d2, d3], rx, ry } with x and y in pixels and rx, ry its region.
 */
export function readInteractables(rom, tableAt, level, what = 'interactables') {
  return readEntities(rom, tableAt, level, what, 7);
}

/** The item boxes of `level`, the same way: { kind, x, y, d: [], rx, ry }, `kind` being what the box holds. */
export function readItemBoxes(rom, tableAt, level) {
  return readEntities(rom, tableAt, level, 'item boxes', 3);
}

/** The size of `level`'s entity grids in regions: { x, y }. */
export function entityRegions(rom, tableAt, level) {
  const { regionsX, regionsY } = readGrid(rom, tableAt, level, 'interactables');
  return { x: regionsX, y: regionsY };
}

function readEntities(rom, tableAt, level, what, size) {
  const { data, view, regionsX, regionsY } = readGrid(rom, tableAt, level, what);
  const list = [];
  for (let r = 0; r < regionsX * regionsY; r++) {
    const offset = view.getUint32(12 + r * 4, true);
    if (!offset) continue;
    const rx = r % regionsX, ry = Math.floor(r / regionsX);
    for (let at = 4 + offset; data[at] !== 0xFF; at += size) {
      list.push({
        kind: data[at + 2], x: data[at] * 8 + rx * REGION, y: data[at + 1] * 8 + ry * REGION,
        d: Array.from(data.subarray(at + 3, at + size)), rx, ry,
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
