import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Element, LabelDocument } from '../../model/types';
import type { Point, Rect } from '../../model/geometry';
import { boxCenter, rotatePoint, rotatedAabb } from '../../model/geometry';
import { collectSnapTargets, snapBoxPosition, type SnapGuide } from '../../model/snap';
import { handlesForElementType, resizeBox, rotationFromPointer, type HandleId } from '../../model/transform';
import { newElementId } from '../../lib/id';
import { ptToMm } from '../../text/layout';
import { labelClipToSvgPath } from '../../render/pdf/labelClip';
import { DocumentRenderer } from '../../render/svg/DocumentRenderer';
import { useDocumentStore } from '../../state/documentStore';
import { useUiStore } from '../../state/uiStore';
import { bleedSvgPath, safeAreaSvgPath, DEFAULT_BLEED_MM, DEFAULT_UNPRINTABLE_MARGIN_MM } from './overlayGeometry';

export const BASE_PX_PER_MM = 4;
const HANDLE_RADIUS_MM = 1.4;
const ROTATE_HANDLE_OFFSET_MM = 8;
const NUDGE_MM = 0.5;
const NUDGE_SHIFT_MM = 5;
const NUDGE_ALT_MM = 0.1;

const HANDLE_POSITIONS: Record<HandleId, (r: Rect) => Point> = {
  nw: (r) => ({ x: r.x, y: r.y }),
  n: (r) => ({ x: r.x + r.width / 2, y: r.y }),
  ne: (r) => ({ x: r.x + r.width, y: r.y }),
  e: (r) => ({ x: r.x + r.width, y: r.y + r.height / 2 }),
  se: (r) => ({ x: r.x + r.width, y: r.y + r.height }),
  s: (r) => ({ x: r.x + r.width / 2, y: r.y + r.height }),
  sw: (r) => ({ x: r.x, y: r.y + r.height }),
  w: (r) => ({ x: r.x, y: r.y + r.height / 2 }),
};

const CURSOR_FOR_HANDLE: Record<HandleId, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
};

