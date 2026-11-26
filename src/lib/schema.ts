/**
 * Infer the structure of an EOM observer form from its column headers.
 *
 * The forms follow a consistent grammar, which is what makes the whole
 * report automatable:
 *
 *   "C.2 Is there a long line of voters..."        single-answer question
 *   "C.3.1 If Yes, please specify:"                first option of a multi-answer block
 *   "C.3.1 If Yes, please specify: (Unrest)"       further options of the same block
 *   "4=Very good  3=Good  2=Bad  1=Very bad"       a legend, not a question
 *   "Chair of Polling and Counting Committee"      a sub-item under the preceding question
 *
 * The first column of a multi-answer block carries only the question name,
 * so its option label has to be recovered from the values in the column.
 *
 * Nothing here is specific to a country or to a particular form. Point it
 * at Form A, B, C or D and it works out what it is looking at.
 */

export type QuestionKind =
  | 'binary' // Yes / No, with optional NA or DK
  | 'categorical' // small set of unordered options
  | 'ordinal' // a rating or frequency scale with a known order
  | 'multi' // "tick all that apply", spread over several columns
  | 'numeric'
  | 'time'
  | 'text'
  | 'meta'; // identifiers and administrative fields

export interface Option {
  label: string;
  /** Index of the source column this option came from, for multi blocks. */
  column: number;
}

export interface Question {
  /** Question code, e.g. "C.3.1". Empty for fields that carry no code. */
  code: string;
  /** Question text with the code stripped off. */
  label: string;
  /** Section letter, e.g. "C". Derived from the code. */
  section: string;
  kind: QuestionKind;
  /** Columns that make up this question. One, except for multi blocks. */
  columns: number[];
  options: Option[];
  /** Ordered value domain for ordinal questions, worst to best. */
  scale?: string[];
  /**
   * What a stored answer is called on a chart.
   *
   * A form that scores a question 1 to 4 puts the key in a column of its
   * own - "4=Very good 3=Good 2=Bad 1=Very bad" - and then stores the
   * digit. A chart of 1, 2, 3 and 4 is unreadable without the key beside
   * it, so the key is read once here and the words are used everywhere.
   */
  valueLabels?: Record<string, string>;
  /**
   * What each column of a split block was headed with: the area names in
   * "B.2 Polling station constituency - Kanifing". It is the form's own
   * list of areas, which is how the tool knows whether a file reports
   * against eight Local Government Areas or seven regions.
   */
  columnLabels?: string[];
  /** Sub-items grouped under this question, e.g. the polling staff roles. */
  children?: Question[];
}

/* ------------------------------------------------------------------ */
/* Value domains                                                       */
/* ------------------------------------------------------------------ */

/** Values that mean "no answer", in any of the forms seen so far. */
const BLANKS = new Set(['', '.', '-', 'n/a', 'none']);

/** Answers that are present but carry no information about the question. */
export const NON_ANSWERS = new Set(['NA', 'DK', 'N/A', 'Not applicable']);

const YES_NO = ['Yes', 'No'];

/**
 * Known ordered scales, worst first. Order matters: a stacked bar that
 * sorts "Always, Mostly, Never, Sometimes" alphabetically is unreadable.
 */
const SCALES: string[][] = [
  ['Never', 'Sometimes', 'Mostly', 'Always'],
  ['Very bad', 'Bad', 'Not good/Not bad', 'Good', 'Very good'],
  ['1', '2', '3', '4', '5'],
  ['0', '1 to 3', '4 to 6', '7 or more'],
];

export function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  return BLANKS.has(String(value).trim().toLowerCase());
}

export function clean(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

/** Matches a leading question code such as "C.3.1" or "A.0". */
const CODE = /^([A-Z])\.(\d+(?:\.\d+)*)\s*/;

export function parseCode(header: string): { code: string; label: string; section: string } {
  const m = CODE.exec(header);
  if (!m) return { code: '', label: header, section: '' };
  return {
    code: `${m[1]}.${m[2]}`,
    label: header.slice(m[0].length).trim(),
    section: m[1]!,
  };
}

/**
 * The stem of a multi-answer column: everything before the "(option)"
 * suffix.
 *
 * The option is the *last* bracketed group, not the first. It used to be the
 * first, and "B.15 Language(s) of the speeches (Mandinka)" was therefore
 * read as the stem "B.15 Language" with the option "s) of the speeches
 * (Mandinka" — a stem that matched none of its siblings, so the block fell
 * apart and the question was charted as its own first column alone,
 * reporting "No speech delivered" and none of the seven languages. The
 * option may itself contain a bracketed part, as in "(Voting booth(s))" and
 * "((Tamper-evident) bags)", so one level of nesting is allowed inside it.
 */
function stem(header: string): { base: string; option: string | null } {
  const m = /^(.*)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*$/.exec(header);
  if (!m) return { base: header.trim(), option: null };
  return { base: m[1]!.trim(), option: m[2]!.trim() };
}

/** A legend column such as "4=Very good  3=Good  2=Bad  1=Very bad". */
function isLegend(header: string): boolean {
  return /\d\s*=\s*\w/.test(header) && !CODE.test(header);
}

/**
 * The scale a legend column spells out, as {digit: word}.
 *
 * Forms that score a question put the key in a column header of its own and
 * then store the digit, so the deck used to carry five charts of 1, 2, 3 and
 * 4 with the key nowhere on the slide. Split on each "<digit>=", so a word
 * with a space in it stays whole.
 */
export function parseLegend(header: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const part of header.split(/\s+(?=\d+\s*=)/)) {
    const m = /^(\d+)\s*=\s*(.+)$/.exec(part.trim());
    if (m) out[m[1]!] = m[2]!.trim();
  }
  return Object.keys(out).length > 1 ? out : null;
}

