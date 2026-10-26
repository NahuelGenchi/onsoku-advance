# Cosmic Angel Zone

[Back to the data map](ROM.md)

Level 11 in the ROM's tables: zone 6's second act and its only one in the course select, ending with the Egg Snake. Start it with `?level=11`. Offsets are file offsets in the tested USA ROM (add `0x08000000` for GBA addresses); the names are the [SAT-R](https://github.com/SAT-R) decompilation's.

## The act

| | |
| :--- | :--- |
| Size | 10560 × 2496 px, 110 × 26 metatiles, 205 collision tiles; drawn through the loaded palette (indexed), the atlas would be too big |
| Start | (104, 1716) |
| Song | 23, `MUS_COSMIC_ANGEL` |
| Palette animations | 829, 830, 831, 850, 851, 848, 846 and 847, in the order `StageInit_Zone6Act2` makes them; each cycles one row of the palette |
| Objects | 524 interactables, 63 enemies (Mirror 17, Oct 25, Mole 20, the Egg Snake), 30 item boxes, 549 rings |

The eight palette animations together have 972,000 states, far past what the pre-rendered atlas can hold. So the act keeps its layers and background as colour indices, and the renderer draws them through the palette the animations have loaded on each frame.

Picked from the course select, the act is made by the course select's own task (priority `0x2000`). On that frame only the title card's task and the ones after it run; the scattered rings' task (`0x2001`) waits a frame too. The next frame is spent loading. The HUD's task data then lands on memory the menus last used, which holds 90, so its zero-ring flash starts from 90 (`hudFlash: 90` in the level's row).

## The background

`StageBgUpdate_Zone6Act2` scrolls the 512 × 256 background map 272 px across over the act's width and 72 px down over its height (rounding toward 0). Through an HBlank callback its two conveyor belts, map lines 120–135 and 176–191, slide by half the stage clock, the upper one left and the lower one right.

## Gravity

The gravity toggles (kind 109, `toggle_gravity.c`; the C doesn't match the ROM, so the port follows the assembly) turn gravity over, set it normal or flip it when Sonic's centre crosses their line. `d0` picks which, `d1` whether the line is across or up and down, and `d2`/`d3` its size in tiles.

Under flipped gravity Sonic keeps his own speeds and angles: his floor is the act's ceiling. His sensors, landings, jump checks, ledge balance, edges and death all go the other way. The camera's offset and its look up and down turn over, and his sprite is drawn upside down: Y-flipped, or with the rotation turned for the walk and bounce frames.

The objects with a gravity branch in the original follow it:
- The up and down springs and spikes swap their tests, and the diagonal springs still throw him up the act.
- Solid objects, item boxes and platforms land him on their bottoms, and a thin platform carries him 2 px up.
- The rings he drops fall up.

Kind 2, the spikes pointing down, is built for this swap.

## Tubes

Pipe entrances (110), tracks (106), air corners (112) and pipe exits (111) are one module, `pipes.js`:
- A pipe entrance takes Sonic curled up as he lands on it, bumps it or runs into its side; which side depends on the level and the gravity. It pulls him into its mouth and carries him a first stretch.
- Each track takes him on in turn along its chain.
- A pipe exit throws him out. A jump or attack pressed on the frame it lets go doesn't count.
- The air corners are the tubes' bends, solid only from above.

Zone 6 act 2 draws the pipes with animations 590 and 591, and the air corner with 592.

## Objects

| Kind | What | Cosmic Angel's look | Notes |
| :--- | :--- | :--- | :--- |
| 5, 6 | Spikes hiding in the floor and in the ceiling | 454 | The stage clock's 128-frame round: hidden 60, sliding out 4, out 60, sliding back 4 |
| 21, 22 | Thin and falling platforms | 598 | `sPlatformThinAnims` (`0x0B8504`) |
| 24 | Crumbling platform | 602 | `sPlatformCrumblingAnims` (`0x0B8528`) |
| 25 | Bounce block | 601 | `sBounceBlockAnims` (`0x6C8C20`) |
| 31, 47 | Boosters, flat and on a wall | 471, 472 | One task with two looks; it sends Sonic on at 12 px a frame |
| 55 | Square platform | 599, long 600 | `CreateEntity_PlatformSquare` picks zone 6 act 2's pair; a long one has its other byte set. Egg Rocket, zone 6 act 1, has its own pair (518 and 519), and the game reads both: going on from Egg Rocket puts Cosmic Angel's in their place (each act's `anims`, `extract.js`) |
| 69 | Conveyor belt | none (drawn in the layers) | Carries Sonic while he stands in its box |
| 81 | Moving spring | 582, variant 1; launching, variant 0 | `CreateEntity_MovingSpring`'s zone 6 branch |
| 87 | Antigravity unit | 511 (one, `d0` set), 512 (two, `d0` = 0) | The torch's kind (`torch.c`): Angel Island draws it as a torch (558), zone 6 and Chao Hunt D as these. It only animates, in OAM order 28 |
| 90 | Whirlwind (player float toggle) | none | Here every one has `d0` = 1: it lifts Sonic in the spring's somersault, with no sound |
| 91 | Ferris wheel | seat 598, hub 530, spokes 531 | The seat from `gUnknown_086CEE2C`, which equals `sPlatformThinAnims` |
| 102 | Special spring | 572 | See below |
| enemy 12 | Mirror | | Walks between `d0` and `d0` + `d2` tiles at 0.625 px a frame and can't be hurt while it walks; every 90 frames it stops, turns to Sonic for 60 and fires a level shot on the 20th, and only then can it be destroyed |
| enemy 14 | Oct | | Waits until Sonic is within 120 px sideways, then patrols between `d0` and `d0` + `d2` tiles at 0.75 px a frame and drops a shot every 60 frames |
| enemy 15 | Mole | 434 | Pops up from its mound every 60 frames, facing Sonic; once destroyed it stays in its mound until the act starts over |

The trampoline's look (505 in zones 2 and 6) also comes from the zone, though the act has none.

**The special spring** (`special_spring.c`) throws Sonic up at 7.5 px a frame like a spring. In the ROM it then holds him and the camera while he rises out of the screen, and the act stops for the special stage. That path belongs to the special stage's work ([#75](https://github.com/NahuelGenchi/onsoku-advance/issues/75)); its module is the same one, and until it lands the spring stays a plain spring here.

The act's three stage goals (kind 0) lie in the boss's pit with `d1` = 0, so only multiplayer makes them. In single player the act ends with the boss.

## The Egg Snake

Enemy 27, `boss_6_egg_snake.c`. The segments' task, `Task_8033AA0`, follows its assembly, which the C doesn't match.

**The arena.** The boss is a shaft from x 10000 to 10290 with its floor at y 2355. The camera's bounds close in from the frame it spawns: x 9968 to 10048 in the engine's units, and a bottom of 1792. Boss song 3 starts (`gMusicManagerState.unk1` = `0x13`).

**The fight.**
- The body is nine segments in a row, 32 px apart, that Sonic stands on. The head sways along them, riding their bumps.
- Landing on a segment faster than 4 px a frame bounces the segments around it. When the head is within two segments of that one, it opens: Eggman is exposed inside it for 480, 300, 180 or 90 frames, picked at random (`gUnknown_084ACF08`).
- Hitting Eggman from the air counts. A hit makes the head sway faster for 120 frames (`gUnknown_084ACEE4`).
- A burst of three laser shots flies at Sonic every 600 frames, sooner with each hit (`gUnknown_084ACEF6`).
- Eight hits beat it on normal; easy starts the count at 2.

**The defeat.**
- The spikes fly off through the rotation hardware.
- The boss falls through the arena, throwing debris whose pieces fall 5/256 px a frame faster each frame, against 40 for the other bosses.
- 60 frames after it lands, Eggman rises in the Egg Mobile. Sonic is held still, then walks after him, and the act's results come.
- A widescreen view's black follows the camera's bounds to where they are going (`cam.arena`): the one screen across the camera stops on, 160 px further down once it is beaten, down to a bottom of 2368 once it has landed, and 240 px further right when Sonic is held still.

A beaten boss stops the clock, the rings and the entities manager (`STAGE_FLAG__ACT_START` and `STAGE_FLAG__2`), and zeroes the camera's speed caps. The game provides those hooks (`world.stopStage`, `cam.speedX`, `player.heldInput`). The results then come as at the end of any act, through `world.stageResults`.

**What the C doesn't show.**
- `TaskCreate` doesn't clear a task's memory. The boss's `unk9B`, `qUnk9E`, `unkA6`, `unk90` and `unk92` start as whatever was there, but each is written before it is read.
- The shots aim with `sub_8004418`, a rough angle linear within each eighth of the turn. For a shot straight on top of Sonic it returns -1, and the sine read then takes the halfword before the sine table (`0x0809B3EE`, which holds `0x0800`).
- Eggman's laugh after a shot hits Sonic is cancelled when the head is shut. `ANIM_OVER` stays set until the sprite's next update, so the laugh's variant goes straight back.

## Original-game bugs kept

These are listed in [#56](https://github.com/NahuelGenchi/onsoku-advance/issues/56) for an opt-in fix later:
- After the Egg Snake is beaten, its shots still find it through the laser's task, which has been freed. They keep flying until the boss's next debris takes that task over (three frames in the recordings).
- A shot fired from straight on top of Sonic reads the halfword before the sine table.
- Shots fired upward are only removed once they leave the screen sideways.
- A new booster tests Sonic against its hitbox before its sprite has set one (`CreateEntity_Booster` only marks it inactive, and `HB_COLLISION` doesn't look at that), so on its first frame it uses what the last task in that memory left there. The port doesn't model the task heap: its boosters wait for their own box, one frame later. It only shows when a booster appears under Sonic, which a teleport can do but play can't, since objects appear at the camera's edge.

## Checked against mGBA

All recordings run the USA ROM in mGBA 0.10.5 from the course select. They compare Sonic's position, speeds, angle, gravity and track, and the camera, on every frame. Where noted they also compare the screen pixel for pixel.

- **The start, the title card and the background:** the first frames after the course select, pixel for pixel.
- **Gravity:** three runs through toggles, both ways, with springs, spikes and rings dropped under flipped gravity.
- **Tubes:** four runs: a horizontal entrance, a vertical one taken on landing, a flipped-gravity entrance he stands under, and one taken while flipped with a toggle inside.
- **The Mirror:** two runs, its shots and a defeat.
- **The Egg Snake:** two fights to the end, one without a hit and one with three hurts. The boss's own memory, every segment's bump, the laser, the shots, the random seed and the sprites' variants and places match on every frame (3274 and 3750 frames). The intro, opening, hits, laser bursts, defeat and fall match pixel for pixel.
- **The zone's objects:** a run from the start (1607 frames) and eleven runs of about 1400 frames each from teleports. In those Sonic waits for the camera to arrive, so the objects there have appeared, then runs right or left. They cover Moles (a hurt and a defeat), moving springs, hiding spikes, ferris wheels, whirlwinds, antigravity units, square platforms, bounce blocks, falling platforms, conveyor belts, an item box, a death and the restart. All match, except the special spring's run (it goes on to the special stage) and one where a booster appears under Sonic (see the bugs above). Windows of these are compared pixel for pixel.

**Only read in code, not checked:**
- The special spring past its launch: the ROM goes on to the special stage, which #75 builds.
- The Egg Snake on easy.
- The escape when Sonic is right of Eggman, so Eggman turns left first.
- Sonic touching the segments after the boss has landed.
- The results.
- Chao Hunt D's zone 6 branches (multiplayer).
- The wall boosters and the crumbling platforms: none of the runs touched one.
