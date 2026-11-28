/**
 * Draw the boundary map to a PNG, for the Word report and the deck.
 *
 * The same projection and shapes as the on-screen map, drawn straight onto
 * a canvas rather than by rasterising the SVG: turning an SVG into an image
 * means an Image load, which is asynchronous and throttled in a background
 * tab, and a report must not stall because the window was minimised.
 */

import type { PlaceRate } from './analyse';
import {
  areaShapes,
  CONSTITUENCY_UNITS,
  inInset,
  INSET_BOX,
  type Division,
  type MapUnit,
} from './gambia';
import {
  fitProjector,
  labelPoint,
  makeProjector,
  shapeCentre,
  shapeWidth,
  type Projector,
} from './projection';
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
export function mapLabelSize(width: number): number {
  // A fiftieth of the drawing width came to the old floor exactly, so it
  // moved with it: a forty-fifth is the floor as it now stands.
  return width / 45;
}

/** What `mapLabelSize` comes to on a slide, once the map is scaled to fit. */
export function slideLabelPt(width: number, inchesOnSlide: number): number {
  return mapLabelSize(width) * ((inchesOnSlide * 72) / width);
}

/**
 * The key to the shading, drawn into the corner of the map itself.
 *
 * The deck used to explain the map in a line of text under the title and
 * another under the picture. Both are gone - a map of eight shaded areas
 * with a number written on each needs no paragraph - but one thing in them
 * did have to survive: hatching means a place that returned nothing, which
 * is not the same as a place that reported nothing. That belongs on the
 * map, where it is read, rather than in a caption beside it.
 */
