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
 * Not applicable and don't know.
 *
 * Orange, not the grey this used to be. Grey reads as absence, which is
 * nearly right, but on a projector a grey slice next to two blues is the one
 * thing in the room nobody can see - and on these questions NA is often the
 * largest answer there is.
 */
export const NOT_APPLICABLE = 'E66C37';

/**
 * A rating scale, worst to best, as the reference colours its own.
 *
 * Bad is purple and Very good is the deep blue, which is the Power BI
 * convention the reference follows, and deliberately not a red-to-green ramp:
 * roughly one reader in twelve cannot separate those two ends.
 */
export const SCALE = ['6B007B', 'E66C37', 'D9B300', '118DFF', '12239E'];

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
