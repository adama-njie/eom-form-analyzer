/**
 * Render a chart to a PNG, for embedding in the Word report.
 *
 * Word has no native chart type that can be written without an embedded
 * spreadsheet part, so report charts are images. The deck keeps native
 * PowerPoint charts, which stay editable; the report trades that for a
 * document that opens cleanly everywhere.
 *
 * Drawn on a canvas at 2x and scaled down, so they stay sharp in print.
 */

import type { Count, GroupMean } from './analyse';
import { meanLabel } from './analyse';

const SCALE = 2;
// Arial, as the mission's reference report is set, and a size that survives
// being printed and then photographed off a wall.
const FONT = '14px Arial, "Segoe UI", system-ui, sans-serif';
const FONT_BOLD = '600 14px Arial, "Segoe UI", system-ui, sans-serif';
const FONT_SMALL = '12px Arial, "Segoe UI", system-ui, sans-serif';

export interface ChartImage {
  data: Uint8Array;
  width: number;
  height: number;
}

function canvasOf(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable in this browser.');
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = 'middle';
  ctx.font = FONT;
  return [canvas, ctx];
}

/**
 * Canvas to PNG bytes, synchronously.
 *
 * Deliberately `toDataURL` rather than `toBlob`. `toBlob` is asynchronous,
 * and browsers throttle or defer its callback in a background tab, so a
 * report built while the window is minimised would stall partway. A report
 * of 140 charts must not depend on the window staying in front.
 */
