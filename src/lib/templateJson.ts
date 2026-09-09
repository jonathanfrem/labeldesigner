import type { LabelShape, SheetTemplate } from '../model/types';

export const TEMPLATE_SCHEMA_VERSION = 1;

interface TemplateExportEnvelope {
  schemaVersion: typeof TEMPLATE_SCHEMA_VERSION;
  template: SheetTemplate;
}

export function serializeTemplate(template: SheetTemplate): string {
  const envelope: TemplateExportEnvelope = { schemaVersion: TEMPLATE_SCHEMA_VERSION, template };
  return JSON.stringify(envelope, null, 2);
}

/** Throws a readable Error on anything that doesn't parse as a valid template. */
export function parseTemplateJson(raw: string): SheetTemplate {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Expected a JSON object with a "template" field.');
  }
  const envelope = parsed as Record<string, unknown>;
  if (envelope.schemaVersion !== TEMPLATE_SCHEMA_VERSION) {
    throw new Error(
      `This file is template schema version ${JSON.stringify(envelope.schemaVersion)}. This app reads version ${TEMPLATE_SCHEMA_VERSION}.`,
    );
  }
  if (typeof envelope.template !== 'object' || envelope.template === null) {
    throw new Error('Missing "template" in the file.');
  }
  return validateTemplateShape(envelope.template as Record<string, unknown>);
}

function validateTemplateShape(t: Record<string, unknown>): SheetTemplate {
  const str = (key: string): string => {
    const v = t[key];
    if (typeof v !== 'string' || v === '') throw new Error(`"${key}" must be a non-empty string.`);
    return v;
  };
  const num = (key: string): number => {
    const v = t[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`"${key}" must be a number.`);
    return v;
  };
  const optionalStr = (key: string): string | undefined => (typeof t[key] === 'string' ? (t[key] as string) : undefined);

  const pageSize = t.pageSize;
  if (typeof pageSize !== 'object' || pageSize === null) {
    throw new Error('"pageSize" must be an object with numeric width/height.');
  }
  const { width, height } = pageSize as Record<string, unknown>;
  if (typeof width !== 'number' || typeof height !== 'number') {
    throw new Error('"pageSize.width" and "pageSize.height" must be numbers.');
  }

  const shape = t.shape;
  if (shape !== 'rect' && shape !== 'rounded' && shape !== 'ellipse') {
    throw new Error('"shape" must be one of rect, rounded, ellipse.');
  }

  const equivalents = Array.isArray(t.equivalents)
    ? t.equivalents.filter((e): e is string => typeof e === 'string')
    : undefined;

  return {
    id: str('id'),
    name: str('name'),
    brand: optionalStr('brand'),
    code: optionalStr('code'),
    pageSize: { width, height },
    marginTop: num('marginTop'),
    marginLeft: num('marginLeft'),
    labelWidth: num('labelWidth'),
    labelHeight: num('labelHeight'),
    columns: num('columns'),
    rows: num('rows'),
    pitchX: num('pitchX'),
    pitchY: num('pitchY'),
    shape: shape as LabelShape,
    cornerRadius: typeof t.cornerRadius === 'number' ? t.cornerRadius : undefined,
    builtIn: false,
    verified: false,
    source: optionalStr('source'),
    equivalents,
  };
}

export function downloadTemplateJson(template: SheetTemplate): void {
  const blob = new Blob([serializeTemplate(template)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${template.code ?? template.id}.template.json`;
  a.click();
  URL.revokeObjectURL(url);
}
