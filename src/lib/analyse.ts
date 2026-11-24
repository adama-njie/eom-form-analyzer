/**
 * Turn a parsed form into the numbers the report needs.
 *
 * Everything is computed from the inferred schema, so adding a question to a
 * form, or swapping Form B for Form D, needs no code change.
 */

import {
  ALL_CONSTITUENCIES,
  CONSTITUENCY_TO_DISTRICT,
  DISTRICT_SHAPES,
  LGAS,
  TOTAL_REGISTERED_2026,
  lgaName,
  registeredOf,
  resolveConstituency,
  resolveLga,
  type LgaCode,
  type MapUnit,
} from './gambia';
import {
  NON_ANSWERS,
  clean,
  isBlank,
  parseCode,
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
}

export interface Dataset {
  table: Table;
  questions: Question[];
  /** Column index holding the area or district, if one was found. */
  areaColumn: number | null;
  /** Area code per row, where resolvable against Gambian geography. */
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

export function buildDataset(table: Table, questions: Question[]): Dataset {
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

  // The constituency column is whichever column resolves to the most known
  // constituencies, rather than whichever is named most plausibly.
  let constituencyColumn: number | null = null;
  let bestConstHits = 0;
  headers.forEach((h, i) => {
    if (i === areaColumn) return;
    if (!/(constituenc|district|area|ward)/i.test(h)) return;
    const hits = rows.reduce(
      (acc, r) => acc + (resolveConstituency(clean(r[i] ?? '')) ? 1 : 0),
      0,
    );
    if (hits > bestConstHits) {
      bestConstHits = hits;
      constituencyColumn = i;
    }
  });

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

  const rowArea = rows.map((r) =>
    areaColumn === null ? null : resolveLga(clean(r[areaColumn] ?? '')),
  );
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
    ? LGAS.filter((a) => rowArea.includes(a.code)).map((a) => a.name)
    : [...new Set(rowGroup.filter((g): g is string => Boolean(g)))].sort();

  const rowConstituency = rows.map((r) =>
    constituencyColumn === null
      ? null
      : (resolveConstituency(clean(r[constituencyColumn] ?? ''))?.name ?? null),
  );
  const seenConstituencies = new Set(rowConstituency.filter(Boolean) as string[]);
  const constituencies = LGAS.flatMap((a) =>
    a.constituencies.filter((c) => seenConstituencies.has(c)),
  );

  return {
    table,
    questions,
    areaColumn,
    rowArea,
    rowGroup,
    groups,
    geo,
    constituencyColumn,
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
  const v = clean(row[question.columns[0]!] ?? '');
  if (isBlank(v)) return [];
  return [question.kind === 'time' ? bucketTime(v) : v];
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

  rows.forEach((row, i) => {
    if (!include(i)) return;
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
  };

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
export function displayCounts(_q: Question, b: Breakdown): Count[] {
  return b.total;
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

/**
 * The district a row falls in, via its constituency.
 *
 * The 53 constituencies and the 48 districts are different divisions, so
 * some constituencies have no district. Those rows are left out of the
 * district map and counted by `unmappedDistrictRows`, never folded into a
 * neighbour.
 */
function districtOf(dataset: Dataset, i: number): string | null {
  const c = dataset.rowConstituency[i];
  if (!c) return null;
  return CONSTITUENCY_TO_DISTRICT[c] ?? null;
}

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
 * The rate of one answer to one question, per area or per constituency.
 *
 * This is what the map shades. `null` where a place returned no answers,
 * which the map must draw differently from zero: "nobody observed here" and
 * "nobody reported a problem here" are not the same statement, and
 * conflating them in an observation report would be a serious error.
 */
export function rateByPlace(
  dataset: Dataset,
  question: Question,
  answer: string,
  level: MapUnit,
  rowFilter?: boolean[],
): PlaceRate[] {
  const places =
    level === 'lga' ? LGAS.map((a) => a.name) : DISTRICT_SHAPES.map((d) => d.key);
  const keyOf = (i: number) =>
    level === 'lga'
      ? (dataset.rowArea[i] ? lgaName(dataset.rowArea[i]!) : null)
      : districtOf(dataset, i);

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
    if (real.includes(answer)) hits.set(place, (hits.get(place) ?? 0) + 1);
  });

  return places.map((place) => {
    const total = totals.get(place) ?? 0;
    const n = hits.get(place) ?? 0;
    return { place, total, n, pct: total > 0 ? (n / total) * 100 : null };
  });
}

/** Report counts per place, for the default coverage map. */
export function reportsByPlace(
  dataset: Dataset,
  level: MapUnit,
  rowFilter?: boolean[],
): PlaceRate[] {
  const places =
    level === 'lga' ? LGAS.map((a) => a.name) : DISTRICT_SHAPES.map((d) => d.key);
  const counts = new Map<string, number>();
  dataset.table.rows.forEach((_row, i) => {
    if (rowFilter && !rowFilter[i]) return;
    const place =
      level === 'lga'
        ? (dataset.rowArea[i] ? lgaName(dataset.rowArea[i]!) : null)
        : districtOf(dataset, i);
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
        dataset.constituencyColumn === null
          ? ''
          : clean(row[dataset.constituencyColumn] ?? '');
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

  const groups = LGAS.filter((a) => totals.has(a.name)).map((a) => {
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
  /** Share of the 2021 register in observed areas. Only meaningful in geo mode. */
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

  const universe = dataset.geo ? LGAS.map((a) => a.name) : dataset.groups;
  const byGroup = universe.map((label) => ({
    label,
    reports: counts.get(label) ?? 0,
    registered: dataset.geo
      ? (() => {
          const a = LGAS.find((x) => x.name === label);
          return a ? registeredOf(a.code) : null;
        })()
      : null,
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
    constituenciesTotal: dataset.geo ? ALL_CONSTITUENCIES.length : 0,
    byGroup,
    byTeam: [...teams.entries()]
      .map(([team, n]) => ({ team, reports: n }))
      .sort((a, b) => b.reports - a.reports),
    ungroupedRows: ungrouped,
  };
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
