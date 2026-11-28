import { afterEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import {
  analyse,
  buildDataset,
  constituencyCoverage,
  mapsConstituencies,
  reportsByUnit,
} from './analyse';
import { ALL_CONSTITUENCIES, CONSTITUENCY_UNITS, unitOfConstituency } from './gambia';
import { buildDeck } from './pptx';
import { inferSchema, toTable } from './schema';
import { defaultSelection, exportableQuestions, questionKey } from './selection';

/**
 * A form with both halves of the hierarchy: the Local Government Area and
 * the constituency inside it. The spellings are the ones observers
 * actually use - "Serrekunda West" on one report and "Serekunda west" on
 * the next - and one answer, "Westfield", is a place rather than a
 * constituency.
 */
const HEADER = [
  'A.1 LTO team',
  'A.2 Local Government Area (LGA)',
  'A.3 Constituency',
  'B.5 Was a candidate present',
];

const ROWS = [
  ['LTO01', 'Kanifing', 'Serrekunda West', 'Yes'],
  ['LTO01', 'Kanifing', 'Serekunda west', 'No'],
  ['LTO02', 'Kanifing', 'Bakau', 'Yes'],
  ['LTO02', 'Kanifing', 'Westfield', 'Yes'],
  ['LTO03', 'Basse', 'Jimara', 'No'],
  ['LTO03', 'Basse', 'Kantora', 'Yes'],
  ['LTO04', 'Brikama', 'Foni Bintang', 'Yes'],
];

function form() {
  const table = toTable([HEADER, ...ROWS]);
  return buildDataset(table, inferSchema(table));
}

afterEach(() => vi.unstubAllGlobals());

describe('the constituency question', () => {
  it('is found, and is not mistaken for the area column', () => {
    const ds = form();
    expect(ds.areaColumn).toBe(1);
    expect(ds.constituencyColumn).toBe(2);
  });

  it('counts two spellings of one constituency as one place', () => {
    const q = form().questions.find((x) => x.code === 'A.3')!;
    const counts = analyse(form(), q).total;
    const sw = counts.find((c) => c.label === 'Serekunda West');
    expect(sw?.n).toBe(2);
    expect(counts.map((c) => c.label)).not.toContain('Serrekunda West');
  });

  it('leaves an answer the gazetteer does not know exactly as written', () => {
    const ds = form();
    const q = ds.questions.find((x) => x.code === 'A.3')!;
    expect(analyse(ds, q).total.map((c) => c.label)).toContain('Westfield');
  });

  it('reads down the country rather than by count', () => {
    // Kanifing before Brikama before Basse, as the constituencies are
    // listed; the unrecognised answer comes after the ones that resolved.
    const ds = form();
    const q = ds.questions.find((x) => x.code === 'A.3')!;
    const labels = analyse(ds, q).total.map((c) => c.label);
    expect(labels.indexOf('Bakau')).toBeLessThan(labels.indexOf('Serekunda West'));
    expect(labels.indexOf('Serekunda West')).toBeLessThan(labels.indexOf('Foni Bintang'));
    expect(labels.indexOf('Foni Bintang')).toBeLessThan(labels.indexOf('Jimara'));
    expect(labels[labels.length - 1]).toBe('Westfield');
  });

  it('is charted rather than turned into a cloud of place names', () => {
    const ds = form();
    const codes = exportableQuestions(ds).map((q) => q.code);
    expect(codes).toContain('A.3');
  });
});

describe('constituencies under their area', () => {
  it('groups each one under the area its reports give', () => {
    const { groups } = constituencyCoverage(form());
    expect(groups.map((g) => g.area)).toEqual(['Kanifing', 'Brikama', 'Basse']);

    const kmc = groups.find((g) => g.area === 'Kanifing')!;
    expect(kmc.reports).toBe(4);
    expect(kmc.constituencies).toEqual([
      { name: 'Bakau', reports: 1 },
      { name: 'Serekunda West', reports: 2 },
    ]);
    // "Westfield" is a place in Kanifing, not one of its constituencies.
    expect(kmc.unnamed).toBe(1);
    expect(kmc.totalConstituencies).toBe(7);
  });

  it('says what the unplaced reports wrote instead', () => {
    // "Constituency not named" reads as missing data. The field was
    // filled in; what it held was a neighbourhood.
    const kmc = constituencyCoverage(form()).groups.find((g) => g.area === 'Kanifing')!;
    expect(kmc.unrecognised).toEqual([{ text: 'Westfield', reports: 1 }]);
  });

  it('shows how much of an area was reached, not just that it was', () => {
    const { groups } = constituencyCoverage(form());
    const basse = groups.find((g) => g.area === 'Basse')!;
    expect(basse.constituencies).toHaveLength(2);
    expect(basse.totalConstituencies).toBeGreaterThan(2);
    expect(basse.unnamed).toBe(0);
  });

  it('respects a filter', () => {
    const only = [true, true, false, false, false, false, false];
    const { groups } = constituencyCoverage(form(), only);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.reports).toBe(2);
  });
});

