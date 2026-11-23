import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { analyse, buildDataset, constituencyCoverage } from './analyse';
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
  it('carries a coverage page for the constituencies', async () => {
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
    const page = texts.find((x) => x.includes('Coverage by constituency'));
    expect(page, 'the constituency page is in the deck').toBeDefined();
    expect(page).toContain('Serekunda West');
    expect(page).toContain('Kanifing');
  });
});
