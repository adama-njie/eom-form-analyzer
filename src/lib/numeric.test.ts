import { describe, expect, it } from 'vitest';
import { analyse, bandsFor, buildDataset, meanLabel, percentageOf } from './analyse';
import { inferSchema, toTable } from './schema';

/**
 * A campaign form with the two percentage questions the mission's other
 * teams asked to see by party.
 */
const HEADER = [
  'A.2 Local Government Area (LGA)',
  'B.4 Which candidate/party/coalition organised or was supported in this event',
  'B.8 Estimated % of female participants',
  'B.9 Estimated % of youth participants (under 35)',
  'B.11 Total number of speakers',
];

const ROWS = [
  ['Banjul', 'NPP Alliance', '10', '70', '4'],
  ['Banjul', 'NPP Alliance', '25', '65', '6'],
  ['Kanifing', 'NPP Alliance', '45', '80', '3'],
  ['Kanifing', 'NPP Alliance', '18', '72', '4'],
  ['Kanifing', 'UDP Alliance', '55', '35', '7'],
  ['Kanifing', 'UDP Alliance', '41', '48', '5'],
  ['Brikama', 'UDP Alliance', '62', '40', '5'],
  ['Brikama', 'UDP Alliance', '88', '25', '9'],
  ['Brikama', 'UDP Alliance', '33', '58', '6'],
  ['Basse', 'UNITE Alliance', '95', '15', '2'],
  ['Basse', 'UNITE Alliance', '30', '55', '8'],
  ['Basse', 'UNITE Alliance', '77', '22', '3'],
];

function form() {
  const table = toTable([HEADER, ...ROWS]);
  return buildDataset(table, inferSchema(table));
}

const q = (code: string) => form().questions.find((x) => x.code === code)!;

describe('bands', () => {
  it('gives every distinct value its own band when there are few', () => {
    const b = bandsFor([0, 1, 2, 3]);
    expect(b.labels).toEqual(['0', '1', '2', '3']);
    expect(b.of(2)).toBe('2');
  });

  it('picks a width a person would have picked', () => {
    const b = bandsFor([0, 7, 13, 22, 36, 48, 55, 61, 79, 93]);
    expect(b.labels[0]).toBe('0 to 19');
    expect(b.of(36)).toBe('20 to 39');
  });

  it('carries the unit into the label', () => {
    const b = bandsFor([0, 7, 13, 22, 36, 48, 55, 61, 79, 93], 6, '%');
    expect(b.labels[0]).toBe('0 to 19%');
    expect(b.of(95)).toBe('80 to 99%');
  });
});

describe('a percentage question', () => {
  it('is averaged, not banded', () => {
    // Bands answered a question nobody asked of it - how many events were
    // 40 to 59% female - and could not be compared across parties without
    // reading twenty numbers off a stacked bar.
    const p = analyse(form(), q('B.8')).percent!;
    expect(p.n).toBe(12);
    expect(p.mean).toBeCloseTo(48.25, 2);
  });

  it('leaves a question that counts things to its bands', () => {
    const b = analyse(form(), q('B.11'));
    expect(b.percent).toBeUndefined();
    expect(b.numeric?.bins.length).toBeGreaterThan(1);
    expect(b.total.some((c) => c.label.includes('%'))).toBe(false);
  });

  it('drops an entry that is not a percentage', () => {
    const header = ['A.2 Local Government Area (LGA)', 'B.8 Estimated % of female participants'];
    const rows = [
      ['Banjul', '40'],
      ['Banjul', '60'],
      ['Kanifing', '150'],
      ['Kanifing', 'about half'],
    ];
    const table = toTable([header, ...rows]);
    const ds = buildDataset(table, inferSchema(table));
    const p = percentageOf(ds, ds.questions.find((x) => x.code === 'B.8')!)!;
    expect(p.n).toBe(2);
    expect(p.mean).toBe(50);
  });
});

describe('writing an average out', () => {
  it('rounds to a whole number, as the estimates behind it are', () => {
    expect(meanLabel(48.25)).toBe('48');
    expect(meanLabel(49.6)).toBe('50');
    expect(meanLabel(50)).toBe('50');
  });

  it('keeps a decimal place where rounding would wipe the figure out', () => {
    // B.10, estimated % of disabled participants, runs at well under 1%.
    // "0%" says nobody was there when several reports said somebody was.
    expect(meanLabel(0.54)).toBe('0.5');
    expect(meanLabel(2.25)).toBe('2.3');
    expect(meanLabel(3)).toBe('3');
  });
});

describe('comparing a percentage across parties', () => {
  it('gives each party its own average', () => {
    const p = analyse(form(), q('B.8')).percent!;
    expect(p.byParty.map((g) => g.label)).toEqual([
      'UDP Alliance',
      'NPP Alliance',
      'UNITE Alliance',
    ]);
    const npp = p.byParty.find((g) => g.label === 'NPP Alliance')!;
    expect(npp.mean).toBeCloseTo(24.5, 2);
    expect(npp.n).toBe(4);
  });

  it('carries the reports behind each average', () => {
    // An average of two estimates and an average of twelve look identical
    // on a bar, so every bar says which it is.
    const p = analyse(form(), q('B.9')).percent!;
    expect(p.byParty.every((g) => g.n > 0)).toBe(true);
    expect(p.byParty.reduce((n, g) => n + g.n, 0)).toBe(12);
  });

  it('does the same by area, in geographic order', () => {
    const p = analyse(form(), q('B.8')).percent!;
    expect(p.byArea.map((g) => g.label)).toEqual(['Banjul', 'Kanifing', 'Brikama', 'Basse']);
    expect(p.byArea[0]!.mean).toBeCloseTo(17.5, 2);
  });
});

describe('a column of bare digits', () => {
  /**
   * The forms store a rating as its digit and spell the scale out in a
   * legend column of their own, so "1 2 3 4 5" is one of the scales the
   * tool knows. A count of people answers in the same digits.
   */
  const staff = (legend: boolean) => {
    const header = legend
      ? ['4=Very good 3=Good 2=Bad 1=Very bad', 'E.1 How many polling staff members are present',
         'J.1 The overall conduct of the voting in this PS was']
      : ['E.1 How many polling staff members are present',
         'J.1 The overall conduct of the voting in this PS was'];
    const rows = [['5', '4'], ['3', '3'], ['4', '4'], ['5', '2'], ['1', '3']].map((r) =>
      legend ? ['', ...r] : r,
    );
    const table = toTable([header, ...rows]);
    return buildDataset(table, inferSchema(table));
  };

  it('is a number where no legend says the digits are a scale', () => {
    // "How many polling staff members are present" was drawn in the
    // rating palette, with 1 shaded as the worst answer on the slide.
    const ds = staff(false);
    expect(ds.questions.find((x) => x.code === 'E.1')?.kind).toBe('numeric');
  });

  it('is a rating where the legend names every digit in it', () => {
    const ds = staff(true);
    const rating = ds.questions.find((x) => x.code === 'J.1')!;
    expect(rating.kind).toBe('ordinal');
    expect(rating.scale).toEqual(['Very bad', 'Bad', 'Good', 'Very good']);
  });

  it('leaves a count a count even on a form that has a legend', () => {
    // The legend runs 1 to 4 and the staff counts reach 5, so nothing in
    // the file names the answer "5".
    expect(staff(true).questions.find((x) => x.code === 'E.1')?.kind).toBe('numeric');
  });
});
