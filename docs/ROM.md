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
- Neo Green Hill Zone act 1 is entries 0 (decorations), 1 (terrain) and 2 (background, a 256 × 256 px plain map) of the tilemap table.
- The platform is the act's flat end zone: metatile columns 127–135, rows 9–13, which wraps seamlessly.

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
