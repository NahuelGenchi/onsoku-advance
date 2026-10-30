// What the player has earned, kept in this browser by id with the time it was earned. On dreamports.net the page
// loads the site's /dreamports.js, which saves each new unlock to the signed-in player's profile through its
// unlock(id), and claims this map when the player signs in (NahuelGenchi/dreamports#68). Elsewhere it 404s and
// the unlocks stay here.

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

/**
 * Returns { unlock(id), earned(id), list(), status(), onUnlock(fn), onStatus(fn) }: unlock earns `id` once, and
 * returns the achievement if it is new (else null); earned says when it was earned (ms since the epoch) or null;
 * list gives every achievement with its `earned`; status is the game's, 'beaten', 'mastered' or null (list.js);
 * onUnlock calls `fn(achievement)` on each new one, and onStatus `fn(status)` when an unlock changes the status.
 */
export function openAchievements() {
  const earnedAt = read(), listeners = [], statusListeners = [];
  const status = () => statusOf(id => !!earnedAt[id]);
  return {
    unlock(id) {
      const a = achievement(id);
      if (!a || earnedAt[id]) return null;
      const before = status();
      earnedAt[id] = Date.now();
      try { localStorage.setItem(KEY, JSON.stringify(earnedAt)); } catch { /* kept for this visit only */ }
      try { globalThis.dreamports?.unlock?.(id); } catch (err) { console.warn('Dreamports unlock:', err); }
      for (const fn of listeners) fn(a);
      const after = status();
      if (after !== before) for (const fn of statusListeners) fn(after);
      return a;
    },
    earned: id => earnedAt[id] ?? null,
    list: () => ACHIEVEMENTS.map(a => ({ ...a, earned: earnedAt[a.id] ?? null })),
    status,
    onUnlock(fn) { listeners.push(fn); },
    onStatus(fn) { statusListeners.push(fn); },
  };
}
