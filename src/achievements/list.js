// The game's achievements. Dreamports reads this list (NahuelGenchi/dreamports#16): an id never changes once
// shipped, as the accounts keep what was earned by it.

export const ACHIEVEMENTS = [
  { id: 'hundred-rings', title: 'Hundred Rings', description: 'Hold 100 rings at once', points: 5 },
];

export const achievement = id => ACHIEVEMENTS.find(a => a.id === id);
