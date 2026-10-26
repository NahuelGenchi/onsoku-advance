# ROM support and data map

[Back to README](../README.md)

Onsoku Advance reads its graphics and data from **your own** Sonic Advance ROM, in your browser. The ROM is never uploaded; if you tick *Remember these ROMs on this device* on the game's start screen (*Remember this ROM on this device* in the asset viewer), it is kept in this browser's IndexedDB, with the Sonic Advance 2 and Sonic Rush ROMs the extras read, and can be removed with *Forget the saved ROMs* (or a card's *Remove*).

The optional [Boost Mode](#sonic-advance-2-for-boost-mode) and [Sonic Advance 2 tricks](#sonic-advance-2-tricks) read your Sonic Advance 2 ROM the same way.

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
| Loop points and distances | `0x4A6E74`, `0x4A6EBC` | After the start positions and the multiplayer stages' four start positions each, two more tables of an `s16` pair per level (see [The goal](#the-goal)) |
| Rings | `0x0B7F4C` | The table just before the interactables |
| Interactables | `0x0B7F94` | Four tables of 18 RL-compressed lists follow each other (rings, interactables, item boxes, enemies); act 1's lists are grids of 51 × 6 regions |
| Item boxes | `0x0B7FDC` | The table after the interactables |
| Enemies | `0x0B8024` | The table after the item boxes |
| Spin dash speeds | `0x4A7084` | Nine 8.8 fixed-point values from 6.0 to 9.0 in steps of 0.375 |
| UI graphics | `0x680A38` | 28-byte entries of two ROM pointers and five words; the first is the 8 × 16 font `{2, 0, 2, 1, 2}` and the sixth the HUD ring `{16, 2, 0, 4, 4}` |
| Title card tables | `0x681274` | The pieces' texts, 56 bytes at +`0x34` that are the same in every version (see [Title card](#title-card)) |
| Music players and songs | `0x6D767C`, `0x6D76AC` | Four music player entries (two EWRAM pointers, a track count of 1–16, a zero byte, a 16-bit field), followed at once by song entries of a ROM pointer and the player's number twice |

### Sprites

- **Sprite tables:** six pointers to the animation scripts, frame sizes, OAM layouts, palettes, 4bpp tiles and 8bpp tiles.
- **Animation script:** 32-bit words. A negative word is a command: `-1` load tiles, `-2` load palette, `-3` jump back (loop), `-4` end, `-9` switch animation; other commands are skipped by length. A non-negative pair is *show frame N for D ticks*.
- **Frame size** (12 bytes): flip flags, first OAM piece, number of pieces, width, height, anchor X, anchor Y.
- **OAM piece** (3 × 16 bits): the GBA's own sprite attributes (shape, size, position, flips, first tile), relative to the tiles loaded for the frame.
- Sprites face **left**; the game mirrors them when Sonic faces right.
- **Palette slots:** a script's load-palette command writes 16 colours into one of the 16 sprite palette rows (its slot) when the animation steps past it, and a sprite is drawn in whatever its slot holds at the end of the frame. Animations that load different palettes into the same slot therefore show the colours of whichever loaded last: a dust cloud (palette 20, slot 9) that appears next to a boulder (palette 35, slot 9) turns the boulder's colours to its own until something loads 35 again, and in Ice Mountain the ice blocks, the stones and their pieces share slot 11 (palettes 60 and 69 differ in colours 1 and 10–14). An animation that ends (`-4`) never runs its commands again, while one that jumps back to its start reloads its palette every loop. The extractor keeps each animation's frames in every other palette loaded into its slot, and the game picks the set the slot holds.

### Rotation hardware

Some sprites go through the GBA's rotation and scaling (affine) OBJ mode instead of plain flips: Sonic's walk and run frames (and the walk frames he tumbles in after a bounce block, character state 23) the boulders' debris, the Egg Hammer Tank's arm segments, hammer and belt pieces, and the boss capsule while it rises, its shell's halves and the birds that fly out of it. The extractor keeps those frames' OAM pieces as their tiles hold them, and the renderer draws them pixel by pixel ([`src/engine/renderer.js`](../src/engine/renderer.js)).

- **Matrix** (`TransformSprite`): from the rotation `r` (0–1023 per turn) and the 8.8 scales `sx`, `sy`, with `c = COS_24_8(r)` and `s = SIN_24_8(r)` (the sine table's Q2.14 values shifted right 6), PA = `c × Div(0x10000, sx) >> 8`, PB = `s × Div(0x10000, sx) >> 8`, PC = `−s × Div(0x10000, sy) >> 8`, PD = `c × Div(0x10000, sy) >> 8`, each kept to 16 bits. A negative scale mirrors the sprite.
- **Placement:** the transform moves the sprite so its anchor stays at (x, y) once turned. With `ax` the anchor X (or `width − ax` when `sx` is negative), `ay` likewise, and the half-sizes `hw`, `hh`, it subtracts `(c|sx| × (ax − hw) − s|sx| × (ay − hh) + hw × 256) >> 8` from x and `(s|sy| × (ax − hw) + c|sy| × (ay − hh) + hh × 256) >> 8` from y (each product `>> 8` first). `DisplaySprite` then places each OAM piece at its own offset in the frame, ignoring the frame's flip; with the double-size flag it first moves the sprite up and left by half the frame's size. The hardware reads a rotated entry's flip bits as part of its matrix number, so the pieces keep their tiles' orientation.
- **Sampling:** every piece turns around the centre of its own box (its size, or twice it at double size), clipped to that box. For each line, mGBA 0.10.5's software renderer starts from `PA × (−1 − w/2) + PB × (line − h/2) + 128 × size` in 8.8 fixed point, skips ahead to the first column inside the piece by integer division, then steps PA and PC a column and takes the nearest texel, ending the line's run at the first texel outside the piece. A piece earlier in the frame has the lower OAM index and stays in front of a later one.
- **Sonic** uses matrix 0 without double size and a single 64 × 64 piece. His transform scale is −1.0 when he faces right (which also moves him 1 px left, `MACRO_8024B10_PSI_UPDATE`) and +1.0 facing left, and his rotation is his angle times four. The matrices this produces match the OAM that mGBA's recordings hold.

### Stage layers

- Each stage layer is a 12 × 12-tile metatile map (96 × 96 px per metatile) with a 4bpp tileset and a 256-colour palette. Sonic Advance stores one byte per metatile.
- A tile entry packs the tile index (bits 0–9), horizontal and vertical flips (bits 10–11) and the palette bank (bits 12–15).
- The tilemap table has three entries per level: the front layer, the back layer and the background. Neo Green Hill Zone act 1 is entries 0, 1 and 2, act 2 entries 3, 4 and 5; the background is a 256 × 256 px plain map, the same in both acts.
- The front layer is drawn over Sonic (hardware background 1, priority 1), the back layer behind him (background 2, priority 2, the same as his sprite), the background behind both.
- The front layer's header also describes animated tiles: the first `animTileSize` bytes of the tileset (`0x1C0`, 14 tiles in act 1) are replaced by the next of `animFrameCount` frames every `animDelay` frames. Frame 0 is the tileset itself and frame *k* is the *k*-th block stored after it. Both layers share the tileset, so the animation shows on both. The frame shown comes from a counter the camera's task moves on (`gStageBackgroundsRam.unk40`, `0x0300593B` in the USA ROM), which is one behind the camera's runs and 0 before its first: an act made from the course select is drawn once before the camera has run, and its tiles change a frame later than the camera's count says.
- **Palette animations.** The act's stage init makes two tasks (priority `0x2000`, after the rings and entities managers) that each run an animation whose commands only load colours into the background palette: animation `814` loads sprite palettes 190–193 into row 15 (colours 240–255), each shown for 16 frames, and `815` loads palettes 194–201 into row 10 (colours 160–175), one a frame. Each palette is the one before it turned by one place, so the colours cycle. Row 10 colours the waterfalls in the stage's layers (five metatiles use it) and row 15 the sea in the background. The tasks step their animation as any background animation is stepped, at speed `0x10`: on the act's first frame each loads its first palette, which then shows for its delay. When the act starts over, it loads the stage's own colours again and both animations start from the beginning. Act 2's stage init (`StageInit_Zone1Act2`) runs the same two, then animation `820` twice, variant 1 and then variant 0: they load rows 13 and 12, a palette every 2 frames. The extractor renders the layers' metatiles that use those rows, and the background, once for each state, and the renderer picks the one the tasks have loaded. Ice Mountain act 1's two animations give its metatiles 49 states, too many to render each (the atlas would be 71520 px tall): past 16 states the extractor keeps the metatiles' colour indices instead, and the renderer colours them from the loaded palette as it draws.

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

Kinds 17 and 18 are the layer toggles: while Sonic's centre is inside the rectangle `d2 × d3` tiles from `(x, y)`, edges included, they put him on the front or back layer. Act 1 has 11 front and 20 back toggles at the loops. The grind rails (kinds 19 and 20, see *Grind rails*) swap the layer too.

The enemies use the same 7-byte records, with the enemy's kind in place of the interactable's. The item boxes have 3-byte records `x, y, kind`. Act 1 has 27 enemies and 13 item boxes.

### Objects

**The task list.** The original runs everything as tasks in one list, sorted by priority, and the engine does the same with the same priorities. In act 1 a frame runs the grind rails' ends (`0x900`), the camera (`0xF00`), the forced slide (`0x1000`), then at `0x2000` the ring manager, the entities manager, two palette animations and every object, enemy and effect in the order they were made, then the scattered rings and the grind sparks (`0x2001`), the title card and its pieces while it runs (`0x2100`, `0x2120`), the HUD once the card has ended (`0x2180`), past the goal the act's results in the card's place (`0x2100`, `0x2120`), Sonic (`0x3000`), the GamiGami shots, the music manager (`0x4000`), the Buzzer shots (`0x9000`) and the stage's clock (`0xFF00`). A new task goes after the last task of its priority. The list fetches the next task before it runs the current one, so a task made by the one just before its place only runs from the next frame.

**The entities manager** spawns objects, item boxes and enemies by their spawn point, from a range 128 px around the screen: from 128 px left of it to 128 px past its right edge (`x − 128` to `x + 368`), and from 128 px above it to 128 px below its bottom edge (`y − 128` to `y + 288`), edges included and kept inside the act. On its first frame, and after the camera jumps more than 248 px across or 208 px down, it spawns everything in the range. Otherwise it scans only the strip the camera's move uncovered sideways, the range's full height, then the strip it uncovered up or down, the range's full width. It scans the regions that start before the strip's far edge, so a spawn point exactly at a region's first pixel is found a frame late. In each region it spawns the interactables, then the item boxes, then the enemies. A spawned entity isn't spawned again while its task runs. Most tasks end when their spawn point leaves the range, which lets it spawn again later. A defeated enemy stays gone until the act starts over.

Objects run before Sonic each frame, so they test where he was at the end of the previous frame. They are drawn over the back layer and behind Sonic, who shares their sprite priority but comes earlier in the sprite list.

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

### Platforms

Act 1 has five kinds of platform. Sonic lands on the thin, falling and crumbling ones from above and passes through them from below and from the sides: he lands whenever his body touches the box while he isn't rising, wherever in the box he is. The trampoline and the bounce block are solid like any object.

| Kind | Platform | Act 1 | Animation | Box |
| ---: | :--- | ---: | :--- | :--- |
| 21 | Thin | 3 | `463` | (−24, −6, 24, −4) |
| 22 | Falling | 3 | `463` | (−24, −6, 24, −4) |
| 23 | Trampoline | 1 | `461`, bouncing: variant 1 | (−20, −11, 20, 4) |
| 24 | Crumbling | 2 | `904` (the decompiled C says `906`) | (0, 3, 64, 23) |
| 25 | Bounce block | 7 | `462` | (−15, −5, 15, 11) |

- **Thin:** it runs at priority `0x2010`, after the other objects. It swings across when `d2` is above `d3`, and up and down otherwise, by `d2` (or `d3`) × 8 px either side of its spawn point, once every 256 frames of the stage clock. A negative `d0` (or `d1`) starts it half a swing on. It carries Sonic by what it moved that frame, plus 1 px down, which its top then puts him back from. Act 1's three swing up and down.
- **Falling:** 30 frames after Sonic lands on it, it falls, 42/256 px a frame faster every frame. It takes him with it for 32 frames, then drops him at its own speed and falls through him.
- **Sagging:** while Sonic stands on a thin or falling platform it sags by up to 4 px, easing down by 1/64 of a half turn a frame and back up when he leaves. Only the sprite sags, not the box.
- **Crumbling:** 32 frames after Sonic lands on it, song 173 plays and its 32 tiles of 8 × 8 px fall, one a frame, from the bottom right to the top left (from the bottom left when `d0` flips it). Each one falls 42/256 px a frame faster every frame. Sonic stands on it until the last tile lets go. The tiles stop being drawn, in order, at the first one past the bottom of the screen, and the platform goes when that is the first tile. One that goes before it has quite fallen apart never comes back; otherwise it comes back like the other objects.
- **Trampoline:** landing on it throws Sonic up 1.22 times as fast as he came down, between 3.75 and 10.99 px a frame, uncurled and rising as off a spring (character state 21, then 18 and 19), and plays song 176. Walking onto it from the side lifts him 8 px first. It bounces through variant 1 for 14 frames, starting over at each new landing.
- **Bounce block:** landing on it throws Sonic up at 5 px a frame, facing the way he holds the d-pad, in the walk animation (character state 23), and plays the spring's song 170. In that state he keeps facing that way in the air, and he tumbles: his angle turns 4/256 of a turn a frame the way he faces, drawn through the rotation hardware. Walking shows the same animation, and only a new animation or variant restarts a sprite, so a Sonic who walks onto the block, or lands from it walking, carries on with the same walk cycle. That angle also turns off the push out of an object's sides while it points him at a wall, so he can fall past a bounce block's side into the one below. The block wobbles for 30 frames, up to 16 px up and down.

A thin platform goes when its spawn point is off the screen and its current position is out of the range around the camera. A falling one goes the same way until it falls, then when its current position is out of range. A crumbling one goes when its spawn point is out of range, and once it crumbles, only when it is out of range sideways.

### Boulders

Act 1's three boulders are kind 16, at (2152, 440), (7080, 728) and (7320, 1184). A boulder is animation `458`, one 48 × 32 frame with the box (−16, −28, 16, −2). It is solid like any object, so Sonic can stand on it and push against it, and it goes like the other objects when its spawn point leaves the range.

Before the solid test, a boulder checks whether Sonic breaks it (`sub_800C394`). He breaks it when he is curled up (jumping or rolling) and falling, with his side probe made 1 px taller at each end touching its box, or when his attack box touches it and he isn't curled. Falling, he bounces back up at the same speed. Rolling or spin dashing into it on level ground doesn't break it: he stops against it.

A broken boulder leaves the dust cloud, lifts Sonic into the air if he stood on it, plays song 167 and never comes back until the act starts over. Four pieces fly out for 61 frames: two small ones (animation `459`, 8 × 8) and two large ones (`460`, 16 × 16), drawn in front of the layers through the rotation hardware at double size:

- They start 16 px (pieces 1 and 3) or 32 px (pieces 2 and 4) above the boulder and move across 2, 1, 2 and 1 px a frame (left, right, right, left).
- They rise at 2 px a frame, slowing by 40/256 px a frame per frame.
- They turn by 42, 42, 14 and 14 in 1/1024 of a turn a frame, pieces 1 and 4 one way and pieces 2 and 3 the other.
- They grow from their own size to twice it, by 8/256 a frame.

The original places each piece through its sprite transform (`sub_8004E14`), around where the boulder was on the screen on the frame it broke: the piece's offset from there, as the camera moves, is multiplied by half its scale, rounded down to a whole 1/256, over 256. So the pieces start at half their offset and drift out while they grow. The transform then builds the matrix and subtracts the turned anchor the way `TransformSprite` does (see [Rotation hardware](#rotation-hardware)). A piece is left out once its double-size square is off the screen. The rounding never shows on the boulder, whose scale grows by 8 and stays even, but it does on Ice Mountain's ice blocks, which copy this task and grow by 1: on every odd scale their pieces sit a pixel nearer the middle.

### Waterfalls

Act 1 has seven waterfalls, kind 27, each an area `d2` × 8 px wide and `d3` × 8 px tall, starting `d1` × 8 px below the spawn point (`d1` is signed, so most start above it). The waterfall's own picture is part of the stage's layers, and its colours cycle with the act's palette animations (see *Stage layers*). Its task (`0x08075911`) runs at priority `0x2000` and goes when its spawn point leaves the range.

While Sonic's centre is in the area, edges included, his vertical speed grows by 16/256 px a frame on top of gravity, before he moves. On the ground this does nothing, since the walk sets his speed from the ground speed, and standing on an object puts it back to 0. The task also draws a splash, animation `464`, at his centre 10 px lower, in OAM order 5. The splash only animates while it is drawn, so it starts each visit where it left off. The original sprite routine leaves it out while it is off the screen.

Recordings of Sonic pushing each way, jumping on a boulder, breaking it with the spin attack, spin dashing into one, and breaking the second one all match the engine on every frame, including where every piece is drawn.

### Boosters

Act 1 has five speed boosters: four flat ones, kind 31, at (4384, 1272), (5928, 1272), (8456, 936) and (9912, 984), and one on a slight slope up to the right, kind 33, at (7096, 1248). All are animation `471`, three frames of 2 frames each on a loop: variant 0 for kind 31, with the box (−15, −6, 7, 0), and variant 1 for kind 33, with (−15, −9, 6, 2). Variant 2 is kind 32, the slope up to the left, which act 1 doesn't have. A booster is drawn at its spawn point in OAM order 18 and BG priority 2, so behind the front layer and behind Sonic. When `d1` is set it is flipped and points left; none of act 1's is. Its task (`0x08076C91`) runs at priority `0x2000` and goes when its spawn point leaves the range.

Each frame, before it steps its animation, the task tests the box its last frame set against Sonic's side probe (see *Objects*), where he was at the end of the previous frame. A booster has no box on its first frame. While he touches it on the ground, not dead, on every such frame it:

- ends his attacks, mid-air moves, spin dash charge and push (`Player_TransitionCancelFlyingAndBoost`),
- plays song 172,
- puts him in the walk (character state 4) unless he is rolling or jumping as a ball (5) or charging a spin dash (6 or 7),
- faces him its way, and
- if his ground speed is under 9 px a frame its way, sets his ground and X speeds to 12 px a frame its way.

The booster runs before Sonic, so his own step then works on that speed in the same frame: running on with right held he keeps 3072/256, standing with nothing held he slows by the friction at once, on the slope it turns with the angle, and holding the other way he brakes on the same frame (the skid's song 115 then takes the booster's place on player 2). In the air, jumping or hopping over it, he isn't touched.

### Checkpoints

Act 1 has five checkpoints, kind 7, numbered by `d0` along the act: 1 at (3640, 768), 2 at (6376, 1056), 3 at (9576, 960), 4 at (9600, 1248) and 5 at (9904, 672). `d1` isn't read. All are animation `452`, in sprite palette 33, drawn at their spawn point in OAM order 18 and BG priority 2. Variant 0 waits: frame 0, with the box (−7, −44, 8, 5). Variant 1 spins: its script starts song 169, then shows frames 1, 2, 3, 4, 5 and 0 for 2 frames each and ends. Variant 2 is the passed checkpoint: frames 0 and 6 for 3 frames each, on a loop. Each kind of task runs at priority `0x2000` and goes when its spawn point leaves the range. The waiting one is `0x080215D9`, the spinning one `0x08021809` and the passed one `0x080218D9`.

A checkpoint whose number is not above the number of the last one passed (`gBossIndex`, 0 when the act is first entered and kept through deaths) spawns already passed. A waiting one tests, before anything else, whether Sonic's centre, where he was at the end of the previous frame, is inside its box, edges included. It doesn't check whether he is alive, only that nothing holds him (`MOVESTATE_IA_OVERRIDE`), as a wall pole does. When he is inside, it:

- makes its number the last passed,
- keeps where Sonic will start after a death: his centre at its x, and his `spriteOffsetY` above its base, so a rolling Sonic (offset 9) starts 5 px lower than a standing one (14),
- keeps the course time before this frame's tick,
- switches to variant 1 and runs the spinning task at once, then steps its animation again. Frame 1 only shows for that one frame.

When the spin ends, the sprite shows its last frame for that frame and the passed task takes over on the next.

### Wall poles

Act 1 has seven wall poles, kind 45, short bars sticking out to the left of a wall: at (7008, 384), (6768, 1080), (8064, 1096), (9216, 856), (9552, 1008), (9552, 1112) and (10752, 576). They don't read their `d` bytes. Kind 44, the same pole sticking out to the right, shares their code, and act 1 has none. Zone 1 draws them with animation `468`, the other zones with the red flag pole `470`. Variant 0 is the pole at rest: one frame, with the box (10, 5, 23, 8), mirrored on kind 45 to (−23, 5, −10, 8). Variant 1 is its swing: nine frames, 29 frames in all, then it ends. A pole is drawn at its spawn point in OAM order 18 and BG priority 2, flipped on kind 45. Its tasks run at priority `0x2000` and go when its spawn point leaves the range: waiting `0x08077965`, holding Sonic `0x08077A25` and swinging back `0x08077BA5`.

Each frame, before it steps its animation, the waiting task tests the box its last frame set against Sonic's body (see *Objects*), where he was at the end of the previous frame, if he is alive. A pole has no box on its first frame. It doesn't look at his speed, his direction, or whether he is in the air or curled up: walking, falling, jumping or rolling into it, from either side, it catches him. Then it:

- ends his attacks, mid-air moves, spin dash charge and push (`Player_TransitionCancelFlyingAndBoost`); his speeds, and whether he is in the air or curled up, stay as they were,
- plays song 175,
- holds him (`MOVESTATE_IA_OVERRIDE`): his own movement doesn't run while it is set, so no input, speed, gravity, collision or act edge moves him, but his animation, his input history and his timers still do,
- puts his centre 8 px from the pole's spawn point along the bar, near the wall, and 16 px below it, with no subpixel: (x − 8, y + 16) on kind 45, facing right, and (x + 8, y + 16) on kind 44, facing left,
- puts him in character state 31: animation 38, five frames of 3, 3, 3, 2 and 2 frames that stays on its last,
- switches to variant 1 and steps it at once, so the swing's first frame shows on the same frame.

The holding task then moves him on each of its 14 frames: 1 px down on the first seven, then 1, 16, 7, 7, 7, 7 and 7 px up. On the 14th it lets him go, thrown up: in the air, uncurled with his feet where they were (offset 14), in the spring's rising state (character state 21, then 18 and 19), with a Y speed of −7.5 px a frame and the X speed he came with. His own step then runs on the same frame. If he dies while it holds him it lets him go. When the swing ends, 29 frames after the catch, the pole shows the swing's last frame, goes back to variant 0, and catches him again from the next frame. Dropped straight onto a pole, he is caught, thrown up, falls back onto it and is caught again, over and over. The camera follows him as usual, with the air dead zone only if he was in the air when caught.

### Grind rails

Act 1 has three grind rails, drawn into the act over the sea and running down to the right. Each is a line of collision on the other layer from the ground around it, with an entity at each end. Kind 19, the start, sits at its top, and kind 20, the end, at its bottom. Both have a box `d2 × d3` tiles from their spawn point, edges included. Neither reads `d0` or `d1`. They test Sonic's centre where he was at the end of the previous frame, and only while he is alive: while he is dead they neither test him nor leave.

| Rail | Start (19) | Its box | End (20) | Its box |
| :---: | :--- | :--- | :--- | :--- |
| 1 | (3728, 728) | 24 × 16 | (4248, 1232) | 80 × 24 |
| 2 | (7088, 248) | 32 × 16 | (7352, 496) | 64 × 32 |
| 3 | (9968, 632) | 32 × 16 | (10368, 1016) | 112 × 24 |

**The start** (`Task_GrindRailStart`, `0x08023AD9`, priority `0x2000`) takes Sonic when his centre is in its box, he isn't already grinding, he isn't rising and his X speed is to the right. He can be on the ground or in the air, walking, jumping or falling. It doesn't check whether he is curled up. Then it:

- raises his X speed to at least 0.5 px a frame,
- sets the grinding flag (`moveState` bit `0x1000000`) and swaps his layer,
- draws him in front of the front layer (his sprite's BG priority 1),
- plays song 114, which loops,
- starts the sparks (`Task_GrindEffect`, `0x08040911`, priority `0x2001`).

Once on the rail's layer, he lands on it or runs onto it as on any ground. A rolling Sonic passes under all three starts: curled up, his centre is too low for their boxes.

**Grinding.** On the ground, not curled up, with the flag set, his own step (`sub_80472B8`) only grinds. He can't slip off the rail, his control lock doesn't count down, and the B moves, the spin dash and the walk don't run. Each frame (`sub_80449D8`):

- Holding down or right, even together with left, pulls him down the slope by `sin × 5/32`, more than a walk's 3/32. As for the walk, not on a wall or ceiling.
- Holding left takes 8/256 off his ground speed, and every frame takes 8/256 more, each time no lower than 0.75. So with nothing held he slows down to 0.75 px a frame along the rail, and holding down or right he speeds up.
- He is put in character state 16, and his X and Y speeds follow the rail's angle.

Then the act's edges, the move and his ground sensors run as on the ground. A jump press (`sub_8044434`) checks for 4 px of room above him on the layer he came from, not on the rail's. Without it, nothing happens. With it, he jumps back onto that layer: song 114 stops, his Y speed becomes the jump's 4.875 along the rail's normal, his X speed stays as it was, he curls up as for any jump, and he is drawn behind the front layer again. The original's code also has two cases the recordings don't reach: a hit while grinding takes him off the rail the same way, if there is room, and a Sonic who rolls onto a rail rolls down it, where a normal jump clears the flag but leaves him on the rail's layer.

His animation is state 16's, animation 44. Where the rail is steeper than `0x20` (`(rotation + 0x20) & 0xC0` not 0) the animation chooser shows variant 1 instead and turns him to face right. All three of act 1's rails are that steep for all but their first pixels. The sparks (animation `749`, in OAM order 8) only show and animate on the frames his animation was that variant, at his feet, mirrored when he faces right. They go once he stops grinding.

**The end** (`Task_GrindRailEnd`, `0x08023C59`) runs at priority `0x900`, before the camera, so it sees the camera of the last frame. It throws a grinding Sonic off when his centre is in its box:

- In its right half (his x past the box's left edge plus half its width): up at the jump's 4.875 px a frame, in the spring's somersault (character state 17, animation 11, then 19).
- In its left half, only while jump is held (the button itself, read from the pad): up at 7 px a frame, in character state 20 (animation 45).

Either way, his X and ground speeds stay as they were, song 114 stops, song 116 plays, his attacks and mid-air moves end (`Player_TransitionCancelFlyingAndBoost`), he leaves the rail's layer and goes behind the front layer again. He isn't curled up and doesn't count as having jumped, so he has no jump cap, insta-shield or mid-air dash. Sonic's own step then runs in the air on the same frame. Coming down a rail fast, he usually passes its end's left half between two frames and is thrown up from the right half. Song 114 shares player 2 with the jump and with every other ring Sonic collects, so a ring on the rail can cut it off for good.

### Incline ramp

Act 1 has one incline ramp, kind 26, at (8200, 768), where a slope up to the right ends. It has no sprite: its task (`Task_InclineRamp`, `0x08075325`, priority `0x2000`) only tests Sonic's centre against a box `d2 × d3` tiles from its spawn point, edges included, 24 × 32 px here, where he was at the end of the previous frame, if he is alive. It goes when its spawn point leaves the range. `d0` is its direction: set, as here, it throws Sonic when his X speed is above 4 px a frame to the right; clear, when it is below −4. It doesn't look at whether he is on the ground, in the air or curled up, so it also throws him when he flies or rolls through the box. Then it:

- takes him off any object and puts him in the air, uncurled with his feet where they were (offset 14), with no jump cap or mid-air moves,
- sets his Y speed to −8 px a frame and adds 4 px a frame to his X speed its way, up to 17,
- ends his attacks, mid-air moves, spin dash charge and push (`Player_TransitionCancelFlyingAndBoost`),
- puts him in the spring's somersault (character state 17, animation 11, then 19),
- plays song 170.

It does this on every frame he is still in the box going fast enough, so a fast Sonic can be thrown two or three times on his way through, each time 4 px a frame faster. Walking up the slope at 4 px a frame, he leaves the ground at its top at less than 4 and is not thrown.

### Half-pipe

The half-pipe after the fourth booster is a dip in the art with no floor in the collision under it: 672 px across, with a drop of about 143 px below. Two entities carry Sonic over it. Kind 28, the start, is at (9968, 968) and kind 29, the end, 688 px to its right at (10656, 968). Each has a box `d0, d1` tiles from its spawn point and `d2 × d3` tiles big, left and top edges included, right and bottom edges not: 16 × 32 px from (9968, 960) and from (10656, 960). They have no sprites. Their tasks (`Task_HalfPipeStart`, `0x0804D145`, and `Task_HalfPipeEnd`, `0x0804D2D5`, priority `0x2000`) test Sonic's centre where he was at the end of the previous frame. The start goes when its spawn point is more than 128 px right of the screen or 800 px left of it, the end when it is more than 800 px right or 128 px left, and both when it is more than 128 px above or below. Either clears the half-pipe flag as it goes.

**Taking him.** While his centre is in the start's box, on every frame, it sets the half-pipe flag (`moveState` bit `0x8000`) if his X speed is above 2.25 px a frame to the right, he is on the ground and no B move is running, and clears it otherwise. It then keeps where his feet were on that frame. The end does the same for speeds below −2.25, to the left.

**Lifting him.** Past the start's box on its right (or the end's on its left), with the flag set, if he is alive:

- If his X speed is between −2.25 and 2.25 px a frame, or he pressed jump on his last frame, the flag is cleared, and a half-pipe state goes back to the walk.
- Otherwise, if he moves its way at 2.25 px a frame or faster (`sub_804D4A0`), it works out a height and lifts him to it. Across the 672 px from the start's box it is 48 × (1 − cos θ) px, θ going from 0 to a full turn, so it rises from 0 to 96 px in the middle and back to 0. That is scaled by sin(90° × (|X speed| − 2.25) / 4), so the full height needs 6.25 px a frame and a slower Sonic rides lower. It moves his centre toward that height above the feet it kept, by at most 6 px a frame, puts him on the ground and sets his Y speed to 0.
- Moving the other way faster than that, nothing happens, and the flag stays.

When it lifts him, the half-pipe also picks his state, unless he is curled up or in a B move, and only from the walk or a half-pipe state: the walk below 8 px up, character state 24 below 24 px, 25 below 48 px, and 26 above. They are animation 36, variants 0, 1 and 2, played at the walk cycle's speed. While the flag is set, his walk code leaves his state as it is instead of putting him back in the walk.

Sonic's own step then runs as on the ground: his speed along the flat, his input, and his ground sensors, which find no floor under him and put him in the air until the next frame's lift. So he keeps his ground speed, with the walk's friction, over the whole half-pipe. Braking, slowing down below 2.25 or jumping lets him go and he falls into the drop. A Sonic who rolls in is lifted the same way, still rolling. Landing, any move that ends his attacks (`Player_TransitionCancelFlyingAndBoost`) and the ends of the B moves clear the flag too.

### Forced slide

Act 1 has one forced slide, kind 46, at (7904, 1080), at the top of the water slide that drops to the up spring at (8048, 1304). Its box is `d2 × d3` tiles from its spawn point, edges included, 104 × 56 px here, and it tests Sonic's centre where he was at the end of the previous frame, if he is alive. Its task (`Task_ForcedSlide`, `0x08078185`) runs at priority `0x1000` plus `d1` (as a signed byte), here `0x1000`: after the camera and before the other objects. `d0` is its direction: clear, as here, it sends Sonic right; set, left.

On every frame his centre is in the box, he is on the ground and not on an object, it:

- ends his attacks, mid-air moves, spin dash charge and push (`Player_TransitionCancelFlyingAndBoost`),
- holds his controls (`MOVESTATE_IGNORE_INPUT`): he reads nothing held and nothing pressed,
- faces him its way and sets his ground and X speeds to 4 px a frame its way and his Y speed to 0,
- puts him in the knocked-back state (character state 15, animation 19), uncurled with his feet where they were,
- draws the splash under him (animation `474`; by level, `gAnimSlideSplashes`, Ice Mountain's is the ice splash `562` and Angel Island's the mud splash `568`; in OAM order 3 and BG priority 2, mirrored when `d0` is set) at his centre, stepping its animation only on those frames.

His own step then runs with the slope's pull and the walk's friction, so he slides at about 4 px a frame. It only starts on him once the one-tile floor probe from his centre (`sub_801F07C`) finds the ground within 3 px; walking in, that happens a few pixels down the slide. Zone 5 also plays song 201 when it starts.

In the box but in the air, it lets go of him on the first such frame: his controls come back, with the jump and attack buttons he holds counting as held, so he can't jump or attack until he presses them again. That is how it ends in act 1, as the slide drops away under him. Leaving the box on the ground while it holds him lets go the same way and fades out sound effect player 2 (`m4aMPlayFadeOut`, speed 4); in act 1 he can't leave it that way.

It never goes: it would leave once its spawn point is out of the range, but only on a frame no character is in its box, and in a one-player game the partner's slot always counts as one that is. So once the camera has passed near it, it stays in the task list until the act starts over.

### Mini loops

Act 2's two mini loops (x 2672–2746 and 4208–4290) are made of invisible boxes, each `d0, d1` tiles (signed) from its spawn point to its top left and `d2 × d3` tiles big, left and top edges included. Their tasks (priority `0x2000`) test Sonic's centre where he was at the end of the previous frame; each goes when its spawn point is more than 128 px off the screen, clearing his half-pipe flag (`MOVESTATE_8000`) as it does.

- **Kind 34, the entry** (`Task_Interactable034`): ends his attacks and mid-air moves, curls him into a ball (character state 5) that keeps rolling (`MOVESTATE_200`), takes his controls with nothing held or pressed, and plays song 109 unless it is already playing (`m4aSongNumStartOrChange`).
- **Kind 35, the way out** (`Task_MiniLoop_Base`): ends the forced roll and gives his controls back, the jump and attack buttons he holds then counting as held.
- **Kind 36** sends him right at 9 px a frame on the ground, **kind 37** left at 7.25, and **kind 38** turns him upside down (angle `0x80`) and, on the ground, the other way.

While the forced roll lasts he lands curled up, his rise isn't capped at 11.8125, and when the roll's friction would stop him he rolls on at 3 px a frame the way he faces, with song 109 again.

### Water bridge

Act 2's water bridge, kind 40 at (2192, 808), is an arc of water across a box from (1976, 784), 416 × 104 px (`d0, d1` signed tiles to its top left, `d2 × d3` tiles big): half a sine, θ = (x − left) × 512 / width over the 1024-step sine table, the arc at `bottom − sin θ × height`. On every frame his feet (centre plus `spriteOffsetY`) are in the box and up to 32 px below the arc, it adds 0.25 to his speed (X speed in the air, ground speed on the ground) up to 8 either way, sets his rise to `−height × cos θ × speed / 65536 − 42/256`, ends his moves, holds his controls, puts him in the knocked-back state uncurled but as short as a ball, and draws animation `474` (OAM order 15, BG priority 1) at his feet less 6 px. The first such frame plays song 177 and sets `MOVESTATE_8000`; the move's cancel clears that again, so the sound is asked for every frame and restarts whenever it ends. On every other frame it gives his controls back and clears the flag. The splash beside it, kind 43, plays animation `473` at its spawn point. Both go 128 px off the screen. The splash under Sonic is drawn with his `spriteOffsetX` where `spriteOffsetY` is meant, 3 px lower than intended.

### Shrubbery

Act 2's 34 bushes (kind 30, x 6912–8504) are boxes from their spawn point, `d2 × d3` tiles, edges included. The frame Sonic's centre gets into one, unless he is dead, it plays song 178 and makes leaves (animation `467`, OAM order 0, BG priority 0, a task at `0x3000`) at his centre plus `(random & 0x1F00) >> 8 − 16` across and `(random & 0x0F00) >> 8 − 8` down, two of the game's random numbers, across first. The leaves last 51 frames or until out of range.

### Rings

Rings use the interactables' grid, with 2-byte records `x, y` (tiles inside the region) ending with `0xFF`. Act 1 has 291. A ring is a 16 × 16 px sprite with its bottom centre on that point: animation `707`, four frames of 8 ticks each, in sprite palette 68. Every ring shares one sprite, so they all spin together.

The ring manager runs after the camera and before the objects and Sonic, so it tests where he was at the end of the previous frame. It doesn't spawn rings: each frame it searches the regions under Sonic's box (±6 px wide, ±`spriteOffsetY` tall around his centre) and collects every ring whose 16 × 16 box it touches, edges included. A collected ring is marked in the list and never comes back until the act starts over. Two quirks come from its region search:

- The search stops 16 px short of the box's bottom and 8 px short of its right side, so a ring just inside the next region down or to the right can be missed for a frame.
- Region numbers are 16-bit, so a box reaching above or left of the map searches nothing.

Rings are drawn from the regions the screen's top-left corner and the screen cover, while a ring is no more than 8 px off the screen's left or right side, its bottom isn't above the screen's top edge, and its top is no more than 16 px past the bottom edge. In the sprite list they come behind the objects and Sonic.

Each ring adds 1 to the count, and passing a multiple of 100 gives a life. It also leaves a sparkle (animation `708`, four frames of 8 ticks, then gone), but only while fewer than 8 are showing; beyond that, a ring still counts but makes no sparkle and no sound. Sparkles run after the objects from the frame they appear, and are drawn in front of Sonic.

**How it was checked.** mGBA 0.10.5 recorded two runs through act 1 with Sonic's position and the original's ring list dumped after every frame. Replaying the recorded positions, the port collects the same rings on the same frames in both (14 and 23 rings), and none the original didn't. On each of those frames, the sound engine port loaded with the dumped state and given the two ring sound calls ends up identical to the original's. The region-search quirks are taken from the code; neither run hit them.

### Spikes

The spikes are animation `454` in sprite palette 35: variant 2 points up, variant 3 sideways, pointing right and flipped to point left. Act 1 has four that point up (kind 1) and five that point left (kind 3); act 2 has three up, two left, one right (kind 4) and four hiding spikes (kind 5). They are solid like any platform. The up spikes hurt Sonic when he lands on them, and the sideways ones when he touches the face they point to. Touching a sideways spike's back face puts him out past its other face, as the code reads; in the acts their backs are against walls. A hit by spikes plays song 171.

**Hiding spikes** (`Task_Spikes_HidingUp`, `sub_8020F2C`) point up and go by the stage clock, the same for all of them: of every 128 frames they are hidden and not drawn for the first 60, show variant 0 (low) for 2 and variant 1 (half up) for 2, are up (variant 2) for 60, and go down through variant 1 and variant 0 for 2 frames each. While they are up they are solid and hurt Sonic landing on them. On the frame they come up, a Sonic whose body is in them is lifted onto their top and hurt. On every frame they aren't up, a Sonic standing on them falls, and stops pushing against them. They go when their spawn point leaves the range around the camera.

Kind 2 points down: the up spikes flipped (`Task_Spikes_Down`). They hurt Sonic when he hits them from below, unless an object carries him. Kinds 5 and 6 hide and come back (`Task_Spikes_HidingUp`, `0x08020A1C`, and the flipped `Task_Spikes_HidingDown`): with the stage clock, 128 frames a turn, they are hidden and not drawn for 60, rise over 4 (variants 0 and 1, 2 frames each), stay up for 60 and sink over 4. Only while up are they solid. On their first frame up, Sonic's body inside their box is put on top of them (below the down ones) and hurt; otherwise they hurt as the plain spikes do. On the frames they aren't up they drop him if he stands on them. Ice Mountain act 1 has three down spikes and three hiding ones.

### Enemies

Act 1 has five kinds of enemy. Each works out its position from its spawn point every frame. It goes when both its spawn point and its current position are outside the range around the camera.

| Kind | Enemy | Count | Animations | What it does |
| ---: | :--- | ---: | :--- | :--- |
| 0 | Kiki | 4 | `401`, coconut `408`, its pieces `402` | Climbs up and down its tree at 1 px a frame and throws a coconut on every second visit to the top. The coconut flies toward where Sonic is, at up to 1.5 px a frame, bounces once, rests for 96 frames and bursts. Its pieces hurt for the 15 frames they show. |
| 1 | Buzzer | 10 | `403`, shot `409` | Flies back and forth at 1 px a frame. Once per leg it stops to shoot when Sonic is in a wedge below it on the side it faces. The shot flies straight at where he was, about 1.68 px a frame. |
| 2 | GamiGami | 3 | `404`, shot `410` | Walks along the ground at 0.625 px a frame. At each end it raises its claws for 19 frames and fires two shots on the 15th, thrown up and falling through everything. |
| 3 | Rhinotank | 3 | `405` | Drives at 0.625 px a frame and slides round at each end. It charges at 3 px a frame when Sonic is within 80 px in front of it. |
| 4 | KeroKero | 7 | `406` | Jumps toward Sonic, 1 px a frame, when he is within 80 px on the side it faces, at any height, and croaks now and then |

Each enemy's sprite carries its hitbox in its script. Sonic's sprite has two boxes of its own: slot 0 is his body, and slot 1 is an attack box, which only the scripts of his attacking moves set. When his attack box touches an enemy's box, the enemy is destroyed and Sonic, if he was falling, bounces back up at the same speed. Otherwise his body on it hurts him. Shots only hurt. Nothing hurts him while he is dead.

**Defeating an enemy** leaves, in this order:

1. A dust cloud (`407`) that plays once where the enemy was.
2. A freed animal. Neo Green Hill's are the otter (`445`), the koala (`450`) and the kangaroo (`449`), in turn (every zone's are under [Freed animals](#freed-animals)); Ice Mountain's the otter, the seal (`437`) and the penguin (`443`), which hops away like the kangaroo. It hops up at 4 px a frame and lands on the ground; the otter and the koala then sit, and the kangaroo hops away to the left at 2 px a frame.
3. The points (`709`): 100, 200, 400, 800, then 1000 for each enemy after that, counted since Sonic last touched the ground. They rise 1 px a frame for 60 frames, stay for 30 more and go. Every 50,000 points give a life.

The defeat plays song 138.

### Item boxes

Item boxes have their own grid, like the rings', with 3-byte records `x, y, kind` (tiles inside the region). Act 1 has 13:

| Kind | Prize | Act 1 |
| ---: | :--- | ---: |
| 0 | 1-up | 1 |
| 1 | Shield | 3 |
| 2 | Magnetic shield | 1 |
| 3 | Invincibility | 1 |
| 4 | Speed shoes | 2 |
| 5 | Random rings | 3 |
| 6 | 5 rings | 2 |
| 7 | 10 rings | 0 |

The box is animation `705`, one frame with the hitbox (−13, −24, 13, 4). Its screen shows the prize's icon, animation `706` in variant 0 (Sonic's face, the 1-up), then 4 to 10 for kinds 1 to 7, drawn behind the box.

How Sonic meets a box depends on his attack box (hitbox slot 1). The decompiled C reads his body box (slot 0) here, but the ROM reads slot 1:

- **Without an attack box, or standing on the box,** it is a solid platform. He can stand on it and push against it, but not break it.
- **With an attack box** (curled up, or in an attacking move), touching the box with it breaks it, and so does landing on its upper half with his body while falling. If he was falling, he bounces back up at the same speed. In the air, his side probe on the box stops him moving into it.
- **From below,** rising into its lower half either way, he stops under it and the box hops: it rises 1 px a frame, slowing by 40/256 px a frame per frame, until it lands on the floor again. A hop wins over a break.

**A broken box** plays song 167 and leaves a dust cloud (`407`), and draws nothing on that frame. From then on only the icon is drawn. It rises 1 px a frame, and on the 60th frame the prize is given. The icon stays 30 frames more, then goes. A broken box doesn't come back until the act starts over, and gives no points. A box goes like the other objects when its spawn point leaves the range around the camera, except that the hop's offset is counted twice in the test.

### Prizes

The prize comes on the 60th frame after the break, from the box's task:

| Prize | What it does |
| :--- | :--- |
| 1-up | A life, and the 1-up jingle (song 307) in place of the music |
| Shield | Song 168 and the shield (`750`), which replaces a magnetic shield |
| Magnetic shield | Song 168 and the magnetic shield (`751`), which replaces a shield |
| Invincibility | 1200 frames, with the stars (`752`) and its music (song 28). Taking it again only resets the timer. |
| Speed shoes | 1200 frames, and the music at twice its tempo |
| Rings | 5, 10, or a random 1, 5, 10, 20, 30 or 40, with song 117. Passing a multiple of 100 gives a life. |

**The shields and the stars** are tasks after the music manager (`0x4001`) and follow Sonic's centre. They take turns on screen by the stage clock: a shield on the frames with its bit 1 set, the stars on the others. A shield is hidden while Sonic is invincible, and is drawn over him, hiding him on its frames. Every 8th frame of the stage clock the stars leave a sparkle (`752` variant 1) up to 15 px from Sonic, in a direction and at a distance from two draws of the game's random numbers. The sparkle stays where it appeared and plays once.

**A shield takes a hit.** Sonic is knocked back as usual and the shield goes, but he keeps his rings. The hit's song 119 is cut off by the hazard's own sound when it has one (song 171 for spikes).

**Invincibility.** Nothing hurts Sonic, and touching an enemy with his body destroys it, without the bounce. When the time runs out, song 28 stops and the music manager starts the act's music again.

**Speed shoes** double his top speed (to 9.0), acceleration and deceleration on the ground and in the air, roll friction and the mid-air dash. Friction, the brake, the turn kick and the roll's deceleration stay the same. When they run out, the music's tempo goes back to normal.

**The magnetic shield.** While Sonic has it, the ring manager takes every act ring on screen within 64 px of his centre across, 72 px above it or 56 px below it, and turns it into a flying ring at the objects' priority. It turns toward him every frame and speeds up by 0.25 px a frame per frame, with no limit, until it touches his body box and counts. It doesn't check whether he still has the shield or is blinking. Scattered rings are not pulled in.

**The music manager** (`0x4000`) runs while Sonic is alive and picks one thing a frame: it stops song 28 if it is playing while he isn't invincible, starts it if he is and neither it nor the jingle is playing, starts song 28 or the jingle when a prize asks for it, and otherwise starts the act's music again when nothing is playing. That last case uses a fade-in, and twice the tempo with speed shoes.

**The game's random numbers** (`gPseudoRandom`, `0x03004C58` on the USA ROM) are one sequence for the whole game: `seed × 0x196225 + 0x3C6EF35F`, from 0 at power-on, never reseeded. In act 1 only the sparkles, the random-ring boxes and the brake dust use them (the dust's flips are bits `0x400` and `0x800`).

### Getting hurt

A hit with rings throws Sonic up at 3.0 and away at 1.5 px a frame, against the way he was moving (or facing, when still). It doesn't matter where the hazard was. Knocked back, he has no control, no moves and no air drag until he lands. He then blinks for 120 frames (hidden 2 frames out of 4, in step with the stage clock), which only start counting once he has landed. Nothing hurts him while he blinks, and he can't collect rings until he lands. He drops all his rings, the count goes to 0 and song 118 plays.

**The scattered rings.** Up to 48 rings leave his centre, with speeds going round three circles in mirrored pairs. Each ring moves, then falls at 18/256 px a frame per frame. While falling it bounces off the floor of its tile at a quarter of its speed, and it goes through walls and ceilings. A ring can be picked up after 32 frames and disappears after 256. In its last 32 frames it shows only while the stage clock's bit 1 is clear. All of them share one ring sprite, spinning twice as fast as the act's rings, and they are drawn where each ring was before its bounce. Their task runs after the objects, so rings dropped by a hazard move once on the frame they are dropped.

### Dying and the restart

Sonic dies when a hit finds him without rings (thrown up at 3.0) or when he falls out of the bottom of the act (thrown up at a jump's speed). On that frame the camera's target and the stage clock stop, his speed across goes to 0 while his ground speed is kept, a push ends (so he doesn't show the push animation as he falls), song 119 plays and the music plays on. His blink timer is set to 2, counts down once and stays at 1. He then falls through everything, in front of the front layer, until his centre is 240 px below the top of the screen. He disappears there, and 61 frames later he loses a life.

Losing a life destroys every task, so nothing after Sonic runs on that frame, and loads the act again (`CreateGameStage`): the act's music starts from its beginning on that same frame (`StageInit_Zone1Act1`). The original then spends the whole next frame loading, and nothing runs. On the frame after, the act starts over with its rings, enemies and objects back: the ring count goes to 0, and the score, the stage clock and the last checkpoint passed carry on. Sonic starts where the last checkpoint passed put him, or at the act's start without one. The course time goes back to what it was when he passed that checkpoint, or to 0 without one (and to 0 if it had reached 10:00). The new camera starts with Sonic centred, not yet kept inside the act (x = −16 at act 1's start). Its task's first frame only sets it going, so it starts moving on the second frame.

**The title card.** The act, when it starts and every time it starts over, runs the title card's task (`0x2100`; how it looks is under [Title card](#title-card)). While it runs, the course clock is stopped and Sonic reads no input: he sees the jump and attack buttons held, as `InitializePlayer` leaves them, and nothing pressed, so his bored animation waits too. The card counts its frames from the first one it runs. On its 226th it lets Sonic go (`MOVESTATE_IGNORE_INPUT` cleared) and the clock starts on the same frame. A press of A, B or the pad from its 36th frame to its 214th skips it to its 215th, so it ends 11 frames later. On the frame it ends, the jump and attack buttons can't count as pressed.

**How it was checked.**
- *Enemies:* mGBA 0.10.5 recorded every task of the act's enemies, shots and effects after each frame, with Sonic's position and hitboxes, in 13 runs: each enemy kind on its own, both ways round and from different sides, and five runs where Sonic destroys enemies in a row. Fed Sonic's recorded position, the engine's enemies, shots, dust clouds, animals and points match the original's position, animation and hitbox on every frame of all 13 runs, and the score matches too.
- *Damage:* nine more recordings dumped Sonic, the camera, the rings, the lives, the stage clock and the scattered rings after each frame. They cover a hit by spikes with 12 rings, a hit with 60 rings (48 scatter), knockbacks to either side and facing left, two hits from the left, a death on spikes and a fall out of the bottom of the act, both through the restart. Run from the recorded start, the whole game matches every one of them on every frame: Sonic's position, speed, blinking and death, the rings and lives, the camera, the stage clock, the scattered rings drawn and the sounds played. A tenth run, where Sonic runs into an item box and pushes against it, matches too.
- *Item boxes:* 21 more recordings dumped the whole of IWRAM and the music players after every frame, from before the act starts. Sonic falls curled onto each kind of box, then waits, walks or meets a hazard: the shield and a spike hit with it, the magnetic shield pulling rings in, invincibility to its end, speed shoes to their end while running both ways, the 1-up, 5 rings, random rings, a hundredth ring from a box, a hop from below, a roll into a box, a push against its side in the air, and invincible Sonic against spikes and three kinds of enemy. Run from the act's first frame with only the recordings' inputs and pokes, the whole game matches every one of them on every frame: Sonic, the rings and lives, the camera, the stage clock, his item timers and shield, the random numbers, and where every box, icon, dust cloud, shield, star, sparkle and flying ring is drawn. The music changes on the same frames as the original's.
- *Platforms:* 14 more recordings, made the same way, drop Sonic onto every kind of platform, still or walking off it, and jump from them. They cover a swinging platform carrying him and one he jumps up through, both falling platforms dropping him, the trampoline, a bounce block both ways, the cluster of bounce blocks with right held, and both crumbling platforms, one walked off as it goes. Run from the act's first frame, the whole game matches all of them on every frame: Sonic and his animation, the rings, the camera, the stage clock, the sounds, and where each platform and crumbling tile is drawn.
- *Boulders and pushing:* seven more recordings, with Sonic kept from getting hurt, push against a wall and against the first boulder from each side, jump on it, break it with the spin attack, spin dash into it, and break the second one. The whole game matches all of them on every frame, run from the act's first frame: Sonic and his push animation, the boulders, and where each piece is drawn, read from the original's sprite list.
- *Waterfalls and balancing:* 16 more recordings walk through a waterfall, fall through two, and stand on the third boulder inside one and jump. They also stand Sonic at a ledge each way and turn him round, walk him up to one, and stand him on both sides of the first boulder and of a crumbling platform each way round, at the edge and a pixel inside it. The whole game matches all of them on every frame, including his balancing animations and where the splash is drawn.
- *Boosters:* 14 more recordings walk Sonic over the first, third and fourth boosters and the sloped one, drop him standing onto the first, hop over it at three timings, run into it with the combo's first B attack and with its somersault, walk left into the second while holding left, and drop him onto it holding down. An earlier recording, where he spin dashes into the right spring at 6432 and rolls back over the sloped booster again and again, shows it keeping a speed already above 9. The whole game matches all of them on every frame, run from the act's first frame: Sonic and his animation, the camera, the rings, where each booster is drawn and with which frame, and every frame song 172 starts. The fourth booster throws Sonic into the half-pipe at 9968, and that recording now matches across it to its end. The original's OAM shows the boosters at BG priority 2.
- *Checkpoints and the restart:* 12 more recordings, which also dump the course time, the checkpoint Sonic would start from and the checkpoints' tasks, walk Sonic through each of the five checkpoints, through the first from the right and jumping, and roll him through it. Five of them then drop him out of the bottom of the act after the first, second or fourth checkpoint, wait through the restart and the title card, and walk on; one presses A during the card to skip it. Run from the act's first frame, the whole game matches all of them on every frame: Sonic and his animation, the camera, the course time and stage clock, where he would start again, the title card holding him, where each checkpoint is drawn and with which frame, the frames song 169 starts and the frame the music starts again. The earlier recordings all still match, with their harnesses now leaving the title card to the game, and a spin dash recording that dies and waits through the restart now matches too: before, the music started two frames late and Sonic grew bored 224 frames early.
- *Wall poles:* 40 more recordings, which also dump the poles' tasks, drop Sonic beside each of the seven poles from four places, and beside the first standing, curled up, moving right at 3 or 8 px a frame and drifting left. They also throw him up curled into the first from below, run him off a ledge into one and hop him into another, and press A, B, down and left while the first holds him and as it lets go. Every pole catches him in at least three of them, some again and again. Run from the act's first frame, the whole game matches all of them on every frame: Sonic and his animation, the hold, the camera, where each pole is drawn and with which frame, and the frames song 175 starts. One of them runs on across the half-pipe and now matches to its end. Another runs on down the second grind rail and now matches to its end.
- *Grind rails:* 25 more recordings, which also dump the rails' and the sparks' tasks, Sonic's sprite priority and the grinding flag. They drop Sonic into each rail's start at 1, 3 and 5 px a frame, run him onto two of them on the ground, jump him onto the first from the ground at two timings, throw him onto the second from the wall pole below it, and roll him under two starts. On the rails they hold nothing, right, down or left, jump off partway, and ride to each end, where he is thrown from the right half or, slowed down with jump held, from the left half. Run from the act's first frame, the whole game matches all of them on every frame: Sonic, his animation and sprite priority, the grinding flag, the layer, the camera, where the sparks are drawn, the frames songs 114 and 116 start, and whether song 114 is still playing. One of them showed that up and down work during the control lock after slipping off a slope: Sonic, holding down, rolled as he landed.
- *Incline ramp, half-pipe and forced slide:* 40 more recordings, which also dump these objects' tasks, the half-pipe flag and the held controls. Nine run Sonic up the ramp's slope at 2, 4, 6, 7 and 8 px a frame, with and without right held, roll and jump into it, and fly over it at 10. Eighteen cross the half-pipe: through the fourth booster, from the start at 3, 5, 6 and 8 px a frame with and without right held, rolling at 4 and 8, braking and turning back partway, jumping in the start's box and partway, pressing B on the way in, falling through the start's box in the air, and from the end to the left at 3, 8 and 12 px a frame, once jumping. Thirteen walk, run, roll and drop Sonic onto the forced slide, come into it from the right, fly over it, and hold or press A, B, left and right before, during and as it lets go. Run from the act's first frame, the whole game matches all of them on every frame: Sonic and his animation, the half-pipe flag, the held controls, the camera, where the splash is drawn, and the frames song 170 starts. They also show the slide's task staying in the list hundreds of frames after the camera has left it. The slide's fade of sound effect player 2, a hit while the half-pipe holds him and a death there are read from the code: none of the recordings reach them.
- *Palette animations:* mGBA's palette RAM, read every frame from the act's first frame, and again through the restart after a death, matches the colours the engine has loaded on every frame. A screenshot at a waterfall matches the engine's frame pixel for pixel in the waterfall, the layers and the sea, with the stage clock and both animations at the same point.

### HUD

The HUD is twelve sprites at priority 0 and OAM order 3, in front of every layer and every sprite but the priority-0 ones with a lower order (0 to 2), such as Ice Mountain's water surface and Yukimaru's snowball, which the GBA stacks in front of it. It comes from the UI graphics table, whose entries are a tiles pointer, a palette pointer, then the tiles per glyph, the sprite size and shape, and the width and height in tiles. Tiles are 4bpp with the low nibble on the left. The HUD uses three entries:

- **Entry 0, the 8 × 16 font.** Its `0`–`9` and `:` (tiles 32–53) are the white glyphs. The same characters at tiles 224–245 are red.
- **Entry 5, the 32 × 32 ring icon.** It shares the font's palette, which the HUD loads into sprite palette 6.
- **Entry 1, Sonic's 16 × 16 face.** It uses his own palette.

| Element | Position | What it shows |
| :--- | :--- | :--- |
| Ring icon | (−2, −1) | |
| Ring count | y 5, from x 9, 5 or 1 for one, two or three digits | No leading zeros, 999 at most (the count itself goes on). At 0 it flashes: a counter that only moves while the count is 0 picks white, red, red, white for 8 frames each. The HUD's task never sets the counter, and its data takes the place of the title card's pieces', so it starts each time at what the card leaves there, 1. |
| Score | y −2, last digit at x 73 | Nine digits at most; 0 until something scores |
| Timer | (25, 12), seven glyphs | `M:SS:CC`, where CC is hundredths: the frame count × 100 / 60, rounded. After 9:00 it turns red for 16 frames out of every 32; from 9:40 the warning beep (song 139) plays every second; from 10:00 it reads `9:59:99`. |
| Face | (2, 144) | |
| Lives | (22, 143) | One less than the lives (a new game has 3), 9 at most |

The HUD runs after the rings and objects and before Sonic, so it shows the ring count from the same frame. The timer moves on at the end of the frame, so it shows the count from before that frame. There is no HUD while the title card plays: the card makes the HUD's task as it ends, and the task first runs on the next frame.

**Extra lives.** Every time the ring count passes a multiple of 100, Sonic gets a life, and the stage's music manager plays the 1-up jingle (song 307) on the music's own player. That cuts the music off at once. On the first later frame where that player has stopped, the music starts again from its beginning, fading in from 1/64 over 64 frames. The manager runs after Sonic, and looks at the music player as the engine left it at the start of the frame.

**How it was checked.**
- *Screenshots:* mGBA screenshots were taken at 0 rings (both colours of the flash), at 1 to 12 rings, at 1000 rings (shown as 999), with a score of 123450, with 12 lives (shown as 9), and on both phases of the red timer. The port's HUD, drawn from the recorded state of the frame before each screenshot, matches 256 of 257 of them pixel for pixel. The other one is a frame where the recorder had just changed those values in memory.
- *Jingle:* the sound engine port with the music manager stays identical to mGBA's engine for 368 frames, from just before the 100th ring through the jingle, the music's restart and the end of its fade-in.
- *Read in the code only:* the 10:00 reading. The stage doesn't end at 10:00 yet (the original's time over).

### The game's start

Before the act, Onsoku Advance shows what Sonic Advance shows when it starts with a saved game: the SEGA and Sonic Team logos (`CreateSegaLogo`), the intro (`CreateIntroAnimation`), the title screen (`CreateTitleScreen`) and the main menu (`CreateMainMenu`). They are a port of the original's code ([`src/front/`](../src/front/)) on a port of the engine its screens are built on ([`src/gba/engine.js`](../src/gba/engine.js)): the tasks run once a frame in order of priority, the copies of the display registers they write, the graphics queue copied to VRAM in the V-blank, the heap the sprites' tiles are given room in, the sprites' OAM entries, the H-blank DMA that changes a register from one line to the next, and the keys. [`src/gba/video.js`](../src/gba/video.js) draws the result as the GBA's video hardware does, a line at a time. Everything is read from the ROM as the original reads it: the logos are entries 86 and 87 of the tilemap table, the intro's pictures come from the intro graphics, its sprites from the sprite tables and its names' letters from the intro tables, and the title screen's background and logo are entries 75 and 74 (the English logo; 73 is the Japanese one). They run at the GBA's own 59.73 frames a second.

Frames are counted as mGBA draws them from power-on, the first being frame 0:

| Frames | What shows |
| :--- | :--- |
| 7–166 | SEGA's logo wipes in from the bottom, a line more each frame. The lines below the wipe are the logo, the lines above it the logo's first line, stretched (the H-blank DMA scrolls each line). |
| 167–286 | It holds |
| 287–446 | It wipes out the same way, its last line stretched up from the bottom. On the last frame Sonic Team's logo is set up. |
| 447–586 | Sonic Team's logo opens out from its middle: its top and bottom 40 lines show at once, and its middle 80 start split apart, every other line shifted the other way, closing in 2 px a frame. On 586 SEGA's ring plays (song 102). |
| 587–708 | It holds |
| 709–740 | It fades to white, a 32nd a frame |
| 741 | The intro is set up, black, and its music starts (song 1) |
| 742–1062 | A Chaos Emerald falls down the green streaks as the screen fades in, slowing to a stop by the 90th frame, with two rings of eight sparkles turning around it. From the 153rd frame Dr. Eggman's colours fade in from black, from the 183rd he rises into view under the emerald, his hands following once he is past 80 lines, and from the 234th the emerald falls again, into his hands. He grins from the 311th. |
| 1063–1567 | The sparkles go, a pair every 4 frames, and the screen darkens a little. On 1287 two spotlights come on and sweep across Eggman, everything else darker. |
| 1568, 1982, 2396, 2810 | Sonic's, Tails's, Knuckles's and Amy's turns, 414 frames each. Each starts black with the character's silhouette. On the 31st frame the screen goes white and the silhouette turns into the character, and from the 43rd a large picture of them fades in behind over 32 frames. From the 91st their name's letters slide in from the right, 16 px a frame, each 15 frames after the one before, and from the 353rd the screen fades to white. |
| 3224 | The intro ends and the title screen is set up, without starting its music: the intro's goes on into it and ends on its own on 3381 |
| 3225–3273 | The title screen's background fades in from white over 49 frames |
| 3274–3286 | The logo, a rotating layer, zooms in from four times its size: 16 / 256 of its size smaller on the first frame, 8 / 256 more on each after, until it is its size |
| 3287 | The copyright line shows |
| 3347 | "PRESS START" blinks from here, on for 31 frames, then off and on for 32 each, and Start opens the main menu |
| 4188 | The original starts its first demo here; demos aren't built, so the title screen stays |

**The spotlights** (`CreateSpotlightBeamTask` and `Task_SpotlightBeam`) are windows 0 and 1, each a wedge from a point below the screen whose two edges are drawn into the window's sides a line at a time. The decompilation's C for them is Sonic Advance 2's, so the port follows Sonic Advance's own assembly (`sa1_Task_SpotlightBeam`), which differs: it has no check for a beam of width 0. An edge's slope is the tangent of its angle: the sine over the cosine, both taken down to 8.8 first, through the BIOS's `Div`. Where the cosine comes to 0 that is a division by 0, which the original makes and mGBA's BIOS answers with ±1.

**An overflow in the original.** The window effects write one line past the end of the H-blank DMA's second buffer (`gBgOffsetsBuffer`). In work RAM the sprites' colours (`gObjPalette`) come right after it, so on most of the spotlights' frames, 1312 to 1566, the sprites' colours 0 and 1 hold a window's last line. The engine keeps the buffers and the colours side by side in the same way, so it does the same. Colour 0 is transparent and nothing drawn then uses colour 1, so it never changes the picture (the engine run with the colours kept apart draws the same frames).

**Skipping.** The logos read no keys until Sonic Team's logo fades: then A or Start goes to the title screen on the next frame. In the intro, A, B or Start goes to the title screen on the next frame and stops the intro's music, so the title screen starts its own (song 2). When the intro ends after Amy, the title screen starts without starting its music (`IntroOpenTitlescreenSilent`). A skipped title screen runs as above from the frame after it is set up: with Start pressed on frame 1500 its fade is 1503–1551 and the zoom 1552–1564, the copyright line shows from 1565 and "PRESS START" from 1625. In Onsoku Advance, Enter or the controller's Menu button is Start, Backspace or View is Select, and A and B are the act's jump and attack.

**The main menu.** Start on the title screen plays the select sound (song 106) and the title screen's sprites go; the menu is set up on the next frame, and its items show two frames after that. They are the five variants of "PRESS START"'s animation after its own, Game Start, VS, Time Attack, Options and Tiny Chao Garden, 14 lines apart from line 93, each with its own room in the sprites' VRAM heap. The chosen one is drawn a palette row along, which holds the lit colours. Up and Down move the choice, wrapping round at both ends, with the cursor sound (song 108) each time; held, they repeat 20 frames after the press and every 9 after that. The menu also animates a Chao beside the chosen item, loading its tiles every 5 frames, but never shows it. A on Game Start plays the select sound and darkens the screen over 49 frames; on the last the layers' maps are cleared, and on the next frame the menu starts the boss music (song 29), clears its player and stops it, which stops the title's music, and the character select starts.

**Not built yet.** These are still to come, so the game goes on where they would start:

- *The demos*, which the original starts after 900 frames on the title screen: the title screen stays as it is, and Start still opens the menu.
- *VS, Time Attack, Options and Tiny Chao Garden:* A on them does nothing. The original plays the select sound and fades out to them as it does for Game Start.
- *The character select:* Game Start goes to the act, on the frame the character select would start.
- *The saved language:* the title screen and the menu are in English, the language screen's default.
- *The language screen* that a new game, without a save, starts with before the logos: the game always starts as with a save.
- *The soft reset:* A, B, Start and Select held together restart the original from Sonic Team's logo on; here they do nothing.

**Lag.** The original skips a frame's keys and tasks when the V-blank's copies run past the V-blank. These screens never do on the recordings, so that isn't modelled.

**The widescreen view.** With it on, the logos, the intro, the title screen and the menu fill the same view as the act, with the original screen in its middle drawn exactly as at 240 × 160; the game runs the same either way. Past the screen's edges each scene goes on as it really is:

- *Layers:* the logos' map once across, with nothing either side. Eggman and his hands appear once, with nothing past their pictures (their maps' last 16 columns, and the rows past the pictures, are left over). Each character's picture and the backdrop behind it appear once, their edges carried on. The streaks carry on down for ever and out to the sides by their outer columns.
- *Sprites:* where they really are, not where OAM wraps them, so the emerald and the sparkles show above the screen before they fall into it. A name's letters, which slide in from just past the screen's right edge, slide in from just past the view's.
- *Effects:* the spotlights are the whole wedges they are. The fades, the darkening and the SEGA wipe's stretched lines carry on above, below and to the sides.
- *Screens made for 240 × 160 alone:* a screen with nothing of its own past the screen's edges sets the engine's `wideBars`. The view then shows the original screen, drawn as at 240 × 160, in its middle with black around it, rather than a stretched or repeated edge. The title screen and the menu do: the background's picture ends at the screen's edges, in Sonic's speed lines and the checks, and carrying those on drew streaks.

Turning it on or off (<kbd>V</kbd>) re-fits the view at once. It was checked on every frame of the runs above: at 240 × 160 the pictures are the same as before, and at every view size tried, the middle of the view is the original screen.

**How it was checked.** mGBA 0.10.5 recorded the game from power-on to the title screen, with a save and nothing pressed, dumping VRAM, palette RAM, OAM, the work RAM and every line's display registers after each frame. Three more runs, recorded around the press, skip with A held from frame 720 (in Sonic Team's fade), Start from 1500 (during the spotlights) and B from 2100 (in Tails's turn). Three more cover the title screen and the menu:

- Nothing pressed, recorded from the intro's end to frame 4300, past where the demo starts.
- Start on 1500 to skip the intro, then on the title screen Start too early (1560) and in time (1660). In the menu, Down twice, Up three times (round from Game Start to Tiny Chao Garden), Down (round to Game Start), Down held for 60 frames, Up, and A on Game Start on 1900.
- From the intro's end, Start on 3400 and A on Game Start on 3450.

- *Every frame:* from the SEGA logo's first frame to the intro's last (7 to 3223), the engine's VRAM, palette RAM, OAM and each line's registers match the recording's, except for some VRAM on frames 445 and 3223. On those the next screen clears VRAM straight rather than in the V-blank (on 445 Sonic Team's logo its first two tiles, on 3223 the title screen its first tile and a few bytes of the sprites' first tiles), and the recording catches that write a frame before it shows. Nothing on screen uses those bytes then: the recorded state draws the same picture as the engine. The same goes for frame 1501, before the skipped title screen.
- *The title screen and the menu:* every frame matches in the same way from the title screen's first to the last before the character select (1502–1950 and 3224–3500), and on the title screen left alone up to 4187, the frame before the original's demo.
- *Skipping:* in all three runs the frames match up to the press, and the engine leaves for the title screen on the same frame as the original, the one after the press is read (722, 1502 and 2102).
- *Sound:* two more runs dumped the sound engine's state too. The original starts SEGA's ring and the intro's music on the same frames as the engine, and on the skip at 1500 the intro's music gives way to the title screen's on the next frame, as the engine stops it. The title screen and menu runs dumped it as well: the original plays the select sound and every cursor sound, the held key's repeats included, on the same frames as the engine, and starts the character select's music (song 3) on the frame the engine leaves the menu. The boss music's start and stop come and go within that frame, so the dumps can't show them.

### Title card

The title card (`sub_80550F8`, task `0x2100` at `0x08055425` in the USA ROM) plays when the act starts and every time it starts over. It makes six tasks (`0x2120`), one per piece of the card, and passes them its frame count each frame; they run right after it. Each piece is a row of sprites at background priority 0, so the card is in front of every layer and sprite. Its graphics come from the UI graphics table (see [HUD](#hud)):

| Piece | Task (USA) | Graphics | Sprites | OAM order | Moves |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Zigzag band down the left | `0x080556FD` | Entry 6 (Sonic's; 7–9 for the others), two 32 × 32 glyphs | A grid of 3 × 5, the third column the zigzag edge | 3 | In from x −80, 8 px a frame from the 2nd frame; out the same way from the 217th |
| "SONIC THE HEDGEHOG" | `0x08055765` | Entry 10, the character's 64 tiles, four 32 × 32 glyphs | Four, down the band at x 20 | 2 | Drops in from the top from the 27th frame and stands from the 33rd; out upward from the 217th, by (frames − 215) × 128 / 10 px |
| White bar | `0x08055965` | Entry 16, one 32 × 32 glyph | Eight in a row at y 126 | 1 | In from x 240, 26 px a frame from the 17th frame to x −16; out to the left 26 px a frame, a sprite fewer every 32 px |
| Japanese zone name | `0x08055A6D` | Entry 17, 32 × 8 glyphs | Four at y 114 | 0 | In from x 360, 26 px a frame from the 17th frame to x 112; out the same way |
| "ACT 1" | `0x080558D1` | Entry 15, "ACT" and the act's digit, 8 × 16 glyphs | Six at x 180 | 0 | Up from y 160, 3 px a frame from the 32nd frame to 144; down 2 px a frame from the 217th |
| "NEO GREEN HILL ZONE" | `0x08055AE5` | Entry 19 (the zone's, from the card's tables), seven 32 × 16 glyphs | Nine at y 128 | 0 | In from x 256, 28 px a frame from the 17th frame, then scrolls left 2 px a frame along the bar, a glyph on every 16 frames; out to the left 28 px a frame |

Within OAM order 0 the act number is in front of the Japanese name, and that in front of the zone's name. The band and the character's name use sprite palette 15, where the name's colours are loaded last (the band's are the same). The rest use palette 6: the card loads its own colours there, but by the time it shows, the stage has loaded the HUD font's there, and those are what show.

The Japanese name's 16 tiles are put together as `LoadStageIntroGraphics` loads them (the asm, not the decompiled C, which has tile 49 for the first load): blank tile 73 for the first 12 − n, the zone's n tiles (n = 8 from tile 0 for Neo Green Hill), tiles 8 to 11, and tile 8 again over the first. The card's tables at `0x681274` hold, per level, n (`+0x00`), the zone's first tile (`+0x0E`) and its name's graphics entry − 19 (`+0x20`), and each piece's text: which glyph each sprite shows, as the glyph number + 32 (`+0x1C` for the character's name, `+0x34` on for the rest). The zone's name is `0 1 2 3 4 5 6` three times, and the task starts it at a glyph that moves on every time the row has scrolled 32 px.

**The fade.** The act fades in from black under the card. It uses window 0 over the whole screen with every layer and sprite set as the first target of the brightness decrease, by `bldY` = (32 − level / 256) / 2 sixteenths. The level starts at 96 and, from the card's 22nd frame, rises by 96 a frame until it reaches 8192 (on its 106th frame); the screen is black until then. While the fade runs, and on every frame up to the 106th, the card's sprites are semi-transparent, blended at full weight over what is behind them, so the fade leaves them alone. After that they are normal sprites. When the card ends, the window and the blending are switched off.

**Skipping and the end.** A press of A, B or the pad from the card's 36th frame to its 214th sets it to its 215th frame, sets the fade's step to a tenth of what is left, and steps the fade once at once. The sped-up fade ends partway through a step; once it is done the card stops setting the blend, and the act's own blend shows from the next frame. Everything then slides out, and the card ends on its 226th frame with nothing drawn (see [Dying and the restart](#dying-and-the-restart) for what it holds). The HUD appears the frame after. The card plays no sound.

**What mGBA shows.** mGBA (the reference) darkens its 8-bit colours rather than the GBA's 5-bit ones: red loses `r × bldY / 16` rounded down, green and blue keep `g × (16 − bldY) / 16` rounded down. The renderer does the same, so its frames match mGBA's.

**How it was checked.** mGBA 0.10.5 recorded the act from its first frame with OAM, palette and I/O registers, VRAM and work RAM dumped after each frame, and a screenshot of each frame. One run waits through the card. Ten more press A on the card's 36th, 37th, 51st, 91st, 105th, 106th, 107th, 151st, 215th and 216th frames (the first and the last don't skip). One more runs Sonic into the spikes until he dies, and waits through the restart and the card again.
- *OAM and fade:* the card's sprites, as OAM attributes, and `bldY` match the original's on every frame of the card in all eleven runs where it plays from the act's start.
- *Screenshots:* the engine's frames match mGBA's screenshots pixel for pixel on every frame of the card in all twelve runs, the restart's card included, and on the frames after it to the end of each run (the HUD's first frames and its zero-ring flash included), except where Sonic walks up and down slopes: the renderer draws his walk frames through a canvas rotation, which doesn't match the GBA's rotation hardware pixel for pixel (his position does). Every one of the 188 frames that differ in the restart run is such a frame, with all the differing pixels around him.
- *The rest of the game:* the engine before and after the card was drawn plays 11 input runs (33,000 frames, one of them through a death and the restart, two skipping the card) to exactly the same state on every frame: Sonic, the camera, the objects, the rings, the score, the clocks and every sound.
- These recordings also showed the background's cloud bands one frame ahead of the original: they scroll with the stage clock from before that frame's tick, as the layers' animations do.

### The goal

Only goal entities (kind 0) with `d1` set spawn in single player: act 1 has one that shows (`d0` set, animation `453`) and a column of hidden ones at x 12184. The first one Sonic's centre passes stops the clock and the rings, plays song 135 and spins; from then on it holds right for him, raises the camera 56 px a pixel a frame and keeps him to 4.5 px a frame. 31 frames on, a task waits for him on the ground at 2.25 px a frame or more and puts him in his act-clear run (character state 28). From the goal's 122nd frame, once he runs, the results start. Past x 12848 (the act's loop point) he and the camera go back 384 px while the camera moves, so the same stretch scrolls by.

Two levels have rules of their own. In Ice Mountain act 2 (level 7) a goal counts only while Sonic is also lower than 80 px above it. In Egg Rocket (level 10) it counts only when his body hitbox (slot 0) takes in the goal's point, edges included; it plays no sound, holds none of his controls, leaves the camera and his speed alone and makes no act-clear task. It sets `MOVESTATE_IA_OVERRIDE` every frame instead, so his own movement stops where he is, and the results start on its 122nd frame whatever state he is in.

### Results

`CreateStageResults` plays song 33 (34 after a zone's second act) and switches the music manager off. The ring bonus is 100 per ring; the time bonus goes by the course time: 80000 under 0:30, 50000 under 0:50, 10000 under 1:00, 5000 under 1:30, 4000 under 2:00, 3000 under 3:00, 2000 under 4:00, 1000 under 5:00, 500 under 6:00, else 0. A white band (UI entry 16) slides in and rises to y 42 with "SONIC GOT THROUGH ACT 1" (entries 11 and 34) scrolling on it; the time and ring bonuses (texts at +`0x97` and +`0x8C` of the title card's tables) grow in letter by letter through the rotation hardware from frames 60 and 90. From frame 181 both count down 100 a frame into the score (a life every 50000 points), song 140 on every fourth frame of the stage clock and 141 at the end; the camera then stops, and Sonic stops once off the right of the screen. The texts slide out after `max(bonus) / 100 + 305` frames and the screen fades to black, all but the band; 45 frames into the fade every task ends and all sound stops.

### The next act

The screen keeps its last frame for 16 frames while the original saves and loads (as long as mGBA takes); act 2's music (song 13) starts 2 frames before its first frame. Sonic starts at (104, 684) with no rings, the course clock at 0 and no checkpoint; the score, the lives and the game's random numbers carry on. The first time act 2's title card plays, its white bar starts as the results' band (x −16, y 42) and drops 9 px a frame to y 126. In single player act 2's camera and Sonic stop 768 px short of its right edge (`StageInit_Zone1Act2`). Its boss is the Egg Hammer Tank (enemy kinds 21 and 22, see [The Egg Hammer Tank](#the-egg-hammer-tank)).

**How it was checked.** mGBA 0.10.5 recorded a run from act 1's first frame through the goal, the results and act 2's card into act 2. The engine matches Sonic, the camera, the rings, the score, the lives and the clocks on every frame compared (1762), and its frames match the screenshots pixel for pixel from the goal to 600 frames into act 2. 21 more recordings in act 2 cover the spikes and a death on them, the hiding spikes, both mini loops (one pressing A and B inside), the water bridge three ways and the bushes; the whole game matches all of them on every frame, and seven of them pixel for pixel, the splashes and the leaves included.

### Bosses

What the bosses share is in `bosses_misc.c`, `bosses_egg_mobile.c`, `nuts_and_bolts_task.c` and `screen_shake.c`:

- **The arena.** A boss sets the camera's bounds (`Bosses_SetCamBounds`). The right edge goes to its place at once. The top, bottom and left edges start at the screen's and move 1 px a frame to theirs (`Task_8017244`); a bottom edge that is to end lower than the screen's starts 160 px below it instead. The camera is kept inside them as `CLAMP` does: below the least it is the least, even when that is more than the most. Sonic's sides and top follow the camera's bounds, not the act's.
- **The screen shake** (`CreateScreenShake(p0, p1, p2, p3, flags)`, a task at `0xEFF`, just before the camera's) moves the camera after the camera keeps it inside its bounds. Each frame the offset is `p0` (in 1/256 px) times the sine of an angle that steps by `p2`, or times a random factor (flag `0x10`). `p0` then drops by `p1`. It lasts `p3` frames, or until `p0` runs out when `p3` is −1. Flag `0x40` moves the camera across and `0x80` up and down.
- **The music.** A boss sets `gMusicManagerState.unk1`, which the music manager reads on its next frame. `0x10` plus an index into `sBossSongIndices` (29, 30, 31, 32, 49, 50, 25) starts that song in the stage music's place, `0x30` stops it and brings the stage music back, and after every boss but Egg Wrecker and Egg Drillster the manager then switches itself off for the rest of the act. The Egg Hammer Tank's intro is `0x11` (song 30) and its fight `0x10` (song 29).
- **A beaten boss** throws debris every 8 frames: a piece (animations `695`–`697`) flung up at 6 px a frame at a random angle, falling 40/256 px a frame faster each frame, and an explosion (`611`, flipped either way at random) up to 63 px above it and 32 px either side. Its parts fly off through the rotation hardware at double size (`sub_80168F0`), falling the same way and turning. Then **the Egg Mobile** (`CreatePostBossEggMobile`, animations `693` and `694`) sits 32 px above the boss for 46 frames, rises 1 px a frame to 80 px up, turns round and flies off to the right at 4 px a frame.

### The Egg Hammer Tank

Neo Green Hill's boss (`boss_1_egg_hammer_tank.c`) is two enemies near the end of act 2:

- **Kind 21, the intro.** When its spawn point comes into range, the camera's left edge follows the screen, its right edge stops 64 px past the spawn point, and its top and bottom close in on the arena. Once the spawn point is 176 px into the screen, Sonic stops and loses his controls, and the intro's song plays while Eggman taunts him from the Egg Mobile. The Egg Mobile then turns and flies off to the right at 2 px a frame. Once it is 64 px off the screen, Sonic gets his controls back and the right edge goes back to the act's end.
- **Kind 22, the tank** (animation `607`, its two scripts alternating, Eggman `610`). The camera's target moves 56 px up, its bounds become the 360 px up to 64 px short of the spawn point, and the boss song starts. 121 frames later the tank rolls in from the right at 1 px a frame and turns 64 px past either bound. Its hammer (`609`) swings over it on five arm segments (`608`), 16 px apart and 96 px from a pivot 36 px above the tank. Every time the hammer reaches either end of its swing it hits the ground, playing song 145 and shaking the screen (`0x800, 0x40, 0x100, −1`, up and down). All six parts share rotation matrix 16, so each is drawn with the hammer's matrix, the last one written, but placed by its own.
- **Hits** (`Coll_Player_Boss_1`). While Sonic attacks, the body's box 1 on his body hurts him, and his attack box on its box 0 hits it and reverses both his speeds. Otherwise his body on box 0 hurts him. The hammer hurts him when his own rectangle touches its first frame's box, unless the tank is flashing. Each time the tank or the hammer touches him, Eggman laughs (`610` variant 1), even while Sonic blinks and can't be hurt. A hit plays song 143 and the tank flashes white for 32 frames. The flash is the tank's sprite in OBJ window mode, with every layer brightened to full inside the window (`BLDCNT` `0xBF`, `BLDY` 16, `WINOUT` `0x3F1F`): the background, the back layer and the front layer turn white in the tank's shape, and mGBA 0.10.5 draws every sprite there as it is, Sonic, Eggman, the hammer and the HUD included. After the fifth hit the hammer swings faster with each one. The seventh starts its last phase, in which the hammer swings right round and the tank vaults over it.
- **The eighth hit** beats it: 1000 points and song 144, and the camera holds still. The belt's four pieces (`613`–`616`) fly off for 60 frames, the front ones the way the tank faces. The arms and the hammer fly off for 181 frames with an explosion every 8 frames. The tank (`612`) falls, bouncing until it settles, smoking and throwing debris. 241 frames after the eighth hit the Egg Mobile flies off, the music goes back to the stage's (`0x30`) and the capsule rises from the tank.

**The widescreen view at the Egg Hammer Tank.** The original never shows past the camera's bounds, and a wider view would. From the intro's spawn on, the view is black past them wherever the original screen itself isn't (`cam.arena`): the intro's right edge and the top and bottom it pans to, with the left edge where the screen is, then only the left edge, the top and the bottom once the right edge goes back to the act's end, then the tank's 360 px, and the screen the camera holds still on after the eighth hit. The black and the view slide there at most 4 px a frame, past what the camera itself moves (`viewOf`, `src/engine/camera.js`), and the HUD keeps to the corners of what is shown. The 240 × 160 screen is unchanged.

### The boss capsule

`CreateBossCapsule` (a task at `0x2000`) starts at the beaten boss. It rises small (`578`, 64 × 64) through matrix 16 at a quarter size, growing 8/256 and turning 16 steps a frame, from 8 px a frame up, slowing 16/256 px a frame each frame. Past 224 px up it shows full size (`575` variant 0, with its switch `576`) and drops into the middle of the screen (x 120) as it falls back. Once it is 96 px into the screen and meets the floor (8 px below its centre), it lands there: song 136 and a screen shake (`0x800, 0x40, 0x100, −1`, up and down). A Sonic touching it then is put beside it and knocked 2 px a frame away from the screen's middle and `0x4E0`/256 px a frame up (`0x2A0` in water, which Neo Green Hill doesn't have), in his hurt state and blinking for 120 frames, but keeping his rings.

Shut, the capsule is solid (`Coll_Player_Platform`). A Sonic pushed down by it or below it is put at its bottom left corner. When he lands on the switch, the clock and the rings stop, song 137 plays, his ground speed goes to 0 and his controls are taken. The switch sinks 4 px and the capsule opens (variant 1). He walks to whichever side of the screen he is on until 200 px or 40 px from its left (`sub_801766C`), then stands facing left in his act-clear pose (character state 29, animation `23`). The capsule then shows open (variant 2) and stays solid. Its shell's halves (`577`, the right one mirrored) fly off for 60 frames at 1 px a frame across and 2 px a frame up, turning 4 steps a frame. Then the animals come out (`Task_8016B6C`), four every 4 frames for four lots, the last one without the first kind of each pair, every other lot the other way:

- **Hoppers** (`sub_8016D80`), the zone's first two kinds in `gUnknown_080BB43C` (USA `0x0B8444`, three animations a zone, the third never read): Neo Green Hill's `438` gorilla and `449` kangaroo, Secret Base's `438` gorilla and `447` skunk, Casino Paradise's `439` peacock and `446` deer, Ice Mountain's `443` penguin and `444` rabbit, and Angel Island's `447` skunk and `449` kangaroo. Only those five zones' bosses leave a capsule. Each jumps from 32 px above the capsule at `−4 + (r & 0x1F00) / 4096` px a frame up and `1 + (r & 0xFF) / 256` across, with `r` one of the game's random numbers. It falls 40/256 px a frame faster each frame, jumps again from the floor, and turns back 32 px out either way.
- **Birds** (`sub_8016F44`), the robin (`448`) and the parrot (`442`). Each circles 64 px either side of the capsule at `1 + (r & 7)` steps a frame (the parrot uses `(r >> 8) & 7` of the robin's number), bobbing 16 px up and down. They are drawn at double size and scaled with how near they are, in front of Sonic on the near half and behind him on the far one. Each sinks or rises 1 px a frame to 32 px above where Sonic was when it came out.

The results (song 34) start 60 frames after his pose has played through, or after 240 frames if it never does (`Task_8017400`).

**How it was checked.** mGBA 0.10.5 recorded act 2 from a save state at its start, with the same inputs played into the engine:

- A run through the intro into the fight, with the hammer hitting Sonic, 4400 frames.
- A run that beats the tank in eight hits without being hurt, waits for the capsule, jumps onto its switch and lets the results play out, 6000 frames.
- A run in which the tank's body runs into Sonic, 4400 frames.

The engine matches Sonic and the camera on every frame of all three, up to the results' end, except the camera on the act's first two frames: the save state was made from the course select, which starts act 2 differently from how act 1 leads into it. It also matches the tank's own state in its task's memory (position, swing, speed, timer, hits, flash, fall, animation and frame) on every frame until the task ends, and every rotation-hardware piece of the arms, the hammer and the belt, with matrix 16, through the defeat. Every OAM piece of the capsule, its switch, its shell's halves and the animals matches, with their matrices, on 865 of 878 frames. The other 13 come after the results end: there the original keeps the previous frame's sprites while it goes on to act 3, which isn't built yet, and the engine keeps its last frame. Which songs play, and when, was read in the code and the sound calls, not compared with mGBA's audio. The capsule landing on Sonic was only read in the code: in the recordings it lands beside him. The widescreen view was checked by eye on the same inputs.

The second run also recorded a screenshot of each of its last 2190 frames, from before the first hit to the results' end. The engine's frames, drawn on a software canvas, match them pixel for pixel on 2139 of them: the fight, every hit flash, the defeat, the Egg Mobile, the capsule, the walk-off, the pose and the results. Starting act 2 from the save state leaves three things a frame or a few ticks apart from how act 1 leads into it (the palette animations, the scattered rings' animation and the zero-ring flash), so the check started those at the save state's values. The 51 frames that differ are all where sprites overlap:

- 6 frames from the eighth hit and 44 while the shell's halves fly off: where sprites overlap, the GBA shows the one first in OAM, even over one with a higher priority. In mGBA the tank (OAM priority 2) hides the belt's flying pieces (priority 0), and the capsule and the animals (priority 2) hide the shell's halves (priority 0). The renderer draws sprites by priority first, so it draws those the other way round.
- The frame the shell's halves come out, where the original's right half still shows tiles left in VRAM from before.

Another zone's animals were checked on Ice Mountain act 2, where the capsule lets out penguins and rabbits. mGBA recorded the Egg Spider's defeat (hit count set to 7) and the capsule opening, and a scratch copy of that act's branch with this capsule added was drawn against it frame by frame. Its frames match mGBA's pixel for pixel, Sonic and the clock aside (that copy has no walk-off and no stopped clock), on every frame from the capsule opening to the results' banner: the penguins, the rabbits, the robins and the parrots, with their colours. The only exceptions are the frame the shell's halves come out (the leftover tiles above), a few pixels on 35 frames while they fly, where they overlap the capsule or an animal (the OAM order above), and the snow's known one-frame slip every 12 frames.

### Special stages

A special spring sends Sonic out of the act into a special stage, and when the stage's results end, the act starts again from the spring. Everything between the two runs of the act is a port of the original's code on the same engine as [the game's start](#the-games-start) ([`src/special/`](../src/special/)), at the GBA's 59.73 frames a second: the fall into the stage (`CreateSpecialStageIntro`), the stage (`CreateSpecialStage`, SAT-R's `special_stage/main.c`), its title card and rings counter, the Chaos Emerald's scene (`sub_8068D0C`) and the results (`sub_805D048`). The engine of the stage ([`stage.js`](../src/special/stage.js), [`player.js`](../src/special/player.js), [`objects.js`](../src/special/objects.js)) runs any of the seven stages; what makes one stage different is read from the ROM by [`stages.js`](../src/special/stages.js). Only Special Stage 1 has been played and checked so far.

**The special spring** is interactable kind 102 ([`specialspring.js`](../src/engine/specialspring.js)), at (10912, 488) in Neo Green Hill act 1; levels 3, 4, 6, 7, 9 and 11 have one too. Its d bytes aren't read. It is animation 572: variant 1 waits, with the box (−15, −32, 15, 1), and variant 0 launches (five frames, 12 in all). Landing on it throws Sonic up at 7.5 px a frame and plays the spring's song. Unless the special springs are off, it then holds him and stops the course clock, and puts the camera back each frame where it was when he landed, after the camera's task has moved it and drawn the layers there. When his centre is more than 128 px above the top of the screen the act ends (every task is destroyed) and the fall starts. From `spring.ss` (Sonic falling onto it): he lands on frame 10, the act ends on frame 40, the stage starts on frame 282.

**Coming back** (`sub_805D4F0`, in assembly in the decompilation): the act starts again as after a death but without losing a life (`CreateGameStage`), with Sonic 16 px up and left of the spring, which pushes him out to its side on the first frame (x 10886), and with its title card. The course time, the stage clock, the rings and the last checkpoint passed are what they were when he left; the score, the lives and the random numbers are what the special stage leaves. The special springs are then plain springs (`gPlayer.unk99[1]`) until the act starts over after a death. The Chaos Emeralds won are kept in the browser (`onsoku.emeralds` in local storage), a bit per stage, as the save keeps them (`chaosEmeralds`, `0x0300517C`).

**The data.** All addresses are the USA ROM's file offsets.

| What | Where | How it is found |
| :--- | :--- | :--- |
| `main.c`'s constants: the tunnel's backgrounds, then the tables below | `0x47FEF4` | the background of tilemap 54 at VRAM `0x06008000` / `0x0600E000`, followed by one of tilemap 55 |
| Each level's stage (`gUnknown_08487134`), a byte per level: 0, 0, 1, 1, 2, 2, 3, 4, 5, 5, 6, 6 | constants + `0x140` | |
| Each stage's rings targets, the checkpoint's then the goal's (stage 1: 60 and 120) | constants + `0x14C` | |
| The character's animation by where they are and by the direction held, the push of each direction | + `0x168`, `0x190`, `0x1D0` | |
| The character's boxes against dash pads and bombs, normal (±10) and while fast (±3) | + `0x210`, `0x218` | |
| Each dash pad's animation and speeds (across, up, forward) | + `0x220`, `0x238` | |
| Each kind of object's animation and its tiles' place in VRAM | + `0x298`, `0x2D0` | |
| The 12 rings around a bumper, its 8 sparks, the speeds of the 10 rings a bomb knocks out | + `0x2EC`, `0x31C`, `0x33C` | |
| The stages' palette animations: animation `0x340` + the stage, variants 0 and 1 | | |
| The seven stages' layouts (`gUnknown_087BF8DC`) | `0x7B97F8` | a pointer to constants + `0x364` (stage 1's layout), followed by six more |
| The characters' first animations (`gPlayerCharacterIdleAnims`): 0, 99, 199, 298 | `0x4A6F04` | those values |

A layout is a list of 12-byte entries in order of depth: x and y (s16, px from the tunnel's middle, right and up), the depth (s32, in lines) and the type (u16): 0 a ring, `0x7FFF` the checkpoint, `0xFFFF` the goal (the last entry), any other an object of that kind. Stage 1 has 179 entries: rings, a bumper at depth 15616, the checkpoint at 16896, then a backward dash pad, two diagonal ones, a token (type 10), a ring of eight bombs, a bumper, another diagonal pad, two forward pads, and the goal at 33792.

**The tunnel.** Layer 2 holds the tunnel, the four quarters of one picture (19 × 14 tiles each) around the middle of its 512 × 256 map, the other three flipped across, down and both (`DrawBackground`'s flags `0x9A`, `0x11A`, `0x19A`). Its picture is one of 16 tilemaps, 55 to 70, stepping on by the character's speed (`frame = (frame + speed / 512) & 63`, tilemap 55 + frame / 4). Layer 3 holds the background, tilemap 54. Both move against the character's place: layer 2 by up to 32 px (x / 134 × 32 and y / 94 × 32), layer 3 by an eighth of that.

**The character** ([`player.js`](../src/special/player.js)) flies down the tunnel at 8 lines a frame, or up to 12 holding jump, and the D-pad steers them across it, at most ±134 px across and ±94 px up and down. Attack does a trick (45 frames), at least 12 frames after the last. Their sprite is scaled by a bob (`SIN(phase) / 1024`, the phase stepping 16 a frame) and drawn nearer the middle the further away the bob takes them. Dash pads throw them a fixed way for a while: the backward pad back up the tunnel until they come forward again, the forward pad ahead at 24 lines a frame, the diagonal ones across and ahead, half as fast again, a bomb knocks out up to 10 of their rings and makes them blink for 60 frames, and a trick within 10 frames of touching a bumper (the bumper trick) pulls the bumper's 12 rings to them, stops the music and plays its own jingle (song 43) on the third sound effects player, with the sound effects off until it ends (112 frames); then the music goes on where it stopped, fading in.

**Rings and objects** ([`objects.js`](../src/special/objects.js)). A task makes each object as the character comes within 768 lines of it, and drops it 576 lines behind. Each frame one task draws all the layout's rings, a sprite for the first on screen and copies of its OAM entry for the others. Everything is scaled by how far ahead it is: with `k = ((lines ahead + 768) / 8)⁴ / 408`, it shows at `x × (k / 512 + 56) / 640` from the middle, `k / 1024 + 64` 256ths of its size. Sprites at the same depth share an affine matrix, 16 of them handed out each frame from matrix 1 (matrix 0 is the character's). The kinds:

| Kind | Animation | What it does |
| :--- | :--- | :--- |
| 0 ring, 3 a bumper's ring | 795 | taken by the character's box within 32 lines in front (a bumper's ring within 64); the sound pans left and right by turns |
| 1 sparkle | 796 | where a ring was taken |
| 2 bumper | 797 | 12 rings around it (not to be taken for 15 frames) and 8 sparks (kind 13, 798), song 150; 11 frames later, its message for 60 frames: the bumper trick done or not (animation 812, variants 1 and 2) |
| 4–9 dash pads | 799, variants 0–5 | backward, forward, then four diagonals; song 148 |
| 10 token | 800 | counted (`gUnknown_0300507C`), song 151; each gives a continue at the results |
| 11 bomb | 801 | explodes (kind 12, 802), song 144 |

**How a stage goes** ([`stage.js`](../src/special/stage.js)). The title card shows the checkpoint's target, and the character is held still for the first 240 frames. At the checkpoint they glide back to the middle for 120 frames. With enough rings they cheer (animation 33, COOL! in animation 813), the title card shows the goal's target 151 frames later, and 420 frames after the checkpoint they fly on. Short of it, NOT ENOUGH RINGS (animation 812) shows as they reach it, they fall after the glide (animation 34, AAARGH!), and 420 frames after the checkpoint the stage fades to white over 64 frames, into the results. At the goal it is the same, and with enough rings the stage clear music (song 44) plays, the fade leads to the Chaos Emerald's scene, and the results add the emerald. The results take 616 frames without the emerald and 736 after its scene (474 frames), then the act starts again.

**Start** opens the pause menu in the original (`sub_802D680`); the pause menu isn't built yet, so it does nothing (the act has none either).

**The widescreen view** is black either side of every screen of the special stage, from the fall to the results (`wideBars`). They are made for 240 × 160 alone: a little past the screen's sides the tunnel's quarters end, and the layers show tiles the original never shows there, such as the pink pattern beside the tunnel and red columns beside the fall.

**Original-game quirks kept.** These are in the ROM and the port does the same:

- What isn't set again when a stage starts stays as the last special stage left it: the bob's phase, the character's sprite, and the list of animations that share graphics, which only empties when the 240 frames end and after the checkpoint. On a second visit, objects made before then wouldn't load their own tiles.
- The rings counter starts its blink from whatever its task's memory held: 99, what the fall leaves there, at the start, and 0 after the checkpoint. On its first frame it reads a byte past its four glyphs.
- A bumper's rings read the bumper's message count after the bumper's task has gone (they become plain rings once it reads 0). The port keeps the bumper's state for them; in the original that memory could already belong to another task.
- The rings a bomb knocks out blink from a count that is never set. The port starts it at 0, which is what the recordings show.
- Matrices 16 and 17 (the 16th depth, and the one every sprite past it shares) are never set again once used, so after their first frame they keep the parameters the V-blank leaves. Special Stage 1 never uses more than 15 depths.
- The stage loads its own colours over the title card's, 23 frames after the card loads them at the start and 18 frames after at the checkpoint, so the card shows in the stage's colours from then on.

**How it was checked.** mGBA 0.10.5 ran the USA ROM from `spring.ss`, dumping VRAM, palette RAM, OAM, the work RAM and every line's display registers after each frame. The engine ran each stage from the recorded frame where `CreateSpecialStage` runs, and every frame was compared: the character (every field), the rings taken, the random numbers, the tunnel, the checkpoint, the sound mute flag, the depths and the matrices, the shared-graphics list, VRAM, palette RAM, OAM, the registers of every line, and the picture.

| Run | What it covers | Frames | Differences |
| :--- | :--- | :--- | :--- |
| No keys | the title card, the rings counter, the bumper touched, the checkpoint reached | 2618 | 0 |
| Steering, jump held, tricks | rings taken, tricks, the fast flight | 2618 | 0 |
| Sonic moved by pokes: to the bumper (then the bumper trick), 60 rings before the checkpoint, then to the token, a bomb and a diagonal pad (the backward pad and the forward pads come on their own), and 120 rings before the goal | the bumper trick and its jingle, COOL and the second title card, every kind of object (one of the four diagonal pads), the rings knocked out, the goal won, the fade to the emerald's scene | 2703 | 0 |
| No keys, from the fall to the act again (work RAM, OAM and palette only) | the checkpoint failed, AAARGH!, the fade, the results, the act again on frame 3735 | 3695 | 0 after the first frame* |
| The pokes above, from the fall to the act again (the same) | the emerald's scene and the results with it, the act again on frame 4195 | 4155 | 0 after the first frame* |

\* On the fall's first frame, eight background colours differ: the act's palette animation still ran in that frame in the original, before the spring ended the act, and the check doesn't run the act.

The bumper trick's jingle was timed in mGBA too (a run with the bumper trick forced): the sound effects stay off for 112 frames, as long as the sound engine plays song 43. The card, the counter and the results were also checked on their own (their VRAM, colours, OAM entries, registers and songs). The spring and the return were checked against the act's own recordings: the rise (40 frames), the return after a lost and a won stage, with the rings kept, the plain spring after it, and a death followed by the special spring again.

**Only read in the code, not checked:** Tails, Knuckles and Amy in the special stage (their animations are the character's first animation plus the same numbers); Special Stages 2 to 7, whose data is read the same way; a second visit; the results after the goal's target was reached at the checkpoint (`unk0 == 2` with enough rings); Amy's hammer on the spring and the partner.

### Start positions

A pair of 16-bit values (x, y) per level, in pixels, right after the collision table. Neo Green Hill Zone act 1 starts at (104, 444), act 2 at (104, 684), Ice Mountain Zone act 1 at (104, 180). The four multiplayer stages are (0, 0): they use a separate table of per-player positions.

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
| Spring: falling | 10, variant 2 | Bounce block | 4 (the walk) |
| Push | 12 | Balancing, facing the drop | 13 |
| Balancing, back to the drop | 14 | Hanging on a wall pole | 38 |
| Grinding | 44 | Grinding, steep | 44, variant 1 |
| Jumping off a rail before its end | 45 | | |

**Pushing.** Walking into a wall, or into the side of a solid object or a spring's back, sets the push flag (`moveState` bit `0x20`), and every frame it's set the animation chooser picks the push (character state 14). Rolling into a wall doesn't. Landing, leaving the ground, turning round, jumping, getting hurt, walking off an object and standing still on level ground clear it.

**Balancing.** Each frame Sonic stands still on level ground (the same check that ends the push), he balances when he is at an edge: facing the drop (character state 12), or with his back to it (13).

- On an object (`Player_8044D74`): when his centre is more than a pixel past a side of its box, counting his half-width of 6 px. A side at 0 never counts, so he never balances on a crumbling platform's left side, or on its right side when it is flipped. Once balancing, he keeps on a pixel further in, which only matters when the object moves him.
- On the terrain (`Player_8044E48`): when the floor scan under his centre finds no ground within 8 px, and the scans 8 px to each side find it right under one side and not within 8 px under the other.

Effects: spin dash dust `746` (above a charge of 2.0: `747`), brake dust `748`, insta-shield flash `50` variant 1, grind sparks `749`.

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

Walking, turning, braking and going idle after them, or after crouching or looking up, put Sonic's box back at its standing height (`PLAYERFN_CHANGE_SHIFT_OFFSETS(p, 6, 14)` in `Player_8044F7C`, `Player_8043970` and `Player_8043A2C`), which matters when something uncurled him without it, as Angel Island's waterfalls do.

Other details the engine reproduces: rolling starts from any ground speed, a jump out of a roll has no air control until the insta-shield, the spin dash release frame doesn't move, the crouch and look-up animations play a short release before idling, and the brake dust appears with a random flip, at most 20 at a time. Facing left, the original draws Sonic 1px further right, except in the walk and run frames, which go through the rotation hardware.

### Terrain

Sonic's sensors follow SA1's player code. His position is his centre; the sensors sit 8 px either side of it and `spriteOffsetY` (14 standing, 9 curled) toward the surface. Each sensor scans up to three tiles ahead, or two back when it starts inside solid ground, and reports the distance to the last free pixel.

- **On the ground** the surface angle picks one of four modes (floor, either wall, ceiling). Sonic snaps onto the nearer of his two sensors if it is within `min(|speed| + 3, 11)` px, and otherwise leaves the ground. Ground speed moves him along the angle, and slopes add `sin × 3/32` walking and `sin × 60/256` rolling, a quarter of that uphill. A standing Sonic never slides.
- **Walls and ceilings** drop him below 1.875 px per frame and lock left and right for 30 grounded frames. Up and down still work during the lock, so holding down he rolls as soon as he lands. Up and down do nothing while he balances at an edge.
- **In the air** the direction he moves picks which sensors run. Landing turns his speed into ground speed by the landing angle, and of the two steep ceiling slopes only `0x41`–`0x5F` catches him.
- **Jump-through ledges** are solid on the ground. In the air the floor sensors ignore them while he rises, and the walls and ceiling while his downward speed is under 3.
- **Bounds:** the camera stops at the act's edges. Before it moves each frame, `UpdateCamera` first keeps it a pixel further in from the right and bottom edges than it may end up, so when Sonic is in the air at the bottom of the act, inside the camera's vertical dead zone, it sits a pixel above the edge. Falling out of the bottom kills Sonic (see [Dying and the restart](#dying-and-the-restart)).

The walk and run frames turn with the angle through the rotation hardware (see [Rotation hardware](#rotation-hardware)).

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
| Intro | 1 | 0 | The intro starts; it stops when the intro is skipped, and otherwise ends on its own on the title screen |
| SEGA's ring | 102 | 3 | Sonic Team's logo has closed up |
| Title screen | 2 | 0 | The title screen opens after the logos' fade or the intro is skipped |
| Select | 106 | 2 | Start on the title screen, A on Game Start |
| Menu cursor | 108 | 2 | Up or Down in the main menu, and each repeat |
| Boss fight | 29 | 0 | Started and stopped at once as Game Start leaves the menu, which stops the title's music |
| Neo Green Hill Zone act 1 | 12 | 0 | The act starts, and starts over after a life is lost |
| Neo Green Hill Zone act 2 | 13 | 0 | Act 2 starts, and starts over |
| Goal | 135 | 3 | Sonic passes the goal signpost |
| Act clear | 33 | 0 | The results start (34 after a zone's second act) |
| Results count | 140, 141 | 2, 3 | Every fourth frame of the count, and its end |
| Boss intro | 30 | 0 | The Egg Hammer Tank's intro (music state `0x11`) |
| Boss | 29 | 0 | The Egg Hammer Tank's fight (music state `0x10`) |
| Boss hit | 143 | 1 | The tank is hit |
| Boss beaten | 144 | 3 | The eighth hit |
| Hammer | 145 | 3 | The hammer hits the ground |
| Capsule lands | 136 | 3 | The boss capsule lands |
| Capsule opens | 137 | 3 | Sonic lands on its switch |
| Water bridge | 177 | 2 | The bridge takes Sonic |
| Bush | 178 | 2 | Sonic goes into a bush |
| Secret Base Zone act 1 | 14 | 0 | The same, in Secret Base act 1 |
| Jump | 116 | 2 | A jump from the ground, and the combo's backflip |
| Spin | 109 | 3 | Spin dash start, rolling, the combo's first hit. Each spin dash rev plays it again, raised by the decayed charge (`charge & ~0x7F` in 1/256 semitones). |
| Spin dash release | 110 | 2 | Letting go of down |
| Skid | 115 | 2 | Restarted on every frame Sonic is still at 3.0 or faster after braking |
| Insta-shield | 113 | 2 | |
| Mid-air dash | 112 | 3 | |
| Somersault kick | 121 | 3 | The combo's second hit |
| Slide kick | 111 | 3 | |
| Spring | 170 | 2 | Every launch, every bounce off a bounce block, and every frame the incline ramp throws Sonic |
| Timer warning | 139 | 2 | Every second from 9:40 to 10:00 |
| 1-up | 307 | 0 | Every hundredth ring and the 1-up box, in place of the music; the music then starts over with a fade-in |
| Invincibility | 28 | 0 | In place of the act's music until it runs out; the music then starts over with a fade-in. Speed shoes play the music player at twice the tempo. |
| Rings lost | 118 | 3 | Sonic is hurt and drops his rings |
| Life lost | 119 | 2 | Sonic dies |
| Enemy destroyed | 138 | 2 | |
| Spikes | 171 | 2 | Sonic is hurt by spikes |
| Item box | 167 | 2 | A box breaks |
| Shield | 168 | 2 | Either shield is given |
| Checkpoint | 169 | 2 | A checkpoint starts to spin, from its animation's script |
| Booster | 172 | 2 | Every frame a booster sends Sonic on, even when he is already faster |
| Crumbling platform | 173 | 2 | A crumbling platform starts to fall apart |
| Wall pole | 175 | 2 | A wall pole catches Sonic |
| Grinding | 114 | 2 | A grind rail's start takes Sonic; it loops until he jumps or is thrown off, or another sound takes player 2 |
| Trampoline | 176 | 2 | Every bounce |
| Explosion | 144 | 3 | A rolling boulder breaks on the screen |
| Skating stone | 198 | 2 | A skating stone lands after a drop; stopped when it breaks |
| Skating stone breaks | 143 | 1 | |
| Whirlwind | 200 | 2 | A whirlwind first lifts Sonic; it fades out when he isn't spinning |
| Waterfall | 201 | 2 | An Angel Island waterfall first holds Sonic; it fades out when he leaves |
| Lift | 181 | 2 | A lift catches Sonic, until it reaches the top |
| Bowl | 206, 207, 208 | 2 | A bowl catches Sonic, then 56 and 112 frames later |
| Run wheel | 212, 213, 214 | 2 | Every 25, 16 or 8 frames on a run wheel, by its speed |
| Ring | 117 | 1 or 2, then 3 | Every ring with a sparkle: first on player 2 panned left (−64) when the new count is odd, or player 1 panned right (+64) when it is even, at half volume (128); then again on its own player 3, centred, from the sparkle's script |
| Rings from a box | 117 | 3 | The ring prizes, once for the lot |
| Casino Paradise Zone act 1 | 16 | 0 | Act 1 starts, and starts over after a life is lost |
| Bumper | 183 | 2 | A hexagon or round bumper throws Sonic, and a flipper flips or bats him |
| Triangle bumper | 184 | 2 | A small triangle or right-angled bumper throws Sonic |
| Party balloon | 189 | 2 | A balloon pops |
| Ice Mountain Zone act 1 | 18 | 0 | Act 1 starts, and starts over after a life is lost; also when the drowning music ends |
| Drowning | 27 | 0 | Sonic has been under water for 20 seconds, in place of the act's music, until he comes out or breathes |
| Splash | 190 | 2 | Sonic goes into the water or comes out, at most once every 10 frames |
| Air bubble | 191 | 2 | A breath from a big air bubble |
| Drowned | 192 | 2 | Sonic drowns, in place of song 119 |
| Hook rail | 180 | 2 | While a hook rail carries Sonic |
| Block of ice | 193 | 2 | A block of ice breaks, after the item box's 138 |
| Skating stone | 198 | 2 | A skating stone slides on after landing |
| Skating stone breaks | 143 | 1 | A skating stone breaks |
| Ice Mountain Zone act 2 | 19 | 0 | Act 2 starts, and starts over after a life is lost |
| Boss | 29 | 0 | Two seconds after the Egg Spider spawns (the music manager's state `0x10`), in place of the act's music, until it is beaten and Eggman escapes (`0x30`) |
| Boss hit | 143 | 1 | Sonic hits the Egg Spider |
| Boss beaten | 144 | 3 | The Egg Spider's eighth hit, and every explosion it throws after it |
| Icicle | 145 | 3 | Every icicle the Egg Spider drops |
| Lava spurt | 182 | 2 | An underwater lava platform's lava spurts |
| Angel Island Zone act 1 | 20 | 0 | The same, in Angel Island act 1 |

Sounds on the same player cut each other off, as in the original. There is no landing sound in SA1. Ice Mountain act 2's sounds and the boss music start where the decompiled code starts them; they weren't checked against mGBA's music players.

**How it was checked.** The reference is mGBA 0.10.5, recording the tested ROM headlessly and dumping the engine's whole EWRAM state, the sound registers and the mixing buffer after every frame, through the act's first minute of music and a run of every move above:

- *One frame at a time:* the port loads the dumped state, runs one frame and is compared field by field: every track, channel, player, register and mixed byte. 3657 of 3659 music frames and 899 of 919 sound-effect frames match exactly. The others are the frames where the game itself starts a song or changes its pitch or volume, which happens outside the engine.
- *Free running:* loaded once and then left alone, the port stays identical for all 3593 frames of the act's music.
- *Clean start:* a fresh engine that only calls the song start where the game did stays identical too, which is how the browser starts the act.
- *The final output:* the DirectSound part of the port's audio lines up with mGBA's recorded output. The PSG part matches mGBA's in pitch, level and envelope (median spectrum correlation 0.98), but not sample for sample: a Game Boy channel's waveform phase depends on the exact CPU cycle the engine writes its registers, which the port does not model.

The port mixes at the GBA's 65536 Hz, averages that down to the browser's output rate, removes the DC offset the unipolar PSG channels add, and plays at half of the GBA's full scale. The game itself still steps at 60 Hz while the sound engine keeps the GBA's 59.7275 frames per second, so a sound starts within one frame of the move that plays it.

## Secret Base Zone act 1

Level 2 in the ROM's per-level tables (`?level=2`): tilemap entries 6, 7 and 8, collision entry 2, start (104, 126). It is 10368 × 1536 px, 108 × 16 metatiles. Its stage init, `StageInit_Zone2Act1` (`0x0803DD45` in the USA ROM), makes three palette loader tasks (`0x2000`), for animations `819`, `845` and `849` in that order, and starts song 14. Picked from the course select, the HUD's zero-ring flash counter starts at 56 (what the memory at `0x03002794` holds when the HUD is made), not at the 1 the title card leaves in Neo Green Hill.

USA addresses used to check it: `gCurrentLevel` `0x0300514C`, `gPlayer` `0x03005A20` (its `moveState` at `+0x10`), the camera's x and y `0x030059D0` and `0x030059D2`, `gStageTime` `0x03005120`, `gFlags` `0x03001100`, `gObjPalette` `0x03001920`.

### Background

`StageBgUpdate_Zone2Act1` sets BG3's scroll once a frame. Outside, while the camera is left of x 1488, the whole map scrolls a 78th of the camera's way across and shows its bottom 160 rows (the map repeats every 512). From x 1488 on it is the inside (`StageBgUpdate_Zone2_Interior`), set line by line through the HBlank table: the wall, rows 0–63 of the map, scrolls a quarter of the camera's way and repeats every 64 lines; three bars of 16 lines (rows 64–79) scroll half its way, and a bigger one of 24 lines (rows 80–103) two thirds, each 256 lines from the next of its kind, the later ones covering the earlier ones ([`src/engine/backgrounds.js`](../src/engine/backgrounds.js)).

### Spotlights

The act starts dark, with two beams of light sweeping across the screen (`spot_lights_manager.c`, `spot_light_beam_task.c`; the SA1 beam task from its asm). Windows 0 and 1, whose left and right edges the beams set line by line, keep out the brightness decrease that darkens everything else but the backdrop. The darkness eases from 16 sixteenths to 8, a quarter a frame. Once Sonic is past x 1368 it eases off to nothing; past x 1488, or when he dies, the spotlights go at once. They are made after the stage init only while his checkpoint is at or before x 1368, and while they are there the title card doesn't fade the screen in.

The edges are kept in a table with 4 bytes for each screen line (WIN0H's right and left edges, then WIN1H's), which the HBlank DMA copies into the registers. A frame writes one of two such tables (`gBgOffsetsBuffer`) while the other is shown. A beam leaves its half of the lines, and WIN0V or WIN1V, as they were on the frames it doesn't draw.

**An original-game bug.** The beams write past their table: line 160 of the second table lands just past `gBgOffsetsBuffer`'s end, in `gObjPalette[1]`, Sonic's colour 1 (his outline). `animCmd_GetPalette` sets bit `0x2` of `gFlags`, and the VBlank copies `gObjPalette` to the screen's sprite palette only on frames where some sprite's script ran a palette command, so his outline takes the beam's edge values on those frames (odd frames 81–143 and from 531 on in a run from the start), until his own palette commands put `0x5AD6` back. The engine does the same.

### Sprite palette rows and priorities

`animCmd_GetPalette` writes `gObjPalette`, so every sprite drawn from a palette row shows the colours the last palette command left in it, whichever sprite ran it. The extractor records which palette each frame's commands load into which row, and renders an alternative frame for each other palette a row can hold; the renderer draws the one that matches what the row holds that frame. Command `-11` (`SetSpritePriority`) sets a sprite's priority from its script; a sprite at priority 3 is drawn behind the back layer. In Neo Green Hill this recolours a boulder (palette 35) after an enemy's dust cloud (palette 20), which shares row 9.

### Secret Base's enemies

| Kind | Enemy | Count | Animations | What it does |
| ---: | :--- | ---: | :--- | :--- |
| 5 | Senbon | 3 | `411` | A pincushion that walks 0.625 px a frame between (d0 + 1) × 8 and (d0 + d2 − 1) × 8 px right of its spawn point, turning at either end. Away from the ends, when Sonic is up to 80 px ahead of it, it stops and puts out its spikes for 60 frames, then walks on and doesn't do it again for 120 frames spent walking between the ends. With its spikes out it can't be destroyed, and touching their box hurts Sonic. |
| 6 | Tentou | 2 | `412`, shots `410` | A ladybird that flies a loop round its spawn point for 64 frames, d2 tiles across and d3 up, then hovers for up to 60 frames. If Sonic comes within 80 px while it hovers, it fires two shots, one each way, on its 15th frame of firing, and flies on after 33. Its sprite is a left half, drawn again mirrored. |
| 7 | Fireball | 1 | `413`, sparks `414` | A spawner that, on every frame of the stage clock that is a multiple of 240, throws a fireball up from 24 px below it at 6 px a frame, slowing by a quarter of a pixel a frame. At the top it bursts into two sparks that fly off either way and fall, and the fireball shrinks as it falls back, until it is gone at 2 px a frame. The fireball and the sparks can't be destroyed; touching them hurts Sonic. |
| 15 | Mole | 5 | `434` | A mole in a mound that pops up every 60 frames, facing Sonic, and ducks back after 60 more. Only while it is up can it be destroyed or hurt him. Destroyed, it sinks into its mound for good. |

Senbon's and Tentou's main tasks follow the asm (`Task_SenbonInit`, `Task_TentouMain`, `sub_8074928`), which the decompilation's C doesn't match. Tentou keeps its loop's offsets in 1/256 px but places its sprite by how far they moved in the frame (a 32nd of it across and a 16th up), and while hovering by minus the last offset across; up, it takes the frame's move modulo 64 to draw it and leaves it unmoved on a remainder of 63, but tests its box with the whole move. The engine does the same.

**The act's copy of its entities.** The entities are decompressed into EWRAM when the stage starts, and a task that changes its entity's data changes that copy until the act starts over. A destroyed Mole clears its `d1`, so it doesn't come up again even after it is spawned anew. The engine keeps those changed bytes with the entity's slot and clears them on the restart.

The zone's freed animals are the mole (`441`), the skunk (`447`, hops) and the robin (`448`, flies).

### Secret Base's objects

| Kind | Object | Count | What it does |
| ---: | :--- | ---: | :--- |
| 5 | Hiding spikes | 3 | Come and go with the stage clock, 128 frames a turn (see [`src/engine/hidingspikes.js`](../src/engine/hidingspikes.js)) |
| 66 | Marble track pipe | 1 | Carries Sonic through its track at a smaller size through the rotation hardware ([`src/engine/marbletrack.js`](../src/engine/marbletrack.js)) |
| 69 | Conveyor belt | 2 | A box d2 by d3 tiles from its spawn point. On every frame Sonic's position is in it and he is on the ground, it carries him 0.625 px, right when d0 is set and left otherwise, then pushes him out of any wall 8 px ahead of or behind his centre (`Task_ConveyorBeltMvt`). Ice Mountain uses the same kind for its snow. |
| 70 | Visibility toggle | 2 | On every frame Sonic's position is in its box (d2 by d3 tiles), it makes him invisible when d0 is set (`MOVESTATE_100000`) and visible again otherwise; the act hides him inside its pipe this way. Dead, he is made visible. Its task's priority is `0x2000` + d3. |
| 75 | Hook rail | 6 | A hook that takes Sonic when his body touches it and slides down its rail, picking up speed (song 180 while it carries him); d0 picks the rail: 1 runs 480 px down to the right, 2 to the left, 0 climbs left, drops onto a lower rail and comes back ([`src/engine/hookrails.js`](../src/engine/hookrails.js)) |
| 76 | Swinging hook | 3 | A hook on a chain of three links swinging on the stage clock; jump throws Sonic off ([`src/engine/swinginghooks.js`](../src/engine/swinginghooks.js)) |
| 77 | Security gate | 4 | A shutter that drops shut behind Sonic once his position is in a zone d2 tiles wide and d3 tall (ending 10 px right of the gate with d0 0, starting there otherwise): 6 px a frame for 8 frames, then solid from its sides (`Coll_Player_Gate` without its attack test) until it leaves the camera's range |
| 78 | Swing rope | 3 | [`src/engine/swingropes.js`](../src/engine/swingropes.js) |
| 80 | Crane claw | 1 | Song 181 while it lifts Sonic ([`src/engine/craneclaws.js`](../src/engine/craneclaws.js)) |
| 96 | Pipe curler | 1 | At the mouth of the pipe: on every frame Sonic's position is within 8 px of its spawn point, it curls him into a ball (character state 4) |
| 105 | Lava | 2 | An invisible box that hurts Sonic, or kills him with d0 set ([`src/engine/lava.js`](../src/engine/lava.js)) |
| 106, 110, 111 | Tubes | 12 | Pipe entrances, tracks and exits that carry Sonic ([`src/engine/pipes.js`](../src/engine/pipes.js)) |

The zone has its own look for some objects every zone has, picked by level: its thin platforms (`506`, `sPlatformThinAnims`), crumbling platforms (`502`, `sPlatformCrumblingAnims`), trampolines (`505`) and bounce blocks (`499`, `sBounceBlockAnims`).

**Sonic's animation carries on.** The original restarts a sprite's script only when its animation or variant changes. Sonic's walk and the tumble after a bounce block are both animation 4, variant 0, so walking onto a bounce block carries his walk cycle on.

**Another original-game bug.** On a swinging hook's first frame its task calls `TransformSprite` before `UpdateSpriteAnimation` has set the sprite's frame size, so the transform reads the size through whatever pointer the task's memory held and places the hook somewhere else for that one frame. What that memory holds depends on earlier tasks, so the engine draws the hook where it belongs.

### How Secret Base act 1 was checked

mGBA 0.10.5 recorded the act from a savestate made just after the course select creates it, with IWRAM and the screen dumped after every frame; the engine plays the same keys from the same frame.

- *Start to the goal:* one run of 4,600 frames (1:14 on the act's clock, 89 rings) goes from the start, through the spotlights, the hook rails, the pipe, the conveyor belts, the swinging hooks, the crane claw and every checkpoint, to past the goal. Sonic's position matches the original's to the 1/256 px on every frame. Every frame matches pixel for pixel until the goal comes on screen, apart from a few pixels at the spotlights' beam edges and at the screen's left column, where mGBA draws a window's edge differently from its registers (31 frames, all before x 1488).
- *Each object and enemy:* fourteen shorter runs, each starting with Sonic moved to it, match on every frame, pixels included: the Moles (one hit), the Tentous, the Senbons, the fireball, the conveyor belts, the bounce blocks, the trampolines, the crumbling and thin platforms, the pipe with its curler and visibility toggles, and the tubes. The other differences are a frame at a restart after a death (the whole screen, the frame the act is loaded again) and the swinging hook's first frame (the bug above).
- *Neo Green Hill act 1:* plays to the same state and the same picture on every frame of a 3,000-frame run before and after.
- *Read in the code only:* the goal (kind 0) and the end of the act, which [#69](https://github.com/NahuelGenchi/onsoku-advance/issues/69) builds; the hiding spikes, the lava and the tubes beyond the places the runs above pass through, which other acts check; and a death in the lava.

## Secret Base Zone act 2

Level 3, `?level=3` in the address. Its stage init, `StageInit_Zone2Act2` (`0x0803DD89` in the USA ROM), makes act 1's three palette animations (819, 845 and 849) and starts song 15. `StageBgUpdate_Zone2Act2` scrolls the background the way act 1's does on the inside, for the whole act. The act uses act 1's platforms, trampoline and bounce block (the tables that pick them by level have the same entries for both acts). Picked from the course select, the HUD's zero-ring flash counter holds 64 when its task is made (`0x03002854` in mGBA), so the HUD's first frame shows no flash.

**Steam exhausts** (kind 79, `steam_exhaust.c`). A vent in the floor with a lid on it, both solid. Whenever the stage clock is a multiple of 160, the vent blows. The lid goes up at 5 px a frame and slows by 37/256 px a frame every frame. When it lands it bounces twice, each time at 2/5 of the speed it landed with. The steam hurts Sonic from its 7th frame to its 53rd, in a box 26 px tall above the vent. He rides the rising lid for as long as he stays on it. Once the steam has ended, the task steps the vent's animation twice a frame and switches it back to the lid when the first step says the script has ended. That step keeps saying so on every later frame until the animation is restarted, so the switch shows a frame after the end.

**Swinging hooks** (kind 76, `swinging_hook.c`). A hook on a chain of three links, hanging from an anchor and swinging to and fro on the stage clock. A hook with `d0` set swings half a cycle behind. It catches Sonic when his centre comes within 16 px of it, and he hangs from it as it swings (character state 38, Sonic's animation 43). Jump throws him up, curled, at 5 px a frame, and at 2 px a frame left or right if one is held. The hook doesn't catch him again for 20 frames. Its sprite goes through the rotation hardware, and the hook puts the running matrix count (`gOamMatrixIndex`) in its priority bits. So the first hook drawn in a frame has priority 0 and the next one priority 1, both in front of the layers.

**Swing ropes** (kind 78, `swing_rope.c`). A rope that is part of the act's layers. Sonic grabs it when his centre enters its box: `d0`, `d1` are its top left corner in tiles from the entity, and `d2` × `d3` its size. He swings round it (character state 34, animation 40 variant 1) as he slides along it to the right. He starts at half the ground speed he came with. He gains 1/16 px a frame every frame, up to 0.90625, and another 1/16 while right is held; left takes that back off, but not below 0.90625. The limit is 9 px a frame. Jump throws him off at 6.75 px a frame: up or down if one is held, otherwise the way his swing is going. The rope doesn't take him again for 20 frames. The swing's animation sets his sprite's priority, so for part of each turn he is behind both layers.

**Crane claws** (kind 80, `crane_claw_and_lift.c`). A claw hanging 48 px down on its cable from a trolley. Sonic's body touching its box catches him:
1. The claw closes and lifts him 48 px over 30 frames.
2. It carries him right at 2 px a frame, with song 181 playing, until it has gone more than `d2` tiles.
3. It opens to drop him.
4. 30 frames later it goes back left at the same speed, then down again.

**The Egg Press** (enemy kind 23, `boss_2_egg_press.c`, with `bosses_misc.c`). The fight goes like this:
- **The arena.** When the boss's spawn point comes into range, the camera's bounds close in on an arena 300 px wide that ends at the spawn point, and the boss song (29) starts.
- **The drop.** 121 frames later the press drops in 60 px left of its spawn point and lands (song 145), and Eggman laughs.
- **The hops.** The press hops at Sonic over and over, each hop taking 72 frames to reach where he stood. After its fourth hit, every fourth jump is a leap off the top of the screen. The leap follows Sonic, lands on him, shakes the screen (`CreateScreenShake(0x800, 0x40, 0x100, -1, 0x80)`), and hurts him unless he is in the air.
- **Hitting it.** A jump into the top of the press hits it (song 143). It flashes white and can't be hit again for 32 frames, and each hit makes it faster.
- **The defeat.** The eighth hit beats it (song 144). The spring and the base fly off, and the press drops to the floor and bounces. For about 4 seconds it throws debris and explosions every 8 frames. The camera stops across where it is, so a widescreen view's black closes in on that screen from the arena's sides (`cam.arena`).
- **The escape.** Eggman flies off in the Egg Mobile and the act's music comes back.

What comes next, the capsule and the end of the act, isn't built here; the game calls `world.bossDefeated(x, y)` for it. Eggman is placed from the press's shown frame (its first OAM entry), the way the original reads it.

**How it was checked.**
- *The recordings.* mGBA 0.10.5 recorded the act from the course select, through a savestate made after it: work RAM, OAM, the palettes and a screenshot after every frame. Pokes put Sonic at each object; the pokes and the keys are the same in the engine. There are nine runs:
  - the act's start, run right;
  - the steam exhausts, twice: the lid, and the steam;
  - the swinging hooks;
  - the swing ropes, twice: the catch, the slide and the throw up; then both directions held, the throws down and with the swing, and a grab from walking;
  - the crane claw: the catch, the lift, the carry and the drop;
  - the Egg Press, twice: the arena, and the whole fight to Eggman's escape.
- *The state.* Sonic, the camera and the clocks match on every frame of every run (about 13,000 frames). The exception is 15 frames of camera y at the end of the boss run: that is the capsule's landing shake, which isn't built yet.
- *The screen.* The engine's frames match mGBA's pixel for pixel, except in three places:
  - the HUD's first frame, where the original draws a tile from past its four flash glyphs (#56);
  - objects and enemies whose kinds aren't built yet (the hiding spikes, Secret Base's enemies);
  - stale tiles at the screen's left edge while the camera catches up after a poke.
- *Unchanged elsewhere.* Neo Green Hill act 1 is unchanged over 1000 frames, in state and on screen. There, the live palette rows fix 52 differing pixels: an enemy's dust cloud recolouring a boulder. Secret Base act 1 draws exactly as it does without this work over a 900-frame run.
- *Only read in the code:* the hook's first frame. `TransformSprite` runs before the first `UpdateSpriteAnimation`, so the first call reads the frame's size through a null pointer. The hook is made off screen, so that frame doesn't show in the recordings.

## Casino Paradise Zone act 1

Casino Paradise is zone 3 in the original's numbering (2 counting from 0, as `levels.js` does). Act 1 is level 4 in the ROM's per-level tables and starts with `?level=4`. It is 7104 × 2592 px, Sonic starts at (104, 180), and it has 351 rings, 15 item boxes, 19 enemies and 379 interactables. `StageInit_Zone3Act1` (`0x0803D854` in the USA ROM) makes the same eleven palette animations as act 2, in the same order, then starts the act's music, song 16. The background, its scroll and the fireworks in its sky are act 2's ([#76](https://github.com/NahuelGenchi/onsoku-advance/issues/76)). The thin and falling platforms take the zone's look (`495`), and the wall poles are red flags lying on their side (`470`: variant 0 at rest, 1 swinging). The item boxes are three 1-ups, a magnetic shield, four invincibility, three speed shoes, three random rings and one 10 rings.

| Kind | Object | Act 1 | Module |
| ---: | :--- | ---: | :--- |
| 0 | Stage goal | 6 | not built: the act's end belongs to [#69](https://github.com/NahuelGenchi/onsoku-advance/issues/69) |
| 1, 2 | Spikes up, down | 16, 11 | `spikes.js` |
| 5, 6 | Spikes that hide, up and down | 3, 1 | `hidingspikes.js` |
| 7 | Checkpoint | 7 | `checkpoints.js` |
| 8, 10–13 | Springs | 13 | `springs.js` |
| 21, 22 | Thin and falling platforms | 5, 2 | `platforms.js` |
| 42 | Red flag | 14 | `redflags.js` |
| 44, 45 | Wall poles | 6, 8 | `wallpoles.js` |
| 48–53 | Bumpers: hexagon, round, circling, small triangles lying and standing, right-angled | 6, 59, 8, 6, 10, 9 | `bumpers.js` |
| 54, 56, 73 | Flippers: lying, standing, small blue | 12, 4, 1 | `flippers.js` |
| 55 | Square platform | 9 | `squareplatforms.js` |
| 57 | Small Barrel of Doom | 1 | `barrels.js` |
| 58 | SEGA SONIC letters | 9 | `segaletters.js` |
| 59 | Party balloon | 25 | `balloons.js` |
| 60 | Ship swing | 2 | `shipswing.js` |
| 61 | Spiked platform | 7 | `spikedplatforms.js` |
| 62 | Bowl | 2 | `bowls.js` |
| 63, 64 | Panel gates | 2, 4 | `panelgates.js` |
| 65–68 | Marble track: direction points, drop, entrance, exit | 13, 1, 4, 4 | `marbletrack.js` |
| 69 | Conveyor belt | 18 | `conveyors.js` |
| 70 | Box that hides Sonic | 4 | `visibility.js` |
| 71 | Wall bumper | 10 | `bumpers.js` |
| 72 | Teleport orb | 3 | `teleportorbs.js` |
| 74 | Carousel | 2 | `carousel.js` |
| 102 | Special spring | 1 | not built: a stand-in until the special stages come |
| 106 | Tube track | 49 | `pipes.js` |
| 107 | Tube junction | 2 | `junctions.js` |

The kinds that other zones' acts share came from their branches as they are: spikes down (#71), the hiding spikes (#77), the square platform (#72), the conveyor belts (#79), the tube tracks (#74), and the red flags, ship swings, spiked platforms, bowls, panel gates and carousels (#76). They are described with those zones. Act 1's own:

- **Party balloon** (`party_balloon.c`, animations `479` blue, `480` red, `481` yellow by `d0`, each with its burst as variant 1): touching one pops it with song 189 and throws Sonic up at 6 px a frame, as a spring does. The burst shows for 33 frames; then it goes, and comes back when the camera next uncovers its place.
- **Marble tracks** (`marble_track.c`): the pinball tubes Sonic is carried through, curled up and shrunk through the rotation hardware (character state 32, animation 39). A track is a chain of objects that hand him on by a step number kept on the player (`unk99[0]`, 0x7F off any track, which the tube tracks also use). Each takes him from a lower step, or from no track when its own step is 0, and plays song 170. The entrance (67, `488`) takes him when he lands on it, with his step set to its `d3`: he falls with gravity, moved `d1` px across over `d0` frames, until `d0` frames have gone, he has dropped more than `d2` px or a later step has him, while his sprite grows from 0xB0 to full size. Reaching within 8 px across and 10 down of a direction point (65) moves him `d0` × 8 px across and `d1` × 8 down over `d2` frames, as step `d3`. The drop (66) lets him fall within 12 px of it, as step `d1`, for at most `d2` × 3 frames or `d0` × 8 px. The exit (68, `488`), a cup 24 px wide, throws him up at 5 px a frame, shrinking, and lets him go curled up at full size as he starts to fall, unable to steer until he lands; otherwise it is solid. The entrance runs at priority `0x1900` plus its step, the points and the drop at `0x2000`, and the exit at `0x2100`, so a chain's objects run in its order.
- **Bumpers** (`bumpers.c`; `484` hexagon, `485` round, `476` and `477` small triangles, `475` right-angled): touching one throws Sonic off it curled up, in the air, at a speed that depends on where he touched it, and shakes it for 9 frames. It throws him again on every frame he still touches it. The hexagon (48) and the round bumper (49) pick the speed by the angle from their centre to his, and can sway `d2` or `d3` × 8 px each way, a sway every 256 frames. The round one throws him straight away from it at 1092/256 px a frame and gives 10 points. The circling one (50) goes round its spot on a circle of the larger of `d2` and `d3` × 8 px, and throws him as the round one does. The small triangles (51 lying, 52 standing) throw him off whichever side he touches; the right-angled one (53) only off its slanted side. Hexagons and round bumpers play song 183, triangles 184.
- **Wall bumper** (71) is part of the layers: while Sonic's centre is in its area, `d2` × 8 px across and `d3` × 8 down, it throws him every frame at 5 px a frame across (right when `d0` is odd) and 7 up, or 6 down when `d0` is 3 or more, without curling him up.
- **Flippers** (`flippers.c` and `flipper_small_blue.c`; `478`, and `522` for the small blue one): coming down onto a lying flipper (54), Sonic is held curled up on its slope and rolls out at 0.3125 px a frame, his controls taken. A jump press flips him off at −1984/256 px a frame up less 1/16 px for each pixel out from the pivot, and 1/8 px across for each. Rolling off its end lets him go at 1 px a frame. The standing flipper (56) is solid, and walking or rolling into it below its pivot bats him back at 10 px a frame. Both play song 183 and their flip for 8 frames. The small blue one (73) is a step of a marble track: it throws him up at 12.5625 px a frame for `d0` frames, then lets him go.
- **SEGA SONIC letters** (`sega_sonic_letters.c`, `492`, four variants a letter): letters Sonic can stand on, which light up and go dark on a cycle that runs with the stage clock, 500, 400 or 300 frames long by `d1`, delayed by `d2` frames. With h = (length − 161) / 2, a letter flickers on at frame 0 of its cycle, shines from 58, blinks out from 58 + h, and is dark and not solid from length − h to the end. Touching a dark letter lets Sonic drop off whatever he stands on.
- **Teleport orb** (`teleport_orb.c`): drawn in the layers. When Sonic's centre comes within 12 px of it, it puts him at (`d0` × 256 + `d2`, `d1` × 256 + `d3`), curled up and held still, with song 170, and lets him go in the air once the camera has caught up with him: on the first frame it hasn't moved, with him inside the screen. The camera's speeds (`unk8` and `unkC`) take part in that.
- **Tube junction** (107, `107.c`): within 10 px of it, Sonic is caught curled up and still, with song 170. From the next frame he circles it, 4 px out and a turn every 32 frames, until a fresh press of a way out sends him off from its middle at 9 px a frame. `d0` picks the ways out: 0 right or down, 1 down and right or down and left, 2 right, 3 down. After sending him off it leaves him alone for 20 frames.
- **Small Barrel of Doom** (57, `Task_BarrelOfDoomMini` in `platform_square.c`, `493`): a barrel that bobs on a spring. Sonic lands on its top from any side while he isn't rising, and landing pushes it down by 6/10 of his falling speed. Off its place it is pulled back at 48/256 px a frame per frame, its speed loses 1% a frame, and it rests when that speed is under 48/256 px a frame within 3 px of its place. A jump from it throws him off at half its speed less 4 px a frame up.
- **Box that hides Sonic** (70, `toggle_player_visibility.c`): along the tubes. While his centre is inside one, `d2` × 8 px across and `d3` × 8 down, it hides him when `d0` is set and shows him again when it is 0 (`MOVESTATE_100000`). Its task runs at priority `0x2000` plus `d3`. A dead Sonic is always drawn, and the box and the tube tracks show him again.

Kept from the original (issue [#56](https://github.com/NahuelGenchi/onsoku-advance/issues/56)):

- A party balloon restarts the partner's animation, not Sonic's (`Task_PartyBalloon` swaps the two branches), so his rise keeps the animation he had.
- The circling bumper works out its throw from 8 times its own offset, so it doesn't throw Sonic straight away from it.
- A bumper's shake reads two cosines past the sine table's end, where the ROM has 1 and 482, so its last two frames don't move it across.
- The small blue flipper switches to the lying flipper's art 24 frames after it throws Sonic, until it next spawns. Read in the code only: in the recording it is off screen by then.

**How it was checked.** mGBA 0.10.5 with the USA ROM, started on level 4 through the course select with `gCurrentLevel` (`0x0300514C`) set, Sonic placed by memory writes. The engine was run on the same inputs. Sonic's position, speeds, state, rings and score matched on every frame of every run. In the 21 runs recorded with video, every screen matched pixel for pixel, from the act's first frame in the first run and from the camera catching up with the placed Sonic in the others:

| What | Recordings |
| :--- | :--- |
| Act 1 from its start | 600 frames: the title card, standing, then running: the layers, the background and its fireworks |
| Party balloon | three pops and a respawn, the pop's song |
| Marble tracks | two chains: entrance, three points, exit; entrance, points, the drop, two points, exit |
| Bumpers | every kind and both flips of the triangles, nine runs of 800 to 1000 frames, and a wall bumper |
| Flippers | the lying flipper's catch, roll and flip, the standing one's bat, and a small blue one in a marble track |
| SEGA SONIC letters | 1000 frames over a row of letters through their cycles |
| Teleport orb and panel gate | 800 frames |
| Tube junctions | both ways out of one junction, 700 frames each |
| Small Barrel of Doom | landing, bobbing, a jump off it, and down with jump on it |
| Tube tracks, the boxes that hide Sonic, a panel gate | 1100 frames through a run of tubes |
| Square platform, conveyor belt, wall pole | one run each, 800 to 1100 frames |
| Hanabii, Slot, the freed animals | see *Casino Paradise's enemies* |

Read in the code only: the bumpers' sway, the teleport orb's death branch and the tube junctions' other ways out (`d0` 1 to 3). On act 1 the panel gates and the carousels were only seen, not used; [#76](https://github.com/NahuelGenchi/onsoku-advance/issues/76) checked using them on act 2.

### Casino Paradise's enemies

| Kind | Enemy | Act 1 | Animations | What it does |
| ---: | :--- | ---: | :--- | :--- |
| 8 | Hanabii | 4 | `415`: walking 0, launching 1; shot `419`, firework `416` | Walks 0.625 px a frame between (`d0` + 1) × 8 and (`d0` + `d2`) × 8 px right of its spawn point, following the floor, and turns at either end. Away from the ends, with Sonic within 100 px, it stops for 19 frames and launches a shot on the 7th, then walks on and doesn't launch again for 100 frames of walking. The shot rises from its mouth at 944/256 px a frame, slowing by 44/256 px a frame per frame, and when it has nearly stopped it bursts into a firework that hangs there for 20 frames, drawn four times mirrored around its point. Only the unmirrored quarter's box hurts. |
| 9 | Slot | 10 | `417`: floating 0, dropping 1; coin `420`, pieces `421` | Floats 0.625 px a frame between `d0` × 8 and (`d0` + `d2`) × 8 px right of its spawn point, bobbing up to 20 px above that line every 32 frames. Away from the ends, with Sonic's centre within 16 px across, it stops for 20 frames and drops a coin, then floats on for 100 frames before it can drop another. The coin falls, gaining 40/256 px a frame each frame, and shatters on the floor or on touching Sonic: six pieces fan out by the floor's angle at a random share of its speed, bounce, slow down and go after 45 frames, blinking for the last 30. The pieces don't hurt. Its sprite is a left half, drawn again mirrored. |
| 10 | Pierrot | 5 | `418` | A clown on a ball, from [#76](https://github.com/NahuelGenchi/onsoku-advance/issues/76). It rolls 0.625 px a frame between `d0` × 8 and (`d0` + `d2`) × 8 px right of its spawn point, following the floor. The ball can't be broken: Sonic curled up bounces back off it, turned round, and it hurts him any other way. The clown on top is defeated as any enemy is. |

A defeat in Casino Paradise frees a lion (`440`), which sits, a peacock (`439`), which hops away, and a parrot (`442`), which flies off swaying, in turn (`sAnimsTrappedAnimals`, `0x681154` in the USA ROM; [#77](https://github.com/NahuelGenchi/onsoku-advance/issues/77) built every zone's).

Kept from the original (issue [#56](https://github.com/NahuelGenchi/onsoku-advance/issues/56)): the Hanabii squares its distances to Sonic into 16 bits (`CamCoord`), so from 182 px away along either axis the square wraps negative and it launches as if he were within 100 px.

**How it was checked.** mGBA 0.10.5, from act 1 with Sonic placed by memory writes: a Hanabii walking and launching (1000 frames, its own task's memory matching on every frame) and one launching at Sonic held 182 to 199 px away, the 16-bit wrap (900); a Slot dropping coins on Sonic, the coin shattering on the floor and on him (1000 and 880); Pierrots rolling on screen in three runs; and a Slot defeated three times, with the game's next-animal counter (`gTrappedAnimalVariant`, `0x0300501C`) set to each animal (750 frames each). Sonic's state and every screen match.

## Casino Paradise Zone act 2

Level 5, `?level=5` in the address. Casino Paradise is zone 3 in the original's numbering (2 counting from 0, as `levels.js` and `stage.zone` do). Addresses are the USA ROM's; the decompilation's are the European ones, and for the boss's tables the USA address is the European one less `0x7100`.

**The stage.** `StageInit_Zone3Act2` (`0x0803D90C`) makes eleven palette animations (816, 817, 818, 824, 825, 827, 827, 828, 843, 844, 826), each cycling one row of the background's colours, and starts song 17. 827 runs twice: two tasks load the same colours together. `StageBgUpdate_Zone3Acts12` scrolls the 256 × 256 background in bands, and the fireworks in it (animations 482 and 483) are sprites at background priority 3, drawn between the background and the back layer. They take the game's random numbers every 4th frame, which the boss's choices depend on. The act's thin and falling platforms and its ferris wheels' seats are 495 (`sPlatformThinAnims` and `gUnknown_086CEE2C`, `0x086C8D48`). Its wall poles are red flags lying on their side (470).

**The title card.** Started on its own (from the course select, `?level=5`, or after a death), act 2 plays act 1's card. The card's act-2 branches test `(gCurrentLevel & 1) && gFinalBossActive != gCurrentLevel`, and in SA1 `gFinalBossActive` holds the level whose card last ended, which `ApplyGameStageSettingsAndStart` sets to the level the game starts at. The act-2 card only plays when act 2 follows act 1 in the same game, which belongs to the end of act 1 ([#69](https://github.com/NahuelGenchi/onsoku-advance/issues/69)).

**Objects.**

| Kind | Object | In act 2 | Animation |
| ---: | :--- | ---: | :--- |
| 4 | Spikes pointing right | 3 | `454` variant 3 |
| 42 | Red flag | 6 | `469` (still 0, swinging 1) |
| 60 | Ship swing | 2 | ship `491` (half, drawn twice), hook `490`, link `489` |
| 61 | Spiked platform | 5 | `521` in zone 3, `538` up and `539` down elsewhere |
| 62 | Bowl | 4 | `486` |
| 63 | Panel gate, upright | 3 | `496` (shut 0, spinning 1) |
| 64 | Panel gate, lying | 1 | `497` (spinning 0, shut 1) |
| 74 | Carousel | 2 | top `487`, pole `583` |
| 91 | Ferris wheel seat | 8 | `495` (Ice Mountain's `ferriswheels.js`) |
| 114 | Breakable wall | 2 | `559` (Ice Mountain's `breakablewalls.js`) |

- **Red flags** (`red_flag_and_pole.c`). Sonic running into one on the ground, facing the way it points, at more than 3 px a frame (5.25 rolling), swings round it: 15 px behind the pole for 7 frames, then carried on 10 px and 7.5 px a frame for 6 frames, and let go at 10.5 px a frame or more. Sonic's character state 30 is animation 37.
- **Ship swings** (`ship_swing.c`). A ship on a hook and five links, swinging with the stage clock. Sonic can stand on the hook and on the ship, which carries him 5 px above its point. Stepping off keeps it from taking him again for 5 frames.
- **Spiked platforms** (`platform_spiked.c`). A solid block that swings as a thin platform does, with spikes on its top (`d0` 0) or bottom. In zone 3 the code picks animation 521 and spikes up whatever `d0` is (act 2 has platforms with `d0` 1 and 251). Landing on the spikes, or hitting them from below, hurts Sonic; squeezed into a wall or ceiling by the block, he dies.
- **Bowls** (`bowl.c`). Sonic's body touching its box (moved 10 px toward him and 5 down) catches him (song 206). It whirls him round its middle 32 px out, from where he came in and as fast as he came, faster each frame, while it sinks 108 px with him. Songs 207 and 208 follow 56 and 112 frames later. At the bottom it spins him 64 times more on a narrowing circle and drops him out curled up.
- **Panel gates** (`panel_gate.c`). An upright gate opens for Sonic running right (left when `d0` is set) within 32 px before it; a lying one opens for him falling (rising when `d0` is set) within 28 px of it. Opening plays song 185, sets his standing height (`PLAYERFN_CHANGE_SHIFT_OFFSETS(6, 14)`) and spins the panel for 125 frames. While it spins only the side he would come back through is solid. The upright gate pushes him out with `Coll_Player_Gate`, its attack test off; the lying one is solid as a platform.
- **Carousels** (`carousel.c`). Within 8 px of its pole, from 48 px above its point to 12 px below, it takes Sonic (character state 33, animation 40; song 209). His ground speed becomes 7.5 px a frame the way he was going, and its spin starts from his speed (`|xsp| × 4`) and gains `0x40` a frame up to `0x8000`. It sinks 481 px (`0x3C2A58` in 1/8192 px). Its sound is song 209 every 25 frames, 210 every 16 from spin `0x3200`, and 211 every 8 from `0x4B00`. At the bottom it lets him go after 300 frames, or as soon as left or right is held on the frame before, curled up in the air at `((spin >> 2) − 0x7D0) × 2 / 3` / 256 px a frame. He goes the way he holds, or else the way he came.
- **The OAM order an animation sets.** Animation command −12 (`animCmd_SetOamOrder`) sets the sprite's OAM order, which it keeps after the animation. Only animations 40, 139, 239 and 338 use it. Sonic's carousel animation (40) puts him behind the pole for part of each turn, and he keeps the last order it set until the carousel lets him go.
- **Sonic's standing height.** `Player_8044F7C`, `Player_8043A2C` and `Player_8043970` call `PLAYERFN_CHANGE_SHIFT_OFFSETS(p, 6, 14)` whenever they set the walk, turn, brake or idle state. That changes nothing while Sonic already stands at full height. But after something uncurls him without moving him (a red flag's throw), he stays at a ball's height until the next of these, and the shift then moves him on a slope.
- **Sonic's character states.** The table from character state to animation and variant is at `0x084A6F0C`.

**Enemies.** Hanabii (8), Slot (9) and Pierrot (10, `pierrot.c`) are act 1's, in the table of Casino Paradise's enemies. More on Pierrot: Sonic curled up bouncing off its ball is moved by his ground speed against the way he faces, turned round and has his speeds reversed, so a rolling Sonic can be trapped in it (#56). Its code takes `Q(0.1875)`, 48, off its height where a pixel count seems meant; the floor test makes up for it in its first frames, off screen. Act 2's freed animals are the lion (440, sits), the peacock (439, hops) and the parrot (442, flies), from `sAnimsTrappedAnimals` (`0x08681154`).

**The Egg Ball** (enemy 24, `boss_3_egg_ball.c`, spawned at (7664, 2256)). The fight goes like this:
- **The arena.** When its spawn point comes into range, the camera's bounds close in, a pixel a frame, on 280 px left of it to it, and 184 px above it to 16 px below it. The boss music starts (the music manager's state `0x10`). The spawn also sets the game's random numbers to `gFrameCount`, the frames since the GBA was switched on. That is 3838 on an act's first frame when it is started from the course select, and the engine counts it from there.
- **The pipes.** Eight pipes, two in each wall, the floor and the ceiling (`gUnknown_084ACDD2`, `0x084A5CD2`), slide a pixel a frame into place from 32 px out (`0x084A5D12`), 90 frames after the spawn. The two in the floor are solid.
- **The entrance.** Two seconds after the spawn the mobile appears 85 px left of the spawn point and rises 80 px, a pixel a frame. A second later Eggman laughs, and a second after his laugh it climbs out of sight, 208 px up, and the spike ball is made.
- **The passes.** After a second unseen, a pass picks one of eight pairs at random (`gUnknown_084ACEA4`, `0x084A5DA4`). Each pair is the mobile's path and the ball's, two of eight straight lines across the arena: across at two heights each way, or up and down at two places each way (`gUnknown_084ACE24`, `0x084A5D24`). Both move at their path's speed (489/256 px a frame across, 352/256 up and down) times a factor that grows with the hits taken: 1.0 for up to 3, then 1.2, 1.4 and 1.6 (`gUnknown_084ACDC0`, `0x084A5CC0`). A pass ends when the mobile leaves the arena, and the next comes a second later.
- **Hitting it.** Sonic's attack box on the mobile (`Coll_Player_Enemy`) hits it (song 143): Eggman winces, and it can't be hit again for 32 frames. It flashes on two frames in every four of the first 16. The ball can't be hit, and it hurts Sonic. Eggman laughs whenever Sonic is hurt. Hit four times, it sets a pinch flag that nothing reads.
- **The defeat.** The eighth hit beats it (song 144, 1000 points). The camera stops across, its top bound pans 40 px down and its bottom bound a screen down, and the thin platforms' tasks are removed (`TasksDestroyInPriorityRange(0x2010, 0x2011)`). The mobile falls and bounces off the floor with three quarters of its speed until it is slower than a pixel a frame, throwing debris and an explosion every 8 frames. The ball flies off toward the screen's middle, bouncing and exploding, for three seconds. The pipes slide back out at 2 px a frame.
- **The escape.** 241 frames after it was beaten, Eggman escapes in the Egg Mobile, the star disc (623) flies off through the rotation hardware, and the music manager's state `0x30` ends the boss music. The original makes the capsule that ends the act there (`CreateBossCapsule`). The engine calls `world.bossDefeated(x, y)` at that moment, and the capsule and the end of the act are left to [#69](https://github.com/NahuelGenchi/onsoku-advance/issues/69).

**The widescreen view in the arena.** The original never shows past the arena's walls: its screen is 240 px wide and the arena 280. A wider view would, so from the spawn on the view is black past the walls (`cam.arena`, set by `setBossCamBounds`), wherever the original screen itself isn't. The black slides in from the view's sides, and the view to the arena's middle, at most 4 px a frame past what the camera itself moves, so nothing jumps when the bounds start closing in; where a boss's bounds open again, both slide back out the same way. A beaten boss's new bounds move the walls too, to where the bounds are going: the Egg Ball's to the one screen across the camera stops on, 40 px lower at the top. The HUD keeps to the corners of what is shown. The 240 × 160 screen is unchanged: the camera and the bounds match mGBA's on every frame of the fight.

**The hit flash.** A boss's flash makes its sprite an OBJ window inside which the screen brightens to white (`BLDY` 16). In mGBA (checked against a debug build of its renderer) only the background and the layers turn white inside the window. The sprites there keep their colours, since nothing is a second target, and so do the backdrop and the HUD. The engine draws it the same way. Each explosion plays song 144 when it first shows, because animation 611's script starts it.

**How it was checked.**
- *The recordings.* mGBA 0.10.5 recorded the act from the course select: work RAM, OAM, the palettes, the sounds started and a screenshot after every frame. Pokes put Sonic at each object; the engine replays the same pokes and keys. The runs:
  - the act's start, standing and running right, with the title card;
  - the red flags, three runs, and a wall pole;
  - the spikes pointing right, the spiked platforms (two runs), a bowl, the ship swings (two runs);
  - the panel gates, three runs: an upright one opening, blocking while open and shut, and a lying one opening;
  - the carousels, two runs: the full 300-frame wait, and an early exit holding right;
  - a breakable wall (pushed against, then broken by a spin dash), a ferris wheel (ridden and jumped off), Pierrot twice (the roll into its ball and a jump onto it, and a walk into it);
  - the Egg Ball's whole fight.
- *The state.* Sonic, the camera and the sounds match on every frame of every object run. The fight matches on every frame from 4180 to 10664, past Eggman's escape; the later 85 frames differ only where the original's capsule lands and shakes the screen.
- *The screen.* The engine's frames match mGBA's pixel for pixel on every frame of every object run, of the act's start (527 frames), and of three stretches of the fight (391, 71 and 461 frames).
- *Unchanged elsewhere.* Neo Green Hill act 1 is unchanged over 3000 frames: Sonic, the camera, the sounds and the sprites on every frame, and the screen every 50th.
- *Only read in the code:* a spiked platform crushing Sonic into a wall or ceiling, and its spikes facing down (other zones); a lying panel gate shutting and being solid from below; a carousel whose rider dies on it; the fight's other difficulties.

## Ice Mountain Zone act 1

Ice Mountain is zone 4 in the original's numbering (3 counting from 0, as `levels.js` does). Act 1 is level 6 in the ROM's per-level tables and starts with `?level=6`. Addresses are the USA ROM's.

**The act.** `StageInit_Zone4Act1` (`0x0803DDCD`) starts song 18 and two palette animation tasks, `822` and `821`, and sets the water: its line at y 1546 and its colour `0x7F20`. Sonic starts at (104, 180). The layers are tilemap entries 18, 19 and 20, and the falling snow is entry 71 (`TM_ICE_PARADISE_SNOW`). The act has 329 rings, 21 item boxes and these entities:

| Kind | What | Count | Where it is described |
| ---: | :--- | ---: | :--- |
| 0 | Stage goal | 1 | A stand-in until [#69](https://github.com/NahuelGenchi/onsoku-advance/issues/69) |
| 1, 2, 5 | Spikes up, down and hiding | 7, 3, 3 | [Spikes](#spikes) |
| 7–14, 17–24, 31 | Checkpoints, springs, layer toggles, grind rails, thin, falling and crumbling platforms, boosters | | Their own sections; zone 4's thin platforms are `523` |
| 46 | Forced slide | 3 | [Forced slide](#forced-slide), with the ice splash `562` |
| 55, 75, 81, 85, 89, 91, 95, 114 | Square platforms, hook rail, moving springs, sinking and rising platforms, ferris wheel seats, blocks of ice, breakable wall | 4, 1, 3, 2, 3, 17, 2, 1 | Shared with act 2 ([#72](https://github.com/NahuelGenchi/onsoku-advance/issues/72)) |
| 69 | Deep snow | 5 | Below |
| 84 | Skating stone | 2 | Below |
| 94 | Air bubbles | 10 | Below |
| 102 | Special spring | 1 | The special stage's entrance ([#75](https://github.com/NahuelGenchi/onsoku-advance/issues/75)) |

Enemies: Yukimaru on the ground (kind 16, 6) and on a wall (17, 1), Drisame (18, 4), Kuraa (19, 2) and Pen (20, 4). Defeating one frees the otter, the seal and the penguin in turn.

**Background and snow** (`CreateStageBg_Zone4`, `StageBgUpdate_Zone4Acts12`). The background (BG3, 256 × 512) moves 16 px across over the act's whole width and 352 px down over its height. The snow (BG0, 256 × 256) lies over everything: it drifts right with the camera and the clock, falls a pixel a frame, and its tiles move on every 12 frames (frame `(stage time − 1) / 12 mod 8`). It is added to what is under it (`BLDALPHA` 16/16). BG0 is off on the act's first two frames. While the title card's fade runs, the fade darkens every layer, which leaves the snow drawn as it is, and so does the card's last frame, where the blend is cleared.

**Deep snow** (kind 69 in zone 4, `Task_SlowingSnow`; other zones make this kind a conveyor belt). On every frame Sonic's position is in its box, `d2` × `d3` tiles from its spawn point, both edges in, and he is on the ground, his ground speed drops to 95% of itself, rounded toward zero.

**The water** (`water_effects.c`, `underwater_effects.c`). Its task (`0xFFFE`) runs after the stage's clocks and moves the line a pixel toward its target on odd frames. The line's place on the screen (0 above the top, 255 below the bottom) is taken by the VBlank callback (`sub_8011A4C`), so each frame is drawn with the line the tasks worked out the frame before. The VCount interrupt at that line switches the rest of the screen to the water's look:

- the background's colours become the stage's mixed with the water's, `((c & 0x7BDE) + (((c & 0x739C) + (0x739C & 0x7F20)) >> 1)) >> 1`, all but the last 24 (colours 232 to 255), which keep the colours above the line. The colours mixed are those the palette animations had while the title card showed (`InitWaterPalettes` copies them on each of its frames); the act's later steps don't reach them;
- sprites use the same mix of their own colours;
- the snow is off;
- the background wavers (`sub_8007738`, from BG3's scroll): up to 2 px sideways with a wave every 16 lines of the background, and up to 10 px up and down with one every 32.

The surface is animation `563`, one 16-px sprite drawn 17 times along the line, a pixel under it, on the frames with bit 1 of the clock set, its waves moving left with the camera and a pixel every 4 frames. In priority 0 and OAM order 0 it shows in front of the HUD.

**Sonic in the water** (`Player_HandleWater`). He is in the water while his centre is 4 px or more below the line. There his top speed is 2.25, his acceleration 4/256 and deceleration 48/256, gravity 12/256, his jump 2.625 and the jump's release cap 1.5. Going in halves his X speed and quarters his Y speed; coming out doubles his Y speed. Each makes a splash on the line (`581`, `CreateWaterfallSurfaceHitEffect`) and plays song 190, at most once every 10 frames. Under water:

- every 16th frame of the clock, one time in four (the game's random numbers), he lets out a small bubble (`753`) 4 px in front of him and 4 px up;
- a second goes every 60 frames from 30. At 12, 10, 8, 6, 4 and 2 a number (`781`, 5 down to 0) appears over him: it stays where it appeared on the screen, grows to full size over 32 frames, rises over 64 and goes after its 129th. At 11 the drowning music, song 27, takes the place of the act's; when it ends, after 620 frames, the music manager starts song 18 again. Below 0, 31 seconds after he went in, he drowns: song 192 plays in place of 119, and bubbles keep coming out of him (`Task_SpawnBubblesAfterDrowning`) until the act starts over;
- out of the water the count starts again from 30 and the drowning music stops.

Bubbles (`SpawnAirBubbles`) rise half a pixel a frame, swaying, grow to full size over 16 frames and burst 3 px below the line, after 481 frames or off the screen; while 12 are rising no more are made. Some come in groups (`754`), flipped at random.

**Air bubbles** (kind 94, `air_bubbles.c`). A spot on the ground (`533`) lets out a stream of small bubbles and, every 301, 241, 121, 261, 301, 121, 201 and 121 frames in turn (`gUnknown_086CEE60`), a big one (`532`). The big bubble rises half a pixel a frame, swaying up to 8 px either way. From its 80th frame, Sonic's body touching it takes a breath: song 191, his moves end, he uncurls, stops dead and the drowning count starts over, and the drowning music stops. The bubble then stays where it is for 16 frames and bursts.

**Yukimaru** (`yukimaru.c`, animations `422` on the ground, `423` on a wall, snowball `427`; its sprite is a half, drawn again mirrored). On the ground it walks 0.625 px a frame between `d0` × 8 and (`d0` + `d2`) × 8 px right of its spawn point, 6 px above it and following the floor. On a wall it climbs the same way between `d1` × 8 and (`d1` + `d3`) × 8 px below it, keeping to the wall (on its right when `d0` is set). Away from the ends, 60 frames after its last throw, it throws a snowball straight up when Sonic is above it and no more than 8 px to either side, or, on a wall, across and away from it when he is level with it within 8 px. The snowball passes through Sonic, hurting him, and goes only off the screen. In priority 0 and OAM order 1 it shows in front of the HUD.

**Pen** (`pen_mk1.c`, `426`, snowball `428`, its pieces `429`). It walks 0.625 px a frame between (`d0` + 1) × 8 and (`d0` + `d2`) × 8 px right of its spawn point, following the floor and facing the way it goes. Away from the ends, 60 frames after its last throw, it stops to throw a snowball when Sonic is less than 80 px away. The snowball slides off along the ground and bursts into two pieces. While it throws, it follows the floor twice a frame from the same place, so on a slope it moves twice as far toward it, as the original does. The original makes no Pen on Easy; this game has no difficulty setting.

**Skating stones** (kind 84, `skating_stone.c`). Act 1 has two, at (3480, 1504) and (6264, 1080), with zone 4's look (`529`, pieces `553` and `554`). A stone waits until Sonic lands on it, then slides off with him, gathering speed downhill, to the left when `d1` is set. Where the ground drops away, Ice Mountain's stones drop (other zones' leap), and song 198 plays when one slides on after landing. It lands `d0` times and goes on, and breaks on the next landing or against a wall, throwing Sonic up, with song 143.

**Palette slot 11.** The blocks of ice (`555`, shards `556` and `557`), the stones (`529`) and their large and small pieces (`553`, `554`) all load into sprite palette 11. Palettes 60, 63 and 74 are the same there and 69 differs in colours 1 and 10–14. So once a stone or a block of ice breaks, its large pieces leave 69 in the slot (a stone's on every frame they show, a block's once, as they're made after the small ones), and the blocks of ice and stones on the screen are drawn in 69's colours until another of them loads its own (see [Sprites](#sprites)).

**How it was checked.** mGBA 0.10.5 with the USA ROM, started at the act through its level and start position in memory, with Sonic placed by memory writes and 48 rings given. The engine ran each recording's inputs; Sonic's position and speeds matched mGBA's on every frame of all of them, and the screen matched pixel for pixel apart from the differences listed below:

| Recording | Frames | What it covers |
| :--- | ---: | :--- |
| The act's start | 293 | The title card over the act, the snow, the background |
| Running right | 943 | The first stretch, Yukimaru on the ground |
| Into the water | 1483 | The surface, the splash, the screen under the line, the waves, the line moving |
| Drowning | 2393 | The countdown, its numbers and music, drowning, the bubbles after, the restart |
| A breath | 543 | A big air bubble, its breath and song 191 |
| Yukimaru | 543 × 2 | On the ground and on a wall, with throws |
| Yukimaru defeated | 542 | A spin dash through one, the dust, the otter, the points, the hiding spikes rising and sinking |
| Pen | 543 | Walking, throwing, the snowball's slide and burst |
| Down spikes | 493 | Hit from below |
| Hook rail | 643 | The rail at (8064, 288) |
| Skating stones | 843 × 2 | Both stones, their slides, drops and break |
| Block of ice | 443 | A break and its shards |
| Forced slide | 342 | A slide with the ice splash |

The water line, the stage clock and the camera were also compared with `gWater` (`0x03006080`), the stage time (`0x03005120`) and the camera (`0x03005940`) in the water and drowning recordings, and the songs the engine starts with mGBA's music players in a drowning run: 190 going in, 27 at 11 seconds, 192 drowning and 190 again after the restart, each on the same frame. mGBA's player shows song 18 coming back 620 frames after 27 started.

Differences that remain, none of them in the game's state:

- On some frames mGBA's VCount interrupt runs a line late (the CPU is busy), so the waves start one row lower and the row above the line keeps the colours from above it.
- During the title card only, with the water line on the screen: the surface's sprites sit between the card's pieces in OAM, so parts of the card show behind them; Yukimaru's snowball shows garbled tiles in mGBA; and under the line the card's pieces take the live sprite colours (`InitWaterPalettes` copies them every frame), where the engine uses its own under-water copy. No start or checkpoint in act 1 puts the line on the screen during the card.
- A sprite with a lower OAM index but a lower priority than another still hides it on the GBA (the lowest index decides the pixel, then the priority). The engine stacks by priority first. It showed on one pixel for three frames, where the points passed under the HUD's timer.

Read in the code only: Pen snowball's other burst conditions, the hiding spikes' first-frame push in this act (checked on Angel Island), the music manager's restart of song 18 in the engine (mGBA shows it on time, the headless runs don't run the music), and the square platforms, moving springs and sinking platforms in act 1 (checked on act 2).

## Ice Mountain Zone act 2

### Ice Mountain's objects

Ice Mountain is zone 4 in the original's numbering (3 counting from 0, as `levels.js` does). Act 2 is level 7 in the ROM's tables and starts with `?level=7`. Several objects pick their look by level or zone; act 2's are in its row of `levels.js`. Addresses are the USA ROM's.

| Kind | Object | Act 2 | Task | Animation |
| ---: | :--- | ---: | :--- | :--- |
| 55 | Square platform | 2 | `Task_Platform_Square`, `0x0807D0F1` | `524` (48 × 48, box (−24, −23, 24, 24)) |
| 75 | Hook rail | 2 | `Task_HookRail_Type1`, then `Type1_2` and `Shared0` | `569` in zone 4, `504` elsewhere |
| 81 | Moving spring | 5 | `Task_MovingSpringMain`, `0x0808B131`; the launch `0x0808B2B5` | `526`: idle variant 1, launch 0 |
| 85 | Sinking platform | 2 | `Task_Platform085`, `0x0808DCE9` | `528` |
| 89 | Rising platform | 1 | `Task_Platform089`, `0x0808E1FD` | `523` |
| 91 | Ferris wheel | 3 | `Task_FerrisWheel`, `0x0808F6B5` | seat `523`, hub `530`, spokes `531` |
| 95 | Block of ice | 4 | `Task_IceBlock`, `0x080914F9`; the shards `0x08091949` | `555`, shards `556` and `557` |
| 98 | Underwater lava platform | 6 | `0x08092469`; the spurt `0x080926A9` | pool `561`, spurt `560`, platform `525` |
| 114 | Breakable wall | 2 | `Task_BreakableWall`, `0x08027A55`; falling `0x08027D59` | `594` (32 × 64) |

- **Square platform:** it swings like the moving spring (below), across when `d2` is above `d3`. Sonic rides it carried by what it moved plus 1 px down. Walls beside him hold him back while he rides; its sides push him out, and holding toward a side on the ground moves him 1 px into it and sets his push. Act 2's two slide in 48-px tunnels. The original also crushes him against walls and ceilings, which no layout in act 2 can do. The look is per zone: `494` by default, `524` in zone 4, and in zones 5 and 6 a long variant when the other swing byte is set.
- **Hook rail:** zone 4 only uses the kind that slides to the right (`d0` 1): Sonic hangs in character state 38 (animation 43) for 480 px across and 240 px down, then goes on walking at its speed, while song 180 plays.
- **Moving spring:** it swings by `d2` × 8 px across when `d2` is above `d3`, otherwise `d3` × 8 px up and down, at `(d << 11) × sin(4 × (clock + phase)) >> 14`, with a phase of half a turn when the swing byte is negative. The frame after Sonic lands on it, it throws him up at 7.5 px a frame in the somersault (character state 17) with song 170, and shows its launch variant for 12 frames. Before the platform test it pushes him out of its sides with 8 px of slack; after it, pushing at it puts him back in the walk state.
- **Sinking and rising platforms:** both land Sonic like a thin platform. The sinking one goes down 0.75 px a frame with him while the one-tile probe under it finds no floor, and rises back when he leaves. The rising one goes up 0.75 px a frame with him; past `d3` × 8 px it kills him on it. Landing on the sinking one puts him 2 px lower unless he is spin dashing. The sinking platform's look is per level (`gUnknown_086CEDC0`); the rising one is always `523`.
- **Ferris wheel:** each seat is an entity of its own, at the angle `((±d1 × clock + ((d0 & 15) << 7)) & 0x7FF) >> 1` (+ when `d2` is above `d3`, with radius `d2`, otherwise − and `d3`), and `sin × radius >> 11` from its centre, in 8-px steps. Riding, Sonic moves by what the seat moved, an eighth of it in 1/256 px plus 1 on odd frames, and sits 20 px above it (15 curled). The seat sags by up to 6 px while he rides it. The seat's look is per level (`gUnknown_086CEE2C`).
- **Block of ice:** solid like a boulder, and it breaks the same ways. It also breaks when Sonic's attack box touches it while he is curled up or charging a spin dash, or when he lands on it curled up, which stands him on it first, so it doesn't bounce him. Rolling into one doesn't break it. Songs 138 and then 193 play, and two large and two small shards fly out like the boulder's pieces, for 81 frames, growing by 1/256 a frame. It doesn't come back until the act starts over.
- **Underwater lava platform:** a thin platform (`525`, OAM order 17) resting on a solid pool of lava, drawn 3 px higher. When the stage clock is a multiple of 102 while it rests, the lava spurts with song 182. The platform is thrown up at 5 px a frame, falls 37/256 px a frame faster each frame, and bounces twice more at 2/5 of the speed it came back with, taking Sonic with it. On spurt frames 7 to 53 the spurt's box 1, (−16, −17, 16, 8), hurts him.
- **Breakable wall:** it pushes Sonic out of its sides like a gate (`Coll_Player_Gate`) until he touches it with his attack box out, curled up or attacking. Song 173 plays and its 32 tiles of 8 × 8 fall, column by column 10 frames apart, the column he came from first, and from the bottom up 2 frames apart: `dy = t × (42t − 512) >> 8` and `dx = t × v >> 8`, with `v` half his X speed or ±256. It ends when the top tile of the first column to fall passes the screen's bottom. Every tile is tested against that one line, and the tiles drawn before it on that frame still show. It never stays broken: the whole wall spawns again when its spawn point comes back into range. The look is per level (`gUnknown_080BB544`).

Kept from the original: the lava's spurt doesn't step its animation for its first 6 frames, and its pool animation runs at twice its speed while the platform bounces. A spurt longer than 102 frames makes the next multiple of 102 pass without one.

**How it was checked.** mGBA 0.10.5 with the USA ROM, from a savestate in act 2, Sonic placed by memory writes. Most recordings move the water line out of the way (`gWater` at `0x03006082`, its target at `0x03006084`, both set to `0x7FFF`). The engine's Sonic was run on the same inputs, and his position and every object's position, animation and frame matched on every frame:

| Object | Recordings |
| :--- | :--- |
| Square platform | 6 runs of up to 700 frames: walking into it both ways, pushing, riding under the opening, walls holding him, falling off, jumping |
| Hook rail | 500 frames, the rail at (2784, 576) from the catch to past its end |
| Moving spring | the up-and-down one at x 1936 (4 landings, 500 frames) and the across one at 4008, with its side push |
| Sinking and rising platforms | riding each to its end, 600 frames each |
| Ferris wheel | the wheel at (5760, 672) over a turn, 900 frames |
| Block of ice | 7 runs of 400 frames: jumping into its side, landing on it, a spring under it, a spin dash into it, and blocks that don't break |
| Underwater lava platform | 700 frames over three platforms and two spurts, and a burn with no rings left |
| Breakable wall | a jump, a spin dash, a push, and a jump from the right |

Read in the code only: crushing on a square platform, vertical square platforms, flipped breakable walls, the moving spring's push-to-walk quirk, and other zones' looks.

### Ice Mountain's enemies

| Kind | Enemy | Act 2 | Animations | What it does |
| ---: | :--- | ---: | :--- | :--- |
| 18 | Drisame | 3 | `424` in its block of ice `573`, pieces `579` and `580` | Waits in its block until Sonic comes within 80 px on the side it faces, inside the angles it looks along (the rough angle of `sub_8004418`, USA `0x0800338C`, taken of (dy, dx)). The block then shatters into four pieces, moved and drawn two frames in every four, and the fish darts at where he was, about 1.8 px a frame, and keeps going. |
| 19 | Kuraa | 5 | `425`: walking 0, snapping 1 | Walks a quarter of a pixel a frame between `d0` × 8 and (`d0` + `d2`) × 8 px right of its spawn point. Away from the ends it snaps its claws for 120 frames, then walks 500 frames before it can snap again. While it snaps it can't be destroyed and its box hurts Sonic. Its sprite is a left half, drawn again mirrored. |

Kept from the original (issue #56): the Kuraa tests its snapping box at its spawn point, not where it has walked to (`Task_80737A8`, USA `0x080734B0`). Once the Drisame darts off, it tests its spawn point's x in place of its y for leaving the range (`sub_8072E68`, USA `0x08072B70`).

**How it was checked.** mGBA 0.10.5, from the act 2 savestate: a Drisame breaking out and darting, twice (400 frames each), and a Kuraa walking and snapping with Sonic held near it. The enemies' positions, animations and frames, and Sonic, match on every frame.

### Egg Spider

Ice Mountain's boss is enemy 25, spawned at (8816, 1616) in act 2, on the ceiling of an arena whose floor is 180 px lower and whose water line starts at 1664. The tasks are `Task_EggSpiderInit` (USA `0x08030C75`), the fight `0x08030EB5`, the eighth hit `0x080311A4`, the fall `0x08031451` and the wreck `0x080316DD`; the USA addresses are the European ones less `0x30`. Its position is kept in 1/256 px from its spawn point, starting 48 px right of it and 16 px down. The spider is animation `628` (walking 0, dropping 1, still 2, box 0 (−23, 0, 23, 53)) in OAM order 22, and Eggman `629` (still 0, laughing 1, wincing 2) in order 21, drawn lower than its top by `gUnknown_084ACED8` (USA `0x084A5DD8`: 0, 1, 0, 1, 1, −1), indexed by the first OAM entry of the spider's frame.

**The arena.** When it spawns, the camera's right edge stops at the spawn point and its left, top and bottom edges close in a pixel a frame on the arena: from 320 px left of the spawn point to it, and from it to 192 px below it (`Bosses_SetCamBounds`). Sonic's ground speed is set to 0 and his controls are held. From then on, scattered rings bounce off ceilings as well as floors, and a task at priority `0xFFFD` takes the colours under the water from the stage's every frame (`InitWaterPalettes`). Two seconds later the boss music starts (the music manager's state `0x10`). The spider walks in at a pixel a frame to 120 px left of the spawn point while the camera's target moves up 96 px, a pixel a frame. It stands still for a second, Eggman laughs, and a second after his laugh ends the camera's target comes back and Sonic's controls with it.

**The fight** (`sub_8030EE4`): it walks at a pixel a frame to one of nine places 288 to 32 px left of the spawn point, in steps of 32 (`gUnknown_084ACEC6`, USA `0x084A5DC6`), picked with the game's random numbers. When it is already there it takes the one 5 further on. It stands still for half a second, then for two seconds shakes the screen and drops an icicle every `gUnknown_084ACEB4[hits]` frames (USA `0x084A5DB4`: 59 up to 3 hits, 39 up to 6, then 29 and 19), with song 145. After the drops it walks to two more places before it drops again.

**The icicles** (`CreateIciclePlatform` and `sub_8031AB4`, USA `0x08031A85`, priority `0x2200`) are animation `630`, box 0 (−12, −17, 11, 6) and box 1 (−5, 5, 4, 15). Each starts 32 px above the spawn point, 10 to 310 px left of it in steps of 20, and falls 10 to 25/256 px a frame faster each frame, both picked at random. Under the water it falls an eighth as fast while the boss is whole. Its point (box 1) hurts Sonic while the boss is whole. Under the water he can land on it, and it takes him down with it a pixel a frame faster, until it is more than 196 px down. It goes 208 px down.

**Hitting it** (`sub_80308A4`): while it isn't flashing, Sonic's attack box on its box 0 knocks him back (his speeds reversed) and hits it, with song 143 and Eggman wincing. Otherwise his body on that box hurts him, and Eggman laughs. A hit makes it flash white on two frames in every four for 120 frames. It takes 8 hits on the normal difficulty.

**Beaten** (`sub_80311D4`), Eggman winces and song 144 plays. The spider is left as its body (`626`), and three parts (`627`) fly off through the rotation hardware for 60 frames: the top across to the left at 1 px a frame, and two legs to either side at 4 px a frame. The camera stops across, its top and bottom edges move a screen down, a pixel a frame, to the arena's floor, the water line's target goes 160 px down, and 1000 points are scored. A widescreen view's black follows the bounds to where they are going: that one screen at the arena's floor (`cam.arena`). The body falls 2/256 px a frame faster each frame, throwing a piece of debris (falling 5/256 px a frame faster each frame) and an explosion every 8 frames. After two seconds it stops when the back layer's floor is 56 px under it. 300 frames after it was beaten, Eggman escapes in the Egg Mobile from 40 px below it, the music manager's state `0x30` ends the boss music, and the original makes the capsule that ends the act there (`CreateBossCapsule`). The engine calls `world.bossDefeated(x, y)` at that moment, and the capsule and the act's end are left to [#69](https://github.com/NahuelGenchi/onsoku-advance/issues/69).

**How it was checked.** mGBA 0.10.5 with the USA ROM, from the act 2 savestate with Sonic placed in the arena, the boss's memory, the icicles, the parts and Sonic read after every frame:

- 2400 frames of the fight: the arena, the intro, the camera, Eggman's place and laugh, the random walks, the drops, the icicles above and under the water, and Sonic drowning and starting over.
- 1550 frames with the hit count set to 7 before Sonic's hit: the eighth hit, the parts, the fall, the debris and the wreck, up to where the capsule takes over.

The spider's, Eggman's, the icicles' and the parts' positions, animations and frames, and Sonic's position, match on every frame, and so do the game's random numbers. Not checked: the boss's colours under the water, the white flash's picture, the left leg's mirroring through the rotation hardware, the jump and attack buttons held when Sonic's controls come back, the screen's windows and blending during the wreck, scattered rings hitting the arena's ceiling, the other difficulties, and the camera's bounds after Sonic dies in the arena.

## Angel Island Zone act 1

Level 8 in the ROM's per-level tables (`?level=8`): tilemap entries 24, 25 and 26, collision entry 8, start (104, 851). It is 8928 × 2688 px, 93 × 28 metatiles. Its stage init, `StageInit_Zone5Act1` (`0x0803DE55` in the USA ROM, entry 8 of the table at `0x084A6A18`), makes one palette loader task (`0x2000`) for animation `823` and starts song 20. 823 loads the waterfalls' colours into row 10 (colours 160–175), a new palette every frame, four in turn. The front layer's header has `animTileSize` 96 but no frames (`animFrameCount` 0), so its tiles don't animate. The level's music numbers are also in `gLevelSongs` (`0x4A69E4`: 12 to 24 and 26 for the 14 single-player levels, then 12, 14, 16 and 23).

### Background and clouds

`CreateStageBg_Zone5` and `StageBgUpdate_Zone5Acts12` serve both acts. BG3 is the level's background entry, a 240 × 160 map that stands still (scroll 0, 0). BG0 is Egg Rocket's clouds, tilemap 72 (`TM_EGG_ROCKET_CLOUDS`, 32 × 20 tiles), at priority 3 like BG3 and in front of it. The clouds load no palette of their own and draw with the stage's, colour 0 transparent. They scroll left a pixel every 4 frames of the stage clock: BG0HOFS = `(0x100 − gStageTime / 4) & 0xFF`, with the clock from before that frame's tick, as Neo Green Hill's cloud bands. They are blended over the background: `BLDCNT 0x3F41` (BG0 the first target, every layer the second), `BLDALPHA 0x100C`, 12/16 of the cloud and 16/16 of what is behind it. mGBA mixes its 8-bit colours, each channel `(cloud × 12 + back × 16) / 16`, at most 255, and the renderer does the same. While the title card's fade runs, each of its steps sets the brightness decrease (`BLDCNT 0x3FFF`) in place of the blending, so the clouds are darkened with the rest and not blended. On the frame the card ends it switches the blending off (`BLDCNT 0`); from the next frame the background sets it again.

### Zone 5's own look

Some objects every zone has pick their animation by level, and their hitboxes come from that animation's frames, so another zone's animation moves Sonic by a pixel. Zone 5's thin and falling platforms are animation `535` (`sPlatformThinAnims`), its bounce blocks `543` (`sBounceBlockAnims`), its waterfall splash `552` (`gUnknown_086CED28`), its iron balls `541`, its sinking platforms `544` (`gUnknown_086CEDC0`), its square platforms `536`, or `537` for a long one, and its breakable wall `595` (the per-level table at `0x080B854C`: `559` for levels 0–5, `594` for Ice Mountain, `595` for Angel Island, `596` from Egg Rocket on). [`src/rom/levels.js`](../src/rom/levels.js) lists them as the level's `sprites`.

### Angel Island's enemies

Act 1 has 8 Buzzers and 4 Rhinotanks, which work as in Neo Green Hill, and two kinds of its own:

| Kind | Enemy | Count | Animations | What it does |
| ---: | :--- | ---: | :--- | :--- |
| 11 | Leon | 5 | `430` | A chameleon that walks its range at 0.625 px a frame and shoots its tongue at Sonic when he is in front of it |
| 13 | Wamu | 1 | `431` | A flying snake whose head swings on an arc, trailing two body and two tail segments |

**Leon** (`Task_LeonInit`, `0x0806E7C0`) starts walking left and follows the ground, found 3 px below its position. Its range runs from `d0` to `d0 + d2` tiles from its spawn point. At an end, facing out of the range, it turns round and stands still for 14 frames. When Sonic is within 80 px in front of it, and between 32 px above it and 8 px below it, it stands still and shoots its tongue for 31 frames. The tongue's box (slot 1 of its sprite) hurts Sonic; its body's box (slot 0) is the one he attacks or is hurt by. After a shot it has to walk 60 frames before it can shoot again, counted only on frames it walks inside its range. In the original, Angel Island has no Leons on Easy; this game has no difficulty setting.

The original never sets that count when it makes a Leon (`unk4E`, `+0x4E` in its task): it starts with whatever the memory held. In the recordings it held 360 or 328 (another task's leftover x position), which held back the first shot by more than 300 walking frames, so a Leon Sonic walks straight past doesn't shoot. That can't be reproduced, and this game starts the count at 0. The tongue's box also stays set after a shot, and the next shot checks it on its first frame, before the script moves it, so the tongue hurts from where it last was. The decompilation's C counts down the wrong field (`unk4C`); the ROM counts down `unk4E`.

**Wamu** (`Task_Wamu`, `0x0806EFF8`) moves its head every frame by the cosine and sine of an angle (1024 a turn, ±16384 in the sine table): the cosine divided by 80 − 4 × `d3` across and the sine divided by 80 down, in 1/256 px (act 1's Wamu has `d3` = 2). The angle starts at 100. Facing left, it steps by 5 up to 612, then by −8 down to 412, and back. Facing right, it steps by 5 either way between 100 and 924, the short way round over 0. At the end of a swing, if the head is at most `d0` tiles from its spawn point facing left, or at least `d0 + d2` tiles from it facing right, the Wamu turns round: every sprite flips and the angle's bit `0x100` toggles. The Wamu keeps its head's last 64 positions. Its segments, drawn after the head, are a tail, a tail, a body and a body: each takes its x from where the head was 24, 19, 14 and 7 frames before, moved out by half its distance from the head, and its y from 40, 30, 20 and 10 frames before. Each sprite's animation steps once a frame, as its first segment is drawn. Only the head can be destroyed. Each segment's box hurts Sonic where the segment is drawn; the decompilation's C tests it at the head's position.

### Freed animals

A defeat frees the next of the zone's three animals (`sAnimsTrappedAnimals`, `0x681154`; `CreateTrappedAnimal`, `0x08054920`), in turn: one counter (`0x0300501C`) for every zone. The zone is the level's index halved.

| Levels | Zone | Animals |
| :--- | :--- | :--- |
| 0–1 | Neo Green Hill | otter `445`, koala `450`, kangaroo `449` (hops) |
| 2–3 | Secret Base | mole `441`, skunk `447` (hops), robin `448` (flies) |
| 4–5 | Casino Paradise | lion `440`, peacock `439` (hops), parrot `442` (flies) |
| 6–7 | Ice Mountain | otter `445`, seal `437`, penguin `443` (hops) |
| 8–9 | Angel Island | elephant `451`, lion `440`, gorilla `438` (hops) |
| 10–11 | Egg Rocket, Cosmic Angel | mole `441`, deer `446` (hops), rabbit `444` (hops) |

One that sits or hops first hops up at 4 px a frame and lands on the ground; it then sits there, or hops away to the left at 2 px a frame. A flying one (`CreateFlyingAnimal`, `0x08054460`) flies left at 3.2 px a frame, its heading swinging between straight left and 45° up by 6 (1024 a turn) a frame, starting halfway. Each goes once it is more than 32 px off the screen. The table stops after Egg Rocket's zone: from level 12 on, the original reads the next table's bytes as animals. X Zone and the Moon have only bosses, so it doesn't show there; this game frees no animal past the table.

### Spikes pointing right

Kind 4 is the left-pointing spikes unflipped: animation `454`, variant 3. Act 1 has one, at (4800, 1760). Its top and bottom are only solid. It hurts Sonic through its right face and plays song 171. Touching its left (back) face puts him out past its right face (`Task_Spikes_Horizontal`).

### Torches

Act 1 has fifteen torches, kind 87, in the ruins between x 3176 and 4496. A torch is a flame, animation `558`: four frames, 8 frames each. It has no box. It is drawn behind the other sprites (OAM order 28). Its animation steps before it is drawn, from the frame the torch is made. It goes when its spawn point leaves the range. In Cosmic Angel the same kind is the antigravity unit, with its own animations; that variant isn't built.

### Lava

Kind 105 draws nothing. It is an area from its spawn point, `d2` × 8 px across and `d3` × 8 px down, edges included. On every frame Sonic's centre is in it, while he is alive and no object carries him: with `d0` 0 it hurts him as spikes do (`Coll_DamagePlayer`), unless he is invincible; with any other `d0` it kills him on the spot, and he keeps his speeds as he dies. Act 1's one pool is at (4416, 1296), 192 × 32 px with `d0` 1, at the foot of the waterfalls. The lava goes when its spawn point leaves the range.

### Waterfalls in Angel Island

Zone 5 runs its own waterfall task (`Task_WaterfallZone5`), chosen by the zone when the waterfall is made. The area is the same as Neo Green Hill's: `d2` × 8 px wide and `d3` × 8 px tall, starting `d1` × 8 px below the spawn point. Act 1 has eight waterfalls, two columns of four at x 4416 and 4512, from y 904 to 1288, each 96 × 128 px.

On every frame Sonic is in the area, alive and not moving up, the waterfall holds him:

1. On the first frame it holds him, it plays song 201 on the second sound-effect player.
2. It cancels flying and the boost (as `Player_TransitionCancelFlyingAndBoost` does).
3. With no jump press, it puts him on his feet and out of the air, with no ground under him, clears the spin attack, sinks him 176/256 px and stops any fall.
4. Left held adds 4/256 px a frame to his ground speed and right held takes 4/256 away, the other way round from the d-pad. With neither held, a twentieth of his ground speed goes, rounded toward zero (on the 8.8 value).
5. A jump press instead throws him up at 624/256 px a frame, in the jump's animation. It doesn't curl him or put him in the air.

The splash is zone 5's, animation `552`, drawn at his centre 10 px lower, in OAM order 5, priority 2. Unlike Neo Green Hill's, it animates on every frame, whether or not it is drawn. When Sonic is out of the area while the sound still plays, or when the waterfall goes, the waterfall fades the second sound-effect player out (`m4aMPlayFadeOut(&gMPlayInfo_SE2, 4)`).

Both zones' waterfalls, and the lava, would halve his falling speed when they go with him inside. The flag they test (`unk3A`) is never set.

### Rolling boulders

Kind 92 is a boulder spawner (`boulder_spawner.c`). It draws nothing. On every frame where the stage clock (`gStageTime`, `0x03005120`) is a multiple of 120, it lets a boulder go at its spawn point. It goes once that point is more than 128 px off the screen; the boulders it made keep going. Act 1 has four, at (2944, 808), (3232, 1000), (3520, 1288) and (4000, 1576), all with `d0` 1.

A boulder (`Task_BoulderMain`, `0x0808FD30`) is animation `457`, four frames of 4, with the box (−14, −30, 13, −2). It keeps its position as 8.8 fixed point from its spawn point and starts rolling right at 64/256 px a frame. Each frame:

1. It works out its position from the start of the frame. It is drawn there at the end.
2. It leaves if it is off the screen (128 px margin). The test meant to keep it while its spawn point is near reads that point's world position as a place on the screen, so it never holds.
3. If Sonic is alive and its box meets his, it hurts him (`Coll_DamagePlayer`).
4. It reads the floor on layer 1 at its bottom (`sub_801F07C`):
   - *Falling:* at or above the floor, it gains 32/256 px a frame. Below it, it lands and its vertical speed goes to 0. It lands `d0` times and breaks on the next landing.
   - *Rolling, floor more than 5 px down:* it starts to fall, with 2/5 of its speed across (truncated, made positive) as its first downward speed.
   - *Rolling otherwise:* it moves by the distance plus 2, which settles it 2 px into the floor, and speeds up by the cosine of the floor's angle over 1250 (literal `0x4E2` at `0x08090038`), 13/256 px a frame on the flat. Where the tile at its bottom is empty, `sub_801F07C` leaves the angle alone and the boulder uses whatever its stack slot held: in every recording that adds 3/256 px a frame (an angle of 52 to 54), and so does this game.
5. It moves by its speeds.

A breaking boulder leaves the same four pieces as a broken standing boulder (`Task_BoulderDebris`) and plays song 144 when it is in the camera's range. The pieces' transform starts at the camera's position on that frame, 16 px lower than a standing boulder's. The original also gives the small pieces the large ones' VRAM size and the other way round, with no visible effect.

Angel Island's kind 16 decorations are Neo Green Hill's boulders, with the same animation `458` and no zone branch. Act 1 has two, at (4384, 584) and (1296, 1640).

### Whirlwinds

Kind 90 (`Task_PlayerFloatMain`, `0x0808EF90`) is an area with nothing drawn, from its spawn point `d2` tiles across and `d3` tiles down, edges included. Act 1 stacks three up its shaft at x 3072, each 12 × 16 tiles, with the updraft's debris (kind 97) drawn inside. It runs before Sonic's own frame, at priority `0x2000`. On every frame his centre is inside it and he is alive, it takes 104/256 px off his vertical speed and caps his rise at 2.25 px a frame, sets him in the air, cancels flying and the boost (`Player_TransitionCancelFlyingAndBoost`, `0x08046CB8`: his push, spin dash and jump flags and his mid-air counters) and gives him a state: 37, the whirlwind spin (animation 42), when `d0` is 0, and otherwise 17, the spring's somersault. With gravity added in his own frame he rises a steady 534/256 px a frame. When he is more than 4 px above the floor under his centre (the one-tile probe `sub_801F100`, `0x080401E8`), it also clears his spin attack, without changing his hitbox height, so a Sonic who jumps in curled loses his attack but keeps the ball's height until he lands.

A whirlwind with `d0` 0 plays song 200 on the frame it first lifts Sonic while he isn't spinning already, fades the second sound-effect player out on any frame he isn't spinning, and stops song 200 when its spawn point leaves the camera's range. Leaving would also halve his falling speed, behind the same never-set flag as the waterfalls'.

### Hiding spikes

Kinds 5 and 6 (`Task_Spikes_HidingUp`, `0x08020A1C`, its per-player routine at `0x08020EFC`; the down ones are the same, upside down) follow the stage clock, `gStageTime % 128`. Their data bytes aren't read.

| Clock | Shown | Solid |
| ---: | :--- | :--- |
| 0–59 | nothing | no |
| 60–61 | animation `454`, variant 0 | no |
| 62–63 | variant 1 | no |
| 64–123 | variant 2, the plain spikes | yes |
| 124–125 | variant 1 | no |
| 126–127 | variant 0 | no |

On their first frame up, if Sonic's body box overlaps theirs, he is put on whole pixels on top of them (below them for the down ones) and hurt. Otherwise the up ones are a platform on that frame and the down ones aren't solid. For the rest of the up phase they are a platform: the up ones hurt him when he lands on them, the down ones when he bumps them from below. On every frame they aren't up, they drop him into the air if he stands on them and stop his push if the last test found one. With the gravity flipped (Cosmic Angel) the two kinds swap their tests; this game has no flipped gravity yet. Act 1 has two sets of up spikes, at (912, 1056) and (7856, 1584).

### Skating stones

Kind 84 (`CreateEntity_SkatingStone`, `0x0808C4BC`; `Task_SkatingStoneInit`, `0x0808C628`, while it waits and `Task_SkatingStone2`, `0x0808C970`, while it slides) waits at its spawn point until Sonic lands on it (`Coll_Player_SkatingStone`, a top-only test). He is then put in the air 44 px above the spawn point, standing, and lands on it as it starts to slide: left when `d1` is set, right otherwise. Each frame on the ground its speed changes by the cosine of four times the floor's angle over 1440 one way and Sonic is nudged by it over 6070 the other way; it settles 3 px into the floor and moves by twice its speed. Where the floor is more than 5 px below it, it leaves the ground: in Angel Island it leaps, up by 3/5 of its speed across, and in Ice Mountain it drops, down by 2/5; it then falls, gaining 32/256 px a frame, until the one-tile probe finds the floor. Each landing plays song 198 and uses up one of `d0` hops; the landing after the last one breaks it, and so does a wall tile 18 px to its right and 30 px up. Breaking throws Sonic up at 3 px a frame with the stone's speed, in the spin animation, stops song 198, plays song 143 and leaves four pieces (`CreateSkatingStoneDebris`, `0x0808D6EC`), two large and two small, that grow from 3/4 size, turn and fall for 61 frames as the boulder's do. While it carries him, walls either side of his centre push him off, it keeps him while his body overlaps its box raised 12 px, and a wall ahead knocks him off curled with no speed across. It is drawn 46 px below him (42 curled). It goes when its spawn point leaves the range, and a sliding one only when its current place has left the screen too.

Angel Island's stone is animation `547` (48 × 32, box (−24, −30, 24, 0)) with pieces `548` and `549`; Ice Mountain's is `529` with pieces `553` and `554`. Act 1 has two, at (2184, 704), which hops once and slides left, and at (6120, 2144), which slides right.

### Lifts, bowls, run wheels and updraft debris

Angel Island Zone carries Sonic with three kinds of object, and its whirlwinds have a fourth for show. The interactables' create table is at `0x080B806C` in the USA ROM (one pointer per kind). Every task here runs at priority `0x2000`, before Sonic's own frame, so it sees the input of the frame before. None of them reads its `d` bytes except the run wheel. Act 1 has 3 lifts, 2 bowls, 10 run wheels and 7 updraft debris; act 2 has 2 lifts, 7 run wheels and 8 debris; Casino Paradise has bowls too (2 in act 1, 4 in act 2).

**Lift** (kind 88, the lift half of `crane_claw_and_lift.c`). `CreateEntity_Lift` is at `0x0808A608`, and its tasks are `Task_LiftMain` `0x0808A768` (waiting), `Task_Lift2` `0x0808A950` (rising), `Task_Lift3` `0x0808AB68` (holding him at the top) and `Task_Lift4` `0x0808AD6C` (going back down). It is a handle (animation 545 variant 1, OAM order 15) under a chain of four links (variant 0, order 17). The links are drawn 16, 48, 80 and 112 px above the handle, but only 16, 32, 48 and 64 px above it while it holds Sonic at the top.
- *Waiting:* the lift catches him whenever his body box touches the handle's box, at any speed, on the ground or in the air.
  - It sets `MOVESTATE_IA_OVERRIDE` and zeroes all three speeds.
  - It calls `Player_TransitionCancelFlyingAndBoost` (`0x08046CB8`) and gives him charState 38, which hangs him from the handle (animation 43).
  - It starts SE_LIFT (181).
- *Rising:* for 64 frames the handle climbs to 128 − (64 − t) × 128 / 64 px, rounded toward zero, above its spawn point.
  - He hangs 3 px left of it if he faces right, or 8 px right of it if he faces left, 26 px below its top.
  - On the 65th frame SE_LIFT stops.
- *Holding:* a jump press lets him go.
  - It clears `MOVESTATE_IA_OVERRIDE` and `FLIP_WITH_MOVE_DIR` and zeroes his speeds across.
  - It sets his Y speed to −4 px a frame (`0xFC00`), calls the cancel again and gives him charState 5, the spin (`0x55` for Amy).
  - He keeps whether he was in the air. So if he was caught standing, his ground code takes over on that same frame and wipes the throw, and he just drops.
- *Going back down:* 60 frames after it lets him go, the handle slides back down over 30 frames, at (30 − t) × 128 / 30 px. It can then catch him again.
- *Dying:* if he dies while held, the lift lets go of him and goes back down.
- *Leaving:* the lift goes once its spawn point is out of the display's range and the handle is out of the camera's range. At the top it checks this before the jump press. It would go even while it holds him.

**Bowl** (kind 62, `bowl.c`). `CreateEntity_Bowl` is at `0x08080438`; the tasks are `Task_Bowl` `0x0808056C` (waiting), `Task_BowlRotating` `0x08080880` (sinking with Sonic) and `Task_Bowl3` `0x08080F90` (down).
- *Look:* the animation comes from `sBowlAnimations[gCurrentLevel]`: 546 in zone 5 and 486 everywhere else. Its tiles are always allocated for 486. It is drawn in OAM order 5 with BG priority 2, and stepped once when it is made.
- *Catch:* the bowl's box sits 5 px below it and 10 px toward the side away from Sonic. When his body box touches it, the bowl takes him:
  - its speed becomes |X speed| × 4, in 1/8192 px a frame, so a quarter of his speed across;
  - the angle he starts his swing at, `0x300` + |(x − bowl x + 48) × 512 / 96|, comes from his place across the bowl;
  - it clears his jump press, cancels his moves as the lift does, gives him charState 5 and sets `MOVESTATE_IA_OVERRIDE`;
  - it plays SE_BOWL (206). SE_BOWL_2 (207) and SE_BOWL_3 (208) follow 56 and 112 frames after the catch.
- *Sinking:* every frame:
  - he is put at x = bowl x + sin(θ) × 25 / (4n + 50), with θ = depth / 256 + start + (n mod 16) × 64, where n counts the frames since the bottom. That is a ±32 px swing that closes in at the bottom.
  - His y is put at bowl y − 17 + the depth.
  - The speed grows by 64 a frame, up to `0x8000` (4 px a frame). The animation runs at min(16, speed × 35 / `0xA000`) sixteenths of its speed.
  - It sinks 108 px in all (885 000 / 8192).
- *At the bottom:* every frame it sets his Y speed to (speed / 4 − 2000) × 2 / 256 px and puts him a further n × 180/256 px down, which stops at 11.25 px after 16 frames.
- *Release:* after 65 frames it lets him go in the middle of the bowl.
  - It sets `IN_AIR`, `SPIN_ATTACK` and `FLIP_WITH_MOVE_DIR` and clears `IA_OVERRIDE`.
  - His hitbox keeps its height, and he can't steer until the insta-shield.
  - The bowl then stays down and keeps counting its sounds, but catches nothing again.
- *Leaving:* the bowl goes when its spawn point is out of the display's range and the drawn bowl is out of the camera's range, even while it holds him.

**Run wheel** (kind 86, `run_wheel.c`). `CreateEntity_RunWheel` is at `0x0808E484`, and `Task_RunWheel` at `0x0808E5A8` runs `sub_808EA80` when Sonic isn't on it and `sub_808EC84` when he is.
- *Track:* `d0` × 45° clockwise from the right gives its direction, and `d2` × 16.875 px (4320/256) its length. The direction is rounded down to whole pixels first (`Div(COS, 6000)`), so the wheel moves 2 px every 12.5 px of travel, and 1 px each way on a diagonal.
- *Look:* animation 542, variant 1 turning forward and variant 0 back, stepped at |speed| / 28 sixteenths and only while it moves.
- *Not on it:* it is a solid platform (`Coll_Player_Platform`).
  - Landing on it gives him its speed as his ground speed.
  - It rolls back 12/256 px a frame faster every frame until it is back at its start.
- *On it, running:*
  - he is held on its top and runs on the spot, x = wheel x − X speed;
  - its speed becomes his ground speed − 16, doubled when forward, up to 2848 (11.125 px a frame);
  - while it rolls back and he isn't running forward, he is pulled back a quarter pixel a frame faster every frame, unless he is sliding;
  - his ground speed is kept between −9 and 4.5 px a frame;
  - back at its start it stops, and stops him too unless he is attacking.
- *On it, jumping or attacking:* in the air he leaves it with at most 1.125 px a frame across. Attacking on it keeps at most 2.25 px a frame.
- *Hurt or dead:* he is let go.
- *Sounds:* SE_RUN_WHEEL_A (212) every 25 frames while it is slower than 5 px a frame, B (213) every 16 below 8.1, C (214) every 8 above. The count restarts when he lands on it or leaves it.

**Updraft debris** (kind 97, `updraft.c`). `CreateEntity_Interactable097` is at `0x0809215C` and `Task_Interactable097` at `0x0809226C`. It is only a sprite at its spawn point (OAM order 18, BG priority 2), not stepped when it is made.
- *Look:* `d0` = 0 shows animation 564 (an 8 × 8 piece, 4 frames a step), `d0` = 1 shows 566 (8 × 8, 5 frames) and anything else 565 (8 × 16, 6 frames). Each rises 64 px, 8 px a step, and starts over.
- *Leaving:* it goes when its spawn point leaves the camera's range.
- Act 1 puts the debris inside the three whirlwinds (kind 90) of its shaft at x 3072.

### Iron balls

Kind 82 is a spiked iron ball (`iron_ball.c`; `CreateEntity_IronBall` at `0x0808B999`, entry 82 of the interactables' table at `0x080B806C`, and `Task_IronBallMain` at `0x0808BB11` in the USA ROM). Angel Island act 1 has two over the pit at x 1352–1512: (1352, 1232) and (1512, 1232), both with `d2` 7 and `d3` 2, the second with `d0` 251. Egg Rocket has three, at (3136, 1408), (2656, 1448) and (2664, 1728).

It swings with the stage clock (`gStageTime`, `0x03005120`): across when `d2` > `d3`, else up and down, by `d2` × 8 (or `d3` × 8) px times the sine of 4 × ((stage clock + phase) & 255), in 1024ths of a turn (the sine table at `0x0809B3F0`, ±16384). So it makes one swing every 256 frames, either way of its spawn point. The phase is 128, half a swing later, when `d0` (across) or `d1` (up and down) is negative as a signed byte. Act 1's second ball swings opposite to the first.

It is animation `541` in Angel Island and `510` everywhere else (`LEVEL_TO_ZONE(gCurrentLevel) == ZONE_5`, at `0x0808BA98`), in OAM order 18 at priority 2. Its sprite runs its script only once, when the ball is made, so its frame and its box, (−20, −20, 20, 20), never change. It isn't solid. On every frame Sonic is alive and his body touches that box where the ball is (`Coll_Player_Entity_Intersection`, `0x0800CE34`), it hurts him as spikes do (`Coll_DamagePlayer`). It goes when both its spawn point and where it is are outside the range around the camera.

### Objects shared with Ice Mountain

The moving springs (kind 81), square platforms (55), sinking platforms (85) and the breakable wall (114) are Ice Mountain's code with zone 5's looks (see *Zone 5's own look*); the moving springs keep the default animation `540`, variants 0 and 1. Placed on one of each in act 1, Sonic and the camera match mGBA on every frame, and so does the picture apart from objects that weren't built when it was checked.

### How it was checked

mGBA 0.10.5 started level 8 from the character select, with `gCurrentLevel` held at 8 (instruction by instruction) until the game had written it, and recorded IWRAM, OAM, palettes, the I/O registers and a screenshot of each frame. Engine step *k* matches the recording's frame 3858 + *k* in IWRAM (Sonic, the camera, the ring count at `0x03004FEC`, the course time at `0x03005034` and the stage clock at `0x03005120`), and its picture is the screenshot of frame 3859 + *k*. Recordings that start elsewhere in the act move Sonic there on one frame, in both.

- *From the start to the goal:* a run from the act's first frame, found by searching the engine for inputs and then played in mGBA. It goes past the waterfalls, through a whirlwind and over the bounce blocks, up the run wheels and a lift from the third checkpoint, round the top of the act and down the shaft beyond it, down the long slope onto the skating stone, and from the fourth checkpoint on a lift and the platforms to the goal, defeating five enemies and passing three of the four checkpoints with 87 rings. Sonic, the camera, the rings and both clocks match on all 9,290 frames up to the goal post, where the original stops the clock for the act's end. One Leon, at (4672, 560), has its first-shot count set to 0 in the original as well: left as it was, it held 2,064 and never shot, so Sonic missed it, where the engine's Leon had stopped to shoot and he bounced off it. Of every tenth picture, 925 of 929 are identical. On one, a defeated enemy's score rises across the ring counter: the GBA puts a lower OAM order in front of the counter whatever their priorities, and the renderer always draws the HUD on top. On the last three, the original's goal sign comes on screen.
- *Title card, background and clouds:* the first 541 frames, waiting through the card, are pixel-identical, the fade, the blending and the cloud scroll included; so are the first 435 frames of a run walking right, up to where the first Leon comes on screen. The whole 640-frame walk matches in state when the engine's first Leon starts with the 360 the original's memory held.
- *Music:* the stage init starts song 20 on frame 3856, and the sound engine first sequences it on the next. A fresh port of the engine that only starts the song there stays identical to mGBA's for the 1,344 frames recorded (3857 to 5200): every active track of the BGM player (flags, wait, key, volume, command pointer) and every byte the DirectSound mixer writes. The Game Boy channels' readable registers match on every frame too once the port's envelope counter (`c15`, which counts 14 to 0 every frame since the sound engine started) is given mGBA's phase; started from 0, as the browser starts it, a PSG note can end a frame early or late, as that phase depends on how long the menus took.
- *Objects every zone has:* recordings that move Sonic onto act 1's bounce blocks, its moving thin platform and falling platforms, its up, big, left, small up-left and down springs, two boosters, the grind rail, the second incline ramp and the first checkpoint match the engine on every frame.
- *Enemies:* nine recordings dumped the whole of IWRAM after every frame. Sonic walks past the first Leon, with its first-shot count poked to 0, waits in its tongue's reach until it hits him, and destroys a Leon. Beside the Wamu he waits through its swings and turns, destroys its head with a jump, and is hurt by one of its segments and, in another run, by its head, through the restart. Two more runs poke the level number for the frame of the Wamu's defeat to free Secret Base's robin and Casino Paradise's parrot. The whole game matches all of them on every frame (7,990 in all): Sonic, the camera, the rings, the stage clock and the score. The picture is pixel-identical on 1,936 of the 1,953 frames compared; on the other 17 a moving spring (kind 81), which wasn't built when they were checked, shows in the original.
- *Whirlwinds, hiding spikes and skating stones:* Sonic dropped at the bottom of the lowest whirlwind rides all three to the top, with left and right held at times and a jump pressed inside, hovers at the top edge and steps onto the ledge (420 frames), and jumps curled into the top one (200 frames). He stands beside the first hiding spikes through two cycles (240 of 240 frames pixel-identical), stands where they come up, is dropped onto them while they are up, and, invulnerable, stands on them as they sink and rise again; a fifth run lands in the second set (453 frames compared in all, every one pixel-identical). He rides both skating stones to their break (600 and 1000 frames; 40 of 40 and 45 of 50 pictures, the others showing objects that weren't built then). Sonic, the camera, the rings and both clocks match on every frame.
- *Lifts, bowls, run wheels and updraft debris:* five lift runs (caught standing, so the throw is wiped; caught in the air and thrown; a full cycle, caught again facing left; the lift at (5128, 1344); let go over a pit, through the death and restart), three bowl runs (caught slowly and carried to the landing, caught fast, and the second bowl run into from below), five run wheel runs (landing, driving, rolling back, running back, jumping off and landing again; a wheel moving down and one moving up; the end of the track, the speed cap and the B attack on it; a diagonal one) and three runs past and through the updrafts. Sonic, the camera, the rings and both clocks match on every frame of all of them, and every picture compared matches apart from a moving block that wasn't built then (the diagonal wheel's pictures weren't compared).
- *Iron balls:* Sonic with 5 rings just right of the first ball's reach is hit when it swings into him, on the same frame in both, and knocked back (120 frames, 60/60 pictures); moved into each ball he is hit on the frame he arrives (120 frames each); with no rings the first ball kills him, through the restart and the title card (200 frames, 67/67 pictures); and standing either side of the pit he watches both swing past (300 frames each, 119 of 120 pictures). Sonic, the camera, the rings and both clocks match on every frame; the few pictures that differ do so at the screen's edges, away from the balls.
- *Spikes, torches, waterfalls, lava and boulders:* the right-pointing spikes stood on (120 frames) and touched from behind (80); three runs past the torches (70, 67 and 67 frames, pixel-identical); riding the waterfalls down into the lava (120 frames, 39 of 40 pictures; on the death frame mGBA shows the GBA's sprite-priority quirk, which the renderer doesn't copy); holding left, then right, then jumping in a waterfall (220 frames, 55/55 pictures) and under a ceiling (150 frames, 50/50); watching the boulders roll, where every boulder's position matches on every frame; hit by one with 5 rings (330 frames, 110/110 pictures); and invincible, so one lands twice and breaks (330 frames, 165/165 pictures, every piece included). Landing on a kind 16 boulder and breaking it matched for 130 frames; one colour of its pieces differs, as the dust cloud loads its palette into the pieces' row in the original. All of them match in state on every frame.

Read in the code only: Sonic dying while a lift or bowl holds him, one of them leaving while it holds him, the run wheel's hurt path, the bowls outside zone 5 (animation `486`), the lift's, bowl's and run wheel's sounds, Leon's absence on Easy, the stale tongue box on a later shot, the animal table past level 12, the sitting and hopping animals of zones other than Neo Green Hill and Angel Island (same code, unrecorded sprites), the lava's hurting variant, songs 201 and 144 (checked as the engine's calls, not against the ROM's audio), a boulder breaking off the camera, a spawner leaving while its boulders still roll, and the swapped VRAM of the pieces, a whirlwind with `d0` set and its sounds, the down hiding spikes (none in act 1), the iron ball's other look (`510`) and its up-and-down swing, Ice Mountain's skating stones and their drop, and songs 198 and 143.

## Sonic Advance 2, for Boost Mode

The optional Boost Mode (see the [README](../README.md#sonic-advance-2-boost-mode)) reads a few things from your own Sonic Advance 2 ROM, in your browser. Like the Sonic Advance ROM, it is never uploaded; it is kept in this browser's IndexedDB under a key of its own. The ROM is recognized by its header (title `SONICADVANC2`, a game code starting with `A2N`). Only the USA version (`A2NE`) has been tested. Sonic Advance 2 keeps its sprites and its sound engine in the same formats as Sonic Advance, so [`src/rom/sa2.js`](../src/rom/sa2.js) finds them with the same searches. [`src/rom/sa2boost.js`](../src/rom/sa2boost.js) then reads what Boost Mode uses.

| Data | In the USA ROM | Used for |
| :--- | :--- | :--- |
| Sprite tables | `0x0F40D4` | Everything below |
| Sonic's boost palette | Animation 74, whose script only loads palette 5 (16 colours) | The afterimages. Sonic's palettes in the two games use the same layout, so each of Sonic Advance's colours becomes the boost palette's colour at the same index. |
| Boost particles | Animation 873: 8 × 8 frames in palette 23. Variant 0 loops two frames; variant 1 plays those two three times, then four more frames, and stops | The sparks at Boost Mode's start |
| Music players and songs | `0xAD4F1C`, `0xAD4F4C` (507 songs) | Song 221, the start sound: one track on music player 2, priority 20 |

The rules' numbers are in [`src/engine/constants.js`](../src/engine/constants.js) (`BOOST_MODE`). They come from these tables in the game's code, which are not read at run time:

| Table | In the USA ROM | Values |
| :--- | :--- | :--- |
| Acceleration and deceleration by ring tier | `0x0D6902` | {8, 64}, {12, 64}, {14, 64}, {16, 64}, {18, 64} in 1/256 px. The tier is 0 for 10 rings or fewer, then 1 above 10, 2 from 50, 3 from 100 and 4 from 150. |
| How full the meter must be, by tier | `0x0D6916` | `0x800`, `0x7F8`, `0x690`, `0x5A0`, `0x438` |
| The afterimages' delays | `0x0D5674` | 2, 4 and 6 frames |

**What the game does each frame**, before Sonic moves: it picks the tier from the ring count. Out of Boost Mode, it empties the meter while Sonic is in the air or slower than his top speed, and starts Boost Mode when he is on the ground at that speed with the meter at the tier's value. Then the start sound plays, the particles are made and the camera's sideways speed limit (normally 16 px, kept in 1/256 px) drops to 4 px, to climb back by 1/8 px on each of the camera's updates. In Boost Mode, the meter is set back to the tier's value on the ground, and the mode ends when the ground speed is under 4.5. While Sonic moves, holding the way he runs at or above his top speed adds the tier's acceleration to the meter instead of to his speed. Getting hurt, the act's start, boosters and fast side springs set or clear the mode outright.

**The afterimages** keep Sonic's position and his sprite (animation, variant, speed, flags and angle) for the last 16 frames, at the end of his task. Three tasks after his each copy what he was 2, 4 or 6 frames before into a sprite of their own, step that sprite's animation, and turn it through the rotation hardware when his was. Each also counts 0, 1, 2 on every frame they run and is drawn only when its count is its own number, so one afterimage shows per frame, starting with the 4-frame one. The sprites go in Sonic's OAM order just after him, so behind him, with his background priority and the boost palette loaded as sprite palette 1. They are opaque, and they don't get the pixel Sonic's own sprite is moved by when he faces one way or the other.

**The particles** are one sprite drawn up to eight times a frame, around Sonic's current position. All sixteen get their distance, direction and speed from Sonic Advance 2's own random numbers, seeded with Sonic's position and the camera's: sixteen to twenty-four pixels ahead of him, flying off across his path and slowing to 200/256 of their speed each frame. On the tenth frame the random numbers are seeded again and each gets a new speed in a random direction, while all of them drift back the way he came, 4 px a frame and a little more on each step. Every second frame the sprite's animation is stepped eight times, which the eight copies share, since they all show the same tiles.

**How it was checked.** mGBA 0.10.5 recorded Leaf Forest act 1 in the tested ROM with Sonic running right and 200 rings, dumping his state, the camera and the sprite table after every frame. The meter rose by 18 a frame and started Boost Mode at 1080 with a top speed of 12 and a cap of 15, the camera's limit went from 1024 up by 32 a frame, and the afterimages showed at the delays and in the order above. The port's particles land on the same pixels as the recorded ones on all 25 frames they show.

## Sonic Advance 2 tricks

The optional mid-air tricks (see the [README](../README.md#sonic-advance-2-tricks)) read their sprites and sounds from the player's own Sonic Advance 2 ROM, in the browser like the Sonic Advance one, and follow Sonic Advance 2's player code as the [SAT-R](https://github.com/SAT-R) decompilation of that game describes it. [`src/rom/sa2.js`](../src/rom/sa2.js) opens the ROM and [`src/rom/sa2tricks.js`](../src/rom/sa2tricks.js) reads what the tricks use; nothing of Sonic Advance 2 is in this repository.

| Version | Game code | SHA-1 | Status |
| :--- | :--- | :--- | :--- |
| Sonic Advance 2 (USA) | `A2NE` | `7bcd6a07af7c894746fa28073fe0c0e34408022d` | Tested |

The other versions (`A2NJ`, `A2NP`) are recognized by their header, and their tables are searched for by shape as for Sonic Advance, but they are untested.

**Tables.** Sonic Advance 2 keeps its sprites and songs in the same formats as the first game, so the same searches find them: the sprite tables at `0x0F40D4`, and the four music players at `0xAD4F1C` followed by 507 songs at `0xAD4F4C` (offsets in the USA ROM).

**Sprites.** Sonic's tricks are animations 48 to 51 of its sprite tables, drawn with animation 48's palette into a sprite sheet of their own:

| Animation | Variants | What it is |
| :--- | :--- | :--- |
| 48 | 0, 1, 2 | Hop Jump: the wind-up, the rise, the fall once he comes down |
| 49 | 0, 1 | Humming Top: the wind-up and the spin (with an attack box 28 × 30 px) |
| 49 | 2 | The Humming Top's spin effect, a sprite of its own |
| 13 | 0 | The fall the Humming Top ends in |
| 50 | 0, 1 | Back Star: the wind-up and the flip |
| 51 | 0, 1, 2 | Bound: the wind-up, the dive (both with an attack box 16 × 16 px), the rise after the bounce |
| 51 | 3 | The Bound's afterimage |

The animation scripts set Sonic's body and attack boxes as in the first game, so enemies, rings and item boxes treat him the way they do in his own moves.

**Rules.** The routines are at these GBA addresses in the USA ROM:

| Routine | Address | What it does |
| :--- | :--- | :--- |
| Trick button | `0x08028ADC` | A fresh press of R picks the trick from the held d-pad: up first, then down (the Bound), then the way Sonic faces (Humming Top), otherwise the Back Star. It adds 100 points and only sets the next frame's routine, so the press frame moves as before. It is skipped while a spring's short delay runs: 4, 3, 2 or 2 frames by the spring's speed (`0x080D69C2`), counted down once a frame. |
| Trick start | `0x080286F0` | Ends any attack, keeps Sonic's facing in the air, sets his sprite offset to 14 (5 px up from a curled jump's 9), stops him, and plays songs 116 and 230 |
| Wind-up | `0x080287AC` | No gravity and no steering until the wind-up animation ends; then the trick's next variant and its speed: Hop Jump (0, −6), Humming Top (6, 0), Back Star (−5, −3.5) in px per frame, with x turned for facing left (`0x080D693A`). The Humming Top starts its spin effect. |
| Trick | `0x0802890C` | Air control as in a jump without turning round, the air drag while rising, then gravity, then the move, capped at 15 px a frame down. The Hop Jump turns to its falling variant once he comes down, and the Humming Top to the fall (animation 13) after 45 frames. Landing ends it as any landing does. |
| Bound start | `0x08011F1C` | Stops him, without a sound |
| Bound wind-up | `0x080123FC` | No gravity until the wind-up ends; then the dive at 2 px a frame down, and its afterimages |
| Bound dive | `0x08011F94` | 56/256 more speed down each frame. Touching the ground sends him back up at 6 px a frame: the bounce's vertical part is `−\|6 cos θ\|` and half of `6 sin θ` sideways, for the ground's angle θ, and plays song 223. |
| Bound rise | `0x08012460` | 56/256 less speed up each frame, without steering, until he falls; then the rise variant and ordinary air movement |

The spin effect follows Sonic, mirrored his way, in front of him, until his animation changes. The afterimage is drawn behind him once a frame from where he was 6, 4, 2 and 0 frames before in turn, while the dive is still at 2 px a frame or faster. Both run just after Sonic each frame (task priority `0x4001`).

**Sounds.** Sonic Advance 2 sets its sound engine up exactly as the first game does (5 DirectSound channels, master volume 15, 10512 Hz), with the same structures at the same EWRAM addresses, so a second copy of the same [port](#sound) plays its songs, added to the first one's output:

| Sound | Song | Player | When |
| :--- | ---: | ---: | :--- |
| Jump | 116 | 2 | A trick starts (not the Bound) |
| Trick | 230 | 2 | Right after the jump sound, on the same player, so it takes the jump sound's place before that one sounds |
| Bound | 223 | 2 | The Bound hits the ground |

**How it was checked.** The reference is mGBA 0.10.5 running the USA ROM in Leaf Forest act 1 with each trick done after a jump, dumping Sonic's state, the sprites and the sound engine after every frame. Started from Sonic's recorded state at the press, the port follows his position, speeds, animation and sprite offset frame by frame through the wind-ups, the tricks and the Bound's dive; the bounce gives the recorded speeds off the recording's slope (angle 10: 186/256 sideways, −1488/256 up) and the same rise to the top on flat ground; and its sound channels match the recorded ones on every frame of the three songs (60 frames for the trick's start, 77 for the Bound) once the Game Boy channels' envelope clock is in the same phase. The port's own 59.7275 Hz sound frame starts the songs within a frame of the trick, as it does for Sonic Advance's sounds.

**Where it differs.** In Sonic Advance 2 the tricks only follow a launch (springs, ramps, grind rail ends, dash rings); here they work in any jump, once each time Sonic leaves the ground. Sonic Advance 2 also starts the Bound with B in the air, and allows a trick after a side spring on the ground; neither is here. Its trick sounds share the engine with its music and can lose a Game Boy channel to it; here they have an engine of their own.
