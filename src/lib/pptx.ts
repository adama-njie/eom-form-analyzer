import PptxGenJS from 'pptxgenjs';
import {
  analyse,
  coverage,
  displayCounts,
  findings,
  rateByPlace,
  reportsByPlace,
  textValues,
  type Dataset,
} from './analyse';
import { wordCloudPng } from './chartImage';
import { wordFrequencies, type WordCount } from './text';
import { CONTENT, PAD, SLIDE, columns, fitText, linesNeeded, place } from './layout';
import {
  ACCENT,
  ACCENT_DEEP,
  BARE,
  CAT,
  FLAG,
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
import { mapPng } from './mapImage';
import { describeFindingBody } from './narrative';
import {
  needsOwnSlide,
  selectedQuestions,
  slideBreakdown,
  type ExportSelection,
} from './selection';
import { NON_ANSWERS, type Question } from './schema';

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
 * Yes is light blue, No is dark blue and NA is grey, on every chart, in
 * every question, everywhere in the deck. They used to depend on whether
 * the question was one where Yes is the bad answer, so "Was security
 * provided for the candidate?" drew Yes in orange while "Were media
 * present?" drew it in light blue, and a reader moving between two slides
 * had to go back to the legend to be sure which was which. Which answer is
 * the worrying one is the findings table's job; the palette's job is to be
 * predictable.
 */
/** Answers whose colour is fixed, whatever the chart or the question. */
function hasOwnColour(label: string): boolean {
  return label === 'Yes' || label === 'No' || NON_ANSWERS.has(label);
}

export function colourFor(label: string, index: number, scale?: string[]): string {
  if (label === 'Yes') return ACCENT;
  if (label === 'No') return ACCENT_DEEP;
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
  const stamp = new Date().toISOString().slice(0, 10);
  await pptx.writeFile({ fileName: `observer-analysis-${stamp}.pptx` });
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
  const probs = findings(dataset, filter, 8);

  const canDrawMaps =
    sel.maps && (options.includeMaps ?? true) && dataset.geo && typeof document !== 'undefined';

  addTitleSlide(pptx, sel);
  if (sel.coverage) addCoverageSlide(pptx, dataset, cov);
  if (canDrawMaps) addMapSlide(pptx, dataset, filter);
  if (sel.findingsTable && probs.length > 0) addFindingsSlide(pptx, probs);
  if (canDrawMaps && sel.findingsTable) {
    for (const f of probs.slice(0, 3)) addFindingMapSlide(pptx, dataset, filter, f);
  }
  if (sel.ratings) addRatingsSlide(pptx, dataset, filter);

  addQuestionSlides(pptx, dataset, selectedQuestions(dataset, sel), filter);

  return pptx;
}

/* ------------------------------------------------------------------ */

function addTitleSlide(pptx: PptxGenJS, sel: ExportSelection): void {
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
): void {
  const s = pptx.addSlide({ masterName: 'BASE' });
  const top = heading(s, 'Coverage', 'What was observed, and where.');

  const tiles: [string, string][] = [
    ['Reports', String(cov.reports)],
    [dataset.geo ? 'Areas covered' : 'Districts', `${cov.groupsCovered} / ${cov.groupsTotal}`],
    [
      cov.registerShare !== null ? 'Electorate reached' : 'Mean per district',
      cov.registerShare !== null
        ? `${cov.registerShare.toFixed(0)}%`
        : (cov.reports / Math.max(1, cov.groupsCovered)).toFixed(1),
    ],
    ['Teams', String(cov.byTeam.length)],
  ];
  const tileCols = columns(4);
  const tileH = 1.25;
  tiles.forEach(([label, value], i) => {
    const col = tileCols[i]!;
    s.addShape(pptx.ShapeType.rect, {
      ...place({ x: col.x, y: top, w: col.w, h: tileH }, `tile ${i}`),
      fill: { color: PANEL }, line: { color: PANEL },
    });
    // Caption above the figure, as the reference's own KPI cards set them.
    s.addText(label, {
      x: col.x + 0.22, y: top + 0.14, w: col.w - 0.44, h: 0.3,
      fontSize: TYPE.figureLabel, color: MUTED, fontFace: FONT,
    });
    s.addText(value, {
      x: col.x + 0.22, y: top + 0.44, w: col.w - 0.44, h: 0.72,
      fontSize: TYPE.figure, color: INK, fontFace: FONT,
    });
  });

  const chartTop = top + tileH + PAD.gap;
  const chartH = PAD.bottom - chartTop;
  const half = columns(2);
  // Most-observed at the top, as the reference orders its own.
  const areaRows = topDown(
    cov.byGroup.filter((g) => g.reports > 0).sort((a, b) => b.reports - a.reports),
  );
  const teamRows = topDown([...cov.byTeam].sort((a, b) => b.reports - a.reports));

  if (areaRows.length > 0) {
    s.addChart(
      pptx.ChartType.bar,
      [{ name: 'Reports', labels: areaRows.map((g) => g.label), values: areaRows.map((g) => g.reports) }],
      {
        ...place({ x: half[0]!.x, y: chartTop, w: half[0]!.w, h: chartH }, 'coverage area chart'),
        ...BARE,
        barDir: 'bar', chartColors: [ACCENT_DEEP],
        showValue: true, dataLabelPosition: 'outEnd',
        dataLabelColor: MUTED, dataLabelFontSize: TYPE.dataLabel,
        catAxisLabelFontSize: TYPE.category,
        showLegend: false, showTitle: true, titleFontSize: TYPE.chartTitleSmall,
        title: dataset.geo ? 'Reports by area' : 'Reports by district',
      },
    );
  }
  s.addChart(
    pptx.ChartType.bar,
    [{ name: 'Reports', labels: teamRows.map((t) => t.team), values: teamRows.map((t) => t.reports) }],
    {
      ...place({ x: half[1]!.x, y: chartTop, w: half[1]!.w, h: chartH }, 'coverage team chart'),
      ...BARE,
      barDir: 'bar', chartColors: [ACCENT],
      showValue: true, dataLabelPosition: 'outEnd',
      dataLabelColor: MUTED, dataLabelFontSize: TYPE.dataLabel,
      catAxisLabelFontSize: TYPE.category,
      showLegend: false, showTitle: true, titleFontSize: TYPE.chartTitleSmall,
      title: 'Reports by team',
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
  const maps: [string, 'lga' | 'district', string][] = [
    ['Reports by Local Government Area', 'lga', 'All eight LGAs. Hatched areas returned no reports.'],
  ];
  if (dataset.constituencies.length > 0) {
    maps.push([
      'Reports by district',
      'district',
      `${dataset.constituencies.length} of the 53 constituencies returned reports. Hatched districts returned none.`,
    ]);
  }

  for (const [title, unit, note] of maps) {
    const s = pptx.addSlide({ masterName: 'BASE' });
    const top = heading(s, title, note);
    const img = mapPng(reportsByPlace(dataset, unit, filter), unit, '', ACCENT_DEEP, 1400);
    const w = CONTENT.w;
    const h = (w / img.width) * img.height;
    s.addImage({
      data: `data:image/png;base64,${toBase64(img.data)}`,
      ...place({ x: PAD.x, y: top, w, h }, `${unit} map`),
    });
    s.addText('Filtering by area and district is available in the tool.', {
      ...place({ x: PAD.x, y: top + h + 0.22, w: CONTENT.w, h: 0.32 }, 'map note'),
      fontSize: TYPE.caption, color: MUTED, fontFace: FONT,
    });
  }
}

/** One finding, mapped. */
function addFindingMapSlide(
  pptx: PptxGenJS,
  dataset: Dataset,
  filter: boolean[] | undefined,
  f: ReturnType<typeof findings>[number],
): void {
  const s = pptx.addSlide({ masterName: 'BASE' });
  // The question is the title. It used to be the subtitle under "C.7 by
  // LGA", and then the sentence underneath the map opened by stating it a
  // second time, so the slide asked the same question twice and spent two
  // lines doing it.
  const top = heading(s, `${f.question.code} ${f.question.label}`.trim());
  const img = mapPng(
    rateByPlace(dataset, f.question, f.label, 'lga', filter),
    'lga',
    '%',
    FLAG,
    1400,
  );
  const w = CONTENT.w;
  const h = (w / img.width) * img.height;
  s.addImage({
    data: `data:image/png;base64,${toBase64(img.data)}`,
    ...place({ x: PAD.x, y: top, w, h }, 'finding map'),
  });
  s.addText(describeFindingBody(f), {
    ...place({ x: PAD.x, y: top + h + 0.18, w: CONTENT.w, h: PAD.bottom - top - h - 0.18 }, 'finding note'),
    fontSize: TYPE.body, color: INK, fontFace: FONT, valign: 'top',
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

function addFindingsSlide(pptx: PptxGenJS, probs: ReturnType<typeof findings>): void {
  const s = pptx.addSlide({ masterName: 'BASE' });
  const top = heading(
    s,
    'Ranked findings',
    'Questions whose answer indicates a problem, most frequent first. A triage aid, not a conclusion.',
  );

  const colW = [1.15, 6.3, 0.65, CONTENT.w - 1.15 - 6.3 - 0.65];
  const rows: PptxGenJS.TableRow[] = [
    ['Rate', 'Question', 'n', 'Above that rate in'].map((t) => ({
      text: t,
      options: {
        color: ON_FILL, fill: { color: ACCENT_DEEP },
        fontSize: TYPE.table, fontFace: FONT,
      },
    })),
    // Banded rows rather than ruled ones. The reference's tables separate by
    // fill, and a hairline round every cell is exactly the ink that was
    // asked to go.
    ...probs.map((f, i) => {
      const fill = { color: i % 2 === 0 ? 'FFFFFF' : PANEL };
      return [
        { text: `${f.pct.toFixed(1)}%`, options: { color: FLAG, fontSize: TYPE.table, fontFace: FONT, fill } },
        { text: `${f.question.code} ${f.question.label}`.trim(), options: { color: INK, fontSize: TYPE.table, fontFace: FONT, fill } },
        { text: String(f.n), options: { color: INK, fontSize: TYPE.table, fontFace: FONT, fill } },
        {
          text: f.hotspots.slice(0, 3).map((h) => `${h.group} ${h.pct.toFixed(0)}%`).join(', ') || '-',
          options: { color: MUTED, fontSize: TYPE.caption, fontFace: FONT, fill },
        },
      ];
    }),
  ];

  const available = PAD.bottom - top;
  const rowH = Math.min(0.66, available / rows.length);
  s.addTable(rows, {
    ...place({ x: PAD.x, y: top, w: CONTENT.w, h: rowH * rows.length }, 'findings table'),
    colW, rowH, fontSize: TYPE.table, fontFace: FONT, valign: 'middle',
    border: { type: 'none' },
  });
}

function addRatingsSlide(
  pptx: PptxGenJS,
  dataset: Dataset,
  filter: boolean[] | undefined,
): void {
  const ratings = dataset.questions.filter((q) => q.kind === 'ordinal' && /^J\./.test(q.code));
  const scored = ratings
    .map((q) => ({ q, b: analyse(dataset, q, filter) }))
    .filter((r) => r.b.meanScore !== undefined);
  if (scored.length === 0) return;

  const s = pptx.addSlide({ masterName: 'BASE' });
  const top = heading(s, 'Overall assessments', 'Mean of each rating question, on its own scale.');
  s.addChart(
    pptx.ChartType.bar,
    [{
      name: 'Mean score',
      labels: topDown(scored).map(
        (r) => fitText(`${r.q.code} ${r.q.label}`, 5.4, 1, TYPE.category, TYPE.category).text,
      ),
      values: topDown(scored).map((r) => Number(r.b.meanScore!.toFixed(2))),
    }],
    {
      ...place({ x: PAD.x, y: top, w: CONTENT.w, h: PAD.bottom - top }, 'ratings chart'),
      ...BARE,
      barDir: 'bar', chartColors: [ACCENT_DEEP],
      showValue: true, dataLabelPosition: 'outEnd',
      dataLabelColor: MUTED, dataLabelFontSize: TYPE.dataLabel,
      // Without an explicit format PowerPoint inherits the cell's General
      // format and prints a mean of 3.47 as "3", which is the one number on
      // this slide where the decimal is the whole point.
      dataLabelFormatCode: '0.00',
      catAxisLabelFontSize: TYPE.category, showLegend: false,
      valAxisMinVal: 0, valAxisMaxVal: 5,
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
  full: boolean;
}

function plan(dataset: Dataset, q: Question, filter: boolean[] | undefined): Planned | null {
  const b = analyse(dataset, q, filter);
  if (q.kind === 'text') {
    // Clouds are drawn on a canvas, so a Node build has none to draw on.
    if (typeof document === 'undefined') return null;
    const words = wordFrequencies(textValues(dataset, q, filter));
    if (words.length === 0) return null;
    return { q, b, counts: [], parties: [], areas: [], words, full: true };
  }
  if (b.total.length === 0) return null;
  const { parties, areas } = slideBreakdown(q, b);
  return { q, b, counts: displayCounts(q, b), parties, areas, full: needsOwnSlide(q, b) };
}

function addQuestionSlides(
  pptx: PptxGenJS,
  dataset: Dataset,
  questions: Question[],
  filter: boolean[] | undefined,
): void {
  const planned = questions
    .map((q) => plan(dataset, q, filter))
    .filter((x): x is Planned => x !== null);

  for (let i = 0; i < planned.length; ) {
    const first = planned[i]!;
    const second = planned[i + 1];
    // Two share a slide only when neither needs the room.
    const pair = !first.full && second && !second.full ? second : undefined;

    const slide = pptx.addSlide({ masterName: 'BASE' });
    if (pair) {
      const cols = columns(2);
      drawQuestion(pptx, slide, dataset, first, cols[0]!);
      drawQuestion(pptx, slide, dataset, pair, cols[1]!);
      i += 2;
    } else {
      drawQuestion(pptx, slide, dataset, first, { x: PAD.x, w: CONTENT.w });
      i += 1;
    }
  }
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
  const weights = comparisons.map((c, i) => c.groups.length + (i === 0 ? 3 : 2));
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
  void b;
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
        ? 'by Local Government Area'
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
