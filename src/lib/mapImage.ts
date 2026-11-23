/**
 * Draw the boundary map to a PNG, for the Word report and the deck.
 *
 * The same projection and shapes as the on-screen map, drawn straight onto
 * a canvas rather than by rasterising the SVG: turning an SVG into an image
 * means an Image load, which is asynchronous and throttled in a background
 * tab, and a report must not stall because the window was minimised.
 */

import type { PlaceRate } from './analyse';
import { DISTRICT_SHAPES, LGA_SHAPES, type MapUnit } from './gambia';
import { labelPoint, makeProjector, shapeWidth } from './projection';
import type { BoundaryShape } from '@/data/boundaries';

export interface MapImage {
  data: Uint8Array;
  width: number;
  height: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function trace(
  ctx: CanvasRenderingContext2D,
  shape: BoundaryShape,
  project: (lon: number, lat: number) => [number, number],
): void {
  ctx.beginPath();
  for (const ring of shape.rings) {
    for (let i = 0; i < ring.length; i += 2) {
      const [x, y] = project(ring[i]!, ring[i + 1]!);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
}

function hatchPattern(ctx: CanvasRenderingContext2D): CanvasPattern | string {
  const tile = document.createElement('canvas');
  tile.width = 7;
  tile.height = 7;
  const t = tile.getContext('2d');
  if (!t) return '#F0F3F5';
  t.fillStyle = '#F0F3F5';
  t.fillRect(0, 0, 7, 7);
  t.strokeStyle = '#C3CBD1';
  t.lineWidth = 2.5;
  t.beginPath();
  t.moveTo(-2, 9);
  t.lineTo(9, -2);
  t.stroke();
  return ctx.createPattern(tile, 'repeat') ?? '#F0F3F5';
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  size: number,
): void {
  ctx.font = `700 ${size}px Arial, "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = Math.max(2, size / 4.5);
  ctx.strokeText(text, cx, cy);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(text, cx, cy);
}

/**
 * The label size a map of this width should use, in canvas pixels.
 *
 * Expressed against the drawing width rather than as a fixed size, because
 * the canvas is scaled to whatever page it lands on. `slideLabelPt` turns it
 * back into the size it will actually be once a deck slide has scaled it,
 * which is what the 18pt floor is about.
 */
export function mapLabelSize(width: number, unit: MapUnit): number {
  return width / (unit === 'lga' ? 50 : 58);
}

/** What `mapLabelSize` comes to on a slide, once the map is scaled to fit. */
export function slideLabelPt(width: number, unit: MapUnit, inchesOnSlide: number): number {
  return mapLabelSize(width, unit) * ((inchesOnSlide * 72) / width);
}

function short(name: string): string {
  if (name.length <= 12) return name;
  const parts = name.split(' ');
  if (parts.length === 1) return name.slice(0, 11);
  const [first, ...rest] = parts;
  return `${first} ${rest.map((p) => p[0]).join('')}`;
}

/**
 * @param width drawing width in CSS pixels. 700 fits a Word page at this
 *   report's margins; the deck asks for more.
 */
export function mapPng(
  rates: PlaceRate[],
  unit: MapUnit,
  suffix: '%' | '',
  colourHex = '#12239E',
  width = 700,
): MapImage {
  const projector = makeProjector(width, 8);
  /*
   * A band under the map for the places too small to label inside.
   *
   * Banjul is 12 square miles and Kanifing is beside it, so neither can hold
   * a name at the size the rest of the deck is set in. Their labels go below
   * the country on a leader line, and that needs clear paper: drawn over the
   * map they landed on West Coast. Only the LGA map gets the band, because
   * the district map does not use callouts at all.
   */
  const callout = unit === 'lga' ? mapLabelSize(width, unit) * 3.1 : 0;
  const height = Math.round(projector.height + callout);
  const dpr = 2;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * dpr);
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable in this browser.');
  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  const shapes = unit === 'lga' ? LGA_SHAPES : DISTRICT_SHAPES;
  const byPlace = new Map(rates.map((r) => [r.place, r]));
  const vals = rates.map((r) => r.pct).filter((v): v is number => v !== null);
  const max = vals.length ? Math.max(...vals, 0.0001) : 1;
  const [cr, cg, cb] = hexToRgb(colourHex);
  const hatch = hatchPattern(ctx);
  const project = projector.project.bind(projector);

  for (const { key, shape } of shapes) {
    const r = byPlace.get(key);
    const has = r && r.pct !== null;
    trace(ctx, shape, project);
    if (has) {
      ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.14 + (r.pct! / max) * 0.86})`;
    } else {
      ctx.fillStyle = hatch;
    }
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }

  // LGA outlines over the districts, so the eight areas stay legible.
  if (unit === 'district') {
    ctx.strokeStyle = 'rgba(93, 107, 118, 0.55)';
    ctx.lineWidth = 1.6;
    for (const { shape } of LGA_SHAPES) {
      trace(ctx, shape, project);
      ctx.stroke();
    }
  }

  /*
   * Label size is a fraction of the drawing width, not a fixed pixel size.
   *
   * The map is drawn on a canvas and then scaled to fit whatever page it
   * lands on, so a fixed 15px label ends up at whatever size that scaling
   * leaves it. On a deck slide the 1400px map is squeezed into 12.4in and a
   * 15px label arrived at about 8pt, well under the 18pt floor the rest of
   * the deck keeps to. Sizing by width makes a label the same size on the
   * page whatever the canvas, and width/50 is that 18pt.
   */
  const size = mapLabelSize(width, unit);
  const lead = size * 0.62;

  /*
   * Places too small to hold their own label.
   *
   * A label wider than the place it names is worse than no label: it runs
   * across its neighbours and then neither can be read. What to do about it
   * depends on how many there are. The eight LGAs are all worth naming, and
   * Banjul and Kanifing are small and adjacent, so theirs are moved into the
   * empty space below the country and joined to the place by a line. The 48
   * districts are a different matter: most of them cannot hold a label at
   * this size and forty callouts would be worse than none, so on that map
   * the colour scale carries it alone.
   */
  const overflow: { name: string; value: string; cx: number; cy: number }[] = [];

  for (const { key, shape } of shapes) {
    const r = byPlace.get(key);
    const has = r && r.pct !== null;
    const [cx, cy] = labelPoint(shape, projector);
    const name = unit === 'lga' ? key : short(key);
    const value = has ? `${r!.pct!.toFixed(0)}${suffix}` : '–';

    ctx.font = `700 ${size}px Arial, "Segoe UI", system-ui, sans-serif`;
    if (ctx.measureText(name).width > shapeWidth(shape, projector)) {
      if (unit === 'lga') overflow.push({ name, value, cx, cy });
      continue;
    }

    label(ctx, name, cx, cy - lead, size);
    label(ctx, value, cx, cy + lead, size);
  }

  /*
   * Callouts, laid out across the band in one row.
   *
   * Side by side rather than stacked, and nudged apart where two of them
   * would touch, because Banjul and Kanifing share a coast and their labels
   * were landing on each other.
   */
  if (overflow.length > 0) {
    ctx.font = `700 ${size}px Arial, "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const ty = height - size * 1.3;
    const placed = overflow
      .map((o) => ({ ...o, text: `${o.name} ${o.value}` }))
      .map((o) => ({ ...o, half: ctx.measureText(o.text).width / 2 + size * 0.35 }))
      .sort((a, b) => a.cx - b.cx);

    let cursor = 0;
    for (const o of placed) {
      const x = Math.min(Math.max(o.cx, cursor + o.half, o.half), width - o.half);
      cursor = x + o.half;

      ctx.strokeStyle = 'rgba(93, 107, 118, 0.75)';
      ctx.lineWidth = Math.max(1, size / 16);
      ctx.beginPath();
      ctx.moveTo(o.cx, o.cy);
      ctx.lineTo(x, ty - size * 0.75);
      ctx.stroke();

      ctx.fillStyle = '#252423';
      ctx.fillText(o.text, x, ty);
    }
  }

  const url = canvas.toDataURL('image/png');
  const binary = atob(url.slice(url.indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { data: bytes, width, height };
}
