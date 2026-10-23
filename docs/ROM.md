# ROM support and data map

[Back to README](../README.md)

Onsoku Advance reads its graphics and data from **your own** Sonic Advance ROM, in your browser. The ROM is never uploaded; if you tick *Remember this ROM on this device*, it is kept in this browser's IndexedDB and can be removed with *Forget the saved ROM*.

## Supported versions

| Version | Game code | SHA-1 | Status |
| :--- | :--- | :--- | :--- |
| Sonic Advance (USA) | `ASOE` | `d842afa7dd1e84de08addb94a51506f1bcafd551` | Tested |

Other Sonic Advance versions are recognized by their cartridge header. When the checksum is not on this list, the extractor searches for its tables by shape instead of using fixed offsets; the asset viewer shows whether that worked. Please open an issue with the viewer's output (never the ROM) to add a version to the table.

To check your ROM, open [`viewer.html`](../viewer.html): it shows the version, checksum, table offsets and everything decoded from them.

## What the extractor reads

Offsets are file offsets in the tested USA ROM (add `0x08000000` for GBA addresses). The formats were worked out by the [SAT-R](https://github.com/SAT-R) decompilation; this repository contains none of its code or data.

| Data | Offset | How it is found without the checksum |
| :--- | :--- | :--- |
| Sprite tables | `0x0D868C` | Six ROM pointers whose first animation and frame parse correctly |
| Tilemap table | `0x4A6C40` | Act 2 reuses act 1's background in zones 1–5, so entries 2/5, 8/11, 14/17, 20/23 and 26/29 match |
| Collision table | `0x4A6DA4` | Act 1's header points at the same metatiles and layer maps as tilemap entries 0 and 1 |
| Start positions | `0x4A6DEC` | Right after the collision table's 18 entries |
| Interactables | `0x0B7F94` | Four tables of 18 RL-compressed lists follow each other (rings, interactables, item boxes, enemies); act 1's lists are grids of 51 × 6 regions |
| Spin dash speeds | `0x4A7084` | Nine 8.8 fixed-point values from 6.0 to 9.0 in steps of 0.375 |

### Sprites

- **Sprite tables:** six pointers to the animation scripts, frame sizes, OAM layouts, palettes, 4bpp tiles and 8bpp tiles.
- **Animation script:** 32-bit words. A negative word is a command: `-1` load tiles, `-2` load palette, `-3` jump back (loop), `-4` end, `-9` switch animation; other commands are skipped by length. A non-negative pair is *show frame N for D ticks*.
- **Frame size** (12 bytes): flip flags, first OAM piece, number of pieces, width, height, anchor X, anchor Y.
- **OAM piece** (3 × 16 bits): the GBA's own sprite attributes (shape, size, position, flips, first tile), relative to the tiles loaded for the frame.
- Sprites face **left**; the game mirrors them when Sonic faces right.

### Stage layers

- Each stage layer is a 12 × 12-tile metatile map (96 × 96 px per metatile) with a 4bpp tileset and a 256-colour palette. Sonic Advance stores one byte per metatile.
- A tile entry packs the tile index (bits 0–9), horizontal and vertical flips (bits 10–11) and the palette bank (bits 12–15).
- The tilemap table has three entries per level: the front layer, the back layer and the background. Neo Green Hill Zone act 1 is entries 0, 1 and 2; its background is a 256 × 256 px plain map.
- The front layer is drawn over Sonic (hardware background 1, priority 1), the back layer behind him (background 2, priority 2, the same as his sprite), the background behind both.
- The front layer's header also describes animated tiles: the first `animTileSize` bytes of the tileset (`0x1C0`, 14 tiles in act 1) are replaced by the next of `animFrameCount` frames every `animDelay` frames. Frame 0 is the tileset itself and frame *k* is the *k*-th block stored after it. Both layers share the tileset, so the animation shows on both.

### Collision

The collision table has one pointer per level, in level order: 14 single-player stages (Neo Green Hill act 1 first), then four multiplayer stages. Each header is 32 bytes:

| Offset | Field |
| :--- | :--- |
| `0x00` | Height table: 8 bytes per tile |
| `0x04` | Angle table: 1 byte per tile |
| `0x08` | Metatiles, 144 tile entries each: the same table the layers are drawn with |
| `0x0C`, `0x10` | Front and back layer maps: the same maps the layers are drawn with |
| `0x14` | Flags: 2 bits per tile, 8 tiles per 16-bit word |
| `0x18`, `0x1A` | Width and height in metatiles (act 1: 136 × 14) |
| `0x1C`, `0x1E` | Width and height in pixels (act 1: 13056 × 1344) |

Collision is stored per **graphics tile**: a pixel's tile entry from the layer map gives the tile index and its flips, and the tile index picks its heights, angle and flags. Act 1 has 982 tiles, which is also the size of its tileset without the animation frames.

- **Heights:** for each of the tile's 8 columns, the high nibble of a byte; for each of its 8 rows, the low nibble. Both are signed 4-bit. A positive value *v* is solid from pixel *v* mod 8 to the bottom (or right) edge, so 8 is a full column. A negative value is solid for the first −*v* pixels from the top (or left). 0 is empty and −8 reads as 8.
- **Flips:** a flip along the measured direction mirrors which column (or row) is read. A flip across it turns *v* into *v* − 8 for a positive value and *v* + 8 for a negative one, leaving 0 and 8 alone.
- **Angle:** 0–255 for a full turn, the direction of travel at positive ground speed with y pointing down: 0 is a flat floor, a floor rising to the right is negative, `0x40` the left wall, `0x80` the ceiling, `0xC0` the right wall. A horizontal flip turns it into −angle, a vertical flip into `0x80` − angle. Odd values mean "keep the previous angle".
- **Flags:** bit 0 marks a jump-through platform; lookups that ask to ignore platforms treat those tiles as empty.
- **Layers:** loops keep their two halves on different layers, and Sonic collides with one layer at a time.

The asset viewer draws the act with this collision on top of it. Every hill, wall, bridge and loop in act 1 lines up with the art.

### Interactables and layer toggles

Each level's interactables are RL-compressed with the GBA BIOS format (header byte `0x30`, then runs and literal blocks). Decompressed, the list is a grid of 256 × 256 px regions: a size word, the grid's width and height, one 32-bit offset per region (0 when empty, counted from the width field), then each region's 7-byte records `x, y, kind, d0, d1, d2, d3`, ending with `0xFF`. `x` and `y` are tiles inside the region.

Kinds 17 and 18 are the layer toggles: while Sonic's centre is inside the rectangle `d2 × d3` tiles from `(x, y)`, edges included, they put him on the front or back layer. Act 1 has 11 front and 20 back toggles at the loops, and three grind rails (kinds 19 and 20), which also swap layers and aren't supported yet.

### Start positions

A pair of 16-bit values (x, y) per level, in pixels, right after the collision table. Neo Green Hill Zone act 1 starts at (104, 444). The four multiplayer stages are (0, 0): they use a separate table of per-player positions.

### Sonic's animations

Sonic's character state picks his animation through a table of 94 `(animation, variant)` pairs at `0x4A6F0C`, right after the four characters' first animation ids (`0, 99, 199, 298`). These are the states the engine uses:

| State | Animation | State | Animation |
| :--- | ---: | :--- | ---: |
| Idle | 0 | Spin (jump, roll) | 8 |
| Bored | 1 | Brake | 9 |
| Look up | 2 | Spin dash | 18 |
| Look up, released | 2, variant 1 | Spin dash rev | 18, variant 1 |
| Crouch | 3 | Mid-air dash | 49 |
| Crouch, released | 3, variant 1 | Insta-shield | 50 |
| Walk | 4 | B: spin attack | 51 |
| Run | 5 | B: somersault kick | 52 |
| Turn | 6 | B: slide kick | 53 |
| Turn after braking | 7 | B: getting up from the slide | 53, variant 1 |
| | | B: backflip | 55 |

Effects: spin dash dust `746` (above a charge of 2.0: `747`), brake dust `748`, insta-shield flash `50` variant 1.

### Sonic's moves

The engine follows SA1's own player code. In the tested ROM these routines are at (GBA addresses):

| Routine | Address | What it shows |
| :--- | :--- | :--- |
| Spin dash | `0x08044070` | Each rev adds `0x200` and raises the charge to at least `0x800`; it decays by `charge >> 5` per frame. The release speed is `table[charge >> 8]` with no bounds check. |
| Air control | `0x0804456C` | Acceleration `2 × 8/256` up to 4.5; while rising (`(u16)ySpeed > 0xBCFF`), `xSpeed -= xSpeed >> 5` |
| Jump cap and insta-shield | `0x0804463C` | Rising faster than 3.0 with jump released caps at 3.0; otherwise a fresh jump press starts the insta-shield, once per jump |
| B: spin attack | `0x080474D4` | Ground speed 2.0 (`0x200`) the way Sonic faces |
| B: spin attack, running | `0x08047538` | Friction 8/256; a second B starts the somersault kick at 3.0 (`0x300`) |
| B: somersault kick | `0x080475C8` | Friction 8/256; B queues the slide kick (4.0), jump the backflip |
| B: slide kick | in `0x08047634` | Friction 32/256 (`0x20`), then the getting-up animation |
| Mid-air dash | `0x080476E0` | A double tap read by `0x0804D02C`: a fresh press, an earlier press of the same direction 5–10 frames back, and no other direction in between. Adds a quarter of the top speed (1.125) and stops the vertical speed. |

A charge above 8.0 reads past the nine speeds into the alternate table that follows them (8.25 to 11.25), so fast revving can launch Sonic faster than a single rev, or slower (index 9 is 8.25). The engine reads both tables and stops at index 17, which takes about 17 revs a second; the original keeps reading unrelated bytes beyond it.

Other details the engine reproduces: rolling starts from any ground speed, a jump out of a roll has no air control until the insta-shield, the spin dash release frame doesn't move, the crouch and look-up animations play a short release before idling, and the brake dust appears with a random flip, at most 20 at a time. Facing left, the original draws Sonic 1px further right, except in the walk and run frames, which go through the rotation hardware.

### Terrain

Sonic's sensors follow SA1's player code. His position is his centre; the sensors sit 8 px either side of it and `spriteOffsetY` (14 standing, 9 curled) toward the surface. Each sensor scans up to three tiles ahead, or two back when it starts inside solid ground, and reports the distance to the last free pixel.

- **On the ground** the surface angle picks one of four modes (floor, either wall, ceiling). Sonic snaps onto the nearer of his two sensors if it is within `min(|speed| + 3, 11)` px, and otherwise leaves the ground. Ground speed moves him along the angle, and slopes add `sin × 3/32` walking and `sin × 60/256` rolling, a quarter of that uphill. A standing Sonic never slides.
- **Walls and ceilings** drop him below 1.875 px per frame and lock his controls for 30 grounded frames.
- **In the air** the direction he moves picks which sensors run. Landing turns his speed into ground speed by the landing angle, and of the two steep ceiling slopes only `0x41`–`0x5F` catches him.
- **Jump-through ledges** are solid on the ground. In the air the floor sensors ignore them while he rises, and the walls and ceiling while his downward speed is under 3.
- **Bounds:** the camera stops at the act's edges, and falling out of the bottom ends the run; for now the engine puts Sonic back at the start.

The walk and run frames turn with the angle through the rotation hardware.
