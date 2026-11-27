/**
 * What goes into an export.
 *
 * A full form produces a 42-slide deck, which is right for the data team and
 * wrong for almost every audience it gets shown to. A mission analyst
 * briefing the Chief Observer wants six slides; one briefing the EMB wants
 * the procedural section only. So every export asks first.
 *
 * One selection model is shared by the deck, the Word report and print, so
 * what you choose means the same thing whichever button you pressed.
 */

import type { Breakdown, Dataset } from './analyse';
import {
  analyse,
  displayCounts,
  isRatingQuestion,
  poorLabels,
  poorReports,
  ratingByHour,
  ratingQuestions,
  findings,
  isInverted,
  isWordCloud,
  sectionOverviews,
  sharesAcross,
} from './analyse';
import { NON_ANSWERS } from './schema';
import { columnWidth, fitsAt } from './layout';
import { periodSlug, type Period } from './period';
import type { Question } from './schema';
import { TYPE } from './theme';

/** The most lines a question's title is allowed to run to. */
const TITLE_LINES = 3;

export interface ExportSelection {
  /** The cover's main title. */
  title: string;
  /** Who produced it. The cover prints "Prepared by " and then this. */
  preparedBy: string;
  /** The election, as the mission header should read it. */
  election: string;
  /** Polling day, written how it should read. Blank omits the line. */
  electionDate: string;
  /**
   * Which stretch of the calendar this export covers, written out, or
   * blank for the whole file. Set from the dashboard's period filter, and
   * printed on the cover of every output so a document can always be
   * checked against the file it came from.
   */
  period: string;
  /** The same choice as a word, for the file's name. */
  periodId: Period;
  /** Section blocks, in the order they appear in the output. */
  coverage: boolean;
  maps: boolean;
  findingsTable: boolean;
  ratings: boolean;
  /** Question codes to include, in form order. Empty means no question pages. */
  questions: string[];
}

/**
 * A stable, unique id for a question.
 *
 * Not the code alone: several questions share one. A form asks "A.1 Team
 * number" once per team type, so five separate questions all carry the code
 * A.1, and keying on it would make them toggle together and undercount the
 * selection. The first column index disambiguates them.
 */
export function questionKey(q: Question): string {
  return `${q.code || q.label}#${q.columns[0] ?? 0}`;
}

/**
 * Questions that can appear in an export, in the order the form asks them.
 *
 * Text questions are in when their answers are prose, which gets a word
 * cloud, and when they name a constituency, which gets a chart in
 * geographic order. A text column holding a station code or a date is an
 * identifier and has nothing to show.
 */
export function exportableQuestions(dataset: Dataset): Question[] {
  return dataset.questions.filter((q) => {
    if (q.kind === 'meta' || q.columns.length === 0) return false;
    if (q.kind === 'text') return isConstituencyQuestion(dataset, q) || isWordCloud(dataset, q);
    return true;
  });
}

/**
 * Whether this question is the one naming the area.
 *
 * It is charted like any other question - a bar per area - and then mapped,
 * because the map is the one view of it that shows where the gaps are.
 */
export function isAreaQuestion(dataset: Dataset, q: Question): boolean {
  return dataset.areaColumn !== null && q.columns.includes(dataset.areaColumn);
}

/** Whether this question is the one naming the constituency. */
export function isConstituencyQuestion(dataset: Dataset, q: Question): boolean {
  return (
    dataset.constituencyColumn !== null && q.columns.includes(dataset.constituencyColumn)
  );
}

/**
 * Whether a question's answers can usefully be stacked across groups.
 *
 * Only for questions with a handful of answers: stacking nine answer colours
 * across eight groups produces a chart that is coloured in rather than read.
 */
function stackable(q: Question, b: Breakdown): boolean {
  // Numeric too, now that its answers are counted in bands: "what share of
  // participants were women, by party" is one of the comparisons the
  // mission's other teams asked for, and it was not possible while the
  // breakdown held one entry per distinct number.
  const kinds = ['binary', 'ordinal', 'categorical', 'numeric'];
  if (!kinds.includes(q.kind)) return false;
  return b.total.length <= 5;
}

