import PptxGenJS from 'pptxgenjs';
import {
  analyse,
  coverage,
  displayCounts,
  isInverted,
  meanLabel,
  rateByPlace,
  ratingOf,
  ratingQuestions,
  reportsByPlace,
  scoreLabel,
  sectionOverviews,
  sharesAcross,
  isTeamQuestion,
  stationTypeQuestion,
  stationsObserved,
  teamQuestion,
  teamReports,
  textValues,
  turnoutByHour,
  type Dataset,
  type GroupMean,
  type Percentage,
  type Rating,
  type SectionOverview,
  type SharePanel,
  type Shares,
  type TeamPanel,
} from './analyse';
import { wordCloudPng } from './chartImage';
import { wordFrequencies, type WordCount } from './text';
import { CONTENT, PAD, SLIDE, columns, fitText, linesNeeded, place, wrapText } from './layout';
import {
  ACCENT,
  ACCENT_DEEP,
  BARE,
  CAT,
  FONT,
  HEADER_BLUE,
  INK,
  MUTED,
  NOT_APPLICABLE,
  ON_FILL,
  PANEL,
  SCALE,
  TYPE,
} from './theme';
import { drawFlag, euFlag, gambiaFlag } from './flags';
import { AREA_WORDS, type Division } from './gambia';
import { mapPng, pieMapPng } from './mapImage';
import {
  isAreaQuestion,
  isConstituencyQuestion,
  mapKindFor,
  needsCountsPage,
  needsOwnSlide,
  selectedQuestions,
  slideBreakdown,
  exportFileName,
  type ExportSelection,
} from './selection';
import { NON_ANSWERS, splitBase, type Question } from './schema';

/**
 * Export the analysis as a PowerPoint deck.
 *
 * Charts are native PowerPoint charts, not pictures, so the briefing team can
 * restyle them, fix a label or drop a series without coming back for a
 * re-export.
 *
 * All geometry goes through `place`, which refuses a box that does not fit
 * the slide. See layout.ts for the bug that made that necessary.
 */

/**
 * The colour of one answer.
 *
 * Yes is dark blue, No is light blue and NA is orange, on every chart, in
 * every question, everywhere in the deck. They used to depend on whether
 * the question was one where Yes is the bad answer, so "Was security
 * provided for the candidate?" drew Yes in orange while "Were media
 * present?" drew it in light blue, and a reader moving between two slides
 * had to go back to the legend to be sure which was which. Which answer is
 * the worrying one is the findings table's job; the palette's job is to be
 * predictable.
 */
/**
 * Ask PowerPoint for an English number format, so a decimal is a full stop.
 *
 * A chart's data labels are written by PowerPoint as the file is opened,
 * using the regional settings of the machine it is opened on, so a mean of
 * 3.31 is drawn as "3,31" on a German-configured laptop. The locale prefix
 * pins the format to English; where a reader's copy ignores it, the
 * separator is a Windows setting rather than anything in this file.
 */
const DECIMAL = '[$-409]';

/** Answers whose colour is fixed, whatever the chart or the question. */
function hasOwnColour(label: string): boolean {
  return label === 'Yes' || label === 'No' || NON_ANSWERS.has(label);
}

export function colourFor(label: string, index: number, scale?: string[]): string {
  if (label === 'Yes') return ACCENT_DEEP;
  if (label === 'No') return ACCENT;
  if (NON_ANSWERS.has(label)) return NOT_APPLICABLE;
  if (scale && scale.length > 1) {
    const i = scale.indexOf(label);
    if (i >= 0) return SCALE[Math.round(i * ((SCALE.length - 1) / (scale.length - 1)))]!;
  }
  return CAT[index % CAT.length]!;
}

/**
 * The fills for one chart's marks.
 *
 * A bar chart of plain counts gets one colour, not eight. Giving each bar its
 * own hue makes colour look like it means something when it only repeats the
 * label already printed beside the bar, and the reference report colours its
 * own count charts in a single blue for exactly that reason. Colour is spent
 * only where it carries something: a rating scale, an answer that flags a
 * problem, or the slices of a ring, which cannot be told apart otherwise.
 */
export function fillsFor(
  counts: { label: string }[],
  opts: { judged: boolean; scale?: string[]; perMark: boolean },
): string[] {
  if (opts.judged || opts.scale || opts.perMark) {
    return counts.map((c, i) => colourFor(c.label, i, opts.scale));
  }
  // One colour down a plain count chart - unless an answer has a colour of
  // its own, which Yes, No and NA always do.
  if (counts.some((c) => hasOwnColour(c.label))) {
    return counts.map((c, i) => (hasOwnColour(c.label) ? colourFor(c.label, i) : ACCENT_DEEP));
  }

  return [ACCENT_DEEP];
}

export const JUDGED =
  /(problem|unauthorised|interfer|overcrowd|unrest|tension|campaign|missing|turned away|without|influence|marble|proxy|compelled|complaint|able to observe|accessible|adequate|protect|plain view|secrecy|confidence|transparen|conduct|performance|understanding|empty and sealed|bell)/i;

export interface PptxOptions {
  /** What the user chose in the export dialogue. */
  selection: ExportSelection;
  /**
   * Maps are rasterised on a canvas, so they need a browser. Defaults to
   * on; the Node tests turn them off rather than stubbing a canvas.
   */
  includeMaps?: boolean;
}

export async function exportPptx(
  dataset: Dataset,
  filter: boolean[] | undefined,
  options: PptxOptions,
): Promise<void> {
  const pptx = buildDeck(dataset, filter, options);
  await pptx.writeFile({ fileName: exportFileName(options.selection, 'pptx') });
}

/** Build the deck without writing it, so it can be inspected in tests. */
export function buildDeck(
  dataset: Dataset,
  filter: boolean[] | undefined,
  options: PptxOptions,
): PptxGenJS {
  const pptx = new PptxGenJS();
  // 13.33 x 7.5in. Explicitly not LAYOUT_16x9, which pptxgenjs defines as
  // 10 x 5.63in, roughly half the area a 16:9 deck normally has.
  pptx.defineLayout({ name: 'EOM', width: SLIDE.w, height: SLIDE.h });
  pptx.layout = 'EOM';
  const sel = options.selection;
  pptx.author = 'Observer Form Analyser';
  pptx.title = sel.title;

  /*
   * A plain white page, and nothing else.
   *
   * There was a running header carrying the deck's title and the line
   * "Observer reports, not official results", and a slide number. The
   * reference deck has none of the three: every page is the question and its
   * charts. Repeating the title forty times tells a reader nothing they did
   * not know on page one, and the disclaimer now sits on the cover and on the
   * closing page, where it is read once rather than skipped forty times.
   */
  pptx.defineSlideMaster({
    title: 'BASE',
    background: { color: 'FFFFFF' },
    objects: [],
  });

  const cov = coverage(dataset, filter);

  const canDrawMaps =
    sel.maps && (options.includeMaps ?? true) && dataset.geo && typeof document !== 'undefined';

  /*
   * The deck reads in the order the form is laid out.
   *
   * An overview first - what was observed, how the day went, where the
   * reports came from - and then section A, section B and so on to the
   * end, with each question's map directly after the question it maps.
   * The ranked findings used to come before any of it, so a reader met
   * C.7 and F.6 on page four and section A on page eight; the ranking is
   * on screen and in the Word report, which are read rather than
   * presented. The overall assessments are section J, so they now sit
   * where section J sits, at the end.
   */
  const questions = selectedQuestions(dataset, sel);
  // The map of where the reports came from belongs with the question that
  // asks where they came from, so it moves next to it when that question
  // is in the deck and stays in the overview when it is not.
  const areaAsked = questions.some((q) => isAreaQuestion(dataset, q));

  /*
   * The turnout curve reads with the day, not before it.
   *
   * It is drawn from the reading each observer took as they left, so it
   * is an answer to section I rather than to the overview; the mission
   * reads it after the conditions at the station - section C - which is
   * where it now sits. A deck with no section C in it has nowhere to put
   * it but the front, where it was.
   */
  const turnoutPage =
    sel.coverage && turnoutByHour(dataset, filter) !== null
      ? () => addTurnoutSlide(pptx, dataset, filter)
      : undefined;
  const afterSection = questions.some((q) => q.section === TURNOUT_AFTER)
    ? turnoutPage
    : undefined;

  addTitleSlide(pptx, sel, dataset.division);
  if (sel.coverage) addCoverageSlide(pptx, dataset, cov, filter);
  if (turnoutPage && !afterSection) turnoutPage();
  if (canDrawMaps && !areaAsked) addMapSlide(pptx, dataset, filter);

  addQuestionSlides(pptx, dataset, questions, filter, canDrawMaps, afterSection);

  if (sel.ratings) addRatingsSlide(pptx, dataset, filter);

  return pptx;
}

