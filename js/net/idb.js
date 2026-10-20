// Tiny IndexedDB key-value store (sandbox sessions, drafts, guest prefs).
const DB = "vmatrimony", STORE = "kv";
let dbp;
function open() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => { const t = db.transaction(STORE, mode); const r = fn(t.objectStore(STORE)); t.oncomplete = () => res(r?.result); t.onerror = () => rej(t.error); });
}
export const idbGet = (k) => tx("readonly", (s) => s.get(k));
export const idbSet = (k, v) => tx("readwrite", (s) => s.put(v, k));
export const idbDel = (k) => tx("readwrite", (s) => s.delete(k));
