import type { Asset, BarcodeSymbology, Element, ImageFit, QrErrorCorrection } from '../../model/types';
import { alignElements, distributeElements, type AlignMode, type DistributeMode } from '../../model/align';
import { MIN_QUIET_ZONE_MODULES, MIN_SCANNABLE_MODULE_MM, layoutBarcode } from '../../barcode/layout';
import { MIN_EFFECTIVE_DPI, layoutImage } from '../../image/layout';
import { NumberField } from '../../components/NumberField';
import { useDocumentStore } from '../../state/documentStore';
import { useUiStore } from '../../state/uiStore';

export function PropertiesPanel() {
  const elements = useDocumentStore((s) => s.document.elements);
  const assets = useDocumentStore((s) => s.document.assets);
  const updateElement = useDocumentStore((s) => s.updateElement);
  const updateElements = useDocumentStore((s) => s.updateElements);
  const selectedIds = useUiStore((s) => s.selectedIds);

  const selected = selectedIds.map((id) => elements.find((e) => e.id === id)).filter((e): e is Element => !!e);

  if (selected.length === 0) {
    return <p className="p-3 text-xs text-ink-tertiary">Select an element to edit its properties.</p>;
  }

  function align(mode: AlignMode) {
    updateElements(alignElements(selected, mode));
  }

  function distribute(mode: DistributeMode) {
    updateElements(distributeElements(selected, mode));
  }

  return (
    <div className="p-3 space-y-4 text-sm">
      {selected.length > 1 && (
        <section>
          <SectionLabel>Align &amp; distribute ({selected.length} selected)</SectionLabel>
          <div className="grid grid-cols-3 gap-1 mb-1">
            <IconButton label="⟸" title="Align left" onClick={() => align('left')} />
            <IconButton label="⟺" title="Align centre" onClick={() => align('center-h')} />
            <IconButton label="⟹" title="Align right" onClick={() => align('right')} />
            <IconButton label="⟰" title="Align top" onClick={() => align('top')} />
            <IconButton label="⟷" title="Align middle" onClick={() => align('middle-v')} />
            <IconButton label="⟱" title="Align bottom" onClick={() => align('bottom')} />
          </div>
          {selected.length > 2 && (
            <div className="grid grid-cols-2 gap-1">
              <IconButton label="Distribute ↔" title="Distribute horizontally" onClick={() => distribute('horizontal')} />
              <IconButton label="Distribute ↕" title="Distribute vertically" onClick={() => distribute('vertical')} />
            </div>
          )}
        </section>
      )}

      {selected.length === 1 && (
        <SingleElementProperties element={selected[0]} assets={assets} onChange={(patch) => updateElement(selected[0].id, patch)} />
      )}

      {selected.length > 1 && (
        <section>
          <SectionLabel>Opacity (all selected)</SectionLabel>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            defaultValue={selected[0].opacity}
            onChange={(e) => updateElements(selected.map((el) => ({ id: el.id, patch: { opacity: Number(e.target.value) } })))}
            className="w-full"
          />
        </section>
      )}
    </div>
  );
}

