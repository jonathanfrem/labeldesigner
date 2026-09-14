import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { temporal } from 'zundo';
import type { Asset, ContentRotation, Element, LabelDocument, Mm, SheetTemplate } from '../model/types';
import { contentCanvasSize } from '../model/geometry';
import { newElementId } from '../lib/id';

function blankDocument(template: SheetTemplate, contentRotation: ContentRotation = 0, name?: string): LabelDocument {
  return {
    schemaVersion: 1,
    id: `doc-${template.id}`,
    name: name ?? template.name,
    templateId: template.id,
    template,
    size: contentCanvasSize(template, contentRotation),
    contentRotation,
    elements: [],
    assets: {},
  };
}

const UNSET_TEMPLATE: SheetTemplate = {
  id: 'unset',
  name: 'Unset',
  pageSize: { width: 210, height: 297 },
  marginTop: 0,
  marginLeft: 0,
  labelWidth: 100,
  labelHeight: 100,
  columns: 1,
  rows: 1,
  pitchX: 100,
  pitchY: 100,
  shape: 'rect',
  builtIn: false,
  verified: false,
};

interface DocumentState {
  document: LabelDocument;
  loadTemplate: (template: SheetTemplate, name?: string) => void;
  loadDocument: (document: LabelDocument) => void;
  addElement: (element: Element) => void;
  addElements: (elements: Element[]) => void;
  /** Adds the asset and its placing element in one step, so undo removes both together. */
  addImage: (asset: Asset, element: Element) => void;
  updateElement: (id: string, patch: Partial<Element>) => void;
  updateElements: (patches: ReadonlyArray<{ id: string; patch: Partial<Element> }>) => void;
  removeElements: (ids: string[]) => void;
  duplicateElements: (ids: string[]) => string[];
  setElementOrder: (orderedIds: string[]) => void;
  setBackgroundFill: (fill: string | undefined) => void;
  setContentRotation: (rotation: ContentRotation) => void;
  /** Reconciliation only (PLAN §4.1): swaps the embedded template for the library's version without touching elements, size or rotation. */
  setTemplate: (template: SheetTemplate) => void;
  /** Live-editable per-document override of the template's safe-print margin; part of the embedded template, so it round-trips through save/load. */
  setSafeMarginMm: (mm: Mm) => void;
}

/**
 * The document (elements, background) — the one thing undo/redo tracks.
 * Selection, hover, zoom and snap state live in `uiStore` instead, per
 * CLAUDE.md invariant 10: replaying a selection change on undo would make
 * history useless.
 */
export const useDocumentStore = create<DocumentState>()(
  temporal(
    immer((set) => ({
      document: blankDocument(UNSET_TEMPLATE),

      loadTemplate: (template, name) => {
        set((state) => {
          state.document = blankDocument(template, 0, name);
        });
      },

      /** Counterpart to `loadTemplate` for opening a saved project — installs the document as-is, embedded template and all. */
      loadDocument: (document) => {
        set((state) => {
          state.document = document;
        });
      },

      addElement: (element) => {
        set((state) => {
          state.document.elements.push(element);
        });
      },

      addElements: (newElements) => {
        set((state) => {
          state.document.elements.push(...newElements);
        });
      },

      addImage: (asset, element) => {
        set((state) => {
          state.document.assets[asset.id] = asset;
          state.document.elements.push(element);
        });
      },

      updateElement: (id, patch) => {
        set((state) => {
          const el = state.document.elements.find((e) => e.id === id);
          if (el) Object.assign(el, patch);
        });
      },

      updateElements: (patches) => {
        set((state) => {
          for (const { id, patch } of patches) {
            const el = state.document.elements.find((e) => e.id === id);
            if (el) Object.assign(el, patch);
          }
        });
      },

      removeElements: (ids) => {
        const idSet = new Set(ids);
        set((state) => {
          state.document.elements = state.document.elements.filter((e) => !idSet.has(e.id));
        });
      },

      duplicateElements: (ids) => {
        const idSet = new Set(ids);
        const newIds: string[] = [];
        set((state) => {
          const copies: Element[] = [];
          for (const el of state.document.elements) {
            if (!idSet.has(el.id)) continue;
            const newId = newElementId();
            newIds.push(newId);
            copies.push({ ...el, id: newId, name: `${el.name} copy`, x: el.x + 5, y: el.y + 5 });
          }
          state.document.elements.push(...copies);
        });
        return newIds;
      },

      setElementOrder: (orderedIds) => {
        set((state) => {
          const byId = new Map(state.document.elements.map((e) => [e.id, e]));
          state.document.elements = orderedIds.map((id) => byId.get(id)!).filter(Boolean);
        });
      },

      setBackgroundFill: (fill) => {
        set((state) => {
          state.document.background = fill ? { fill } : undefined;
        });
      },

      setTemplate: (template) => {
        set((state) => {
          state.document.template = template;
        });
      },

      setSafeMarginMm: (mm) => {
        set((state) => {
          state.document.template.safeMarginMm = mm;
        });
      },

      /**
       * Only the rotation and the canvas size derived from it change here —
       * existing elements keep their x/y/width/height as authored. Rotating
       * an already-populated canvas can leave elements outside the new
       * bounds; that's an expected consequence of changing orientation
       * after the fact, not something this action tries to fix up.
       */
      setContentRotation: (rotation) => {
        set((state) => {
          state.document.contentRotation = rotation;
          state.document.size = contentCanvasSize(state.document.template, rotation);
        });
      },
    })),
    {
      // Only the document itself is tracked; nothing else lives in this store.
      partialize: (state) => ({ document: state.document }),
      equality: (a, b) => a.document === b.document,
    },
  ),
);

/** Called after `loadTemplate` when switching templates, so undo can't reach back into the previous template's elements. */
export function resetDocumentHistory(): void {
  useDocumentStore.temporal.getState().clear();
}
