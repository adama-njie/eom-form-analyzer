import { describe, expect, it, vi, afterEach } from 'vitest';
import JSZip from 'jszip';
import { buildDataset } from './analyse';
import { layoutCloud } from './chartImage';
import { buildDeck } from './pptx';
import { inferSchema, toTable } from './schema';
import { defaultSelection, exportableQuestions, questionKey } from './selection';

/**
 * A form with one prose question and one identifier column.
 *
 * Synthetic rather than a real export: the only forms with prose columns to
 * hand hold live observation data, which does not belong in a repository.
 */
const PROSE = [
  'Candidate spoke about roads and the new health centre for the community',
  'Speakers promised water and electricity for every village in the district',
  'The candidate talked about youth employment and roads across the region',
  'Main message was health, water and support for women traders locally',
  'Speakers raised electricity, roads and the cost of living for families',
];

/** One value per row, so the column is typed as free text rather than a category. */
const PLACES = ['Banjul Central', 'Serrekunda West', 'Sandu', 'Jarra East', 'Niamina Dankunku'];

function grid() {
  const header = ['A.1 Team number', 'B.1 Constituency', 'C.10 Describe the main messages'];
  const rows = PROSE.map((text, i) => [`LTO0${i + 1}`, PLACES[i]!, text]);
  return [header, ...rows];
}

/**
 * A canvas that records nothing and draws nothing.
 *
 * The deck rasterises a word cloud, and Node has no canvas. Stubbing one is
 * enough to check that the slide is built and carries an image, which is the
 * part that can break; how the cloud looks is checked in a browser.
 */
function stubCanvas() {
  const ctx = new Proxy(
    { measureText: () => ({ width: 40 }), canvas: null },
    { get: (t, k) => (k in t ? (t as never)[k] : () => undefined) },
  );
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ctx,
      // A 1x1 transparent PNG.
      toDataURL: () =>
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    }),
  });
  vi.stubGlobal('btoa', (s: string) => Buffer.from(s, 'binary').toString('base64'));
  vi.stubGlobal('atob', (s: string) => Buffer.from(s, 'base64').toString('binary'));
}

afterEach(() => vi.unstubAllGlobals());

describe('a prose question in the deck', () => {
  it('is exportable, and an identifier column is not', () => {
    const table = toTable(grid());
    const ds = buildDataset(table, inferSchema(table));
    const codes = exportableQuestions(ds).map((q) => q.code);
    expect(codes).toContain('C.10');
    expect(codes).not.toContain('B.1');
  });

  it('becomes a slide carrying an image, not a chart', async () => {
    stubCanvas();
    const table = toTable(grid());
    const ds = buildDataset(table, inferSchema(table));
    const prose = exportableQuestions(ds).filter((q) => q.kind === 'text');
    expect(prose).toHaveLength(1);

    const deck = buildDeck(ds, undefined, {
      selection: {
        ...defaultSelection(ds, 'test'),
        coverage: false,
        maps: false,
        findingsTable: false,
        ratings: false,
        questions: prose.map(questionKey),
      },
      includeMaps: false,
    });
    const buf = (await deck.write({ outputType: 'nodebuffer' })) as Buffer;
    const zip = await JSZip.loadAsync(buf);

    const media = Object.keys(zip.files).filter((f) => f.startsWith('ppt/media/'));
    expect(media.length, 'the cloud was embedded').toBeGreaterThan(0);

    const slides = Object.keys(zip.files).filter((f) => /ppt\/slides\/slide\d+\.xml$/.test(f));
    // The cover and the one prose question.
    expect(slides).toHaveLength(2);

    const xml = await zip.files['ppt/slides/slide2.xml']!.async('string');
    expect(xml).toContain('C.10');
    expect(xml).toContain('<p:pic>');
    expect(xml).not.toContain('graphicFrame');
  });
});

/**
 * Laying out a cloud that has phrases in it.
 *
 * Arial at a given size is roughly 0.55 of that size per character, which is
 * close enough to decide whether something fits a canvas.
 */
const measure = (text: string, size: number) => text.length * size * 0.55;

describe('a cloud of named things', () => {
  // As the live campaign export reads, long phrase and all - and
  // deliberately not with the phrase first, because the first entry is
  // placed at the centre and always fits. It was the third that vanished.
  const WORDS = [
    { word: 'Police', n: 7 },
    { word: 'Police officers', n: 5 },
    { word: 'Police Intervention Unit', n: 4 },
    { word: 'Army', n: 3 },
    { word: 'Private security', n: 2 },
    { word: 'Gambia Police', n: 1 },
  ];
  const W = 1800;
  const H = 900;

  it('keeps the commonest entry even when it is a long phrase', () => {
    // It used to be dropped: at the size its count earned it was wider than
    // the slide, so the spiral never found a spot and the answer most
    // observers gave was missing from its own cloud.
    const laid = layoutCloud(WORDS, W, H, measure);
    expect(laid.map((l) => l.word)).toContain('Police Intervention Unit');
    expect(laid).toHaveLength(WORDS.length);
  });

  it('keeps every entry inside the canvas', () => {
    for (const l of layoutCloud(WORDS, W, H, measure)) {
      const w = measure(l.word, l.size) + l.size * 0.22;
      expect(l.x).toBeGreaterThanOrEqual(0);
      expect(l.x + w).toBeLessThanOrEqual(W);
      expect(l.y).toBeGreaterThanOrEqual(0);
      expect(l.y + l.size * 1.1).toBeLessThanOrEqual(H);
    }
  });

  it('still sizes by count, not by length', () => {
    const laid = layoutCloud(WORDS, W, H, measure);
    const size = Object.fromEntries(laid.map((l) => [l.word, l.size]));
    expect(size['Police']!).toBeGreaterThan(size['Police officers']!);
    expect(size['Police officers']!).toBeGreaterThan(size['Police Intervention Unit']!);
    expect(size['Army']!).toBeGreaterThan(size['Gambia Police']!);
  });

  it('leaves room around the widest entry, so it can be placed at all', () => {
    for (const l of layoutCloud(WORDS, W, H, measure)) {
      expect(measure(l.word, l.size) + l.size * 0.22).toBeLessThanOrEqual(W * 0.81);
    }
  });

  it('leaves a cloud of short words as large as it ever was', () => {
    const short = [
      { word: 'roads', n: 10 },
      { word: 'water', n: 6 },
      { word: 'health', n: 2 },
    ];
    const laid = layoutCloud(short, W, H, measure);
    expect(laid[0]!.size).toBe(Math.round(Math.min(W / 7, H / 3.4)));
  });
});