describe('the deck', () => {
  /*
   * There is no constituency page any more.
   *
   * It was a table of all 53 under their areas, and on the polling-day
   * form it was a table of one area's: the constituency is asked there in
   * a column per area, and the page was built from whichever single column
   * resolved most often. The grouping it showed is still on screen, where
   * a reader can scroll, filter and check it against the register.
   */
  it('leaves the constituencies to the table on screen', async () => {
    const ds = form();
    const deck = buildDeck(ds, undefined, {
      selection: {
        ...defaultSelection(ds, 'test'),
        maps: false,
        findingsTable: false,
        ratings: false,
        questions: exportableQuestions(ds).map(questionKey),
      },
      includeMaps: false,
    });
    const buf = (await deck.write({ outputType: 'nodebuffer' })) as Buffer;
    const zip = await JSZip.loadAsync(buf);
    const slides = Object.keys(zip.files).filter((f) => /ppt\/slides\/slide\d+\.xml$/.test(f));
    const texts = await Promise.all(slides.map((f) => zip.files[f]!.async('string')));
    expect(texts.some((x) => x.includes('Coverage by constituency'))).toBe(false);
  });

  it('still counts them on the coverage page', async () => {
    const ds = form();
    const deck = buildDeck(ds, undefined, {
      selection: {
        ...defaultSelection(ds, 'test'),
        maps: false,
        findingsTable: false,
        ratings: false,
        questions: [],
      },
      includeMaps: false,
    });
    const buf = (await deck.write({ outputType: 'nodebuffer' })) as Buffer;
    const zip = await JSZip.loadAsync(buf);
    const slides = Object.keys(zip.files).filter((f) => /ppt\/slides\/slide\d+\.xml$/.test(f));
    const texts = await Promise.all(slides.map((f) => zip.files[f]!.async('string')));
    const page = texts.find((x) => x.includes('Coverage'))!;
    // Five constituencies resolved across three areas, of the country's
    // 53. "Westfield" is not one of them, and is not counted as one.
    expect(page).toContain('Constituencies');
    expect(page).toContain('5 / 53');
  });
});

describe('constituencies on the map', () => {
  it('gives every one of the 53 a shape, in 46 units', () => {
    /*
     * Forty-four constituencies are one district and carry its name;
     * the other nine were made by splitting three old districts in the
     * two towns, and are drawn as the two shapes those splits came
     * from. Nothing in the country is left white.
     */
    expect(CONSTITUENCY_UNITS).toHaveLength(46);
    const uncovered = ALL_CONSTITUENCIES.filter((c) => unitOfConstituency(c) === null);
    expect(uncovered).toEqual([]);
    const alone = CONSTITUENCY_UNITS.filter((u) => u.constituencies.length === 1);
    expect(alone).toHaveLength(44);
  });

  it('puts a town constituency in the shape it shares with its neighbours', () => {
    expect(unitOfConstituency('Latrikunda Sabiji')).toBe('Greater Serrekunda');
    expect(unitOfConstituency('Brikama North')).toBe('Brikama and Kombo North');
    // And one that has its own boundary keeps its own name.
    expect(unitOfConstituency('Bakau')).toBe('Bakau');
  });

  it('finds a boundary filed under a longer name than the constituency', () => {
    // The district is "Foni Bintang Karanai"; the constituency is not.
    const unit = CONSTITUENCY_UNITS.find((u) => u.key === 'Foni Bintang');
    expect(unit?.shape.rings.length).toBeGreaterThan(0);
  });

  it('counts the reports into the shape they were filed from', () => {
    const ds = form();
    const rates = reportsByUnit(ds);
    const got = Object.fromEntries(
      rates.filter((r) => r.pct !== null).map((r) => [r.place, r.n]),
    );
    expect(got).toEqual({
      'Serekunda West': 2,
      Bakau: 1,
      Jimara: 1,
      Kantora: 1,
      'Foni Bintang': 1,
    });
    // "Westfield" is a place rather than a constituency, so it is in no
    // shape - and a shape with no reports is null, never nought.
    expect(rates.filter((r) => r.pct === null)).toHaveLength(41);
  });

  it('draws no constituency map for a form from another country', () => {
    const table = toTable([
      ['A.2 District', 'B.5 Was a candidate present'],
      ['Kigali', 'Yes'],
      ['Huye', 'No'],
    ]);
    const ds = buildDataset(table, inferSchema(table));
    expect(mapsConstituencies(ds)).toBe(false);
  });
});