/* ------------------------------------------------------------------ */

function addTitleSlide(pptx: PptxGenJS, sel: ExportSelection, division: Division): void {
  const s = pptx.addSlide();
  s.background = { color: 'FFFFFF' };

  // Mission header: national flag left, EU flag right, the mission's name
  // between them over a rule, as the reference cover sets it.
  const flagW = 1.45;
  const flagY = 0.38;
  drawFlag(pptx, s, gambiaFlag(PAD.x + 1.0, flagY, flagW));
  drawFlag(pptx, s, euFlag(SLIDE.w - PAD.x - 1.0 - flagW, flagY, flagW));

  const headX = PAD.x + 1.0 + flagW + 0.45;
  const headW = SLIDE.w - headX * 2;

  // Two lines of room. At 18pt the mission's full name does not fit the gap
  // between the flags on one, and it is not allowed to be set smaller.
  s.addText('EUROPEAN UNION ELECTION OBSERVATION MISSION', {
    ...place({ x: headX, y: 0.22, w: headW, h: 0.62 }, 'mission name'),
    fontSize: TYPE.coverMission, bold: true, color: HEADER_BLUE,
    fontFace: FONT, align: 'center', valign: 'middle',
  });
  s.addShape(pptx.ShapeType.rect, {
    ...place({ x: headX, y: 0.86, w: headW, h: 0.012 }, 'header rule'),
    fill: { color: HEADER_BLUE },
  });
  s.addText(sel.election, {
    ...place({ x: headX, y: 0.92, w: headW, h: 0.36 }, 'election'),
    fontSize: TYPE.coverElection, color: HEADER_BLUE,
    fontFace: FONT, align: 'center', valign: 'middle',
  });
  if (sel.electionDate) {
    s.addText(sel.electionDate, {
      ...place({ x: headX, y: 1.34, w: headW, h: 0.34 }, 'election date'),
      fontSize: TYPE.coverDate, color: HEADER_BLUE,
      fontFace: FONT, align: 'center', valign: 'middle',
    });
  }

  s.addText(sel.title, {
    ...place({ x: 0.9, y: 2.95, w: SLIDE.w - 1.8, h: 0.9 }, 'title'),
    fontSize: TYPE.coverTitle, bold: true, color: INK,
    fontFace: FONT, align: 'center', valign: 'middle',
  });
  if (sel.preparedBy) {
    s.addText(`Prepared by ${sel.preparedBy}`, {
      ...place({ x: 0.9, y: 4.0, w: SLIDE.w - 1.8, h: 0.5 }, 'prepared by'),
      fontSize: TYPE.coverSubtitle, color: INK,
      fontFace: FONT, align: 'center', valign: 'middle',
    });
  }

  /*
   * Which stretch of the calendar this deck covers.
   *
   * The dashboard can be narrowed to the campaign period, and the deck
   * follows it. A deck that quietly covered two weeks of a three-week file
   * would be unanswerable six months later, so when the period is anything
   * other than the whole file the cover says so, in full.
   */
  if (sel.period) {
    s.addText(sel.period, {
      ...place({ x: 0.9, y: 4.6, w: SLIDE.w - 1.8, h: 0.6 }, 'period'),
      fontSize: TYPE.coverSubtitle, color: INK,
      fontFace: FONT, align: 'center', valign: 'middle',
    });
  }

  /*
   * Which division of the country the deck counts.
   *
   * A deck of seven regions and a deck of eight Local Government Areas
   * both show a place called Janjanbureh, and in one of them it is twice
   * the size of the other. Side by side in a briefing that is a question
   * nobody should have to ask, so the cover answers it.
   */
  if (division === 'region') {
    s.addText(
      'Areas are the seven regions; Central River is reported as Janjanbureh.',
      {
        ...place({ x: 0.9, y: 5.25, w: SLIDE.w - 1.8, h: 0.4 }, 'division note'),
        fontSize: TYPE.coverStamp, color: MUTED,
        fontFace: FONT, align: 'center', valign: 'middle',
      },
    );
  }

  s.addText('Updated', {
    ...place({ x: 0.9, y: SLIDE.h - 1.25, w: SLIDE.w - 1.8, h: 0.35 }, 'updated label'),
    fontSize: TYPE.coverStamp, color: INK,
    fontFace: FONT, align: 'center', valign: 'middle',
  });
  s.addText(new Date().toLocaleDateString('en-GB'), {
    ...place({ x: 0.9, y: SLIDE.h - 0.9, w: SLIDE.w - 1.8, h: 0.35 }, 'updated date'),
    fontSize: TYPE.coverStamp, color: INK,
    fontFace: FONT, align: 'center', valign: 'middle',
  });
}

function heading(slide: PptxGenJS.Slide, text: string, sub?: string): number {
  // Two lines, because a heading that is a whole question will not fit on
  // one at 26pt, and it is not allowed to shrink below the 24pt that every
  // title on every slide keeps to.
  const fitted = fitText(text, CONTENT.w, 2, TYPE.heading, TYPE.chartTitle);
  const h = linesNeeded(fitted.text, CONTENT.w, fitted.fontSize) > 1 ? 0.92 : 0.55;
  slide.addText(fitted.text, {
    ...place({ x: PAD.x, y: 0.42, w: CONTENT.w, h }, 'heading'),
    fontSize: fitted.fontSize, color: INK, fontFace: FONT, valign: 'top',
  });
  if (!sub) return 0.42 + h + 0.14;
  slide.addText(sub, {
    ...place({ x: PAD.x, y: 0.42 + h, w: CONTENT.w, h: 0.36 }, 'subheading'),
    fontSize: TYPE.sub, color: MUTED, fontFace: FONT, valign: 'middle',
  });
  return 0.42 + h + 0.46;
}

