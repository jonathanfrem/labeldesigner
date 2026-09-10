import fontkitLib, { type Font } from '@pdf-lib/fontkit';
import { PDFDocument, type PDFFont } from 'pdf-lib';
import type { Element } from '../../model/types';
import { loadFontBytes } from '../../text/fontLoader';

export interface EmbeddedFont {
  /** For layoutText — the same bytes pdf-lib embeds below, so measurement and embedding never diverge. */
  layoutFont: Font;
  pdfFont: PDFFont;
}

export type EmbeddedFonts = Map<string, EmbeddedFont>;

/**
 * Embeds (with subsetting) every font referenced by a document's text
 * elements, once per PDF, before any page draws them. Registers the fontkit
 * used for embedding, and returns the same fontkit-parsed Font per fontId so
 * `layoutText` measures with the exact bytes that got embedded.
 */
export async function embedFontsForElements(doc: PDFDocument, elements: readonly Element[]): Promise<EmbeddedFonts> {
  const fontIds = new Set(elements.filter((e): e is Extract<Element, { type: 'text' }> => e.type === 'text').map((e) => e.fontId));
  const result: EmbeddedFonts = new Map();
  if (fontIds.size === 0) return result;

  doc.registerFontkit(fontkitLib);

  await Promise.all(
    [...fontIds].map(async (fontId) => {
      const bytes = await loadFontBytes(fontId);
      const [layoutFont, pdfFont] = await Promise.all([
        Promise.resolve(fontkitLib.create(bytes) as Font),
        doc.embedFont(bytes, { subset: true }),
      ]);
      result.set(fontId, { layoutFont, pdfFont });
    }),
  );

  return result;
}
