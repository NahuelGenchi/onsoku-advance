// The game's achievements. Dreamports reads this list (NahuelGenchi/dreamports#16): an id never changes once
// shipped, as the accounts keep what was earned by it.

export const ACHIEVEMENTS = [
  { id: 'hundred-rings', title: 'Hundred Rings', description: 'Hold 100 rings at once' },
  { id: 'two-hundred-rings', title: 'Ring Hoarder', description: 'Hold 200 rings at once' },
  { id: 'neo-green-hill', title: 'Neo Green Hill', description: 'Clear Neo Green Hill Zone' },
  { id: 'secret-base', title: 'Secret Base', description: 'Clear Secret Base Zone' },
  { id: 'casino-paradise', title: 'Casino Paradise', description: 'Clear Casino Paradise Zone' },
  { id: 'ice-mountain', title: 'Ice Mountain', description: 'Clear Ice Mountain Zone' },
  { id: 'angel-island', title: 'Angel Island', description: 'Clear Angel Island Zone' },
  { id: 'egg-rocket', title: 'Egg Rocket', description: 'Clear Egg Rocket Zone' },
  { id: 'cosmic-angel', title: 'Cosmic Angel', description: 'Clear Cosmic Angel Zone' },
  { id: 'x-zone', title: 'Egg X Down', description: 'Clear the X Zone' },
  { id: 'true-ending', title: 'Super Sonic', description: 'Beat the Super Egg Robo on the Moon' },
  { id: 'first-emerald', title: 'First Emerald', description: 'Win a Chaos Emerald in a special stage' },
  { id: 'all-emeralds', title: 'Seven Emeralds', description: 'Hold all 7 Chaos Emeralds' },
  { id: 'flawless-boss', title: 'Untouched', description: 'Beat a boss without being hit' },
  { id: 'perfect-act', title: 'Not a Scratch', description: 'Clear an act without being hit' },
  { id: 'fast-act', title: 'Under a Minute', description: 'Clear an act in under 1:00' },
  { id: 'extra-lives', title: 'Life Collector', description: 'Have 10 lives' },
  { id: 'tails-clear', title: 'Two Tails', description: 'Clear the X Zone as Tails' },
  { id: 'knuckles-clear', title: 'Guardian', description: 'Clear the X Zone as Knuckles' },
  { id: 'chao-hunt', title: 'Chao Hunter', description: 'Win a Chao Hunt' },
];

export const achievement = id => ACHIEVEMENTS.find(a => a.id === id);
