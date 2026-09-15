import { useCallback, useEffect, useRef, useState } from 'react';
import type { LabelDocument, SheetTemplate } from '../model/types';
import { resetDocumentHistory, useDocumentStore } from './documentStore';
import { useUiStore } from './uiStore';
import type { ProjectStorageAdapter, StoredProject } from '../storage/projectStorageAdapter';
import {
  isFileSystemAccessSupported,
  pickOpenHandle,
  pickSaveHandle,
  readFromHandle,
  verifyPermission,
  writeToHandle,
} from '../storage/fileSystemAdapter';
import { downloadProjectJson, migrate, serializeProject } from '../lib/projectJson';
import { newProjectId } from '../lib/id';
import type { GithubCloudApi } from '../cloud/github/useGithubCloud';
import type { RemoteLink } from '../cloud/github/types';
import { ConflictError } from '../cloud/github/errors';
import { pullProject, pushProject, pushTemplate } from '../cloud/github/githubProjectSync';

const AUTOSAVE_DEBOUNCE_MS = 2000;

const GEOMETRY_KEYS = [
  'pageSize',
  'marginTop',
  'marginLeft',
  'labelWidth',
  'labelHeight',
  'columns',
  'rows',
  'pitchX',
  'pitchY',
  'shape',
  'cornerRadius',
] as const;

