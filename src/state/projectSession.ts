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

export interface ProjectSessionApi {
  projectId: string | null;
  isDirty: boolean;
  hasFileHandle: boolean;
  saveToFile: () => Promise<void>;
  saveAsFile: () => Promise<void>;
  /** Resolves to null if the user cancelled the picker. */
  openFromFile: () => Promise<LabelDocument | null>;
  openFromLibrary: (stored: StoredProject) => LabelDocument;
  newProject: (template: SheetTemplate, name?: string) => void;
  pendingMismatch: TemplateMismatch | null;
  addEmbeddedAsCustomTemplate: () => Promise<void>;
  updateToLibraryTemplate: () => void;
  dismissMismatch: () => void;
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
): ProjectSessionApi {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [pendingMismatch, setPendingMismatch] = useState<TemplateMismatch | null>(null);

  const isDirty = useUiStore((s) => s.isDirty);
  const hasFileHandle = useUiStore((s) => s.hasFileHandle);
  const setDirty = useUiStore((s) => s.setDirty);
  const setHasFileHandle = useUiStore((s) => s.setHasFileHandle);

  const currentDocument = useDocumentStore((s) => s.document);

  const lastSavedDocumentRef = useRef<LabelDocument | null>(null);
  const fileHandleRef = useRef<FileSystemFileHandle | null>(null);
  const projectIdRef = useRef<string | null>(null);

  /** Reference-inequality against the last explicit save — cheap because documentStore replaces `document` immutably on every mutation. */
  useEffect(() => {
    setDirty(currentDocument !== lastSavedDocumentRef.current);
  }, [currentDocument, setDirty]);

  useEffect(() => {
    const id = projectIdRef.current;
    if (!id) return;
    const timer = setTimeout(() => {
      adapter.saveProject({
        id,
        name: currentDocument.name,
        updatedAt: Date.now(),
        document: currentDocument,
        fileHandle: fileHandleRef.current ?? undefined,
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
    (doc: LabelDocument, handle: FileSystemFileHandle | null): LabelDocument => {
      reconcileTemplate(doc);
      useDocumentStore.getState().loadDocument(doc);
      resetDocumentHistory();
      fileHandleRef.current = handle;
      setHasFileHandle(handle !== null);
      projectIdRef.current = doc.id;
      setProjectId(doc.id);
      lastSavedDocumentRef.current = doc;
      setDirty(false);
      return doc;
    },
    [reconcileTemplate, setDirty, setHasFileHandle],
  );

  const newProject = useCallback(
    (template: SheetTemplate, name?: string) => {
      useDocumentStore.getState().loadTemplate(template, name);
      resetDocumentHistory();
      const doc = useDocumentStore.getState().document;
      fileHandleRef.current = null;
      setHasFileHandle(false);
      const id = newProjectId();
      projectIdRef.current = id;
      setProjectId(id);
      lastSavedDocumentRef.current = doc;
      setDirty(false);
      setPendingMismatch(null);
    },
    [setDirty, setHasFileHandle],
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

  const saveToFile = useCallback(async () => {
    const doc = useDocumentStore.getState().document;
    if (!fileHandleRef.current) {
      await saveAsFile();
      return;
    }
    const granted = await verifyPermission(fileHandleRef.current, 'readwrite');
    if (!granted) {
      await saveAsFile();
      return;
    }
    await writeToHandle(fileHandleRef.current, serializeProject(doc));
    await persist(doc);
  }, [persist, saveAsFile]);

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

  const openFromLibrary = useCallback(
    (stored: StoredProject) => {
      const doc = migrate(stored.document);
      return installDocument(doc, stored.fileHandle ?? null);
    },
    [installDocument],
  );

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
    saveToFile,
    saveAsFile,
    openFromFile,
    openFromLibrary,
    newProject,
    pendingMismatch,
    addEmbeddedAsCustomTemplate,
    updateToLibraryTemplate,
    dismissMismatch,
  };
}