/**
 * Whether a legend runs best-first, as "1=Very good ... 4=Very bad" does.
 *
 * Every scale in this tool is held worst first, because that is the order a
 * stacked bar and a mean score both need. A legend numbered the other way
 * round would otherwise score a station rated "very bad" as a four.
 */
function legendIsReversed(words: string[]): boolean {
  const first = words[0] ?? '';
  const last = words[words.length - 1] ?? '';
  return /good|excellent|satisfactory/i.test(first) && /bad|poor/i.test(last);
}

function matchScale(values: Set<string>): string[] | undefined {
  const present = [...values].filter((v) => !NON_ANSWERS.has(v));
  if (present.length < 2) return undefined;
  for (const scale of SCALES) {
    const lower = scale.map((s) => s.toLowerCase());
    if (present.every((v) => lower.includes(v.toLowerCase()))) {
      // Keep only the points actually used, in the scale's own order.
      return scale.filter((s) => present.some((v) => v.toLowerCase() === s.toLowerCase()));
    }
  }
  return undefined;
}

function looksNumeric(values: string[]): boolean {
  if (values.length === 0) return false;
  const numericish = values.filter((v) => /^-?\d+(\.\d+)?$/.test(v));
  return numericish.length / values.length > 0.9;
}

function looksLikeTime(values: string[]): boolean {
  if (values.length === 0) return false;
  return values.filter((v) => /^\d{1,2}:\d{2}(:\d{2})?$/.test(v)).length / values.length > 0.8;
}

/* ------------------------------------------------------------------ */
/* Table reading                                                       */
/* ------------------------------------------------------------------ */

export interface Table {
  headers: string[];
  rows: string[][];
}

/**
 * Find the header row. These exports put a title in row 1, so the header is
 * whichever of the first few rows has the most distinct non-empty strings.
 */
