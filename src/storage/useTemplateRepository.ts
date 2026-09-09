import { useCallback, useEffect, useMemo, useState } from 'react';
import templatesData from '../data/templates.json';
import type { SheetTemplate } from '../model/types';
import type { TemplateStorageAdapter } from './templateStorageAdapter';

export const builtInTemplates = templatesData as SheetTemplate[];

export function useTemplateRepository(adapter: TemplateStorageAdapter) {
  const [customTemplates, setCustomTemplates] = useState<SheetTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const custom = await adapter.listCustomTemplates();
    setCustomTemplates(custom);
    setLoading(false);
  }, [adapter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const allTemplates = useMemo<SheetTemplate[]>(() => [...builtInTemplates, ...customTemplates], [customTemplates]);

  const saveCustom = useCallback(
    async (template: SheetTemplate) => {
      await adapter.saveCustomTemplate(template);
      await refresh();
    },
    [adapter, refresh],
  );

  const removeCustom = useCallback(
    async (id: string) => {
      await adapter.deleteCustomTemplate(id);
      await refresh();
    },
    [adapter, refresh],
  );

  /** Custom templates only — built-ins are immutable at runtime, see templateStorageAdapter.ts. */
  const setCustomVerified = useCallback(
    async (id: string, verified: boolean) => {
      const custom = customTemplates.find((t) => t.id === id);
      if (!custom) throw new Error(`"${id}" is not a custom template — built-ins can't be marked verified at runtime.`);
      await adapter.saveCustomTemplate({ ...custom, verified });
      await refresh();
    },
    [adapter, customTemplates, refresh],
  );

  return { allTemplates, customTemplates, loading, saveCustom, removeCustom, setCustomVerified };
}
