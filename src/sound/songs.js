// Song numbers in the ROM's song table, for what the game plays so far (SAT-R decompilation,
// include/constants/sa1/songs.h; where each is played is listed in docs/ROM.md). The 1-up jingle, 307, is
// the music manager's, in synth.js.
export const SONG = {
  VS_WIN: 7,               // MUS_007: the multiplayer results screen when this player won,
  VS_LOSE: 8,              // MUS_008: lost,
  VS_DRAW: 9,              // MUS_009: or drew
  NEO_GREEN_HILL_1: 12,
  INVINCIBILITY: 28,       // MUS_INVINCIBILITY
  SPIN: 109,               // SE_SPIN_ATTACK: spin dash start and revs, rolling, the combo's first hit
  SPIN_DASH_RELEASE: 110,
  SLIDE: 111,              // SE_SONIC_SKID_ATTACK
  AIR_DASH: 112,           // SE_SONIC_MIDAIR_SOMERSAULT
  INSTA_SHIELD: 113,
  GRINDING: 114,           // SE_GRINDING: from a grind rail's start until Sonic leaves it
  BRAKE: 115,
  JUMP: 116,               // also the combo's backflip
  RING: 117,               // SE_RING_COPY: what the ring manager and the ring sparkle play
  RINGS_LOST: 118,         // SE_RINGS_LOST: the rings scatter
  LIFE_LOST: 119,          // SE_LIFE_LOST: Sonic dies
  SOMERSAULT: 121,         // SE_TAILS_TAIL_SWIPE, which Sonic's somersault kick reuses
  ENEMY_DEFEAT: 138,       // SE_ITEM_BOX: an enemy is defeated
  TIMER: 139,              // SE_TIMER: the warning beep in the last 20 seconds
  ITEM_BOX_BREAK: 167,     // SE_ITEM_BOX_2
  VS_WIN_SE: 157,          // SE_157: 45 frames into the results screen when this player won,
  VS_LOSE_SE: 158,         // SE_158: lost,
  VS_DRAW_SE: 159,         // SE_159: or drew
  KNOCK_TEAMMATE: 161,     // SE_KNOCK_TEAMMATE: a player standing on another is knocked off at speed
  KNOCK_OPPONENT: 162,     // SE_KNOCK_OPPONENT: one runs into another at speed
  CHAO_HUH: 163,           // SE_CHAO_HUH: a Chao goes to a player
  SHIELD: 168,             // SE_ACTIVATE_SHIELD
  CHECKPOINT: 169,
  SPRING: 170,
  SPIKES: 171,             // SE_171: hurt by spikes
  BOOSTER: 172,            // SE_BOOSTER: every frame a booster sends Sonic on
  CRUMBLING_PLATFORM: 173,
  POLE: 175,               // SE_POLE: a wall pole catches Sonic
  TRAMPOLINE: 176,
  WATER_BRIDGE_SPLASH: 177, // SE_WATER_BRIDGE_SPLASH: every frame the water bridge carries Sonic, unless still playing
  ROUND_OVER: 304,         // SE_VS_MULTIPAK_ROUND_OVER: a multiplayer round's time is up
};
