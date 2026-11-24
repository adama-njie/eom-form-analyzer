import { describe, expect, it } from 'vitest';
import { analyse, bandsFor, buildDataset, displayCounts } from './analyse';
import { inferSchema, toTable } from './schema';
import { partyBreakdown, slideBreakdown } from './selection';

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
  it('says so on every band', () => {
    // "20 to 39" on a slide could be a count, a share or a number of
    // people. The question asks for a percentage, so the chart says one.
    const labels = displayCounts(q('B.8'), analyse(form(), q('B.8'))).map((c) => c.label);
    expect(labels.every((l) => l.endsWith('%'))).toBe(true);
    expect(labels).toContain('0 to 19%');
  });

  it('leaves a question that counts things alone', () => {
    const labels = analyse(form(), q('B.11')).total.map((c) => c.label);
    expect(labels.some((l) => l.includes('%'))).toBe(false);
  });

  it('reads low to high, not commonest first', () => {
    const labels = analyse(form(), q('B.8')).total.map((c) => c.label);
    expect(labels).toEqual([...labels].sort((a, b) => parseInt(a, 10) - parseInt(b, 10)));
  });
});

describe('comparing a number across parties', () => {
  it('breaks the bands down by party', () => {
    // It could not before: the breakdown held one entry per distinct
    // number, so there was nothing a stacked chart could line up.
    const b = analyse(form(), q('B.8'));
    expect(partyBreakdown(q('B.8'), b).length).toBeGreaterThan(1);
    const npp = b.byParty['NPP Alliance']!;
    expect(npp.every((c) => c.label.endsWith('%'))).toBe(true);
    expect(npp.reduce((t, c) => t + c.n, 0)).toBe(4);
  });

  it('does the same by area, and offers both on the slide', () => {
    const b = analyse(form(), q('B.9'));
    const { parties, areas } = slideBreakdown(q('B.9'), b);
    expect(parties.length).toBeGreaterThan(1);
    expect(areas.length).toBeGreaterThan(1);
  });

  it('keeps the total for the sentence that reports it', () => {
    const b = analyse(form(), q('B.11'));
    expect(b.numeric?.n).toBe(12);
    expect(b.numeric?.sum).toBe(62);
    expect(b.numeric?.bins).toEqual(b.total);
  });
});
