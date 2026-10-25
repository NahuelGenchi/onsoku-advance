// When the Moon Zone, the extra stage, opens (SAT-R decompilation: the same test in boss_x3_egg_x.c, where Egg X's
// defeat chooses between the Moon and the normal ending, in stage_results.c's CreateStageResults and in
// course_select.c). It is Sonic's alone: with all seven Chaos Emeralds, once every character has cleared X Zone,
// from X Zone on. The last part keeps it shut when the Moon has been beaten (the save's first character's
// unlocked level is 15 after the true ending) and the game is on X Zone from the course select.

export const X_ZONE = 12, THE_MOON = 13;
export const ALL_EMERALDS = 0x7F;     // ALL_ZONE_CHAOS_EMERALDS: a bit per special stage
const MOON_BEATEN = 15;               // CreateExtraStageResults' unlockedLevels[0]

/**
 * Whether the extra stage opens: `character` (0 is Sonic), the `level` being played, the save's `emeralds` and
 * its four characters' `unlockedLevels`, and `courseSelectLevel` (gMultiplayerCurrentLevel, the level the course
 * select started).
 */
export function theMoonOpens({ character = 0, level = 0, emeralds = 0, unlockedLevels = [0, 0, 0, 0], courseSelectLevel = 0 } = {}) {
  return character === 0 && level >= X_ZONE && emeralds === ALL_EMERALDS
    && unlockedLevels.every(l => l > X_ZONE)
    && !(unlockedLevels[0] === MOON_BEATEN && courseSelectLevel === X_ZONE);
}