export function findHeaderRow(grid: unknown[][]): number {
  let best = 0;
  let bestScore = -1;
  for (let r = 0; r < Math.min(6, grid.length); r += 1) {
    const row = grid[r] ?? [];
    const score = new Set(row.map(clean).filter((v) => v.length > 1)).size;
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

export function toTable(grid: unknown[][]): Table {
  const headerRow = findHeaderRow(grid);
  const headers = (grid[headerRow] ?? []).map(clean);
  const rows: string[][] = [];
  for (let r = headerRow + 1; r < grid.length; r += 1) {
    const row = (grid[r] ?? []).map(clean);
    if (row.some((v) => v.length > 0)) rows.push(row);
  }
  readClockTimes(headers, rows);
  return { headers, rows };
}

/* ------------------------------------------------------------------ */
/* Clock times                                                         */
/* ------------------------------------------------------------------ */

/**
 * Excel serials for 1990 and 2100. A real date cell lands inside this
 * window; a count of voters or of ballot papers does not.
 */
const SERIAL_MIN = 32_874;
const SERIAL_MAX = 73_415;

/** Whether a value is an Excel date-time, or a bare time, rather than a count. */
function isSerialTime(value: string): boolean {
  if (!/^\d+(\.\d+)?$/.test(value)) return false;
  const n = Number(value);
  if (!Number.isFinite(n)) return false;
  // No fractional part is a date with no clock time, which is not a time.
  if (n === Math.floor(n)) return false;
  return (n >= SERIAL_MIN && n <= SERIAL_MAX) || n < 1;
}

/** The clock time an Excel serial holds, as "07:20". */
function clockTime(serial: number): string {
  const minutes = Math.round((serial - Math.floor(serial)) * 1440) % 1440;
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  return `${hh}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * Rewrite columns of Excel date-times as the clock time they hold.
 *
 * "A.2 Time of arrival" is a real date cell in the mission's exports, and a
 * date cell read without `cellDates` is a serial number: 46361.3194. Every
 * such value looks numeric, so the whole column was classified as a number
 * and the deck printed the arrival time of a hundred observers as a total of
 * 46,361 with bands either side of it. Read as a time it is 07:40, and the
 * question gets the chart it was always meant to have.
 *
 * The date is dropped, not kept: these columns answer "when in the day", and
 * every report in a polling-day file is from the same day. Columns that date
 * the report itself are left alone, because `parseDay` reads the serial and
 * the period filter depends on it.
 */
function readClockTimes(headers: string[], rows: string[][]): void {
  headers.forEach((header, col) => {
    if (META_HEADERS.test(header) || /\bdate\b/i.test(header)) return;
    const values = rows.map((r) => r[col] ?? '').filter((v) => !isBlank(v));
    if (values.length === 0) return;
    if (values.filter(isSerialTime).length / values.length < 0.8) return;
    rows.forEach((r) => {
      const v = r[col];
      if (v !== undefined && isSerialTime(v)) r[col] = clockTime(Number(v));
    });
  });
}

/* ------------------------------------------------------------------ */
/* Inference                                                           */
/* ------------------------------------------------------------------ */

/** Column headers that identify the report rather than answer a question. */
const META_HEADERS = /^(source|username|date|submitted|timestamp|id)$/i;

/**
 * The stem of a column split across one option each, as "B.2 Polling
 * station constituency - Kanifing" is.
 *
 * Not the same shape as a multi-answer block, which brackets its option and
 * can be ticked several times over. These columns are one question asked
 * once: the form lays out a separate column per area, and each report fills
 * exactly one of them.
 */
export function splitBase(header: string): { base: string; suffix: string } | null {
  const m = /^(.*\S)\s+[-\u2013\u2014]\s+(\S[^-\u2013\u2014]*)$/.exec(header);
  if (!m) return null;
  return { base: m[1]!.trim(), suffix: m[2]!.trim() };
}

/** What a column holds, from what is in it. Null for a column worth nothing. */
function classify(
  header: string,
  code: string,
  vals: string[],
  legend: Record<string, string> | null,
): { kind: QuestionKind; scale?: string[] } | null {
  const distinct = new Set(vals);

  // A column holding a single repeated value and carrying no question code
  // is a marker or a constant, not a question. Charting it wastes a slide.
  // This has to be tested before classification, or the categorical branch
  // claims it first.
  if (distinct.size === 1 && !code && !META_HEADERS.test(header)) return null;
  if (META_HEADERS.test(header)) return { kind: 'meta' };
  if (looksLikeTime(vals)) return { kind: 'time' };
  const scale = matchScale(distinct);
  /*
   * A column of bare digits is a rating only where a legend says so.
   *
   * "1 2 3 4 5" is in the list of scales because the forms store a rating
   * as the digit and spell the words out in a legend column of their own.
   * Without that legend there is nothing to say the digits are a scale,
   * and "E.1 How many polling staff members are present" - answered 1, 3,
   * 4 and 5 - was drawn in the rating palette with 1 shaded as the worst
   * answer on the slide, beside "E.1.1 How many of the polling staff are
   * female", which held a 0 and so was read as the count it is. A number
   * the tool cannot name is a number.
   */
  const digits = scale?.every((v) => /^\d+$/.test(v)) ?? false;
  const keyed =
    legend !== null &&
    [...distinct].every((v) => NON_ANSWERS.has(v) || legend[v] !== undefined);
  if (scale && (!digits || keyed)) return { kind: 'ordinal', scale };
  if (looksNumeric(vals)) return { kind: 'numeric' };
  if (
    distinct.size <= 3 &&
    [...distinct].every((v) => YES_NO.includes(v) || NON_ANSWERS.has(v))
  ) {
    return { kind: 'binary' };
  }
  if (distinct.size > 0 && distinct.size <= 12 && vals.length > distinct.size) {
    return { kind: 'categorical' };
  }
  if (distinct.size === 0) return null; // an empty column tells us nothing
  return { kind: 'text' };
}

export function inferSchema(table: Table): Question[] {
  const { headers, rows } = table;
  const n = headers.length;

  const valuesFor = (col: number): string[] =>
    rows.map((r) => (col < r.length ? r[col]! : '')).filter((v) => !isBlank(v));

  const questions: Question[] = [];
  let i = 0;
  /** The scale most recently spelled out by a legend column, if any. */
  let legend: Record<string, string> | null = null;

  while (i < n) {
    const header = headers[i] ?? '';

    if (isLegend(header)) {
      legend = parseLegend(header) ?? legend;
      i += 1;
      continue;
    }
    if (!header) {
      i += 1;
      continue;
    }

    const { code, label, section } = parseCode(header);
    const { base } = stem(header);

    // A multi-answer block: this column has a code and no "(option)", and
    // the next column repeats the same stem with one.
    const blockCols: number[] = [i];
    if (code) {
      let j = i + 1;
      while (j < n) {
        const next = headers[j] ?? '';
        const s = stem(next);
        if (s.option !== null && s.base === base) {
          blockCols.push(j);
          j += 1;
        } else {
          break;
        }
      }
    }

    /*
     * A question the form split into one column per area.
     *
     * "B.2 Polling station constituency" is seven columns, one for each
     * Local Government Area, and a report fills the one its station is in.
     * Read column by column they are seven questions, six of them nearly
     * empty, and the tool's constituency figures came from whichever single
     * column happened to resolve most often - so a hundred reports from all
     * eight areas were counted as covering one area's constituencies. Read
     * together they are the one question they were printed as.
     */
    const split = splitBase(header);
    if (split) {
      const cols = [i];
      let j = i + 1;
      while (j < n) {
        const next = splitBase(headers[j] ?? '');
        if (!next || next.base !== split.base) break;
        cols.push(j);
        j += 1;
      }
      // Only where the form really does ask it once: a row filling two of
      // the columns means they are separate questions that happen to share
      // a stem, such as a count asked of men and of women.
      const multiple = rows.filter(
        (r) => cols.filter((c) => !isBlank(clean(r[c] ?? ''))).length > 1,
      ).length;
      if (cols.length > 1 && multiple <= rows.length * 0.1) {
        const vals = cols.flatMap((c) => valuesFor(c));
        const parsed = parseCode(split.base);
        const kindOf = classify(split.base, parsed.code, vals, legend);
        if (kindOf) {
          questions.push({
            code: parsed.code,
            label: parsed.label || split.base,
            section: parsed.section,
            kind: kindOf.kind,
            columns: cols,
            options: [...new Set(vals)].map((v) => ({ label: v, column: cols[0]! })),
            scale: kindOf.scale,
            columnLabels: cols.map((c) => splitBase(headers[c] ?? '')?.suffix ?? ''),
          });
        }
        i = cols[cols.length - 1]! + 1;
        continue;
      }
    }

    if (blockCols.length > 1) {
      const options: Option[] = blockCols.map((col) => {
        const s = stem(headers[col] ?? '');
        if (s.option !== null) return { label: s.option, column: col };
        // First column of the block: recover its label from the data.
        const distinct = [...new Set(valuesFor(col))];
        return { label: distinct.length === 1 ? distinct[0]! : 'Unspecified', column: col };
      });
      questions.push({ code, label, section, kind: 'multi', columns: blockCols, options });
      i = blockCols[blockCols.length - 1]! + 1;
      continue;
    }

    // Single column. Classify it by what is in it.
    const vals = valuesFor(i);
    const distinct = new Set(vals);
    const kindOf = classify(header, code, vals, legend);
    if (!kindOf) {
      i += 1;
      continue;
    }
    const kind = kindOf.kind;
    let scale = kindOf.scale;

    /*
     * A scored question wears the words from its legend.
     *
     * The legend is a column of its own - "4=Very good 3=Good 2=Bad 1=Very
     * bad" - and the answers are stored as digits, so without this every
     * rating chart on the slide reads 1, 2, 3, 4 and the key is nowhere
     * near it. Applied only where every value the column holds is a point
     * on that scale, so a later question that happens to answer in small
     * numbers is left alone.
     */
    let valueLabels: Record<string, string> | undefined;
    if (legend && kind === 'ordinal' && scale && scale.every((v) => legend![v] !== undefined)) {
      valueLabels = legend;
      // The whole scale the form offers, not only the points the observers
      // used: "the better half of the scale" is a different half on a
      // four-point scale that happens to have been answered three ways.
      const words = Object.keys(legend)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => legend![k]!);
      scale = legendIsReversed(words) ? [...words].reverse() : words;
    }

    questions.push({
      code,
      label: label || header,
      section,
      kind,
      columns: [i],
      options: [...distinct].map((label2) => ({ label: label2, column: i })),
      scale,
      valueLabels,
    });
    i += 1;
  }

  return questions;
}

/**
 * Group the questions that carry no code under the preceding coded one.
 * These are the sub-items, such as the polling staff roles listed beneath
 * "E.1 Polling staff members present".
 */
export function nestSubItems(questions: Question[]): Question[] {
  const out: Question[] = [];
  for (const q of questions) {
    const prev = out[out.length - 1];
    if (!q.code && prev && prev.code && q.kind !== 'meta' && prev.kind !== 'multi') {
      (prev.children ??= []).push(q);
    } else {
      out.push(q);
    }
  }
  return out;
}
