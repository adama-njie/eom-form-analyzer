import { NON_ANSWERS } from './schema';

/**
 * The deck's design system, taken from the mission's own reference report.
 *
 * `Form B sample.pdf` is the Power BI report the data team already briefs
 * from, so the deck this tool exports should be indistinguishable from it on
 * a screen in a briefing room. The values below were measured out of that
 * PDF rather than chosen: the fill colours are the Power BI default theme it
 * was built with, the text colours and the type sizes are what its own pages
 * use.
 *
 * Measured from the reference, at its 13.83 x 8in page:
 *
 *   fonts     ArialMT throughout, 1122 of 1173 text runs
 *   sizes     29.2pt chart titles, 16pt category labels, 14.4pt data labels
 *   text      #252423 titles, #605E5C axes and categories, #FFFFFF on fills
 *   fills     #12239E #118DFF #E66C37 #6B007B #E645AB, #D0D0D0 for NA
 *   chrome    no gridlines, no axis lines, no value axis, no tick marks
 *
 * The chrome line is the important one. Every chart in the reference states
 * its values on the marks themselves, which makes an axis, its gridlines and
 * its tick marks redundant ink, and the deck reads much faster without them.
 */

/** ArialMT in the reference. Arial is what PowerPoint will resolve it to. */
export const FONT = 'Arial';

/** Titles and headings. */
export const INK = '252423';
/**
 * Axis labels, category labels, captions, anything secondary.
 *
 * Measured off the campaign deck, which is the newer of the two references.
 * The earlier Form B report used 605E5C; the difference is invisible, and one
 * value is worth more than being right about both.
 */
export const MUTED = '6C6966';
/** Labels sitting on top of a filled mark. */
export const ON_FILL = 'FFFFFF';
/** Tile and panel fill. */
export const PANEL = 'F3F2F1';
/** Hairlines and table borders. */
export const RULE = 'E1DFDD';
/** The accent used for the header rule and single-series charts. */
export const ACCENT = '118DFF';
/** The deeper blue, for the second series and the title slide. */
export const ACCENT_DEEP = '12239E';

/**
 * Categorical fills, in the Power BI default theme's own order, which is the
 * order the reference's charts step through.
 */
export const CAT = [
  '118DFF',
  '12239E',
  'E66C37',
  '6B007B',
  'E645AB',
  '744EC2',
  'D9B300',
  'D64550',
];

/** A place that returned nothing, on a map or in a table. */
export const GREY = 'D0D0D0';

/**
 * Not applicable, don't know, not known.
 *
 * A dark grey. It was a pale grey once and that was wrong - on a
 * projector a pale grey slice next to two blues is the one thing in the
 * room nobody can see, and on these questions NA is often the largest
 * answer there is. It was then the deck's orange, which is worse: the
 * closing form asks seven questions on Never / Sometimes / Mostly /
 * Always and "Sometimes" is the second point of a four-point scale,
 * which is that same orange, so a legend named two different answers in
 * one colour. Absence is what grey means, this one is dark enough to
 * carry white text and to be seen across a room, and no scale point and
 * no categorical fill is grey.
 */
export const NOT_APPLICABLE = '707070';

/**
 * A rating scale, worst to best, as the reference colours its own.
 *
 * Bad is purple and Very good is the deep blue, which is the Power BI
 * convention the reference follows, and deliberately not a red-to-green ramp:
 * roughly one reader in twelve cannot separate those two ends.
 */
export const SCALE = ['6B007B', 'E66C37', 'D9B300', '118DFF', '12239E'];

