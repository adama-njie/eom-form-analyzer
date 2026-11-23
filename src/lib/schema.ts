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
  return { headers, rows };
}

/* ------------------------------------------------------------------ */
/* Inference                                                           */
/* ------------------------------------------------------------------ */

/** Column headers that identify the report rather than answer a question. */
const META_HEADERS = /^(source|username|date|submitted|timestamp|id)$/i;

export function inferSchema(table: Table): Question[] {
  const { headers, rows } = table;
  const n = headers.length;

  const valuesFor = (col: number): string[] =>
    rows.map((r) => (col < r.length ? r[col]! : '')).filter((v) => !isBlank(v));

  const questions: Question[] = [];
  let i = 0;

  while (i < n) {
    const header = headers[i] ?? '';

    if (!header || isLegend(header)) {
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

    // A column holding a single repeated value and carrying no question
    // code is a marker or a constant, not a question. Charting it wastes a
    // slide. This has to be tested before classification, or the
    // categorical branch claims it first.
    if (distinct.size === 1 && !code && !META_HEADERS.test(header)) {
      i += 1;
      continue;
    }

    let kind: QuestionKind;
    let scale: string[] | undefined;

    if (META_HEADERS.test(header)) {
      kind = 'meta';
    } else if (looksLikeTime(vals)) {
      kind = 'time';
    } else if ((scale = matchScale(distinct))) {
      kind = 'ordinal';
    } else if (looksNumeric(vals)) {
      kind = 'numeric';
    } else if (
      distinct.size <= 3 &&
      [...distinct].every((v) => YES_NO.includes(v) || NON_ANSWERS.has(v))
    ) {
      kind = 'binary';
    } else if (distinct.size > 0 && distinct.size <= 12 && vals.length > distinct.size) {
      kind = 'categorical';
    } else if (distinct.size === 0) {
      i += 1;
      continue; // an entirely empty column tells us nothing

    } else {
      kind = 'text';
    }

    questions.push({
      code,
      label: label || header,
      section,
      kind,
      columns: [i],
      options: [...distinct].map((label2) => ({ label: label2, column: i })),
      scale,
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
