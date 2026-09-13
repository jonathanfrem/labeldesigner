const DB_NAME = 'labeldesigner';
const DB_VERSION = 3;

export const CUSTOM_TEMPLATES_STORE = 'customTemplates';
export const PROJECTS_STORE = 'projects';
/** Removed: verified-overrides for built-ins. Dropped in the v2 upgrade so no stale record can shadow templates.json. */
const LEGACY_VERIFIED_OVERRIDES_STORE = 'verifiedOverrides';

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Single shared connection for every IndexedDB-backed adapter. IndexedDB
 * fires `onupgradeneeded` once per version bump for the whole database, so
 * every object store this app uses is created here rather than in each
 * adapter — two independent `indexedDB.open()` callers racing their own
 * `onupgradeneeded` for the same database name is fragile.
 */
export function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CUSTOM_TEMPLATES_STORE)) {
          db.createObjectStore(CUSTOM_TEMPLATES_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
          db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
        }
        if (db.objectStoreNames.contains(LEGACY_VERIFIED_OVERRIDES_STORE)) {
          db.deleteObjectStore(LEGACY_VERIFIED_OVERRIDES_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