function elementRect(el: Element): Rect {
  return { x: el.x, y: el.y, width: el.width, height: el.height };
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

type DragInfo =
  | { kind: 'move'; ids: string[]; startPointer: Point; startBoxes: Map<string, Rect> }
  | { kind: 'resize'; id: string; handle: HandleId; startBox: Rect; startRotation: number }
  | { kind: 'rotate'; id: string; startBox: Rect }
  | { kind: 'marquee'; startPointer: Point };

/**
 * Live drag/resize/rotate updates are applied to `liveOverrides` (component
 * state), never to the document store — the store only sees one committed
 * patch per drag, on pointerup, so a drag is always a single undo entry
 * without needing to pause/resume zundo tracking.
 */
export function LabelCanvas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragInfo | null>(null);

  const document = useDocumentStore((s) => s.document);
  const updateElements = useDocumentStore((s) => s.updateElements);

  const [liveOverrides, setLiveOverrides] = useState<Record<string, Partial<Element>>>({});
  const [marqueeRect, setMarqueeRect] = useState<Rect | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const selectedIds = useUiStore((s) => s.selectedIds);
  const zoom = useUiStore((s) => s.zoom);
  const showSafeArea = useUiStore((s) => s.showSafeArea);
  const showBleed = useUiStore((s) => s.showBleed);
  const select = useUiStore((s) => s.select);
  const toggleSelect = useUiStore((s) => s.toggleSelect);
  const clearSelection = useUiStore((s) => s.clearSelection);

  const [activeGuides, setActiveGuides] = useState<SnapGuide[]>([]);

  const { elements, template } = document;
  const displayDocument: LabelDocument = useMemo(() => {
    if (Object.keys(liveOverrides).length === 0) return document;
    return {
      ...document,
      elements: elements.map((el) => (liveOverrides[el.id] ? ({ ...el, ...liveOverrides[el.id] } as Element) : el)),
    };
  }, [document, elements, liveOverrides]);
  const displayElements = displayDocument.elements;

  const labelRect: Rect = useMemo(
    () => ({ x: 0, y: 0, width: document.size.width, height: document.size.height }),
    [document.size],
  );

  const clientToMm = useCallback((clientX: number, clientY: number): Point => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM()!.inverse();
    const local = pt.matrixTransform(ctm);
    return { x: local.x, y: local.y };
  }, []);

  const handlePointerDownElement = useCallback(
    (e: React.PointerEvent, element: Element) => {
      e.stopPropagation();
      (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);

      let ids = selectedIds;
      if (e.shiftKey) {
        ids = selectedIds.includes(element.id) ? selectedIds.filter((i) => i !== element.id) : [...selectedIds, element.id];
        toggleSelect(element.id);
      } else if (!selectedIds.includes(element.id)) {
        ids = [element.id];
        select(ids);
      }

      const startBoxes = new Map(ids.map((id) => [id, elementRect(elements.find((e2) => e2.id === id)!)]));
      dragRef.current = { kind: 'move', ids, startPointer: clientToMm(e.clientX, e.clientY), startBoxes };
    },
    [selectedIds, toggleSelect, select, elements, clientToMm],
  );

  const handlePointerDownHandle = useCallback(
    (e: React.PointerEvent, element: Element, handle: HandleId) => {
      e.stopPropagation();
      (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
      dragRef.current = { kind: 'resize', id: element.id, handle, startBox: elementRect(element), startRotation: element.rotation };
    },
    [],
  );

  const handlePointerDownRotate = useCallback((e: React.PointerEvent, element: Element) => {
    e.stopPropagation();
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
    dragRef.current = { kind: 'rotate', id: element.id, startBox: elementRect(element) };
  }, []);

  const handleBackgroundPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!e.shiftKey) clearSelection();
      const startPointer = clientToMm(e.clientX, e.clientY);
      dragRef.current = { kind: 'marquee', startPointer };
      setMarqueeRect({ x: startPointer.x, y: startPointer.y, width: 0, height: 0 });
    },
    [clearSelection, clientToMm],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const current = clientToMm(e.clientX, e.clientY);

      if (drag.kind === 'marquee') {
        setMarqueeRect({
          x: Math.min(drag.startPointer.x, current.x),
          y: Math.min(drag.startPointer.y, current.y),
          width: Math.abs(current.x - drag.startPointer.x),
          height: Math.abs(current.y - drag.startPointer.y),
        });
        return;
      }

      if (drag.kind === 'move') {
        const dx = current.x - drag.startPointer.x;
        const dy = current.y - drag.startPointer.y;

        let snapDx = dx;
        let snapDy = dy;
        let guides: SnapGuide[] = [];
        if (!e.ctrlKey && !e.metaKey) {
          const primaryId = drag.ids[0];
          const startBox = drag.startBoxes.get(primaryId)!;
          const proposed: Rect = { ...startBox, x: startBox.x + dx, y: startBox.y + dy };
          const targets = collectSnapTargets(document.size, elements, new Set(drag.ids));
          const snapped = snapBoxPosition(proposed, targets);
          snapDx = snapped.x - startBox.x;
          snapDy = snapped.y - startBox.y;
          guides = snapped.guides;
        }
        setActiveGuides(guides);

        const overrides: Record<string, Partial<Element>> = {};
        for (const id of drag.ids) {
          const startBox = drag.startBoxes.get(id)!;
          overrides[id] = { x: startBox.x + snapDx, y: startBox.y + snapDy };
        }
        setLiveOverrides(overrides);
        return;
      }

      if (drag.kind === 'resize') {
        const next = resizeBox({
          box: drag.startBox,
          rotation: drag.startRotation,
          handle: drag.handle,
          pointerCurrent: current,
          aspectLocked: e.shiftKey,
          aboutCenter: e.altKey,
        });
        setLiveOverrides({ [drag.id]: next });
        return;
      }

      if (drag.kind === 'rotate') {
        const center = boxCenter(drag.startBox);
        const rotation = rotationFromPointer(center, current, e.shiftKey);
        setLiveOverrides({ [drag.id]: { rotation } });
      }
    },
    [clientToMm, document.size, elements],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag) return;

      if (drag.kind === 'marquee') {
        setMarqueeRect((rect) => {
          if (rect && (rect.width > 0.5 || rect.height > 0.5)) {
            const hits = elements.filter((el) => rectsIntersect(rect, rotatedAabb(elementRect(el), el.rotation))).map((el) => el.id);
            if (hits.length > 0) select(e.shiftKey ? [...new Set([...selectedIds, ...hits])] : hits);
            else if (!e.shiftKey) select([]);
          }
          return null;
        });
        return;
      }

      setActiveGuides([]);
      setLiveOverrides((overrides) => {
        const patches = Object.entries(overrides).map(([id, patch]) => ({ id, patch }));
        if (patches.length > 0) updateElements(patches);
        return {};
      });
    },
    [elements, select, selectedIds, updateElements],
  );

  const nudgeSelected = useCallback(
    (dx: number, dy: number) => {
      if (selectedIds.length === 0) return;
      const patches = selectedIds
        .map((id) => elements.find((e) => e.id === id))
        .filter((e): e is Element => !!e)
        .map((el) => ({ id: el.id, patch: { x: el.x + dx, y: el.y + dy } }));
      updateElements(patches);
    },
    [selectedIds, elements, updateElements],
  );

  useEditorKeyboardShortcuts({ nudgeSelected });

  const pxWidth = document.size.width * BASE_PX_PER_MM * zoom;
  const pxHeight = document.size.height * BASE_PX_PER_MM * zoom;
  const mmToPx = BASE_PX_PER_MM * zoom;

  function commitEdit() {
    if (editingId) updateElements([{ id: editingId, patch: { content: editText } }]);
    setEditingId(null);
  }

  const editingElement = editingId ? elements.find((e) => e.id === editingId) : undefined;

  return (
    <div className="relative" style={{ width: pxWidth, height: pxHeight }}>
    <svg
      ref={svgRef}
      viewBox={`0 0 ${document.size.width} ${document.size.height}`}
      width={pxWidth}
      height={pxHeight}
      className="shadow-[0_1px_3px_rgba(0,0,0,0.3)] overflow-visible"
      onPointerDown={handleBackgroundPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* The die-cut boundary itself — shown even with no background fill, so the shape is always visible. */}
      <path d={labelClipToSvgPath(template, labelRect)} fill="#ffffff" stroke="#999" strokeWidth={0.2} vectorEffect="non-scaling-stroke" />

      <DocumentRenderer document={displayDocument} clipId="editor-label-clip" />

      {showSafeArea && (
        <path
          d={safeAreaSvgPath(template, labelRect, DEFAULT_UNPRINTABLE_MARGIN_MM)}
          fill="none"
          stroke="#dc2626"
          strokeDasharray="1.5,1"
          strokeWidth={0.25}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {showBleed && (
        <path
          d={bleedSvgPath(template, labelRect, DEFAULT_BLEED_MM)}
          fill="none"
          stroke="#7c3aed"
          strokeDasharray="0.8,0.8"
          strokeWidth={0.25}
          vectorEffect="non-scaling-stroke"
        />
      )}

      {activeGuides.map((g, i) =>
        g.orientation === 'v' ? (
          <line key={i} x1={g.position} y1={-1000} x2={g.position} y2={1000} stroke="#ec4899" strokeWidth={0.15} vectorEffect="non-scaling-stroke" />
        ) : (
          <line key={i} x1={-1000} y1={g.position} x2={1000} y2={g.position} stroke="#ec4899" strokeWidth={0.15} vectorEffect="non-scaling-stroke" />
        ),
      )}

      {/* Invisible hit targets, one per element, sized/rotated to its box. */}
      {displayElements.map((el) => {
        const rect = elementRect(el);
        const center = boxCenter(rect);
        return (
          <rect
            key={el.id}
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            fill="transparent"
            stroke="none"
            transform={`rotate(${el.rotation} ${center.x} ${center.y})`}
            style={{ cursor: el.locked ? 'default' : 'move', pointerEvents: el.visible ? 'all' : 'none' }}
            onPointerDown={(e) => !el.locked && handlePointerDownElement(e, elements.find((e2) => e2.id === el.id)!)}
            onDoubleClick={() => {
              if (el.locked || el.type !== 'text') return;
              setEditText(el.content);
              setEditingId(el.id);
            }}
          />
        );
      })}

      {selectedIds.map((id) => {
        const el = displayElements.find((e) => e.id === id);
        const original = elements.find((e) => e.id === id);
        if (!el || !original) return null;
        return (
          <SelectionHandles
            key={id}
            element={el}
            onHandlePointerDown={(e, h) => handlePointerDownHandle(e, original, h)}
            onRotatePointerDown={(e) => handlePointerDownRotate(e, original)}
          />
        );
      })}

      {marqueeRect && (
        <rect
          x={marqueeRect.x}
          y={marqueeRect.y}
          width={marqueeRect.width}
          height={marqueeRect.height}
          fill="rgba(59,130,246,0.15)"
          stroke="#3b82f6"
          strokeWidth={0.2}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>

    {editingElement && editingElement.type === 'text' && (
      <textarea
        autoFocus
        value={editText}
        onChange={(e) => setEditText(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            setEditingId(null);
          } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        className="absolute bg-white/95 border border-accent outline-none resize-none text-black px-0.5"
        style={{
          left: editingElement.x * mmToPx,
          top: editingElement.y * mmToPx,
          width: editingElement.width * mmToPx,
          height: editingElement.height * mmToPx,
          fontSize: ptToMm(editingElement.fontSizePt) * mmToPx,
          transform: `rotate(${editingElement.rotation}deg)`,
          transformOrigin: 'center center',
        }}
      />
    )}
    </div>
  );
}

function SelectionHandles({
  element,
  onHandlePointerDown,
  onRotatePointerDown,
}: {
  element: Element;
  onHandlePointerDown: (e: React.PointerEvent, handle: HandleId) => void;
  onRotatePointerDown: (e: React.PointerEvent) => void;
}) {
  const rect = elementRect(element);
  const center = boxCenter(rect);
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ].map((p) => rotatePoint(p, center, element.rotation));
  const outline = `M ${corners.map((p) => `${p.x} ${p.y}`).join(' L ')} Z`;

  const handles = element.locked ? [] : handlesForElementType(element.type);
  const rotateLocal: Point = { x: rect.x + rect.width / 2, y: rect.y - ROTATE_HANDLE_OFFSET_MM };
  const rotateHandlePos = rotatePoint(rotateLocal, center, element.rotation);
  const topMid = rotatePoint({ x: rect.x + rect.width / 2, y: rect.y }, center, element.rotation);

  return (
    <g>
      <path d={outline} fill="none" stroke="#3b82f6" strokeWidth={0.25} vectorEffect="non-scaling-stroke" />
      {!element.locked && (
        <>
          <line
            x1={topMid.x}
            y1={topMid.y}
            x2={rotateHandlePos.x}
            y2={rotateHandlePos.y}
            stroke="#3b82f6"
            strokeWidth={0.15}
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={rotateHandlePos.x}
            cy={rotateHandlePos.y}
            r={HANDLE_RADIUS_MM}
            fill="#fff"
            stroke="#3b82f6"
            strokeWidth={0.3}
            style={{ cursor: 'grab' }}
            onPointerDown={onRotatePointerDown}
          />
          {handles.map((h) => {
            const local = HANDLE_POSITIONS[h](rect);
            const pos = rotatePoint(local, center, element.rotation);
            return (
              <rect
                key={h}
                x={pos.x - HANDLE_RADIUS_MM}
                y={pos.y - HANDLE_RADIUS_MM}
                width={HANDLE_RADIUS_MM * 2}
                height={HANDLE_RADIUS_MM * 2}
                fill="#fff"
                stroke="#3b82f6"
                strokeWidth={0.3}
                style={{ cursor: CURSOR_FOR_HANDLE[h] }}
                onPointerDown={(e) => onHandlePointerDown(e, h)}
              />
            );
          })}
        </>
      )}
    </g>
  );
}

function useEditorKeyboardShortcuts({ nudgeSelected }: { nudgeSelected: (dx: number, dy: number) => void }) {
  const selectedIds = useUiStore((s) => s.selectedIds);
  const select = useUiStore((s) => s.select);
  const elements = useDocumentStore((s) => s.document.elements);
  const removeElements = useDocumentStore((s) => s.removeElements);
  const duplicateElements = useDocumentStore((s) => s.duplicateElements);
  const addElements = useDocumentStore((s) => s.addElements);
  const clipboardRef = useRef<Element[]>([]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        useDocumentStore.temporal.getState().undo();
        return;
      }
      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        useDocumentStore.temporal.getState().redo();
        return;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? NUDGE_SHIFT_MM : e.altKey ? NUDGE_ALT_MM : NUDGE_MM;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        nudgeSelected(dx, dy);
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        e.preventDefault();
        removeElements(selectedIds);
        select([]);
        return;
      }

      if (mod && e.key.toLowerCase() === 'd' && selectedIds.length > 0) {
        e.preventDefault();
        const newIds = duplicateElements(selectedIds);
        select(newIds);
        return;
      }

      if (mod && e.key.toLowerCase() === 'c' && selectedIds.length > 0) {
        clipboardRef.current = elements.filter((el) => selectedIds.includes(el.id));
        return;
      }

      if (mod && e.key.toLowerCase() === 'v' && clipboardRef.current.length > 0) {
        e.preventDefault();
        const clones = clipboardRef.current.map((el) => ({ ...el, id: newElementId(), x: el.x + 5, y: el.y + 5 }));
        addElements(clones);
        select(clones.map((c) => c.id));
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedIds, select, elements, removeElements, duplicateElements, addElements, nudgeSelected]);
}