function legend(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  colourHex: string,
  low: string,
  high: string,
  hatch: CanvasPattern | string,
  anyMissing: boolean,
): void {
  const barW = size * 7;
  const barH = size * 0.62;
  const [r, g, b] = hexToRgb(colourHex);

  const grad = ctx.createLinearGradient(x, 0, x + barW, 0);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.14)`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 1)`);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, barW, barH);
  ctx.strokeStyle = 'rgba(93, 107, 118, 0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, barW, barH);

  ctx.font = `600 ${size * 0.82}px Arial, "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = '#5D6B76';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(low, x, y + barH + size * 0.72);
  ctx.textAlign = 'right';
  ctx.fillText(high, x + barW, y + barH + size * 0.72);

  if (anyMissing) {
    const hy = y + barH + size * 1.7;
    ctx.fillStyle = hatch;
    ctx.fillRect(x, hy, barH * 1.4, barH);
    ctx.strokeRect(x, hy, barH * 1.4, barH);
    ctx.fillStyle = '#5D6B76';
    ctx.textAlign = 'left';
    ctx.fillText('no reports', x + barH * 1.9, hy + barH / 2);
  }

  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

/**
 * @param width drawing width in CSS pixels. 700 fits a Word page at this
 *   report's margins; the deck asks for more.
 */
export function mapPng(
  rates: PlaceRate[],
  suffix: '%' | '',
  colourHex = '#12239E',
  width = 700,
  /** Which division the file counts: eight LGAs, or seven regions. */
  division: Division = 'lga',
  /**
   * The shapes to draw, where they are not the areas.
   *
   * The constituency map passes its forty-six units, and only the ones
   * that were observed are labelled: forty-six names will not fit a
   * country thirty miles across, and the ones a reader is looking for
   * are the shaded ones.
   */
  units?: { key: string; label: string; shape: BoundaryShape }[],
): MapImage {
  const projector = makeProjector(width, 8);
  /*
   * A band under the map for the places too small to label inside.
   *
   * Banjul is 12 square miles and Kanifing is beside it, so neither can hold
   * a name at the size the rest of the deck is set in. Their labels go below
   * the country on a leader line, and that needs clear paper: drawn over the
   * map they landed on West Coast.
   */
  const callout = mapLabelSize(width) * 3.1;
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

  const shapes = units ?? areaShapes(division);
  const onlyObserved = units !== undefined;
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
  const size = mapLabelSize(width);
  const lead = size * 0.62;

  legend(
    ctx,
    size * 0.5,
    size * 0.4,
    size,
    colourHex,
    vals.length ? `${Math.min(...vals).toFixed(0)}${suffix}` : `0${suffix}`,
    `${max.toFixed(0)}${suffix}`,
    hatch,
    rates.some((r) => r.pct === null),
  );

  /*
   * Places too small to hold their own label.
   *
   * A label wider than the place it names is worse than no label: it runs
   * across its neighbours and then neither can be read. The eight LGAs are
   * all worth naming, and Banjul and Kanifing are small and adjacent, so
   * theirs are moved into the empty space below the country and joined to
   * the place by a line.
   */
  const overflow: { name: string; value: string; cx: number; cy: number }[] = [];

  for (const { key, label: mapLabel, shape } of shapes) {
    const r = byPlace.get(key);
    const has = r && r.pct !== null;
    const [cx, cy] = labelPoint(shape, projector);
    if (onlyObserved && !has) continue;
    // Central River is drawn twice the size of the Janjanbureh on a
    // campaign map, so in region mode the shape says which it is.
    const name = mapLabel;
    const value = has ? `${r!.pct!.toFixed(0)}${suffix}` : '–';

    ctx.font = `700 ${size}px Arial, "Segoe UI", system-ui, sans-serif`;
    if (ctx.measureText(name).width > shapeWidth(shape, projector)) {
      overflow.push({ name, value, cx, cy });
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

/* ------------------------------------------------------------------ */
/* Pies on the map                                                     */
/* ------------------------------------------------------------------ */

export interface PieSlice {
  place: string;
  counts: { label: string; n: number }[];
}

/**
 * One pie per area, sized by how many reports are behind it.
 *
 * A choropleth can shade one answer at a time, so a four-answer question
 * like "what type of event was it" needs four maps or none. A pie on each
 * area shows the whole answer at once, and the size of it says how much
 * observation is behind that mix - which matters, because an area with one
 * report would otherwise look as confident as an area with twelve.
 *
 * Banjul and Kanifing are too small to hold a pie, so theirs go in the band
 * below the country on a leader line, the same way their labels do on the
 * shaded map.
 */
export function pieMapPng(
  data: PieSlice[],
  order: string[],
  colours: string[],
  width = 1400,
  division: Division = 'lga',
): MapImage {
  const shapes = areaShapes(division);
  const projector = makeProjector(width, 8);
  const size = mapLabelSize(width);
  const rMax = size * 2.2;
  const rMin = size * 0.6;

  const totals = new Map(
    data.map((d) => [d.place, d.counts.reduce((t, c) => t + c.n, 0)] as const),
  );
  const biggest = Math.max(1, ...totals.values());
  // Area, not radius, carries the count: a reader compares the blobs.
  const radiusOf = (n: number) => rMin + (rMax - rMin) * Math.sqrt(n / biggest);

  const band = rMax * 2 + size * 2.2;
  const height = Math.round(projector.height + band);
  const dpr = 2;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * dpr);
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable in this browser.');
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  const project = projector.project.bind(projector);
  const hatch = hatchPattern(ctx);

  for (const { key, shape } of shapes) {
    trace(ctx, shape, project);
    ctx.fillStyle = totals.has(key) ? '#E8ECF0' : hatch;
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }

  const pie = (cx: number, cy: number, counts: PieSlice['counts'], total: number): void => {
    const r = radiusOf(total);
    let from = -Math.PI / 2;
    order.forEach((label, i) => {
      const n = counts.find((c) => c.label === label)?.n ?? 0;
      if (n <= 0) return;
      const to = from + (n / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, from, to);
      ctx.closePath();
      ctx.fillStyle = colours[i % colours.length]!;
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = Math.max(1, size / 14);
      ctx.stroke();
      from = to;
    });
  };

  type Placed = { place: string; counts: PieSlice['counts']; total: number; cx: number; cy: number };
  const overflow: Placed[] = [];
  const onMap: Placed[] = [];

  for (const { key, shape } of shapes) {
    const entry = data.find((d) => d.place === key);
    const total = totals.get(key) ?? 0;
    if (!entry || total === 0) continue;
    const [cx, cy] = labelPoint(shape, projector);
    const spot = { place: key, counts: entry.counts, total, cx, cy };
    if (radiusOf(total) * 2 > shapeWidth(shape, projector)) overflow.push(spot);
    else onMap.push(spot);
  }

  /*
   * Every pie first, then every name.
   *
   * Drawn one area at a time, Mansa Konko's pie landed on the name of
   * Kerewan above it and Janjanbureh's on Kuntaur's, because a pie drawn
   * later covers a name drawn earlier. Names go on last, and each one looks
   * for a clear spot: under its pie, above it, or out to one side.
   */
  /*
   * Pies that would sit on top of each other are pushed apart.
   *
   * Kuntaur and Janjanbureh meet in the middle of the country and their
   * centres are a few pixels apart, so one pie covered the other
   * completely: an area with reports looked like an area with none. Each
   * pie is nudged clear of the ones already placed, and joined back to its
   * own area by a line when it has moved far enough to need one.
   */
  const circles: { x: number; y: number; r: number }[] = [];
  const spots = onMap.map((o) => {
    const r = radiusOf(o.total);
    let x = o.cx;
    let y = o.cy;
    for (let step = 0; step < 30; step += 1) {
      const hit = circles.find(
        (c) => Math.hypot(c.x - x, c.y - y) < c.r + r + size * 0.22,
      );
      if (!hit) break;
      const dx = x - hit.x;
      const dy = y - hit.y;
      const d = Math.hypot(dx, dy);
      const push = hit.r + r + size * 0.3 - d;
      if (d < 0.5) {
        y += push;
      } else {
        x += (dx / d) * push;
        y += (dy / d) * push;
      }
    }
    x = Math.min(Math.max(x, r + 2), width - r - 2);
    circles.push({ x, y, r });
    return { ...o, x, y, r };
  });

  for (const o of spots) {
    if (Math.hypot(o.x - o.cx, o.y - o.cy) > o.r * 0.45) {
      ctx.strokeStyle = 'rgba(93, 107, 118, 0.75)';
      ctx.lineWidth = Math.max(1, size / 18);
      ctx.beginPath();
      ctx.moveTo(o.cx, o.cy);
      ctx.lineTo(o.x, o.y);
      ctx.stroke();
    }
    pie(o.x, o.y, o.counts, o.total);
  }

  const taken: { x: number; y: number; w: number; h: number }[] = [];
  const clashes = (box: { x: number; y: number; w: number; h: number }) =>
    taken.some(
      (t) =>
        box.x < t.x + t.w && box.x + box.w > t.x && box.y < t.y + t.h && box.y + box.h > t.y,
    );

  const nameSize = size * 0.9;
  ctx.font = `700 ${nameSize}px Arial, "Segoe UI", system-ui, sans-serif`;
  for (const o of spots) {
    const text = `${o.place} ${o.total}`;
    const w = ctx.measureText(text).width + size * 0.3;
    const h = nameSize * 1.2;
    const where = [
      [o.x, o.y + o.r + h * 0.7],
      [o.x, o.y - o.r - h * 0.7],
      [o.x + o.r + w / 2, o.y],
      [o.x - o.r - w / 2, o.y],
    ];
    const at =
      where.find(([x, y]) => {
        const box = { x: x! - w / 2, y: y! - h / 2, w, h };
        return box.x > 0 && box.x + box.w < width && box.y > 0 && !clashes(box);
      }) ?? where[0]!;
    taken.push({ x: at[0]! - w / 2, y: at[1]! - h / 2, w, h });
    label(ctx, text, at[0]!, at[1]!, nameSize);
  }

  if (overflow.length > 0) {
    ctx.font = `700 ${size * 0.9}px Arial, "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cy = height - band + rMax + size * 0.3;
    const placed = [...overflow].sort((a, b) => a.cx - b.cx);
    let cursor = 0;
    for (const o of placed) {
      const r = radiusOf(o.total);
      const halfText = ctx.measureText(`${o.place} ${o.total}`).width / 2 + size * 0.4;
      const half = Math.max(r + size * 0.3, halfText);
      const x = Math.min(Math.max(o.cx, cursor + half, half), width - half);
      cursor = x + half;

      ctx.strokeStyle = 'rgba(93, 107, 118, 0.75)';
      ctx.lineWidth = Math.max(1, size / 16);
      ctx.beginPath();
      ctx.moveTo(o.cx, o.cy);
      ctx.lineTo(x, cy - r);
      ctx.stroke();

      pie(x, cy, o.counts, o.total);
      ctx.fillStyle = '#252423';
      ctx.fillText(`${o.place} ${o.total}`, x, cy + r + size * 0.8);
    }
  }

  // The key. Without it the colours mean nothing, and unlike the shaded map
  // there is no number written on each area to fall back on.
  const keyX = size * 0.5;
  let keyY = size * 0.6;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${size * 0.82}px Arial, "Segoe UI", system-ui, sans-serif`;
  order.forEach((name, i) => {
    ctx.fillStyle = colours[i % colours.length]!;
    ctx.fillRect(keyX, keyY - size * 0.3, size * 0.75, size * 0.6);
    ctx.fillStyle = '#5D6B76';
    ctx.fillText(name, keyX + size * 1.1, keyY);
    keyY += size * 1.05;
  });
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';

  const url = canvas.toDataURL('image/png');
  const binary = atob(url.slice(url.indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { data: bytes, width, height };
}

/* ------------------------------------------------------------------ */
/* Bubbles on the map                                                  */
/* ------------------------------------------------------------------ */

/** One constituency's reports, for the bubble map. */
export interface MapPoint {
  /** The map unit: a constituency, or the shape a few of them share. */
  key: string;
  label: string;
  n: number;
}

/**
 * Where the reports came from, as a circle on each constituency.
 *
 * A choropleth of 46 shapes was unreadable. Most of the country is
 * hatched, the shaded ones are thin ribbons along the river, and the
 * nine or ten that were observed could not hold their own names - so
 * every label ended up in a band under the country, joined to its
 * shape by a leader line, and the lines crossed the whole map. A
 * circle says the same thing in the space it occupies, and its size
 * says how much observation is behind it.
 *
 * The country under the circles is drawn in areas, not constituencies:
 * the circle is the constituency, and 46 outlines behind it were a
 * mesh.
 *
 * Greater Banjul is drawn again beside the country. It is one per cent
 * of the land and a third of the electorate, and at national scale its
 * constituencies are a few pixels across - which is where the mission
 * does most of its observing.
 */
export function bubbleMapPng(
  points: MapPoint[],
  width = 1400,
  colourHex = '#12239E',
  division: Division = 'lga',
): MapImage {
  const projector = makeProjector(width, 8);
  const size = mapLabelSize(width);
  const country = projector.height;

  /*
   * The inset is as tall as its shape wants, within what the page has
   * room for. A wide picture is scaled to the slide by its width, so
   * height is the scarce dimension: 0.47 of the width is the tallest
   * image the content area takes under a heading.
   */
  const insetTitle = size * 1.5;
  const gap = size * 0.8;
  const [bminLon, bminLat, bmaxLon, bmaxLat] = INSET_BOX;
  const aspect =
    ((bmaxLon - bminLon) * Math.cos((((bminLat + bmaxLat) / 2) * Math.PI) / 180)) /
    (bmaxLat - bminLat);
  const insetW = Math.min(width * 0.3, (width * 0.47 - country - gap - insetTitle) * aspect);
  const insetH = insetW / aspect;
  const height = Math.round(country + gap + insetTitle + insetH);
  const dpr = 2;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * dpr);
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable in this browser.');
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  const biggest = Math.max(1, ...points.map((p) => p.n));
  // Area, not radius, carries the count: a reader compares the blobs.
  // Small enough that a dozen of them in the Kombos do not merge into
  // one blob, large enough to hold their own figure.
  const rMin = size * 0.32;
  const rMax = size * 0.95;
  const radiusOf = (n: number): number => rMin + (rMax - rMin) * Math.sqrt(n / biggest);
  const [cr, cg, cb] = hexToRgb(colourHex);
  const fill = `rgba(${cr}, ${cg}, ${cb}, 0.85)`;

  /*
   * The country, and the name of each area on it.
   *
   * The circles carry no names of their own - fifty-three will not fit
   * - so the area under them is what tells a reader where they are
   * looking. It is set in the muted grey and drawn before the circles,
   * because it is the ground and they are the figures. An area too
   * narrow for its own name goes without one: Banjul and Kanifing are
   * named in the inset, where there is room.
   */
  type Spot = { cx: number; cy: number; r: number };

  const land = (p: Projector, spots: Spot[]): void => {
    const shapes = areaShapes(division);
    for (const { shape } of shapes) {
      trace(ctx, shape, p.project.bind(p));
      ctx.fillStyle = '#EDF0F3';
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${size * 0.78}px Arial, "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = '#5D6B76';
    for (const { label: name, shape } of shapes) {
      const w = ctx.measureText(name).width;
      if (w > shapeWidth(shape, p)) continue;
      const [nx, ny] = p.project(...shapeCentre(shape));
      /*
       * Clear of the circles, which are drawn over the names.
       *
       * An area's centroid is often where one of its circles lands
       * too, and "Kerewan" with a blue disc through the middle of it
       * is worse than no name at all. The name steps up and down
       * until it is clear, and is dropped if it never is.
       */
      const clear = (at: number): boolean =>
        !spots.some(
          (sp) =>
            Math.abs(sp.cx - nx) < sp.r + w / 2 + size * 0.2 &&
            Math.abs(sp.cy - at) < sp.r + size * 0.6,
        );
      const at = [0, -1.3, 1.3, -2.6, 2.6].map((k) => ny + k * size).find(clear);
      if (at === undefined) continue;
      ctx.fillText(name, nx, at);
      // A name just placed is something for the next one to avoid:
      // Kerewan and Mansa Konko both stepped down onto the same line.
      spots.push({ cx: nx, cy: at, r: Math.max(w, size) / 2 });
    }
  };

  const byKey = new Map(CONSTITUENCY_UNITS.map((u) => [u.key, u]));
  const spotsOf = (p: Projector, which: MapPoint[]): Spot[] =>
    which.flatMap((point) => {
      const unit = byKey.get(point.key);
      if (!unit) return [];
      const [cx, cy] = p.project(...shapeCentre(unit.shape));
      return [{ cx, cy, r: radiusOf(point.n) }];
    });

  const onCountry = points.filter((pt) => !inInset(pt.key));
  const urban = points.filter((pt) => inInset(pt.key));
  land(projector, spotsOf(projector, onCountry));

  /*
   * One circle, with its figure inside it and no name.
   *
   * Fifty-three names will not fit a country thirty miles across, and
   * the version that tried put them in a band underneath on leader
   * lines that crossed the whole map and still collided. The circle
   * says where and how much; which constituency it is, is on the list
   * under the map and in the exported table.
   */
  const bubble = (p: Projector, point: MapPoint, unit: MapUnit): void => {
    const [cx, cy] = p.project(...shapeCentre(unit.shape));
    const r = radiusOf(point.n);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = Math.max(1, size / 12);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${size * 0.8}px Arial, "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    if (r > size * 0.62) ctx.fillText(String(point.n), cx, cy);

  };

  // Biggest first, so a small circle lands on top of a large one
  // rather than inside it.
  const bySize = (a: MapPoint, b: MapPoint): number => b.n - a.n;
  for (const point of [...onCountry].sort(bySize)) {
    const unit = byKey.get(point.key);
    if (unit) bubble(projector, point, unit);
  }

  /*
   * The inset, and the box on the country saying where it is.
   *
   * Without the box a reader has a second map of somewhere and no way
   * of telling where.
   */
  const x0 = size * 0.6;
  const y0 = country + gap + insetTitle;
  const [bx1, by1] = projector.project(bminLon, bmaxLat);
  const [bx2, by2] = projector.project(bmaxLon, bminLat);
  ctx.strokeStyle = 'rgba(93, 107, 118, 0.85)';
  ctx.lineWidth = Math.max(1, size / 14);
  ctx.strokeRect(bx1, by1, bx2 - bx1, by2 - by1);
  ctx.beginPath();
  ctx.moveTo(bx1, by2);
  ctx.lineTo(x0, y0);
  ctx.moveTo(bx2, by2);
  ctx.lineTo(x0 + insetW, y0);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 ${size}px Arial, "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = '#252423';
  ctx.fillText('Greater Banjul', x0, y0 - size * 0.45);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, insetW, insetH);
  ctx.clip();
  const fitted = fitProjector(INSET_BOX, insetW, insetH, 2);
  const inset: Projector = {
    width: insetW,
    height: insetH,
    project: (lon, lat) => {
      const [px, py] = fitted.project(lon, lat);
      return [x0 + px, y0 + py];
    },
  };
  land(inset, spotsOf(inset, urban));
  for (const point of [...urban].sort(bySize)) {
    const unit = byKey.get(point.key);
    if (unit) bubble(inset, point, unit);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(93, 107, 118, 0.85)';
  ctx.lineWidth = Math.max(1, size / 14);
  ctx.strokeRect(x0, y0, insetW, insetH);

  /*
   * A key of two circles, the fewest reports and the most.
   *
   * Area carries the count, and nobody reads an area off a picture
   * without being shown what the sizes mean.
   */
  const keyY = y0 + insetH - size * 1.1;
  const fewest = Math.min(...points.map((p) => p.n), biggest);
  const steps = fewest === biggest ? [biggest] : [fewest, biggest];
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `${size * 0.9}px Arial, "Segoe UI", system-ui, sans-serif`;
  // Wide enough for two circles, their figures and the word after
  // them: "reports" was running off the right edge.
  let kx = width - size * 13;
  for (const n of steps) {
    const r = radiusOf(n);
    ctx.beginPath();
    ctx.arc(kx + r, keyY, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = Math.max(1, size / 12);
    ctx.stroke();
    ctx.fillStyle = '#252423';
    ctx.fillText(String(n), kx + r * 2 + size * 0.35, keyY);
    kx += r * 2 + size * 1.8;
  }
  ctx.fillStyle = '#5D6B76';
  ctx.fillText('reports', kx, keyY);

  const url = canvas.toDataURL('image/png');
  const binary = atob(url.slice(url.indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { data: bytes, width, height };
}
