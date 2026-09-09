import type { SheetTemplate } from '../../model/types';
import { derivedMargins } from '../../model/geometry';
import { evaluateTemplateResidual } from '../../model/validation';

export function DerivedGeometryTable({ template }: { template: SheetTemplate }) {
  const margins = derivedMargins(template);
  const residuals = evaluateTemplateResidual(template);
  const warnings = residuals.filter((r) => r.band !== 'closes');

  return (
    <div className="space-y-2">
      <dl className="text-sm font-mono tabular-nums grid grid-cols-2 gap-y-1">
        <Row label="Label" value={`${template.labelWidth} × ${template.labelHeight} mm`} />
        <Row label="Grid" value={`${template.columns} × ${template.rows}`} />
        <Row label="Pitch" value={`${template.pitchX} × ${template.pitchY} mm`} />
        <Row label="Gap" value={`${margins.gapX.toFixed(2)} × ${margins.gapY.toFixed(2)} mm`} />
        <Row label="Margin top / left" value={`${template.marginTop} / ${template.marginLeft} mm`} />
        <Row label="Margin right / bottom" value={`${margins.marginRight.toFixed(2)} / ${margins.marginBottom.toFixed(2)} mm`} />
      </dl>
      {warnings.length > 0 && (
        <div className="space-y-1">
          {warnings.map((r) => (
            <p
              key={r.axis}
              className={`text-xs rounded px-2 py-1 border ${
                r.band === 'warning' ? 'border-danger/40 bg-danger/10 text-danger' : 'border-warn/30 bg-warn/10 text-warn'
              }`}
            >
              {r.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-ink-tertiary font-sans">{label}</dt>
      <dd className="text-ink text-right">{value}</dd>
    </>
  );
}
