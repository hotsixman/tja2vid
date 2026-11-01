/** Remembers the user's chosen skin zip in IndexedDB so it becomes their default. */
const DB = 'tja2vid';
const STORE = 'skins';
const KEY = 'default';

export interface StoredSkin {
  name: string;
  data: Blob;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function saveDefaultSkin(skin: StoredSkin): Promise<void> {
  await tx('readwrite', (s) => s.put(skin, KEY));
}

export async function loadDefaultSkinZip(): Promise<StoredSkin | null> {
  try {
    return ((await tx('readonly', (s) => s.get(KEY))) as StoredSkin | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function clearDefaultSkin(): Promise<void> {
  await tx('readwrite', (s) => s.delete(KEY));
}
