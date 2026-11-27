/**
 * Turn a parsed form into the numbers the report needs.
 *
 * Everything is computed from the inferred schema, so adding a question to a
 * form, or swapping Form B for Form D, needs no code change.
 */

import {
  ALL_CONSTITUENCIES,
  AREA_WORDS,
  CENTRAL_RIVER_UNIT,
  LGAS,
  TOTAL_REGISTERED_2026,
  areaUnits,
  lgaName,
  resolveConstituency,
  resolveLga,
  unitCodeFor,
  type AreaUnit,
  type Division,
  type LgaCode,
} from './gambia';
import {
  NON_ANSWERS,
  clean,
  isBlank,
  parseCode,
  splitBase,
  type Question,
  type Table,
} from './schema';
import { isProse } from './text';

export interface Count {
  label: string;
  n: number;
  pct: number;
}

export interface Breakdown {
  /** Counts over all reports that answered. */
  total: Count[];
  /** Counts per area, keyed by area code. Empty when no area column exists. */
  byArea: Record<string, Count[]>;
  /**
   * Counts per party, for a form that records which party an event belonged
   * to. Empty for a polling-day form, which has no such column.
   */
  byParty: Record<string, Count[]>;
  /** Reports that answered at all, excluding NA and DK. */
  answered: number;
  /**
   * Reports the breakdown was taken over, answered or not.
   *
   * The base for a multi-answer block, where one report ticks several
   * options and the count of ticks is not a count of reports.
   */
  reports: number;
  /** Reports that returned NA or DK. */
  notApplicable: number;
  /**
   * For numeric questions: the shape of the answers, not their average.
   *
   * A mean queue length of 23.4 is a number nobody can act on, and the median
   * and mode are worse: they describe the middle of a distribution whose tail
   * is the entire point. What a mission wants to know is how many stations
   * reported a long queue, which is a distribution, so that is what is kept.
   * The total is retained because summing an observed count (voters served,
   * ballots issued) is a real figure; the averages are not.
   */
  numeric?: { n: number; sum: number; bins: Count[] };
  /** For ordinal questions scored 1..k, the mean score. */
  meanScore?: number;
  /**
   * For a question that asks for a percentage, the percentage.
   *
   * Set only for those. Every other number is a count of something, and a
   * mean count is the figure this tool refuses to print; but "estimated %
   * of female participants" is already a rate, and the thing a reader
   * wants from thirty-six of them is their average, by party and by area.
   * Bands answered a different question - how many events were between 40
   * and 59% - which is not what was asked.
   */
  percent?: Percentage;
}

/** One group's average, and how many reports it rests on. */
export interface GroupMean {
  label: string;
  mean: number;
  n: number;
}

export interface Percentage {
  /** The mean of the observers' estimates. */
  mean: number;
  /** How many reports gave one. */
  n: number;
  byParty: GroupMean[];
  byArea: GroupMean[];
  /**
   * By the kind of place, where the form asks what kind of place it is.
   *
   * Set beside `counted`, on a share summed from the counts observers
   * took: a rural station and an urban one are not the same
   * observation, and the questions around it on the deck are split that
   * way already. A mean of estimates is not split this way, because the
   * pages it is drawn on have the party to fit.
   */
  byType?: GroupMean[];
  /**
   * What the figure is a share of, where it was worked out rather than
   * asked for. "32%" under a question headed "Total number of voters who
   * had already voted" is not a figure a reader can place without it.
   */
  basis?: string;
  /**
   * The two numbers behind a share that was summed rather than averaged.
   *
   * "53%" is a share of the polling staff observed, and a reader cannot
   * tell whether that is 25 of 47 or 2 of 4 without being told. Written
   * beside the basis, never instead of it.
   */
  counted?: { part: number; whole: number };
}

/**
 * A mean percentage, written for a reader.
 *
 * Whole numbers, because the estimates behind them are whole numbers,
 * and no decimals anywhere a percentage is written. A figure too small
 * to round to one is written "<1" rather than "0": B.10 averages
 * 0.54%, and "0%" says nobody when several reports said somebody.
 */
export function meanLabel(value: number): string {
  if (value > 0 && Math.round(value) === 0) return '<1';
  return String(Math.round(value));
}

/**
 * A mean score, written for a reader: one decimal place.
 *
 * Two decimals said more than the scale knows. A mean of 3.44 out of 4 is
 * drawn from reports that each answered 3 or 4, and the second decimal
 * moves with a single report; the figure is a summary of a briefing's
 * worth of judgement, not a measurement. One place everywhere it is
 * written - the deck, the dashboard, the Word report and the sentences
 * in it - so the same figure reads the same in all of them.
 */
export function scoreLabel(value: number): string {
  return value.toFixed(1);
}

export interface Dataset {
  table: Table;
  questions: Question[];
  /** Column index holding the area or district, if one was found. */
  areaColumn: number | null;
  /**
   * Which division of the country this file reports against: the eight
   * Local Government Areas, or the seven regions. Read from the file in
   * `divisionOf`, or set by the analyst.
   */
  division: Division;
  /** The areas of the country as this file counts them, west to east. */
  areas: AreaUnit[];
  /**
   * The area each row belongs to, as this file counts them. In a
   * seven-region file a Central River report is keyed by Janjanbureh,
   * which is the region's own name on these forms.
   */
  rowArea: (LgaCode | null)[];
  /**
   * Grouping label per row: the Gambian area name where it resolves, and
   * otherwise whatever the file itself says. A form from another country,
   * or a Gambian form using names this tool has not seen, still gets a full
   * breakdown; only the map needs real Gambian areas.
   */
  rowGroup: (string | null)[];
  /** Distinct group labels, in a stable order. */
  groups: string[];
  /** True when the groups are Gambian areas, so the map can be drawn. */
  geo: boolean;
  /** Column index holding the constituency, if one was found. */
  constituencyColumn: number | null;
  /**
   * Every column the constituency question occupies. More than one where
   * the form asks it once per area, as the polling-day form does.
   */
  constituencyColumns: number[];
  /** Resolved constituency per row, where the observer's entry matched. */
  rowConstituency: (string | null)[];
  /** Constituencies that appear in the data, in geographic order. */
  constituencies: string[];
  /**
   * Column index holding the date each report is about, if the form has one.
   * The event's own date where the form asks for it, and otherwise the date
   * the report was submitted.
   */
  dateColumn: number | null;
  /**
   * The day each report is about, as UTC midnight, where it could be read.
   * Null for a report whose date is blank or unreadable, which must be
   * excluded from any view of a period rather than guessed at.
   */
  rowDay: (number | null)[];
  /** Column index holding the team type, if found. */
  teamColumn: number | null;
  rowTeam: string[];
  /**
   * Column index holding the party, candidate or coalition behind the event,
   * if the form has one. A campaign form does; a polling-day form does not.
   */
  partyColumn: number | null;
  rowParty: (string | null)[];
  /** Parties that appear, commonest first. */
  parties: string[];
}

/* ------------------------------------------------------------------ */
/* Locating the geography and team columns                             */
/* ------------------------------------------------------------------ */

const AREA_HINTS = /(electoral district|district|region|governorate|area|lga|constituenc)/i;
/**
 * The column naming the team that filed the report.
 *
 * Form B asks "A.0 Team type" (LTO, STO, CT); the campaign form asks "A.1
 * LTO team" and answers LTO01 to LTO08. Either is the right thing to count
 * reports by, so the match is on the word itself. It used to be narrower,
 * so a campaign export matched nothing, every report fell into a bucket
 * called "Unspecified", and the coverage slide reported one team where
 * there were eight.
 */
const TEAM_HINTS = /\bteam\b|observer type/i;
/**
 * The column naming the party behind an event.
 *
 * A campaign form asks "Which candidate/party/coalition organised or was
 * supported in this event", which is the dimension the reference report
 * breaks everything down by. Matched on the wording rather than the code,
 * because the code differs between forms.
 */
const PARTY_HINTS =
  /(candidate\s*\/\s*party|party\s*\/\s*coalition|which (candidate|party)|political party|party supported|organised or was supported)/i;
/** A column that might hold a date. Its values decide whether it does. */
const DATE_HINTS = /\bdate\b/i;
/**
 * A date column that is about the thing observed rather than about the form.
 *
 * Every export carries a submission timestamp in a column called "Date",
 * and the campaign form also asks "B.1 Date of the Event". They differ: an
 * event on the 15th can be filed on the 17th, and it is the event that
 * belongs to a period.
 */
const EVENT_DATE_HINTS = /\b(event|poll|polling|visit|observation|meeting|rally)\b/i;

/**
 * The day a date answer names, as UTC midnight, or null if it is not a date.
 *
 * Three formats reach here. The mission's own exports write ISO
 * ("2026-11-16", or "2026-11-16 09:12:33" for a submission timestamp). A
 * workbook holding a real date cell arrives as an Excel serial number,
 * because the sheet is read without `cellDates` and a serial is what that
 * leaves. And a date typed into a text column is written day first
 * ("16/11/2026"), as the mission's forms do everywhere else; "11/16/2026"
 * reads as the same day, because a second component above twelve can only
 * be a day.
 *
 * Everything is reduced to the day, in UTC. A timestamp's clock time is
 * dropped rather than converted: which day an event happened on must not
 * depend on the time zone of the laptop the file is opened on.
 */
export function parseDay(value: string): number | null {
  const s = value.trim();
  if (!s) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?![\d-])/.exec(s);
  if (iso) return utcDay(+iso[1]!, +iso[2]!, +iso[3]!);

  const written = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?!\d)/.exec(s);
  if (written) {
    const first = +written[1]!;
    const second = +written[2]!;
    const monthFirst = first <= 12 && second > 12;
    return monthFirst
      ? utcDay(+written[3]!, first, second)
      : utcDay(+written[3]!, second, first);
  }

  if (/^\d+(\.\d+)?$/.test(s)) {
    const ms = Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86_400_000;
    const year = new Date(ms).getUTCFullYear();
    return year >= 1990 && year <= 2100 ? ms : null;
  }
  return null;
}

function utcDay(year: number, month: number, day: number): number | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ms = Date.UTC(year, month - 1, day);
  const d = new Date(ms);
  // Date.UTC rolls 31 April into 1 May. A date that rolls was never a date.
  return d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? ms : null;
}

/**
 * Which division of the country a file reports against.
 *
 * It cannot be read from the names, because both divisions call the place
 * Janjanbureh: on the campaign form it is one of eight Local Government
 * Areas, and on the polling-day forms it is the whole of Central River,
 * named after its administrative capital. So the file has to say so
 * itself, and three things can:
 *
 *   - a report filed from Kuntaur, which only the eight-area list offers;
 *   - the form's own list of areas, which a question split into a column
 *     per area prints in its headers - seven of them, Kuntaur missing;
 *   - a Kuntaur constituency filed under Janjanbureh, which can only
 *     happen where Janjanbureh means the region.
 *
 * Eight is the answer when nothing says otherwise. The two errors are not
 * equal: reading an eight-area file as seven would report a deployment
 * that never reached Kuntaur as complete coverage, and a coverage figure
 * that overstates itself is the one mistake this tool must not make. The
 * header offers the analyst the switch for the file that says nothing
 * either way.
 */
export function divisionOf(
  questions: Question[],
  rowLga: (LgaCode | null)[],
  rowConstituency: (string | null)[],
): Division {
  if (rowLga.includes('KUN')) return 'lga';

  for (const q of questions) {
    const labels = q.columnLabels;
    if (!labels || labels.length < 5) continue;
    const codes = labels.map((l) => resolveLga(l));
    if (codes.some((c) => c === null)) continue;
    const named = new Set(codes as LgaCode[]);
    if (named.size === LGAS.length - 1 && !named.has('KUN') && named.has(CENTRAL_RIVER_UNIT)) {
      return 'region';
    }
  }

  const kuntaur = new Set(LGAS.find((a) => a.code === 'KUN')?.constituencies ?? []);
  for (let i = 0; i < rowLga.length; i += 1) {
    const c = rowConstituency[i];
    if (rowLga[i] === CENTRAL_RIVER_UNIT && c && kuntaur.has(c)) return 'region';
  }

  return 'lga';
}