function SingleElementProperties({
  element,
  assets,
  onChange,
}: {
  element: Element;
  assets: Record<string, Asset>;
  onChange: (patch: Partial<Element>) => void;
}) {
  return (
    <>
      <section>
        <SectionLabel>Position &amp; size (mm)</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="X" value={element.x} onChange={(v) => onChange({ x: v })} />
          <NumberField label="Y" value={element.y} onChange={(v) => onChange({ y: v })} />
          <NumberField label="Width" value={element.width} onChange={(v) => onChange({ width: Math.max(1, v) })} />
          {element.type !== 'line' && (
            <NumberField label="Height" value={element.height} onChange={(v) => onChange({ height: Math.max(1, v) })} />
          )}
          <NumberField label="Rotation °" value={element.rotation} onChange={(v) => onChange({ rotation: v })} />
        </div>
      </section>

      {element.type === 'text' && <TextProperties element={element} onChange={onChange} />}
      {element.type === 'barcode' && <BarcodeProperties element={element} onChange={onChange} />}
      {element.type === 'image' && <ImageProperties element={element} asset={assets[element.assetId]} onChange={onChange} />}
      {(element.type === 'rect' || element.type === 'ellipse' || element.type === 'line') && (
        <section>
          <SectionLabel>Appearance</SectionLabel>
          <div className="space-y-2">
            {element.type !== 'line' && (
              <ColorField label="Fill" value={element.fill} onChange={(v) => onChange({ fill: v })} />
            )}
            <ColorField label="Stroke" value={element.stroke} onChange={(v) => onChange({ stroke: v })} allowEmpty={element.type !== 'line'} />
            <NumberField
              label="Stroke width (mm)"
              value={element.strokeWidth}
              onChange={(v) => onChange({ strokeWidth: Math.max(0, v) })}
            />
            {element.type === 'rect' && (
              <NumberField
                label="Corner radius (mm)"
                value={element.cornerRadius ?? 0}
                onChange={(v) => onChange({ cornerRadius: Math.max(0, v) })}
              />
            )}
            <label className="block">
              <span className="block text-ink-tertiary text-[11px] mb-1">Opacity</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={element.opacity}
                onChange={(e) => onChange({ opacity: Number(e.target.value) })}
                className="w-full"
              />
            </label>
          </div>
        </section>
      )}
    </>
  );
}

/**
 * Font family/size/weight/colour and alignment live in the TextFormatToolbar
 * at the top of the editor (BarTender-style), not here — this panel only
 * holds the settings that don't fit a toolbar icon.
 */
function TextProperties({
  element,
  onChange,
}: {
  element: Extract<Element, { type: 'text' }>;
  onChange: (patch: Partial<Element>) => void;
}) {
  return (
    <>
      <section>
        <SectionLabel>Content</SectionLabel>
        <textarea
          className="w-full h-20 bg-panel-raised border border-line rounded px-2 py-1.5 text-sm text-ink resize-y focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
          value={element.content}
          onChange={(e) => onChange({ content: e.target.value })}
        />
      </section>

      <section>
        <SectionLabel>Spacing</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Line height ×" value={element.lineHeight} onChange={(v) => onChange({ lineHeight: Math.max(0.1, v) })} />
          <NumberField label="Letter spacing (em)" value={element.letterSpacing} onChange={(v) => onChange({ letterSpacing: v })} />
        </div>
      </section>

      <section>
        <SectionLabel>Auto-shrink</SectionLabel>
        <label className="flex items-center gap-1.5 text-ink-secondary text-sm mb-2">
          <input type="checkbox" checked={element.autoShrink} onChange={(e) => onChange({ autoShrink: e.target.checked })} />
          Shrink to fit the box rather than overflow
        </label>
        {element.autoShrink && (
          <NumberField
            label="Minimum size (pt)"
            value={element.minFontSizePt ?? element.fontSizePt}
            onChange={(v) => onChange({ minFontSizePt: Math.max(1, v) })}
          />
        )}
      </section>

      <section>
        <SectionLabel>Opacity</SectionLabel>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={element.opacity}
          onChange={(e) => onChange({ opacity: Number(e.target.value) })}
          className="w-full"
        />
      </section>
    </>
  );
}

const SYMBOLOGIES: { value: BarcodeSymbology; label: string }[] = [
  { value: 'code128', label: 'Code 128' },
  { value: 'qr', label: 'QR' },
];
const EC_LEVELS: QrErrorCorrection[] = ['L', 'M', 'Q', 'H'];