/**
 * A count, fewest to most: one blue, pale to deep.
 *
 * "E.1 How many polling staff members are present" was drawn in the
 * categorical palette, which put 1 in the deep blue and 2 in the orange
 * a flagged answer wears - colour saying something about a quantity
 * that the quantity did not say. A count is ordered data and takes an
 * ordered ramp, and it is one hue because the tool does not know which
 * end of a count is the good one: a station with every member of staff
 * present is a full team, and a station with four unauthorised persons
 * in it is not the same news. Which end is which is `moreIsWorse`'s
 * decision, read off the mission's own problem vocabulary, and the
 * scale handed in is held worst first.
 *
 * Every step carries white text, including the warm ones, which is why
 * they run dark to mid rather than through the pale orange a diverging
 * ramp usually has in the middle: a chart's data labels are one colour
 * for the whole chart - PowerPoint allows no other - and 9% in white on
 * a pale column is the one thing on the page nobody can read. The
 * warm end is redder than `NOT_APPLICABLE`, so a legend naming both a
 * band and NA does not name them in the same orange.
 */
export const COUNT = ['8C2D0C', 'B8431A', 'E05A24', '118DFF', '12239E'];

/**
 * The widest spread this tool will read as a count of things in a
 * polling station - staff, agents, observers - rather than as a
 * quantity of a different kind, or a typo. `bandsFor` gathers a tail
 * below it and `rampColour` shades by value below it.
 */
export const COUNT_MAX = 20;

/**
 * Where one answer sits on its scale, as a colour.
 *
 * The deck and the dashboard both ask this, so it is answered once. A
 * scale of words is a judgement and steps through `SCALE` by position.
 * A scale of numbers is a count and is placed by its value instead -
 * four of five staff present is four fifths of the way along, not two
 * thirds of the way through a list of three answers - along `COUNT`,
 * whose warm end is whichever end of the count is the bad one.
 */
export function rampColour(label: string, scale: string[]): string | null {
  if (scale.length < 2) return null;
  const i = scale.indexOf(label);
  if (i < 0) return null;
  const numbers = scale.map((s) => parseFloat(s));
  if (numbers.every((n) => Number.isFinite(n))) {
    const lo = Math.min(...numbers);
    const hi = Math.max(...numbers);
    /*
     * By value, but only where the values are a count of things in a
     * polling station. One station reported 678 citizen observers, and
     * against a range of 678 every other answer - 0, 1, 2, 3, 4, 5 -
     * came out at the same end of the ramp in the same colour. A spread
     * that wide is a typo or a different kind of number, and position
     * is the only ordering left that says anything.
     */
    const along =
      hi - lo > COUNT_MAX
        ? i / (scale.length - 1)
        : hi === lo
          ? 0
          : (numbers[i]! - lo) / (hi - lo);
    // Worst first, so a scale running downwards is one where more is worse.
    const descending = numbers[0]! > numbers[numbers.length - 1]!;
    const worst = descending && hi - lo <= COUNT_MAX ? 1 - along : along;
    return COUNT[Math.round(worst * (COUNT.length - 1))]!;
  }
  return SCALE[Math.round(i * ((SCALE.length - 1) / (scale.length - 1)))]!;
}

/** An answer that indicates a problem, so it stands out from the rest. */
export const FLAG = 'E66C37';
/** An answer that indicates no problem. */
export const CLEAR = '118DFF';

/**
 * The cover's mission header, in the blue the reference sets it in.
 */
export const HEADER_BLUE = '3C6CB4';

/**
 * The smallest type anywhere on a slide.
 *
 * The deck is read from the back of a briefing room, and an 11pt axis label
 * that is perfectly legible on the laptop it was built on is not legible
 * there. Where this floor and the available space conflict, the space gives
 * way: a chart with too many categories to label at 18pt is given a slide of
 * its own, and failing that PowerPoint thins the labels out, which is a
 * better outcome than a row of text nobody can read.
 */
export const MIN = 18;

/**
 * The smallest type on a chart.
 *
 * Four points under the floor the rest of the slide keeps to, and only
 * inside a chart, where a name competes with the marks for the room: a
 * category name of two words at 18pt took the width the columns needed,
 * and at 16pt seven area names still crowded the page they are the
 * point of.
 */
export const CHART_MIN = 14;

