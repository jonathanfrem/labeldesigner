import type { SheetTemplate } from '../model/types';

/**
 * Capability adapter for persisting custom templates (PLAN §2.5). IndexedDB
 * is the only implementation today; M6 slots a File System Access-backed
 * adapter in behind this same interface, so callers never talk to
 * IndexedDB directly.
 *
 * Built-ins are not persisted here — they ship as static data and are
 * immutable at runtime. There is deliberately no verified-override
 * mechanism: a locally stored override would shadow templates.json, so a
 * future build that corrects a built-in's dimensions would never reach
 * anyone who'd previously clicked "verified". Editing a built-in only
 * happens by duplicating it into a custom template.
 */
export interface TemplateStorageAdapter {
  listCustomTemplates(): Promise<SheetTemplate[]>;
  saveCustomTemplate(template: SheetTemplate): Promise<void>;
  deleteCustomTemplate(id: string): Promise<void>;
}
