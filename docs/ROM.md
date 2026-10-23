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
| Music players and songs | `0x6D767C`, `0x6D76AC` | Four music player entries (two EWRAM pointers, a track count of 1–16, a zero byte, a 16-bit field), followed at once by song entries of a ROM pointer and the player's number twice |

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

### Objects

Objects run like the original's entities manager. An object exists while its origin is within 128 px of the screen on every side (from 128 px left of the screen to 128 px past its right edge, and likewise vertically), and it is removed as soon as it leaves that range. Objects run before Sonic each frame, so they test where he was at the end of the previous frame. They are drawn over the back layer and behind Sonic, who shares their sprite priority but comes earlier in the sprite list.

Sonic meets an object's hitbox through two rectangles around his centre: his body (±6 wide, ±`spriteOffsetY` tall) and a side probe 5 px wider and 1 px shorter at each end. Edges that only touch count. A solid object puts him on its top, pushes him out below it, or pushes him out of its nearer side (to the far side when the terrain is in the way). While he stands on it, his ground sensors rest and the object holds him up each frame, until he walks or jumps off it.

Animation scripts carry the hitboxes: command `-6` is three words, `-6`, a slot number and the box as four signed bytes (left, top, right, bottom), all zero for none. A box takes effect when the frame after it appears, mirrored when the sprite is flipped, and stays until another command replaces it.

### Springs

The spring is animation `455`. Its variants come in pairs, idle and launch: 0–1 up (down is the same, flipped vertically), 2–3 sideways, 4–5 big diagonal, 6–7 small diagonal. The left-facing kinds are flipped horizontally. The launch variants run 12 frames (11 for the small diagonal) and then end, and the spring goes back to idle. Every spring loads sprite palette 33 (red), except the up springs whose `d0` bit 1 is clear: they skip it and use palette 36 (yellow).

| Kind | Spring | How it launches Sonic |
| ---: | :--- | :--- |
| 8 | Up | Landing on it: straight up, keeping his X speed |
| 9 | Down | Bumping it from below: straight down |
| 10, 11 | Left, right | Touching its face, even standing still: ground and X speed away from it, running (or still rolling). Its back is a wall. |
| 12, 13 | Big diagonal, up-left and up-right | Its second hitbox is the trigger, once his centre is more than 20 px out on the side it points to: the same speed up and sideways. Elsewhere it is solid. |
| 14, 15 | Small diagonal, up-left and up-right | Like the big ones |

The speed is `7.5, 9.0, 10.5` or `12.0` by `d0 & 3`, or `d1 × 16` (in 1/256 px) when `d0` is above 3. Rising off a spring never goes faster than 11.8125, and the jump moves are off until he lands. An up or diagonal spring plays the somersault (character state 17), or when `d0` bit 0 is set, the rise, top and fall animations (states 21, 18, 19). Act 1 has 12 springs: four up, three right, two big up-right, two small up-left and one small up-right.

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
| Spring: somersault | 11 | B: backflip | 55 |
| Spring: rising | 10 | Spring: topping out | 10, variant 1 |
| Spring: falling | 10, variant 2 | | |

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

### Sound

SA1 uses Nintendo's standard sound engine, MusicPlayer2000 (also called m4a or "Sappy"). [`src/sound/m4a.js`](../src/sound/m4a.js) is a port of it that reads the songs, voices and samples from the ROM as the original does, and runs on an AudioWorklet in the browser.

**Configuration.** The game sets the engine up with 5 DirectSound channels, master volume 15, no reverb (every SA1 song turns it off, except the credits) and a mixing rate of 10512 Hz. That is exactly 176 samples per GBA frame (280896 CPU cycles at 2^24 Hz, 59.7275 frames per second). The four music players are the BGM player and three for sound effects, each with 16 tracks. Track and channel structures keep their EWRAM addresses, because the engine breaks priority ties by comparing them.

**Data.**

- **Song table:** 308 entries of 8 bytes: a song header pointer and the player number (twice).
- **Song header:** track count, block count, priority (0 for music, 20 for sound effects), reverb, a voice group pointer, then one pointer per track to its command bytes.
- **Voice:** 12 bytes: type, base key, length, pan or sweep, a pointer, then attack, decay, sustain and release. Types `0x00` and `0x08` are DirectSound samples; `0x08` plays at a fixed rate. `0x01`–`0x04` (plus `0x08` for "fixed") are the Game Boy channels: square 1, square 2, wave and noise. `0x40` is a key split and `0x80` a drum kit; both point at further voices.
- **Sample:** a 16-byte header (loop flag, rate × 1024 at key 60, loop start, size), then `size + 1` signed bytes. The extra byte is what the interpolation reads past the end.

**Each frame** the four players step their tracks (BGM first), then the Game Boy channels get their register writes, then the mixer writes the 176 samples per side that play during the *next* frame. A song the game starts during a frame is first sequenced on the next one. The mixer has no clipping: channel contributions are added with 8-bit wrap-around, as on the hardware. The PSG channels are real hardware: the engine only writes their registers, and [`src/sound/apu.js`](../src/sound/apu.js) emulates them (duty, sweep, envelope, length, noise LFSR and the GBA's two rotating wave RAM banks), then mixes them with the two DirectSound FIFOs at 65536 Hz like the GBA's output stage.

**What the game plays so far** (song numbers):

| Sound | Song | Player | When |
| :--- | ---: | ---: | :--- |
| Neo Green Hill Zone act 1 | 12 | 0 | The act starts (and starts again after falling out) |
| Jump | 116 | 2 | A jump from the ground, and the combo's backflip |
| Spin | 109 | 3 | Spin dash start, rolling, the combo's first hit. Each spin dash rev plays it again, raised by the decayed charge (`charge & ~0x7F` in 1/256 semitones). |
| Spin dash release | 110 | 2 | Letting go of down |
| Skid | 115 | 2 | Restarted on every frame Sonic is still at 3.0 or faster after braking |
| Insta-shield | 113 | 2 | |
| Mid-air dash | 112 | 3 | |
| Somersault kick | 121 | 3 | The combo's second hit |
| Slide kick | 111 | 3 | |
| Spring | 170 | 2 | Every launch |

Sounds on the same player cut each other off, as in the original. There is no landing sound in SA1.

**How it was checked.** The reference is mGBA 0.10.5, recording the tested ROM headlessly and dumping the engine's whole EWRAM state, the sound registers and the mixing buffer after every frame, through the act's first minute of music and a run of every move above:

- *One frame at a time:* the port loads the dumped state, runs one frame and is compared field by field: every track, channel, player, register and mixed byte. 3657 of 3659 music frames and 899 of 919 sound-effect frames match exactly. The others are the frames where the game itself starts a song or changes its pitch or volume, which happens outside the engine.
- *Free running:* loaded once and then left alone, the port stays identical for all 3593 frames of the act's music.
- *Clean start:* a fresh engine that only calls the song start where the game did stays identical too, which is how the browser starts the act.
- *The final output:* the DirectSound part of the port's audio lines up with mGBA's recorded output. The PSG part matches mGBA's in pitch, level and envelope (median spectrum correlation 0.98), but not sample for sample: a Game Boy channel's waveform phase depends on the exact CPU cycle the engine writes its registers, which the port does not model.

The port mixes at the GBA's 65536 Hz, averages that down to the browser's output rate, removes the DC offset the unipolar PSG channels add, and plays at half of the GBA's full scale. The game itself still steps at 60 Hz while the sound engine keeps the GBA's 59.7275 frames per second, so a sound starts within one frame of the move that plays it.
