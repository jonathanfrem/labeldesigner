const DB_NAME = 'labeldesigner';
const DB_VERSION = 4;

export const CUSTOM_TEMPLATES_STORE = 'customTemplates';
export const PROJECTS_STORE = 'projects';
/**
 * Small singleton records keyed by name — the GitHub token and the linked repo
 * (`github.auth`, `github.repo`). A keyed store rather than localStorage so it shares the
 * projects' transaction and eviction fate: a browser that still has the user's projects
 * still has the token that syncs them.
 */
export const SETTINGS_STORE = 'settings';
/** Removed: verified-overrides for built-ins. Dropped in the v2 upgrade so no stale record can shadow templates.json. */
const LEGACY_VERIFIED_OVERRIDES_STORE = 'verifiedOverrides';

let dbPromise: Promise<IDBDatabase> | null = null;

/** How long to wait for a blocked upgrade before giving up with a readable error. */
const BLOCKED_TIMEOUT_MS = 4000;

/**
 * Single shared connection for every IndexedDB-backed adapter. IndexedDB
 * fires `onupgradeneeded` once per version bump for the whole database, so
 * every object store this app uses is created here rather than in each
 * adapter — two independent `indexedDB.open()` callers racing their own
 * `onupgradeneeded` for the same database name is fragile.
 *
 * Bumping DB_VERSION on a deployed site means some open tab may still hold a
 * connection to the previous version, and IndexedDB refuses to run
 * `onupgradeneeded` until every such connection closes. Two things guard
 * against that turning into a silent, indefinite hang:
 *
 * - The connection this function hands back self-closes on `versionchange` —
 *   the moment *another* tab (a future deploy) needs to upgrade, this one
 *   releases its lock instead of blocking that tab the same way.
 * - `onblocked` here means an *older* tab is still open right now. Rather
 *   than wait forever for the user to notice and close it, this gives it a
 *   few seconds and then rejects with a message that says what to do.
 */
export function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      let blockedTimer: ReturnType<typeof setTimeout> | null = null;

      request.onupgradeneeded = () => {
        if (blockedTimer) clearTimeout(blockedTimer);
        const db = request.result;
        if (!db.objectStoreNames.contains(CUSTOM_TEMPLATES_STORE)) {
          db.createObjectStore(CUSTOM_TEMPLATES_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
          db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
        }
        if (db.objectStoreNames.contains(LEGACY_VERIFIED_OVERRIDES_STORE)) {
          db.deleteObjectStore(LEGACY_VERIFIED_OVERRIDES_STORE);
        }
      };
      request.onblocked = () => {
        // Another tab holding an older connection may still close in time (its own
        // `onversionchange` below, or the user closing it) and let this request proceed
        // on its own — this timer only fires if that hasn't happened after a few seconds.
        blockedTimer = setTimeout(() => {
          dbPromise = null;
          reject(new Error('Another open tab of this app is blocking an update. Close other tabs of this site and reload.'));
        }, BLOCKED_TIMEOUT_MS);
      };
      request.onsuccess = () => {
        if (blockedTimer) clearTimeout(blockedTimer);
        const db = request.result;
        // See the doc comment: this is the half of the guard that protects *other* tabs.
        // Also drop the cached promise, so if this tab is still open and used afterwards,
        // the next openDb() call reopens fresh instead of handing back a closed connection.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        if (blockedTimer) clearTimeout(blockedTimer);
        dbPromise = null;
        reject(request.error);
      };
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
