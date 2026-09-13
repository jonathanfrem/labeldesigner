import type { PDFDocument, PDFImage } from 'pdf-lib';
import type { Asset, Element } from '../../model/types';

export type EmbeddedImages = Map<string, PDFImage>;

/**
 * Embeds every asset referenced by a document's image elements, once per
 * PDF. Every `Asset` is already a plain PNG or JPEG (see model/types.ts) —
 * SVG uploads were rasterised at upload time — so this is a direct
 * `embedPng`/`embedJpg` per asset, no format branching beyond that.
 */
export async function embedImagesForElements(doc: PDFDocument, elements: readonly Element[], assets: Record<string, Asset>): Promise<EmbeddedImages> {
  const assetIds = new Set(elements.filter((e): e is Extract<Element, { type: 'image' }> => e.type === 'image').map((e) => e.assetId));
  const result: EmbeddedImages = new Map();

  await Promise.all(
    [...assetIds].map(async (assetId) => {
      const asset = assets[assetId];
      if (!asset) return;
      const image = asset.mime === 'image/jpeg' ? await doc.embedJpg(asset.dataUrl) : await doc.embedPng(asset.dataUrl);
      result.set(assetId, image);
    }),
  );

  return result;
}