export function buildDataset(
  table: Table,
  questions: Question[],
  /** The analyst's own choice, where they have made one. */
  divisionOverride?: Division,
): Dataset {
  const { headers, rows } = table;

  let areaColumn: number | null = null;
  let bestHits = 0;
  headers.forEach((h, i) => {
    if (!AREA_HINTS.test(h)) return;
    // Prefer the column whose values actually resolve to Gambian areas.
    const hits = rows.reduce(
      (acc, r) => acc + (resolveLga(clean(r[i] ?? '')) ? 1 : 0),
      0,
    );
    if (hits > bestHits || (areaColumn === null && hits === 0 && bestHits === 0)) {
      bestHits = hits;
      areaColumn = i;
    }
  });

  /*
   * The constituency question is whichever one resolves to the most known
   * constituencies, rather than whichever is named most plausibly.
   *
   * A question, not a column: the polling-day form asks for the
   * constituency in seven columns, one per Local Government Area, and the
   * report fills the one its station is in. Read as columns, the best of
   * them held a seventh of the reports and the tool's constituency
   * coverage was a seventh of the truth.
   */
  let constituencyColumns: number[] = [];
  let bestConstHits = 0;
  for (const q of questions) {
    if (q.kind === 'multi' || q.kind === 'meta') continue;
    if (areaColumn !== null && q.columns.includes(areaColumn)) continue;
    if (!/(constituenc|district|area|ward)/i.test(q.label)) continue;
    const hits = rows.reduce(
      (acc, r) => acc + (answersFor(q, r).some((a) => resolveConstituency(a)) ? 1 : 0),
      0,
    );
    if (hits > bestConstHits) {
      bestConstHits = hits;
      constituencyColumns = q.columns;
    }
  }
  const constituencyColumn: number | null = constituencyColumns[0] ?? null;

  /*
   * The first column whose header names a team and whose values look like
   * teams: filled in, and not so many distinct values that it is really a
   * free-text field. "A.1 Team number - STO" sits next to "A.0 Team type"
   * on Form B and both match, so first wins.
   */
  const teamColumn = headers.findIndex((h, i) => {
    if (!TEAM_HINTS.test(h)) return false;
    const values = rows.map((r) => clean(r[i] ?? '')).filter((v) => !isBlank(v));
    if (values.length < rows.length * 0.5) return false;
    return new Set(values).size <= 40;
  });

  /*
   * The party column, if there is one.
   *
   * Deliberately not any column mentioning a party: a campaign form also has
   * "If other candidate, please specify" and several "gifts with party
   * motifs" options, none of which is the event's organiser. The header must
   * match one of the organiser phrasings and the column must actually be
   * filled in, so a free-text follow-up answered twice is not mistaken for
   * the grouping.
   */
  const partyColumn = (() => {
    const i = headers.findIndex((h) => PARTY_HINTS.test(h));
    if (i < 0) return null;
    const filled = rows.filter((r) => !isBlank(clean(r[i] ?? ''))).length;
    return rows.length > 0 && filled / rows.length >= 0.5 ? i : null;
  })();

  const rowParty = rows.map((r) => {
    if (partyColumn === null) return null;
    const v = clean(r[partyColumn] ?? '');
    return isBlank(v) || NON_ANSWERS.has(v.toUpperCase()) ? null : v;
  });

  const partyTally = new Map<string, number>();
  for (const party of rowParty) {
    if (party) partyTally.set(party, (partyTally.get(party) ?? 0) + 1);
  }
  const parties = [...partyTally.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);

  /*
   * The date column, if the form has one.
   *
   * A header naming a date is not enough - "A.2 Time of arrival" and "D.2
   * Total number of voters" both mention neither, but a column called
   * "Updated" might hold anything - so the values have to read as dates
   * too. Where a form has both the event's date and the submission
   * timestamp, the event wins, and a coded question beats an uncoded
   * administrative column.
   */
  const dateColumn = (() => {
    const candidates = headers
      .map((h, i) => {
        if (!DATE_HINTS.test(h)) return null;
        const filled = rows
          .map((r) => clean(r[i] ?? ''))
          .filter((v) => !isBlank(v));
        if (filled.length < rows.length * 0.5) return null;
        const read = filled.filter((v) => parseDay(v) !== null).length;
        if (filled.length === 0 || read / filled.length < 0.8) return null;
        const rank = EVENT_DATE_HINTS.test(h) ? 2 : parseCode(h).code ? 1 : 0;
        return { i, rank };
      })
      .filter((c): c is { i: number; rank: number } => c !== null);
    if (candidates.length === 0) return null;
    return candidates.sort((a, b) => b.rank - a.rank || a.i - b.i)[0]!.i;
  })();

  const rowDay = rows.map((r) =>
    dateColumn === null ? null : parseDay(clean(r[dateColumn] ?? '')),
  );

  const rowLga = rows.map((r) =>
    areaColumn === null ? null : resolveLga(clean(r[areaColumn] ?? '')),
  );
  const rowConstituency = rows.map((r) => {
    for (const col of constituencyColumns) {
      const hit = resolveConstituency(clean(r[col] ?? ''));
      if (hit) return hit.name;
    }
    return null;
  });
  const division = divisionOverride ?? divisionOf(questions, rowLga, rowConstituency);
  const areas = areaUnits(division);
  // Folded on the way in, so everything downstream counts the areas the
  // file itself reports against.
  const rowArea = rowLga.map((code) => (code ? unitCodeFor(code, division) : null));
  const rowTeam = rows.map((r) => (teamColumn >= 0 ? clean(r[teamColumn] ?? '') : ''));

  // Use Gambian areas when most rows resolve to them, and the file's own
  // district labels otherwise.
  const resolved = rowArea.filter(Boolean).length;
  const geo = rows.length > 0 && resolved / rows.length >= 0.5;

  const rowGroup = rows.map((r, i) => {
    if (geo) return rowArea[i] ? lgaName(rowArea[i]!) : null;
    if (areaColumn === null) return null;
    const raw = clean(r[areaColumn] ?? '');
    return raw || null;
  });

  const groups = geo
    ? areas.filter((a) => rowArea.includes(a.code)).map((a) => a.name)
    : [...new Set(rowGroup.filter((g): g is string => Boolean(g)))].sort();

  const seenConstituencies = new Set(rowConstituency.filter(Boolean) as string[]);
  const constituencies = areas.flatMap((a) =>
    a.constituencies.filter((c) => seenConstituencies.has(c)),
  );

  return {
    table,
    questions,
    areaColumn,
    division,
    areas,
    rowArea,
    rowGroup,
    groups,
    geo,
    constituencyColumn,
    constituencyColumns,
    rowConstituency,
    constituencies,
    dateColumn,
    rowDay,
    teamColumn,
    rowTeam,
    partyColumn,
    rowParty,
    parties,
  };
}

/* ------------------------------------------------------------------ */
/* Aggregation                                                         */
/* ------------------------------------------------------------------ */

/**
 * Rank for ordering one chart's answers.
 *
 * Three bands: the answers the form offered, in the order the form offers
 * them; anything else the observers wrote, commonest first; and NA or DK
 * last. NA is charted, because a question most reports could not answer is
 * a result in itself, but it is never the headline and must never be the
 * bar a reader's eye lands on first.
 */
function rankOf(label: string, order?: string[]): number {
  if (NON_ANSWERS.has(label)) return 2;
  return order && !order.includes(label) ? 1 : 0;
}

function toCounts(tally: Map<string, number>, order?: string[]): Count[] {
  const total = [...tally.values()].reduce((a, b) => a + b, 0);
  const entries = [...tally.entries()];
  entries.sort((a, b) => {
    const band = rankOf(a[0], order) - rankOf(b[0], order);
    if (band !== 0) return band;
    if (order) {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      if (ia >= 0 && ib >= 0) return ia - ib;
    }
    return b[1] - a[1];
  });
  return entries.map(([label, n]) => ({
    label,
    n,
    pct: total > 0 ? (n / total) * 100 : 0,
  }));
}

/**
 * Times are bucketed to the hour. A form records "07:20", and a chart with
 * one bar per distinct minute is unreadable and enormous; what a mission
 * wants is the shape of the day.
 */
function bucketTime(value: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return value;
  return `${m[1]!.padStart(2, '0')}:00`;
}

/** The answers a single row gives to a question. Multi questions give many. */
export function answersFor(question: Question, row: string[]): string[] {
  if (question.kind === 'multi') {
    const out: string[] = [];
    question.options.forEach((opt) => {
      const v = clean(row[opt.column] ?? '');
      if (!isBlank(v)) out.push(opt.label);
    });
    return out;
  }
  /*
   * One answer, which the form may have spread over a column per area.
   * "B.2 Polling station constituency" is seven columns and a report fills
   * whichever one its station is in, so the answer is the first that holds
   * anything.
   */
  let v = '';
  for (const col of question.columns) {
    const candidate = clean(row[col] ?? '');
    if (!isBlank(candidate)) {
      v = candidate;
      break;
    }
  }
  if (isBlank(v)) return [];
  if (question.kind === 'time') return [bucketTime(v)];
  // A scored answer is stored as a digit and charted as the word its own
  // legend gives it. See `parseLegend`.
  return [question.valueLabels?.[v] ?? v];
}

/**
 * Whether a numeric question asks for a percentage.
 *
 * Read from the question's own wording, which is where the form says it:
 * "B.8 Estimated % of female participants" asks for one, "B.11 Total
 * number of speakers" does not.
 */
export function isPercentageQuestion(question: Question): boolean {
  return question.kind === 'numeric' && /%|per ?cent/i.test(question.label);
}

/**
 * The average of a percentage question, overall and by group.
 *
 * It is the mean of the observers' estimates, one report one vote, and not
 * a share of the people at the events: an event of two thousand and an
 * event of fifty count the same here, because the form records an
 * estimated percentage and not a headcount, so there is nothing to weight
 * by that would not be invented. Every chart of it says how many reports
 * it rests on for that reason.
 *
 * An entry outside 0 to 100 is dropped. It is not a percentage, whatever
 * else it is.
 */
export function percentageOf(
  dataset: Dataset,
  question: Question,
  rowFilter?: boolean[],
): Percentage | null {
  const col = question.columns[0];
  if (col === undefined) return null;
  const all: number[] = [];
  const byParty = new Map<string, number[]>();
  const byArea = new Map<string, number[]>();

  dataset.table.rows.forEach((row, i) => {
    if (rowFilter && !rowFilter[i]) return;
    const raw = clean(row[col] ?? '');
    if (isBlank(raw)) return;
    const v = Number(raw);
    if (!Number.isFinite(v) || v < 0 || v > 100) return;
    all.push(v);
    const party = dataset.rowParty[i];
    if (party) byParty.set(party, [...(byParty.get(party) ?? []), v]);
    const area = dataset.rowGroup[i];
    if (area) byArea.set(area, [...(byArea.get(area) ?? []), v]);
  });

  if (all.length === 0) return null;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const ordered = (m: Map<string, number[]>, order: string[]): GroupMean[] =>
    order
      .filter((label) => m.has(label))
      .map((label) => ({ label, mean: mean(m.get(label)!), n: m.get(label)!.length }));

  return {
    mean: mean(all),
    n: all.length,
    byParty: ordered(byParty, dataset.parties),
    byArea: ordered(byArea, dataset.groups),
  };
}

/* ------------------------------------------------------------------ */
/* A count that is part of another count                               */
/* ------------------------------------------------------------------ */

/**
 * Wording that points back at the question before it.
 *
 * "How many of these were sealed" names its denominator by pointing at
 * it, so the code is enough to say which count that is.
 */
const POINTS_BACK = /\bof (these|those|them|which|whom)\b/i;

/**
 * Wording that names what a count is part of.
 *
 * "How many OF THE polling staff are female" also says it is a part,
 * but it says so by naming a thing, and the thing has to be the one the
 * parent counted: "how many of the party agents were accredited" under
 * "how many citizen observers are present" is not a part of it.
 */
const NAMES_PART = /\b(of|among) the\b/i;

/**
 * Words two questions share because they are questions, not because
 * they are about the same thing.
 */
const COMMON_WORDS = new Set([
  'what', 'how', 'many', 'much', 'total', 'number', 'numbers', 'there', 'these',
  'those', 'were', 'was', 'are', 'the', 'and', 'any', 'please', 'specify',
  'present', 'your', 'you', 'their', 'with', 'that', 'this', 'from', 'have',
  'has', 'did', 'does', 'all', 'other', 'time', 'observe', 'observed',
]);

