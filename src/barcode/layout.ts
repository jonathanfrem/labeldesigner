import * as bwipjs from 'bwip-js/browser';
import type { Point, Rect } from '../model/geometry';
import type { BarcodeSymbology, Mm, QrErrorCorrection } from '../model/types';

/** Per PLAN §8: refuse to render a quiet zone narrower than this, in modules. */
export const MIN_QUIET_ZONE_MODULES: Record<BarcodeSymbology, number> = { code128: 10, qr: 4 };

/** Below this, consumer laser/inkjet output starts failing to scan reliably. */
export const MIN_SCANNABLE_MODULE_MM = 0.25;

export interface BarcodeLayoutInput {
  symbology: BarcodeSymbology;
  value: string;
  widthMm: Mm;
  heightMm: Mm;
  quietZoneModules: number;
  errorCorrection?: QrErrorCorrection;
}

/** One filled shape, possibly with disjoint sub-regions (bwipp merges adjacent same-colour modules into orthogonal polygons). */
export type PolygonBatch = Point[][];

export interface BarcodeGeometry {
  /** Code 128 bars, one rect each, in the element's own local mm space (0,0 at its top-left). */
  bars: Rect[];
  /** QR modules, already merged into as few polygons as bwipp produced, same local mm space. */
  polygonBatches: PolygonBatch[];
  /** The narrowest bar / one QR module, in mm — what MIN_SCANNABLE_MODULE_MM is compared against. */
  moduleWidthMm: Mm;
  moduleTooNarrow: boolean;
  /** The quiet zone actually used, after clamping up to MIN_QUIET_ZONE_MODULES. */
  quietZoneModules: number;
  quietZoneClamped: boolean;
}

interface RawLine {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  lw: number;
}

interface CollectorResult {
  width: number;
  height: number;
  bars: RawLine[];
  polygonBatches: Array<Array<Array<[number, number]>>>;
}

/**
 * A bwip-js drawing backend that doesn't draw anything — it just collects
 * the bars (line calls, Code 128) and merged-module polygons (polygon+fill
 * calls, QR) bwipp produces, in bwip's own device-unit space. Everything
 * downstream (quiet zone, scale-to-fit, element rotation, sheet placement)
 * happens once, in mm, and feeds both renderers identically — the same
 * "compute once, draw twice" shape as the text layout module.
 */
function createCollector(): bwipjs.DrawingContext<CollectorResult> {
  let width = 0;
  let height = 0;
  const bars: RawLine[] = [];
  const polygonBatches: Array<Array<Array<[number, number]>>> = [];
  let currentBatch: Array<Array<[number, number]>> | null = null;

  return {
    scale(sx, sy) {
      return [sx, sy];
    },
    measure() {
      return { width: 0, ascent: 0, descent: 0 };
    },
    init(w, h) {
      width = w;
      height = h;
    },
    line(x0, y0, x1, y1, lw) {
      bars.push({ x0, y0, x1, y1, lw });
    },
    polygon(pts) {
      currentBatch ??= [];
      currentBatch.push(pts.slice());
    },
    hexagon() {
      throw new Error('barcode: hexagon primitive unsupported — v1 covers Code 128 and QR only');
    },
    ellipse() {
      throw new Error('barcode: ellipse primitive unsupported — v1 covers Code 128 and QR only');
    },
    fill() {
      if (currentBatch) {
        polygonBatches.push(currentBatch);
        currentBatch = null;
      }
    },
    text() {
      throw new Error('barcode: text primitive unsupported — HRI is drawn separately via the text layout module');
    },
    end() {
      return { width, height, bars, polygonBatches };
    },
  };
}

/**
 * Encodes and lays out a barcode entirely in local mm space, ready for the
 * same rotate/place pipeline every other element goes through. bwip-js runs
 * at scale 1 (one device unit per module / per X-dimension), so the raw
 * `width`/`height` it reports are natural module counts — quiet zone and
 * final scale-to-fit are computed from that directly, no iteration needed.
 */
export function layoutBarcode(input: BarcodeLayoutInput): BarcodeGeometry {
  const minQuietZone = MIN_QUIET_ZONE_MODULES[input.symbology];
  const quietZoneModules = Math.max(input.quietZoneModules, minQuietZone);
  const quietZoneClamped = quietZoneModules > input.quietZoneModules;

  const collector = createCollector();
  const raw = bwipjs.render(
    {
      bcid: input.symbology === 'qr' ? 'qrcode' : 'code128',
      text: input.value.length > 0 ? input.value : ' ',
      scale: 1,
      scaleX: 1,
      scaleY: 1,
      includetext: false,
      ...(input.symbology === 'qr' && input.errorCorrection ? { eclevel: input.errorCorrection } : {}),
    },
    collector,
  ) as CollectorResult;

  const { width: naturalWidth, height: naturalHeight, bars, polygonBatches } = raw;

  let scaleX: number;
  let scaleY: number;
  let offsetX: Mm;
  let offsetY: Mm;
  let moduleWidthMm: Mm;

  if (input.symbology === 'qr') {
    // QR is always square, and the quiet zone applies evenly on all four sides.
    const totalUnits = naturalWidth + 2 * quietZoneModules;
    const fitScale = Math.min(input.widthMm, input.heightMm) / totalUnits;
    scaleX = scaleY = moduleWidthMm = fitScale;
    offsetX = (input.widthMm - naturalWidth * fitScale) / 2;
    offsetY = (input.heightMm - naturalHeight * fitScale) / 2;
  } else {
    // Code 128: quiet zone is a width-only concept — height just fills the box.
    const totalUnitsX = naturalWidth + 2 * quietZoneModules;
    scaleX = moduleWidthMm = input.widthMm / totalUnitsX;
    scaleY = naturalHeight > 0 ? input.heightMm / naturalHeight : 1;
    offsetX = quietZoneModules * scaleX;
    offsetY = 0;
  }

  const toLocal = (x: number, y: number): Point => ({ x: x * scaleX + offsetX, y: y * scaleY + offsetY });

  const barRects: Rect[] = bars.map((b) => {
    if (b.x0 === b.x1) {
      const barWidthMm = b.lw * scaleX;
      return {
        x: b.x0 * scaleX + offsetX - barWidthMm / 2,
        y: Math.min(b.y0, b.y1) * scaleY + offsetY,
        width: barWidthMm,
        height: Math.abs(b.y1 - b.y0) * scaleY,
      };
    }
    const barHeightMm = b.lw * scaleY;
    return {
      x: Math.min(b.x0, b.x1) * scaleX + offsetX,
      y: b.y0 * scaleY + offsetY - barHeightMm / 2,
      width: Math.abs(b.x1 - b.x0) * scaleX,
      height: barHeightMm,
    };
  });

  const polygons: PolygonBatch[] = polygonBatches.map((batch) => batch.map((poly) => poly.map(([x, y]) => toLocal(x, y))));

  return {
    bars: barRects,
    polygonBatches: polygons,
    moduleWidthMm,
    moduleTooNarrow: moduleWidthMm < MIN_SCANNABLE_MODULE_MM,
    quietZoneModules,
    quietZoneClamped,
  };
}
