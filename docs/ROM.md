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

### Rotation hardware

Some sprites go through the GBA's rotation and scaling (affine) OBJ mode instead of plain flips: Sonic's walk and run frames (and the walk frames he tumbles in after a bounce block, character state 23) and the boulders' debris. The extractor keeps those frames' OAM pieces as their tiles hold them, and the renderer draws them pixel by pixel ([`src/engine/renderer.js`](../src/engine/renderer.js)).

- **Matrix** (`TransformSprite`): from the rotation `r` (0–1023 per turn) and the 8.8 scales `sx`, `sy`, with `c = COS_24_8(r)` and `s = SIN_24_8(r)` (the sine table's Q2.14 values shifted right 6), PA = `c × Div(0x10000, sx) >> 8`, PB = `s × Div(0x10000, sx) >> 8`, PC = `−s × Div(0x10000, sy) >> 8`, PD = `c × Div(0x10000, sy) >> 8`, each kept to 16 bits. A negative scale mirrors the sprite.
- **Placement:** the transform moves the sprite so its anchor stays at (x, y) once turned. With `ax` the anchor X (or `width − ax` when `sx` is negative), `ay` likewise, and the half-sizes `hw`, `hh`, it subtracts `(c|sx| × (ax − hw) − s|sx| × (ay − hh) + hw × 256) >> 8` from x and `(s|sy| × (ax − hw) + c|sy| × (ay − hh) + hh × 256) >> 8` from y (each product `>> 8` first). `DisplaySprite` then places each OAM piece at its own offset in the frame, ignoring the frame's flip; with the double-size flag it first moves the sprite up and left by half the frame's size. The hardware reads a rotated entry's flip bits as part of its matrix number, so the pieces keep their tiles' orientation.
- **Sampling:** every piece turns around the centre of its own box (its size, or twice it at double size), clipped to that box. For each line, mGBA 0.10.5's software renderer starts from `PA × (−1 − w/2) + PB × (line − h/2) + 128 × size` in 8.8 fixed point, skips ahead to the first column inside the piece by integer division, then steps PA and PC a column and takes the nearest texel, ending the line's run at the first texel outside the piece. A piece earlier in the frame has the lower OAM index and stays in front of a later one.
- **Sonic** uses matrix 0 without double size and a single 64 × 64 piece. His transform scale is −1.0 when he faces right (which also moves him 1 px left, `MACRO_8024B10_PSI_UPDATE`) and +1.0 facing left, and his rotation is his angle times four. The matrices this produces match the OAM that mGBA's recordings hold.

### Stage layers

- Each stage layer is a 12 × 12-tile metatile map (96 × 96 px per metatile) with a 4bpp tileset and a 256-colour palette. Sonic Advance stores one byte per metatile.
- A tile entry packs the tile index (bits 0–9), horizontal and vertical flips (bits 10–11) and the palette bank (bits 12–15).
- The tilemap table has three entries per level: the front layer, the back layer and the background. Neo Green Hill Zone act 1 is entries 0, 1 and 2; its background is a 256 × 256 px plain map.
- The front layer is drawn over Sonic (hardware background 1, priority 1), the back layer behind him (background 2, priority 2, the same as his sprite), the background behind both.
- The front layer's header also describes animated tiles: the first `animTileSize` bytes of the tileset (`0x1C0`, 14 tiles in act 1) are replaced by the next of `animFrameCount` frames every `animDelay` frames. Frame 0 is the tileset itself and frame *k* is the *k*-th block stored after it. Both layers share the tileset, so the animation shows on both.
- **Palette animations.** The act's stage init makes two tasks (priority `0x2000`, after the rings and entities managers) that each run an animation whose commands only load colours into the background palette: animation `814` loads sprite palettes 190–193 into row 15 (colours 240–255), each shown for 16 frames, and `815` loads palettes 194–201 into row 10 (colours 160–175), one a frame. Each palette is the one before it turned by one place, so the colours cycle. Row 10 colours the waterfalls in the stage's layers (five metatiles use it) and row 15 the sea in the background. The tasks step their animation as any background animation is stepped, at speed `0x10`: on the act's first frame each loads its first palette, which then shows for its delay. When the act starts over, it loads the stage's own colours again and both animations start from the beginning. The extractor renders the layers' metatiles that use those rows, and the background, once for each state, and the renderer picks the one the tasks have loaded.

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

**The task list.** The original runs everything as tasks in one list, sorted by priority, and the engine does the same with the same priorities. In act 1 a frame runs the grind rails' ends (`0x900`), the camera (`0xF00`), the forced slide (`0x1000`), then at `0x2000` the ring manager, the entities manager, two palette animations and every object, enemy and effect in the order they were made, then the scattered rings and the grind sparks (`0x2001`), the title card and its pieces while it runs (`0x2100`, `0x2120`), the HUD once the card has ended (`0x2180`), Sonic (`0x3000`), the GamiGami shots, the music manager (`0x4000`), the Buzzer shots (`0x9000`) and the stage's clock (`0xFF00`). A new task goes after the last task of its priority. The list fetches the next task before it runs the current one, so a task made by the one just before its place only runs from the next frame.

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
- **Bounce block:** landing on it throws Sonic up at 5 px a frame, facing the way he holds the d-pad, in the walk animation (character state 23), and plays the spring's song 170. In that state he keeps facing that way in the air, and he tumbles: his angle turns 4/256 of a turn a frame the way he faces, drawn through the rotation hardware. That angle also turns off the push out of an object's sides while it points him at a wall, so he can fall past a bounce block's side into the one below. The block wobbles for 30 frames, up to 16 px up and down.

A thin platform goes when its spawn point is off the screen and its current position is out of the range around the camera. A falling one goes the same way until it falls, then when its current position is out of range. A crumbling one goes when its spawn point is out of range, and once it crumbles, only when it is out of range sideways.

### Boulders

Act 1's three boulders are kind 16, at (2152, 440), (7080, 728) and (7320, 1184). A boulder is animation `458`, one 48 × 32 frame with the box (−16, −28, 16, −2). It is solid like any object, so Sonic can stand on it and push against it, and it goes like the other objects when its spawn point leaves the range.

Before the solid test, a boulder checks whether Sonic breaks it (`sub_800C394`). He breaks it when he is curled up (jumping or rolling) and falling, with his side probe made 1 px taller at each end touching its box, or when his attack box touches it and he isn't curled. Falling, he bounces back up at the same speed. Rolling or spin dashing into it on level ground doesn't break it: he stops against it.

A broken boulder leaves the dust cloud, lifts Sonic into the air if he stood on it, plays song 167 and never comes back until the act starts over. Four pieces fly out for 61 frames: two small ones (animation `459`, 8 × 8) and two large ones (`460`, 16 × 16), drawn in front of the layers through the rotation hardware at double size:

- They start 16 px (pieces 1 and 3) or 32 px (pieces 2 and 4) above the boulder and move across 2, 1, 2 and 1 px a frame (left, right, right, left).
- They rise at 2 px a frame, slowing by 40/256 px a frame per frame.
- They turn by 42, 42, 14 and 14 in 1/1024 of a turn a frame, pieces 1 and 4 one way and pieces 2 and 3 the other.
- They grow from their own size to twice it, by 8/256 a frame.

The original places each piece through its sprite transform (`sub_8004E14`), around where the boulder was on the screen on the frame it broke: the piece's offset from there, as the camera moves, is multiplied by its scale over 512. So the pieces start at half their offset and drift out while they grow. The transform then builds the matrix and subtracts the turned anchor the way `TransformSprite` does (see [Rotation hardware](#rotation-hardware)). A piece is left out once its double-size square is off the screen.

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
- draws the splash under him (animation `474`, in OAM order 3 and BG priority 2, mirrored when `d0` is set) at his centre, stepping its animation only on those frames.

His own step then runs with the slope's pull and the walk's friction, so he slides at about 4 px a frame. It only starts on him once the one-tile floor probe from his centre (`sub_801F07C`) finds the ground within 3 px; walking in, that happens a few pixels down the slide. Zone 5 also plays song 201 when it starts.

In the box but in the air, it lets go of him on the first such frame: his controls come back, with the jump and attack buttons he holds counting as held, so he can't jump or attack until he presses them again. That is how it ends in act 1, as the slide drops away under him. Leaving the box on the ground while it holds him lets go the same way and fades out sound effect player 2 (`m4aMPlayFadeOut`, speed 4); in act 1 he can't leave it that way.

It never goes: it would leave once its spawn point is out of the range, but only on a frame no character is in its box, and in a one-player game the partner's slot always counts as one that is. So once the camera has passed near it, it stays in the task list until the act starts over.

### Casino Paradise act 1

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

### Rings

Rings use the interactables' grid, with 2-byte records `x, y` (tiles inside the region) ending with `0xFF`. Act 1 has 291. A ring is a 16 × 16 px sprite with its bottom centre on that point: animation `707`, four frames of 8 ticks each, in sprite palette 68. Every ring shares one sprite, so they all spin together.

The ring manager runs after the camera and before the objects and Sonic, so it tests where he was at the end of the previous frame. It doesn't spawn rings: each frame it searches the regions under Sonic's box (±6 px wide, ±`spriteOffsetY` tall around his centre) and collects every ring whose 16 × 16 box it touches, edges included. A collected ring is marked in the list and never comes back until the act starts over. Two quirks come from its region search:

- The search stops 16 px short of the box's bottom and 8 px short of its right side, so a ring just inside the next region down or to the right can be missed for a frame.
- Region numbers are 16-bit, so a box reaching above or left of the map searches nothing.

Rings are drawn from the regions the screen's top-left corner and the screen cover, while a ring is no more than 8 px off the screen's left or right side, its bottom isn't above the screen's top edge, and its top is no more than 16 px past the bottom edge. In the sprite list they come behind the objects and Sonic.

Each ring adds 1 to the count, and passing a multiple of 100 gives a life. It also leaves a sparkle (animation `708`, four frames of 8 ticks, then gone), but only while fewer than 8 are showing; beyond that, a ring still counts but makes no sparkle and no sound. Sparkles run after the objects from the frame they appear, and are drawn in front of Sonic.

**How it was checked.** mGBA 0.10.5 recorded two runs through act 1 with Sonic's position and the original's ring list dumped after every frame. Replaying the recorded positions, the port collects the same rings on the same frames in both (14 and 23 rings), and none the original didn't. On each of those frames, the sound engine port loaded with the dumped state and given the two ring sound calls ends up identical to the original's. The region-search quirks are taken from the code; neither run hit them.

### Spikes

The spikes are animation `454` in sprite palette 35: variant 2 points up, variant 3 sideways, flipped to point left. Act 1 has four that point up (kind 1) and five that point left (kind 3). They are solid like any platform. The up spikes hurt Sonic when he lands on them, and the left-pointing ones when he touches their left face. Touching a left-pointing spike's back face puts him out past its left face, as the code reads; in act 1 their backs are against walls. A hit by spikes plays song 171.

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
2. A freed animal. Neo Green Hill's are the otter (`445`), the koala (`450`) and the kangaroo (`449`), in turn. It hops up at 4 px a frame and lands on the ground; the otter and the koala then sit, and the kangaroo hops away to the left at 2 px a frame.
3. The points (`709`): 100, 200, 400, 800, then 1000 for each enemy after that, counted since Sonic last touched the ground. They rise 1 px a frame for 60 frames, stay for 30 more and go. Every 50,000 points give a life.

The defeat plays song 138.

### Casino Paradise's enemies

| Kind | Enemy | Act 1 | Animations | What it does |
| ---: | :--- | ---: | :--- | :--- |
| 8 | Hanabii | 4 | `415`: walking 0, launching 1; shot `419`, firework `416` | Walks 0.625 px a frame between (`d0` + 1) × 8 and (`d0` + `d2`) × 8 px right of its spawn point, following the floor, and turns at either end. Away from the ends, with Sonic within 100 px, it stops for 19 frames and launches a shot on the 7th, then walks on and doesn't launch again for 100 frames of walking. The shot rises from its mouth at 944/256 px a frame, slowing by 44/256 px a frame per frame, and when it has nearly stopped it bursts into a firework that hangs there for 20 frames, drawn four times mirrored around its point. Only the unmirrored quarter's box hurts. |
| 9 | Slot | 10 | `417`: floating 0, dropping 1; coin `420`, pieces `421` | Floats 0.625 px a frame between `d0` × 8 and (`d0` + `d2`) × 8 px right of its spawn point, bobbing up to 20 px above that line every 32 frames. Away from the ends, with Sonic's centre within 16 px across, it stops for 20 frames and drops a coin, then floats on for 100 frames before it can drop another. The coin falls, gaining 40/256 px a frame each frame, and shatters on the floor or on touching Sonic: six pieces fan out by the floor's angle at a random share of its speed, bounce, slow down and go after 45 frames, blinking for the last 30. The pieces don't hurt. Its sprite is a left half, drawn again mirrored. |
| 10 | Pierrot | 5 | `418` | A clown on a ball, from [#76](https://github.com/NahuelGenchi/onsoku-advance/issues/76). It rolls 0.625 px a frame between `d0` × 8 and (`d0` + `d2`) × 8 px right of its spawn point, following the floor. The ball can't be broken: Sonic curled up bounces back off it, turned round, and it hurts him any other way. The clown on top is defeated as any enemy is. |

A defeat in Casino Paradise frees a lion (`440`), which sits, a peacock (`439`), which hops away, and a parrot (`442`), which flies off swaying, in turn (`sAnimsTrappedAnimals`, `0x681154` in the USA ROM; [#77](https://github.com/NahuelGenchi/onsoku-advance/issues/77) built every zone's).

Kept from the original (issue [#56](https://github.com/NahuelGenchi/onsoku-advance/issues/56)): the Hanabii squares its distances to Sonic into 16 bits (`CamCoord`), so from 182 px away along either axis the square wraps negative and it launches as if he were within 100 px.

**How it was checked.** mGBA 0.10.5, from act 1 with Sonic placed by memory writes: a Hanabii walking and launching (1000 frames, its own task's memory matching on every frame) and one launching at Sonic held 182 to 199 px away, the 16-bit wrap (900); a Slot dropping coins on Sonic, the coin shattering on the floor and on him (1000 and 880); Pierrots rolling on screen in three runs; and a Slot defeated three times, with the game's next-animal counter (`gTrappedAnimalVariant`, `0x0300501C`) set to each animal (750 frames each). Sonic's state and every screen match.

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

Sonic dies when a hit finds him without rings (thrown up at 3.0) or when he falls out of the bottom of the act (thrown up at a jump's speed). On that frame the camera's target and the stage clock stop, a push ends (so he doesn't show the push animation as he falls), song 119 plays and the music plays on. His blink timer is set to 2, counts down once and stays at 1. He then falls through everything, in front of the front layer, until his centre is 240 px below the top of the screen. He disappears there, and 61 frames later he loses a life.

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

The HUD is twelve sprites at priority 0, in front of every layer and sprite. It comes from the UI graphics table, whose entries are a tiles pointer, a palette pointer, then the tiles per glyph, the sprite size and shape, and the width and height in tiles. Tiles are 4bpp with the low nibble on the left. The HUD uses three entries:

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

**Skipping and the end.** A press of A, B or the pad from the card's 36th frame to its 214th sets it to its 215th frame, sets the fade's step to a tenth of what is left, and steps the fade once at once. Everything then slides out, and the card ends on its 226th frame with nothing drawn (see [Dying and the restart](#dying-and-the-restart) for what it holds). The HUD appears the frame after. The card plays no sound.

**What mGBA shows.** mGBA (the reference) darkens its 8-bit colours rather than the GBA's 5-bit ones: red loses `r × bldY / 16` rounded down, green and blue keep `g × (16 − bldY) / 16` rounded down. The renderer does the same, so its frames match mGBA's.

**How it was checked.** mGBA 0.10.5 recorded the act from its first frame with OAM, palette and I/O registers, VRAM and work RAM dumped after each frame, and a screenshot of each frame. One run waits through the card. Ten more press A on the card's 36th, 37th, 51st, 91st, 105th, 106th, 107th, 151st, 215th and 216th frames (the first and the last don't skip). One more runs Sonic into the spikes until he dies, and waits through the restart and the card again.
- *OAM and fade:* the card's sprites, as OAM attributes, and `bldY` match the original's on every frame of the card in all eleven runs where it plays from the act's start.
- *Screenshots:* the engine's frames match mGBA's screenshots pixel for pixel on every frame of the card in all twelve runs, the restart's card included, and on the frames after it to the end of each run (the HUD's first frames and its zero-ring flash included), except where Sonic walks up and down slopes: the renderer draws his walk frames through a canvas rotation, which doesn't match the GBA's rotation hardware pixel for pixel (his position does). Every one of the 188 frames that differ in the restart run is such a frame, with all the differing pixels around him.
- *The rest of the game:* the engine before and after the card was drawn plays 11 input runs (33,000 frames, one of them through a death and the restart, two skipping the card) to exactly the same state on every frame: Sonic, the camera, the objects, the rings, the score, the clocks and every sound.
- These recordings also showed the background's cloud bands one frame ahead of the original: they scroll with the stage clock from before that frame's tick, as the layers' animations do.

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

Other details the engine reproduces: rolling starts from any ground speed, a jump out of a roll has no air control until the insta-shield, the spin dash release frame doesn't move, the crouch and look-up animations play a short release before idling, and the brake dust appears with a random flip, at most 20 at a time. Facing left, the original draws Sonic 1px further right, except in the walk and run frames, which go through the rotation hardware.

### Terrain

Sonic's sensors follow SA1's player code. His position is his centre; the sensors sit 8 px either side of it and `spriteOffsetY` (14 standing, 9 curled) toward the surface. Each sensor scans up to three tiles ahead, or two back when it starts inside solid ground, and reports the distance to the last free pixel.

- **On the ground** the surface angle picks one of four modes (floor, either wall, ceiling). Sonic snaps onto the nearer of his two sensors if it is within `min(|speed| + 3, 11)` px, and otherwise leaves the ground. Ground speed moves him along the angle, and slopes add `sin × 3/32` walking and `sin × 60/256` rolling, a quarter of that uphill. A standing Sonic never slides.
- **Walls and ceilings** drop him below 1.875 px per frame and lock left and right for 30 grounded frames. Up and down still work during the lock, so holding down he rolls as soon as he lands. Up and down do nothing while he balances at an edge.
- **In the air** the direction he moves picks which sensors run. Landing turns his speed into ground speed by the landing angle, and of the two steep ceiling slopes only `0x41`–`0x5F` catches him.
- **Jump-through ledges** are solid on the ground. In the air the floor sensors ignore them while he rises, and the walls and ceiling while his downward speed is under 3.
- **Bounds:** the camera stops at the act's edges. Before it moves each frame, `UpdateCamera` first keeps it a pixel further in from the right and bottom edges than it may end up, so when Sonic is in the air at the bottom of the act, inside the camera's vertical dead zone, it sits a pixel above the edge. Falling out of the bottom kills Sonic (see [Dying and the restart](#dying-and-the-restart)).

The walk and run frames turn with the angle through the rotation hardware (see [Rotation hardware](#rotation-hardware)).

### Casino Paradise Zone act 2

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
| Neo Green Hill Zone act 1 | 12 | 0 | The act starts, and starts over after a life is lost |
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
| Ring | 117 | 1 or 2, then 3 | Every ring with a sparkle: first on player 2 panned left (−64) when the new count is odd, or player 1 panned right (+64) when it is even, at half volume (128); then again on its own player 3, centred, from the sparkle's script |
| Rings from a box | 117 | 3 | The ring prizes, once for the lot |
| Casino Paradise Zone act 1 | 16 | 0 | Act 1 starts, and starts over after a life is lost |
| Bumper | 183 | 2 | A hexagon or round bumper throws Sonic, and a flipper flips or bats him |
| Triangle bumper | 184 | 2 | A small triangle or right-angled bumper throws Sonic |
| Party balloon | 189 | 2 | A balloon pops |

Sounds on the same player cut each other off, as in the original. There is no landing sound in SA1.

**How it was checked.** The reference is mGBA 0.10.5, recording the tested ROM headlessly and dumping the engine's whole EWRAM state, the sound registers and the mixing buffer after every frame, through the act's first minute of music and a run of every move above:

- *One frame at a time:* the port loads the dumped state, runs one frame and is compared field by field: every track, channel, player, register and mixed byte. 3657 of 3659 music frames and 899 of 919 sound-effect frames match exactly. The others are the frames where the game itself starts a song or changes its pitch or volume, which happens outside the engine.
- *Free running:* loaded once and then left alone, the port stays identical for all 3593 frames of the act's music.
- *Clean start:* a fresh engine that only calls the song start where the game did stays identical too, which is how the browser starts the act.
- *The final output:* the DirectSound part of the port's audio lines up with mGBA's recorded output. The PSG part matches mGBA's in pitch, level and envelope (median spectrum correlation 0.98), but not sample for sample: a Game Boy channel's waveform phase depends on the exact CPU cycle the engine writes its registers, which the port does not model.

The port mixes at the GBA's 65536 Hz, averages that down to the browser's output rate, removes the DC offset the unipolar PSG channels add, and plays at half of the GBA's full scale. The game itself still steps at 60 Hz while the sound engine keeps the GBA's 59.7275 frames per second, so a sound starts within one frame of the move that plays it.
