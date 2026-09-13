import { create } from 'zustand';
import type { HandleId } from '../model/transform';
import type { SnapGuide } from '../model/snap';

export type DragKind =
  | { type: 'move'; startPointer: { x: number; y: number } }
  | { type: 'resize'; handle: HandleId; startPointer: { x: number; y: number } }
  | { type: 'rotate'; startPointer: { x: number; y: number } }
  | { type: 'marquee'; startPointer: { x: number; y: number }; current: { x: number; y: number } };

interface UiState {
  selectedIds: string[];
  hoverId: string | null;
  zoom: number;
  showSafeArea: boolean;
  showBleed: boolean;
  activeGuides: SnapGuide[];
  drag: DragKind | null;
  /** Differs from the last explicit save-to-file — see projectSession.ts. Never conflated with autosave-to-IndexedDB, a separate safety net. */
  isDirty: boolean;
  /** Whether the current project has a linked File System Access handle (Chromium only). */
  hasFileHandle: boolean;

  select: (ids: string[]) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  setHover: (id: string | null) => void;
  setZoom: (zoom: number) => void;
  toggleSafeArea: () => void;
  toggleBleed: () => void;
  setActiveGuides: (guides: SnapGuide[]) => void;
  setDrag: (drag: DragKind | null) => void;
  setDirty: (dirty: boolean) => void;
  setHasFileHandle: (has: boolean) => void;
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 6;

/**
 * Transient editor state: selection, hover, zoom, drag/marquee tracking,
 * overlay toggles. Deliberately not wrapped in zundo — none of this belongs
 * in undo history (CLAUDE.md invariant 10).
 */
export const useUiStore = create<UiState>((set) => ({
  selectedIds: [],
  hoverId: null,
  zoom: 3,
  showSafeArea: false,
  showBleed: false,
  activeGuides: [],
  drag: null,
  isDirty: false,
  hasFileHandle: false,

  select: (ids) => set({ selectedIds: ids }),
  toggleSelect: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id) ? state.selectedIds.filter((i) => i !== id) : [...state.selectedIds, id],
    })),
  clearSelection: () => set({ selectedIds: [] }),
  setHover: (id) => set({ hoverId: id }),
  setZoom: (zoom) => set({ zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom)) }),
  toggleSafeArea: () => set((state) => ({ showSafeArea: !state.showSafeArea })),
  toggleBleed: () => set((state) => ({ showBleed: !state.showBleed })),
  setActiveGuides: (guides) => set({ activeGuides: guides }),
  setDrag: (drag) => set({ drag }),
  setDirty: (dirty) => set({ isDirty: dirty }),
  setHasFileHandle: (has) => set({ hasFileHandle: has }),
}));
