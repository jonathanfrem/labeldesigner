import type { Font } from '@pdf-lib/fontkit';
import type { Mm, TextHorizontalAlign, TextVerticalAlign } from '../model/types';
import { parseContent, renderLiteral } from './tokens';

const PT_TO_MM = 25.4 / 72;
export function ptToMm(pt: number): Mm {
  return pt * PT_TO_MM;
}

/** Disables ligatures/contextual alternates so every output glyph maps to exactly one input codepoint — see layout.ts module doc. */
const SHAPING_FEATURES = { liga: false, clig: false, rlig: false, dlig: false, hlig: false, calt: false };

export interface TextRun {
  /** A single glyph cluster (normally one character — see SHAPING_FEATURES). */
  text: string;
  /** mm, relative to the box's left edge. */
  x: Mm;
}

export interface TextLine {
  runs: TextRun[];
  /** mm, relative to the box's top edge — where the renderer places the glyph baseline. */
  baselineY: Mm;
  widthMm: Mm;
}

export interface TextLayoutStyle {
  fontSizePt: number;
  lineHeight: number;
  letterSpacing: number;
  align: TextHorizontalAlign;
  verticalAlign: TextVerticalAlign;
  autoShrink: boolean;
  minFontSizePt?: number;
}

export interface TextLayoutResult {
  /** The size actually used, after auto-shrink (equals style.fontSizePt when autoShrink is off). */
  fontSizePt: number;
  lines: TextLine[];
  blockHeightMm: Mm;
  /** True when the block still exceeds the box height at the smallest size tried. Renderers draw it anyway — text overflows visibly rather than being clipped. */
  overflows: boolean;
}

interface Cluster {
  text: string;
  advanceMm: Mm;
  isWhitespace: boolean;
}

const SHRINK_STEP_PT = 0.5;

/**
 * Lays out `content` into positioned lines using fontkit glyph metrics only
 * — no browser text measurement anywhere in this module (CLAUDE.md
 * invariant 4). Both renderers draw the returned lines verbatim.
 */
export function layoutText(content: string, style: TextLayoutStyle, boxWidthMm: Mm, boxHeightMm: Mm, font: Font): TextLayoutResult {
  const literal = renderLiteral(parseContent(content));
  const paragraphs = literal.split('\n');

  const minSize = style.autoShrink ? Math.min(style.minFontSizePt ?? style.fontSizePt, style.fontSizePt) : style.fontSizePt;

  let result = layoutAtSize(font, paragraphs, style.fontSizePt, style, boxWidthMm);
  if (style.autoShrink) {
    for (let size = style.fontSizePt - SHRINK_STEP_PT; size > minSize; size -= SHRINK_STEP_PT) {
      if (result.blockHeightMm <= boxHeightMm) break;
      result = layoutAtSize(font, paragraphs, size, style, boxWidthMm);
    }
    if (result.blockHeightMm > boxHeightMm && minSize < style.fontSizePt) {
      result = layoutAtSize(font, paragraphs, minSize, style, boxWidthMm);
    }
  }

  const verticalOffset =
    style.verticalAlign === 'middle'
      ? (boxHeightMm - result.blockHeightMm) / 2
      : style.verticalAlign === 'bottom'
        ? boxHeightMm - result.blockHeightMm
        : 0;
  const lines = verticalOffset === 0 ? result.lines : result.lines.map((l) => ({ ...l, baselineY: l.baselineY + verticalOffset }));

  return { fontSizePt: result.fontSizePt, lines, blockHeightMm: result.blockHeightMm, overflows: result.blockHeightMm > boxHeightMm };
}

function layoutAtSize(
  font: Font,
  paragraphs: string[],
  fontSizePt: number,
  style: TextLayoutStyle,
  boxWidthMm: Mm,
): { fontSizePt: number; lines: TextLine[]; blockHeightMm: Mm } {
  const fontSizeMm = ptToMm(fontSizePt);
  const letterSpacingMm = style.letterSpacing * fontSizeMm;
  const lineHeightMm = fontSizeMm * style.lineHeight;
  const ascentMm = (font.ascent / font.unitsPerEm) * fontSizeMm;
  const halfLeading = (lineHeightMm - fontSizeMm) / 2;

  const rawLines: { clusters: Cluster[]; isLastInParagraph: boolean }[] = [];
  for (const paragraph of paragraphs) {
    const paraLines = wrapParagraph(font, paragraph, fontSizeMm, letterSpacingMm, boxWidthMm);
    paraLines.forEach((clusters, i) => rawLines.push({ clusters, isLastInParagraph: i === paraLines.length - 1 }));
  }

  const lines: TextLine[] = rawLines.map(({ clusters, isLastInParagraph }, i) => {
    const natural = positionLine(clusters, letterSpacingMm, 0);
    let { runs, widthMm } = natural;

    if (style.align === 'justify' && !isLastInParagraph) {
      const gapCount = clusters.filter((c) => c.isWhitespace).length;
      if (gapCount > 0 && boxWidthMm > natural.widthMm) {
        const extra = (boxWidthMm - natural.widthMm) / gapCount;
        const justified = positionLine(clusters, letterSpacingMm, extra);
        runs = justified.runs;
        widthMm = justified.widthMm;
      }
    } else if (style.align === 'center') {
      const offset = (boxWidthMm - widthMm) / 2;
      runs = runs.map((r) => ({ ...r, x: r.x + offset }));
    } else if (style.align === 'right') {
      const offset = boxWidthMm - widthMm;
      runs = runs.map((r) => ({ ...r, x: r.x + offset }));
    }

    const baselineY = i * lineHeightMm + halfLeading + ascentMm;
    return { runs, baselineY, widthMm };
  });

  return { fontSizePt, lines, blockHeightMm: lines.length * lineHeightMm };
}

