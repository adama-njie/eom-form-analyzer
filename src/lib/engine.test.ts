import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { analyse, buildDataset, coverage, findings } from './analyse';
import { inferSchema, toTable } from './schema';

/*
 * These run against a real form export, which holds observation data and so
 * is not in the repository. Without it they are skipped rather than failing:
 * a clone should be able to run `npm test` and see the rest of the suite
 * pass. Put the file in place locally to run them.
 */
const HAS_FIXTURE = existsSync(new URL('../../sample/Form B sample.xlsx', import.meta.url));

/**
 * The engine is tested against the real Jordan 2024 Form B export, because
 * the only thing that proves the inference works is a form nobody wrote it
 * for. The Gambian forms will differ in wording and geography; if this
 * still parses cleanly, the grammar assumptions hold.
 */
let cached: ReturnType<typeof read> | null = null;

/**
 * Read once, and only if the fixture is there.
 *
 * `describe.skipIf` skips the tests but still runs the body of the
 * describe, so a read sitting there would throw in a clone that does not
 * have the file. The empty stand-in is never looked at: every test that
 * would touch it is skipped.
 */
function load(): ReturnType<typeof read> {
  cached ??= HAS_FIXTURE
    ? read()
    : ({ table: { headers: [], rows: [] }, questions: [], dataset: null as never });
  return cached;
}

function read() {
  const buf = readFileSync(new URL('../../sample/Form B sample.xlsx', import.meta.url));
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: '' });
  const table = toTable(grid);
  const questions = inferSchema(table);
  return { table, questions, dataset: buildDataset(table, questions) };
}

describe.skipIf(!HAS_FIXTURE)('reading the workbook', () => {
  it('finds the real header row, not the title row', () => {
    const { table } = load();
    expect(table.headers[0]).toBe('Source');
    expect(table.headers).toContain('A.0 Team type');
  });

  it('reads every submitted report', () => {
    const { table } = load();
    expect(table.rows.length).toBe(527);
  });
});

describe.skipIf(!HAS_FIXTURE)('question inference', () => {
  const { questions } = load();
  const byCode = (code: string) => questions.find((q) => q.code === code);

  it('detects a binary question', () => {
    const q = byCode('B.4');
    expect(q?.kind).toBe('binary');
  });

  it('detects a categorical question', () => {
    expect(byCode('B.3')?.kind).toBe('categorical');
  });

  it('groups a multi-answer block into one question', () => {
    const q = byCode('C.3.1');
    expect(q?.kind).toBe('multi');
    // Eight options: the unlabelled first column plus seven parenthesised.
    expect(q?.columns.length).toBe(8);
    expect(q?.options.map((o) => o.label)).toContain('Campaign material');
  });

  it('recovers the first option label of a multi block from its values', () => {
    const q = byCode('C.3.1');
    expect(q?.options[0]?.label).toBe('Bussing activities');
  });

  it('detects an ordinal scale, whole and in order', () => {
    /*
     * The whole scale, not the points this question happened to be
     * answered on: a question answered Mostly and Always is the same
     * scale as the one beside it that was answered Never once, and the
     * page that puts a section on one chart reads them together.
     */
    const q = byCode('G.1');
    expect(q?.kind).toBe('ordinal');
    expect(q?.scale).toEqual(['Never', 'Sometimes', 'Mostly', 'Always']);
  });

  it('detects the 1-5 rating questions', () => {
    const q = byCode('J.5');
    expect(q?.kind).toBe('ordinal');
    expect(q?.scale?.length).toBeGreaterThanOrEqual(4);
  });

  it('detects numeric questions', () => {
    expect(byCode('D.1')?.kind).toBe('numeric');
  });

  it('detects times', () => {
    expect(byCode('A.2')?.kind).toBe('time');
  });

  it('ignores legend columns', () => {
    const legends = questions.filter((q) => /\d\s*=\s*\w/.test(q.label));
    expect(legends).toHaveLength(0);
  });

  it('covers most columns without crashing', () => {
    const used = new Set(questions.flatMap((q) => q.columns));
    expect(used.size).toBeGreaterThan(100);
  });
});

