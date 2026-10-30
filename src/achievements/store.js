// What the player has earned. What this device earned is kept in this browser by id with the time it was earned,
// and nothing else: on dreamports.net a profile claims that map when its player signs in here, so it must hold only
// what was earned here. There the page loads the site's /dreamports.js, which saves each new unlock to the
// signed-in player's profile through its unlock(id) (NahuelGenchi/dreamports#68), and whose earned() gives what the
// profile holds from every device (NahuelGenchi/dreamports#70), kept for this visit only. Elsewhere it 404s and the
// unlocks stay here.

import { ACHIEVEMENTS, achievement, statusOf } from './list.js';

const KEY = 'onsoku.achievements';

function read() {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return kept && typeof kept === 'object' ? kept : {};
  } catch {
    return {};   // storage blocked or unreadable: nothing earned yet
  }
}

// the signed-in player's achievements from the profile, as the Dreamports script's earned() gives them: only the
// ids this game has, with real times; none without the script, a player or the site
async function readProfile() {
  try {
    const got = await globalThis.dreamports?.earned?.();
    if (!got || typeof got !== 'object') return {};
    return Object.fromEntries(Object.entries(got).filter(([id, at]) => achievement(id) && Number.isFinite(at)));
  } catch {
    return {};
  }
}

/**
 * Returns { unlock(id), earned(id), list(), status(), onUnlock(fn), onStatus(fn), onProfile(fn) }: unlock earns
 * `id` once, here or on the profile, and returns the achievement if it is new (else null); earned says when it was
 * first earned (ms since the epoch) or null; list gives every achievement with its `earned`; status is the game's,
 * 'beaten', 'mastered' or null (list.js); onUnlock calls `fn(achievement)` on each new one, onStatus `fn(status,
 * fromProfile)` when an unlock or the profile's achievements change the status, and onProfile `fn()` once the
 * profile's achievements have come, which show no popup.
 */
export function openAchievements() {
  const earnedAt = read(), listeners = [], statusListeners = [], profileListeners = [];
  let fromProfile = {};   // the profile's, from every device, never written to this browser
  const earned = id => {
    const times = [earnedAt[id], fromProfile[id]].filter(Number.isFinite);
    return times.length ? Math.min(...times) : null;
  };
  const status = () => statusOf(id => earned(id) !== null);
  readProfile().then(got => {
    if (!Object.keys(got).length) return;
    const before = status();
    fromProfile = got;
    const after = status();
    if (after !== before) for (const fn of statusListeners) fn(after, true);
    for (const fn of profileListeners) fn();
  });
  return {
    unlock(id) {
      const a = achievement(id);
      if (!a || earned(id) !== null) return null;
      const before = status();
      earnedAt[id] = Date.now();
      try { localStorage.setItem(KEY, JSON.stringify(earnedAt)); } catch { /* kept for this visit only */ }
      try { globalThis.dreamports?.unlock?.(id); } catch (err) { console.warn('Dreamports unlock:', err); }
      for (const fn of listeners) fn(a);
      const after = status();
      if (after !== before) for (const fn of statusListeners) fn(after, false);
      return a;
    },
    earned,
    list: () => ACHIEVEMENTS.map(a => ({ ...a, earned: earned(a.id) })),
    status,
    onUnlock(fn) { listeners.push(fn); },
    onStatus(fn) { statusListeners.push(fn); },
    onProfile(fn) { profileListeners.push(fn); },
  };
}
