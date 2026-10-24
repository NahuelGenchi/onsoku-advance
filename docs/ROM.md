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

The enemies use the same 7-byte records, with the enemy's kind in place of the interactable's. The item boxes have 3-byte records `x, y, kind`. Act 1 has 27 enemies and 13 item boxes.

### Objects

**The task list.** The original runs everything as tasks in one list, sorted by priority, and the engine does the same with the same priorities. In act 1 a frame runs the camera (`0xF00`), then at `0x2000` the ring manager, the entities manager, two palette animations and every object, enemy and effect in the order they were made, then the scattered rings (`0x2001`), the HUD (`0x2180`), Sonic (`0x3000`), the GamiGami shots, the music manager (`0x4000`), the Buzzer shots (`0x9000`) and the stage's clock (`0xFF00`). A new task goes after the last task of its priority. The list fetches the next task before it runs the current one, so a task made by the one just before its place only runs from the next frame.

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

The original places each piece through its sprite transform, around where the boulder was on the screen on the frame it broke: the piece's offset from there, as the camera moves, is multiplied by its scale over 512. So the pieces start at half their offset and drift out while they grow. A piece is left out once its double-size square is off the screen.

### Waterfalls

Act 1 has seven waterfalls, kind 27, each an area `d2` × 8 px wide and `d3` × 8 px tall, starting `d1` × 8 px below the spawn point (`d1` is signed, so most start above it). The waterfall's own picture is part of the stage's layers. Its task (`0x08075911`) runs at priority `0x2000` and goes when its spawn point leaves the range.

While Sonic's centre is in the area, edges included, his vertical speed grows by 16/256 px a frame on top of gravity, before he moves. On the ground this does nothing, since the walk sets his speed from the ground speed, and standing on an object puts it back to 0. The task also draws a splash, animation `464`, at his centre 10 px lower, in OAM order 5. The splash only animates while it is drawn, so it starts each visit where it left off. The original sprite routine leaves it out while it is off the screen.

Recordings of Sonic pushing each way, jumping on a boulder, breaking it with the spin attack, spin dashing into one, and breaking the second one all match the engine on every frame, including where every piece is drawn.

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