function toBytes(canvas: HTMLCanvasElement): Uint8Array {
  const url = canvas.toDataURL('image/png');
  const base64 = url.slice(url.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

/**
 * Horizontal bars with the count and share at the end of each. Used for
 * every question type, because one consistent shape reads faster down a
 * long report than a mix of pies and columns.
 */
/**
 * A percentage question's averages, one bar per group.
 *
 * The track is 0 to 100 and the bar is the average itself, not its share
 * of the largest: these are percentages, and scaling them to each other
 * would make 30% and 95% look alike on two charts side by side.
 */
export function meanBarsPng(
  rows: GroupMean[],
  colour = '#12239E',
  width = 560,
): ChartImage {
  const rowH = 26;
  const padTop = 8;
  const padBottom = 8;
  const height = padTop + padBottom + rows.length * rowH;
  const [canvas, ctx] = canvasOf(width, height);

  const widest = rows.length ? Math.max(...rows.map((r) => ctx.measureText(r.label).width)) : 0;
  const labelW = Math.min(190, widest + 12);
  const valueW = 92;
  const trackX = labelW + 10;
  const trackW = width - trackX - valueW;

  rows.forEach((row, i) => {
    const y = padTop + i * rowH + rowH / 2;

    ctx.fillStyle = '#16202A';
    ctx.textAlign = 'left';
    ctx.fillText(truncate(ctx, row.label, labelW - 4), 0, y);

    ctx.fillStyle = '#ECEFF2';
    ctx.fillRect(trackX, y - 8, trackW, 16);

    const w = Math.max(2, (Math.max(0, Math.min(100, row.mean)) / 100) * trackW);
    ctx.fillStyle = colour;
    ctx.fillRect(trackX, y - 8, w, 16);

    ctx.fillStyle = '#16202A';
    ctx.fillText(`${meanLabel(row.mean)}%`, trackX + trackW + 10, y);
    ctx.fillStyle = '#5D6B76';
    ctx.fillText(`of ${row.n}`, trackX + trackW + 52, y);
  });

  return { data: toBytes(canvas), width, height };
}

export function barChartPng(
  counts: Count[],
  colours: string[],
  width = 560,
): ChartImage {
  const rows = counts.slice(0, 12);
  const rowH = 26;
  const padTop = 8;
  const padBottom = 8;
  const height = padTop + padBottom + rows.length * rowH;
  const [canvas, ctx] = canvasOf(width, height);

  const widest = rows.length ? Math.max(...rows.map((r) => ctx.measureText(r.label).width)) : 0;
  const labelW = Math.min(190, widest + 12);
  const valueW = 92;
  const trackX = labelW + 10;
  const trackW = width - trackX - valueW;
  const max = Math.max(...rows.map((r) => r.n), 1);

  rows.forEach((row, i) => {
    const y = padTop + i * rowH + rowH / 2;

    ctx.fillStyle = '#16202A';
    ctx.textAlign = 'left';
    ctx.fillText(truncate(ctx, row.label, labelW - 4), 0, y);

    ctx.fillStyle = '#ECEFF2';
    ctx.fillRect(trackX, y - 8, trackW, 16);

    const w = Math.max(2, (row.n / max) * trackW);
    ctx.fillStyle = colours[i] ?? '#12239E';
    ctx.fillRect(trackX, y - 8, w, 16);

    ctx.fillStyle = '#16202A';
    ctx.fillText(`${row.n}`, trackX + trackW + 10, y);
    ctx.fillStyle = '#5D6B76';
    ctx.fillText(`${row.pct.toFixed(row.pct < 10 ? 1 : 0)}%`, trackX + trackW + 48, y);
  });

  return { data: toBytes(canvas), width, height };
}

/**
 * Stacked 100% bars, one per area plus an overall row. This is the view
 * that answers "is it worse somewhere", which is the question a mission
 * report has to address.
 */
export function stackedByAreaPng(
  rows: { label: string; counts: Count[]; emphasis?: boolean }[],
  order: string[],
  colours: Record<string, string>,
  width = 560,
): ChartImage {
  const rowH = 24;
  const legendH = 26;
  const padTop = 8;
  const height = padTop + rows.length * rowH + legendH;
  const [canvas, ctx] = canvasOf(width, height);

  const labelW = 104;
  const countW = 34;
  const trackX = labelW + 8;
  const trackW = width - trackX - countW;

  rows.forEach((row, i) => {
    const y = padTop + i * rowH + rowH / 2;
    const total = row.counts.reduce((s, c) => s + c.n, 0);

    ctx.fillStyle = '#16202A';
    ctx.font = row.emphasis ? FONT_BOLD : FONT;
    ctx.textAlign = 'left';
    ctx.fillText(truncate(ctx, row.label, labelW - 6), 0, y);
    ctx.font = FONT;

    if (total === 0) {
      ctx.fillStyle = '#9AA6AE';
      ctx.fillText('no reports', trackX + 4, y);
      return;
    }

    let x = trackX;
    for (const label of order) {
      const c = row.counts.find((v) => v.label === label);
      if (!c || c.n === 0) continue;
      const w = (c.n / total) * trackW;
      ctx.fillStyle = colours[label] ?? '#D0D0D0';
      ctx.fillRect(x, y - 9, w, 18);
      const pct = (c.n / total) * 100;
      if (pct >= 12) {
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.font = FONT_BOLD;
        ctx.fillText(`${Math.round(pct)}%`, x + w / 2, y);
        ctx.font = FONT;
        ctx.textAlign = 'left';
      }
      x += w;
    }

    ctx.fillStyle = '#5D6B76';
    ctx.textAlign = 'right';
    ctx.fillText(String(total), width, y);
    ctx.textAlign = 'left';
  });

  // Legend
  let lx = trackX;
  const ly = padTop + rows.length * rowH + legendH / 2;
  ctx.font = FONT_SMALL;
  for (const label of order) {
    ctx.fillStyle = colours[label] ?? '#D0D0D0';
    ctx.fillRect(lx, ly - 5, 10, 10);
    ctx.fillStyle = '#5D6B76';
    ctx.fillText(label, lx + 14, ly);
    lx += 14 + ctx.measureText(label).width + 14;
    if (lx > width - 60) break;
  }

  return { data: toBytes(canvas), width, height };
}

/* ------------------------------------------------------------------ */
/* Word clouds                                                         */
/* ------------------------------------------------------------------ */

/**
 * A word cloud, laid out on an Archimedean spiral.
 *
 * The commonest word is placed at the centre and each next word spirals
 * outward from the middle until it finds a spot that touches nothing already
 * placed. This is how every word cloud is built; there is no cleverer
 * approach that is worth a dependency, and a dependency is not available
 * anyway because the whole tool has to inline into one offline HTML file.
 *
 * Size is the square root of frequency, not frequency itself. Area is what a
 * reader judges, and area goes as the square of the type size, so scaling the
 * size linearly makes a word used twice as often look four times as important.
 */
export interface LaidWord {
  word: string;
  size: number;
  x: number;
  y: number;
  /** Index in the input, which is what picks the colour. */
  i: number;
}

/**
 * Where each word goes, without touching a canvas.
 *
 * Separated from the drawing so the layout can be tested in Node, where
 * there is no canvas: `measure` is the only thing that needs one.
 */
export function layoutCloud(
  words: { word: string; n: number }[],
  width: number,
  height: number,
  measure: (text: string, size: number) => number,
): LaidWord[] {
  if (words.length === 0) return [];

  const max = words[0]!.n;
  const min = words[words.length - 1]!.n;
  const span = Math.max(1, max - min);
  const weightOf = (n: number) => Math.sqrt((n - min) / span);

  // Big enough to read from the back of the room, small enough that sixty
  // words have somewhere to go.
  let biggest = Math.min(width / 7, height / 3.4);
  const smallest = Math.max(11, biggest / 5);

  /*
   * The largest type that still lets every entry fit across the canvas.
   *
   * A cloud of single words never needed this. A cloud of names does:
   * "Police Intervention Unit" at the size its count earns is four times
   * wider than the slide, so the spiral never found a spot for it and the
   * commonest answer to the question was silently left off its own slide.
   * Capping the top size keeps the whole set in proportion, which shrinking
   * the one offending entry would not.
   *
   * The allowance is four fifths of the canvas rather than all of it. An
   * entry as wide as the canvas has one position it can occupy, and the
   * spiral has to hit it exactly or give up - which is how the phrase went
   * missing even after it had been made to fit.
   */
  const room = (width - 8) * 0.8;
  for (const { word, n } of words) {
    const weight = weightOf(n);
    const fits = room / (measure(word, 100) / 100 + 0.22);
    if (weight > 0.01 && smallest + weight * (biggest - smallest) > fits) {
      biggest = Math.max(smallest, Math.min(biggest, (fits - smallest) / weight + smallest));
    }
  }

  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const hits = (box: { x: number; y: number; w: number; h: number }) =>
    placed.some(
      (p) =>
        box.x < p.x + p.w && box.x + box.w > p.x && box.y < p.y + p.h && box.y + box.h > p.y,
    );

  // Positions are worked out first and drawn second, so the finished cloud
  // can be centred on what it actually filled. Packing is lumpy, and a cloud
  // that happens to grow upwards sits with a band of white under it and
  // looks like a mistake.
  const laid: LaidWord[] = [];

  words.forEach(({ word, n }, i) => {
    const wanted = Math.round(smallest + weightOf(n) * (biggest - smallest));
    // Last resort for a long entry that is rare enough to have escaped the
    // cap above: let it be smaller than its count earns rather than lose it.
    const size = Math.max(
      8,
      Math.min(wanted, Math.floor(room / (measure(word, 100) / 100 + 0.22))),
    );
    const w = measure(word, size) + size * 0.22;
    const h = size * 1.1;

    // Spiral out from the middle until the word fits somewhere.
    let found: { x: number; y: number } | null = null;
    for (let t = 0; t < 2200; t += 1) {
      const angle = t * 0.32;
      const radius = 2.2 * angle;
      const x = width / 2 + radius * Math.cos(angle) - w / 2;
      // Squashed vertically, because the canvas is wider than it is tall and
      // a circular spiral wastes the sides.
      const y = height / 2 + radius * 0.46 * Math.sin(angle) - h / 2;
      if (x < 2 || y < 2 || x + w > width - 2 || y + h > height - 2) continue;
      if (hits({ x, y, w, h })) continue;
      found = { x, y };
      break;
    }
    if (!found) return;

    placed.push({ x: found.x, y: found.y, w, h });
    laid.push({ word, size, x: found.x, y: found.y, i });
  });

  if (placed.length === 0) return [];

  // Centre the cloud on what it actually filled.
  const left = Math.min(...placed.map((p) => p.x));
  const right = Math.max(...placed.map((p) => p.x + p.w));
  const topEdge = Math.min(...placed.map((p) => p.y));
  const bottom = Math.max(...placed.map((p) => p.y + p.h));
  const dx = (width - (right - left)) / 2 - left;
  const dy = (height - (bottom - topEdge)) / 2 - topEdge;

  return laid.map((l) => ({ ...l, x: l.x + dx, y: l.y + dy }));
}

/**
 * A word cloud, laid out on an Archimedean spiral.
 *
 * The commonest word is placed at the centre and each next word spirals
 * outward from the middle until it finds a spot that touches nothing already
 * placed. This is how every word cloud is built; there is no cleverer
 * approach that is worth a dependency, and a dependency is not available
 * anyway because the whole tool has to inline into one offline HTML file.
 *
 * Size is the square root of frequency, not frequency itself. Area is what a
 * reader judges, and area goes as the square of the type size, so scaling the
 * size linearly makes a word used twice as often look four times as important.
 */
export function wordCloudPng(
  words: { word: string; n: number }[],
  colours: string[],
  width = 900,
  height = 460,
): ChartImage {
  const [canvas, ctx] = canvasOf(width, height);
  const cloudFont = (size: number) => `700 ${size}px Arial, "Segoe UI", system-ui, sans-serif`;
  const laid = layoutCloud(words, width, height, (text, size) => {
    ctx.font = cloudFont(size);
    return ctx.measureText(text).width;
  });

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (const l of laid) {
    ctx.font = cloudFont(l.size);
    ctx.fillStyle = colours[l.i % colours.length]!;
    ctx.fillText(l.word, l.x + l.size * 0.11, l.y + l.size * 1.1 * 0.08);
  }

  ctx.textAlign = 'start';
  ctx.textBaseline = 'middle';
  return { data: toBytes(canvas), width, height };
}
