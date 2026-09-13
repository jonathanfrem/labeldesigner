import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProjectStorageAdapter, StoredProject } from './projectStorageAdapter';

export function useProjectRepository(adapter: ProjectStorageAdapter) {
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const all = await adapter.listProjects();
    setProjects(all);
    setLoading(false);
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

  return { projects: sorted, loading, saveProject, removeProject, refresh };
}