function addCoverageSlide(
  pptx: PptxGenJS,
  dataset: Dataset,
  cov: ReturnType<typeof coverage>,
  filter: boolean[] | undefined,
): void {
  const s = pptx.addSlide({ masterName: 'BASE' });
  const top = heading(s, 'Coverage', 'What was observed, and where.');

  /*
   * The figures a briefing opens with, as the reference's own front page
   * carries them: how much was observed, how much of the country that is,
   * and how the day was rated.
   *
   * The share of the register in observed areas used to be among them. With
   * reports from all eight LGAs that reads 100%, which says only what the
   * figure beside it already said; how much of the country was actually
   * reached is the constituency count.
   */
  const stations = stationsObserved(dataset, filter);
  const headline = ratingQuestions(dataset)
    .map((q) => ratingOf(dataset, q, filter))
    .find((r): r is Rating => r !== null);

  /*
   * Reports, or the stations they came from.
   *
   * On a form filled in once per polling station the count of reports is
   * the count of stations visited, and that is the figure a briefing
   * opens on, so the tile says which it is. Where two observers filed
   * from one station the two differ and both are shown: the reports are
   * the evidence, the stations are the coverage.
   */
  const oneEach = stations !== null && stations === cov.reports;
  const tiles: [string, string][] = [
    [oneEach ? 'Polling stations visited' : 'Reports', String(cov.reports)],
    [
      dataset.geo ? AREA_WORDS[dataset.division].tile : 'Districts',
      `${cov.groupsCovered} / ${cov.groupsTotal}`,
    ],
  ];
  if (cov.constituenciesTotal > 0) {
    tiles.push(['Constituencies', `${cov.constituenciesCovered} / ${cov.constituenciesTotal}`]);
  }
  /*
   * Polling stations, where that is a different figure from reports.
   *
   * On a form filled in once per station the two are the same number,
   * and two tiles saying 100 teach a reader nothing twice. Where a
   * station was visited by two observers they differ, and then both are
   * worth the room.
   */
  if (stations !== null && !oneEach) {
    tiles.push(['Polling stations visited', String(stations)]);
  }
  if (headline) {
    // The question's own words for the good end of its scale, so the figure
    // is not left to mean whatever a reader takes "positive" to mean.
    tiles.push([
      `${headline.question.code} ${headline.goodLabels.join(' or ').toLowerCase()}`,
      `${Math.round(headline.goodPct)}%`,
    ]);
    /*
     * And the mean of the same question, out of its own scale.
     *
     * The share in the better half says how many reports were content;
     * the mean says how content, and a day rated Good on every report
     * and a day rated Very good on every report are both 100% in the
     * tile beside this one. Two decimals, because the difference
     * between 3.44 and 3.4 is the difference the figure is there for.
     */
    tiles.push([
      `${headline.question.code} mean score`,
      `${scoreLabel(headline.mean)} / ${headline.points}`,
    ]);
  } else {
    /*
     * How many teams filed, where the day has no rating.
     *
     * The headline rating is what a briefing opens on, and the count of
     * teams is not: the deployment's size is the mission's own figure,
     * known before a report was filed, and the chart lower down this slide
     * already names every team that filed. Where the form scores nothing
     * there is no rating to put here and the count keeps the row full.
     */
    tiles.push(['Teams', String(cov.byTeam.length)]);
  }

  /*
   * Four to a row, and a second row after that.
   *
   * Six tiles across one row leaves 1.4in of text in each, and "Polling
   * stations" set at the 18pt floor does not fit it: the first build of
   * this slide printed "Constitue..." and "Polling st..." and left the
   * reader to guess. Nothing on a slide is allowed to be cut, so the row
   * wraps instead.
   */
  const perRow = tiles.length <= 4 ? tiles.length : Math.ceil(tiles.length / 2);
  const tileRows = Math.ceil(tiles.length / perRow);
  const tileCols = columns(perRow);
  const tileH = tileRows > 1 ? 1.05 : 1.25;
  const figureH = tileH - 0.44;
  tiles.forEach(([label, value], i) => {
    const col = tileCols[i % perRow]!;
    const y = top + Math.floor(i / perRow) * (tileH + 0.14);
    s.addShape(pptx.ShapeType.rect, {
      ...place({ x: col.x, y, w: col.w, h: tileH }, `tile ${i}`),
      fill: { color: PANEL }, line: { color: PANEL },
    });
    // Caption above the figure, as the reference's own KPI cards set them.
    s.addText(label, {
      x: col.x + 0.22, y: y + 0.1, w: col.w - 0.44, h: 0.3,
      fontSize: TYPE.figureLabel, color: MUTED, fontFace: FONT,
    });
    s.addText(value, {
      x: col.x + 0.22, y: y + 0.4, w: col.w - 0.44, h: figureH,
      fontSize: TYPE.figure, color: INK, fontFace: FONT,
    });
  });

  const chartTop = top + tileRows * tileH + (tileRows - 1) * 0.14 + PAD.gap;
  const chartH = PAD.bottom - chartTop;

  // Most-observed at the top, as the reference orders its own.
  const areaRows = topDown(
    cov.byGroup.filter((g) => g.reports > 0).sort((a, b) => b.reports - a.reports),
  );
  const teamRows = topDown([...cov.byTeam].sort((a, b) => b.reports - a.reports));

  /*
   * What kind of place was observed, where the form asks.
   *
   * The reference's front page carries the same split - rural against
   * urban, permanent against temporary - because a deployment that saw only
   * one kind of station is a different deployment from one that saw both,
   * and nothing else on this slide would say so.
   */
  const typeQ = stationTypeQuestion(dataset);
  const typeRows = typeQ
    ? topDown(
        analyse(dataset, typeQ, filter).total.filter((c) => !NON_ANSWERS.has(c.label)),
      )
    : [];

  const charts: {
    title: string;
    labels: string[];
    values: number[];
    /** One colour for a bar chart, one per slice for a ring. */
    colours: string[];
    ring?: boolean;
  }[] = [];
  if (areaRows.length > 0) {
    charts.push({
      title: dataset.geo
        ? `Reports by ${AREA_WORDS[dataset.division].one}`
        : 'Reports by district',
      labels: areaRows.map((g) => g.label),
      values: areaRows.map((g) => g.reports),
      colours: [ACCENT_DEEP],
    });
  }
  if (teamRows.length > 0) {
    charts.push({
      title: 'Reports by team',
      labels: teamRows.map((t) => t.team),
      values: teamRows.map((t) => t.reports),
      colours: [ACCENT],
    });
  }
  if (typeRows.length > 1 && typeQ) {
    /*
     * A ring, not bars. Two or three kinds of station are a split of one
     * whole rather than three quantities to compare, and the reference's
     * own front page draws its station type the same way. Both figures
     * are on it: the count answers how many were seen, the share answers
     * what kind of deployment it was.
     */
    charts.push({
      title: `${typeQ.code} ${typeQ.label}`.trim(),
      labels: typeRows.map((c) => c.label),
      values: typeRows.map((c) => c.n),
      colours: typeRows.map((c, i) => colourFor(c.label, i)),
      ring: true,
    });
  }
  if (charts.length === 0) return;

  const cols = columns(charts.length);
  charts.forEach((c, i) => {
    const col = cols[i]!;
    const box = place(
      { x: col.x, y: chartTop, w: col.w, h: chartH },
      `coverage chart ${i}`,
    );
    if (c.ring) {
      s.addChart(
        pptx.ChartType.doughnut,
        [{ name: 'Reports', labels: c.labels, values: c.values }],
        {
          ...box,
          ...BARE,
          chartColors: c.colours,
          holeSize: 55,
          showValue: true,
          showPercent: true,
          dataLabelColor: ON_FILL,
          dataLabelFontSize: TYPE.dataLabel,
          showLegend: true,
          legendPos: 'b',
          legendFontSize: TYPE.legend,
          showTitle: true,
          titleFontSize: TYPE.chartTitleSmall,
          title: fitText(c.title, col.w, 2, TYPE.chartTitleSmall, TYPE.chartTitleSmall).text,
        },
      );
      return;
    }
    s.addChart(
      pptx.ChartType.bar,
      [{ name: 'Reports', labels: c.labels, values: c.values }],
      {
        ...box,
        ...BARE,
        barDir: 'bar', chartColors: c.colours,
        showValue: true, dataLabelPosition: 'outEnd',
        dataLabelColor: MUTED, dataLabelFontSize: TYPE.dataLabel,
        catAxisLabelFontSize: TYPE.category,
        showLegend: false, showTitle: true, titleFontSize: TYPE.chartTitleSmall,
        // Two lines, because PowerPoint wraps a chart title itself and
        // cutting it at one line printed "Reports by Local Government...".
        title: fitText(c.title, col.w, 2, TYPE.chartTitleSmall, TYPE.chartTitleSmall).text,
      },
    );
  });
}

/**
 * How far voting had got, through the day.
 *
 * The one page a polling-day deck can carry about the day as a whole, and
 * the reference's own section D. Every report takes two readings of how many
 * voters had voted - on arrival and on departure - against that station's
 * own list, so the reports together draw the curve.
 *
 * A line, not bars: the thing being read off it is the slope, and hours with
 * no reading must leave a gap rather than a bar of zero.
 */
function addTurnoutSlide(
  pptx: PptxGenJS,
  dataset: Dataset,
  filter: boolean[] | undefined,
): void {
  const t = turnoutByHour(dataset, filter);
  if (!t || t.points.length < 2) return;

  const s = pptx.addSlide({ masterName: 'BASE' });
  // The slide carries the curve and the base it rests on, and not the
  // arithmetic: how the mean is worked out is in the README and in
  // CLAUDE.md, where it can be read rather than presented.
  const top = heading(
    s,
    'Turnout through the day',
    `Mean share of each station's list that had voted, from ${t.readings} readings.`,
  );

  s.addChart(
    pptx.ChartType.line,
    [{
      name: 'Turnout',
      labels: t.points.map((p) => p.label),
      values: t.points.map((p) => Math.round(p.mean)),
    }],
    {
      ...place({ x: PAD.x, y: top, w: CONTENT.w, h: PAD.bottom - top }, 'turnout chart'),
      ...BARE,
      chartColors: [ACCENT],
      lineSize: 4,
      lineDataSymbolSize: 9,
      showValue: true,
      dataLabelPosition: 't',
      // Whole percentages. A tenth of a point says nothing here, and a
      // decimal on a chart label is printed with whatever decimal
      // separator the reader's Windows is set to.
      dataLabelFormatCode: '0"%"',
      dataLabelColor: MUTED,
      dataLabelFontSize: TYPE.dataLabel,
      catAxisLabelFontSize: TYPE.category,
      // From zero, not from the lowest reading: a curve left to scale
      // itself would show a morning rush that never happened.
      valAxisMinVal: 0,
      showLegend: false,
    },
  );
}

/**
 * Where the reports came from.
 *
 * The Gambia is roughly five times wider than it is tall, so each map gets
 * a slide of its own at full width rather than being squeezed into a
 * column.
 */