function tokenize(paragraph: string): string[] {
  return paragraph.split(/(\s+)/).filter((t) => t.length > 0);
}

function measureToken(font: Font, text: string, fontSizeMm: Mm, letterSpacingMm: Mm): Cluster[] {
  if (text.length === 0) return [];
  const isWhitespace = /^\s+$/.test(text);
  const run = font.layout(text, SHAPING_FEATURES);
  return run.glyphs.map((glyph, i) => {
    const position = run.positions[i];
    const advanceMm = (position.xAdvance / font.unitsPerEm) * fontSizeMm + letterSpacingMm;
    const char = glyph.codePoints.length > 0 ? String.fromCodePoint(...glyph.codePoints) : '';
    return { text: char, advanceMm, isWhitespace };
  });
}

function trimTrailingWhitespace(clusters: Cluster[]): Cluster[] {
  let end = clusters.length;
  while (end > 0 && clusters[end - 1].isWhitespace) end--;
  return clusters.slice(0, end);
}

function widthOf(clusters: Cluster[]): Mm {
  return clusters.reduce((sum, c) => sum + c.advanceMm, 0);
}

/** Fills lines greedily from a single overlong word's glyph clusters, breaking mid-word so it never overflows the box width. */
function hardBreakWord(clusters: Cluster[], boxWidthMm: Mm): Cluster[][] {
  const result: Cluster[][] = [[]];
  let width = 0;
  for (const cluster of clusters) {
    const last = result[result.length - 1];
    if (width + cluster.advanceMm > boxWidthMm && last.length > 0) {
      result.push([]);
      width = 0;
    }
    result[result.length - 1].push(cluster);
    width += cluster.advanceMm;
  }
  return result;
}

/** Greedy word wrap with a forced-newline-free paragraph. Returns one Cluster[] per wrapped line. */
function wrapParagraph(font: Font, paragraph: string, fontSizeMm: Mm, letterSpacingMm: Mm, boxWidthMm: Mm): Cluster[][] {
  const tokens = tokenize(paragraph).map((text) => measureToken(font, text, fontSizeMm, letterSpacingMm));

  const lines: Cluster[][] = [];
  let current: Cluster[] = [];
  let lastNonWsWidth = 0;

  function flush() {
    lines.push(trimTrailingWhitespace(current));
    current = [];
    lastNonWsWidth = 0;
  }

  for (const token of tokens) {
    const isWhitespace = token.length > 0 && token[0].isWhitespace;
    const tokenWidth = widthOf(token);

    if (isWhitespace) {
      current.push(...token);
      continue;
    }

    if (tokenWidth > boxWidthMm) {
      if (lastNonWsWidth > 0) flush();
      const broken = hardBreakWord(token, boxWidthMm);
      for (let i = 0; i < broken.length - 1; i++) lines.push(broken[i]);
      current = broken[broken.length - 1];
      lastNonWsWidth = widthOf(current);
      continue;
    }

    if (lastNonWsWidth > 0 && lastNonWsWidth + tokenWidth > boxWidthMm) flush();
    current.push(...token);
    lastNonWsWidth = widthOf(current);
  }
  lines.push(trimTrailingWhitespace(current));

  return lines;
}

function positionLine(clusters: Cluster[], letterSpacingMm: Mm, justifyExtraPerGapMm: Mm): { runs: TextRun[]; widthMm: Mm } {
  const runs: TextRun[] = [];
  let x = 0;
  for (const cluster of clusters) {
    if (cluster.text !== '') runs.push({ text: cluster.text, x });
    x += cluster.advanceMm;
    if (cluster.isWhitespace) x += justifyExtraPerGapMm;
  }
  const widthMm = Math.max(0, x - (clusters.length > 0 ? letterSpacingMm : 0));
  return { runs, widthMm };
}
