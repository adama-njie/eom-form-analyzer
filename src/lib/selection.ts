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
import { analyse, displayCounts, findings, isWordCloud } from './analyse';
import { columnWidth, fitsAt } from './layout';
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
 * Text questions are in only when their answers are prose, which gets a word
 * cloud. A text column holding a constituency or a station code is an
 * identifier and has nothing to show.
 */
export function exportableQuestions(dataset: Dataset): Question[] {
  return dataset.questions.filter((q) => {
    if (q.kind === 'meta' || q.columns.length === 0) return false;
    if (q.kind === 'text') return isWordCloud(dataset, q);
    return true;
  });
}

/**
 * Whether a question's answers can usefully be stacked across groups.
 *
 * Only for questions with a handful of answers: stacking nine answer colours
 * across eight groups produces a chart that is coloured in rather than read.
 */
function stackable(q: Question, b: Breakdown): boolean {
  if (q.kind !== 'binary' && q.kind !== 'ordinal' && q.kind !== 'categorical') return false;
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

/** How many of the chosen questions will take a slide to themselves. */
export function countOwnSlides(
  dataset: Dataset,
  questions: Question[],
  filter?: boolean[],
): number {
  return questions.filter((q) => needsOwnSlide(q, analyse(dataset, q, filter))).length;
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
    coverage: true,
    maps: true,
    findingsTable: true,
    ratings: true,
    questions: [],
    ...preset.build(dataset),
  };
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
  questionCount: number,
  heavy = 0,
): number {
  let n = 1; // cover
  if (selection.coverage) n += 1;
  if (selection.maps) n += 2;
  if (selection.findingsTable) n += 1 + 3; // table plus mapped findings
  if (selection.ratings) n += 1;
  n += heavy + Math.ceil(Math.max(0, questionCount - heavy) / 2);
  return n;
}
