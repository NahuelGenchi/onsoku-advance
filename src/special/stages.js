// What each of the seven special stages is made of, and the tables the stages share, read from the ROM (SAT-R
// decompilation, src/game/sa1/special_stage/main.c's constants). The engine (stage.js, player.js, objects.js)
// runs any of them the same way: a stage is its layout, its two rings targets and its colours.

// main.c's constants, as offsets from the first (rom/special.js)
const AT = {
  levelStages: 0x140,   // gUnknown_08487134: each level's stage, 12 bytes
  targets: 0x14C,       // gUnknown_08487140: each stage's rings for the checkpoint and the goal
  areaAnims: 0x168,     // gUnknown_0848715C: the character's animation and variant by where they are
  dpadAnims: 0x190,     // gUnknown_08487184: … and by the direction held
  steer: 0x1D0,         // gUnknown_084871C4: the push each direction gives, x and y
  wideHit: 0x210,       // gUnknown_08487204: the character's hitbox against dash pads and bombs
  boostHit: 0x218,      // gUnknown_0848720C: … while boosting
  dashAnims: 0x220,     // gUnknown_08487214: the animation and variant each dash pad gives
  dashSpeeds: 0x238,    // gUnknown_0848722C: the speeds each dash pad gives, x, y and forward
  objectAnims: 0x298,   // gUnknown_0848728C: each kind of object's animation and variant
  objectTiles: 0x2D0,   // gUnknown_084872C4: where each kind's tiles are, in tiles from the sprites' VRAM
  bumperRings: 0x2EC,   // gUnknown_084872E0: the 12 rings around a bumper, x and y
  sparks: 0x31C,        // gUnknown_08487310: the 8 sparks off a bumper, x and y
  lostRings: 0x33C,     // gUnknown_08487330: the speeds of the 10 rings the character drops, x and y
};
const PALETTE_ANIMS = 0x340;   // the stages' palette animations, one a stage, two variants each
const KINDS = 14, END = 0xFFFF;

/** The stage `game.level` leads to, 0 to 6 (gUnknown_08487134). */
export function stageOfLevel(rom, offsets, level) {
  return rom.u8(offsets.specialStage + AT.levelStages + level);
}

/**
 * Stage `index`: { index, targets: [checkpoint, goal], layout, paletteAnim }. The layout is its entries in
 * order of depth, { x, y, depth, type }, ending with the goal (type 0xFFFF); type 0 is a ring, 0x7FFF the
 * checkpoint, the others an object of that kind (objects.js).
 */
export function stageData(rom, offsets, index) {
  const targets = [0, 2].map(i => rom.u16(offsets.specialStage + AT.targets + index * 4 + i));
  const layout = [];
  for (let at = rom.ptr(offsets.specialLayouts + index * 4); ; at += 12) {
    const entry = { x: rom.s16(at), y: rom.s16(at + 2), depth: rom.s32(at + 4), type: rom.u16(at + 8) };
    layout.push(entry);
    if (entry.type === END) break;
  }
  return { index, targets, layout, paletteAnim: PALETTE_ANIMS + index };
}

/** The tables every stage shares, as arrays. */
export function stageTables(rom, offsets) {
  const base = offsets.specialStage;
  const rows = (at, n, w, read = 's16') => Array.from({ length: n }, (_, i) => Array.from({ length: w }, (_, k) => rom[read](base + at + (i * w + k) * 2)));
  const box = at => { const [left, top, right, bottom] = rows(at, 1, 4)[0]; return { left, top, right, bottom }; };
  return {
    areaAnims: rows(AT.areaAnims, 10, 2), dpadAnims: rows(AT.dpadAnims, 16, 2), steer: rows(AT.steer, 16, 2),
    wideHit: box(AT.wideHit), boostHit: box(AT.boostHit), dashAnims: rows(AT.dashAnims, 6, 2), dashSpeeds: rows(AT.dashSpeeds, 16, 3),
    objectAnims: rows(AT.objectAnims, KINDS, 2, 'u16'), objectTiles: rows(AT.objectTiles, KINDS, 1, 'u16').map(([t]) => t),
    bumperRings: rows(AT.bumperRings, 12, 2), sparks: rows(AT.sparks, 8, 2), lostRings: rows(AT.lostRings, 10, 2),
    characterAnims: [0, 1, 2, 3].map(i => rom.u16(offsets.characterAnims + i * 2)),
  };
}
