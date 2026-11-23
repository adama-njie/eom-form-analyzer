import { describe, expect, it } from 'vitest';
import { histogram } from './analyse';

describe('numeric binning', () => {
  it('gives each value its own band when there are few', () => {
    const bins = histogram([0, 1, 1, 2, 3, 3, 3]);
    expect(bins.map((b) => b.label)).toEqual(['0', '1', '2', '3']);
    expect(bins.map((b) => b.n)).toEqual([1, 2, 1, 3]);
  });

  it('keeps bands in numeric order, not frequency order', () => {
    const bins = histogram([5, 5, 5, 1]);
    expect(bins.map((b) => b.label)).toEqual(['1', '5']);
  });

  it('chooses a round width once there are many distinct values', () => {
    // 0..99: a width a person would choose, not 99/6 = 16.5.
    const bins = histogram(Array.from({ length: 100 }, (_, i) => i));
    expect(bins[0]!.label).toBe('0 to 19');
    expect(bins).toHaveLength(5);
    expect(bins.reduce((a, b) => a + b.n, 0)).toBe(100);
  });

  it('places every value in exactly one band', () => {
    const values = [3, 17, 42, 88, 101, 250, 7, 19, 64, 77, 90, 150, 199, 200, 201];
    const bins = histogram(values);
    expect(bins.reduce((a, b) => a + b.n, 0)).toBe(values.length);
    expect(bins.every((b) => b.pct >= 0 && b.pct <= 100)).toBe(true);
  });

  it('starts the first band on a round multiple of the width, not on the minimum', () => {
    // Minimum 23, width 50, so the first band is 0 to 49 and not 23 to 72.
    const bins = histogram([23, 45, 67, 89, 112, 134, 156, 178, 190, 199]);
    expect(bins[0]!.label).toBe('0 to 49');
    expect(bins[0]!.n).toBe(2);
  });

  it('puts the maximum in the last band', () => {
    const bins = histogram([1, 2, 3, 4, 5, 6, 7, 8, 9, 1000]);
    expect(bins[bins.length - 1]!.n).toBe(1);
  });
});
