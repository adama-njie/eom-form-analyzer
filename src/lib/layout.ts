/**
 * Slide geometry for the PowerPoint export.
 *
 * This file exists because of a bug worth not repeating. pptxgenjs calls its
 * default widescreen layout `LAYOUT_16x9`, which is 10 x 5.63 inches, not the
 * 13.33 x 7.5 that "16:9 widescreen" normally means in PowerPoint. The deck
 * was laid out for the larger canvas, so half of every slide fell off the
 * edge.
 *
 * Two defences: the size is declared once here, and `place` refuses to return
 * a box that does not fit on the slide. A deck that would overflow now fails
 * at build time rather than looking wrong in the room.
 */

export const SLIDE = { w: 13.333, h: 7.5 } as const;

export const PAD = {
  /** Side margin. */
  x: 0.45,
  /**
   * Top of the content area.
   *
   * There is no running header any more. The reference deck has none, and
   * repeating the deck's own title on all forty pages was chrome that pushed
   * every chart down for no reader's benefit.
   */
  top: 0.4,
  /** Bottom limit. */
  bottom: 7.1,
  /** Gap between columns and between stacked blocks. */
  gap: 0.3,
} as const;

export const CONTENT = {
  w: SLIDE.w - PAD.x * 2,
  h: PAD.bottom - PAD.top,
} as const;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class LayoutError extends Error {}

/** A box, checked against the slide before it is used. */
export function place(box: Box, what = 'shape'): Box {
  const right = box.x + box.w;
  const bottom = box.y + box.h;
  const slack = 0.01;
  if (box.x < -slack || box.y < -slack) {
    throw new LayoutError(`${what} starts off-slide at (${box.x}, ${box.y})`);
  }
  if (right > SLIDE.w + slack) {
    throw new LayoutError(
      `${what} runs past the right edge: ${right.toFixed(2)}in of ${SLIDE.w}in`,
    );
  }
  if (bottom > SLIDE.h + slack) {
    throw new LayoutError(
      `${what} runs past the bottom edge: ${bottom.toFixed(2)}in of ${SLIDE.h}in`,
    );
  }
  return box;
}

/** The width one of `n` equal columns gets. */
export function columnWidth(n: number, gap = PAD.gap): number {
  return (CONTENT.w - gap * (n - 1)) / n;
}

/** Split the content width into `n` equal columns with the standard gap. */
export function columns(n: number, gap = PAD.gap): { x: number; w: number }[] {
  const w = (CONTENT.w - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({ x: PAD.x + i * (w + gap), w }));
}

/** Characters that fit on one line of the given width at the given size. */
export function charsPerLine(widthInches: number, pt: number): number {
  // Rough but stable: at 1pt, a character is about 0.5pt wide on average.
  return Math.floor((widthInches * 72) / (pt * 0.5));
}

/** Lines the text will take at that width and size. */
export function linesNeeded(text: string, widthInches: number, pt: number): number {
  return Math.max(1, Math.ceil(text.length / charsPerLine(widthInches, pt)));
}

/** Whether the text fits in `lines` at that size without being cut. */
export function fitsAt(text: string, widthInches: number, lines: number, pt: number): boolean {
  return linesNeeded(text, widthInches, pt) <= lines;
}

/**
 * Fit a string to a width at a given font size, shrinking before truncating.
 * Question labels vary from four words to forty, and a title that silently
 * overlaps the chart below it is worse than one set a point smaller.
 */
export function fitText(
  text: string,
  widthInches: number,
  lines: number,
  maxPt: number,
  minPt = 9,
): { text: string; fontSize: number } {
  for (let pt = maxPt; pt >= minPt; pt -= 1) {
    if (text.length <= charsPerLine(widthInches, pt) * lines) return { text, fontSize: pt };
  }
  const limit = charsPerLine(widthInches, minPt) * lines - 1;
  return { text: `${text.slice(0, Math.max(0, limit))}…`, fontSize: minPt };
}
