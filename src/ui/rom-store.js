// Keeps the player's ROM in this browser's IndexedDB so it doesn't have to be chosen every visit.
// Nothing is sent anywhere; clearing site data or "Forget" removes it.

const DB_NAME = 'onsoku-advance', STORE = 'rom', KEY = 'current';

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
export async function loadRememberedRom() {
  try { return (await run('readonly', s => s.get(KEY))) ?? null; }
  catch { return null; }   // private mode or storage disabled: just ask again
}

export async function rememberRom(name, buffer) {
  try { await run('readwrite', s => s.put({ name, buffer }, KEY)); return true; }
  catch { return false; }
}

export async function forgetRom() {
  try { await run('readwrite', s => s.delete(KEY)); } catch { /* nothing stored */ }
}