/** The areas worth comparing a question's answers across. */
export function areaBreakdown(q: Question, b: Breakdown): string[] {
  if (!stackable(q, b)) return [];
  const areas = Object.keys(b.byArea);
  return areas.length > 1 ? areas : [];
}

/** The parties worth comparing a question's answers across. */
export function partyBreakdown(q: Question, b: Breakdown): string[] {
  if (!stackable(q, b)) return [];
  const parties = Object.keys(b.byParty);
  return parties.length > 1 ? parties : [];
}

/**
 * The groupings a question's slide compares across.
 *
 * Both, where the form supports both. A campaign form records the party
 * behind each event and the area it happened in, and the two answer
 * different questions: which parties are doing a thing, and where it is
 * happening. A polling-day form has only the area.
 */
export function slideBreakdown(
  q: Question,
  b: Breakdown,
): { parties: string[]; areas: string[] } {
  return { parties: partyBreakdown(q, b), areas: areaBreakdown(q, b) };
}

/**
 * Whether a question needs a slide to itself.
 *
 * The reference deck gives every question its own page, but its form is a
 * dozen questions long and these are sixty-seven, and a page holding one
 * four-bar chart with six inches of white space under it is not better than
 * a page holding two. So the question decides: one that has a by-area
 * comparison to show, or more bars than sit comfortably in half a page,
 * takes the slide; a short one shares with the next short one.
 */
export function needsOwnSlide(q: Question, b: Breakdown): boolean {
  // A cloud is only readable at size.
  if (q.kind === 'text') return true;
  const { parties, areas } = slideBreakdown(q, b);
  if (parties.length > 0 || areas.length > 0) return true;
  if (displayCounts(q, b).length > 7) return true;
  // A title is never set below 24pt, so a question too long to fit a
  // half-width column at that size takes the full width rather than being
  // shrunk or cut. Some of these questions run to twenty words.
  const title = `${q.code} ${q.label}`.trim();
  return !fitsAt(title, columnWidth(2), TITLE_LINES, TYPE.chartTitle);
}

/**
 * Whether a question still needs a page counting its answers.
 *
 * The shares page says everything the counts page said about a question
 * of a handful of answers, and says it in the one form that can be
 * compared between areas of different size, so drawing both put a ring
 * and a stack of area bars on one page and the same answers as columns on
 * the next. Where the question is also broken down by party the counts
 * page is the only place that comparison appears, and it stays.
 *
 * Read by the deck, which draws the page, and by the dialogue, which
 * counts it before the analyst presses the button.
 */
/** Rows to a page of the table of badly rated stations. See `addPoorTableSlide`. */
export const POOR_ROWS = 10;

export function needsCountsPage(hasShares: boolean, parties: string[]): boolean {
  return !hasShares || parties.length > 0;
}

/**
 * The pages the chosen questions take, packed as the deck packs them.
 *
 * Two short questions share a page, a long one takes its own, and a
 * question whose answers are drawn as shares has no counts page at all.
 */
export function countQuestionPages(
  dataset: Dataset,
  questions: Question[],
  filter?: boolean[],
): number {
  const planned = questions.map((q) => {
    const b = analyse(dataset, q, filter);
    return {
      full: needsOwnSlide(q, b),
      counts: needsCountsPage(
        sharesAcross(dataset, q, filter, b) !== null,
        slideBreakdown(q, b).parties,
      ),
    };
  });
  let n = 0;
  for (let i = 0; i < planned.length; ) {
    const first = planned[i]!;
    i += 1;
    if (!first.counts) continue;
    n += 1;
    const second = planned[i];
    if (!first.full && second && !second.full && second.counts) i += 1;
  }
  return n;
}

/**
 * Which map, if any, follows a question.
 *
 * One decision in one place, because the dialogue has to count the pages
 * the deck is about to draw and the deck has to draw them.
 *
 * - The question that names the area is followed by the map of where the
 *   reports came from.
 * - A yes/no question is shaded on the answer that matters: a rate per
 *   area is all a two-answer question has to say about the country, and
 *   pies of two slices are the one thing a pie map cannot draw.
 * - Anything else with two to five answers gets a pie on each area. Six
 *   slices of a pie the size of Banjul is a pattern of colour, not a
 *   chart, and a map of one pie is a pie.
 */
