import type { ProjectStorageAdapter, StoredProject } from './projectStorageAdapter';
import { openDb, PROJECTS_STORE, requestToPromise, transactionDone } from './db';

export class IndexedDbProjectStorageAdapter implements ProjectStorageAdapter {
  async listProjects(): Promise<StoredProject[]> {
    const db = await openDb();
    const tx = db.transaction(PROJECTS_STORE, 'readonly');
    const all = await requestToPromise(tx.objectStore(PROJECTS_STORE).getAll());
    return all as StoredProject[];
  }

  async saveProject(project: StoredProject): Promise<void> {
    const db = await openDb();
    const tx = db.transaction(PROJECTS_STORE, 'readwrite');
    tx.objectStore(PROJECTS_STORE).put(project);
    await transactionDone(tx);
  }

  async deleteProject(id: string): Promise<void> {
    const db = await openDb();
    const tx = db.transaction(PROJECTS_STORE, 'readwrite');
    tx.objectStore(PROJECTS_STORE).delete(id);
    await transactionDone(tx);
  }
}