/**
 * What a count counts, for the line under the figure.
 *
 * "How many polling staff members are present" is read back as "polling
 * staff members": the question's wording with the asking taken off it,
 * because the line says what the share is a share of and not what the
 * observer was asked.
 */
function subjectOf(label: string): string {
  return label
    .replace(/^(what is the\s+)?(how many|total number of)\s+/i, '')
    .replace(/\s+(are|is|were|was)\s+(present|there|available)\b.*$/i, '')
    .replace(/[.:?]\s*$/, '')
    .trim()
    .toLowerCase();
}

/**
 * The count a count is part of, where the form asks for both.
 *
 * Reading one number as part of another invents a denominator if it is
 * wrong, so the code and the wording both have to say so. The code says
 * it is a follow-up - E.1.1 of E.1, which `nestFollowUps` already puts
 * one after the other - and both are counts. Then the wording either
 * points back at the parent, which settles it, or names what it is a
 * part of, and the name has to be the parent's own: the two questions
 * share a word that is not simply a word questions are made of.
 *
 * What this keeps out is the follow-up that is a different measurement
 * of the same event. "If No to D.1, how many minutes was the delay"
 * follows a question and counts something else entirely.
 */
export function parentCount(dataset: Dataset, question: Question): Question | null {
  if (question.kind !== 'numeric' || isPercentageQuestion(question)) return null;
  const pointsBack = POINTS_BACK.test(question.label);
  if (!pointsBack && !NAMES_PART.test(question.label)) return null;
  const cut = question.code.lastIndexOf('.');
  if (cut <= 1) return null;
  const parent = dataset.questions.find((q) => q.code === question.code.slice(0, cut));
  if (!parent || parent === question) return null;
  if (parent.kind !== 'numeric' || isPercentageQuestion(parent)) return null;
  if (parent.columns[0] === undefined || parent.columns[0] === question.columns[0]) return null;
  if (pointsBack) return parent;
  const words = (q: Question): Set<string> =>
    new Set(
      q.label
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((w) => w.length >= 4 && !COMMON_WORDS.has(w)),
    );
  const mine = words(question);
  return [...words(parent)].some((w) => mine.has(w)) ? parent : null;
}

/**
 * A count that is part of another count, as the share of it that it is.
 *
 * "How many of the polling staff are female" counted in its own right
 * says how many observers wrote the digit 4, which is partly a picture
 * of how big the stations were: two of five and two of four stand in
 * the same bar, and a station staffed by one can never reach the fourth
 * bar at all. The figure is the share - women as a proportion of the
 * polling staff observed - which is what the pair of questions was
 * asked to produce and what a mission reports against its benchmarks.
 *
 * Summed rather than averaged, which is where this parts company with
 * `percentageOf` and `shareOfRegister`. Those average a per-report
 * share because the reports hold estimates, and because summing over
 * the observed stations would read as a figure for the country. Here
 * both numbers are headcounts an observer took standing in the room, so
 * "25 of the 47 polling staff observed were women" is complete and true
 * of exactly the set it names.
 *
 * A report whose part is larger than its whole is dropped: four women
 * among one member of staff is not a share of anything. The base under
 * the figure falls by one, which is the honest record of it.
 */
/** A part, its whole and the reports behind them, for one group. */
interface PartTally {
  part: number;
  whole: number;
  n: number;
}

/**
 * The part and the whole, nationally and by every group a page splits.
 *
 * One pass over the reports, because the figure and the page that
 * stacks it must not be able to disagree.
 */
function partTallies(
  dataset: Dataset,
  question: Question,
  rowFilter?: boolean[],
): Map<string, PartTally> | null {
  const parent = parentCount(dataset, question);
  const col = question.columns[0];
  const parentCol = parent?.columns[0];
  if (!parent || col === undefined || parentCol === undefined) return null;

  const type = stationTypeQuestion(dataset);
  const tally = new Map<string, PartTally>();
  const add = (key: string, part: number, whole: number): void => {
    const t = tally.get(key) ?? { part: 0, whole: 0, n: 0 };
    tally.set(key, { part: t.part + part, whole: t.whole + whole, n: t.n + 1 });
  };

  dataset.table.rows.forEach((row, i) => {
    if (rowFilter && !rowFilter[i]) return;
    const raw = clean(row[col] ?? '');
    if (isBlank(raw)) return;
    const part = Number(raw);
    const whole = Number(clean(row[parentCol] ?? ''));
    if (!Number.isFinite(whole) || whole <= 0) return;
    if (!Number.isFinite(part) || part < 0 || part > whole) return;
    add('', part, whole);
    const party = dataset.rowParty[i];
    if (party) add(`party:${party}`, part, whole);
    const area = dataset.rowGroup[i];
    if (area) add(`area:${area}`, part, whole);
    const kind = type ? answersFor(type, row)[0] : undefined;
    if (kind) add(`type:${kind}`, part, whole);
  });
  return tally;
}

/**
 * What the form calls the part it counts, for a legend.
 *
 * "How many of the polling staff are female" is "Female", which is the
 * predicate with the asking taken off it. A predicate too long for a
 * legend keeps its first word - "sealed in front of you" is "Sealed" -
 * and the rest of the whole is "Other", never "male": the form asked
 * one question and the answer to the other one is not in the file.
 */
