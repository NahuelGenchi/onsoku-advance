# Egg Rocket Zone

[Back to the data map](ROM.md)

Level 10 in the ROM's tables, zone 6's first act and its only one: it has no boss, and the act ends at the top of the rocket. Start it with `?level=10`. Offsets are file offsets in the tested USA ROM (add `0x08000000` for GBA addresses); the names are the [SAT-R](https://github.com/SAT-R) decompilation's.

## The act

| | |
| :--- | :--- |
| Size | 4224 × 7968 px, 44 × 83 metatiles, 1024 collision tiles; drawn through the loaded palette (indexed), the atlas would be too big |
| Start | (104, 6972), at the bottom of the launch tower |
| Song | 22 (`gLevelSongs`, `0x4A69E4`) |
| Palette animations | 839 and 842 both step row 13 of the stage palette, 840 row 12 and 841 row 10 (`StageInit_Zone6Act1`, `0x0803D9C5`); on a frame where two write the same colours, the last one's show |
| Objects | 382 interactables, 38 enemies (Mirror 10, Oct 14, Mole 14), 29 item boxes, 416 rings |

Picked from the course select, the act is made by the course select's own task (priority `0x2000`), so on that frame only the title card's task and the ones after it run, not the scattered rings' (`0x2001`); the next frame is spent loading. The HUD's task then lands on memory that holds 0, so its zero-ring flash starts from 0 (`hudFlash: 0` in the level's row).

## The launch and the stage separations

The act's three checkpoints (kind 7) have no post and no sprite. `d0` numbers them: 1 at (1176, 6984) by the launch tower, 2 at (1280, 5536) and 3 at (3328, 3232), at the tops of the rocket's two lower stages. The first counts once Sonic's centre is right of it; the others once his feet are above its base + 4. Each records where Sonic starts after a death, as the other zones' checkpoints do.

- **The launch** (`CreateEggRocketLaunchScreenShakeEffect`, `0x08029830`): Sonic stops and his input is ignored, the camera's left edge becomes 1058 (no way back to the tower), and the screen shakes up and down for 10 frames. Sixty frames later a random shake runs for 300 frames with an explosion (song 144) every 16, then the course time becomes a **countdown from 5:00** (`STAGE_FLAG__TIMER_REVERSED`) and Sonic can move again.
- **A separation** (`CreateEggRocketStageSeparation`, `0x08028C54`): the clock stops, Sonic is held still, and the camera's bottom is put at the split (world row 5567 for the first, 3263 for the second). The camera pans down 1 px a frame until the split is mid-screen. Then the stage below shakes, plays song 173 and slips away on the back layer, its rows moved down while nuts, bolts and explosions fall every 16 frames. The camera pans back up until the split is at the screen's bottom, which stays the act's bottom from then on (5568, then 3264), and the countdown starts again from 5:00.
- **The nuts and bolts** (`nuts_and_bolts_task.c`, pieces from the tables at `0x0B8424`) are animations 695, 696 and 697, two variants each. Each falls from where it was thrown and goes 32 px past the screen's sides or bottom, or when its animation has ended and 256 frames have passed.
- **The screen shake** (`CreateScreenShake`) is a task just before the camera's. Each frame it sets an offset of its amplitude times the sine of a stepping angle, or times a random factor, and the camera adds that after keeping itself inside its bounds, so the view shakes past the act's edges.
- **The countdown:** the HUD's time turns red under 1:00 on alternate 16-frame stretches and beeps every second through the last 20 seconds. At 0:00 Sonic dies with a screen shake and song 166, and with a life left the TIME OVER screen follows ([Time over](ROM.md#time-over)); once its fade starts, the background stops. After a death the act starts again from the last checkpoint with the rocket as it was: launched, its stages gone, and a fresh 5:00.
- **The widescreen view** never shows past those bounds either: from the launch on they are its walls (`cam.arena`), so the view stops at the left edge, 1058, instead of showing the tower, and keeps above the bottom while the stages fall away (`viewOf`, `src/engine/camera.js`). The 240 × 160 screen is unchanged.

## The end of the act

The act ends at the rocket's top through the stage goal (kind 0, `stage_goal.c`), the same entity as the other acts' goal post, with three Egg Rocket branches. This game doesn't build it here yet: it is left to the act clear's work ([#69](https://github.com/NahuelGenchi/sonic-advance-dreamport/issues/69)), and until then the goals stay stand-ins.

- Three goals sit on the act's top edge, at (2144, 0), (2160, 0) and (2176, 0), with `d1` = 1. A fourth at (2080, 168) has `d1` = 0, so only multiplayer makes it; in Egg Rocket, multiplayer skips the `d1` = 1 ones instead.
- A goal fires once Sonic's centre is right of its point and his body's box (hitbox 0) holds the point. Elsewhere being right of it is enough.
- No goal sound plays (`SE_GOAL` is skipped, there is no post), and Sonic isn't made to run right. He is held where he is (`MOVESTATE_IA_OVERRIDE`) and the camera's `shiftY` isn't touched.
- 121 frames later the goal's task ends and `CreateStageResults` runs, without waiting for Sonic's goal pose (`CHARSTATE_28`) as the other acts do. There is no early `Task_ShowResults` either.

## The background

`StageBgUpdate_Zone6Act1` (`zone_6.inc.c`) scrolls BG3 over three screens of the background map. Before the launch it shows the tower at sunset, scrolled sideways a little with the camera. After it, the sky scrolls down 2 px a frame. After the second separation the view climbs to the top of the atmosphere and then into space, where BG0 comes on over BG3. There BG3's stars drift down slowly and BG0's faster, and BG0 is lightened on some lines by an HBlank callback.

## Objects

| Kind | What | Animation | Notes |
| :--- | :--- | :--- | :--- |
| 6 | Spikes hiding in the ceiling | 454, variants 0–2 | The stage clock's 128-frame round: hidden 60, sliding out 4, out 60, sliding back 4. Coming out onto Sonic puts him under them and hurts him; out, they are solid and hurt from below. Shared with kind 5 (pointing up) |
| 47, 100 | Wall and steep boosters | 472, 571 | The flat booster's task (`Task_Booster`) with another look |
| 83 | Hang bar | none (drawn in the layers) | A task after Sonic's (`0x8000`). Falling into its area (`d0`, `d1` tiles from its point, `d2` × `d3` tiles) catches him 18 px under it, then holds him 16 px under it. Left and right move him 2 px a frame (animation 41, variants 0 and 1). A jump, or moving past either end, drops him at 2 px a frame the way he holds |
| 93 | Spiked barrel | 516, variants 0–3 | Swings on the stage clock (`d2` > `d3`: across), carrying Sonic. Its spikes turn round: on top for 16 frames, turning for 48, underneath for 16, turning back for 48. They hurt only while they point straight up or down (box 1 against his sprite box) |
| 99 | Conveyor belt rollers | 508 / 509 (act 1s), 604 / 603 (act 2s) | Solid, only animate; `d0` picks wide or slim and its variant |
| 103 | Propeller | 515 | Only spins, at its spawn point, OAM order 18. Sprite flag 18 skips its script's palette load; in Egg Rocket the bank (11) already holds the same colours |
| enemy 14 | Oct | | Waits until Sonic is within 120 px sideways, patrols at 0.75 px a frame, overshooting each end on a half sine over 30 frames, and drops a shot every 60 frames |

The other kinds the act uses are shared with other zones and documented with them: gravity toggles (109) and flipped gravity, tubes (106, 110, 111), whirlwinds (90), square platforms (55), moving springs (81), iron balls (82), ferris wheels (91), breakable walls (114), wall bumpers (71), conveyor belts (69), the Mirror (enemy 12) and the Mole (enemy 15). Egg Rocket's own looks for them come from the ROM's per-level tables and `CreateEntity_` code:

| Object | Egg Rocket's look | Where the ROM picks it |
| :--- | :--- | :--- |
| Thin and falling platform, ferris wheel seat | 517 | `sPlatformThinAnims` (`0x0B8504`), `gUnknown_086CEE2C` (the same values) |
| Crumbling platform | 513 | `sPlatformCrumblingAnims` (`0x0B8528`) |
| Bounce block | 507 | `sBounceBlockAnims` (`0x6C8C20`) |
| Trampoline | 505 | `CreateEntity_Trampoline`: zones 2 and 6, Chao Hunt B and D |
| Breakable wall | 596 | `gUnknown_080BB544` (`0x0B854C`) |
| Square platform | 518, long 519 | `CreateEntity_SquarePlatform`: zone 6 act 1 |
| Moving spring | 582, variant 1 (launching: 0) | `CreateEntity_MovingSpring`: zone 6 |

## Checked against the original

Each case was recorded in mGBA 0.10.5 with the course select's start, Sonic and the camera poked next to the object during the title card. Sonic's state, the camera, the rings and the clock match on every frame, and whole frames match pixel for pixel except objects not built yet and the HUD's zero-ring flash after the poke:

- the launch (737 frames), both separations (737 and 1337, into space),
- the steep boosters through a tube (500), the wall booster under ceiling spikes (330),
- the hang bar (420), the ceiling spikes with a death and restart (420), a spiked barrel ride (400), a propeller (300),
- flipped gravity through two toggles onto the ceiling (420), square platforms and whirlwinds (400), a ferris wheel with a Mole that hits Sonic (400), the conveyor belts and their rollers (200), the Mirror (400), a wall bumper (360), a breakable wall broken by a spin dash (360),
- an Oct defeat (360), a death after the launch with the restart in the launched rocket (1250 frames, pixels identical), and the countdown running out after the launch, through the TIME OVER screen and the restart (1700 frames; all but the lights of the launch tower's capsule, which differ from the launch on).

Not checked: the end of the act ([above](#the-end-of-the-act), read in the code only).
