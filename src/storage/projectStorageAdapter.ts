import type { RemoteLink } from '../cloud/github/types';
import type { LabelDocument } from '../model/types';

/**
 * A saved project. `fileHandle` is only ever populated on Chromium, which
 * can structured-clone a `FileSystemFileHandle` straight into IndexedDB —
 * that's what lets Ctrl+S keep overwriting the same file across reloads
 * without asking the user to re-pick it (PLAN §2.5). Firefox/Safari simply
 * never set it and fall back to download/upload.
 *
 * `remote` is the same idea pointed at a different destination: the GitHub
 * file this project saves back to (PLAN §2.7). Both are optional and
 * independent — a project can be linked to neither, either, or both, and
 * IndexedDB remains the autosave target regardless.
 */
export interface StoredProject {
  id: string;
  name: string;
  updatedAt: number;
  document: LabelDocument;
  fileHandle?: FileSystemFileHandle;
  remote?: RemoteLink;
}

/**
 * Capability adapter for persisting projects (PLAN §6 architecture, mirrors
 * `TemplateStorageAdapter`). IndexedDB is the only implementation — it backs
 * both autosave and the project library list, independent of whether the
 * user has also linked a real file via the File System Access API.
 */
export interface ProjectStorageAdapter {
  listProjects(): Promise<StoredProject[]>;
  saveProject(project: StoredProject): Promise<void>;
  deleteProject(id: string): Promise<void>;
}
