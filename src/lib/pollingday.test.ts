import { describe, expect, it } from 'vitest';
import {
  analyse,
  answersFor,
  buildDataset,
  ratingOf,
  ratingQuestions,
  shareOfRegister,
  stationTypeQuestion,
  stationsObserved,
  turnoutByHour,
  turnoutReadings,
} from './analyse';
import { inferSchema, toTable } from './schema';

/**
 * A polling-day form, shaped as the mission's own is.
 *
 * The three things that distinguish it from the campaign form are all here:
 * the clock times arrive as Excel serial numbers, the constituency is asked
 * once per Local Government Area in a column each, and the overall
 * assessments are scored against a legend in a column of their own.
 */
const HEADER = [
  'A.0 Team type',
  'A.2 Time of arrival',
  'I.1 Time of departure',
  'B.1 Polling station administrative area',
  'B.2 Polling station constituency - Banjul',
  'B.2 Polling station constituency - Kanifing',
  'B.3 Polling station name',
  'B.4 Polling station number',
  'B.5 Polling station type',
  'D.1 Total number of voters on the voter list',
  'D.2 Total number of voters who had already voted at the time of your arrival',
  'D.3 Total number of people who voted with a duty certificate',
  'I.2 Total number of voters who had voted at the time of your departure',
  '4=Very good  3=Good  2=Bad  1=Very bad',
  'J.1 The overall conduct of the voting in this PS was',
];

/** Polling day, as a workbook writes it: one serial per clock time. */
const DAY = 46_361;
const at = (hours: number, minutes = 0) => String(DAY + (hours * 60 + minutes) / 1440);

const ROWS = [
  ['STO', at(7, 30), at(13), 'Banjul', 'Banjul South', '', 'Crab Island School', 'BA-001', 'Urban', '1000', '100', '2', '400', '', '3'],
  ['STO', at(9), at(16), 'Banjul', 'Banjul Central', '', 'Box Bar Hall', 'BA-002', 'Urban', '800', '160', '0', '480', '', '4'],
  ['LTO', at(7, 50), at(13, 20), 'Kanifing', '', 'Serekunda West', 'Latrikunda Centre', 'KA-003', 'Urban', '500', '50', '1', '200', '', '2'],
  ['LTO', at(9, 15), at(16, 40), 'Kanifing', '', 'Bakau', 'Bakau Lower Basic', 'KA-004', 'Rural', '400', '80', '0', '240', '', '3'],
  // The same station visited twice, which is one station observed.
  ['STO', at(13, 5), at(16, 5), 'Kanifing', '', 'Bakau', 'Bakau Lower Basic', 'KA-004', 'Rural', '400', '200', '0', '260', '', '4'],
];

function form() {
  const table = toTable([HEADER, ...ROWS]);
  return buildDataset(table, inferSchema(table));
}

const q = (code: string) => form().questions.find((x) => x.code === code)!;

describe('a clock time', () => {
  it('is read as a time, not as the number a workbook stores it as', () => {
    // The deck printed the arrival time of a hundred observers as a total
    // of 46,361, because a date cell read without `cellDates` is a serial.
    expect(q('A.2').kind).toBe('time');
    expect(q('I.1').kind).toBe('time');
  });

  it('answers with the hour it belongs to', () => {
    const ds = form();
    expect(answersFor(q('A.2'), ds.table.rows[0]!)).toEqual(['07:00']);
    expect(answersFor(q('A.2'), ds.table.rows[1]!)).toEqual(['09:00']);
  });

  it('is charted by the hour, in order, with no total under it', () => {
    const b = analyse(form(), q('A.2'));
    expect(b.total.map((c) => c.label)).toEqual(['07:00', '09:00', '13:00']);
    expect(b.numeric).toBeUndefined();
  });
});

