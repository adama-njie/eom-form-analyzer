/**
 * Free-text answers.
 *
 * A long form has three kinds of text column and they want different
 * treatment.
 *
 * One is an identifier: a constituency, a village, a polling station code, a
 * date. Counting its distinct values is useful, and that is what it gets.
 *
 * One is prose: "In a short paragraph, please describe the main messages of
 * the event". Counting distinct values here is pointless, because every
 * answer is unique and a bar chart of ninety bars of one is not a chart. The
 * reference campaign report puts a word cloud on each of its prose
 * questions, which is the right instinct: the only thing a reader takes in
 * at a glance is which words keep coming up.
 *
 * The third is a list, and it is the one that was being got wrong. "Which
 * security forces were present?" is answered "Gambia Police, Ecowas, Armed
 * forces, Police Intervention Unit", and "which outlet?" is answered
 * "Television & Digital: GRTS, QTV, Kerr Fatou, Gambia Talents / Print: The
 * Standard Newspaper, Foroyaa". Those are not sentences and they are not
 * single values: they are lists of named things, written with whatever
 * separator the observer reached for. Counted as words they came out as
 * Intervention(4), Unit(4), Kerr(3), Fatou(3) - fragments of names, which in
 * a report is worse than useless. Counted as whole items they come out as
 * the names themselves.
 */

/**
 * Words carrying no signal in a word cloud.
 *
 * English function words, plus the words the forms themselves put in every
 * answer. "Polling", "station" and "event" appear in nearly every response to
 * a question that asked about the polling station at an event, so leaving
 * them in gives a cloud whose three largest words are the question.
 */
const STOPWORDS = new Set(
  `a about above after again against all am an and any are aren't as at be because been
   before being below between both but by can cannot could couldn't did didn't do does
   doesn't doing don't down during each few for from further had hadn't has hasn't have
   haven't having he her here hers herself him himself his how i if in into is isn't it
   its itself let's me more most mustn't my myself no nor not of off on once only or
   other ought our ours ourselves out over own same shan't she should shouldn't so some
   such than that the their theirs them themselves then there these they this those
   through to too under until up very was wasn't we were weren't what when where which
   while who whom why with won't would wouldn't you your yours yourself yourselves
   also just got get really many much one two three said says say will shall may might
   within upon per etc na dk yes no none nil nothing n/a
   event events polling station stations observer observers report reports`
    .split(/\s+/)
    .filter(Boolean),
);

/** A rough median, which is all these decisions need. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** The answers of a column, blanks dropped. */
function filledOf(values: string[]): string[] {
  return values.map((v) => v.trim()).filter(Boolean);
}

/**
 * Whether a text column is worth a word cloud rather than a tally.
 *
 * Two ways in. Prose: four words is the line, so "Bakau", "BJL040" and
 * "2026-11-10" are one token and get the ordinary treatment, while "The road
 * going to Banjul, by demban clinic" and anything longer is prose. Or a
 * list, however short its answers are, because a tally that treats "GRTS,
 * QTV" as one value and "QTV, GRTS" as another tells a reader nothing about
 * either. The count threshold is there because a cloud built from two
 * answers is just those two answers in large type.
 */
export function isProse(values: string[]): boolean {
  const filled = filledOf(values);
  if (filled.length < 3) return false;
  if (isList(values)) return true;
  return median(filled.map((v) => v.split(/\s+/).length)) >= 4;
}

export interface WordCount {
  word: string;
  n: number;
}

/* ------------------------------------------------------------------ */
/* Lists                                                               */
/* ------------------------------------------------------------------ */

/**
 * The separators observers use inside one answer.
 *
 * Commas mostly, but the live campaign export also has slashes ("Main
 * square/field of village"), ampersands and plus signs ("Forayaa + own
 * media"), a stray ">", and "and" written out ("8 police officers and 6
 * private guards"). All of them mean the same thing here: the next item.
 */
const ITEM_SEP = /\s*(?:[,;\/|+&>\u2022\u00b7\n]+|\band\b)\s*/i;

/** Pieces that are a heading or a shrug rather than a thing. */
const JUNK = new Set([
  'television',
  'tv',
  'print',
  'online',
  'digital',
  'other',
  'others',
  'etc',
  'see comments',
  'unknown',
  'none',
  'nil',
  'na',
  'dk',
]);

