import { describe, expect, it } from 'vitest';
import { EU_BLUE, EU_GOLD, GM_BLUE, GM_GREEN, GM_RED, euFlag, gambiaFlag } from './flags';

describe('the flag of The Gambia', () => {
  const shapes = gambiaFlag(1, 1, 3);

  it('is five bands on a 2:3 flag', () => {
    expect(shapes).toHaveLength(5);
    const height = shapes.reduce((t, s) => t + s.h, 0);
    expect(height).toBeCloseTo(2, 6);
  });

  it('holds the 6:1:4:1:6 proportions', () => {
    const unit = 2 / 18;
    expect(shapes.map((s) => Math.round(s.h / unit))).toEqual([6, 1, 4, 1, 6]);
  });

  it('runs red, white, blue, white, green from the top', () => {
    expect(shapes.map((s) => s.fill)).toEqual([GM_RED, 'FFFFFF', GM_BLUE, 'FFFFFF', GM_GREEN]);
  });

  it('leaves no gap between the bands', () => {
    for (let i = 1; i < shapes.length; i += 1) {
      expect(shapes[i]!.y).toBeCloseTo(shapes[i - 1]!.y + shapes[i - 1]!.h, 6);
    }
  });
});

describe('the flag of the European Union', () => {
  const w = 3;
  const shapes = euFlag(0, 0, w);
  const stars = shapes.filter((s) => s.type === 'star5');

  it('is a blue field with twelve gold stars', () => {
    expect(shapes[0]!.fill).toBe(EU_BLUE);
    expect(stars).toHaveLength(12);
    expect(new Set(stars.map((s) => s.fill))).toEqual(new Set([EU_GOLD]));
  });

  it('sets them on a circle of a third of the height', () => {
    const h = (w * 2) / 3;
    const cx = w / 2;
    const cy = h / 2;
    for (const s of stars) {
      const dx = s.x + s.w / 2 - cx;
      const dy = s.y + s.h / 2 - cy;
      expect(Math.hypot(dx, dy)).toBeCloseTo(h / 3, 6);
    }
  });

  it('puts one star at the top', () => {
    const h = (w * 2) / 3;
    const top = stars.find((s) => Math.abs(s.x + s.w / 2 - w / 2) < 1e-9);
    expect(top).toBeDefined();
    expect(top!.y + top!.h / 2).toBeCloseTo(h / 2 - h / 3, 6);
  });

  it('makes each star a ninth of the height', () => {
    const h = (w * 2) / 3;
    expect(stars[0]!.w).toBeCloseTo(h / 9, 6);
  });
});
