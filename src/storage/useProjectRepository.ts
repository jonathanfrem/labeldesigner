import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProjectStorageAdapter, StoredProject } from './projectStorageAdapter';

export function useProjectRepository(adapter: ProjectStorageAdapter) {
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const all = await adapter.listProjects();
      setProjects(all);
    } catch (err) {
      // Without this, a rejected listProjects() (e.g. a blocked IndexedDB upgrade in
      // db.ts) left `loading` stuck at true forever — an infinite "Loading…" with no
      // error and no way out short of the user guessing to close other tabs.
      setError(err instanceof Error ? err.message : 'Could not load your projects.');
    } finally {
      setLoading(false);
    }
  }, [adapter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const sorted = useMemo(() => [...projects].sort((a, b) => b.updatedAt - a.updatedAt), [projects]);

  const saveProject = useCallback(
    async (project: StoredProject) => {
      await adapter.saveProject(project);
      await refresh();
    },
    [adapter, refresh],
  );

  const removeProject = useCallback(
    async (id: string) => {
      await adapter.deleteProject(id);
      await refresh();
    },
    [adapter, refresh],
  );

  return { projects: sorted, loading, error, saveProject, removeProject, refresh };
}
