import { describe, expect, it } from 'vitest';
import { CONTENT, LayoutError, PAD, SLIDE, columns, fitText, place } from './layout';

describe('slide geometry', () => {
  it('uses a genuine 13.33 x 7.5in widescreen canvas', () => {
    // pptxgenjs calls 10 x 5.63in "LAYOUT_16x9", which is what broke the
    // first deck. If this ever changes, the whole layout must be rechecked.
    expect(SLIDE.w).toBeCloseTo(13.333, 2);
    expect(SLIDE.h).toBe(7.5);
  });

  it('accepts a box inside the slide', () => {
    expect(() => place({ x: 0.5, y: 1, w: 6, h: 4 })).not.toThrow();
  });

  it('rejects a box running off the right edge', () => {
    expect(() => place({ x: 8, y: 1, w: 6, h: 4 }, 'wide thing')).toThrow(LayoutError);
  });

  it('rejects a box running off the bottom', () => {
    expect(() => place({ x: 1, y: 6, w: 4, h: 3 })).toThrow(LayoutError);
  });

  it('names the offending shape, so the failure is actionable', () => {
    expect(() => place({ x: 13, y: 1, w: 4, h: 1 }, 'findings table')).toThrow(/findings table/);
  });

  it('keeps every column inside the content area', () => {
    for (const n of [1, 2, 3, 4]) {
      const cols = columns(n);
      expect(cols).toHaveLength(n);
      expect(cols[0]!.x).toBeCloseTo(PAD.x, 5);
      const last = cols[n - 1]!;
      expect(last.x + last.w).toBeCloseTo(PAD.x + CONTENT.w, 5);
      for (const c of cols) expect(() => place({ ...c, y: PAD.top, h: 1 })).not.toThrow();
    }
  });
});

describe('fitText', () => {
  it('leaves short text at full size', () => {
    const r = fitText('C.1 Short question', 6, 2, 13);
    expect(r.fontSize).toBe(13);
    expect(r.text).not.toContain('…');
  });

  it('shrinks before it truncates', () => {
    // Long enough to need a smaller size, short enough to still fit once
    // shrunk, so no ellipsis should appear.
    const long = 'G.15 '.concat('a very long question about voting procedures '.repeat(5));
    const r = fitText(long, 6, 2, 13, 7);
    expect(r.fontSize).toBeLessThan(13);
    expect(r.text).not.toContain('…');
  });

  it('truncates with an ellipsis only once the minimum size is reached', () => {
    const huge = 'x'.repeat(4000);
    const r = fitText(huge, 3, 1, 13, 9);
    expect(r.fontSize).toBe(9);
    expect(r.text.endsWith('…')).toBe(true);
    expect(r.text.length).toBeLessThan(200);
  });
});
