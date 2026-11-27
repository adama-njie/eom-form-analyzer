import { describe, expect, it } from 'vitest';
import {
  analyse,
  basisLine,
  buildDataset,
  parentCount,
  shareOfParent,
  sharesAcross,
} from './analyse';
import { describe as sentence } from './narrative';
import { inferSchema, toTable } from './schema';

/**
 * An opening form asking a count and then part of that count, with the
 * follow-ups that look the same and are not.
 *
 * E.1.1 is the real one: every woman it counts is one of the staff that
 * E.1 counted. F.2.1 points back at its parent rather than naming it,
 * which is the other way a form writes the relationship. D.1.1 points
 * back at a question that counted nothing, and E.3.1 names a thing its
 * parent did not count.
 */
const HEADER = [
  'A.2 Local Government Area (LGA)',
  'B.5 Polling station type',
  'D.1 Did the PS open for voting at 08:00?',
  'D.1.1 If No to D.1, how many of those minutes were before 08:00',
  'E.1 How many polling staff members are present',
  'E.1.1 How many of the polling staff are female',
  'E.3 How many citizen observers are present',
  'E.3.1 How many of the party agents were accredited',
  'F.2 How many ballot drums are in the station',
  'F.2.1 How many of these were sealed in front of you',
];

const ROWS = [
  ['Banjul', 'Urban', 'Yes', '0', '10', '2', '2', '1', '12', '12'],
  ['Banjul', 'Urban', 'No', '7', '10', '4', '3', '2', '8', '6'],
  ['Kanifing', 'Urban', 'Yes', '0', '2', '2', '1', '1', '10', '10'],
  ['Kanifing', 'Rural', 'Yes', '0', '2', '1', '0', '0', '9', '9'],
  ['Brikama', 'Rural', 'Yes', '0', '8', '1', '2', '1', '11', '11'],
  ['Brikama', 'Rural', 'Yes', '0', '4', '4', '4', '2', '10', '8'],
];

function form(): ReturnType<typeof buildDataset> {
  const table = toTable([HEADER, ...ROWS]);
  return buildDataset(table, inferSchema(table));
}

const q = (code: string) => form().questions.find((x) => x.code === code)!;

describe('a count that is part of another count', () => {
  it('is read as a part where the form names what it is part of', () => {
    expect(parentCount(form(), q('E.1.1'))?.code).toBe('E.1');
  });

  it('is read as a part where the form points back at it instead', () => {
    expect(parentCount(form(), q('F.2.1'))?.code).toBe('F.2');
  });

  it('is not a part where the question it follows counted nothing', () => {
    // D.1 is answered Yes or No. There is no whole for the minutes to
    // be a part of, whatever the wording points back at.
    expect(parentCount(form(), q('D.1.1'))).toBeNull();
  });

  it('is not a part where it names something its parent did not count', () => {
    // Party agents are not a subset of citizen observers, and reading
    // them as one prints a share of a denominator nobody asked for.
    expect(parentCount(form(), q('E.3.1'))).toBeNull();
  });

  it('is not a part where the question stands on its own', () => {
    expect(parentCount(form(), q('E.1'))).toBeNull();
    expect(parentCount(form(), q('E.3'))).toBeNull();
  });
});

describe('the share a part is of its whole', () => {
  it('is the parts summed over the wholes, not the mean of the shares', () => {
    // 14 women among 36 staff is 39%. The mean of the six stations' own
    // shares is 54%, which is a different claim: it weighs a station of
    // two staff the same as a station of ten.
    const p = shareOfParent(form(), q('E.1.1'))!;
    expect(Math.round(p.mean)).toBe(39);
    expect(p.counted).toEqual({ part: 14, whole: 36 });
  });

  it('says what it is a share of, and what it was summed from', () => {
    const p = shareOfParent(form(), q('E.1.1'))!;
    expect(basisLine(p)).toBe('As a share of polling staff members (14 of 36)');
  });

  it('drops a report counting more parts than there are wholes', () => {
    // Two women among one member of staff is not a share of anything.
    // The base under the figure falls by one, which is the record of it.
    const rows = ROWS.map((r) => [...r]);
    rows[0]![4] = '1';
    const table = toTable([HEADER, ...rows]);
    const ds = buildDataset(table, inferSchema(table));
    const p = shareOfParent(ds, ds.questions.find((x) => x.code === 'E.1.1')!)!;
    expect(p.n).toBe(5);
    expect(p.counted).toEqual({ part: 12, whole: 26 });
  });

  it('splits by area and by the kind of station', () => {
    const p = shareOfParent(form(), q('E.1.1'))!;
    expect(p.byArea.map((g) => g.label)).toEqual(['Banjul', 'Kanifing', 'Brikama']);
    // Banjul: 6 women among 20 staff, on two reports.
    expect(p.byArea[0]).toEqual({ label: 'Banjul', mean: 30, n: 2 });
    expect(p.byType?.map((g) => g.label)).toEqual(['Urban', 'Rural']);
    // Urban 8 of 22, rural 6 of 14.
    expect(Math.round(p.byType![0]!.mean)).toBe(36);
    expect(Math.round(p.byType![1]!.mean)).toBe(43);
  });

  it('replaces the composition, which cannot hold it', () => {
    // Two of ten staff and two of two stand in the same bar on a count
    // of answers, and a station staffed by two can never reach a bar
    // above two at all.
    expect(sharesAcross(form(), q('E.1.1'))).toBeNull();
    expect(sharesAcross(form(), q('E.1'))).not.toBeNull();
  });

  it('reaches the breakdown every view is drawn from', () => {
    expect(analyse(form(), q('E.1.1')).percent?.counted).toEqual({ part: 14, whole: 36 });
    expect(analyse(form(), q('E.1')).percent).toBeUndefined();
  });
});

describe('the sentence under a worked-out share', () => {
  it('does not call it an estimate, because no observer estimated it', () => {
    const ds = form();
    const question = ds.questions.find((x) => x.code === 'E.1.1')!;
    expect(sentence(question, analyse(ds, question), true)).toContain(
      '39%, as a share of polling staff members (14 of 36), across 6 reports.',
    );
  });
});
