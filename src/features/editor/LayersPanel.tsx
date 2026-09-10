import { useState } from 'react';
import type { Element } from '../../model/types';
import { BarcodeToolIcon, EllipseToolIcon, LineToolIcon, RectToolIcon, TextToolIcon } from '../../components/icons';
import { MIN_QUIET_ZONE_MODULES } from '../../barcode/layout';
import { newElementId } from '../../lib/id';
import { DEFAULT_FONT_ID } from '../../text/fontCatalog';
import { useDocumentStore } from '../../state/documentStore';
import { useUiStore } from '../../state/uiStore';

const SIZE_BY_TYPE: Record<Element['type'], { width: number; height: number }> = {
  rect: { width: 20, height: 15 },
  ellipse: { width: 20, height: 15 },
  line: { width: 30, height: 0 },
  text: { width: 40, height: 12 },
  barcode: { width: 35, height: 18 },
};
const NAME_BY_TYPE: Record<Element['type'], string> = {
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
  text: 'Text',
  barcode: 'Barcode',
};

function newShape(type: Element['type']): Element {
  const base = {
    id: newElementId(),
    name: NAME_BY_TYPE[type],
    x: 10,
    y: 10,
    ...SIZE_BY_TYPE[type],
    rotation: 0,
    locked: false,
    visible: true,
    opacity: 1,
  };
  if (type === 'rect') return { ...base, type: 'rect', fill: '#94a3b8', stroke: '#334155', strokeWidth: 0.3 };
  if (type === 'ellipse') return { ...base, type: 'ellipse', fill: '#94a3b8', stroke: '#334155', strokeWidth: 0.3 };
  if (type === 'text') {
    return {
      ...base,
      type: 'text',
      content: 'Text',
      fontId: DEFAULT_FONT_ID,
      fontSizePt: 10,
      lineHeight: 1.2,
      letterSpacing: 0,
      align: 'left',
      verticalAlign: 'top',
      color: '#1a1a1a',
      autoShrink: false,
    };
  }
  if (type === 'barcode') {
    return {
      ...base,
      type: 'barcode',
      symbology: 'code128',
      value: '0123456789',
      showText: true,
      quietZoneModules: MIN_QUIET_ZONE_MODULES.code128,
      color: '#000000',
    };
  }
  return { ...base, type: 'line', stroke: '#334155', strokeWidth: 0.5 };
}

export function LayersPanel() {
  const elements = useDocumentStore((s) => s.document.elements);
  const addElement = useDocumentStore((s) => s.addElement);
  const updateElement = useDocumentStore((s) => s.updateElement);
  const removeElements = useDocumentStore((s) => s.removeElements);
  const setElementOrder = useDocumentStore((s) => s.setElementOrder);

  const selectedIds = useUiStore((s) => s.selectedIds);
  const select = useUiStore((s) => s.select);
  const toggleSelect = useUiStore((s) => s.toggleSelect);

  const [renamingId, setRenamingId] = useState<string | null>(null);

  function addAndSelect(type: Element['type']) {
    const el = newShape(type);
    addElement(el);
    select([el.id]);
  }

  // Layer list shows top-of-stack first; the underlying array is bottom-to-top.
  const topDown = [...elements].reverse();

  function move(id: string, direction: 'up' | 'down' | 'front' | 'back') {
    const order = elements.map((e) => e.id);
    const from = order.indexOf(id);
    order.splice(from, 1);
    if (direction === 'up') order.splice(Math.min(from + 1, order.length), 0, id);
    else if (direction === 'down') order.splice(Math.max(from - 1, 0), 0, id);
    else if (direction === 'front') order.push(id);
    else order.unshift(id);
    setElementOrder(order);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-line flex gap-0.5">
        <ToolButton title="Rectangle" onClick={() => addAndSelect('rect')}>
          <RectToolIcon />
        </ToolButton>
        <ToolButton title="Ellipse" onClick={() => addAndSelect('ellipse')}>
          <EllipseToolIcon />
        </ToolButton>
        <ToolButton title="Line" onClick={() => addAndSelect('line')}>
          <LineToolIcon />
        </ToolButton>
        <ToolButton title="Text" onClick={() => addAndSelect('text')}>
          <TextToolIcon />
        </ToolButton>
        <ToolButton title="Barcode" onClick={() => addAndSelect('barcode')}>
          <BarcodeToolIcon />
        </ToolButton>
      </div>
      <div className="flex-1 overflow-y-auto">
        {topDown.length === 0 && <p className="p-3 text-xs text-ink-tertiary">No elements yet — add a shape above.</p>}
        {topDown.map((el) => {
          const selected = selectedIds.includes(el.id);
          return (
            <div
              key={el.id}
              className={`flex items-center gap-1.5 px-2 py-1.5 text-xs border-b border-line/50 cursor-pointer ${
                selected ? 'bg-accent/15 text-ink' : 'text-ink-secondary hover:bg-panel-raised'
              }`}
              onClick={(e) => (e.shiftKey || e.ctrlKey || e.metaKey ? toggleSelect(el.id) : select([el.id]))}
            >
              <button
                title={el.visible ? 'Hide' : 'Show'}
                className="shrink-0 w-4 text-center"
                onClick={(e) => {
                  e.stopPropagation();
                  updateElement(el.id, { visible: !el.visible });
                }}
              >
                {el.visible ? '◉' : '○'}
              </button>
              <button
                title={el.locked ? 'Unlock' : 'Lock'}
                className="shrink-0 w-4 text-center"
                onClick={(e) => {
                  e.stopPropagation();
                  updateElement(el.id, { locked: !el.locked });
                }}
              >
                {el.locked ? '\u{1F512}' : '\u{1F513}'}
              </button>
              {renamingId === el.id ? (
                <input
                  autoFocus
                  className="flex-1 bg-panel-raised border border-line rounded px-1 py-0.5 text-xs text-ink"
                  defaultValue={el.name}
                  onBlur={(e) => {
                    updateElement(el.id, { name: e.target.value || el.name });
                    setRenamingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                />
              ) : (
                <span className="flex-1 truncate" onDoubleClick={() => setRenamingId(el.id)}>
                  {el.name}
                </span>
              )}
              <span className="text-ink-tertiary uppercase text-[10px]">{el.type}</span>
              <button
                title="Forward"
                className="shrink-0 w-4"
                onClick={(e) => {
                  e.stopPropagation();
                  move(el.id, 'up');
                }}
              >
                {'↑'}
              </button>
              <button
                title="Backward"
                className="shrink-0 w-4"
                onClick={(e) => {
                  e.stopPropagation();
                  move(el.id, 'down');
                }}
              >
                {'↓'}
              </button>
              <button
                title="Delete"
                className="shrink-0 w-4 text-ink-tertiary hover:text-red-500"
                onClick={(e) => {
                  e.stopPropagation();
                  removeElements([el.id]);
                }}
              >
                {'×'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ToolButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      className="flex-1 flex items-center justify-center bg-panel-raised hover:bg-line border border-line rounded py-1.5 text-ink"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