/**
 * A value written on the mark itself.
 *
 * Two points under the names around it. A data label has only the width
 * of the mark it is written on, and the mark is as wide as the share it
 * draws: at 18pt "100%" did not fit the column of a 100% stacked chart
 * and PowerPoint drew nothing at all, and at 14pt PowerPoint broke "11%"
 * over two lines and set the per cent sign on its own. It is in white on
 * a filled mark, which is the highest contrast on the slide, so it is
 * still read from the back of the room - and a figure that is drawn is
 * worth more than one set two points larger and dropped.
 */
export const LABEL_MIN = 12;

/**
 * Type sizes, in points.
 *
 * Taken from the mission's own reference reports and scaled for this deck's
 * 13.33in slide against their 20.5in page, then raised to `MIN` wherever that
 * scaling landed below it.
 */
export const TYPE = {
  /** Slide heading. */
  heading: 26,
  /** The line under a heading. */
  sub: MIN,
  /** A question's own title. */
  chartTitle: 24,
  /** A chart's title within a question's slide, such as the by-area one. */
  chartTitleSmall: 20,
  /** Values printed on or beside the marks. */
  dataLabel: LABEL_MIN,
  /** Category names along the axis. */
  category: CHART_MIN,
  legend: CHART_MIN,
  /** A tile's big number. */
  figure: 40,
  /** A tile's caption. */
  figureLabel: MIN,
  body: MIN,
  caption: MIN,
  table: MIN,

  /* Cover. */
  coverTitle: 28,
  coverSubtitle: 20,
  coverStamp: MIN,
  coverMission: MIN,
  coverElection: MIN,
  coverDate: MIN,
} as const;

/**
 * The chart chrome the reference removes.
 *
 * Spread this into every chart. Values are stated on the marks, so the axis
 * that would otherwise restate them, its gridlines and its tick marks are all
 * turned off.
 */
export const BARE = {
  valGridLine: { style: 'none' as const },
  catGridLine: { style: 'none' as const },
  valAxisHidden: true,
  valAxisLineShow: false,
  catAxisLineShow: false,
  valAxisMajorTickMark: 'none' as const,
  catAxisMajorTickMark: 'none' as const,
  catAxisLabelColor: MUTED,
  catAxisLabelFontFace: FONT,
  valAxisLabelColor: MUTED,
  valAxisLabelFontFace: FONT,
  dataLabelFontFace: FONT,
  titleFontFace: FONT,
  legendFontFace: FONT,
  legendColor: MUTED,
  titleColor: INK,
} as const;

/**
 * The colour an answer has whatever chart it is on.
 *
 * Yes, No and the non-answers are the same colour on every page of the
 * deck, so a reader never has to check a legend for them.
 */
export function fixedColour(label: string): string | null {
  if (label === 'Yes') return ACCENT_DEEP;
  if (label === 'No') return ACCENT;
  if (NON_ANSWERS.has(label)) return NOT_APPLICABLE;
  return null;
}

/**
 * One fill per answer, for a chart that colours each mark.
 *
 * The categorical palette is stepped through for whatever is left after
 * the fixed answers and the scale, and it skips the colours those have
 * already taken. "H.1 Did the total reconcile" is answered Yes, No and
 * N/K; Yes is the deep blue and No the light one, and the third answer,
 * being the second in the list, was handed the second categorical fill,
 * which is the same deep blue as Yes. A legend naming two answers in
 * one colour is worse than no legend.
 */
export function answerFills(labels: string[], scale?: string[]): string[] {
  const taken = new Set(labels.map(fixedColour).filter((c): c is string => c !== null));
  let next = 0;
  return labels.map((label) => {
    const fixed = fixedColour(label);
    if (fixed) return fixed;
    if (scale) {
      const ramp = rampColour(label, scale);
      if (ramp) return ramp;
    }
    while (next < CAT.length && taken.has(CAT[next]!)) next += 1;
    const colour = CAT[next % CAT.length]!;
    taken.add(colour);
    next += 1;
    return colour;
  });
}
