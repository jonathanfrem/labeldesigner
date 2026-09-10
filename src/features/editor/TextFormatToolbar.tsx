import type { Element, TextHorizontalAlign, TextVerticalAlign } from '../../model/types';
import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  VAlignBottomIcon,
  VAlignMiddleIcon,
  VAlignTopIcon,
} from '../../components/icons';
import { fontCatalogEntry, fontFamilies, variantsForFamily } from '../../text/fontCatalog';
import { useDocumentStore } from '../../state/documentStore';
import { useUiStore } from '../../state/uiStore';

const HORIZONTAL_ALIGN_ICONS: { value: TextHorizontalAlign; Icon: React.ComponentType; title: string }[] = [
  { value: 'left', Icon: AlignLeftIcon, title: 'Align left' },
  { value: 'center', Icon: AlignCenterIcon, title: 'Align centre' },
  { value: 'right', Icon: AlignRightIcon, title: 'Align right' },
  { value: 'justify', Icon: AlignJustifyIcon, title: 'Justify' },
];

const VERTICAL_ALIGN_ICONS: { value: TextVerticalAlign; Icon: React.ComponentType; title: string }[] = [
  { value: 'top', Icon: VAlignTopIcon, title: 'Align top' },
  { value: 'middle', Icon: VAlignMiddleIcon, title: 'Align middle' },
  { value: 'bottom', Icon: VAlignBottomIcon, title: 'Align bottom' },
];

/**
 * A BarTender-style formatting row: font, size, weight and alignment for the
 * selected text element, always in the same place at the top of the editor
 * rather than buried in the properties panel. Stays present (disabled look)
 * when nothing text-shaped is selected so the layout doesn't jump.
 */
export function TextFormatToolbar() {
  const elements = useDocumentStore((s) => s.document.elements);
  const updateElement = useDocumentStore((s) => s.updateElement);
  const selectedIds = useUiStore((s) => s.selectedIds);

  const selected = selectedIds.length === 1 ? elements.find((e) => e.id === selectedIds[0]) : undefined;
  const element = selected?.type === 'text' ? selected : undefined;

  function onChange(patch: Partial<Element>) {
    if (element) updateElement(element.id, patch);
  }

  const activeEntry = element ? fontCatalogEntry(element.fontId) : undefined;

  function setFamily(family: string) {
    if (!activeEntry) return;
    const sameWeight = variantsForFamily(family).find((v) => v.weight === activeEntry.weight);
    const fallback = variantsForFamily(family)[0];
    onChange({ fontId: (sameWeight ?? fallback).id });
  }

  function toggleBold() {
    if (!activeEntry) return;
    const isBold = activeEntry.weight === 'bold';
    const target = variantsForFamily(activeEntry.family).find((v) => v.weight === (isBold ? 'regular' : 'bold'));
    if (target) onChange({ fontId: target.id });
  }

  const disabled = !element;

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 border-b border-line bg-panel text-xs ${disabled ? 'opacity-40' : ''}`}>
      <select
        disabled={disabled}
        className="bg-panel-raised border border-line rounded px-2 py-1 text-ink disabled:cursor-not-allowed"
        value={activeEntry?.family ?? ''}
        onChange={(e) => setFamily(e.target.value)}
      >
        {activeEntry ? (
          fontFamilies().map((family) => (
            <option key={family} value={family}>
              {family}
            </option>
          ))
        ) : (
          <option value="">Font</option>
        )}
      </select>

      <input
        type="number"
        disabled={disabled}
        min={1}
        className="w-14 bg-panel-raised border border-line rounded px-1.5 py-1 text-ink tabular-nums disabled:cursor-not-allowed"
        value={element?.fontSizePt ?? ''}
        placeholder="Size"
        onChange={(e) => onChange({ fontSizePt: Math.max(1, Number(e.target.value)) })}
      />
      <span className="text-ink-tertiary">pt</span>

      <div className="w-px h-4 bg-line" />

      <ToolbarToggle title="Bold" active={activeEntry?.weight === 'bold'} disabled={disabled} onClick={toggleBold}>
        <BoldIcon />
      </ToolbarToggle>

      <div className="w-px h-4 bg-line" />

      {HORIZONTAL_ALIGN_ICONS.map(({ value, Icon, title }) => (
        <ToolbarToggle key={value} title={title} active={element?.align === value} disabled={disabled} onClick={() => onChange({ align: value })}>
          <Icon />
        </ToolbarToggle>
      ))}

      <div className="w-px h-4 bg-line" />

      {VERTICAL_ALIGN_ICONS.map(({ value, Icon, title }) => (
        <ToolbarToggle
          key={value}
          title={title}
          active={element?.verticalAlign === value}
          disabled={disabled}
          onClick={() => onChange({ verticalAlign: value })}
        >
          <Icon />
        </ToolbarToggle>
      ))}

      <div className="w-px h-4 bg-line" />

      <label className="flex items-center gap-1" title="Text colour">
        <input
          type="color"
          disabled={disabled}
          value={element?.color ?? '#000000'}
          onChange={(e) => onChange({ color: e.target.value })}
          className="h-6 w-7 bg-transparent disabled:cursor-not-allowed"
        />
      </label>

      {!element && <span className="ml-2 text-ink-tertiary">Select a text element to edit formatting.</span>}
    </div>
  );
}

function ToolbarToggle({
  title,
  active,
  disabled,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center justify-center w-7 h-7 rounded border ${
        active ? 'bg-accent/20 border-accent text-ink' : 'bg-panel-raised border-line text-ink hover:bg-line'
      } disabled:cursor-not-allowed disabled:hover:bg-panel-raised`}
    >
      {children}
    </button>
  );
}
