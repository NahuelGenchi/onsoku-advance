// Song numbers in the ROM's song table, for what the game plays so far (SAT-R decompilation,
// include/constants/sa1/songs.h; where each is played is listed in docs/ROM.md). The 1-up jingle, 307, is
// the music manager's, in synth.js.
export const SONG = {
  INTRO: 1,                // MUS_INTRO
  TITLE_FANFARE: 2,        // MUS_TITLE_FANFARE
  NEO_GREEN_HILL_1: 12,
  NEO_GREEN_HILL_2: 13,
  INVINCIBILITY: 28,       // MUS_INVINCIBILITY
  BOSS_FIGHT: 29,          // MUS_BOSS_FIGHT: also started and stopped at once to stop the menu's music
  ACT_CLEAR: 33,           // MUS_ACT_CLEAR: the results of an act without a boss
  BOSS_CLEAR: 34,          // MUS_BOSS_CLEAR: the results of a zone's second act, after its boss
  SPECIAL_STAGE_INTRO: 41, // MUS_SPECIAL_STAGE_INTRO: the fall into the special stage
  SPECIAL_STAGE: 42,       // MUS_SPECIAL_STAGE
  SPECIAL_STAGE_TRICK: 43, // MUS_SP_STAGE_TRICK: a trick in the bumpers' window
  SPECIAL_STAGE_CLEAR: 44, // MUS_SPECIAL_STAGE_CLEAR: the goal reached with enough rings
  CHAOS_EMERALD: 45,       // MUS_CHAOS_EMERALD: the emerald's scene
  SPECIAL_STAGE_LOSE: 46,  // MUS_SPECIAL_STAGE_RESULT_LOSE: the results without the emerald
  SPECIAL_STAGE_WIN: 47,   // MUS_047: the results with it
  SEGA_RING: 102,          // SE_RING: Sonic Team's logo
  SELECT: 106,             // SE_SELECT: Start on the title screen, a choice in the menu
  MENU_CURSOR: 108,        // SE_MENU_CURSOR_MOVE
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
  GOAL: 135,               // SE_GOAL: Sonic passes the goal signpost
  CAPSULE_LANDS: 136,      // SE_136: the boss capsule lands
  CAPSULE_OPENS: 137,      // SE_137: Sonic lands on its switch
  ENEMY_DEFEAT: 138,       // SE_ITEM_BOX: an enemy is defeated
  RESULT_COUNTER: 140,     // SE_STAGE_RESULT_COUNTER: a results tally counting
  RESULT_COUNTER_DONE: 141,
  RESULT_CONTINUE: 154,    // SE_154: the special stage's results end with continues won
  EXPLOSION: 144,          // SE_EXPLOSION: a special stage bomb
  SPECIAL_DASH: 148,       // SE_148: a special stage dash pad
  SPECIAL_TRICK: 149,      // SE_149: a trick in the special stage
  SPECIAL_BUMPER: 150,     // SE_150: a special stage trick bumper
  SPECIAL_TOKEN: 151,      // SE_151: what the special stage's type 10 objects play
  TIMER: 139,              // SE_TIMER: the warning beep in the last 20 seconds
  RESULTS_COUNT: 140,      // SE_STAGE_RESULT_COUNTER: every fourth frame of the results' count
  RESULTS_DONE: 141,       // SE_STAGE_RESULT_COUNTER_DONE: the count is over
  BOSS_HIT: 143,           // SE_BOSS_HIT
  EXPLOSION: 144,          // SE_EXPLOSION: a boss is beaten
  IMPACT: 145,             // SE_IMPACT: the Egg Hammer Tank's hammer lands, as the Egg Press does
  ITEM_BOX_BREAK: 167,     // SE_ITEM_BOX_2
  SHIELD: 168,             // SE_ACTIVATE_SHIELD
  CHECKPOINT: 169,
  SPRING: 170,
  SPIKES: 171,             // SE_171: hurt by spikes
  BOOSTER: 172,            // SE_BOOSTER: every frame a booster sends Sonic on
  CRUMBLING_PLATFORM: 173,
  POLE: 175,               // SE_POLE: a wall pole catches Sonic
  TRAMPOLINE: 176,
  WATER_BRIDGE_SPLASH: 177, // SE_WATER_BRIDGE_SPLASH: the water bridge takes Sonic
  SHRUBBERY: 178,          // SE_SHRUBBERY: Sonic goes into a bush
};
