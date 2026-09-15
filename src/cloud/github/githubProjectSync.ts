/**
 * Project and template operations against a GitHub repo (PLAN §2.7).
 *
 * Composes restClient with the app's existing serialisation. Nothing here invents a new
 * on-disk format: `serializeProject`/`migrate` and `serializeTemplate`/`parseTemplateJson`
 * are the same functions "Save As" and "Open project file…" use, so a file in the repo and
 * a file on disk are byte-identical and freely interchangeable.
 *
 * This is a save *target*, not a sync engine — there is no offline queue, no auto-pull and
 * no merge (PLAN §13). Every function here is called from an explicit user action.
 */
import { migrate, serializeProject } from '../../lib/projectJson';
import { parseTemplateJson, serializeTemplate } from '../../lib/templateJson';
import type { LabelDocument, SheetTemplate } from '../../model/types';
import { displayNameFromPath, PROJECTS_DIR, projectPath, TEMPLATES_DIR, templatePath } from './paths';
import type { GithubRestClient } from './restClient';
import type { RemoteFile, RemoteLink, RepoRef } from './types';

/** A remote project as listed, before it has been opened. */
export interface RemoteProjectSummary {
  path: string;
  displayName: string;
  sha: string;
  size: number;
}

function toLink(repo: RepoRef, path: string, sha: string): RemoteLink {
  return { owner: repo.owner, repo: repo.repo, branch: repo.defaultBranch, path, sha, lastSyncedAt: Date.now() };
}

export async function listRemoteProjects(client: GithubRestClient, repo: RepoRef): Promise<RemoteProjectSummary[]> {
  // null means the directory doesn't exist — a freshly created repo, not a failure.
  const files = (await client.listDir(repo, PROJECTS_DIR)) ?? [];
  return files
    .filter((f) => f.name.endsWith('.lbl.json'))
    .map((f: RemoteFile) => ({ path: f.path, displayName: displayNameFromPath(f.path), sha: f.sha, size: f.size }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Writes the document and returns the link to store against it.
 *
 * `link` is absent on the first save, in which case the path is derived from the document.
 * Afterwards the stored path always wins, so renaming a project never moves its file.
 */
export async function pushProject(
  client: GithubRestClient,
  repo: RepoRef,
  doc: LabelDocument,
  link: RemoteLink | null,
): Promise<RemoteLink> {
  const path = link?.path ?? projectPath(doc);
  const name = doc.name || 'Untitled project';
  const message = link ? `Update ${name}` : `Add ${name}`;
  const { sha } = await client.putFile(repo, path, serializeProject(doc), message, link?.sha);
  return toLink(repo, path, sha);
}

/**
 * Reads a project back. Runs the same `migrate` as opening a local file, so a hand-edited or
 * future-schema file in the repo fails with the same readable error rather than half-loading.
 */
export async function pullProject(
  client: GithubRestClient,
  repo: RepoRef,
  path: string,
): Promise<{ document: LabelDocument; link: RemoteLink }> {
  const file = await client.getFile(repo, path);
  if (!file) throw new Error('That project is no longer in the repository.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(file.text);
  } catch {
    throw new Error(`"${path}" in the repository is not valid JSON.`);
  }
  return { document: migrate(parsed), link: toLink(repo, path, file.sha) };
}

export async function deleteRemoteProject(client: GithubRestClient, link: RemoteLink): Promise<void> {
  const repo: RepoRef = { owner: link.owner, repo: link.repo, defaultBranch: link.branch, private: true };
  await client.deleteFile(repo, link.path, `Delete ${displayNameFromPath(link.path)}`, link.sha);
}

/**
 * Pushes a custom template.
 *
 * Templates sync so that opening a project on a second machine resolves its template
 * instead of tripping the "missing template" mismatch path in projectSession.ts. They're
 * small and change rarely, so this always reads the existing file first to get its sha
 * rather than tracking one — the extra request is cheaper than the bookkeeping.
 */
export async function pushTemplate(client: GithubRestClient, repo: RepoRef, template: SheetTemplate): Promise<void> {
  const path = templatePath(template);
  const text = serializeTemplate(template);
  const existing = await client.getFile(repo, path);
  // Skip the commit when nothing changed, so re-saving a project doesn't churn the history.
  if (existing?.text === text) return;
  await client.putFile(repo, path, text, existing ? `Update template ${template.name}` : `Add template ${template.name}`, existing?.sha);
}

/**
 * Reads every custom template in the repo. Individual unreadable files are skipped rather
 * than failing the whole load — one hand-edited template shouldn't block opening a project.
 */
export async function pullTemplates(client: GithubRestClient, repo: RepoRef): Promise<SheetTemplate[]> {
  const files = (await client.listDir(repo, TEMPLATES_DIR)) ?? [];
  const templates: SheetTemplate[] = [];
  for (const file of files) {
    if (!file.name.endsWith('.json')) continue;
    const content = await client.getFile(repo, file.path);
    if (!content) continue;
    try {
      templates.push(parseTemplateJson(content.text));
    } catch {
      continue;
    }
  }
  return templates;
}