function addMapSlide(
  pptx: PptxGenJS,
  dataset: Dataset,
  filter: boolean[] | undefined,
): void {
  /*
   * Title only. A map of eight shaded areas, each with its name and its
   * number written on it, does not need a line of explanation above it and
   * another below; the one thing those lines carried that the picture did
   * not - that hatching means no reports - is now a key on the map itself.
   *
   * There was a second map here, of constituencies drawn on district
   * boundaries. It went: the two divisions do not line up, so eleven
   * constituencies - the urban ones, where most of the reports come from -
   * were missing from it, and a map whose blank half has to be explained
   * in a footnote is not doing the job of a map. Coverage by constituency
   * is a table, which has none of that trouble.
   */
  const s = pptx.addSlide({ masterName: 'BASE' });
  const top = heading(s, `Reports by ${AREA_WORDS[dataset.division].one}`);
  const img = mapPng(
    reportsByPlace(dataset, filter),
    '',
    ACCENT_DEEP,
    1400,
    dataset.division,
  );
  const w = CONTENT.w;
  const h = (w / img.width) * img.height;
  s.addImage({
    data: `data:image/png;base64,${toBase64(img.data)}`,
    ...place({ x: PAD.x, y: top, w, h }, 'area map'),
  });
}

/**
 * A yes/no question, shaded across the country.
 *
 * Every binary question gets one, not only the ranked findings: a rate per
 * area is what a two-answer question has to say about the country, and
 * pies of two slices are the one thing a pie map cannot draw. Which answer
 * is shaded is the polarity `isInverted` knows - No on "Is the station
 * accessible?", Yes on "Was there unrest?" - and a question with no known
 * polarity is shaded on Yes in the ordinary blue rather than in the colour
 * the deck uses for a problem.
 */
function addRateMapSlide(
  pptx: PptxGenJS,
  dataset: Dataset,
  filter: boolean[] | undefined,
  planned: Planned,
): void {
  const { q, b } = planned;
  if (!dataset.geo || q.kind !== 'binary') return;
  if (Object.keys(b.byArea).length < 3) return;
  const inverted = isInverted(q.label);
  const label = inverted ? 'No' : 'Yes';
  const hit = b.total.find((c) => c.label === label);
  if (!hit || hit.n === 0) return;

  const s = pptx.addSlide({ masterName: 'BASE' });
  // The question is the title. It used to be the subtitle under "C.7 by
  // LGA", and then the sentence underneath the map opened by stating it a
  // second time, so the slide asked the same question twice and spent two
  // lines doing it.
  const top = heading(
    s,
    `${q.code} ${q.label}`.trim(),
    `Reports answering ${label}, as a share of those that answered.`,
  );
  /*
   * Shaded in the deck's blue, whatever the question asks.
   *
   * A flagged question used to be shaded in the orange the deck spends on
   * a problem, so two maps of the same shape - one of a question with a
   * keyword in it, one without - were different colours for a reason no
   * reader could see. The ramp already says which areas are high; the
   * colour only has to be the same one every time.
   */
  const img = mapPng(
    rateByPlace(dataset, q, label, filter),
    '%',
    ACCENT_DEEP,
    1400,
    dataset.division,
  );
  const w = CONTENT.w;
  const h = (w / img.width) * img.height;
  if (top + h > PAD.bottom) return;
  s.addImage({
    data: `data:image/png;base64,${toBase64(img.data)}`,
    ...place({ x: PAD.x, y: top, w, h }, 'rate map'),
  });
}

/** Canvas bytes to base64, for pptxgenjs image data URIs. */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function addRatingsSlide(
  pptx: PptxGenJS,
  dataset: Dataset,
  filter: boolean[] | undefined,
): void {
  // Every question the form scores, found by its scale rather than by its
  // section letter. See `ratingQuestions`.
  const scored = ratingQuestions(dataset)
    .map((q) => ({ q, b: analyse(dataset, q, filter) }))
    .filter((r) => r.b.meanScore !== undefined);
  if (scored.length === 0) return;

  // The axis runs to the top of the longest scale, so a four-point scale is
  // not drawn against a five-point one and read as a worse day than it was.
  const points = Math.max(...scored.map((r) => r.q.scale?.length ?? 5));

  const s = pptx.addSlide({ masterName: 'BASE' });
  const top = heading(
    s,
    'Overall assessments',
    `Mean of each rating question, out of ${points}.`,
  );
  s.addChart(
    pptx.ChartType.bar,
    [{
      name: 'Mean score',
      labels: topDown(scored).map(
        (r) => wrapText(`${r.q.code} ${r.q.label}`, 5.4, 2, TYPE.category),
      ),
      values: topDown(scored).map((r) => Number(r.b.meanScore!.toFixed(1))),
    }],
    {
      ...place({ x: PAD.x, y: top, w: CONTENT.w, h: PAD.bottom - top }, 'ratings chart'),
      ...BARE,
      barDir: 'bar', chartColors: [ACCENT_DEEP],
      showValue: true, dataLabelPosition: 'outEnd',
      dataLabelColor: MUTED, dataLabelFontSize: TYPE.dataLabel,
      // Without an explicit format PowerPoint inherits the cell's General
      // format and prints a mean of 3.5 as "3", which is the one number on
      // this slide where the decimal is the whole point. One place, as
      // `scoreLabel` writes it everywhere else.
      // The locale prefix asks for a full stop: a chart label is otherwise
      // written with whatever decimal separator the reader's Windows is
      // set to, and these decks are read in several of them.
      dataLabelFormatCode: `${DECIMAL}0.0`,
      catAxisLabelFontSize: TYPE.category, showLegend: false,
      valAxisMinVal: 0, valAxisMaxVal: points,
    },
  );
}

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Question slides                                                     */
/* ------------------------------------------------------------------ */

/**
 * Reverse a horizontal bar chart's data so it reads top to bottom.
 *
 * PowerPoint draws the first category of a bar chart at the BOTTOM of the
 * axis, so data in the order it should be read comes out upside down: a
 * chart sorted commonest-first displayed rarest-first, and a rating scale
 * ran from "Very good" at the bottom to "Very bad" at the top. Every
 * horizontal bar chart therefore hands PowerPoint its categories reversed,
 * and only here, so the ordering decided in `analyse` stays the ordering a
 * reader sees. Column charts are unaffected: they run left to right in data
 * order, which is why a time question is drawn as columns.
 */
function topDown<T>(items: T[]): T[] {
  return [...items].reverse();
}

/** A question and everything the slide needs to know about it. */
interface Planned {
  q: Question;
  b: ReturnType<typeof analyse>;
  counts: ReturnType<typeof displayCounts>;
  /** The groups to stack answers across. Either may be empty. */
  parties: string[];
  areas: string[];
  /** Set for a prose question: the words to draw instead of a chart. */
  words?: WordCount[];
  /** Set for the team question: one chart per team type. */
  teams?: TeamPanel[];
  /** The answers as shares - nationally, by station type, by area. */
  shares: Shares | null;
  full: boolean;
}

/** See `needsCountsPage`, which the export dialogue counts from. */
function countsNeeded(p: Planned): boolean {
  return needsCountsPage(p.shares !== null, p.parties);
}

function plan(dataset: Dataset, q: Question, filter: boolean[] | undefined): Planned | null {
  const b = analyse(dataset, q, filter);
  // The constituency question is a list of places: it is charted, in
  // geographic order, not turned into a cloud of place names.
  if (q.kind === 'text' && !isConstituencyQuestion(dataset, q)) {
    // Clouds are drawn on a canvas, so a Node build has none to draw on.
    if (typeof document === 'undefined') return null;
    const words = wordFrequencies(textValues(dataset, q, filter));
    if (words.length === 0) return null;
    return { q, b, counts: [], parties: [], areas: [], words, shares: null, full: true };
  }
  if (b.total.length === 0) return null;
  /*
   * Sixty teams on one axis is a wall; one chart per team type is a page
   * that can be read. See `teamReports`.
   *
   * Every column the form prints the team number in is on that page, so
   * the ones after the first draw nothing of their own rather than
   * repeating the page or charting a fifth of the teams on a slide of
   * their own.
   */
  if (isTeamQuestion(dataset, q)) {
    const teams = teamReports(dataset, filter);
    if (teams.length === 0) return null;
    const first = teamQuestion(dataset);
    if (first && first.columns[0] !== q.columns[0]) return null;
    return { q, b, counts: [], parties: [], areas: [], teams, shares: null, full: true };
  }
  const { parties, areas } = slideBreakdown(q, b);
  return {
    q,
    b,
    counts: displayCounts(q, b),
    parties,
    areas,
    shares: sharesAcross(dataset, q, filter, b),
    full: needsOwnSlide(q, b),
  };
}

/** The section the turnout curve is read after. */
const TURNOUT_AFTER = 'C';

