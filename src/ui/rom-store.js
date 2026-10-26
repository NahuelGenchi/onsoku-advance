// Keeps the player's ROM in this browser's IndexedDB so it doesn't have to be chosen every visit: the Sonic
// Advance ROM, and under their own keys the Sonic Rush ROM the optional Rush boost reads and the Sonic Advance
// 2 ROM the optional Boost Mode reads.
// Nothing is sent anywhere; clearing site data or "Forget" removes it.

const DB_NAME = 'onsoku-advance', STORE = 'rom', KEY = 'current';
export const RUSH_ROM = 'rush', SA2_ROM = 'sa2';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(mode, action) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

/** @returns {Promise<{name: string, buffer: ArrayBuffer} | null>} */
export async function loadRememberedRom(key = KEY) {
  try { return (await run('readonly', s => s.get(key))) ?? null; }
  catch { return null; }   // private mode or storage disabled: just ask again
}

export async function rememberRom(name, buffer, key = KEY) {
  try { await run('readwrite', s => s.put({ name, buffer }, key)); return true; }
  catch { return false; }
}

export async function forgetRom(key = KEY) {
  try { await run('readwrite', s => s.delete(key)); } catch { /* nothing stored */ }
}
