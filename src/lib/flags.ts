/**
 * The two flags on the cover, drawn rather than embedded.
 *
 * The reference deck puts the national flag and the EU flag either side of the
 * mission header, so this deck does too. They are built from pptxgenjs shapes
 * instead of images for three reasons: the whole tool has to inline into one
 * HTML file that opens offline, so every embedded PNG is weight carried by
 * every user forever; a drawn flag is sharp at any projector resolution; and
 * the proportions stay correct rather than depending on whichever file someone
 * pasted in.
 *
 * Both are drawn to their official specifications.
 */

import type PptxGenJS from 'pptxgenjs';

export interface FlagShape {
  type: 'rect' | 'star5';
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  /** Degrees, for the EU stars. */
  rotate?: number;
}

/** Official colours. */
export const GM_RED = 'CE1126';
export const GM_BLUE = '0C1C8C';
export const GM_GREEN = '3A7728';
export const EU_BLUE = '003399';
export const EU_GOLD = 'FFCC00';

/**
 * The flag of The Gambia: red, blue and green bands separated by two white
 * fringes, in the ratio 6:1:4:1:6 over a 2:3 flag.
 *
 * The fringes are drawn as white rectangles rather than left as gaps, so the
 * flag still reads correctly on a slide whose background someone has changed.
 */
export function gambiaFlag(x: number, y: number, w: number): FlagShape[] {
  const h = w * (2 / 3);
  const unit = h / 18;
  const bands: [string, number][] = [
    [GM_RED, 6],
    ['FFFFFF', 1],
    [GM_BLUE, 4],
    ['FFFFFF', 1],
    [GM_GREEN, 6],
  ];
  const out: FlagShape[] = [];
  let top = y;
  for (const [fill, units] of bands) {
    const bh = unit * units;
    out.push({ type: 'rect', x, y: top, w, h: bh, fill });
    top += bh;
  }
  return out;
}

/**
 * The flag of the European Union: twelve gold stars in a circle on blue.
 *
 * To specification: the circle's radius is a third of the flag's height, the
 * stars are a ninth of the height across, one points straight up, and they sit
 * at clock positions. Twelve is fixed and has never referred to a number of
 * member states.
 */
export function euFlag(x: number, y: number, w: number): FlagShape[] {
  const h = w * (2 / 3);
  const out: FlagShape[] = [{ type: 'rect', x, y, w, h, fill: EU_BLUE }];

  const cx = x + w / 2;
  const cy = y + h / 2;
  const radius = h / 3;
  const star = h / 9;

  for (let i = 0; i < 12; i += 1) {
    // Clock positions, starting at twelve and going clockwise.
    const angle = (i / 12) * 2 * Math.PI;
    out.push({
      type: 'star5',
      x: cx + radius * Math.sin(angle) - star / 2,
      y: cy - radius * Math.cos(angle) - star / 2,
      w: star,
      h: star,
      fill: EU_GOLD,
    });
  }
  return out;
}

/** Put a drawn flag on a slide. */
export function drawFlag(pptx: PptxGenJS, slide: PptxGenJS.Slide, shapes: FlagShape[]): void {
  for (const s of shapes) {
    slide.addShape(s.type === 'star5' ? pptx.ShapeType.star5 : pptx.ShapeType.rect, {
      x: s.x,
      y: s.y,
      w: s.w,
      h: s.h,
      fill: { color: s.fill },
      line: { type: 'none' },
    });
  }
}