describe.skipIf(!HAS_FIXTURE)('aggregation', () => {
  const { questions, dataset } = load();
  const byCode = (code: string) => questions.find((q) => q.code === code)!;

  it('reproduces the published figure for B.3 polling centre type', () => {
    // The Power BI report gives Urban 320 (61%) and Rural 207 (39%).
    const b = analyse(dataset, byCode('B.3'));
    const urban = b.total.find((c) => c.label === 'Urban')!;
    const rural = b.total.find((c) => c.label === 'Rural')!;
    expect(urban.n).toBe(320);
    expect(rural.n).toBe(207);
    expect(Math.round(urban.pct)).toBe(61);
  });

  it('reproduces B.4 qualified polling centre', () => {
    const b = analyse(dataset, byCode('B.4'));
    expect(b.total.find((c) => c.label === 'Yes')!.n).toBe(96);
    expect(b.total.find((c) => c.label === 'No')!.n).toBe(431);
  });

  it('reproduces E.4 unauthorised persons', () => {
    const b = analyse(dataset, byCode('E.4'));
    expect(b.total.find((c) => c.label === 'Yes')!.n).toBe(24);
    expect(b.total.find((c) => c.label === 'No')!.n).toBe(503);
  });

  it('reproduces the F.9.1 multi-answer counts', () => {
    // Published: Ballot papers 10, Protocols 5, Voting booth(s) 1.
    const b = analyse(dataset, byCode('F.9.1'));
    const get = (l: string) => b.total.find((c) => c.label.includes(l))?.n ?? 0;
    expect(get('Ballot papers')).toBe(10);
    expect(get('Protocols')).toBe(5);
    expect(get('Voting booth')).toBe(1);
  });

  it('charts NA as an answer but keeps it out of the rate', () => {
    const b = analyse(dataset, byCode('H.2'));
    expect(b.notApplicable).toBeGreaterThan(0);

    // On the chart, and last, so it is never the bar a reader reads first.
    const na = b.total.find((c) => c.label === 'NA');
    expect(na?.n).toBe(b.notApplicable);
    expect(b.total[b.total.length - 1]!.label).toBe('NA');

    // But not part of `answered`, which is what every rate divides by.
    const total = b.total.reduce((t, c) => t + c.n, 0);
    expect(b.answered).toBe(total - b.notApplicable);
  });

  it('scores ordinal questions', () => {
    const b = analyse(dataset, byCode('J.1'));
    expect(b.meanScore).toBeGreaterThan(1);
    expect(b.meanScore).toBeLessThanOrEqual(5);
  });
});

describe.skipIf(!HAS_FIXTURE)('coverage and findings', () => {
  const { dataset } = load();

  it('counts every report', () => {
    expect(coverage(dataset).reports).toBe(527);
  });

  it('groups reports by team', () => {
    const c = coverage(dataset);
    const sto = c.byTeam.find((t) => t.team === 'STO');
    expect(sto?.reports).toBe(184);
  });

  it('falls back to the file’s own district names when they are not Gambian', () => {
    // The Jordan export names governorates, so the tool should group by
    // those rather than silently dropping every row.
    expect(dataset.geo).toBe(false);
    expect(dataset.groups).toContain('Balqa');
    expect(dataset.groups.length).toBe(18);
    const c = coverage(dataset);
    expect(c.groupsCovered).toBe(18);
    expect(c.ungroupedRows).toBe(0);
    expect(c.byGroup.reduce((s2, g) => s2 + g.reports, 0)).toBe(527);
  });

  it('reproduces the published per-district report counts', () => {
    const c = coverage(dataset);
    const get = (n: string) => c.byGroup.find((g) => g.label === n)?.reports;
    expect(get('Amman 2')).toBe(60);
    expect(get('Zarqa')).toBe(43);
    expect(get('Aqaba')).toBe(11);
  });

  it('ranks problem questions without being told which they are', () => {
    const f = findings(dataset);
    expect(f.length).toBeGreaterThan(3);
    for (const x of f) expect(x.n).toBeGreaterThan(0);
    // Sorted worst first.
    for (let i = 1; i < f.length; i += 1) {
      expect(f[i - 1]!.pct).toBeGreaterThanOrEqual(f[i]!.pct);
    }
  });
});

describe.skipIf(!HAS_FIXTURE)('time handling', () => {
  const { questions, dataset } = load();
  it('buckets arrival times to the hour rather than the minute', () => {
    const q = questions.find((x) => x.code === 'A.2')!;
    const b = analyse(dataset, q);
    expect(b.total.length).toBeLessThan(20);
    expect(b.total.every((c) => /^\d{2}:00$/.test(c.label))).toBe(true);
  });
  it('orders hours chronologically, not by frequency', () => {
    const q = questions.find((x) => x.code === 'A.2')!;
    const labels = analyse(dataset, q).total.map((c) => c.label);
    expect(labels).toEqual([...labels].sort());
  });
});
