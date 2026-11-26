import { afterEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { buildDataset } from './analyse';
import { buildDeck } from './pptx';
import { inferSchema, toTable } from './schema';
import { defaultSelection, exportableQuestions, questionKey } from './selection';

/**
 * A canvas that draws nothing, so a Node run can still check which slides
 * were built and in what order. How they look is checked in a browser.
 */
function stubCanvas() {
  const ctx = new Proxy(
    {
      measureText: () => ({ width: 40 }),
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
  'A.0 Team type',
  'B.1 Polling station administrative area',
  'B.4 Polling station number',
  'B.5 Polling station type',
  'C.3 Did you observe any particular problem in the vicinity of the PS?',
  'F.3 Is the PS overcrowded?',
  '4=Very good  3=Good  2=Bad  1=Very bad',
  'J.1 The overall conduct of the voting in this PS was',
];

const ROWS = [
  ['STO', 'Banjul', 'BA-001', 'Urban', 'Yes', 'No', '', '3'],
  ['STO', 'Banjul', 'BA-002', 'Urban', 'Yes', 'Yes', '', '4'],
  ['LTO', 'Kanifing', 'KA-003', 'Rural', 'No', 'No', '', '2'],
  ['LTO', 'Kanifing', 'KA-004', 'Rural', 'Yes', 'No', '', '3'],
  ['STO', 'Basse', 'BA-005', 'Urban', 'No', 'No', '', '4'],
  ['STO', 'Basse', 'BA-006', 'Rural', 'Yes', 'Yes', '', '3'],
];

function form(rows = ROWS) {
  const table = toTable([HEADER, ...rows]);
  return buildDataset(table, inferSchema(table));
}

async function slides(rows = ROWS): Promise<string[]> {
  stubCanvas();
  const ds = form(rows);
  const deck = buildDeck(ds, undefined, {
    selection: {
      ...defaultSelection(ds, 'test'),
      questions: exportableQuestions(ds).map(questionKey),
    },
    includeMaps: true,
  });
  const buf = (await deck.write({ outputType: 'nodebuffer' })) as Buffer;
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files)
    .filter((f) => /ppt\/slides\/slide\d+\.xml$/.test(f))
    // slide10 sorts before slide2 as a string.
    .sort((a, b) => Number(/(\d+)/.exec(a)![1]) - Number(/(\d+)/.exec(b)![1]));
  return Promise.all(names.map((f) => zip.files[f]!.async('string')));
}

/** The index of the first slide whose text contains this. */
const at = (texts: string[], needle: string) => texts.findIndex((x) => x.includes(needle));

describe('the order of the deck', () => {
  it('opens with the overview and then follows the form', async () => {
    const texts = await slides();
    expect(at(texts, 'Coverage')).toBe(1);
    // The map belongs to the overview; the questions start after it.
    expect(at(texts, 'Reports by Local Government Area')).toBe(2);
    expect(at(texts, 'A.0 Team type')).toBe(3);
    expect(at(texts, 'A.0 Team type')).toBeLessThan(at(texts, 'C.3 Did you observe'));
    expect(at(texts, 'C.3 Did you observe')).toBeLessThan(at(texts, 'J.1 The overall conduct'));
  });

  it('puts the overall assessments where section J is, at the end', async () => {
    // They used to be slide four, before section A had been reached.
    const texts = await slides();
    expect(at(texts, 'Overall assessments')).toBe(texts.length - 1);
  });

  it('carries no ranked findings table', async () => {
    // The ranking is on screen and in the Word report, which are read
    // rather than presented, and it jumped the deck out of form order.
    const texts = await slides();
    expect(texts.some((x) => x.includes('Ranked findings'))).toBe(false);
  });

  it('maps a flagged question directly after the question it maps', async () => {
    const texts = await slides();
    const i = at(texts, 'C.3 Did you observe');
    expect(texts[i + 1]).toContain('C.3 Did you observe');
    expect(texts[i + 1]).toContain('<p:pic>');
  });
});

describe('the coverage slide', () => {
  it('does not say the same figure twice', async () => {
    // One report per station makes "Reports" and "Polling stations" the
    // same number, and two tiles saying six teach a reader nothing twice.
    const texts = await slides();
    expect(texts[1]).not.toContain('Polling stations');
  });

  it('counts stations where they differ from reports', async () => {
    const twice = [...ROWS, ['STO', 'Basse', 'BA-006', 'Rural', 'No', 'No', '', '4']];
    const texts = await slides(twice);
    expect(texts[1]).toContain('Polling stations');
  });

  it('draws the station type as a ring, with the count and the share', async () => {
    // The title of a chart lives in the chart part, not in the slide.
    const zip = await JSZip.loadAsync(await deckBytes());
    const charts = Object.keys(zip.files).filter((f) => /ppt\/charts\/chart\d+\.xml$/.test(f));
    const xml = await Promise.all(charts.map((f) => zip.files[f]!.async('string')));
    const ring = xml.find((x) => x.includes('<c:doughnutChart>'));
    expect(ring, 'the station type is a ring').toBeDefined();
    expect(ring).toContain('B.5 Polling station type');
    expect(ring).toContain('<c:showVal val="1"/>');
    expect(ring).toContain('<c:showPercent val="1"/>');
  });
});

async function deckBytes(): Promise<Buffer> {
  stubCanvas();
  const ds = form();
  const deck = buildDeck(ds, undefined, {
    selection: { ...defaultSelection(ds, 'test'), questions: [] },
    includeMaps: false,
  });
  return (await deck.write({ outputType: 'nodebuffer' })) as Buffer;
}