describe('a question the form splits by area', () => {
  it('is one question, over every column it was printed in', () => {
    const ds = form();
    const constituency = ds.questions.find((x) => x.code === 'B.2')!;
    expect(constituency.columns).toHaveLength(2);
    expect(ds.constituencyColumns).toEqual(constituency.columns);
  });

  it('resolves whichever column the report filled', () => {
    // Read column by column, the best of them held two reports of five and
    // the tool reported a fifth of the constituencies reached.
    const ds = form();
    expect(ds.rowConstituency).toEqual([
      'Banjul South',
      'Banjul Central',
      'Serekunda West',
      'Bakau',
      'Bakau',
    ]);
    expect(ds.constituencies).toHaveLength(4);
  });
});

describe('a scored question', () => {
  it('is charted in the words its own legend gives it', () => {
    const b = analyse(form(), q('J.1'));
    expect(b.total.map((c) => c.label).sort()).toEqual(['Bad', 'Good', 'Very good']);
  });

  it('keeps every point the form offers, answered or not', () => {
    expect(q('J.1').scale).toEqual(['Very bad', 'Bad', 'Good', 'Very good']);
  });

  it('scores the words in the legend order, so the mean is the right way up', () => {
    const b = analyse(form(), q('J.1'));
    // 3, 4, 2, 3, 4.
    expect(b.meanScore).toBeCloseTo(3.2, 5);
  });

  it('is found by its scale rather than by its section letter', () => {
    const ds = form();
    expect(ratingQuestions(ds).map((x) => x.code)).toEqual(['J.1']);
    const r = ratingOf(ds, q('J.1'))!;
    expect(r.points).toBe(4);
    // Good or Very good on three of five reports.
    expect(r.goodLabels).toEqual(['Good', 'Very good']);
    expect(r.good).toBe(4);
    expect(r.goodPct).toBeCloseTo(80, 5);
  });
});

describe('turnout', () => {
  it('pairs each count of votes cast with the time it was read', () => {
    const readings = turnoutReadings(form());
    expect(readings.map((r) => r.moment)).toEqual(['arrival', 'departure']);
    // A total for the day with no time beside it is not a reading.
    expect(readings.some((r) => r.count.code === 'D.3')).toBe(false);
  });

  it('is the mean share of each station list, by the hour the observer left', () => {
    /*
     * The departure reading only, one point per station. The arrival
     * figure is what the staff said had happened before the mission was
     * there, and counting both would put every station on the curve
     * twice - once on the way in and once on the way out.
     */
    const t = turnoutByHour(form())!;
    expect(t.readings).toBe(5);
    expect(t.points.map((p) => p.label)).toEqual(['13:00', '16:00']);
    // 400 of 1,000 and 200 of 500: one station one vote, as everywhere else.
    expect(t.points[0]!.mean).toBeCloseTo(40, 5);
    expect(t.points[0]!.n).toBe(2);
    // 480 of 800, 240 of 400 and 260 of 400.
    expect(t.points[1]!.mean).toBeCloseTo((60 + 60 + 65) / 3, 5);
    expect(t.points[1]!.n).toBe(3);
    expect(t.points[0]!.mean).toBeLessThan(t.points[1]!.mean);
  });

  it('turns a count of votes cast into the share of the list that it is', () => {
    // Counted in bands, "160 voters had voted" puts a station of 2,000
    // beside a station of 300 and says nothing about either.
    const ds = form();
    const p = shareOfRegister(ds, q('D.2'))!;
    expect(p.n).toBe(5);
    expect(p.mean).toBeCloseTo((10 + 20 + 10 + 20 + 50) / 5, 5);
    expect(p.basis).toBe('As a share of voters on the voter list');
    expect(analyse(ds, q('D.2')).percent?.mean).toBeCloseTo(p.mean, 5);
  });

  it('leaves the list itself as a count, which is what it is', () => {
    const b = analyse(form(), q('D.1'));
    expect(b.percent).toBeUndefined();
    expect(b.numeric?.sum).toBe(3100);
  });
});

describe('the figures a coverage page carries', () => {
  it('counts stations, not reports', () => {
    expect(stationsObserved(form())).toBe(4);
  });

  it('finds what kind of place was observed', () => {
    expect(stationTypeQuestion(form())?.code).toBe('B.5');
  });
});