function addQuestionSlides(
  pptx: PptxGenJS,
  dataset: Dataset,
  questions: Question[],
  filter: boolean[] | undefined,
  canDrawMaps = false,
  /** The turnout page, drawn once section C has had its pages. */
  afterSection?: () => void,
): void {
  const planned = questions
    .map((q) => plan(dataset, q, filter))
    .filter((x): x is Planned => x !== null);

  // A section of questions asked the same way opens with all of them on
  // one chart. See `sectionOverviews`.
  const overviews = sectionOverviews(dataset, questions, filter);
  const opened = new Set<string>();

  let pending = afterSection;
  for (let i = 0; i < planned.length; ) {
    const first = planned[i]!;
    if (first.q.section && !opened.has(first.q.section)) {
      if (pending && opened.has(TURNOUT_AFTER)) {
        pending();
        pending = undefined;
      }
      opened.add(first.q.section);
      for (const o of overviews.filter((x) => x.section === first.q.section)) {
        addSectionSlide(pptx, o);
      }
    }
    if (first.teams) {
      addTeamSlides(pptx, first.q, first.teams);
      i += 1;
      continue;
    }
    const drawn = [first];
    i += 1;
    if (countsNeeded(first)) {
      const second = planned[i];
      // Two share a slide only when neither needs the room, and only
      // where both have a page of counts to put on it.
      const pair =
        !first.full && second && !second.full && countsNeeded(second) ? second : undefined;
      const slide = pptx.addSlide({ masterName: 'BASE' });
      if (pair) {
        const cols = columns(2);
        drawQuestion(pptx, slide, dataset, first, cols[0]!);
        drawQuestion(pptx, slide, dataset, pair, cols[1]!);
        drawn.push(pair);
        i += 1;
      } else {
        drawQuestion(pptx, slide, dataset, first, { x: PAD.x, w: CONTENT.w });
      }
    }

    /*
     * The question's own page, then the map of the same answers.
     *
     * Where the question has a page of counts the map follows it, as the
     * reference deck sets it, and the shares come after. Where the shares
     * page is the question's own page it comes first and the map follows
     * that instead. A question with nothing to add in one of the three
     * draws no slide for it.
     */
    for (const p of drawn) {
      const sharesFirst = !countsNeeded(p);
      if (sharesFirst) addSharesSlide(pptx, p);
      if (canDrawMaps) {
        const kind = mapKindFor(dataset, p.q, p.b);
        if (kind === 'area') addMapSlide(pptx, dataset, filter);
        else if (kind === 'rate') addRateMapSlide(pptx, dataset, filter, p);
        else if (kind === 'pie') addPieMapSlide(pptx, dataset, p);
      }
      if (!sharesFirst) addSharesSlide(pptx, p);
    }
  }
  // Where section C is the last one in the deck, the curve closes it.
  if (pending && opened.has(TURNOUT_AFTER)) pending();
}

/**
 * A whole section of questions asked the same way, on one page.
 *
 * One row per question, each row a full-width 100% stacked bar, so the
 * section reads as one picture: the reference deck's "Section F" page,
 * where the one question answered No on a third of reports stands out from
 * nine answered No on a twentieth without a number being read.
 */
function addSectionSlide(pptx: PptxGenJS, o: SectionOverview): void {
  const s = pptx.addSlide({ masterName: 'BASE' });
  const top = heading(
    s,
    `Section ${o.section}`,
    'Each bar is all of the reports that answered that question.',
  );
  const rows = topDown(o.rows);
  // The polarity of ten questions at once is not one question's polarity,
  // so the colours are the fixed ones: Yes light, No dark, NA grey, and a
  // scale shaded along itself.
  const colours = fillsFor(
    o.answers.map((label) => ({ label })),
    { judged: false, scale: o.rows[0]?.question.scale, perMark: true },
  );

  // The question text, at the one size the deck allows, in the width a
  // category axis gets before PowerPoint starts dropping labels - over two
  // lines, because a section's questions are sentences and one line of
  // them ended at "Did you observe any particular problem ...".
  const names = rows.map((r) =>
    wrapText(`${r.question.code} ${r.question.label}`.trim(), 5.6, 2, TYPE.category),
  );

  s.addChart(
    pptx.ChartType.bar,
    o.answers.map((label, i) => ({
      name: label,
      labels: names,
      values: rows.map((r) => Math.round(r.counts[i]?.pct ?? 0)),
    })),
    {
      ...place({ x: PAD.x, y: top, w: CONTENT.w, h: PAD.bottom - top }, 'section chart'),
      ...BARE,
      barDir: 'bar',
      barGrouping: 'percentStacked',
      barGapWidthPct: 40,
      chartColors: colours,
      showValue: true,
      dataLabelPosition: 'ctr',
      dataLabelColor: ON_FILL,
      dataLabelFontSize: TYPE.dataLabel,
      // Hide the zeros: a stacked bar labels every series on every row,
      // including the answers nobody gave.
      dataLabelFormatCode: '0"%";;;',
      catAxisLabelFontSize: TYPE.category,
      showLegend: true,
      legendPos: 't',
      legendFontSize: TYPE.legend,
    },
  );
}

/**
 * One question's answers as shares: nationally, by station type, by area.
 *
 * The question's own slide counts the answers, which is what a briefing
 * opens with; this is the page that bears comparison between places, since
 * a count cannot be compared between an area holding eighty reports and
 * one holding nine. Every column carries the reports behind it.
 */
function addSharesSlide(pptx: PptxGenJS, planned: Planned): void {
  const { q, shares } = planned;
  if (!shares) return;

  const s = pptx.addSlide({ masterName: 'BASE' });
  const top = heading(
    s,
    `${q.code} ${q.label}`.trim(),
    'Each column is the reports that answered it, and the figure above the column is how many.',
  );
  const colours = fillsFor(
    shares.answers.map((label) => ({ label })),
    { judged: JUDGED.test(q.label), scale: q.scale, perMark: true },
  );

  /*
   * A panel is as wide as the columns in it.
   *
   * Given an equal share of the slide each, the national panel drew one
   * column four inches wide beside eight areas drawn as slivers. The
   * constant is the room the panel's own title and axis labels need
   * whatever is in it.
   */
  const weights = shares.panels.map((p) => p.groups.length + 1.2);
  const total = weights.reduce((a, w) => a + w, 0);
  const free = CONTENT.w - PAD.gap * (shares.panels.length - 1);
  const titleH = 0.56;
  /*
   * One legend, drawn under the panels rather than inside one of them.
   *
   * A chart that carries a legend gives it the bottom of its own plot
   * area, so the panel that had it drew columns an inch shorter than the
   * two beside it - and the whole point of this page is that the columns
   * are the same height and can be read across. The legend is the same
   * for all three, so it belongs to the slide.
   */
  const legendH = 0.46;
  /** The row of bases, above the columns rather than under them. */
  const baseH = (TYPE.category * 1.7) / 72;

  /*
   * Every panel's columns are drawn against the same height, exactly.
   *
   * A chart gives its category names the bottom of its own box, so the
   * panel of seven area names - too long to sit side by side, and turned
   * through 45 degrees - drew columns shorter than the one headed
   * "National" beside it, and a reader comparing the two was comparing
   * two different scales. Sizing each box as the columns plus the room
   * its own names need came close and no closer, because the room
   * PowerPoint gives a label is PowerPoint's own measurement of it. So
   * the plot area is set rather than left to be fitted: every panel is
   * the same box, and inside it the columns occupy the same rectangle,
   * whatever its names do underneath. `layoutTarget` is the plot area
   * itself, so the figure is the columns and not the chart around them.
   */
  const widths = shares.panels.map((_, i) => (free * weights[i]!) / total);
  const bands = shares.panels.map((p, i) => labelBand(p, widths[i]!));
  const frameY = top + titleH;
  const frameH = PAD.bottom - legendH - frameY;
  const plotH = frameH - baseH - Math.max(...bands.map((b) => b.height));

  let x = PAD.x;
  shares.panels.forEach((panel, i) => {
    const w = widths[i]!;
    const band = bands[i]!;
    s.addText(panel.title, {
      ...place({ x, y: top, w, h: titleH }, 'shares title'),
      fontSize: TYPE.chartTitleSmall, color: INK, fontFace: FONT,
      align: 'center', valign: 'middle',
    });

    /*
     * Room at the left for a turned name, which runs as far to the left
     * of its own tick as it runs below it. With the plot area set by
     * hand there is nothing to push it inwards, so the first name in a
     * panel of seven was cut off at the edge of the chart.
     */
    const slot = w / panel.groups.length;
    const inset = band.rotate === 0 ? 0 : Math.min(0.3, Math.max(0, band.height - slot / 2) / w);

    s.addChart(
      pptx.ChartType.bar,
      shares.answers.map((label, j) => ({
        name: label,
        labels: panel.groups.map((g) => g.label),
        values: panel.groups.map((g) => Math.round(g.counts[j]?.pct ?? 0)),
      })),
      {
        ...place({ x, y: frameY, w, h: frameH }, `shares ${q.code} ${i}`),
        ...BARE,
        layout: { x: inset, y: baseH / frameH, w: 1 - inset, h: plotH / frameH },
        barDir: 'col',
        barGrouping: 'percentStacked',
        barGapWidthPct: 40,
        chartColors: colours,
        showValue: true,
        dataLabelPosition: 'ctr',
        dataLabelColor: ON_FILL,
        dataLabelFontSize: TYPE.dataLabel,
        dataLabelFormatCode: '0"%";;;',
        catAxisLabelFontSize: TYPE.category,
        catAxisLabelRotate: band.rotate,
        showLegend: false,
      },
    );

    /*
     * The base over each column rather than inside its name.
     *
     * "Mansa Konko (1)" is half again as long as "Mansa Konko", and the
     * names are what decides how much of the slide is left for the
     * columns. A share of nine reports and a share of eighty are drawn
     * at the same height and are not the same evidence, so the figure
     * stays on the page - above the column it belongs to, where every
     * column is full height and the row of them reads straight across.
     */
    const plotX = x + inset * w;
    const plotW = w * (1 - inset);
    panel.groups.forEach((g, j) => {
      const centre = plotX + ((j + 0.5) * plotW) / panel.groups.length;
      s.addText(String(g.n), {
        ...place(
          { x: centre - plotW / (2 * panel.groups.length), y: frameY, w: plotW / panel.groups.length, h: baseH },
          `shares base ${q.code} ${i} ${j}`,
        ),
        fontSize: TYPE.category, color: MUTED, fontFace: FONT,
        align: 'center', valign: 'bottom',
      });
    });
    x += w + PAD.gap;
  });

  addLegendRow(pptx, s, shares.answers, colours, {
    x: PAD.x,
    y: PAD.bottom - legendH,
    w: CONTENT.w,
    h: legendH,
  });
}

