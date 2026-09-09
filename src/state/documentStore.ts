import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { temporal } from 'zundo';
import type { Element, LabelDocument, SheetTemplate } from '../model/types';
import { newElementId } from '../lib/id';

function blankDocument(template: SheetTemplate): LabelDocument {
  return {
    schemaVersion: 1,
    id: `doc-${template.id}`,
    name: template.name,
    templateId: template.id,
    template,
    size: { width: template.labelWidth, height: template.labelHeight },
    elements: [],
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
  loadTemplate: (template: SheetTemplate) => void;
  addElement: (element: Element) => void;
  addElements: (elements: Element[]) => void;
  updateElement: (id: string, patch: Partial<Element>) => void;
  updateElements: (patches: ReadonlyArray<{ id: string; patch: Partial<Element> }>) => void;
  removeElements: (ids: string[]) => void;
  duplicateElements: (ids: string[]) => string[];
  setElementOrder: (orderedIds: string[]) => void;
  setBackgroundFill: (fill: string | undefined) => void;
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

      loadTemplate: (template) => {
        set((state) => {
          state.document = blankDocument(template);
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
