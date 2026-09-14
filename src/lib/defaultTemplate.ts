import type { SheetTemplate } from '../model/types';
import { newTemplateId } from './id';

/** Starting point for both "New custom template" (Templates catalogue) and the "Custom label size" step of NewProjectFlow. */
export function defaultCustomTemplate(): SheetTemplate {
  return {
    id: newTemplateId(),
    name: 'New custom template',
    pageSize: { width: 210, height: 297 },
    marginTop: 10,
    marginLeft: 10,
    labelWidth: 50,
    labelHeight: 30,
    columns: 3,
    rows: 8,
    pitchX: 50,
    pitchY: 30,
    shape: 'rect',
    builtIn: false,
    verified: false,
  };
}
