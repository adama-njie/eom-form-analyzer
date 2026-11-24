/**
 * Turn a computed breakdown into a sentence.
 *
 * Writing the prose around each chart is the slowest part of producing a
 * report, and most of it is mechanical: what was asked, how many answered,
 * what the split was, and where it was worse. This writes that much, so the
 * analyst is left with the judgement rather than the typing.
 *
 * It deliberately never says what a figure means. It reports the shape of
 * the answers and stops, because an automatically generated interpretation
 * of an election observation finding would be worse than none.
 */

import type { Breakdown, Dataset, Finding } from './analyse';
import { analyse, coverage, findings, meanLabel, realTotal } from './analyse';
import type { Question } from './schema';

function pct(v: number): string {
  return `${v.toFixed(v < 10 ? 1 : 0)}%`;
}

function list(items: string[], conjunction = 'and'): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`;
}

/** One or two sentences describing a single question's result. */
export function describe(q: Question, b: Breakdown, geo: boolean): string {
  if (b.answered === 0) return 'No reports answered this question.';
  const area = geo ? 'area' : 'district';

  if (b.percent) {
    // A percentage is already a rate, so the thing to report is its
    // average and where it is highest - not which band most events fell in.
    const p = b.percent;
    const sentences = [
      `Observers estimated ${meanLabel(p.mean)}% on average, across ${p.n} ${
        p.n === 1 ? 'report' : 'reports'
      }.`,
    ];
    const top = (rows: typeof p.byParty) =>
      rows.reduce((a, c) => (c.mean > a.mean ? c : a), rows[0]!);
    if (p.byParty.length > 1) {
      const t = top(p.byParty);
      sentences.push(
        `It was highest for ${t.label}, at ${meanLabel(t.mean)}% across ${t.n} ${
          t.n === 1 ? 'report' : 'reports'
        }.`,
      );
    }
    if (p.byArea.length > 1) {
      const t = top(p.byArea);
      sentences.push(
        `By ${area}, the highest was ${t.label} at ${meanLabel(t.mean)}%.`,
      );
    }
    return sentences.join(' ');
  }

  if (q.kind === 'numeric' && b.numeric) {
    // Deliberately not the mean. Where the answers cluster, and how heavy the
    // top band is, is what a reader can act on; an average of a count with a
    // long tail describes a station that does not exist.
    const bins = b.numeric.bins;
    const top = bins.reduce((a, c) => (c.n > a.n ? c : a), bins[0]!);
    const highest = [...bins].reverse().find((c) => c.n > 0);
    const sentences = [
      `Reported by ${b.numeric.n} ${b.numeric.n === 1 ? 'team' : 'teams'}, totalling ${b.numeric.sum.toLocaleString('en-GB')}.`,
      `Most gave ${top.label} (${top.n}, ${pct(top.pct)}).`,
    ];
    if (highest && highest.label !== top.label) {
      sentences.push(
        `The highest was ${highest.label}, from ${highest.n} ${highest.n === 1 ? 'team' : 'teams'}.`,
      );
    }
    return sentences.join(' ');
  }

  if (q.kind === 'time') {
    const busiest = b.total.reduce((a, c) => (c.n > a.n ? c : a), b.total[0]!);
    return `${b.answered} reports. The commonest hour was ${busiest.label}, with ${busiest.n} reports (${pct(busiest.pct)}).`;
  }

  if (q.kind === 'multi') {
    const picked = b.total.filter((c) => c.n > 0);
    if (picked.length === 0) return 'No option was selected on any report.';
    // By count, not by the order the form lists the options. "Most often A,
    // B and C" with A, B and C in form order is simply a false statement,
    // and it was one: an option picked 4 times led one picked 5 times.
    const top = [...picked]
      .sort((a, c) => c.n - a.n)
      .slice(0, 3)
      .map((c) => `${c.label} (${c.n})`);
    return `Selected on ${b.answered} reports. Most often ${list(top)}.`;
  }

  const top = b.total[0];
  if (!top) return `${b.answered} reports answered.`;

  const sentences: string[] = [];

  if (q.kind === 'binary') {
    const yes = b.total.find((c) => c.label === 'Yes');
    // Of the reports that could answer, not of all of them: NA is counted
    // in the chart but it is not part of this rate.
    const n = yes ? yes.n : 0;
    const rate = b.answered > 0 ? (n / b.answered) * 100 : 0;
    sentences.push(
      `${pct(rate)} of ${b.answered} reports answered Yes (${n}${n === 1 ? ' report' : ' reports'}).`,
    );
  } else if (q.kind === 'ordinal' && b.meanScore !== undefined) {
    sentences.push(
      `${b.answered} ratings, averaging ${b.meanScore.toFixed(2)} on a ${q.scale?.length}-point scale. The commonest answer was "${top.label}" (${pct(top.pct)}).`,
    );
  } else {
    sentences.push(
      `${b.answered} reports. "${top.label}" was the commonest answer at ${pct(top.pct)}${b.total[1] ? `, ahead of "${b.total[1].label}" at ${pct(b.total[1].pct)}` : ''}.`,
    );
  }

  if (b.notApplicable > 0) {
    sentences.push(
      `${b.notApplicable} answered NA or DK, shown separately and left out of the rate.`,
    );
  }

  // Where does this question vary most by area?
  const groups = Object.entries(b.byArea);
  if (groups.length > 2 && (q.kind === 'binary' || q.kind === 'ordinal')) {
    const target = q.kind === 'binary' ? 'Yes' : top.label;
    const rates = groups
      .map(([g, counts]) => {
        const total = realTotal(counts);
        const hit = counts.find((c) => c.label === target)?.n ?? 0;
        return { g, total, pct: total > 0 ? (hit / total) * 100 : 0 };
      })
      .filter((r) => r.total >= 5)
      .sort((a, c) => c.pct - a.pct);
    if (rates.length >= 2 && rates[0]!.pct - rates[rates.length - 1]!.pct > 15) {
      sentences.push(
        `Highest in ${rates[0]!.g} at ${pct(rates[0]!.pct)}, lowest in ${rates[rates.length - 1]!.g} at ${pct(rates[rates.length - 1]!.pct)}, by ${area}.`,
      );
    }
  }

  return sentences.join(' ');
}

/** A paragraph describing one ranked finding. */
/**
 * A finding's figures, without restating the question.
 *
 * Split out because a slide whose title is the question does not want the
 * question again underneath it, which is what it used to get.
 */
export function describeFindingBody(f: Finding): string {
  const base = `${f.n} reports (${pct(f.pct)}) answered ${f.label}.`;
  if (f.hotspots.length === 0) return `${base} No area was materially above that rate.`;
  const spots = f.hotspots
    .slice(0, 3)
    .map((h) => `${h.group} at ${pct(h.pct)} (${h.n} of ${h.total})`);
  return `${base} Above that rate in ${list(spots)}.`;
}

/** The same, named, for lists where the question is not already a heading. */
export function describeFinding(f: Finding): string {
  return `${f.question.code} ${f.question.label} — ${describeFindingBody(f)}`;
}

/** The opening summary of the report. */
export function executiveSummary(dataset: Dataset, filter?: boolean[]): string[] {
  const cov = coverage(dataset, filter);
  const probs = findings(dataset, filter, 5);
  const paras: string[] = [];

  const where = dataset.geo
    ? `${cov.groupsCovered} of the ${cov.groupsTotal} administrative areas`
    : `${cov.groupsCovered} districts`;
  const reach =
    cov.registerShare !== null
      ? `, covering areas that hold ${pct(cov.registerShare)} of the 2026 register`
      : '';
  paras.push(
    `This analysis covers ${cov.reports} observer reports from ${where}${reach}.${
      cov.byTeam.length > 0
        ? ` Reports came from ${cov.byTeam.length} ${cov.byTeam.length === 1 ? 'team' : 'teams'}, led by ${list(cov.byTeam.slice(0, 3).map((t) => `${t.team} (${t.reports})`))}.`
        : ''
    }`,
  );

  if (probs.length > 0) {
    const lead = probs[0]!;
    // Name the answer, not just the question: several of these are inverted,
    // where "No" is the answer that indicates a problem, and the sentence is
    // misleading without it. Question text keeps its own case, because
    // lowercasing it mangles PS, IEC and the rest.
    paras.push(
      `The most frequently recorded issue was ${lead.question.code} "${lead.question.label}", answered ${lead.label} on ${pct(lead.pct)} of reports (${lead.n}).` +
        (probs.length > 1
          ? ` Next are ${list(probs.slice(1, 3).map((p) => `${p.question.code} at ${pct(p.pct)}`))}.`
          : ''),
    );
  } else {
    paras.push('No question indicating an irregularity recorded a positive answer.');
  }

  const ratings = dataset.questions.filter((q) => q.kind === 'ordinal' && /^J\./.test(q.code));
  const scored = ratings
    .map((q) => ({ q, b: analyse(dataset, q, filter) }))
    .filter((r) => r.b.meanScore !== undefined)
    .sort((a, b) => a.b.meanScore! - b.b.meanScore!);
  if (scored.length > 0) {
    const worst = scored[0]!;
    const best = scored[scored.length - 1]!;
    paras.push(
      `Across the overall assessment questions, the lowest mean was ${worst.q.code} "${worst.q.label}" at ${worst.b.meanScore!.toFixed(2)}, and the highest ${best.q.code} "${best.q.label}" at ${best.b.meanScore!.toFixed(2)}.`,
    );
  }

  paras.push(
    'These are observer reports, not results, and observers are deployed to a plan rather than drawn at random. The figures describe what was observed and cannot be projected onto the election as a whole.',
  );
  return paras;
}