function splitItems(value: string): string[] {
  return value
    .split(ITEM_SEP)
    .map(itemLabel)
    .filter(
      (item) =>
        item.length >= 2 && /\p{L}/u.test(item) && !JUNK.has(item.toLocaleLowerCase()),
    );
}

/**
 * One item of a list, cleaned up.
 *
 * Observers write counts and headings into these fields: "8 police
 * officers", "more than 10 police officers", "Television & Digital: GRTS",
 * "1 platoon (22 police officers)". The thing being named is what belongs in
 * the cloud, so a leading quantity, a leading heading and a parenthetical
 * aside all come off - which is also what makes "8 police officers" and "33
 * police officers" count as the same item.
 */
function itemLabel(raw: string): string {
  let s = raw;
  s = s.replace(/\([^)]*\)/g, ' ');
  s = s.replace(/^[^:]{0,40}:\s*/, '');
  s = s.replace(/^(?:more than|about|approximately|approx\.?|around|over|some)\s+/i, '');
  s = s.replace(/^\d+\s*/, '');
  s = s.replace(/^(?:the|a|an)\s+/i, '');
  s = s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Whether a column is a list of things rather than prose about them.
 *
 * Both contain commas, so the test is what the commas separate. A list
 * separates names: half the answers carry a separator and the pieces are
 * short. Prose separates clauses, which are not short, and that is what
 * keeps "Speakers set out the programme for the coming term, citing the cost
 * of living and the state of the roads" out of here.
 */
export function isList(values: string[]): boolean {
  const filled = filledOf(values);
  if (filled.length < 3) return false;
  const separated = filled.filter((v) => ITEM_SEP.test(v));
  if (separated.length / filled.length < 0.5) return false;
  const items = filled.flatMap(splitItems);
  if (items.length < filled.length) return false;
  const lengths = items.map((i) => i.split(/\s+/).length);
  const short = lengths.filter((n) => n <= 5).length / lengths.length;
  return median(lengths) <= 3 && short >= 0.85;
}

/** Prefer "Police Intervention Unit" over "POLICE INTERVENTION UNIT". */
function formScore(form: string): number {
  const upper = form === form.toLocaleUpperCase();
  const lower = form === form.toLocaleLowerCase();
  return upper || lower ? 0 : 1;
}

/**
 * The items named across a set of list answers, commonest first.
 *
 * Case is folded, so "POLICE INTERVENTION UNIT" and "Police intervention
 * unit" are one item, and the clearest of the forms actually written is the
 * one shown. Nothing is stemmed or guessed at: "Forayaa" and "Foroyaa" stay
 * apart, because quietly merging two spellings in an observation report
 * means inventing a number nobody can trace back to a form.
 */
export function itemFrequencies(values: string[], limit = 60): WordCount[] {
  const counts = new Map<string, number>();
  const forms = new Map<string, Map<string, number>>();
  for (const value of filledOf(values)) {
    // Once per answer, so one observer writing "police, police officers"
    // does not outweigh a whole report.
    const seen = new Set<string>();
    for (const item of splitItems(value)) {
      const key = item.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      const f = forms.get(key) ?? new Map<string, number>();
      f.set(item, (f.get(item) ?? 0) + 1);
      forms.set(key, f);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, n]) => {
      const best = [...forms.get(key)!.entries()].sort(
        (a, b) =>
          b[1] - a[1] || formScore(b[0]) - formScore(a[0]) || a[0].localeCompare(b[0]),
      )[0]![0];
      const word =
        best === best.toLocaleLowerCase()
          ? best[0]!.toLocaleUpperCase() + best.slice(1)
          : best;
      return { word, n };
    });
}

/* ------------------------------------------------------------------ */
/* Prose                                                               */
/* ------------------------------------------------------------------ */

/** The longest phrase that will be kept whole. */
const MAX_PHRASE = 3;

/**
 * Runs of words that a phrase may be formed from.
 *
 * An answer is cut at punctuation and at function words, and a phrase is
 * only built inside what is left. That is what stops "police, Army" becoming
 * the phrase "police army", and "arrival in Basse" becoming "arrival basse".
 */
