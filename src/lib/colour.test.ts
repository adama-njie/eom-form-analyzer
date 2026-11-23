import { describe, expect, it } from 'vitest';
import { isInverted } from './analyse';
import { JUDGED, colourFor, fillsFor } from './pptx';
import { ACCENT, ACCENT_DEEP, CAT, NOT_APPLICABLE } from './theme';

describe('answer colours', () => {
  /*
   * The point of these is consistency, not prettiness. A briefing moves
   * through forty slides, and a reader who has learnt that light blue is Yes
   * on slide 6 must not meet an orange Yes on slide 7.
   */
  it('gives Yes and No the same two colours in every kind of chart', () => {
    const counts = [{ label: 'Yes' }, { label: 'No' }];
    const expected = [ACCENT, ACCENT_DEEP];
    expect(fillsFor(counts, { judged: true, perMark: true })).toEqual(expected);
    expect(fillsFor(counts, { judged: false, perMark: true })).toEqual(expected);
    expect(fillsFor(counts, { judged: false, perMark: false })).toEqual(expected);
  });

  it('does not change the palette with the polarity of the question', () => {
    // Both are flagged questions and the bad answer is the opposite one in
    // each, which the findings ranking still knows; the colours no longer
    // move with it.
    const yesIsBad = 'Did you see any voter being turned away?';
    const noIsBad = 'Does the layout sufficiently protect the secrecy of the vote?';
    expect(JUDGED.test(yesIsBad)).toBe(true);
    expect(JUDGED.test(noIsBad)).toBe(true);
    expect(isInverted(yesIsBad)).toBe(false);
    expect(isInverted(noIsBad)).toBe(true);
    expect(colourFor('Yes', 0)).toBe(colourFor('Yes', 3));
  });

  it('holds NA and DK apart from the substantive answers', () => {
    // Orange, not grey: on these questions NA is often the largest answer
    // on the chart, and a grey slice is the one thing in a briefing room
    // nobody can see.
    expect(colourFor('NA', 0)).toBe(NOT_APPLICABLE);
    expect(colourFor('DK', 1)).toBe(NOT_APPLICABLE);
    expect(colourFor('N/A', 2)).toBe(NOT_APPLICABLE);
    expect(NOT_APPLICABLE).not.toBe(ACCENT);
    expect(NOT_APPLICABLE).not.toBe(ACCENT_DEEP);
  });

  it('keeps Yes blue in a ring, where every slice is coloured', () => {
    const fills = fillsFor([{ label: 'Yes' }, { label: 'No' }, { label: 'NA' }], {
      judged: false,
      perMark: true,
    });
    expect(fills).toEqual([ACCENT, ACCENT_DEEP, NOT_APPLICABLE]);
  });
});

describe('chart fills', () => {
  const counts = [{ label: 'a' }, { label: 'b' }, { label: 'c' }];

  it('uses one colour for a plain count chart', () => {
    expect(fillsFor(counts, { judged: false, perMark: false })).toHaveLength(1);
  });

  it('marks NA out even on a plain count chart', () => {
    const fills = fillsFor([...counts, { label: 'NA' }], { judged: false, perMark: false });
    expect(fills).toEqual([ACCENT_DEEP, ACCENT_DEEP, ACCENT_DEEP, NOT_APPLICABLE]);
  });

  it('uses the categorical palette where marks must be told apart', () => {
    const fills = fillsFor(counts, { judged: false, perMark: true });
    expect(fills).toEqual([CAT[0], CAT[1], CAT[2]]);
  });

  it('spends colour on a scale even when the marks are a list', () => {
    const scale = ['Bad', 'Good'];
    const fills = fillsFor([{ label: 'Bad' }, { label: 'Good' }], {
      judged: false,
      scale,
      perMark: false,
    });
    expect(new Set(fills).size).toBe(2);
  });
});