export function partLabel(question: Question): string {
  const said = /\s(?:are|is|were|was)\s+(.+)$/i.exec(question.label.replace(/[.:?]\s*$/, ''));
  const word = (said?.[1] ?? '').trim();
  const short = word.length > 0 && word.length <= 20 ? word : (word.split(/\s+/)[0] ?? '');
  const name = short.length > 0 ? short : 'Counted';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * The same share as 100% stacked columns, which is every other
 * question's page.
 *
 * The columns are of polling staff rather than of reports, which is
 * what `Shares.unit` says: a column is a station's staff pooled with
 * every other station's in that area, and the figure over it counts
 * people. Three of five women and two of four are different columns
 * here, where on a count of answers they were the same bar.
 */
export function sharesOfParent(
  dataset: Dataset,
  question: Question,
  rowFilter?: boolean[],
): Shares | null {
  const tally = partTallies(dataset, question, rowFilter);
  const parent = parentCount(dataset, question);
  const all = tally?.get('');
  if (!tally || !parent || !all || all.whole === 0) return null;

  const part = partLabel(question);
  const answers = [part, 'Other'];
  const group = (label: string, t: PartTally): SharePanel['groups'][number] => ({
    label,
    n: t.whole,
    counts: [
      { label: part, n: t.part, pct: (t.part / t.whole) * 100 },
      { label: 'Other', n: t.whole - t.part, pct: ((t.whole - t.part) / t.whole) * 100 },
    ],
  });
  const groupsFor = (prefix: string, order: string[]): SharePanel['groups'] =>
    order
      .filter((label) => (tally.get(prefix + label)?.whole ?? 0) > 0)
      .map((label) => group(label, tally.get(prefix + label)!));

  const panels: SharePanel[] = [{ title: 'National', groups: [group('National', all)] }];
  const kinds = [...tally.keys()].filter((k) => k.startsWith('type:')).map((k) => k.slice(5));
  const byType = groupsFor('type:', kinds);
  if (byType.length >= 2) panels.push({ title: 'By station type', groups: byType });
  const places = groupsFor('area:', dataset.groups);
  if (places.length < MIN_SHARE_GROUPS) return null;
  panels.push({
    title: dataset.geo ? `By ${AREA_WORDS[dataset.division].one}` : 'By area',
    groups: places,
  });

  return {
    answers,
    panels,
    unit: `Columns are ${subjectOf(parent.label)}, not reports.`,
  };
}

export function shareOfParent(
  dataset: Dataset,
  question: Question,
  rowFilter?: boolean[],
): Percentage | null {
  const tally = partTallies(dataset, question, rowFilter);
  const parent = parentCount(dataset, question);
  if (!tally || !parent) return null;
  const all = tally.get('');
  if (!all || all.whole === 0) return null;

  const share = (t: { part: number; whole: number }): number => (t.part / t.whole) * 100;
  const ordered = (prefix: string, order: string[]): GroupMean[] =>
    order
      .filter((label) => tally.has(prefix + label))
      .map((label) => {
        const t = tally.get(prefix + label)!;
        return { label, mean: share(t), n: t.n };
      });
  // The kinds of place in the order the file first mentions them, which
  // is the order the question's own pages put them in.
  const kinds = [...tally.keys()].filter((k) => k.startsWith('type:')).map((k) => k.slice(5));

  return {
    mean: share(all),
    n: all.n,
    byParty: ordered('party:', dataset.parties),
    byArea: ordered('area:', dataset.groups),
    byType: ordered('type:', kinds),
    basis: `As a share of ${subjectOf(parent.label)}`,
    counted: { part: all.part, whole: all.whole },
  };
}

/**
 * The line under a worked-out percentage.
 *
 * What the figure is a share of, and - where it was summed rather than
 * averaged - the two numbers it was summed from, because 53% reads the
 * same whether it is 25 of 47 or 2 of 4. One place, so the deck, the
 * dashboard and the Word report all say it the same way.
 */
export function basisLine(p: Percentage): string | null {
  if (!p.basis) return null;
  if (!p.counted) return p.basis;
  const n = (v: number): string => v.toLocaleString('en-GB');
  return `${p.basis} (${n(p.counted.part)} of ${n(p.counted.whole)})`;
}

export function analyse(dataset: Dataset, question: Question, rowFilter?: boolean[]): Breakdown {
  const { rows } = dataset.table;
  const include = (i: number) => !rowFilter || rowFilter[i];

  /*
   * A question is never broken down by itself.
   *
   * "Which candidate/party/coalition organised this event" compared across
   * party is five bars, each one a party answering with its own name, all
   * of them crushed into one row of the slide. The same goes for the
   * question that names the area. The comparison is only worth drawing
   * where it is a different question from the one being answered.
   */
  const isPartyColumn =
    dataset.partyColumn !== null && question.columns.includes(dataset.partyColumn);
  const isAreaColumn =
    dataset.areaColumn !== null && question.columns.includes(dataset.areaColumn);
  const isConstituencyColumn =
    dataset.constituencyColumn !== null &&
    question.columns.includes(dataset.constituencyColumn);

  /*
   * The area question answers in the names this tool uses everywhere else.
   *
   * Observers record the administrative capital - Brikama, Kerewan, Mansa
   * Konko, Basse - and the by-area charts next to it are labelled with the
   * Local Government Area. One slide carrying both spellings of the same
   * eight places reads as sixteen.
   */
  const label = (value: string): string => {
    if (!dataset.geo) return value;
    if (isAreaColumn) {
      const code = resolveLga(value);
      return code ? lgaName(code) : value;
    }
    /*
     * The same for the constituency question, where it matters more: the
     * live export spells one constituency "Serrekunda West" on one report
     * and "Serekunda west" on the next, and counting those as two places
     * understates both. Anything the gazetteer does not recognise is left
     * exactly as the observer wrote it rather than guessed at.
     */
    if (isConstituencyColumn) return resolveConstituency(value)?.name ?? value;
    return value;
  };

  // Numbers are counted in bands, everywhere: the question's own chart and
  // every breakdown of it use the same ones.
  const banding = bandingFor(dataset, question, rowFilter);
  const band = (value: string): string => {
    if (!banding) return value;
    const n = Number(value);
    return Number.isFinite(n) ? banding.of(n) : value;
  };

  const tally = new Map<string, number>();
  const perGroup = new Map<string, Map<string, number>>();
  const perParty = new Map<string, Map<string, number>>();
  const numbers: number[] = [];
  let answered = 0;
  let notApplicable = 0;
  let reports = 0;

  rows.forEach((row, i) => {
    if (!include(i)) return;
    reports += 1;
    const answers = answersFor(question, row);
    if (answers.length === 0) return;

    const real = answers.filter((a) => !NON_ANSWERS.has(a));
    if (real.length === 0) notApplicable += 1;
    else answered += 1;

    /*
     * NA is charted along with everything else.
     *
     * It used to be dropped, so "Did any speaker use inflammatory
     * language?" - answered No on fourteen reports and NA on nineteen -
     * was drawn as one bar reading 100% No, which states something the
     * data does not. Every answer the observers gave is now tallied, with
     * NA last and in grey.
     *
     * Rates that are meant to read as a share of the reports that could
     * answer are unaffected: the findings table, the maps and the written
     * report all divide by `answered`, which counts real answers only.
     */
    for (const raw of answers) {
      const a = band(label(raw));
      tally.set(a, (tally.get(a) ?? 0) + 1);
      const group = isAreaColumn ? null : dataset.rowGroup[i];
      if (group) {
        const m = perGroup.get(group) ?? new Map<string, number>();
        m.set(a, (m.get(a) ?? 0) + 1);
        perGroup.set(group, m);
      }
      const party = isPartyColumn ? null : dataset.rowParty[i];
      if (party) {
        const m = perParty.get(party) ?? new Map<string, number>();
        m.set(a, (m.get(a) ?? 0) + 1);
        perParty.set(party, m);
      }
      if (question.kind === 'numeric') {
        const num = Number(raw);
        if (Number.isFinite(num)) numbers.push(num);
      }
    }
  });

  const order =
    question.scale ??
    banding?.labels ??
    // North bank to upper river, as the country is laid out, not by count.
    (isConstituencyColumn && dataset.geo ? dataset.constituencies : undefined) ??
    (question.kind === 'binary' ? ['Yes', 'No'] : undefined) ??
    (question.kind === 'multi' ? question.options.map((o) => o.label) : undefined) ??
    // Hours read chronologically, never by frequency.
    (question.kind === 'time' ? [...tally.keys()].sort() : undefined);

  const byArea: Record<string, Count[]> = {};
  for (const group of dataset.groups) {
    const m = perGroup.get(group);
    if (m && m.size > 0) byArea[group] = toCounts(m, order);
  }

  const byParty: Record<string, Count[]> = {};
  for (const party of dataset.parties) {
    const m = perParty.get(party);
    if (m && m.size > 0) byParty[party] = toCounts(m, order);
  }

  const breakdown: Breakdown = {
    total: toCounts(tally, order),
    byArea,
    byParty,
    answered,
    notApplicable,
    reports,
  };

  /*
   * A multi-answer block's share is of the reports, not of the ticks.
   *
   * One report ticks several options, so the ticks add up to more than
   * the reports and a share of them answers a question nobody asked:
   * "UNITE 9 (22%)" read as nine of the stations in twenty-two per cent
   * of them, when it was nine stations out of nine and twenty-two per
   * cent of the boxes ticked. The share of reports is the figure the
   * mission uses - an option ticked on a fifth of the reports - and it
   * is what a reader takes the percentage to mean anyway.
   */
  if (question.kind === 'multi' && reports > 0) {
    breakdown.total = breakdown.total.map((c) => ({ ...c, pct: (c.n / reports) * 100 }));
  }

  if (numbers.length > 0) {
    breakdown.numeric = {
      n: numbers.length,
      sum: numbers.reduce((a, b) => a + b, 0),
      // The same bands the chart is drawn from, so the written sentence and
      // the chart beside it cannot disagree.
      bins: breakdown.total.filter((c) => !NON_ANSWERS.has(c.label)),
    };
  }

  if (question.scale && question.scale.length > 1) {
    // Score the scale 1..k in its own order, so "mean rating" is meaningful.
    let weighted = 0;
    let n = 0;
    for (const c of breakdown.total) {
      const idx = question.scale.indexOf(c.label);
      if (idx >= 0) {
        weighted += (idx + 1) * c.n;
        n += c.n;
      }
    }
    if (n > 0) breakdown.meanScore = weighted / n;
  }

  if (isPercentageQuestion(question)) {
    breakdown.percent = percentageOf(dataset, question, rowFilter) ?? undefined;
  } else {
    // A count of votes cast is a share of that station's own list, and only
    // that reads across stations. See `shareOfRegister`. A count the form
    // asks for as part of the count before it is that share, and not a
    // tally of its own. See `shareOfParent`.
    breakdown.percent =
      shareOfRegister(dataset, question, rowFilter) ??
      shareOfParent(dataset, question, rowFilter) ??
      undefined;
  }

  return breakdown;
}

/**
 * The answers to a free-text question, as written.
 *
 * Not tallied. A prose answer is unique, so counting distinct values gives
 * one bar per report; what is wanted is the words inside them.
 */
export function textValues(
  dataset: Dataset,
  question: Question,
  rowFilter?: boolean[],
): string[] {
  const col = question.columns[0];
  if (col === undefined) return [];
  const out: string[] = [];
  dataset.table.rows.forEach((row, i) => {
    if (rowFilter && !rowFilter[i]) return;
    const value = clean(row[col]);
    if (!isBlank(value) && !NON_ANSWERS.has(value.toUpperCase())) out.push(value);
  });
  return out;
}

/** Whether this question's answers are prose worth a word cloud. */
export function isWordCloud(
  dataset: Dataset,
  question: Question,
  rowFilter?: boolean[],
): boolean {
  return question.kind === 'text' && isProse(textValues(dataset, question, rowFilter));
}

/**
 * The reports behind a set of counts, excluding NA and DK.
 *
 * The denominator for any rate. NA appears in the counts so a reader can
 * see it; dividing by it would turn "no speaker used inflammatory language
 * on any report that could judge" into a much weaker-looking number.
 */
export function realTotal(counts: Count[]): number {
  return counts.filter((c) => !NON_ANSWERS.has(c.label)).reduce((s, c) => s + c.n, 0);
}

/**
 * The counts to chart for a question.
 *
 * The breakdown itself, now that a numeric question is counted in bands
 * from the start. It used to band the answers here and nowhere else, which
 * left the by-area and by-party breakdowns holding raw values that no chart
 * could line up with - and so a numeric question could not be compared
 * across anything.
 */
export function displayCounts(q: Question, b: Breakdown): Count[] {
  /*
   * A scale is held worst first, because that is the order it scores
   * in, and charted best first.
   *
   * A briefing reads a rating chart for how much of the day was good
   * before it reads how much of it was not, and the mission's own
   * reference deck stacks "Muy bueno" at the foot of every column with
   * "Muy malo" on the top. The order here is the chart's; `meanScore`
   * and the better half of the scale are still read off `question.scale`,
   * which does not move. Anything outside the scale - NA - keeps its
   * place at the end.
   */
  /*
   * A count is charted the most first, for the same reason.
   *
   * "E.1 How many polling staff members are present" answered 5 is a
   * full complement, which is the thing a briefing wants to see before
   * it sees the station that was staffed by one - and the deck reads
   * the other way round from the rating charts beside it otherwise.
   * The bands themselves stay in order wherever they are counted; this
   * is the chart's order, as it is for a scale.
   */
  const counted = q.kind === 'numeric' ? countScale(q, b.total) : undefined;
  const scale = q.scale && q.scale.length > 1 ? q.scale : counted;
  if (!scale) return b.total;
  // Through the scale rather than through the counts, because the
  // counts are in the order the bands were made and the scale is the
  // one that runs worst to best - which for a count of unauthorised
  // persons is 2, 1, 0, and reversing the bands gave the opposite.
  const rated = scale
    .map((label) => b.total.find((c) => c.label === label))
    .filter((c): c is Count => c !== undefined);
  const rest = b.total.filter((c) => !scale.includes(c.label));
  return [...rated.reverse(), ...rest];
}

/**
 * Whether more of the thing a question counts is worse news.
 *
 * Read off the mission's own problem vocabulary, which is the same list
 * the findings are ranked by. "How many polling staff members are
 * present" wants five and "how many unauthorised persons are present"
 * wants none, and the chart cannot shade either until it knows which.
 * Where the wording names no problem, more is the better end - the
 * forms count what should be there far more often than what should not.
 */
export function moreIsWorse(question: Question): boolean {
  return PROBLEM_WORDS.test(question.label);
}

/**
 * The bands of a count, worst first, where a numeric question has them.
 *
 * Worst first, as a scale is held worst first, so everything that
 * reverses a scale for the chart or shades it along a ramp works the
 * same way on both without knowing which it has.
 *
 * A number banded into ranges is not one of these: "4,000 to 4,999" is
 * not a quantity a chart can shade along a ramp, and a station's own
 * number is an identifier.
 */
export function countScale(
  question: Question,
  counts: { label: string }[],
): string[] | undefined {
  const real = counts.map((c) => c.label).filter((l) => !NON_ANSWERS.has(l));
  if (real.length < 2) return undefined;
  if (!real.every((l) => /^-?\d/.test(l) && !l.includes(' to '))) return undefined;
  const ascending = [...real].sort((a, b) => parseFloat(a) - parseFloat(b));
  return moreIsWorse(question) ? ascending.reverse() : ascending;
}

/**
 * The scale a question's answers are coloured along.
 *
 * Its own, where the form scores it, and the bands of a count where it
 * does not: both are ordered, and the one thing a chart must not do is
 * hand an ordered set of answers the categorical palette, which says
 * nothing and says it in the colour a flagged answer wears.
 */
export function chartScale(q: Question, counts: { label: string }[]): string[] | undefined {
  if (q.scale && q.scale.length > 1) return q.scale;
  return q.kind === 'numeric' ? countScale(q, counts) : undefined;
}

/* ------------------------------------------------------------------ */
/* Binning numeric answers                                             */
/* ------------------------------------------------------------------ */

/** Bin widths that read as a number a person would choose themselves. */
const NICE_WIDTHS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];

export interface Bands {
  /** Every band, in order, whether or not anything fell in it. */
  labels: string[];
  /** The band a value belongs to. */
  of: (value: number) => string;
}

/**
 * Bands for a set of numeric answers.
 *
 * Few distinct values, and each one becomes its own band: a question answered
 * 0, 1, 2 or 3 should read as those four answers and not as "0 to 1". Many
 * distinct values, and a round width is chosen so the bands are ones a person
 * would have picked, which matters because these labels go on a slide.
 *
 * `unit` is carried into the label, so "Estimated % of female participants"
 * reads "20 to 39%" rather than "20 to 39" - a band that could be a count,
 * a share or a number of people, on a slide where nothing else says which.
 */
export function bandsFor(values: number[], target = 6, unit = ''): Bands {
  const distinct = [...new Set(values)].sort((a, b) => a - b);
  const fmt = (v: number) => (Number.isInteger(v) ? v.toLocaleString('en-GB') : v.toFixed(1));
  // The unit goes on the end of the whole label, so a range reads
  // "20 to 39%" rather than "20% to 39%".
  const label = (v: number) => `${fmt(v)}${unit}`;

  if (distinct.length <= 5) {
    return { labels: distinct.map(label), of: label };
  }

  /*
   * Six values is five and a tail.
   *
   * A count of a few things is a composition, and the page that puts it
   * against the kind of station and the areas is drawn on five answers
   * at most, because six colours stacked in a column is a pattern
   * rather than a chart. "E.3 How many citizen observers are present"
   * was answered 0, 1, 2, 3, 4 and 9 on eleven reports, and the one
   * station with nine cost the question that page altogether. The tail
   * is gathered instead: "4 or more" is as true as the list was, and
   * the station with nine is still in the exported table.
   *
   * Only for a count of things in a polling station - whole numbers,
   * none of them above twenty. Six distinct voter-list totals are six
   * sizes of station rather than a quantity to gather a tail from, and
   * "3,300 or more" said about one report is not a band.
   */
  const countable =
    distinct.length <= 8 && distinct.every((v) => Number.isInteger(v) && v >= 0 && v <= 20);
  if (countable) {
    const head = distinct.slice(0, 4);
    const cut = distinct[4]!;
    const tail = `${label(cut)} or more`;
    return {
      labels: [...head.map(label), tail],
      of: (v: number) => (v < cut ? label(v) : tail),
    };
  }

  if (distinct.length <= 8) {
    return { labels: distinct.map(label), of: label };
  }

  const min = distinct[0]!;
  const max = distinct[distinct.length - 1]!;
  const rough = (max - min) / target;
  const width = NICE_WIDTHS.find((w) => w >= rough) ?? Math.ceil(rough / 5000) * 5000;
  const start = Math.floor(min / width) * width;

  const labels: string[] = [];
  for (let from = start; from <= max; from += width) {
    labels.push(width === 1 ? label(from) : `${fmt(from)} to ${fmt(from + width - 1)}${unit}`);
  }

  return {
    labels,
    of: (v: number) =>
      labels[Math.min(labels.length - 1, Math.max(0, Math.floor((v - start) / width)))]!,
  };
}

