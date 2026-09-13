import type { SheetTemplate } from '../model/types';
import type { TemplateStorageAdapter } from './templateStorageAdapter';
import { CUSTOM_TEMPLATES_STORE, openDb, requestToPromise, transactionDone } from './db';

export class IndexedDbTemplateStorageAdapter implements TemplateStorageAdapter {
  async listCustomTemplates(): Promise<SheetTemplate[]> {
    const db = await openDb();
    const tx = db.transaction(CUSTOM_TEMPLATES_STORE, 'readonly');
    const all = await requestToPromise(tx.objectStore(CUSTOM_TEMPLATES_STORE).getAll());
    return all as SheetTemplate[];
  }

  async saveCustomTemplate(template: SheetTemplate): Promise<void> {
    const db = await openDb();
    const tx = db.transaction(CUSTOM_TEMPLATES_STORE, 'readwrite');
    tx.objectStore(CUSTOM_TEMPLATES_STORE).put(template);
    await transactionDone(tx);
  }

  async deleteCustomTemplate(id: string): Promise<void> {
    const db = await openDb();
    const tx = db.transaction(CUSTOM_TEMPLATES_STORE, 'readwrite');
    tx.objectStore(CUSTOM_TEMPLATES_STORE).delete(id);
    await transactionDone(tx);
  }
}
