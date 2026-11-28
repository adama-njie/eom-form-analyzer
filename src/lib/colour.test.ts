import { describe, expect, it } from 'vitest';
import { isInverted } from './analyse';
import { JUDGED, colourFor, fillsFor, mapShade } from './pptx';
import { ACCENT, ACCENT_DEEP, CAT, FLAG, NOT_APPLICABLE } from './theme';

describe('answer colours', () => {
  /*
   * The point of these is consistency, not prettiness. A briefing moves
   * through forty slides, and a reader who has learnt that dark blue is Yes
   * on slide 6 must not meet an orange Yes on slide 7.
   */
  it('gives Yes and No the same two colours in every kind of chart', () => {
    const counts = [{ label: 'Yes' }, { label: 'No' }];
    const expected = [ACCENT_DEEP, ACCENT];
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

  it('holds NA, DK and N/K apart from the substantive answers', () => {
    expect(colourFor('NA', 0)).toBe(NOT_APPLICABLE);
    expect(colourFor('DK', 1)).toBe(NOT_APPLICABLE);
    expect(colourFor('N/A', 2)).toBe(NOT_APPLICABLE);
    expect(colourFor('N/K', 1)).toBe(NOT_APPLICABLE);
    expect(NOT_APPLICABLE).not.toBe(ACCENT);
    expect(NOT_APPLICABLE).not.toBe(ACCENT_DEEP);
  });

  it('gives it a colour no scale point and no categorical fill uses', () => {
    /*
     * The closing form asks seven questions on Never / Sometimes /
     * Mostly / Always and offers N/A on each. "Sometimes" is the second
     * point of a four-point scale, which was the same orange NA wore,
     * so a legend named two different answers in one colour.
     */
    const fourPoint = ['Never', 'Sometimes', 'Mostly', 'Always'];
    for (const point of fourPoint) {
      expect(colourFor(point, 0, fourPoint)).not.toBe(NOT_APPLICABLE);
    }
    expect(CAT).not.toContain(NOT_APPLICABLE);
  });

  it('never hands a third answer the colour Yes or No already has', () => {
    // "Did the total reconcile" is answered Yes, No or N/K, and the
    // third answer, being second in the list, was handed the second
    // categorical fill - which is the deep blue of Yes.
    const fills = fillsFor([{ label: 'Yes' }, { label: 'Other' }, { label: 'No' }], {
      judged: false,
      perMark: true,
    });
    expect(new Set(fills).size).toBe(3);
    expect(fills[1]).not.toBe(ACCENT_DEEP);
    expect(fills[1]).not.toBe(ACCENT);
  });

  it('keeps Yes blue in a ring, where every slice is coloured', () => {
    const fills = fillsFor([{ label: 'Yes' }, { label: 'No' }, { label: 'NA' }], {
      judged: false,
      perMark: true,
    });
    expect(fills).toEqual([ACCENT_DEEP, ACCENT, NOT_APPLICABLE]);
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

describe('a shaded map', () => {
  it('is blue for a rate and orange for the worse end of a rating', () => {
    /*
     * One colour per kind of map, not per question. A flagged question
     * used to be shaded orange and an unflagged one blue, so two maps
     * of the same shape differed for a reason no reader could see; the
     * map of a rating is always of the answers nobody wants to see, and
     * says so in the line under its title.
     */
    expect(mapShade(false)).toBe(ACCENT_DEEP);
    expect(mapShade(true)).toBe(FLAG);
  });
});