/**
 * The height a panel's category names will take, and how they are set.
 *
 * Names that fit side by side are left level and take one line. Names
 * that do not are turned through 45 degrees, which is what PowerPoint
 * does to them anyway, and then the band they need is the height of the
 * longest one on the diagonal.
 */
export function labelBand(panel: SharePanel, w: number): { height: number; rotate: number } {
  const pt = TYPE.category;
  const line = (pt * 1.4) / 72;
  const longest = Math.max(...panel.groups.map((g) => g.label.length));
  /*
   * Arial averages a little over half its point size per character, and
   * the band is generous with what is left over: the plot area is set by
   * hand, so a name with less room than it needs is cut off rather than
   * given more - "Mansa Konko" was drawn as "Mansa K...".
   */
  const textW = (longest * pt * 0.58) / 72;
  if (textW <= w / panel.groups.length) return { height: line, rotate: 0 };
  return { height: textW * Math.SQRT1_2 + line, rotate: -45 };
}

/**
 * A legend of the slide's own, under the charts it describes.
 *
 * Only for a slide whose charts must be the same height as each other:
 * everywhere else PowerPoint's own legend is better, because it follows
 * the chart when the briefing team edits it.
 */
function addLegendRow(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  labels: string[],
  colours: string[],
  box: { x: number; y: number; w: number; h: number },
): void {
  const swatch = 0.2;
  const gap = 0.11;
  const space = 0.3;
  /*
   * Room for the widest Arial a label is likely to be, not the average.
   * At half the point size a character fits the average and "Sometimes"
   * came out as "Sometim" over "es": a legend is one line or it is not a
   * legend, which is what `wrap` below settles.
   */
  const textW = (label: string) => (label.length * TYPE.legend * 0.62) / 72 + 0.1;
  const widths = labels.map((l) => swatch + gap + textW(l));
  const total = widths.reduce((a, w) => a + w, 0) + space * (labels.length - 1);
  let x = box.x + Math.max(0, (box.w - total) / 2);
  labels.forEach((label, i) => {
    slide.addShape(pptx.ShapeType.rect, {
      ...place({ x, y: box.y + (box.h - swatch) / 2, w: swatch, h: swatch }, 'legend key'),
      fill: { color: colours[i % colours.length]! },
      line: { color: colours[i % colours.length]! },
    });
    slide.addText(label, {
      ...place(
        { x: x + swatch + gap, y: box.y, w: textW(label) + 0.12, h: box.h },
        'legend label',
      ),
      fontSize: TYPE.legend, color: MUTED, fontFace: FONT, valign: 'middle',
      wrap: false,
    });
    x += widths[i]! + space;
  });
}

/**
 * Every team, with the reports it filed, grouped by team type.
 *
 * The form asks for the team number once per team type, so the columns are
 * the types and the answers in them are the teams. A chart per type puts
 * each team beside the others doing the same job, which is the comparison
 * worth making: a long-term team that filed nine reports beside one that
 * filed none.
 */
/**
 * The most teams one column of the page can show.
 *
 * A category name needs about 1.6 times its own type size of chart height
 * before PowerPoint starts printing every other one - which on a chart of
 * teams reads as teams that filed nothing - and what the page has to give
 * is the slide's height less its heading and the column's own title.
 */
const TEAMS_PER_COLUMN = Math.floor((PAD.bottom - 1.55) / ((TYPE.category * 1.6) / 72));
/** The most columns that fit across the slide with their names readable. */
const COLUMNS_PER_SLIDE = 4;

function addTeamSlides(pptx: PptxGenJS, q: Question, panels: TeamPanel[]): void {
  /*
   * A team type with forty teams runs down more than one column.
   *
   * Twenty bars is what a slide's height holds at 18pt, which is the
   * smallest type this deck sets; the forty short-term teams of a real
   * deployment would otherwise be drawn at six point or, worse, drawn with
   * every other name missing, which reads as teams that filed nothing.
   */
  const chunks: TeamPanel[] = [];
  for (const panel of panels) {
    // Evenly: twenty-seven teams in columns of thirteen leaves a column
    // holding one bar across the full width of it, and three columns of
    // nine are the same teams drawn as a chart.
    const columns = Math.max(1, Math.ceil(panel.counts.length / TEAMS_PER_COLUMN));
    const size = Math.ceil(panel.counts.length / columns);
    for (let i = 0; i < panel.counts.length; i += size) {
      chunks.push({ label: panel.label, counts: panel.counts.slice(i, i + size) });
    }
  }

  for (let i = 0; i < chunks.length; i += COLUMNS_PER_SLIDE) {
    const page = chunks.slice(i, i + COLUMNS_PER_SLIDE);
    const s = pptx.addSlide({ masterName: 'BASE' });
    // The page is every team type, so its title is the question without
    // the one type the first column happened to be headed with.
    const title = `${q.code} ${splitBase(q.label)?.base ?? q.label}`.trim();
    const top = heading(s, i === 0 ? title : `${title} (continued)`);
    const titleH = 0.44;
    const w = (CONTENT.w - PAD.gap * (page.length - 1)) / page.length;
    // A column of two teams and a column of twenty, both given the full
    // height, draw bars of very different thickness and the short one
    // reads as a different unit. Every bar on the slide is the same depth
    // instead, set by the longest column, and a short column is a short
    // chart.
    const most = Math.max(...page.map((p) => p.counts.length));
    const barH = (PAD.bottom - top - titleH) / most;

    page.forEach((panel, j) => {
      const x = PAD.x + j * (w + PAD.gap);
      s.addText(panel.label, {
        ...place({ x, y: top, w, h: titleH }, 'team panel title'),
        fontSize: TYPE.chartTitleSmall, color: INK, fontFace: FONT,
        align: 'center', valign: 'middle',
      });
      s.addChart(
        pptx.ChartType.bar,
        [{
          name: 'Reports',
          labels: topDown(panel.counts.map((c) => c.label)),
          values: topDown(panel.counts.map((c) => c.n)),
        }],
        {
          ...place(
            { x, y: top + titleH, w, h: panel.counts.length * barH + 0.1 },
            `teams ${panel.label} ${j}`,
          ),
          ...BARE,
          barDir: 'bar',
          chartColors: [ACCENT_DEEP],
          barGapWidthPct: 45,
          showValue: true,
          dataLabelPosition: 'outEnd',
          dataLabelColor: MUTED,
          dataLabelFontSize: TYPE.dataLabel,
          catAxisLabelFontSize: TYPE.category,
          showLegend: false,
        },
      );
    });
  }
}

