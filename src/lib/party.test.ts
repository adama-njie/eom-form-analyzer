import { describe, expect, it } from 'vitest';
import { analyse, buildDataset, coverage } from './analyse';
import { inferSchema, toTable } from './schema';
import { areaBreakdown, partyBreakdown, slideBreakdown } from './selection';

/** A campaign form: the organiser column plus two questions about the event. */
const HEADER = [
  'A.1 LTO team',
  'A.2 Local Government Area (LGA)',
  'B.4 Which candidate/party/coalition organised or was supported in this event',
  'B.4.1 If other candidate, please specify',
  'B.6 Relative cost of the event',
  'C.7 Any indication that people are pressured or incentivised to attend?',
];

const ROWS: string[][] = [
  ['LTO01', 'Banjul', 'NPP Alliance', '', 'High', 'Yes'],
  ['LTO01', 'Banjul', 'NPP Alliance', '', 'Average', 'No'],
  ['LTO02', 'Kanifing', 'NPP Alliance', '', 'High', 'No'],
  ['LTO02', 'Kanifing', 'UDP Alliance', '', 'Low', 'No'],
  ['LTO03', 'Brikama', 'UDP Alliance', '', 'Low', 'No'],
  ['LTO03', 'Brikama', 'UNITE Alliance', 'Independent', 'Low', 'Yes'],
];

function campaign() {
  const table = toTable([HEADER, ...ROWS]);
  return buildDataset(table, inferSchema(table));
}

describe('the party column', () => {
  it('is found from the organiser question', () => {
    const ds = campaign();
    expect(ds.partyColumn).toBe(2);
    expect(ds.parties).toEqual(['NPP Alliance', 'UDP Alliance', 'UNITE Alliance']);
  });

  it('is not the "if other candidate" follow-up, which is mostly blank', () => {
    const ds = campaign();
    expect(ds.partyColumn).not.toBe(3);
  });

  it('is absent from a form that does not record one', () => {
    const table = toTable([
      ['A.2 Local Government Area (LGA)', 'C.1 Was the station open on time?'],
      ['Banjul', 'Yes'],
      ['Kanifing', 'No'],
    ]);
    const ds = buildDataset(table, inferSchema(table));
    expect(ds.partyColumn).toBeNull();
    expect(ds.parties).toEqual([]);
  });
});

describe('breaking answers down by party', () => {
  it('counts each answer within each party', () => {
    const ds = campaign();
    const q = ds.questions.find((x) => x.code === 'B.6')!;
    const b = analyse(ds, q);
    const npp = Object.fromEntries(b.byParty['NPP Alliance']!.map((c) => [c.label, c.n]));
    expect(npp).toEqual({ High: 2, Average: 1 });
    expect(Object.keys(b.byParty)).toHaveLength(3);
  });

  it('answers the request: pressured or incentivised, by party', () => {
    const ds = campaign();
    const q = ds.questions.find((x) => x.code === 'C.7')!;
    const b = analyse(ds, q);
    expect(partyBreakdown(q, b)).toHaveLength(3);
    const unite = Object.fromEntries(b.byParty['UNITE Alliance']!.map((c) => [c.label, c.n]));
    expect(unite.Yes).toBe(1);
  });

  it('gives the slide both breakdowns when the form supports both', () => {
    const ds = campaign();
    const q = ds.questions.find((x) => x.code === 'C.7')!;
    const b = analyse(ds, q);
    const { parties, areas } = slideBreakdown(q, b);
    expect(parties).toHaveLength(3);
    expect(areas.length).toBeGreaterThan(1);
    expect(areas).toEqual(areaBreakdown(q, b));
  });

  it('falls back to area on a form with no party column', () => {
    const table = toTable([
      ['A.2 Local Government Area (LGA)', 'C.1 Was the station open on time?'],
      ['Banjul', 'Yes'],
      ['Kanifing', 'No'],
      ['Brikama', 'Yes'],
    ]);
    const ds = buildDataset(table, inferSchema(table));
    const q = ds.questions.find((x) => x.code === 'C.1')!;
    const b = analyse(ds, q);
    const { parties, areas } = slideBreakdown(q, b);
    expect(parties).toEqual([]);
    expect(areas.length).toBeGreaterThan(1);
    expect(b.byParty).toEqual({});
  });
});

describe('a question that is the grouping', () => {
  it('is not broken down by itself', () => {
    // Five bars, each one a party answering with its own name, crushed into
    // a single row of the slide. There is nothing in it to read.
    const ds = campaign();
    const q = ds.questions.find((x) => x.code === 'B.4')!;
    const b = analyse(ds, q);
    expect(b.byParty).toEqual({});
    expect(slideBreakdown(q, b).parties).toEqual([]);
  });

  it('keeps the comparison that is a different question', () => {
    const ds = campaign();
    const q = ds.questions.find((x) => x.code === 'B.4')!;
    const b = analyse(ds, q);
    // Which parties campaigned where is worth a chart.
    expect(Object.keys(b.byArea).length).toBeGreaterThan(1);
  });

  it('does the same for the area question', () => {
    const ds = campaign();
    const q = ds.questions.find((x) => x.code === 'A.2')!;
    const b = analyse(ds, q);
    expect(b.byArea).toEqual({});
    expect(areaBreakdown(q, b)).toEqual([]);
  });

  it('answers the area question in the names used on every other chart', () => {
    // The mission names an LGA by its administrative capital, so a file
    // that says "West Coast" is charted as Brikama, the same as the maps
    // and the coverage table.
    const table = toTable([
      HEADER,
      ['LTO01', 'West Coast', 'NPP Alliance', '', 'Low', 'No'],
      ['LTO02', 'Brikama', 'UDP Alliance', '', 'Low', 'No'],
      ['LTO03', 'Kerewan', 'UDP Alliance', '', 'Low', 'Yes'],
    ]);
    const ds = buildDataset(table, inferSchema(table));
    const q = ds.questions.find((x) => x.code === 'A.2')!;
    const counts = analyse(ds, q).total;
    expect(counts.map((c) => c.label)).not.toContain('West Coast');
    expect(counts.find((c) => c.label === 'Brikama')!.n).toBe(2);
  });
});

describe('breaking a question down by both', () => {
  it('offers party and area together on an ordinary question', () => {
    const ds = campaign();
    const q = ds.questions.find((x) => x.code === 'B.6')!;
    const { parties, areas } = slideBreakdown(q, analyse(ds, q));
    expect(parties.length).toBeGreaterThan(1);
    expect(areas.length).toBeGreaterThan(1);
  });
});

describe('who filed the reports', () => {
  it('finds the team column on a campaign form', () => {
    // "A.1 LTO team" used to match nothing - the pattern only knew Form B's
    // "A.0 Team type" - so every report fell into one bucket called
    // "Unspecified" and the coverage slide reported a single team.
    const ds = campaign();
    expect(ds.teamColumn).toBe(0);
    const teams = coverage(ds).byTeam;
    expect(teams.map((t) => t.team).sort()).toEqual(['LTO01', 'LTO02', 'LTO03']);
    expect(teams.every((t) => t.reports === 2)).toBe(true);
  });

  it('shows no teams at all rather than one called Unspecified', () => {
    const table = toTable([
      ['A.2 Local Government Area (LGA)', 'C.1 Was the station open on time?'],
      ['Banjul', 'Yes'],
      ['Kanifing', 'No'],
    ]);
    const ds = buildDataset(table, inferSchema(table));
    expect(coverage(ds).byTeam).toEqual([]);
  });
});
