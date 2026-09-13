import type { Asset, ContentRotation, Element, LabelDocument } from '../model/types';

export const PROJECT_SCHEMA_VERSION = 1;

export function serializeProject(doc: LabelDocument): string {
  return JSON.stringify(doc, null, 2);
}

/**
 * PLAN §4.1's migration stub: validates top-level shape and rejects anything
 * that isn't schema version 1 with a readable error, rather than partially
 * loading it. The realistic failure modes for a file this app wrote itself
 * are "future schema version" and "hand-edited/corrupted JSON" — both need a
 * clear throw, not a deep re-validation of every element field.
 */
export function migrate(raw: unknown): LabelDocument {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('That file is not a valid label project.');
  }
  const doc = raw as Record<string, unknown>;
  if (doc.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new Error(
      `This file is project schema version ${JSON.stringify(doc.schemaVersion)}. This app reads version ${PROJECT_SCHEMA_VERSION}.`,
    );
  }
  const str = (key: string): string => {
    const v = doc[key];
    if (typeof v !== 'string' || v === '') throw new Error(`"${key}" must be a non-empty string.`);
    return v;
  };
  if (typeof doc.template !== 'object' || doc.template === null) {
    throw new Error('Missing "template" in the file.');
  }
  if (typeof doc.size !== 'object' || doc.size === null) {
    throw new Error('Missing "size" in the file.');
  }
  if (![0, 90, 180, 270].includes(doc.contentRotation as number)) {
    throw new Error('"contentRotation" must be one of 0, 90, 180, 270.');
  }
  if (!Array.isArray(doc.elements)) {
    throw new Error('"elements" must be an array.');
  }
  if (typeof doc.assets !== 'object' || doc.assets === null) {
    throw new Error('"assets" must be an object.');
  }

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: str('id'),
    name: str('name'),
    templateId: str('templateId'),
    template: doc.template as LabelDocument['template'],
    size: doc.size as LabelDocument['size'],
    contentRotation: doc.contentRotation as ContentRotation,
    background: doc.background as LabelDocument['background'],
    elements: doc.elements as Element[],
    assets: doc.assets as Record<string, Asset>,
  };
}

export function downloadProjectJson(doc: LabelDocument): void {
  const blob = new Blob([serializeProject(doc)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${doc.name || doc.id}.lbl.json`;
  a.click();
  URL.revokeObjectURL(url);
}
