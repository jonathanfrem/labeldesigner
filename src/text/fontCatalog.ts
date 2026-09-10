export type FontWeight = 'regular' | 'bold';

export interface FontCatalogEntry {
  id: string;
  family: string;
  weight: FontWeight;
  label: string;
  /** Served from public/, fetched lazily — never bundled into the JS chunk. */
  fileUrl: string;
  licence: string;
}

/**
 * A small, curated set rather than the full Google-Fonts-style catalogue —
 * see fonts/LICENSES.md for the full licence text. Every family covers
 * æøåÆØÅ. Regular and Bold only for v1; more weights are just more catalog
 * rows plus a .ttf in public/fonts, no code changes.
 */
export const FONT_CATALOG: FontCatalogEntry[] = [
  { id: 'inter-regular', family: 'Inter', weight: 'regular', label: 'Inter Regular', fileUrl: '/fonts/Inter-Regular.ttf', licence: 'OFL-1.1' },
  { id: 'inter-bold', family: 'Inter', weight: 'bold', label: 'Inter Bold', fileUrl: '/fonts/Inter-Bold.ttf', licence: 'OFL-1.1' },
  {
    id: 'barlow-condensed-regular',
    family: 'Barlow Condensed',
    weight: 'regular',
    label: 'Barlow Condensed Regular',
    fileUrl: '/fonts/BarlowCondensed-Regular.ttf',
    licence: 'OFL-1.1',
  },
  {
    id: 'barlow-condensed-bold',
    family: 'Barlow Condensed',
    weight: 'bold',
    label: 'Barlow Condensed Bold',
    fileUrl: '/fonts/BarlowCondensed-Bold.ttf',
    licence: 'OFL-1.1',
  },
  {
    id: 'jetbrains-mono-regular',
    family: 'JetBrains Mono',
    weight: 'regular',
    label: 'JetBrains Mono Regular',
    fileUrl: '/fonts/JetBrainsMono-Regular.ttf',
    licence: 'OFL-1.1',
  },
  {
    id: 'jetbrains-mono-bold',
    family: 'JetBrains Mono',
    weight: 'bold',
    label: 'JetBrains Mono Bold',
    fileUrl: '/fonts/JetBrainsMono-Bold.ttf',
    licence: 'OFL-1.1',
  },
  {
    id: 'source-serif-4-regular',
    family: 'Source Serif 4',
    weight: 'regular',
    label: 'Source Serif 4 Regular',
    fileUrl: '/fonts/SourceSerif4-Regular.ttf',
    licence: 'OFL-1.1',
  },
  {
    id: 'source-serif-4-bold',
    family: 'Source Serif 4',
    weight: 'bold',
    label: 'Source Serif 4 Bold',
    fileUrl: '/fonts/SourceSerif4-Bold.ttf',
    licence: 'OFL-1.1',
  },
];

export const DEFAULT_FONT_ID = 'inter-regular';

const BY_ID = new Map(FONT_CATALOG.map((entry) => [entry.id, entry]));

export function fontCatalogEntry(fontId: string): FontCatalogEntry {
  const entry = BY_ID.get(fontId);
  if (!entry) throw new Error(`Unknown fontId "${fontId}"`);
  return entry;
}

export function fontFamilies(): string[] {
  return [...new Set(FONT_CATALOG.map((entry) => entry.family))];
}

export function variantsForFamily(family: string): FontCatalogEntry[] {
  return FONT_CATALOG.filter((entry) => entry.family === family);
}
