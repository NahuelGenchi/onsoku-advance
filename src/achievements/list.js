// The game's achievements. Dreamports reads this list (NahuelGenchi/dreamports#16): an id never changes once
// shipped, as the accounts keep what was earned by it. The game is Beaten with every achievement marked `beaten`
// (the zones and the normal ending), and Mastered with all of them.

export const ACHIEVEMENTS = [
  { id: 'hundred-rings', title: 'Hundred Rings', description: 'Hold 100 rings at once' },
  { id: 'two-hundred-rings', title: 'Ring Hoarder', description: 'Hold 200 rings at once' },
  { id: 'neo-green-hill', title: 'Neo Green Hill', description: 'Clear Neo Green Hill Zone', beaten: true },
  { id: 'secret-base', title: 'Secret Base', description: 'Clear Secret Base Zone', beaten: true },
  { id: 'casino-paradise', title: 'Casino Paradise', description: 'Clear Casino Paradise Zone', beaten: true },
  { id: 'ice-mountain', title: 'Ice Mountain', description: 'Clear Ice Mountain Zone', beaten: true },
  { id: 'angel-island', title: 'Angel Island', description: 'Clear Angel Island Zone', beaten: true },
  { id: 'egg-rocket', title: 'Egg Rocket', description: 'Clear Egg Rocket Zone', beaten: true },
  { id: 'cosmic-angel', title: 'Cosmic Angel', description: 'Clear Cosmic Angel Zone', beaten: true },
  { id: 'egg-wrecker', title: 'Egg Wrecker', description: 'Beat Egg Wrecker in the X Zone' },
  { id: 'egg-drillster', title: 'Egg Drillster', description: 'Beat Egg Drillster in the X Zone' },
  { id: 'x-zone', title: 'Egg X Down', description: 'Clear the X Zone', beaten: true },
  { id: 'true-ending', title: 'Super Sonic', description: 'Beat the Super Egg Robo on the Moon' },
  { id: 'first-emerald', title: 'First Emerald', description: 'Win a Chaos Emerald in a special stage' },
  { id: 'all-emeralds', title: 'Seven Emeralds', description: 'Hold all 7 Chaos Emeralds' },
  { id: 'flawless-boss', title: 'Untouched', description: 'Beat a boss without being hit' },
  { id: 'flawless-egg-hammer-tank', title: 'Flawless Hammer Tank', description: 'Beat the Egg Hammer Tank without being hit' },
  { id: 'flawless-egg-press', title: 'Flawless Egg Press', description: 'Beat the Egg Press without being hit' },
  { id: 'flawless-egg-ball', title: 'Flawless Egg Ball', description: 'Beat the Egg Ball without being hit' },
  { id: 'flawless-egg-spider', title: 'Flawless Egg Spider', description: 'Beat the Egg Spider without being hit' },
  { id: 'flawless-mecha-knuckles', title: 'Flawless Mecha Knuckles', description: 'Beat Mecha Knuckles without being hit' },
  { id: 'flawless-egg-snake', title: 'Flawless Egg Snake', description: 'Beat the Egg Snake without being hit' },
  { id: 'flawless-egg-wrecker', title: 'Flawless Egg Wrecker', description: 'Beat Egg Wrecker without being hit' },
  { id: 'flawless-egg-drillster', title: 'Flawless Egg Drillster', description: 'Beat Egg Drillster without being hit' },
  { id: 'flawless-egg-x', title: 'Flawless Egg X', description: 'Beat Egg X without being hit' },
  { id: 'flawless-egg-robo', title: 'Flawless Egg Robo', description: 'Beat the Super Egg Robo without being hit' },
  { id: 'perfect-act', title: 'Not a Scratch', description: 'Clear an act without being hit' },
  { id: 'fast-act', title: 'Under a Minute', description: 'Clear an act in under 1:00' },
  { id: 'extra-lives', title: 'Life Collector', description: 'Have 10 lives' },
  { id: 'tails-clear', title: 'Two Tails', description: 'Clear the X Zone as Tails' },
  { id: 'knuckles-clear', title: 'Guardian', description: 'Clear the X Zone as Knuckles' },
  { id: 'chao-hunt', title: 'Chao Hunter', description: 'Win a Chao Hunt' },
];

export const achievement = id => ACHIEVEMENTS.find(a => a.id === id);

/** The game's status with `earned(id)` true for what has been earned: 'mastered', 'beaten' or null. */
export function statusOf(earned) {
  if (ACHIEVEMENTS.every(a => earned(a.id))) return 'mastered';
  if (ACHIEVEMENTS.every(a => !a.beaten || earned(a.id))) return 'beaten';
  return null;
}