/** The distribution of a set of numeric answers across its bands. */
export function histogram(values: number[], target = 6, unit = ''): Count[] {
  const bands = bandsFor(values, target, unit);
  const tally = new Map<string, number>();
  for (const l of bands.labels) tally.set(l, 0);
  for (const v of values) tally.set(bands.of(v), (tally.get(bands.of(v)) ?? 0) + 1);
  return toCounts(tally, bands.labels);
}

/**
 * How a question's answers are counted: in bands, if they are numbers.
 *
 * One bar per distinct answer is useless for a number - forty queue lengths
 * gave forty bars of one - so a numeric question is counted in bands all the
 * way through, and not only in its own chart. Before, the bands existed for
 * the chart while the by-party and by-area breakdowns still held raw values,
 * which is why a numeric question could not be compared across anything.
 */
export function bandingFor(
  dataset: Dataset,
  question: Question,
  rowFilter?: boolean[],
): Bands | null {
  if (question.kind !== 'numeric') return null;
  const numbers: number[] = [];
  dataset.table.rows.forEach((row, i) => {
    if (rowFilter && !rowFilter[i]) return;
    for (const a of answersFor(question, row)) {
      const n = Number(a);
      if (Number.isFinite(n)) numbers.push(n);
    }
  });
  if (numbers.length === 0) return null;
  // A question that asks for a percentage says so in its own wording.
  const unit = /%|percent/i.test(question.label) ? '%' : '';
  return bandsFor(numbers, 6, unit);
}

/* ------------------------------------------------------------------ */
/* Rates by place, for the map                                         */
/* ------------------------------------------------------------------ */

export interface PlaceRate {
  place: string;
  /** Reports in this place that answered the question at all. */
  total: number;
  /** Reports that gave the selected answer. */
  n: number;
  /** n as a share of total, or null where there are no answers. */
  pct: number | null;
}

/**
 * The rate of one answer to one question, per area.
 *
 * This is what the map shades. `null` where a place returned no answers,
 * which the map must draw differently from zero: "nobody observed here" and
 * "nobody reported a problem here" are not the same statement, and
 * conflating them in an observation report would be a serious error.
 */
export function rateByPlace(
  dataset: Dataset,
  question: Question,
  answer: string | string[],
  rowFilter?: boolean[],
): PlaceRate[] {
  // One answer or several: a rating question is mapped on the whole of
  // the worse end of its scale, Bad and Very bad together.
  const wanted = new Set(Array.isArray(answer) ? answer : [answer]);
  const places = dataset.areas.map((a) => a.name);
  const keyOf = (i: number) => (dataset.rowArea[i] ? lgaName(dataset.rowArea[i]!) : null);

  const totals = new Map<string, number>();
  const hits = new Map<string, number>();
  // The answer being mapped comes from the breakdown, so a numeric question
  // asks for a band and the rows have to be banded the same way to match.
  const banding = bandingFor(dataset, question, rowFilter);

  dataset.table.rows.forEach((row, i) => {
    if (rowFilter && !rowFilter[i]) return;
    const place = keyOf(i);
    if (!place) return;
    const answers = answersFor(question, row).map((a) => {
      const n = Number(a);
      return banding && Number.isFinite(n) ? banding.of(n) : a;
    });
    const real = answers.filter((a) => !NON_ANSWERS.has(a));
    if (real.length === 0) return;
    totals.set(place, (totals.get(place) ?? 0) + 1);
    if (real.some((a) => wanted.has(a))) hits.set(place, (hits.get(place) ?? 0) + 1);
  });

  return places.map((place) => {
    const total = totals.get(place) ?? 0;
    const n = hits.get(place) ?? 0;
    return { place, total, n, pct: total > 0 ? (n / total) * 100 : null };
  });
}

/** Report counts per place, for the default coverage map. */
export function reportsByPlace(dataset: Dataset, rowFilter?: boolean[]): PlaceRate[] {
  const places = dataset.areas.map((a) => a.name);
  const counts = new Map<string, number>();
  dataset.table.rows.forEach((_row, i) => {
    if (rowFilter && !rowFilter[i]) return;
    const place = dataset.rowArea[i] ? lgaName(dataset.rowArea[i]!) : null;
    if (place) counts.set(place, (counts.get(place) ?? 0) + 1);
  });
  return places.map((place) => {
    const n = counts.get(place) ?? 0;
    return { place, total: n, n, pct: n > 0 ? n : null };
  });
}

/* ------------------------------------------------------------------ */
/* Coverage                                                            */
/* ------------------------------------------------------------------ */

export interface ConstituencyGroup {
  /** The Local Government Area, named by its administrative capital. */
  area: string;
  /** Reports from this LGA, whether or not their constituency was named. */
  reports: number;
  /** Its constituencies that returned reports, in geographic order. */
  constituencies: { name: string; reports: number }[];
  /** How many constituencies the area has in all, reported or not. */
  totalConstituencies: number;
  /** Reports from the LGA whose constituency could not be read. */
  unnamed: number;
  /**
   * What those reports wrote instead, as they wrote it.
   *
   * "Constituency not named" on its own reads as a gap in the data when
   * the field was in fact filled in - with a neighbourhood, an area or a
   * region, none of which is a constituency. Showing the entry turns a
   * shrug into something the data team can act on.
   */
  unrecognised: { text: string; reports: number }[];
}

/**
 * Reports per constituency, under the LGA each belongs to.
 *
 * The two questions at the top of every form are the LGA and the
 * constituency, and they are a hierarchy: Bakau and Serekunda West are
 * inside Kanifing. Flattening them into one list of 53 places loses that,
 * and 53 bars is not a chart. Grouped, it answers the question a mission
 * actually asks - "we have nine reports from Kanifing, but from where in
 * Kanifing?" - and shows which constituencies of an observed area were not
 * reached at all.
 *
 * Grouping is by the LGA the report itself gives, not by the LGA the
 * constituency belongs to, so these figures reconcile with every other
 * coverage number in the tool.
 */
export function constituencyCoverage(
  dataset: Dataset,
  rowFilter?: boolean[],
): { groups: ConstituencyGroup[]; ungrouped: number } {
  const perArea = new Map<string, Map<string, number>>();
  const totals = new Map<string, number>();
  const unnamed = new Map<string, number>();
  const wrote = new Map<string, Map<string, number>>();
  let ungrouped = 0;

  dataset.table.rows.forEach((row, i) => {
    if (rowFilter && !rowFilter[i]) return;
    const area = dataset.rowGroup[i];
    if (!area) {
      ungrouped += 1;
      return;
    }
    totals.set(area, (totals.get(area) ?? 0) + 1);
    const c = dataset.rowConstituency[i];
    if (!c) {
      unnamed.set(area, (unnamed.get(area) ?? 0) + 1);
      const raw =
        dataset.constituencyColumns
          .map((c) => clean(row[c] ?? ''))
          .find((v) => !isBlank(v)) ?? '';
      if (raw) {
        const m = wrote.get(area) ?? new Map<string, number>();
        m.set(raw, (m.get(raw) ?? 0) + 1);
        wrote.set(area, m);
      }
      return;
    }
    const m = perArea.get(area) ?? new Map<string, number>();
    m.set(c, (m.get(c) ?? 0) + 1);
    perArea.set(area, m);
  });

  const groups = dataset.areas.filter((a) => totals.has(a.name)).map((a) => {
    const counts = perArea.get(a.name) ?? new Map<string, number>();
    const known = a.constituencies.filter((c) => counts.has(c));
    const other = [...counts.keys()].filter((c) => !a.constituencies.includes(c)).sort();
    return {
      area: a.name,
      reports: totals.get(a.name) ?? 0,
      constituencies: [...known, ...other].map((name) => ({
        name,
        reports: counts.get(name) ?? 0,
      })),
      totalConstituencies: a.constituencies.length,
      unnamed: unnamed.get(a.name) ?? 0,
      unrecognised: [...(wrote.get(a.name) ?? new Map<string, number>())]
        .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
        .map(([text, reports]) => ({ text, reports })),
    };
  });

  return { groups, ungrouped };
}

export interface Coverage {
  reports: number;
  groupsCovered: number;
  groupsTotal: number;
  /** Share of the 2026 register in observed areas. Only meaningful in geo mode. */
  registerShare: number | null;
  /** Constituencies that returned at least one report. */
  constituenciesCovered: number;
  /** Constituencies in the country. Zero where the form has none. */
  constituenciesTotal: number;
  byGroup: { label: string; reports: number; registered: number | null }[];
  byTeam: { team: string; reports: number }[];
  ungroupedRows: number;
}

export function coverage(dataset: Dataset, rowFilter?: boolean[]): Coverage {
  const include = (i: number) => !rowFilter || rowFilter[i];
  const counts = new Map<string, number>();
  const teams = new Map<string, number>();
  let reports = 0;
  let ungrouped = 0;

  dataset.table.rows.forEach((_row, i) => {
    if (!include(i)) return;
    reports += 1;
    const g = dataset.rowGroup[i];
    if (g) counts.set(g, (counts.get(g) ?? 0) + 1);
    else ungrouped += 1;
    // A form with no team column gets no team breakdown at all. It used to
    // get one row labelled "Unspecified", which told a reader nothing except
    // that something had gone wrong.
    const team = dataset.rowTeam[i];
    if (team) teams.set(team, (teams.get(team) ?? 0) + 1);
  });

  const universe = dataset.geo ? dataset.areas.map((a) => a.name) : dataset.groups;
  const byGroup = universe.map((label) => ({
    label,
    reports: counts.get(label) ?? 0,
    // Central River's electorate is both its LGAs', which is what makes
    // the register column add up to the national total either way.
    registered: dataset.areas.find((a) => a.name === label)?.registered ?? null,
  }));

  let registerShare: number | null = null;
  if (dataset.geo) {
    const observed = byGroup
      .filter((g) => g.reports > 0)
      .reduce((s2, g) => s2 + (g.registered ?? 0), 0);
    const total = TOTAL_REGISTERED_2026;
    registerShare = total > 0 ? (observed / total) * 100 : 0;
  }

  const seen = new Set<string>();
  dataset.table.rows.forEach((_row, i) => {
    if (!include(i)) return;
    const c = dataset.rowConstituency[i];
    if (c) seen.add(c);
  });

  return {
    reports,
    groupsCovered: byGroup.filter((g) => g.reports > 0).length,
    groupsTotal: universe.length,
    registerShare,
    constituenciesCovered: seen.size,
    // Only where the form asks for a constituency. It used to be 53
    // whenever the areas were Gambian, so a form that never asks printed
    // a tile reading "0 / 53", which says the deployment reached none of
    // them rather than that the question was not on the form.
    constituenciesTotal:
      dataset.geo && dataset.constituencyColumns.length > 0 ? ALL_CONSTITUENCIES.length : 0,
    byGroup,
    byTeam: [...teams.entries()]
      .map(([team, n]) => ({ team, reports: n }))
      .sort((a, b) => b.reports - a.reports),
    ungroupedRows: ungrouped,
  };
}

/* ------------------------------------------------------------------ */
/* Turnout                                                             */
/* ------------------------------------------------------------------ */

/** The question holding how many voters a station's list carries. */
const REGISTER_HINTS = /(voter list|on the list|registered|register)/i;
/** The questions holding how many of them had voted by a given moment. */
const VOTED_HINTS = /\bvoted\b/i;
/** The moment such a count was taken, which also names a time question. */
const MOMENT = /\b(arrival|departure|opening|closing)\b/i;
/**
 * The moment the curve is drawn from: the one the observer leaves on.
 *
 * A form takes the same reading twice, and only the second is the
 * observer's own. The arrival figure is what the polling staff said had
 * happened before anyone from the mission was in the room, and putting
 * both on one curve gives a station two points, so a station observed
 * from 07:00 to 13:00 would be counted once in the morning and again
 * after lunch.
 */
const READING_MOMENT = /\b(departure|closing)\b/i;

/**
 * The question that gives each station's electorate.
 *
 * Every turnout figure in this tool divides by this one, so it is found
 * once. A question that mentions voting is a count of votes, not of voters
 * on the list, however much of the rest of the wording matches.
 */
export function registerQuestion(dataset: Dataset): Question | null {
  return (
    dataset.questions.find(
      (q) =>
        q.kind === 'numeric' && REGISTER_HINTS.test(q.label) && !VOTED_HINTS.test(q.label),
    ) ?? null
  );
}

