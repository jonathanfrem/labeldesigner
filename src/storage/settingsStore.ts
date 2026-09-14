import { openDb, requestToPromise, SETTINGS_STORE, transactionDone } from './db';

/**
 * Keyed singleton records. Used for the GitHub token and the linked repo, which are
 * per-browser state rather than part of any document — they must never enter the document
 * model or undo history (CLAUDE.md invariant 10).
 */
export async function readSetting<T>(key: string): Promise<T | null> {
  const db = await openDb();
  const tx = db.transaction(SETTINGS_STORE, 'readonly');
  const record = await requestToPromise(tx.objectStore(SETTINGS_STORE).get(key));
  return (record as { key: string; value: T } | undefined)?.value ?? null;
}

export async function writeSetting<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(SETTINGS_STORE, 'readwrite');
  tx.objectStore(SETTINGS_STORE).put({ key, value });
  await transactionDone(tx);
}

export async function deleteSetting(key: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(SETTINGS_STORE, 'readwrite');
  tx.objectStore(SETTINGS_STORE).delete(key);
  await transactionDone(tx);
}
