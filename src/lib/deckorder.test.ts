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
  'D.1 Total number of voters on the voter list',
  'F.3 Is the PS overcrowded?',
  'I.1 Time of departure',
  'I.2 Total number of voters who had voted at the time of your departure',
  '4=Very good  3=Good  2=Bad  1=Very bad',
  'J.1 The overall conduct of the voting in this PS was',
];

/** Polling day, as a workbook writes it: one serial per clock time. */
const DAY = 46_361;
const clock = (hours: number) => String(DAY + (hours * 60) / 1440);

const ROWS = [
  ['STO', 'Banjul', 'BA-001', 'Urban', 'Yes', '1000', 'No', clock(13), '400', '', '3'],
  ['STO', 'Banjul', 'BA-002', 'Urban', 'Yes', '800', 'Yes', clock(16), '480', '', '4'],
  ['LTO', 'Kanifing', 'KA-003', 'Rural', 'No', '500', 'No', clock(13), '200', '', '2'],
  ['LTO', 'Kanifing', 'KA-004', 'Rural', 'Yes', '400', 'No', clock(16), '240', '', '3'],
  ['STO', 'Basse', 'BA-005', 'Urban', 'No', '900', 'No', clock(13), '270', '', '4'],
  ['STO', 'Basse', 'BA-006', 'Rural', 'Yes', '600', 'Yes', clock(16), '360', '', '3'],
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
    expect(at(texts, 'A.0 Team type')).toBe(2);
    // The map of where the reports came from belongs to the question that
    // asks where they came from, so it follows B.1 rather than opening the
    // deck ahead of section A.
    expect(at(texts, 'Reports by Local Government Area')).toBe(
      at(texts, 'B.1 Polling station administrative area') + 1,
    );
    expect(at(texts, 'A.0 Team type')).toBeLessThan(at(texts, 'C.3 Did you observe'));
    expect(at(texts, 'C.3 Did you observe')).toBeLessThan(at(texts, 'J.1 The overall conduct'));
  });

  it('reads the turnout curve after section C, where the day is read', async () => {
    /*
     * It is drawn from the reading each observer took as they left, so it
     * answers section I rather than the overview, and the mission reads
     * it after the conditions at the station. It used to be page three.
     */
    const texts = await slides();
    const curve = at(texts, 'Turnout through the day');
    expect(curve).toBeGreaterThan(at(texts, 'C.3 Did you observe'));
    expect(curve).toBeLessThan(at(texts, 'D.1 Total number of voters'));
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
    /*
     * One report per station makes the reports and the stations the same
     * number, and two tiles saying six teach a reader nothing twice. The
     * one tile is named for the stations, which is what a briefing opens
     * on, and the word "Reports" is then not on the slide at all.
     */
    const texts = await slides();
    expect(texts[1]).toContain('Polling stations visited');
    expect(texts[1]).not.toContain('>Reports<');
  });

  it('counts the stations and the reports where they differ', async () => {
    const twice = [
      ...ROWS,
      ['STO', 'Basse', 'BA-006', 'Rural', 'No', '600', 'No', clock(16), '380', '', '4'],
    ];
    const texts = await slides(twice);
    expect(texts[1]).toContain('Polling stations visited');
    expect(texts[1]).toContain('>Reports<');
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