export function mapKindFor(
  dataset: Dataset,
  q: Question,
  b: Breakdown,
): 'area' | 'rate' | 'poor' | 'pie' | null {
  if (!dataset.geo) return null;
  if (isAreaQuestion(dataset, q)) return 'area';
  if (Object.keys(b.byArea).length < 3) return null;
  if (q.kind === 'binary') {
    const label = isInverted(q.label) ? 'No' : 'Yes';
    const hit = b.total.find((c) => c.label === label);
    return hit && hit.n > 0 ? 'rate' : null;
  }
  /*
   * A rating question is mapped on the worse end of its scale.
   *
   * Four answers pied across seven areas holding one or two reports
   * each is a page of coloured dots; what a mission wants off a map of
   * a rating is where the day was rated badly, which is what the
   * reference deck maps and nothing else. Nowhere rated badly draws no
   * map rather than an empty one - the dashboard still has the rates.
   */
  if (isRatingQuestion(q)) {
    const poor = poorLabels(q);
    const any = poor.some((a) => (b.total.find((c) => c.label === a)?.n ?? 0) > 0);
    return any ? 'poor' : null;
  }
  if (q.kind !== 'categorical' && q.kind !== 'ordinal') return null;
  const answers = b.total.filter((c) => !NON_ANSWERS.has(c.label)).length;
  return answers >= 2 && answers <= 5 ? 'pie' : null;
}

/**
 * The pages the deck draws around the chosen questions.
 *
 * A section's own page, a question's shares across the country, and its
 * map. The dialogue prints the number of slides an export will come to and
 * an analyst trusts it, so it is counted from the same rules the deck
 * draws from rather than guessed at.
 */
export function countExtraPages(
  dataset: Dataset,
  questions: Question[],
  selection: ExportSelection,
  filter?: boolean[],
): number {
  let n = sectionOverviews(dataset, questions, filter).length;
  // The headline rating gets a page of itself against the clock.
  const headline = ratingQuestions(dataset)[0];
  for (const q of questions) {
    const b = analyse(dataset, q, filter);
    if (sharesAcross(dataset, q, filter, b) !== null) n += 1;
    // The area's own map is the overview map, moved rather than added.
    const kind = selection.maps ? mapKindFor(dataset, q, b) : null;
    if (kind && kind !== 'area') n += 1;
    // The table of the stations the map shades, which is drawn whether
    // or not the maps are.
    if (isRatingQuestion(q)) {
      n += Math.ceil(poorReports(dataset, q, filter).length / POOR_ROWS);
    }
    if (
      headline &&
      q.columns[0] === headline.columns[0] &&
      (ratingByHour(dataset, q, filter)?.hours.length ?? 0) > 1
    ) {
      n += 1;
    }
  }
  return n;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  build(dataset: Dataset): Partial<ExportSelection>;
}

/**
 * The presets are the point: most people will press one of these and go,
 * and never open the question list at all.
 */
export const PRESETS: Preset[] = [
  {
    id: 'brief',
    name: 'Short brief',
    description: 'Coverage, maps and the ranked findings. No question pages. Around 6 slides.',
    build: () => ({
      coverage: true,
      maps: true,
      findingsTable: true,
      ratings: true,
      questions: [],
    }),
  },
  {
    id: 'flagged',
    name: 'Findings and the questions behind them',
    description: 'The short brief, plus a page for each question that flagged a problem.',
    build: (dataset) => ({
      coverage: true,
      maps: true,
      findingsTable: true,
      ratings: true,
      questions: findings(dataset, undefined, 50).map((f) => questionKey(f.question)),
    }),
  },
  {
    id: 'full',
    name: 'Everything',
    description: 'Every section and every question in the form.',
    build: (dataset) => ({
      coverage: true,
      maps: true,
      findingsTable: true,
      ratings: true,
      questions: exportableQuestions(dataset).map(questionKey),
    }),
  },
  {
    id: 'questions',
    name: 'Questions only',
    description: 'No summary sections. Useful when the front matter is already written.',
    build: (dataset) => ({
      coverage: false,
      maps: false,
      findingsTable: false,
      ratings: false,
      questions: exportableQuestions(dataset).map(questionKey),
    }),
  },
];