function BarcodeProperties({
  element,
  onChange,
}: {
  element: Extract<Element, { type: 'barcode' }>;
  onChange: (patch: Partial<Element>) => void;
}) {
  const minQuietZone = MIN_QUIET_ZONE_MODULES[element.symbology];
  let geometry: ReturnType<typeof layoutBarcode> | null = null;
  try {
    geometry = layoutBarcode({
      symbology: element.symbology,
      value: element.value,
      widthMm: element.width,
      heightMm: element.height,
      quietZoneModules: element.quietZoneModules,
      errorCorrection: element.errorCorrection,
    });
  } catch {
    geometry = null;
  }

  return (
    <>
      <section>
        <SectionLabel>Symbology</SectionLabel>
        <div className="grid grid-cols-2 gap-1 mb-2">
          {SYMBOLOGIES.map((s) => (
            <IconButton key={s.value} label={s.label} title={s.label} active={element.symbology === s.value} onClick={() => onChange({ symbology: s.value })} />
          ))}
        </div>
        {element.symbology === 'qr' && (
          <label className="block">
            <span className="block text-ink-tertiary text-[11px] mb-1">Error correction</span>
            <select
              className="w-full bg-panel-raised border border-line rounded px-2 py-1.5 text-sm text-ink"
              value={element.errorCorrection ?? 'M'}
              onChange={(e) => onChange({ errorCorrection: e.target.value as QrErrorCorrection })}
            >
              {EC_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      <section>
        <SectionLabel>Value</SectionLabel>
        <textarea
          className="w-full h-16 bg-panel-raised border border-line rounded px-2 py-1.5 text-sm text-ink resize-y focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
          value={element.value}
          onChange={(e) => onChange({ value: e.target.value })}
        />
      </section>

      <section>
        <SectionLabel>Appearance</SectionLabel>
        <div className="space-y-2">
          <ColorField label="Colour" value={element.color} onChange={(v) => onChange({ color: v ?? element.color })} />
          <NumberField
            label={`Quiet zone (modules, min ${minQuietZone})`}
            value={element.quietZoneModules}
            onChange={(v) => onChange({ quietZoneModules: Math.max(minQuietZone, v) })}
          />
          {geometry?.quietZoneClamped && (
            <p className="text-warn text-[11px]">Clamped up to the {minQuietZone}-module minimum — a narrower quiet zone risks scan failures.</p>
          )}
          {geometry?.moduleTooNarrow && (
            <p className="text-warn text-[11px]">
              Module width is {geometry.moduleWidthMm.toFixed(3)}mm — below the ~{MIN_SCANNABLE_MODULE_MM}mm most laser/inkjet printers can
              resolve reliably. Enlarge the barcode.
            </p>
          )}
          {!geometry && <p className="text-danger text-[11px]">Couldn&rsquo;t encode this value for {element.symbology}.</p>}
        </div>
      </section>

      {element.symbology === 'code128' && (
        <section>
          <SectionLabel>Human-readable text</SectionLabel>
          <label className="flex items-center gap-1.5 text-ink-secondary text-sm mb-2">
            <input type="checkbox" checked={element.showText} onChange={(e) => onChange({ showText: e.target.checked })} />
            Show text below the bars
          </label>
          {element.showText && (
            <NumberField
              label="Size (pt)"
              value={element.hriFontSizePt ?? 8}
              onChange={(v) => onChange({ hriFontSizePt: Math.max(1, v) })}
            />
          )}
        </section>
      )}

      <section>
        <SectionLabel>Opacity</SectionLabel>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={element.opacity}
          onChange={(e) => onChange({ opacity: Number(e.target.value) })}
          className="w-full"
        />
      </section>
    </>
  );
}

const FIT_MODES: { value: ImageFit; label: string }[] = [
  { value: 'contain', label: 'Contain' },
  { value: 'cover', label: 'Cover' },
  { value: 'fill', label: 'Fill' },
];

/** Crop is expressed on screen as 0-100% of the source image, converted to/from the model's 0..1 fractions. */
function ImageProperties({
  element,
  asset,
  onChange,
}: {
  element: Extract<Element, { type: 'image' }>;
  asset: Asset | undefined;
  onChange: (patch: Partial<Element>) => void;
}) {
  if (!asset) {
    return (
      <section>
        <SectionLabel>Image</SectionLabel>
        <p className="text-danger text-[11px]">This image&rsquo;s asset is missing from the document.</p>
      </section>
    );
  }

  function setCrop(patch: Partial<typeof element.crop>) {
    const crop = { ...element.crop, ...patch };
    crop.x = Math.min(Math.max(0, crop.x), 1 - 0.01);
    crop.y = Math.min(Math.max(0, crop.y), 1 - 0.01);
    crop.w = Math.min(Math.max(0.01, crop.w), 1 - crop.x);
    crop.h = Math.min(Math.max(0.01, crop.h), 1 - crop.y);
    onChange({ crop });
  }

  const placement = layoutImage({
    naturalWidthPx: asset.naturalWidthPx,
    naturalHeightPx: asset.naturalHeightPx,
    crop: element.crop,
    fit: element.fit,
    boxWidthMm: element.width,
    boxHeightMm: element.height,
  });

  return (
    <>
      <section>
        <SectionLabel>Fit</SectionLabel>
        <div className="grid grid-cols-3 gap-1">
          {FIT_MODES.map((f) => (
            <IconButton key={f.value} label={f.label} title={f.label} active={element.fit === f.value} onClick={() => onChange({ fit: f.value })} />
          ))}
        </div>
      </section>

      <section>
        <SectionLabel>Crop (% of source)</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Left" value={Math.round(element.crop.x * 100)} onChange={(v) => setCrop({ x: v / 100 })} />
          <NumberField label="Top" value={Math.round(element.crop.y * 100)} onChange={(v) => setCrop({ y: v / 100 })} />
          <NumberField label="Width" value={Math.round(element.crop.w * 100)} onChange={(v) => setCrop({ w: v / 100 })} />
          <NumberField label="Height" value={Math.round(element.crop.h * 100)} onChange={(v) => setCrop({ h: v / 100 })} />
        </div>
      </section>

      <section>
        <SectionLabel>Resolution</SectionLabel>
        <p className={`text-[11px] ${placement.dpiTooLow ? 'text-warn' : 'text-ink-tertiary'}`}>
          {Math.round(placement.effectiveDpi)} dpi at this size
          {placement.dpiTooLow && ` — below ~${MIN_EFFECTIVE_DPI}dpi, will look soft when printed. Shrink the image or crop less.`}
        </p>
      </section>

      <section>
        <SectionLabel>Opacity</SectionLabel>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={element.opacity}
          onChange={(e) => onChange({ opacity: Number(e.target.value) })}
          className="w-full"
        />
      </section>
    </>
  );
}

function ColorField({
  label,
  value,
  onChange,
  allowEmpty,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  allowEmpty?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-ink-tertiary text-[11px]">{label}</span>
      <span className="flex items-center gap-1">
        <input type="color" value={value ?? '#000000'} onChange={(e) => onChange(e.target.value)} className="h-6 w-8 bg-transparent" />
        {allowEmpty && (
          <button className="text-[10px] text-ink-tertiary hover:text-ink" onClick={() => onChange(undefined)}>
            none
          </button>
        )}
      </span>
    </label>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-medium text-ink-secondary mb-2 pl-2 border-l-2 border-line-strong">{children}</h3>;
}

function IconButton({
  label,
  title,
  onClick,
  active,
  children,
}: {
  label?: string;
  title: string;
  onClick: () => void;
  active?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <button
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={`flex items-center justify-center gap-1 border rounded py-1 text-xs ${
        active ? 'bg-accent/20 border-accent text-ink' : 'bg-panel-raised border-line text-ink hover:bg-line'
      }`}
    >
      {children ?? label}
    </button>
  );
}
