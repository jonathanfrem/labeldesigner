import type { SheetTemplate } from '../model/types';
import type { TemplateStorageAdapter } from './templateStorageAdapter';

const DB_NAME = 'labeldesigner';
const DB_VERSION = 2;
const CUSTOM_TEMPLATES_STORE = 'customTemplates';
/** Removed: verified-overrides for built-ins. Dropped in the v2 upgrade so no stale record can shadow templates.json. */
const LEGACY_VERIFIED_OVERRIDES_STORE = 'verifiedOverrides';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CUSTOM_TEMPLATES_STORE)) {
        db.createObjectStore(CUSTOM_TEMPLATES_STORE, { keyPath: 'id' });
      }
      if (db.objectStoreNames.contains(LEGACY_VERIFIED_OVERRIDES_STORE)) {
        db.deleteObjectStore(LEGACY_VERIFIED_OVERRIDES_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class IndexedDbTemplateStorageAdapter implements TemplateStorageAdapter {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) this.dbPromise = openDb();
    return this.dbPromise;
  }

  async listCustomTemplates(): Promise<SheetTemplate[]> {
    const db = await this.db();
    const tx = db.transaction(CUSTOM_TEMPLATES_STORE, 'readonly');
    const all = await requestToPromise(tx.objectStore(CUSTOM_TEMPLATES_STORE).getAll());
    return all as SheetTemplate[];
  }

  async saveCustomTemplate(template: SheetTemplate): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(CUSTOM_TEMPLATES_STORE, 'readwrite');
    tx.objectStore(CUSTOM_TEMPLATES_STORE).put(template);
    await transactionDone(tx);
  }

  async deleteCustomTemplate(id: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(CUSTOM_TEMPLATES_STORE, 'readwrite');
    tx.objectStore(CUSTOM_TEMPLATES_STORE).delete(id);
    await transactionDone(tx);
  }
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
