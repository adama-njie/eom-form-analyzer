import { describe, expect, it } from 'vitest';
import { buildDataset, constituencyCoverage, coverage, divisionOf, reportsByPlace } from './analyse';
import { areaShapes, areaUnits } from './gambia';
import { inferSchema, toTable } from './schema';

/**
 * The polling-day forms ask for the region, not the Local Government Area.
 *
 * There are seven: the IEC reports Kuntaur and Janjanbureh together as
 * Central River and names it after its administrative capital, which is
 * Janjanbureh. So a complete deployment was counted against eight, read as
 * "7 / 8", and the map hatched Kuntaur - which on an observation map means
 * "nobody observed here", and somebody had.
 */
const REGION_HEADER = [
  'B.1 Polling station administrative area',
  'B.2 Polling station constituency - Banjul',
  'B.2 Polling station constituency - Kanifing',
  'B.2 Polling station constituency - Brikama',
  'B.2 Polling station constituency - Kerewan',
  'B.2 Polling station constituency - Mansa Konko',
  'B.2 Polling station constituency - Janjanbureh',
  'B.2 Polling station constituency - Basse',
  'C.1 Is the PS accessible for voters with reduced mobility?',
];

const REGION_ROWS = [
  ['Banjul', 'Banjul South', '', '', '', '', '', '', 'Yes'],
  ['Kanifing', '', 'Bakau', '', '', '', '', '', 'No'],
  ['Brikama', '', '', 'Kombo South', '', '', '', '', 'Yes'],
  ['Kerewan', '', '', '', 'Jokadou', '', '', '', 'Yes'],
  ['Mansa Konko', '', '', '', '', 'Jarra West', '', '', 'No'],
  // Lower Saloum is a Kuntaur constituency, filed under Janjanbureh.
  ['Janjanbureh', '', '', '', '', '', 'Lower Saloum', '', 'Yes'],
  ['Janjanbureh', '', '', '', '', '', 'Niamina West', '', 'Yes'],
  ['Basse', '', '', '', '', '', '', 'Jimara', 'No'],
];

function regionForm(override?: 'lga' | 'region') {
  const table = toTable([REGION_HEADER, ...REGION_ROWS]);
  return buildDataset(table, inferSchema(table), override);
}

/** The campaign form, which asks for the Local Government Area. */
const LGA_HEADER = [
  'A.2 Local Government Area (LGA)',
  'A.3 Constituency',
  'B.5 Was a candidate present',
];

const LGA_ROWS = [
  ['Banjul', 'Banjul South', 'Yes'],
  ['Kanifing', 'Bakau', 'No'],
  ['Kuntaur', 'Niani', 'Yes'],
  ['Janjanbureh', 'Niamina West', 'Yes'],
];

function lgaForm() {
  const table = toTable([LGA_HEADER, ...LGA_ROWS]);
  return buildDataset(table, inferSchema(table));
}

describe('which division a file reports against', () => {
  it('reads seven regions from the list of areas the form prints', () => {
    // The constituency question is asked once per area, so its column
    // headers are the form's own list: seven of them, Kuntaur absent.
    expect(regionForm().division).toBe('region');
  });

  it('reads eight areas from a report filed in Kuntaur', () => {
    expect(lgaForm().division).toBe('lga');
  });

  it('reads seven regions from a Kuntaur constituency under Janjanbureh', () => {
    // The other evidence, for a form that does not split its columns by
    // area: only a region called Janjanbureh can hold Lower Saloum.
    const rowLga = ['JAN' as const];
    expect(divisionOf([], rowLga, ['Lower Saloum'])).toBe('region');
    expect(divisionOf([], rowLga, ['Niamina West'])).toBe('lga');
  });

  it('reads eight where the file says nothing either way', () => {
    /*
     * The conservative answer. Reading an eight-area file as seven would
     * report a deployment that never reached Kuntaur as complete
     * coverage, and a coverage figure that overstates itself is the one
     * mistake this tool must not make.
     */
    const table = toTable([
      ['A.2 Local Government Area (LGA)', 'B.5 Was a candidate present'],
      ['Banjul', 'Yes'],
      ['Basse', 'No'],
    ]);
    expect(buildDataset(table, inferSchema(table)).division).toBe('lga');
  });

  it('lets the analyst say otherwise', () => {
    expect(regionForm('lga').division).toBe('lga');
    expect(regionForm('lga').areas).toHaveLength(8);
  });
});

describe('a file that reports seven regions', () => {
  it('counts coverage against seven, not eight', () => {
    const cov = coverage(regionForm());
    expect(cov.groupsTotal).toBe(7);
    expect(cov.groupsCovered).toBe(7);
    expect(cov.byGroup.map((g) => g.label)).not.toContain('Kuntaur');
  });

  it('gives Central River both its electorates', () => {
    const unit = areaUnits('region').find((a) => a.name === 'Janjanbureh')!;
    expect(unit.lgas).toEqual(['KUN', 'JAN']);
    expect(unit.registered).toBe(140_899);
    expect(unit.constituencies).toHaveLength(11);
    // And the national total is unchanged by the folding.
    const total = areaUnits('region').reduce((n, a) => n + a.registered, 0);
    expect(total).toBe(areaUnits('lga').reduce((n, a) => n + a.registered, 0));
  });

  it('files a Kuntaur constituency under the region, not nowhere', () => {
    const ds = regionForm();
    expect(ds.rowArea[5]).toBe('JAN');
    expect(ds.rowConstituency[5]).toBe('Lower Saloum');
    const { groups } = constituencyCoverage(ds);
    const crr = groups.find((g) => g.area === 'Janjanbureh')!;
    expect(crr.reports).toBe(2);
    expect(crr.constituencies.map((c) => c.name)).toEqual(['Lower Saloum', 'Niamina West']);
    expect(crr.totalConstituencies).toBe(11);
  });

  it('maps seven places, with no hatched Kuntaur among them', () => {
    const places = reportsByPlace(regionForm());
    expect(places).toHaveLength(7);
    expect(places.map((p) => p.place)).not.toContain('Kuntaur');
    expect(places.every((p) => p.n > 0)).toBe(true);
  });

  it('draws Central River as one shape, and says so on it', () => {
    const lga = areaShapes('lga');
    const region = areaShapes('region');
    expect(lga).toHaveLength(8);
    expect(region).toHaveLength(7);
    const crr = region.find((s) => s.key === 'Janjanbureh')!;
    const kuntaur = lga.find((s) => s.key === 'Kuntaur')!;
    const janjanbureh = lga.find((s) => s.key === 'Janjanbureh')!;
    // Both LGAs' rings in one shape, so the region is filled once,
    // labelled once and given one figure rather than two of each.
    expect(crr.shape.rings).toHaveLength(
      kuntaur.shape.rings.length + janjanbureh.shape.rings.length,
    );
    expect(crr.label).toBe('Janjanbureh (Central River)');
    expect(janjanbureh.label).toBe('Janjanbureh');
  });
});