function geometryDiffers(a: SheetTemplate, b: SheetTemplate): boolean {
  return GEOMETRY_KEYS.some((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
}

export type TemplateMismatch =
  | { kind: 'missing'; embedded: SheetTemplate }
  | { kind: 'geometry-diff'; embedded: SheetTemplate; library: SheetTemplate };

/**
 * A save refused because the repo moved on. `remote` is the version now on GitHub, already
 * fetched so the dialog can offer either resolution without a further round trip.
 */
export interface RemoteConflict {
  remote: LabelDocument;
  link: RemoteLink;
}

export interface ProjectSessionApi {
  projectId: string | null;
  isDirty: boolean;
  hasFileHandle: boolean;
  remote: RemoteLink | null;
  /** A repo is connected and selected, so this project could be linked to it. */
  canSaveToRemote: boolean;
  /** True while a save is in flight — GitHub writes are slow enough to need feedback. */
  isSaving: boolean;
  saveError: string | null;
  /** Writes to every linked target. What Ctrl+S and the Save button call. */
  save: () => Promise<void>;
  saveAsFile: () => Promise<void>;
  /** First save to GitHub: links this project to the repo, then writes. */
  saveToRemote: () => Promise<void>;
  /** Resolves to null if the user cancelled the picker. */
  openFromFile: () => Promise<LabelDocument | null>;
  openFromRemote: (path: string) => Promise<LabelDocument>;
  openFromLibrary: (stored: StoredProject) => LabelDocument;
  newProject: (template: SheetTemplate, name?: string) => void;
  pendingMismatch: TemplateMismatch | null;
  addEmbeddedAsCustomTemplate: () => Promise<void>;
  updateToLibraryTemplate: () => void;
  dismissMismatch: () => void;
  pendingConflict: RemoteConflict | null;
  /** Keep the local version, overwriting what's on GitHub. */
  resolveConflictOverwrite: () => Promise<void>;
  /** Abandon local edits and load the repo's version. */
  resolveConflictTakeRemote: () => LabelDocument | null;
  dismissConflict: () => void;
}

function pickFileViaInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = window.document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/**
 * The integration point tying documentStore, uiStore and project persistence
 * together (PLAN M6). One instance is created at the app root and shared via
 * ProjectSessionContext, so autosave debouncing and the last-saved snapshot
 * used for dirty tracking never fork across components.
 */
export function useProjectSession(
  adapter: ProjectStorageAdapter,
  resolveTemplate: (id: string) => SheetTemplate | undefined,
  onAddCustomTemplate: (template: SheetTemplate) => Promise<void>,
  cloud: GithubCloudApi,
): ProjectSessionApi {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [pendingMismatch, setPendingMismatch] = useState<TemplateMismatch | null>(null);
  const [remote, setRemote] = useState<RemoteLink | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingConflict, setPendingConflict] = useState<RemoteConflict | null>(null);

  const isDirty = useUiStore((s) => s.isDirty);
  const hasFileHandle = useUiStore((s) => s.hasFileHandle);
  const setDirty = useUiStore((s) => s.setDirty);
  const setHasFileHandle = useUiStore((s) => s.setHasFileHandle);

  const currentDocument = useDocumentStore((s) => s.document);

  const lastSavedDocumentRef = useRef<LabelDocument | null>(null);
  const fileHandleRef = useRef<FileSystemFileHandle | null>(null);
  const projectIdRef = useRef<string | null>(null);
  /** Mirrors `remote` state for use inside callbacks that must not re-create on every link change. */
  const remoteRef = useRef<RemoteLink | null>(null);

  const setRemoteLink = useCallback((link: RemoteLink | null) => {
    remoteRef.current = link;
    setRemote(link);
  }, []);

  /** Reference-inequality against the last explicit save — cheap because documentStore replaces `document` immutably on every mutation. */
  useEffect(() => {
    setDirty(currentDocument !== lastSavedDocumentRef.current);
  }, [currentDocument, setDirty]);

  useEffect(() => {
    const id = projectIdRef.current;
    if (!id) return;
    const timer = setTimeout(() => {
      // Autosave is IndexedDB-only and deliberately never touches GitHub: committing on a
      // 2-second debounce would bury the repo history and burn the rate limit (PLAN §2.7).
      adapter.saveProject({
        id,
        name: currentDocument.name,
        updatedAt: Date.now(),
        document: currentDocument,
        fileHandle: fileHandleRef.current ?? undefined,
        remote: remoteRef.current ?? undefined,
      });
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // Autosave is keyed purely on the document reference changing; adapter identity is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDocument]);

  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const reconcileTemplate = useCallback(
    (doc: LabelDocument) => {
      const library = resolveTemplate(doc.templateId);
      if (!library) {
        setPendingMismatch({ kind: 'missing', embedded: doc.template });
      } else if (geometryDiffers(doc.template, library)) {
        setPendingMismatch({ kind: 'geometry-diff', embedded: doc.template, library });
      } else {
        setPendingMismatch(null);
      }
    },
    [resolveTemplate],
  );

  const installDocument = useCallback(
    (doc: LabelDocument, handle: FileSystemFileHandle | null, link: RemoteLink | null = null): LabelDocument => {
      reconcileTemplate(doc);
      useDocumentStore.getState().loadDocument(doc);
      resetDocumentHistory();
      fileHandleRef.current = handle;
      setHasFileHandle(handle !== null);
      setRemoteLink(link);
      projectIdRef.current = doc.id;
      setProjectId(doc.id);
      lastSavedDocumentRef.current = doc;
      setDirty(false);
      setSaveError(null);
      setPendingConflict(null);
      return doc;
    },
    [reconcileTemplate, setDirty, setHasFileHandle, setRemoteLink],
  );

  const newProject = useCallback(
    (template: SheetTemplate, name?: string) => {
      useDocumentStore.getState().loadTemplate(template, name);
      resetDocumentHistory();
      const doc = useDocumentStore.getState().document;
      fileHandleRef.current = null;
      setHasFileHandle(false);
      setRemoteLink(null);
      const id = newProjectId();
      projectIdRef.current = id;
      setProjectId(id);
      lastSavedDocumentRef.current = doc;
      setDirty(false);
      setPendingMismatch(null);
      setSaveError(null);
      setPendingConflict(null);
    },
    [setDirty, setHasFileHandle, setRemoteLink],
  );

  const persist = useCallback(
    async (doc: LabelDocument) => {
      const id = projectIdRef.current ?? newProjectId();
      projectIdRef.current = id;
      setProjectId(id);
      lastSavedDocumentRef.current = doc;
      setDirty(false);
      await adapter.saveProject({
        id,
        name: doc.name,
        updatedAt: Date.now(),
        document: doc,
        fileHandle: fileHandleRef.current ?? undefined,
        remote: remoteRef.current ?? undefined,
      });
    },
    [adapter, setDirty],
  );

  const saveAsFile = useCallback(async () => {
    const doc = useDocumentStore.getState().document;
    if (isFileSystemAccessSupported()) {
      const handle = await pickSaveHandle(`${doc.name || 'label'}.lbl.json`);
      if (!handle) return;
      await writeToHandle(handle, serializeProject(doc));
      fileHandleRef.current = handle;
      setHasFileHandle(true);
    } else {
      downloadProjectJson(doc);
    }
    await persist(doc);
  }, [persist, setHasFileHandle]);

  /** Writes the linked file, if there is one. Returns false if the grant was withdrawn. */
  const writeLinkedFile = useCallback(async (doc: LabelDocument): Promise<boolean> => {
    if (!fileHandleRef.current) return false;
    const granted = await verifyPermission(fileHandleRef.current, 'readwrite');
    if (!granted) return false;
    await writeToHandle(fileHandleRef.current, serializeProject(doc));
    return true;
  }, []);

  /**
   * Commits to GitHub and returns the updated link.
   *
   * A custom template is pushed alongside the project — without it, opening this project on
   * another machine would resolve no template and trip the mismatch dialog. Built-ins ship
   * in the bundle and are never written.
   */
  const writeRemote = useCallback(
    async (doc: LabelDocument, link: RemoteLink | null): Promise<RemoteLink> => {
      const { client, repo } = cloud;
      if (!client || !repo) throw new Error('Connect a GitHub repository first.');
      const next = await pushProject(client, repo, doc, link);
      if (!doc.template.builtIn) {
        await pushTemplate(client, repo, doc.template);
      }
      return next;
    },
    [cloud],
  );

  /**
   * Turns a failed save into UI state.
   *
   * A stale sha means someone else committed since we last read the file, so the remote
   * version is fetched here and handed to the conflict dialog — both resolutions are then a
   * local decision rather than another round trip.
   */
  const handleSaveError = useCallback(
    async (err: unknown, link: RemoteLink | null) => {
      if (err instanceof ConflictError && link && cloud.client && cloud.repo) {
        try {
          const { document, link: freshLink } = await pullProject(cloud.client, cloud.repo, link.path);
          setPendingConflict({ remote: document, link: freshLink });
          return;
        } catch {
          // Fall through to the generic message — if we can't even read it back, the
          // conflict dialog would have nothing to show.
        }
      }
      setSaveError(err instanceof Error ? err.message : 'Could not save.');
    },
    [cloud],
  );

  /**
   * Writes to every linked target, then records the save locally.
   *
   * Both targets are written rather than picking one: a project linked to both a file and a
   * repo would otherwise silently accumulate a stale copy. Dirty state only clears when
   * every write succeeded, so a failed GitHub save leaves the project visibly unsaved.
   */
  const save = useCallback(async () => {
    const doc = useDocumentStore.getState().document;
    const link = remoteRef.current;
    if (!fileHandleRef.current && !link) {
      await saveAsFile();
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    try {
      // Local file first: it's fast and can't conflict, so a GitHub failure never costs the
      // user their on-disk copy.
      if (!(await writeLinkedFile(doc)) && !link) {
        // The handle's permission was withdrawn and there's no repo to fall back on.
        await saveAsFile();
        return;
      }
      if (link) setRemoteLink(await writeRemote(doc, link));
      await persist(doc);
    } catch (err) {
      await handleSaveError(err, link);
    } finally {
      setIsSaving(false);
    }
  }, [handleSaveError, persist, saveAsFile, setRemoteLink, writeLinkedFile, writeRemote]);

  /** First save to GitHub — links the project to the selected repo, then writes. */
  const saveToRemote = useCallback(async () => {
    const doc = useDocumentStore.getState().document;
    setIsSaving(true);
    setSaveError(null);
    try {
      setRemoteLink(await writeRemote(doc, remoteRef.current));
      await persist(doc);
    } catch (err) {
      await handleSaveError(err, remoteRef.current);
    } finally {
      setIsSaving(false);
    }
  }, [handleSaveError, persist, setRemoteLink, writeRemote]);

  const openFromFile = useCallback(async () => {
    let text: string;
    let handle: FileSystemFileHandle | null = null;
    if (isFileSystemAccessSupported()) {
      handle = await pickOpenHandle();
      if (!handle) return null;
      text = await readFromHandle(handle);
    } else {
      const file = await pickFileViaInput();
      if (!file) return null;
      text = await file.text();
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('That file is not valid JSON.');
    }
    const doc = migrate(parsed);
    return installDocument(doc, handle);
  }, [installDocument]);

  const openFromRemote = useCallback(
    async (path: string) => {
      const { client, repo } = cloud;
      if (!client || !repo) throw new Error('Connect a GitHub repository first.');
      const { document, link } = await pullProject(client, repo, path);
      return installDocument(document, null, link);
    },
    [cloud, installDocument],
  );

  const openFromLibrary = useCallback(
    (stored: StoredProject) => {
      const doc = migrate(stored.document);
      return installDocument(doc, stored.fileHandle ?? null, stored.remote ?? null);
    },
    [installDocument],
  );

  /**
   * Keep the local version. Re-writes using the sha we just read, which is what makes the
   * overwrite succeed where the original save was refused.
   */
  const resolveConflictOverwrite = useCallback(async () => {
    if (!pendingConflict) return;
    const doc = useDocumentStore.getState().document;
    setIsSaving(true);
    setSaveError(null);
    try {
      setRemoteLink(await writeRemote(doc, pendingConflict.link));
      await persist(doc);
      setPendingConflict(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not overwrite the version on GitHub.');
    } finally {
      setIsSaving(false);
    }
  }, [pendingConflict, persist, setRemoteLink, writeRemote]);

  /** Abandon local edits in favour of the repo's version. Already fetched, so no await. */
  const resolveConflictTakeRemote = useCallback(() => {
    if (!pendingConflict) return null;
    const doc = installDocument(pendingConflict.remote, fileHandleRef.current, pendingConflict.link);
    setPendingConflict(null);
    return doc;
  }, [installDocument, pendingConflict]);

  const dismissConflict = useCallback(() => setPendingConflict(null), []);

  const addEmbeddedAsCustomTemplate = useCallback(async () => {
    if (pendingMismatch?.kind !== 'missing') return;
    await onAddCustomTemplate(pendingMismatch.embedded);
    setPendingMismatch(null);
  }, [pendingMismatch, onAddCustomTemplate]);

  const updateToLibraryTemplate = useCallback(() => {
    if (pendingMismatch?.kind !== 'geometry-diff') return;
    useDocumentStore.getState().setTemplate(pendingMismatch.library);
    setPendingMismatch(null);
  }, [pendingMismatch]);

  const dismissMismatch = useCallback(() => setPendingMismatch(null), []);

  return {
    projectId,
    isDirty,
    hasFileHandle,
    remote,
    canSaveToRemote: cloud.client !== null && cloud.repo !== null,
    isSaving,
    saveError,
    save,
    saveAsFile,
    saveToRemote,
    openFromFile,
    openFromRemote,
    openFromLibrary,
    newProject,
    pendingMismatch,
    addEmbeddedAsCustomTemplate,
    updateToLibraryTemplate,
    dismissMismatch,
    pendingConflict,
    resolveConflictOverwrite,
    resolveConflictTakeRemote,
    dismissConflict,
  };
}