/** A count of votes cast, with the time question that says when it was read. */
export interface TurnoutReading {
  time: Question;
  count: Question;
  /** "arrival" or "departure": the word both questions have in common. */
  moment: string;
}

/**
 * The readings a form takes of how far voting had got.
 *
 * The polling-day form asks twice - on arrival and on departure - and each
 * time it asks for the clock time too. The pair is found by the word they
 * share, so a form that asks a third time, or names the moments
 * differently, needs no code change. A count with no time beside it is not
 * a reading: "people who voted with a duty certificate" is a total for the
 * day, and plotting it against the clock would invent a figure.
 */
export function turnoutReadings(dataset: Dataset): TurnoutReading[] {
  const times = dataset.questions.filter((q) => q.kind === 'time');
  const out: TurnoutReading[] = [];
  for (const count of dataset.questions) {
    if (count.kind !== 'numeric' || !VOTED_HINTS.test(count.label)) continue;
    const moment = MOMENT.exec(count.label)?.[1]?.toLowerCase();
    if (!moment) continue;
    const time = times.find((t) => MOMENT.exec(t.label)?.[1]?.toLowerCase() === moment);
    if (time) out.push({ time, count, moment });
  }
  return out;
}

export interface Turnout {
  /** Mean turnout per hour of the day, earliest first. */
  points: GroupMean[];
  /** How many readings went into the curve. */
  readings: number;
  /** The question the readings were divided by. */
  register: Question;
}

/**
 * How far voting had got, by the hour.
 *
 * The one thing a polling-day form can say about the day as a whole. Every
 * report records how many of that station's voters had voted when the
 * observer left, and the time they left, so a few hundred reports draw the
 * shape of the day.
 *
 * The departure reading only. The form takes the same reading on arrival
 * as well, but that one is what the staff reported had happened before the
 * mission was in the room, and counting both would give one station two
 * points on the curve.
 *
 * Each reading is a share of that station's own list and the hour's figure
 * is the mean of those shares: one station one vote, as everywhere else in
 * this tool, because a national turnout would need every station in the
 * country rather than the observed ones. A reading above the station's own
 * list is dropped rather than charted; it is not a share of anything.
 */
export function turnoutByHour(dataset: Dataset, rowFilter?: boolean[]): Turnout | null {
  const register = registerQuestion(dataset);
  const readings = turnoutReadings(dataset).filter((r) => READING_MOMENT.test(r.moment));
  if (!register || readings.length === 0) return null;

  const registerCol = register.columns[0];
  if (registerCol === undefined) return null;

  const byHour = new Map<string, number[]>();
  let n = 0;
  dataset.table.rows.forEach((row, i) => {
    if (rowFilter && !rowFilter[i]) return;
    const listed = Number(clean(row[registerCol] ?? ''));
    if (!Number.isFinite(listed) || listed <= 0) return;
    for (const r of readings) {
      const col = r.count.columns[0];
      if (col === undefined) continue;
      const voted = Number(clean(row[col] ?? ''));
      const hour = answersFor(r.time, row)[0];
      if (!hour || !Number.isFinite(voted) || voted < 0) continue;
      const pct = (voted / listed) * 100;
      if (pct > 100) continue;
      byHour.set(hour, [...(byHour.get(hour) ?? []), pct]);
      n += 1;
    }
  });
  if (byHour.size === 0) return null;

  const points = [...byHour.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, xs]) => ({
      label,
      mean: xs.reduce((a, b) => a + b, 0) / xs.length,
      n: xs.length,
    }));
  return { points, readings: n, register };
}

/** One report that rated something at the worse end of its scale. */
export interface PoorReport {
  area: string;
  constituency: string;
  station: string;
  rating: string;
}

/**
 * The reports behind a map of the worse end of a scale.
 *
 * A map shades an area and says how much of it was rated badly; the
 * next thing a mission asks is which stations those were, and the
 * reference deck answers it with a table beside the map. Named as
 * closely as the form allows - the area, the constituency, the station
 * - and a column the form does not ask for is left out rather than
 * filled with blanks.
 */
export function poorReports(
  dataset: Dataset,
  question: Question,
  rowFilter?: boolean[],
): PoorReport[] {
  const poor = new Set(poorLabels(question));
  if (poor.size === 0) return [];
  const out = namedReports(dataset, question, (a) => poor.has(a), rowFilter);
  // Worst first, and then down the country as the areas are ordered.
  const rank = (r: PoorReport): number => question.scale?.indexOf(r.rating) ?? 0;
  return out.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      dataset.groups.indexOf(a.area) - dataset.groups.indexOf(b.area) ||
      a.constituency.localeCompare(b.constituency),
  );
}

/**
 * The stations behind a follow-up question.
 *
 * "D.1.1 If No to D.1 the delay was" is asked only of the reports that
 * said the station did not open on time, so the answers to it are a
 * list of the stations that opened late and by how much. Counted on a
 * chart it says four stations were between one and fifteen minutes
 * late; the mission's next question is which four, and this is the
 * table that answers it.
 *
 * The longest answer first, by the number its band starts with -
 * "Between 16-30 minutes" after "More than 60 minutes" and before
 * "Between 1-15 minutes" - because a page of these is read from the
 * top and the worst case is what it is read for.
 */
export function answeredReports(
  dataset: Dataset,
  question: Question,
  rowFilter?: boolean[],
): PoorReport[] {
  const out = namedReports(dataset, question, (a) => !NON_ANSWERS.has(a), rowFilter);
  return out.sort(
    (a, b) =>
      b.rating.localeCompare(a.rating, 'en', { numeric: true }) ||
      dataset.groups.indexOf(a.area) - dataset.groups.indexOf(b.area) ||
      a.constituency.localeCompare(b.constituency),
  );
}

/** One row per report whose answer is wanted: where it was, and what it said. */
function namedReports(
  dataset: Dataset,
  question: Question,
  wanted: (answer: string) => boolean,
  rowFilter?: boolean[],
): PoorReport[] {
  const station = stationQuestion(dataset);
  /*
   * The constituency question, not the constituency column.
   *
   * The polling-day form asks it in a column per area and a report
   * fills the one its station is in, so reading the column the dataset
   * settled on gave a blank for every report filed from anywhere else.
   */
  const constituency =
    dataset.constituencyColumn !== null
      ? (dataset.questions.find((x) =>
          x.columns.includes(dataset.constituencyColumn!),
        ) ?? null)
      : null;

  const out: PoorReport[] = [];
  dataset.table.rows.forEach((row, i) => {
    if (rowFilter && !rowFilter[i]) return;
    const rating = answersFor(question, row)[0];
    if (!rating || !wanted(rating)) return;
    const named = constituency ? (answersFor(constituency, row)[0] ?? '') : '';
    out.push({
      area: dataset.rowGroup[i] ?? '',
      constituency: named ? (resolveConstituency(named)?.name ?? named) : '',
      station: (station && answersFor(station, row)[0]) || '',
      rating,
    });
  });
  return out;
}

/**
 * Whether a question's answers are worth naming the stations behind.
 *
 * A follow-up to a Yes/No question is asked only of the reports whose
 * answer to it was the one that needs following up, so the reports
 * that answered are a short list of stations where something
 * happened - and the deck already counts them without ever saying
 * which. It has to be a question with a fixed set of answers: a
 * follow-up that asks for a number is a different page, and one that
 * offers a tick box per option is a block, not a column.
 */
export function namesStations(dataset: Dataset, question: Question): boolean {
  if (question.kind !== 'categorical' && question.kind !== 'ordinal') return false;
  if (stationQuestion(dataset) === null) return false;
  const cut = question.code.lastIndexOf('.');
  if (cut <= 1) return false;
  const parent = dataset.questions.find((q) => q.code === question.code.slice(0, cut));
  return parent !== undefined && parent !== question && parent.kind === 'binary';
}

/** The question asking what time the observer left, if the form asks. */
export function departureTime(dataset: Dataset): Question | null {
  return (
    dataset.questions.find((q) => q.kind === 'time' && READING_MOMENT.test(q.label)) ?? null
  );
}

/** One hour of the day, and how the reports filed from it rated the question. */
export interface HourRatings {
  /** The hour the observers left, as the clock reads it. */
  label: string;
  /** One entry per scale point, in the order the chart draws them. */
  counts: Count[];
  /** Reports rating it in that hour. */
  n: number;
}

/**
 * A rating question read against the clock.
 *
 * "J.1 The overall conduct of the voting in this PS was" answered by
 * nine stations says how the day went; the same answers against the
 * hour each observer left say when it went that way, which is the
 * question a mission asks next - the reference deck gives it a page of
 * its own. The hour is the departure reading, as the turnout curve is,
 * because that is when the observer had seen the whole of their visit.
 */
export function ratingByHour(
  dataset: Dataset,
  question: Question,
  rowFilter?: boolean[],
): { hours: HourRatings[]; answers: string[] } | null {
  const time = departureTime(dataset);
  if (!time || !question.scale || question.scale.length < 2) return null;

  const b = analyse(dataset, question, rowFilter);
  const answers = displayCounts(question, b)
    .filter((c) => question.scale!.includes(c.label))
    .map((c) => c.label);
  if (answers.length === 0) return null;

  const byHour = new Map<string, Map<string, number>>();
  dataset.table.rows.forEach((row, i) => {
    if (rowFilter && !rowFilter[i]) return;
    const hour = answersFor(time, row)[0];
    const given = answersFor(question, row)[0];
    if (!hour || !given || !answers.includes(given)) return;
    const m = byHour.get(hour) ?? new Map<string, number>();
    m.set(given, (m.get(given) ?? 0) + 1);
    byHour.set(hour, m);
  });
  if (byHour.size === 0) return null;

  const hours = [...byHour.entries()]
    .sort((a, c) => a[0].localeCompare(c[0]))
    .map(([label, m]) => {
      const counts = answers.map((a) => ({ label: a, n: m.get(a) ?? 0, pct: 0 }));
      const n = counts.reduce((t, c) => t + c.n, 0);
      return { label, counts: counts.map((c) => ({ ...c, pct: n > 0 ? (c.n / n) * 100 : 0 })), n };
    });
  return { hours, answers };
}

/**
 * A count of votes cast, as the share of the station's list that it is.
 *
 * "D.2 Total number of voters who had already voted" counted in bands says
 * how many stations had served between 200 and 399 voters, which puts a
 * station of 2,000 beside a station of 300 and means nothing in either. The
 * same answer as a share of that station's own list is turnout, which is
 * the figure a mission reports.
 *
 * Only for the questions that are turnout readings - the ones asked
 * against a clock time. "People who voted with a duty certificate" also
 * counts votes, and 0.1% of the register is a true but useless answer to
 * it; what a mission wants there is how many there were.
 */
export function shareOfRegister(
  dataset: Dataset,
  question: Question,
  rowFilter?: boolean[],
): Percentage | null {
  if (question.kind !== 'numeric' || !VOTED_HINTS.test(question.label)) return null;
  if (!turnoutReadings(dataset).some((r) => r.count.columns[0] === question.columns[0])) {
    return null;
  }
  const register = registerQuestion(dataset);
  const col = question.columns[0];
  const registerCol = register?.columns[0];
  if (!register || col === undefined || registerCol === undefined) return null;
  if (col === registerCol) return null;

  const all: number[] = [];
  const byParty = new Map<string, number[]>();
  const byArea = new Map<string, number[]>();

  dataset.table.rows.forEach((row, i) => {
    if (rowFilter && !rowFilter[i]) return;
    const listed = Number(clean(row[registerCol] ?? ''));
    const voted = Number(clean(row[col] ?? ''));
    if (!Number.isFinite(listed) || listed <= 0) return;
    if (!Number.isFinite(voted) || voted < 0) return;
    const pct = (voted / listed) * 100;
    if (pct > 100) return;
    all.push(pct);
    const party = dataset.rowParty[i];
    if (party) byParty.set(party, [...(byParty.get(party) ?? []), pct]);
    const area = dataset.rowGroup[i];
    if (area) byArea.set(area, [...(byArea.get(area) ?? []), pct]);
  });

  if (all.length === 0) return null;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const ordered = (m: Map<string, number[]>, order: string[]): GroupMean[] =>
    order
      .filter((label) => m.has(label))
      .map((label) => ({ label, mean: mean(m.get(label)!), n: m.get(label)!.length }));

  const of = register.label
    .replace(/^(what is the )?total number of /i, '')
    .replace(/[.:]\s*$/, '')
    .toLowerCase();
  return {
    mean: mean(all),
    n: all.length,
    byParty: ordered(byParty, dataset.parties),
    byArea: ordered(byArea, dataset.groups),
    basis: `As a share of ${of}`,
  };
}