export function defaultSelection(dataset: Dataset, formName: string): ExportSelection {
  const preset = PRESETS.find((p) => p.id === 'flagged')!;
  return {
    title: formName,
    preparedBy: 'Data Analysis team',
    election: 'Presidential Election - The Gambia',
    electionDate: '5 December 2026',
    period: '',
    periodId: 'all',
    coverage: true,
    maps: true,
    findingsTable: true,
    ratings: true,
    questions: [],
    ...preset.build(dataset),
  };
}

/**
 * What an export is called before the analyst renames it.
 *
 * The sheet's own name, which on a form export is the form's own
 * ("Campaign Report"). It is the cover's title and now the downloaded
 * file's name as well, and neither reads properly as
 * "campaign-report-20261124-143212.xlsx". A workbook saved with a
 * spreadsheet's default sheet name says nothing about what is in it, so
 * that falls back to the file it came in.
 */
export function defaultTitle(fileName: string, sheetName: string): string {
  const sheet = sheetName.trim();
  const generic = /^(sheet|table|tabelle|hoja|feuille|foglio)\s*\d*$/i;
  const name = sheet && !generic.test(sheet) ? sheet : fileName.replace(/\.[^.]+$/, '') || fileName;
  /*
   * "Analysis of Form B Voting", not "Form B Voting".
   *
   * The title is printed on a cover and on a file, and the form's own
   * name alone reads as the form rather than as what was done with it -
   * a reader opening the deck would reasonably expect the questionnaire.
   */
  return /^analys/i.test(name) ? name : `Analysis of ${name}`;
}

/**
 * What a downloaded file is called.
 *
 * The title the dialogue was given, rather than a fixed
 * "observer-analysis": an analyst produces a deck for the Chief Observer
 * and another for the EMB in the same afternoon, and two files of the same
 * name land in Downloads as (1) and (2), which says nothing about which is
 * which. The period goes in the name as well - an all-period export and a
 * campaign-period one are the pair most easily confused - and the date, so
 * that this morning's file is still recognisable next week.
 */
export function exportFileName(selection: ExportSelection, extension: string): string {
  const base = selection.title
    // The source workbook's extension is noise in another file's name.
    .replace(/\.(xlsx|xlsm|xls|csv)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/, '');
  const stamp = new Date().toISOString().slice(0, 10);
  const parts = [base || 'observer-analysis', periodSlug(selection.periodId), stamp];
  return `${parts.filter(Boolean).join('-')}.${extension}`;
}

/** The selected questions, in form order rather than click order. */
export function selectedQuestions(dataset: Dataset, selection: ExportSelection): Question[] {
  const wanted = new Set(selection.questions);
  return exportableQuestions(dataset).filter((q) => wanted.has(questionKey(q)));
}

/**
 * How many slides the deck will come to.
 *
 * Questions no longer go two to a slide unconditionally: one with a by-area
 * comparison, or with more bars than fit half a page, takes a slide of its
 * own and the rest pair up. The count is therefore exact only if it packs the
 * questions the same way the deck does, so it does, through `slidesFor`.
 */
export function estimateSlides(
  selection: ExportSelection,
  /** The pages the questions themselves take. See `countQuestionPages`. */
  questionPages = 0,
  /** True where the form supports a turnout curve, which adds a page. */
  turnout = false,
  /** Pages that follow a question: its section, its shares, its map. */
  extras = 0,
): number {
  let n = 1; // cover
  if (selection.coverage) n += turnout ? 2 : 1;
  if (selection.maps) n += 1;
  if (selection.ratings) n += 1;
  n += questionPages;
  n += extras;
  return n;
}