Sonic dies when a hit finds him without rings (thrown up at 3.0) or when he falls out of the bottom of the act (thrown up at a jump's speed). On that frame the camera's target and the stage clock stop, song 119 plays and the music plays on. His blink timer is set to 2, counts down once and stays at 1. He then falls through everything, in front of the front layer, until his centre is 240 px below the top of the screen. He disappears there, and 61 frames later he loses a life.

Losing a life destroys every task, so nothing after Sonic runs on that frame. The original then spends the whole next frame loading the act again, and nothing runs. On the frame after, the act starts over with its rings, enemies and objects back: the ring count goes to 0, the score and the stage clock carry on, and the music starts from its beginning. The new camera starts with Sonic centred, not yet kept inside the act (x = −16 at act 1's start). Its task's first frame only sets it going, so it starts moving on the second frame.

**How it was checked.**
- *Enemies:* mGBA 0.10.5 recorded every task of the act's enemies, shots and effects after each frame, with Sonic's position and hitboxes, in 13 runs: each enemy kind on its own, both ways round and from different sides, and five runs where Sonic destroys enemies in a row. Fed Sonic's recorded position, the engine's enemies, shots, dust clouds, animals and points match the original's position, animation and hitbox on every frame of all 13 runs, and the score matches too.
- *Damage:* nine more recordings dumped Sonic, the camera, the rings, the lives, the stage clock and the scattered rings after each frame. They cover a hit by spikes with 12 rings, a hit with 60 rings (48 scatter), knockbacks to either side and facing left, two hits from the left, a death on spikes and a fall out of the bottom of the act, both through the restart. Run from the recorded start, the whole game matches every one of them on every frame: Sonic's position, speed, blinking and death, the rings and lives, the camera, the stage clock, the scattered rings drawn and the sounds played. A tenth run, where Sonic runs into an item box and pushes against it, matches too.
- *Item boxes:* 21 more recordings dumped the whole of IWRAM and the music players after every frame, from before the act starts. Sonic falls curled onto each kind of box, then waits, walks or meets a hazard: the shield and a spike hit with it, the magnetic shield pulling rings in, invincibility to its end, speed shoes to their end while running both ways, the 1-up, 5 rings, random rings, a hundredth ring from a box, a hop from below, a roll into a box, a push against its side in the air, and invincible Sonic against spikes and three kinds of enemy. Run from the act's first frame with only the recordings' inputs and pokes, the whole game matches every one of them on every frame: Sonic, the rings and lives, the camera, the stage clock, his item timers and shield, the random numbers, and where every box, icon, dust cloud, shield, star, sparkle and flying ring is drawn. The music changes on the same frames as the original's.
- *Platforms:* 14 more recordings, made the same way, drop Sonic onto every kind of platform, still or walking off it, and jump from them. They cover a swinging platform carrying him and one he jumps up through, both falling platforms dropping him, the trampoline, a bounce block both ways, the cluster of bounce blocks with right held, and both crumbling platforms, one walked off as it goes. Run from the act's first frame, the whole game matches all of them on every frame: Sonic and his animation, the rings, the camera, the stage clock, the sounds, and where each platform and crumbling tile is drawn.
- *Boulders and pushing:* seven more recordings, with Sonic kept from getting hurt, push against a wall and against the first boulder from each side, jump on it, break it with the spin attack, spin dash into it, and break the second one. The whole game matches all of them on every frame, run from the act's first frame: Sonic and his push animation, the boulders, and where each piece is drawn, read from the original's sprite list.
- *Waterfalls and balancing:* 16 more recordings walk through a waterfall, fall through two, and stand on the third boulder inside one and jump. They also stand Sonic at a ledge each way and turn him round, walk him up to one, and stand him on both sides of the first boulder and of a crumbling platform each way round, at the edge and a pixel inside it. The whole game matches all of them on every frame, including his balancing animations and where the splash is drawn.

### HUD

The HUD is twelve sprites at priority 0, in front of every layer and sprite. It comes from the UI graphics table, whose entries are a tiles pointer, a palette pointer, then the tiles per glyph, the sprite size and shape, and the width and height in tiles. Tiles are 4bpp with the low nibble on the left. The HUD uses three entries:

- **Entry 0, the 8 × 16 font.** Its `0`–`9` and `:` (tiles 32–53) are the white glyphs. The same characters at tiles 224–245 are red.
- **Entry 5, the 32 × 32 ring icon.** It shares the font's palette, which the HUD loads into sprite palette 6.
- **Entry 1, Sonic's 16 × 16 face.** It uses his own palette.

| Element | Position | What it shows |
| :--- | :--- | :--- |
| Ring icon | (−2, −1) | |
| Ring count | y 5, from x 9, 5 or 1 for one, two or three digits | No leading zeros, 999 at most (the count itself goes on). At 0 it flashes: a counter that only moves while the count is 0, and is never reset, picks white, red, red, white for 8 frames each. |
| Score | y −2, last digit at x 73 | Nine digits at most; 0 until something scores |
| Timer | (25, 12), seven glyphs | `M:SS:CC`, where CC is hundredths: the frame count × 100 / 60, rounded. After 9:00 it turns red for 16 frames out of every 32; from 9:40 the warning beep (song 139) plays every second; from 10:00 it reads `9:59:99`. |
| Face | (2, 144) | |
| Lives | (22, 143) | One less than the lives (a new game has 3), 9 at most |

The HUD runs after the rings and objects and before Sonic, so it shows the ring count from the same frame. The timer moves on at the end of the frame, so it shows the count from before that frame.

**Extra lives.** Every time the ring count passes a multiple of 100, Sonic gets a life, and the stage's music manager plays the 1-up jingle (song 307) on the music's own player. That cuts the music off at once. On the first later frame where that player has stopped, the music starts again from its beginning, fading in from 1/64 over 64 frames. The manager runs after Sonic, and looks at the music player as the engine left it at the start of the frame.

**How it was checked.**
- *Screenshots:* mGBA screenshots were taken at 0 rings (both colours of the flash), at 1 to 12 rings, at 1000 rings (shown as 999), with a score of 123450, with 12 lives (shown as 9), and on both phases of the red timer. The port's HUD, drawn from the recorded state of the frame before each screenshot, matches 256 of 257 of them pixel for pixel. The other one is a frame where the recorder had just changed those values in memory.
- *Jingle:* the sound engine port with the music manager stays identical to mGBA's engine for 368 frames, from just before the 100th ring through the jingle, the music's restart and the end of its fade-in.
- *Read in the code only:* the 10:00 reading. The stage doesn't end at 10:00 yet (the original's time over).

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
| Balancing, back to the drop | 14 | | |

**Pushing.** Walking into a wall, or into the side of a solid object or a spring's back, sets the push flag (`moveState` bit `0x20`), and every frame it's set the animation chooser picks the push (character state 14). Rolling into a wall doesn't. Landing, leaving the ground, turning round, jumping, getting hurt, walking off an object and standing still on level ground clear it.

**Balancing.** Each frame Sonic stands still on level ground (the same check that ends the push), he balances when he is at an edge: facing the drop (character state 12), or with his back to it (13).

- On an object (`Player_8044D74`): when his centre is more than a pixel past a side of its box, counting his half-width of 6 px. A side at 0 never counts, so he never balances on a crumbling platform's left side, or on its right side when it is flipped. Once balancing, he keeps on a pixel further in, which only matters when the object moves him.
- On the terrain (`Player_8044E48`): when the floor scan under his centre finds no ground within 8 px, and the scans 8 px to each side find it right under one side and not within 8 px under the other.

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
- **Bounds:** the camera stops at the act's edges, and falling out of the bottom kills Sonic (see [Dying and the restart](#dying-and-the-restart)).

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
| Neo Green Hill Zone act 1 | 12 | 0 | The act starts, and starts over after a life is lost |
| Jump | 116 | 2 | A jump from the ground, and the combo's backflip |
| Spin | 109 | 3 | Spin dash start, rolling, the combo's first hit. Each spin dash rev plays it again, raised by the decayed charge (`charge & ~0x7F` in 1/256 semitones). |
| Spin dash release | 110 | 2 | Letting go of down |
| Skid | 115 | 2 | Restarted on every frame Sonic is still at 3.0 or faster after braking |
| Insta-shield | 113 | 2 | |
| Mid-air dash | 112 | 3 | |
| Somersault kick | 121 | 3 | The combo's second hit |
| Slide kick | 111 | 3 | |
| Spring | 170 | 2 | Every launch, and every bounce off a bounce block |
| Timer warning | 139 | 2 | Every second from 9:40 to 10:00 |
| 1-up | 307 | 0 | Every hundredth ring and the 1-up box, in place of the music; the music then starts over with a fade-in |
| Invincibility | 28 | 0 | In place of the act's music until it runs out; the music then starts over with a fade-in. Speed shoes play the music player at twice the tempo. |
| Rings lost | 118 | 3 | Sonic is hurt and drops his rings |
| Life lost | 119 | 2 | Sonic dies |
| Enemy destroyed | 138 | 2 | |
| Spikes | 171 | 2 | Sonic is hurt by spikes |
| Item box | 167 | 2 | A box breaks |
| Shield | 168 | 2 | Either shield is given |
| Crumbling platform | 173 | 2 | A crumbling platform starts to fall apart |
| Trampoline | 176 | 2 | Every bounce |
| Ring | 117 | 1 or 2, then 3 | Every ring with a sparkle: first on player 2 panned left (−64) when the new count is odd, or player 1 panned right (+64) when it is even, at half volume (128); then again on its own player 3, centred, from the sparkle's script |
| Rings from a box | 117 | 3 | The ring prizes, once for the lot |

Sounds on the same player cut each other off, as in the original. There is no landing sound in SA1.

**How it was checked.** The reference is mGBA 0.10.5, recording the tested ROM headlessly and dumping the engine's whole EWRAM state, the sound registers and the mixing buffer after every frame, through the act's first minute of music and a run of every move above:

- *One frame at a time:* the port loads the dumped state, runs one frame and is compared field by field: every track, channel, player, register and mixed byte. 3657 of 3659 music frames and 899 of 919 sound-effect frames match exactly. The others are the frames where the game itself starts a song or changes its pitch or volume, which happens outside the engine.
- *Free running:* loaded once and then left alone, the port stays identical for all 3593 frames of the act's music.
- *Clean start:* a fresh engine that only calls the song start where the game did stays identical too, which is how the browser starts the act.
- *The final output:* the DirectSound part of the port's audio lines up with mGBA's recorded output. The PSG part matches mGBA's in pitch, level and envelope (median spectrum correlation 0.98), but not sample for sample: a Game Boy channel's waveform phase depends on the exact CPU cycle the engine writes its registers, which the port does not model.

The port mixes at the GBA's 65536 Hz, averages that down to the browser's output rate, removes the DC offset the unipolar PSG channels add, and plays at half of the GBA's full scale. The game itself still steps at 60 Hz while the sound engine keeps the GBA's 59.7275 frames per second, so a sound starts within one frame of the move that plays it.