/**
 * One question, as a pie on each area.
 *
 * "Type of event by Local Government Area" is already on the question's own
 * slide as a stacked bar, which answers it precisely and says nothing about
 * where the areas are. The map answers a different question - whether the
 * caravans are a coastal thing and the rallies upriver - which a list of
 * area names in alphabetical order cannot.
 */
function addPieMapSlide(pptx: PptxGenJS, dataset: Dataset, planned: Planned): void {
  const { q, b } = planned;

  const order = b.total.filter((c) => !NON_ANSWERS.has(c.label)).map((c) => c.label);
  const colours = fillsFor(b.total, {
    judged: JUDGED.test(q.label),
    scale: q.scale,
    perMark: true,
  })
    .slice(0, order.length)
    .map((c) => `#${c}`);

  const data = Object.entries(b.byArea).map(([place, counts]) => ({
    place,
    counts: counts.filter((c) => !NON_ANSWERS.has(c.label)),
  }));
  if (data.length === 0) return;

  const s = pptx.addSlide({ masterName: 'BASE' });
  const top = heading(s, `${q.code} ${q.label}`.trim());
  const img = pieMapPng(data, order, colours, 1400, dataset.division);
  const w = CONTENT.w;
  const h = (w / img.width) * img.height;
  if (top + h > PAD.bottom) return;
  s.addImage({
    data: `data:image/png;base64,${toBase64(img.data)}`,
    ...place({ x: PAD.x, y: top, w, h }, `pie map ${q.code}`),
  });
}

/**
 * One question, in the space it was given.
 *
 * Title, then the chart, and nothing else. The deck used to print the number
 * of reports under every title and a written sentence under every chart; both
 * are gone. The figures are on the marks, and a sentence restating them is
 * read by nobody and shrinks the chart for everybody. The written description
 * still exists in the Word report, which is a document rather than a slide.
 */
function drawQuestion(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  dataset: Dataset,
  planned: Planned,
  col: { x: number; w: number },
): void {
  const { q, b, counts, parties, areas } = planned;
  const judged = JUDGED.test(q.label);
  const words = planned.words;

  // Never below 24pt. A question that cannot fit at that size was given the
  // whole slide by `needsOwnSlide`, so there is room for it here.
  const title = fitText(`${q.code} ${q.label}`.trim(), col.w, 3, TYPE.chartTitle, TYPE.chartTitle);
  const titleLines = linesNeeded(title.text, col.w, title.fontSize);
  const titleH = 0.1 + (titleLines * title.fontSize * 1.25) / 72;
  slide.addText(title.text, {
    ...place({ x: col.x, y: PAD.top, w: col.w, h: titleH }, 'question title'),
    fontSize: title.fontSize, color: INK, fontFace: FONT,
    align: 'center', valign: 'top',
  });

  const top = PAD.top + titleH + 0.06;
  const height = PAD.bottom - top;

  // Prose gets a word cloud and the whole space. There is nothing to tally.
  if (words) {
    drawWordCloud(slide, words, { x: col.x, y: top, w: col.w, h: height });
    return;
  }

  // A percentage is averaged, not banded. See `percentageOf`.
  if (b.percent) {
    drawPercentage(pptx, slide, q, b.percent, dataset.division, {
      x: col.x,
      y: top,
      w: col.w,
      h: height,
    });
    return;
  }

  /*
   * The question's own answers on the left, the comparisons on the right.
   *
   * Where there are two comparisons they stack in the right-hand column
   * rather than taking a third of the slide each: a stacked bar needs width
   * for its category names, and "Team Gambia Alliance" at 18pt does not fit
   * a four-inch column. Half the slide and half the height does fit both.
   */
  const comparisons: { by: 'party' | 'area'; groups: string[] }[] = [];
  if (parties.length > 0) comparisons.push({ by: 'party', groups: parties });
  if (areas.length > 0) comparisons.push({ by: 'area', groups: areas });

  const split = comparisons.length > 0;
  const panes = split ? columns(2) : [{ x: col.x, w: col.w }];
  const mainPane = split ? panes[0]! : { x: col.x, w: col.w };

  drawAnswerChart(pptx, slide, q, b, counts, judged, {
    x: mainPane.x, y: top, w: mainPane.w, h: height,
  });

  /*
   * Height goes to the chart with more bars in it.
   *
   * Split evenly, eight Local Government Areas got the same inch and a half
   * as five parties, and PowerPoint responded by printing every other area
   * name and dropping the rest. Each chart is weighted by its row count plus
   * a constant for its title and legend, which is roughly what it needs.
   */
  const gap = 0.18;
  // The top chart also carries the legend, which wraps: five answers take
  // two lines, and with five parties under them PowerPoint started
  // printing every other party name again.
  const legendLines = Math.max(1, Math.ceil(b.total.length / 3));
  const weights = comparisons.map(
    (c, i) => c.groups.length + (i === 0 ? 2 + legendLines : 2),
  );
  const totalWeight = weights.reduce((a, w) => a + w, 0);
  const free = height - gap * (comparisons.length - 1);

  let y = top;
  comparisons.forEach((c, i) => {
    const h = (free * weights[i]!) / totalWeight;
    drawByGroup(pptx, slide, q, b, c.by, c.groups, judged, dataset, {
      x: panes[1]!.x,
      y,
      w: panes[1]!.w,
      h,
      // One legend for the pair. The colours are the same in both and the
      // charts sit one above the other, so repeating it spends height that
      // the bars need.
      legend: i === 0,
    });
    y += h + gap;
  });
}

/** A prose question's words, rasterised and dropped on the slide. */
function drawWordCloud(
  slide: PptxGenJS.Slide,
  words: WordCount[],
  box: { x: number; y: number; w: number; h: number },
): void {
  // Drawn at three times the slide size so it stays sharp on a projector.
  const img = wordCloudPng(words, CAT.map((c) => `#${c}`), Math.round(box.w * 150), Math.round(box.h * 150));
  slide.addImage({
    data: `data:image/png;base64,${toBase64(img.data)}`,
    ...place(box, 'word cloud'),
  });
}

/** The question's own answers: a ring for a few, bars for more. */
/**
 * A question that asks for a percentage.
 *
 * The figure, then the same figure by party and by Local Government Area.
 * It used to be drawn as bands - how many events were 40 to 59% female -
 * which answers a question nobody asked of it and cannot be compared
 * across parties without reading twenty numbers off a stacked bar.
 *
 * Both charts are drawn to a fixed 0-100 axis. Left to themselves they
 * would each scale to their own largest bar, and a party averaging 30%
 * would fill as much width as one averaging 95%.
 */
function drawPercentage(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  q: Question,
  p: Percentage,
  division: Division,
  box: { x: number; y: number; w: number; h: number },
): void {
  const headH = 0.78;
  // The figure alone. "mean of 36 estimates" beside it read as a hedge
  // rather than as a base; the reports behind each average are on the
  // bars, and the deck's coverage slide carries the total.
  slide.addText(
    [{ text: `${meanLabel(p.mean)}%`, options: { fontSize: TYPE.figure, bold: true, color: INK } }],
    {
      ...place({ x: box.x, y: box.y, w: box.w, h: headH }, 'percentage mean'),
      fontFace: FONT,
      align: 'center',
      valign: 'middle',
    },
  );

  /*
   * What the figure is a share of, where the form did not ask for a share.
   *
   * "32%" under "Total number of voters who had already voted" is not a
   * hedge needing removal but a unit: without the line the reader cannot
   * tell a share of the station's list from a share of the reports.
   */
  let figureH = headH;
  if (p.basis) {
    slide.addText(p.basis, {
      ...place({ x: box.x, y: box.y + headH, w: box.w, h: 0.34 }, 'percentage basis'),
      fontSize: TYPE.caption, color: MUTED, fontFace: FONT,
      align: 'center', valign: 'middle',
    });
    figureH += 0.34;
  }

  const charts: { title: string; rows: GroupMean[] }[] = [];
  if (p.byParty.length > 1) charts.push({ title: 'By party', rows: p.byParty });
  if (p.byArea.length > 1) {
    charts.push({ title: `By ${AREA_WORDS[division].one}`, rows: p.byArea });
  }
  if (charts.length === 0) return;

  const top = box.y + figureH + 0.1;
  const h = box.h - figureH - 0.1;
  const gap = PAD.gap;
  const w = (box.w - gap * (charts.length - 1)) / charts.length;

  charts.forEach((c, i) => {
    const x = box.x + i * (w + gap);
    // A chart of small averages needs a decimal place: B.10 runs at well
    // under 1%, and whole numbers would draw every bar as 0% or 1%.
    const fine = c.rows.some((r) => r.mean < 10 && Math.round(r.mean * 10) % 10 !== 0);
    const value = (v: number) => (fine ? Math.round(v * 10) / 10 : Math.round(v));
    slide.addText(c.title, {
      ...place({ x, y: top, w, h: 0.4 }, 'percentage chart title'),
      fontSize: TYPE.chartTitleSmall,
      color: INK,
      fontFace: FONT,
      align: 'center',
      valign: 'middle',
    });
    slide.addChart(
      pptx.ChartType.bar,
      [
        {
          name: q.code || 'Percentage',
          labels: topDown(c.rows.map((r) => `${r.label} (${r.n})`)),
          values: topDown(c.rows.map((r) => value(r.mean))),
        },
      ],
      {
        ...place({ x, y: top + 0.42, w, h: h - 0.42 }, 'percentage chart'),
        ...BARE,
        barDir: 'bar',
        chartColors: [ACCENT_DEEP],
        barGapWidthPct: 55,
        valAxisMaxVal: 100,
        valAxisMinVal: 0,
        showValue: true,
        dataLabelPosition: 'outEnd',
        dataLabelFormatCode: fine ? `${DECIMAL}0.0"%"` : '0"%"',
        dataLabelColor: MUTED,
        dataLabelFontSize: TYPE.dataLabel,
        catAxisLabelFontSize: TYPE.category,
        showLegend: false,
      },
    );
  });
}