/* ------------------------------------------------------------------ */
/* The figures a summary page carries                                  */
/* ------------------------------------------------------------------ */

/** Scale points that make a question an assessment rather than a tally. */
const RATING_WORDS = /(very good|very bad|excellent|good|bad|poor|satisfactory)/i;

/**
 * The questions that ask an observer to rate what they saw.
 *
 * Found by their scale rather than by their section letter, which used to
 * be J: the polling-day form rates five things in section J and the opening
 * form rates one in section G, and a tool that knows only about J reports
 * nothing at all for a morning's observation.
 */
export function ratingQuestions(dataset: Dataset): Question[] {
  return dataset.questions.filter(isRatingQuestion);
}

/** Whether a question asks an observer to rate something. */
export function isRatingQuestion(q: Question): boolean {
  return (
    q.kind === 'ordinal' &&
    (q.scale?.length ?? 0) > 1 &&
    q.scale!.some((v) => RATING_WORDS.test(v))
  );
}

/**
 * The worse end of a rating scale, named.
 *
 * The strict bottom half, so the midpoint of an odd scale - "Not
 * good/Not bad" - is counted as neither: the better half leaves it out
 * too, and a map headed "rated Bad or Very bad" must not shade a place
 * where nobody said either.
 */
export function poorLabels(question: Question): string[] {
  const scale = question.scale;
  if (!scale || scale.length < 2) return [];
  return scale.slice(0, Math.floor(scale.length / 2));
}

/** How a rating question came out: its mean, and the share rated above halfway. */
export interface Rating {
  question: Question;
  mean: number;
  /** The scale's length, so 3.4 can be read as 3.4 out of 4. */
  points: number;
  /** Reports rating it in the better half of the scale. */
  good: number;
  /** Those reports as a share of the ones that rated it. */
  goodPct: number;
  /** The scale points counted as good, for the line beside the figure. */
  goodLabels: string[];
}

export function ratingOf(
  dataset: Dataset,
  question: Question,
  rowFilter?: boolean[],
): Rating | null {
  const scale = question.scale;
  if (!scale || scale.length < 2) return null;
  const b = analyse(dataset, question, rowFilter);
  if (b.meanScore === undefined) return null;
  /*
   * The better half of the scale.
   *
   * Four points gives the top two, five gives the top two as well: the
   * midpoint of an odd scale - "Not good/Not bad" - is not a good rating
   * and a summary figure that counted it as one would overstate the day.
   */
  const goodLabels = scale.slice(Math.ceil(scale.length / 2));
  const countOf = (label: string) => b.total.find((c) => c.label === label)?.n ?? 0;
  const answered = scale.reduce((t, label) => t + countOf(label), 0);
  const good = goodLabels.reduce((t, label) => t + countOf(label), 0);
  if (answered === 0) return null;
  return {
    question,
    mean: b.meanScore,
    points: scale.length,
    good,
    goodPct: (good / answered) * 100,
    goodLabels,
  };
}

/**
 * The question asking what kind of place the station is.
 *
 * Rural against urban, permanent against temporary: a handful of answers
 * that describe the station rather than anything that happened in it, which
 * is why it belongs on the coverage page and not among the findings.
 */
export function stationTypeQuestion(dataset: Dataset): Question | null {
  return (
    dataset.questions.find(
      (q) =>
        (q.kind === 'categorical' || q.kind === 'binary') &&
        /\b(polling station|station|centre|center|ps)\b/i.test(q.label) &&
        /\btype\b/i.test(q.label),
    ) ?? null
  );
}

/** The words a form uses for the place a report was filed from. */
const STATION_WORDS = /\b(polling station|station|centre|center|ps)\b/i;

/**
 * The question naming or numbering the polling station.
 *
 * The name first here, because this one is read by a person off a
 * table; `stationsObserved` prefers the number, because that one is
 * counted and two villages can name a school the same thing.
 */
export function stationQuestion(dataset: Dataset): Question | null {
  const named = (what: RegExp) =>
    dataset.questions.find(
      (q) =>
        q.kind !== 'meta' &&
        STATION_WORDS.test(q.label) &&
        what.test(q.label),
    );
  return named(/\bname\b/i) ?? named(/\b(number|code)\b/i) ?? null;
}

/**
 * How many polling stations the reports came from.
 *
 * Distinct stations, not reports: two observers at one station on the same
 * day is one station observed, and a coverage figure that counted it twice
 * would overstate the deployment. The station's number is preferred to its
 * name, because two villages can name a school the same thing.
 */
export function stationsObserved(dataset: Dataset, rowFilter?: boolean[]): number | null {
  const named = (what: RegExp) =>
    dataset.questions.find(
      (q) =>
        q.kind !== 'meta' &&
        /\b(polling station|station|centre|center|ps)\b/i.test(q.label) &&
        what.test(q.label),
    );
  const q = named(/\b(number|code)\b/i) ?? named(/\bname\b/i);
  if (!q) return null;

  const seen = new Set<string>();
  dataset.table.rows.forEach((row, i) => {
    if (rowFilter && !rowFilter[i]) return;
    const v = answersFor(q, row)[0];
    if (v) seen.add(v.toLowerCase());
  });
  return seen.size > 0 ? seen.size : null;
}

/* ------------------------------------------------------------------ */
/* The same question, across the country                               */
/* ------------------------------------------------------------------ */

/** One column of a 100% stacked chart: a group, and how it answered. */
export interface ShareGroup {
  label: string;
  /** Reports behind the column, NA included: a column is of reports. */
  n: number;
  /** One entry per answer, in the chart's order, zeros included. */
  counts: Count[];
}

/** One chart of such columns. */
export interface SharePanel {
  title: string;
  groups: ShareGroup[];
}

/**
 * One question's answers as shares: nationally, and across the country.
 *
 * The question's own slide counts the answers; this says what proportion
 * of each place answered which way, which is the only form in which two
 * places of very different size can be compared at a glance. Banjul
 * answering No eleven times and Basse answering No four is a bar twice as
 * long for Banjul and tells a reader nothing about either place.
 *
 * The columns are of reports rather than of answers, so NA is a segment
 * like any other and every column is full height. That is not the rate
 * the findings table and the maps print, which is of the reports that
 * could answer; a composition and a rate are different figures and this
 * one says so by charting NA rather than dropping it.
 */
export interface Shares {
  /** The answers, in the order every panel stacks them. */
  answers: string[];
  panels: SharePanel[];
  /**
   * What a column is made of, where it is not reports.
   *
   * The page is otherwise the same for every question and needs no
   * explaining. "E.1.1 How many of the polling staff are female" is the
   * exception: its columns are the staff themselves, so the figure over
   * each one counts people and not reports, and a page that does not
   * say so says more than the data supports.
   */
  unit?: string;
}

/**
 * The answers to one question, split by the answers to another.
 *
 * Only used for the station type, which describes the place rather than
 * the day, so no banding or gazetteer resolution is wanted: the values go
 * in as the form stores them. The area and the party, which every question
 * is broken down by, are `analyse`'s own work.
 */
export function countsBy(
  dataset: Dataset,
  question: Question,
  by: Question,
  order: string[],
  rowFilter?: boolean[],
): ShareGroup[] {
  const per = new Map<string, Map<string, number>>();
  dataset.table.rows.forEach((row, i) => {
    if (rowFilter && !rowFilter[i]) return;
    const key = answersFor(by, row)[0];
    if (!key || NON_ANSWERS.has(key)) return;
    const answers = answersFor(question, row);
    if (answers.length === 0) return;
    const m = per.get(key) ?? new Map<string, number>();
    for (const a of answers) m.set(a, (m.get(a) ?? 0) + 1);
    per.set(key, m);
  });

  // Commonest kind of station first, which is the order its own chart on
  // the coverage page puts it in.
  return [...per.entries()]
    .map(([label, m]) => ({ label, counts: toCounts(m, order) }))
    .sort((a, b) => sumCounts(b.counts) - sumCounts(a.counts))
    .map((g) => ({ label: g.label, n: sumCounts(g.counts), counts: g.counts }));
}

function sumCounts(counts: Count[]): number {
  return counts.reduce((s, c) => s + c.n, 0);
}

/** The minimum places worth a chart of their own: two is a comparison. */
const MIN_SHARE_GROUPS = 3;

export function sharesAcross(
  dataset: Dataset,
  question: Question,
  rowFilter?: boolean[],
  breakdown?: Breakdown,
): Shares | null {
  /*
   * A number is in this too, where its bands are few enough.
   *
   * "E.1 How many polling staff members are present" is answered 1 to 5
   * and banded one value to a band, which is a composition like any
   * other: the section around it had the national, by-type and by-area
   * page and it did not, for no reason a reader could see. A number of
   * many bands still falls out below, on the count of answers.
   */
  if (!['binary', 'categorical', 'ordinal', 'numeric'].includes(question.kind)) return null;
  if (question.kind === 'numeric') {
    /*
     * A count of a few things, not a number in ranges.
     *
     * "How many polling staff members are present" is answered 1 to 5
     * and banded one value to a band, which is a composition. "Total
     * number of voters on the voter list" is banded "4,000 to 4,999",
     * and a station's own number is an identifier: neither is a thing
     * an area can hold more or less of. A question asked as a
     * percentage is averaged rather than banded, and has its own page.
     */
    if (isPercentageQuestion(question)) return null;
    /*
     * A count that is part of another count is stacked as that share.
     *
     * Not as a count of its answers: "two of the staff are women" says
     * two of five at one station and two of four at the next, and an
     * area does not hold more or less of the digit 2. The columns are
     * the staff themselves. See `sharesOfParent`.
     */
    if (parentCount(dataset, question)) return sharesOfParent(dataset, question, rowFilter);
    const bands = bandingFor(dataset, question, rowFilter)?.labels ?? [];
    if (bands.length === 0 || bands.some((l) => l.includes(' to '))) return null;
  }
  const b = breakdown ?? analyse(dataset, question, rowFilter);
  const counts = displayCounts(question, b);
  // Six colours stacked in a column is a pattern rather than a chart, and
  // one answer is not a composition.
  if (counts.length < 2 || counts.length > 5) return null;
  const places = dataset.groups.filter((g) => b.byArea[g]);
  if (places.length < MIN_SHARE_GROUPS) return null;

  const answers = counts.map((c) => c.label);
  /** Every answer in every column, so a place that never said No still has a No. */
  const fill = (source: Count[]): Count[] =>
    answers.map(
      (label) => source.find((c) => c.label === label) ?? { label, n: 0, pct: 0 },
    );

  const panels: SharePanel[] = [
    {
      title: 'National',
      groups: [{ label: 'National', n: sumCounts(counts), counts: fill(counts) }],
    },
  ];

  /*
   * By the kind of place, where the form asks what kind of place it is.
   *
   * A rural station and an urban one are not the same observation, and the
   * reference deck splits every question of this shape that way. It is
   * left out of the question's own breakdown, which has the area and the
   * party to fit already.
   */
  const type = stationTypeQuestion(dataset);
  if (type && type.columns[0] !== question.columns[0]) {
    const split = countsBy(dataset, question, type, answers, rowFilter);
    if (split.length >= 2) {
      panels.push({
        title: 'By station type',
        groups: split.map((g) => ({ ...g, counts: fill(g.counts) })),
      });
    }
  }

  panels.push({
    title: dataset.geo ? `By ${AREA_WORDS[dataset.division].one}` : 'By area',
    groups: places.map((place) => ({
      label: place,
      n: sumCounts(b.byArea[place]!),
      counts: fill(b.byArea[place]!),
    })),
  });

  return { answers, panels };
}

/* ------------------------------------------------------------------ */
/* A section, on one page                                              */
/* ------------------------------------------------------------------ */

/** One question's answers, as a row of a section's chart. */
export interface SectionRow {
  question: Question;
  /** One entry per answer, in the section's order, zeros included. */
  counts: Count[];
  /** Reports behind the row, NA included. */
  n: number;
}

