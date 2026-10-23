// Song numbers in the ROM's song table, for what the game plays so far (SAT-R decompilation,
// include/constants/sa1/songs.h; where each is played is listed in docs/ROM.md).
export const SONG = {
  NEO_GREEN_HILL_1: 12,
  SPIN: 109,               // SE_SPIN_ATTACK: spin dash start and revs, rolling, the combo's first hit
  SPIN_DASH_RELEASE: 110,
  SLIDE: 111,              // SE_SONIC_SKID_ATTACK
  AIR_DASH: 112,           // SE_SONIC_MIDAIR_SOMERSAULT
  INSTA_SHIELD: 113,
  BRAKE: 115,
  JUMP: 116,               // also the combo's backflip
  SOMERSAULT: 121,         // SE_TAILS_TAIL_SWIPE, which Sonic's somersault kick reuses
  SPRING: 170,
};