function drawAnswerChart(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  q: Question,
  b: ReturnType<typeof analyse>,
  counts: ReturnType<typeof displayCounts>,
  judged: boolean,
  box: { x: number; y: number; w: number; h: number },
): void {
  const labels = counts.map((c) => c.label);
  const values = counts.map((c) => Number(c.n));
  const ring = (q.kind === 'binary' || q.kind === 'categorical') && labels.length <= 4;
  const colours = fillsFor(counts, { judged, scale: q.scale, perMark: ring });
  const placed = place(box, `answers ${q.code}`);

  /*
   * A time question is drawn as columns, not bars.
   *
   * Times are bucketed to the hour and belong on an axis that runs left to
   * right, early to late, the way every reader already expects a day to be
   * drawn. As horizontal bars the same data read bottom-to-top, so the
   * morning sat under the evening.
   */
  if (q.kind === 'time') {
    slide.addChart(pptx.ChartType.bar, [{ name: 'Reports', labels, values }], {
      ...placed,
      ...BARE,
      barDir: 'col', chartColors: [ACCENT_DEEP], barGapWidthPct: 40,
      showValue: true, dataLabelPosition: 'outEnd',
      dataLabelColor: MUTED, dataLabelFontSize: TYPE.dataLabel,
      catAxisLabelFontSize: TYPE.category,
      showLegend: false,
    });
    return;
  }

  if (ring) {
    slide.addChart(pptx.ChartType.doughnut, [{ name: q.code || q.label, labels, values }], {
      ...placed,
      ...BARE,
      chartColors: colours,
      holeSize: 52,
      // Legend directly under the title and above the ring, horizontal, as
      // the reference sets every one of its own.
      showLegend: true, legendPos: 't', legendFontSize: TYPE.legend,
      showValue: true, showPercent: true,
      dataLabelColor: ON_FILL, dataLabelFontSize: TYPE.dataLabel,
      dataLabelPosition: 'ctr',
    });
    return;
  }

  /*
   * A block of tick boxes is drawn as the share of the reports.
   *
   * One report ticks several options, so a count answers "how many
   * reports named the army" and leaves the reader to remember how many
   * reports there were in order to know whether that is many. The
   * reference deck prints the share of all its reports for exactly these
   * questions - "unauthorised persons: 1.9%" - with the count beside it,
   * and the count is here in the option's own name, as the base is on
   * every other chart in this deck. The share is of every report in the
   * export and not of the ones that reached the question, so two of these
   * blocks can be read against each other: a follow-up asked only of the
   * reports that answered Yes would otherwise be a share of a different
   * denominator on every page.
   */
  if (q.kind === 'multi' && b.reports > 0) {
    const named = counts.map((c) => `${c.label} (${c.n})`);
    const share = counts.map((c) => Math.round((c.n / b.reports) * 1000) / 10);
    slide.addChart(
      pptx.ChartType.bar,
      [{ name: 'Share of reports', labels: topDown(named), values: topDown(share) }],
      {
        ...placed,
        ...BARE,
        barDir: 'bar', chartColors: topDown(colours), barGapWidthPct: 55,
        showValue: true, dataLabelPosition: 'outEnd',
        dataLabelColor: MUTED, dataLabelFontSize: TYPE.dataLabel,
        // The locale prefix, as everywhere a chart label carries a
        // decimal: PowerPoint writes these as the file is opened.
        dataLabelFormatCode: `${DECIMAL}0.0"%"`,
        catAxisLabelFontSize: TYPE.category,
        showTitle: true,
        title: `Share of all ${b.reports} reports. The number ticking each is in brackets.`,
        titleFontSize: TYPE.sub,
        titleColor: MUTED,
        showLegend: false,
        valAxisMinVal: 0,
      },
    );
    return;
  }

  slide.addChart(
    pptx.ChartType.bar,
    [{ name: 'Reports', labels: topDown(labels), values: topDown(values) }],
    {
    ...placed,
    ...BARE,
    barDir: 'bar', chartColors: topDown(colours), barGapWidthPct: 55,
    showValue: true, dataLabelPosition: 'outEnd',
    dataLabelColor: MUTED, dataLabelFontSize: TYPE.dataLabel,
    catAxisLabelFontSize: TYPE.category,
    showLegend: false,
    },
  );
}

/**
 * The same answers, stacked across a grouping.
 *
 * Counts rather than shares, stacked, with the count written inside each
 * segment: the reference's "by Political Party" chart, which it is here too
 * when the form records a party, and by Local Government Area otherwise.
 */
function drawByGroup(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  q: Question,
  b: ReturnType<typeof analyse>,
  by: 'party' | 'area',
  groups: string[],
  judged: boolean,
  dataset: Dataset,
  box: { x: number; y: number; w: number; h: number; legend?: boolean },
): void {
  const source = by === 'party' ? b.byParty : b.byArea;
  const answers = b.total.map((c) => c.label);
  const colours = fillsFor(b.total, { judged, scale: q.scale, perMark: true });

  // Largest area at the top, so the chart opens with the places that carry
  // the most observation rather than with whatever order the file had.
  const weight = (group: string) =>
    (source[group] ?? []).reduce((t, x) => t + x.n, 0);
  const ordered = topDown([...groups].sort((a, c) => weight(c) - weight(a)));

  const series = answers.map((label, i) => ({
    name: label,
    labels: ordered,
    values: ordered.map((g) => source[g]?.find((c) => c.label === label)?.n ?? 0),
    // Kept so the colour of an answer is the same in both charts.
    _colour: colours[i],
  }));

  const heading =
    by === 'party'
      ? 'by Party'
      : dataset.geo
        ? `by ${AREA_WORDS[dataset.division].one}`
        : 'by area';
  slide.addText(heading, {
    ...place({ x: box.x, y: box.y, w: box.w, h: 0.34 }, 'by-area title'),
    fontSize: TYPE.chartTitleSmall, color: INK, fontFace: FONT,
    align: 'center', valign: 'middle',
  });

  slide.addChart(
    pptx.ChartType.bar,
    series.map(({ name, labels, values }) => ({ name, labels, values })),
    {
      ...place({ x: box.x, y: box.y + 0.38, w: box.w, h: box.h - 0.38 }, `by-area ${q.code}`),
      ...BARE,
      barDir: 'bar',
      barGrouping: 'stacked',
      barGapWidthPct: 55,
      chartColors: series.map((x) => x._colour!),
      showValue: true, dataLabelPosition: 'ctr',
      dataLabelColor: ON_FILL, dataLabelFontSize: TYPE.dataLabel,
      // Hide the zeros. A stacked bar prints a label for every series on
      // every row, including the ones that are not there, so an area where
      // only two of five answers occurred came out reading "2 0 0 1 0" with
      // the labels on top of each other. The empty third section of the
      // number format is what suppresses a zero.
      dataLabelFormatCode: '#,##0;;;',
      catAxisLabelFontSize: TYPE.category,
      showLegend: box.legend !== false, legendPos: 't', legendFontSize: TYPE.legend,
    },
  );
}