/**
 * A whole section of questions asked the same way, on one page.
 *
 * Ten questions answered Yes or No are ten pages of two bars each, and a
 * reader who has to turn ten pages to learn that one of them stands out
 * will not find it. Read as one chart - a row per question, each row a
 * full-width 100% stacked bar - the section states itself: F.6 at 35% is
 * visible beside nine questions above 89% without reading a number.
 *
 * The questions' own pages still follow, with their counts and their
 * breakdowns; this is the section's first page, not a replacement for them.
 */
export interface SectionOverview {
  /** Section letter, as the form's codes give it. */
  section: string;
  answers: string[];
  rows: SectionRow[];
}

/**
 * What makes two questions comparable on one chart.
 *
 * Their scale, not the answers that happened to be given. A question
 * answered No on every report has only one answer in its breakdown, and
 * keyed on that it would be split off onto a chart of its own - which is
 * precisely the question a reader most wants to see in the row above the
 * others.
 */
function scaleKey(q: Question): string | null {
  if (q.scale && q.scale.length > 1) return q.scale.join('\u0001');
  if (q.kind === 'binary') return 'binary';
  return null;
}

/** The most rows one chart is given before the section runs to a second page. */
const SECTION_ROWS = 12;

export function sectionOverviews(
  dataset: Dataset,
  questions: Question[],
  rowFilter?: boolean[],
): SectionOverview[] {
  const groups = new Map<string, { q: Question; b: Breakdown }[]>();
  for (const q of questions) {
    const key = scaleKey(q);
    if (!key || !q.section) continue;
    /*
     * The section's own questions, not its follow-ups.
     *
     * A page headed "Section E" that opens on E.1.2 and then jumps to
     * E.4 is not the section: it is three of its nine questions, and a
     * reader looking for E.1 on it does not find it. A follow-up is
     * asked only of the reports whose parent answer led to it, so its
     * bar rests on a different base from the bars around it as well.
     * Those questions keep their own pages, after the question they
     * follow.
     */
    if (q.code.split('.').length !== 2) continue;
    const b = analyse(dataset, q, rowFilter);
    if (b.total.length === 0) continue;
    const id = `${q.section}\u0001${key}`;
    groups.set(id, [...(groups.get(id) ?? []), { q, b }]);
  }

  const out: SectionOverview[] = [];
  for (const [id, members] of groups) {
    // Two rows is a pair of charts that each had room to say more.
    if (members.length < 3) continue;
    const section = id.split('\u0001')[0]!;
    const scale = members[0]!.q.scale;
    const answers = [
      // Best first, as everywhere a scale is charted. See `displayCounts`.
      ...(scale && scale.length > 1 ? [...scale].reverse() : ['Yes', 'No']),
      // NA is a segment here as everywhere, and last.
      ...[...NON_ANSWERS].filter((na) =>
        members.some((m) => m.b.total.some((c) => c.label === na && c.n > 0)),
      ),
    ];

    /*
     * The pages a section needs, filled evenly.
     *
     * Thirteen questions at twelve to a page is a page of twelve and a
     * page of one, and D.14 alone under a heading reading "Section D"
     * looks like a mistake rather than a continuation. The same two
     * pages hold seven and six, which read as one section split in
     * half - which is what they are.
     */
    const pages = Math.ceil(members.length / SECTION_ROWS);
    const perPage = Math.ceil(members.length / pages);

    for (let i = 0; i < members.length; i += perPage) {
      out.push({
        section,
        answers,
        rows: members.slice(i, i + perPage).map(({ q, b }) => ({
          question: q,
          n: b.total.reduce((s, c) => s + c.n, 0),
          counts: answers.map(
            (label) => b.total.find((c) => c.label === label) ?? { label, n: 0, pct: 0 },
          ),
        })),
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Who filed the reports                                               */
/* ------------------------------------------------------------------ */

/** One team type, and the reports each of its teams filed. */
export interface TeamPanel {
  /** The column's own heading: the team type it was printed for. */
  label: string;
  counts: Count[];
}

/** Whether a question is one of the columns naming the team. */
function namesATeam(q: Question): boolean {
  return /\bteam\b/i.test(q.label) && /\b(number|no|id|code)\b/i.test(q.label);
}

/**
 * The question naming the team that filed the report.
 *
 * The form asks it once per team type - "A.1 Team number - LTO" through
 * "- CT" - so the columns are the team types and the answers inside them
 * are the teams themselves. Where the form prints it in several columns
 * this is the first of them, and the page it draws covers them all.
 */
export function teamQuestion(dataset: Dataset): Question | null {
  return dataset.questions.find(namesATeam) ?? null;
}

/** Whether this question is one of the columns that page is drawn from. */
export function isTeamQuestion(dataset: Dataset, q: Question): boolean {
  const first = teamQuestion(dataset);
  return first !== null && namesATeam(q) && q.code === first.code;
}

/**
 * Every column the form printed the team number in, with its team type.
 *
 * Read from the headers rather than from one question, because the tool
 * does not always read these columns as one question: a report that fills
 * two of them - as a form does where a team of two observers writes both
 * their numbers - is the signature of columns that only share a stem, and
 * `splitBase` leaves those apart on purpose. They are still the same
 * question to a reader, and still belong on one page.
 */
export function teamColumns(dataset: Dataset): { col: number; label: string }[] {
  const first = teamQuestion(dataset);
  if (!first) return [];
  const out: { col: number; label: string }[] = [];
  for (const q of dataset.questions) {
    if (q.code !== first.code || !namesATeam(q)) continue;
    const labels = q.columnLabels ?? [];
    q.columns.forEach((col, i) => {
      const suffix = splitBase(dataset.table.headers[col] ?? '')?.suffix;
      out.push({ col, label: labels[i] ?? suffix ?? q.label });
    });
  }
  return out.sort((a, b) => a.col - b.col);
}

/**
 * Every team, with the reports it filed, grouped by team type.
 *
 * Read as one chart the teams are sixty bars with no order to them; read
 * as a chart per team type, each team beside the others doing the same
 * job, the chart answers the question it is there for - which teams are
 * reporting, and which have not reported at all.
 */
/**
 * The teams between the lowest and the highest that filed, including
 * the ones that filed nothing.
 *
 * A team missing from the axis reads as a team that does not exist,
 * when what it means is that nothing has come in from it - which is
 * the one thing this page is read for during a deployment. LTO 03 and
 * LTO 06 were simply absent between 02 and 08.
 *
 * Only where the numbering says so. The teams have to be one prefix
 * and a number of one width, and the gaps have to be fewer than the
 * teams that filed: "STO 0401" and "STO 0601" are a region and a team
 * rather than teams one and two hundred and one, and filling that
 * range would invent two hundred teams. Nothing is added past the
 * highest number seen, because how many teams there are is the
 * mission's own figure and this page has never known it.
 */
function withSilentTeams(counts: Count[]): Count[] {
  if (counts.length < 2) return counts;
  const parsed = counts.map((c) => /^(.*?)(\d+)$/.exec(c.label));
  if (parsed.some((m) => m === null)) return counts;
  const prefix = parsed[0]![1]!;
  const width = parsed[0]![2]!.length;
  if (parsed.some((m) => m![1] !== prefix || m![2]!.length !== width)) return counts;
  const numbers = parsed.map((m) => Number(m![2]));
  const lo = Math.min(...numbers);
  const hi = Math.max(...numbers);
  const missing = hi - lo + 1 - counts.length;
  if (missing <= 0 || missing >= counts.length) return counts;
  const have = new Map(numbers.map((n, i) => [n, counts[i]!]));
  const out: Count[] = [];
  for (let n = lo; n <= hi; n += 1) {
    out.push(
      have.get(n) ?? { label: `${prefix}${String(n).padStart(width, '0')}`, n: 0, pct: 0 },
    );
  }
  return out;
}

/*
 * A team type nobody filed from keeps its panel.
 *
 * The form offers LTO, STO, LSTO, MEP and CT, and dropping the empty
 * ones left a page of two headings - a deployment of two kinds of team,
 * rather than three kinds that have sent nothing in, which during a
 * deployment is the thing this page is read for. The panel says so in
 * words, because there are no team numbers to draw as bars of nought.
 */
export function teamReports(dataset: Dataset, rowFilter?: boolean[]): TeamPanel[] {
  return teamColumns(dataset)
    .map(({ col, label }) => {
      const tally = new Map<string, number>();
      dataset.table.rows.forEach((row, r) => {
        if (rowFilter && !rowFilter[r]) return;
        const v = clean(row[col] ?? '');
        if (isBlank(v) || NON_ANSWERS.has(v)) return;
        tally.set(v, (tally.get(v) ?? 0) + 1);
      });
      const counts = [...tally.entries()]
        // Team 2 after team 1 and before team 10: a team's name is an
        // identifier, and sorting it as text puts "A.10" above "A.2".
        .sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }))
        .map(([label, n]) => ({ label, n, pct: 0 }));
      return { label, counts: withSilentTeams(counts) };
    });
}

/* ------------------------------------------------------------------ */
/* Findings: what a mission actually wants surfaced first              */
/* ------------------------------------------------------------------ */

export interface Finding {
  question: Question;
  /** The answer that constitutes a problem, e.g. "Yes" to an irregularity. */
  label: string;
  n: number;
  pct: number;
  /** Areas where this is worse than the national rate, worst first. */
  hotspots: { group: string; pct: number; n: number; total: number }[];
}

/**
 * Questions where "Yes" means something went wrong. The wording is stable
 * across EOM forms, so a keyword match on the question text is reliable
 * enough to rank by, and anything it misses is still visible in the full
 * question list.
 */
const PROBLEM_WORDS =
  /(problem|unauthorised|unauthorized|interfer|overcrowd|unrest|tension|campaign material|campaign activit|missing|turned away|without proper|influence|voting together|stuffing|proxy|compelled|objection|intimidat|violence|vote buying|irregular|refus|denied|pressure)/i;

/** Questions where "No" is the bad answer. */
const INVERTED =
  /(able to observe|accessible|adequate|sufficiently protect|in plain view|suitable|explained|marked with ink|check(ed)? the voters|sign the voter list|secrecy|resolved)/i;

/**
 * Minimum reports in a group before it can be called a hotspot. Without
 * this, one observer reporting one problem in an area with one report
 * produces a "100%" finding, which is noise presented as a signal.
 */
const MIN_HOTSPOT_REPORTS = 5;

/**
 * True where "No" is the answer that indicates a problem.
 *
 * The findings ranking has always known this, but nothing else did, so a
 * chart of "Is the polling station accessible?" coloured Yes as the problem
 * and No as the clear answer, which is exactly backwards, and the same chart
 * sat on a slide next to a findings table that ranked it the other way. The
 * polarity now comes from one place.
 */
export function isInverted(label: string): boolean {
  return INVERTED.test(label);
}

export function findings(dataset: Dataset, rowFilter?: boolean[], limit = 12): Finding[] {
  const out: Finding[] = [];

  for (const q of dataset.questions) {
    if (q.kind !== 'binary') continue;
    const inverted = isInverted(q.label);
    if (!inverted && !PROBLEM_WORDS.test(q.label)) continue;

    const bad = inverted ? 'No' : 'Yes';
    const b = analyse(dataset, q, rowFilter);
    const hit = b.total.find((c) => c.label === bad);
    if (!hit || hit.n === 0) continue;

    // Of the reports that could answer. NA is on the chart but it is not
    // part of a rate: "a problem on 40% of reports" has to mean 40% of the
    // reports in a position to see one.
    const rate = b.answered > 0 ? (hit.n / b.answered) * 100 : 0;

    const hotspots = Object.entries(b.byArea)
      .map(([group, counts]) => {
        const total = realTotal(counts);
        const badCount = counts.find((c) => c.label === bad)?.n ?? 0;
        return { group, n: badCount, total, pct: total > 0 ? (badCount / total) * 100 : 0 };
      })
      .filter((h) => h.pct > rate && h.n > 0 && h.total >= MIN_HOTSPOT_REPORTS)
      .sort((a, b2) => b2.pct - a.pct);

    out.push({ question: q, label: bad, n: hit.n, pct: rate, hotspots });
  }

  return out.sort((a, b) => b.pct - a.pct).slice(0, limit);
}
