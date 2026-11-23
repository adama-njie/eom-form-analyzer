import { describe, expect, it } from 'vitest';
import { CONTENT, columnWidth, fitsAt, linesNeeded } from './layout';
import { slideLabelPt } from './mapImage';
import { MIN, TYPE } from './theme';
import { describeFinding, describeFindingBody } from './narrative';
import type { Finding } from './analyse';

const finding = {
  question: { code: 'C.7', label: 'Any indication that people are pressured to attend?' },
  label: 'Yes',
  n: 6,
  pct: 22,
  hotspots: [{ group: 'North Bank', n: 3, total: 5, pct: 60 }],
} as unknown as Finding;

describe('the type floor', () => {
  it('sets nothing below 18pt', () => {
    const sizes = Object.entries(TYPE).filter(([k]) => k !== 'figure');
    for (const [name, pt] of sizes) {
      expect(pt, `${name} is ${pt}pt`).toBeGreaterThanOrEqual(MIN);
    }
  });

  it('sets no title below 24pt', () => {
    for (const name of ['heading', 'chartTitle', 'coverTitle'] as const) {
      expect(TYPE[name], name).toBeGreaterThanOrEqual(24);
    }
  });

  it('keeps map labels at the floor once the slide has scaled them', () => {
    // The deck draws a 1400px map across the full content width.
    expect(slideLabelPt(1400, 'lga', CONTENT.w)).toBeGreaterThanOrEqual(MIN - 0.5);
    expect(slideLabelPt(1400, 'district', CONTENT.w)).toBeGreaterThanOrEqual(15);
  });

  it('gives a long question the full width rather than shrinking its title', () => {
    const long = 'C.3 Did you observe any particular problem in the vicinity of the polling station?';
    expect(fitsAt(long, columnWidth(2), 3, TYPE.chartTitle)).toBe(true);
    const veryLong = `${long} ${long}`;
    expect(fitsAt(veryLong, columnWidth(2), 3, TYPE.chartTitle)).toBe(false);
    expect(fitsAt(veryLong, CONTENT.w, 3, TYPE.chartTitle)).toBe(true);
  });

  it('counts the lines a title will take', () => {
    expect(linesNeeded('short', CONTENT.w, 24)).toBe(1);
  });
});

describe('a finding on a slide whose title is the question', () => {
  it('does not repeat the question', () => {
    const body = describeFindingBody(finding);
    expect(body).not.toContain('C.7');
    expect(body).not.toContain('pressured');
    expect(body).toContain('6 reports');
    expect(body).toContain('North Bank');
  });

  it('still names the question where it is used in a list', () => {
    expect(describeFinding(finding)).toContain('C.7');
    expect(describeFinding(finding)).toContain(describeFindingBody(finding));
  });
});
