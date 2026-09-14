/**
 * Repo layout for cloud save (PLAN §2.7): `projects/` and `templates/`, one file each.
 *
 * Paths are `<slug>-<shortid>`. The slug is what makes the repo worth browsing on
 * github.com; the id suffix is what makes the path *stable*. Renaming a project changes
 * its slug but not its id, and `projectPath` is only ever called to derive the path for a
 * document that isn't linked yet — once a RemoteLink exists, its stored `path` wins. So a
 * rename never moves the file, which means no delete-and-recreate, no split history, and
 * no rename detection anywhere in the sync code.
 */
import type { LabelDocument, SheetTemplate } from '../../model/types';

export const PROJECTS_DIR = 'projects';
export const TEMPLATES_DIR = 'templates';
export const PROJECT_EXT = '.lbl.json';
export const TEMPLATE_EXT = '.json';

/** Long enough to stay readable in a file list, short enough not to wrap. */
const MAX_SLUG_LENGTH = 48;
const SHORT_ID_LENGTH = 6;

/**
 * Filename-safe slug. Decomposes first so `ø`/`å`/`é` degrade to `o`/`a`/`e` rather than
 * being dropped outright — "Kaffeposer for høsten" should read as `kaffeposer-for-hosten`,
 * not `kaffeposer-for-h-sten`.
 */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    // NFD only splits precomposed letters into base + combining mark. `å` decomposes and so
    // survives the mark-stripping below, but `æ` and `ø` are atomic letters with no
    // decomposition — left to the `[^a-z0-9]` pass they'd become separators, turning
    // "Blåbær" into "blab-r". Two thirds of æøå, so worth spelling out.
    .replace(/[æÆ]/g, 'ae')
    .replace(/[øØ]/g, 'o')
    .replace(/ß/g, 'ss')
    .replace(/[đĐ]/g, 'd')
    // Combining diacritical marks left behind by NFD, U+0300–U+036F.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '');
  return slug || 'untitled';
}

/**
 * Last characters of the id. Ids are `proj-<uuid>` / `custom-<uuid>`, so the tail is the
 * random part — taking the head would yield the same prefix for every file.
 */
export function shortId(id: string): string {
  const compact = id.replace(/[^a-z0-9]/gi, '');
  return compact.slice(-SHORT_ID_LENGTH).toLowerCase() || 'noid';
}

export function projectPath(doc: Pick<LabelDocument, 'id' | 'name'>): string {
  return `${PROJECTS_DIR}/${slugify(doc.name)}-${shortId(doc.id)}${PROJECT_EXT}`;
}

export function templatePath(template: Pick<SheetTemplate, 'id' | 'name'>): string {
  return `${TEMPLATES_DIR}/${slugify(template.name)}-${shortId(template.id)}${TEMPLATE_EXT}`;
}

/** Display name for a remote file the app hasn't opened yet, so the list isn't full of slugs. */
export function displayNameFromPath(path: string): string {
  const file = path.slice(path.lastIndexOf('/') + 1);
  const base = file.endsWith(PROJECT_EXT) ? file.slice(0, -PROJECT_EXT.length) : file.replace(/\.json$/, '');
  return base.replace(new RegExp(`-[a-z0-9]{1,${SHORT_ID_LENGTH}}$`), '') || base;
}

export function isProjectPath(path: string): boolean {
  return path.startsWith(`${PROJECTS_DIR}/`) && path.endsWith(PROJECT_EXT);
}

export function isTemplatePath(path: string): boolean {
  return path.startsWith(`${TEMPLATES_DIR}/`) && path.endsWith(TEMPLATE_EXT);
}