function runsOf(value: string): { key: string; form: string }[][] {
  const runs: { key: string; form: string }[][] = [];
  for (const segment of value.split(/[^\p{L}\p{N}'’\- ]+/u)) {
    let run: { key: string; form: string }[] = [];
    for (const raw of segment.split(/\s+/)) {
      const form = raw.replace(/^['’\-]+|['’\-]+$/g, '');
      const key = form.toLocaleLowerCase();
      const usable = form.length >= 3 && /\p{L}/u.test(form) && !STOPWORDS.has(key);
      if (usable) {
        run.push({ key, form });
      } else if (run.length > 0) {
        runs.push(run);
        run = [];
      }
    }
    if (run.length > 0) runs.push(run);
  }
  return runs;
}

/**
 * Count every phrase of up to `MAX_PHRASE` words, by position.
 */
function tally(runs: { key: string; form: string }[][], n: number): Map<string, number> {
  const counts = new Map<string, number>();
  for (const run of runs) {
    for (let i = 0; i + n <= run.length; i += 1) {
      const key = run.slice(i, i + n).map((t) => t.key).join(' ');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * The words and phrases in a set of answers, commonest first.
 *
 * **Phrases are kept whole where they recur.** A word cloud is a count of
 * words, and for most of these questions that is exactly right: "candidate",
 * "roads", "health" are themes however they were phrased. But some answers
 * name things, and splitting a name destroys it. "Which security forces were
 * present?" was answered "Police Intervention Unit" and came out as
 * Intervention(4) and Unit(4), two words that mean nothing apart; "which
 * outlet?" was answered "Kerr Fatou" and came out as Kerr(3) and Fatou(3).
 *
 * So a group of two or three adjacent words is kept as one entry when it
 * occurs at least twice and accounts for most of the uses of its rarest
 * word. "Police Intervention Unit" qualifies and is counted once, leaving
 * the other sixteen mentions of "police" to stand on their own. "NPP
 * candidate" does not: both words are common separately and the pairing is
 * incidental, so they stay apart.
 *
 * Case is folded and the commonest surface form kept, so a cloud shows
 * "Sanneh" rather than "sanneh". Numbers are dropped: a sum of money in
 * one answer is not a theme.
 */
export function wordFrequencies(values: string[], limit = 60): WordCount[] {
  // A list of named things is counted as those things, not as words.
  if (isList(values)) return itemFrequencies(values, limit);

  const runs = values.flatMap(runsOf);
  const unigrams = tally(runs, 1);

  // A phrase has to earn its place against the words it would consume.
  const accepted = new Set<string>();
  for (let n = MAX_PHRASE; n >= 2; n -= 1) {
    for (const [key, count] of tally(runs, n)) {
      if (count < 2) continue;
      const parts = key.split(' ');
      // "roads roads roads" is emphasis, not a phrase.
      if (new Set(parts).size !== parts.length) continue;
      const rarest = Math.min(...parts.map((p) => unigrams.get(p) ?? 0));
      if (count >= 0.6 * rarest) accepted.add(key);
    }
  }

  // Walk the words again, taking the longest accepted phrase at each step so
  // a word inside one is not also counted on its own.
  const counts = new Map<string, number>();
  const forms = new Map<string, Map<string, number>>();
  const record = (key: string, form: string) => {
    counts.set(key, (counts.get(key) ?? 0) + 1);
    const seen = forms.get(key) ?? new Map<string, number>();
    seen.set(form, (seen.get(form) ?? 0) + 1);
    forms.set(key, seen);
  };

  for (const run of runs) {
    let i = 0;
    while (i < run.length) {
      let taken = 1;
      for (let n = Math.min(MAX_PHRASE, run.length - i); n >= 2; n -= 1) {
        const key = run.slice(i, i + n).map((t) => t.key).join(' ');
        if (accepted.has(key)) {
          taken = n;
          break;
        }
      }
      const slice = run.slice(i, i + taken);
      record(slice.map((t) => t.key).join(' '), slice.map((t) => t.form).join(' '));
      i += taken;
    }
  }

  return [...counts.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, n]) => {
      const seen = forms.get(key)!;
      const best = [...seen.entries()].sort((a, b) => b[1] - a[1])[0]![0];
      return { word: best, n };
    });
}
