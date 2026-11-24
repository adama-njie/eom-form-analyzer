import { afterEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { buildDataset } from './analyse';
import { buildDeck } from './pptx';
import { inferSchema, toTable } from './schema';
import { defaultSelection, exportableQuestions, questionKey } from './selection';

/**
 * A canvas that draws nothing, so a Node run can still check that the slide
 * was built and carries a picture. How the map looks is checked in a
 * browser; what cannot be checked there is that it keeps being built.
 */
function stubCanvas() {
  const ctx = new Proxy(
    {
      measureText: () => ({ width: 40 }),
      // The shaded map's key is a gradient; a real canvas always returns one.
      createLinearGradient: () => ({ addColorStop: () => undefined }),
      createPattern: () => null,
      canvas: null,
    },
    { get: (t, k) => (k in t ? (t as never)[k] : () => undefined) },
  );
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ctx,
      toDataURL: () =>
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    }),
  });
  vi.stubGlobal('btoa', (s: string) => Buffer.from(s, 'binary').toString('base64'));
  vi.stubGlobal('atob', (s: string) => Buffer.from(s, 'base64').toString('binary'));
}

afterEach(() => vi.unstubAllGlobals());

const HEADER = [
  'A.2 Local Government Area (LGA)',
  'B.3 Type of event',
  'B.5 Was a candidate present',
];

const ROWS = [
  ['Banjul', 'Public rally', 'Yes'],
  ['Kanifing', 'Public rally', 'Yes'],
  ['Kanifing', 'Caravan/Convoy', 'No'],
  ['Kanifing', 'Meeting with voters', 'Yes'],
  ['Brikama', 'Caravan/Convoy', 'Yes'],
  ['Brikama', 'Public rally', 'No'],
  ['Basse', 'Meeting with voters', 'Yes'],
  ['Basse', 'Caravan/Convoy', 'Yes'],
  ['Kerewan', 'Public rally', 'No'],
];

function form() {
  const table = toTable([HEADER, ...ROWS]);
  return buildDataset(table, inferSchema(table));
}

async function slideTexts(includeMaps: boolean): Promise<string[]> {
  const ds = form();
  const deck = buildDeck(ds, undefined, {
    selection: {
      ...defaultSelection(ds, 'test'),
      coverage: false,
      maps: includeMaps,
      findingsTable: false,
      ratings: false,
      questions: exportableQuestions(ds).map(questionKey),
    },
    includeMaps,
  });
  const buf = (await deck.write({ outputType: 'nodebuffer' })) as Buffer;
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files)
    .filter((f) => /ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort();
  return Promise.all(names.map((f) => zip.files[f]!.async('string')));
}

describe('a question on the map', () => {
  it('follows its own slide with a map of the same answers', async () => {
    stubCanvas();
    const texts = await slideTexts(true);
    const typePages = texts.filter((x) => x.includes('Type of event'));
    // The chart, and then the country.
    expect(typePages).toHaveLength(2);
    expect(typePages[1]).toContain('<p:pic>');
  });

  it('does not map a yes/no question, which is better shaded than sliced', async () => {
    stubCanvas();
    const texts = await slideTexts(true);
    expect(texts.filter((x) => x.includes('Was a candidate present'))).toHaveLength(1);
  });

  it('is left out when maps are turned off', async () => {
    stubCanvas();
    const texts = await slideTexts(false);
    expect(texts.filter((x) => x.includes('Type of event'))).toHaveLength(1);
  });
});
