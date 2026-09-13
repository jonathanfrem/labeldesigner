import { createContext, useContext } from 'react';
import type { ProjectSessionApi } from './projectSession';

export const ProjectSessionContext = createContext<ProjectSessionApi | null>(null);

/** Throws if used outside the provider — every screen that needs it is mounted under App's single session instance. */
export function useProjectSessionContext(): ProjectSessionApi {
  const ctx = useContext(ProjectSessionContext);
  if (!ctx) throw new Error('useProjectSessionContext must be used within a ProjectSessionContext.Provider');
  return ctx;
}
