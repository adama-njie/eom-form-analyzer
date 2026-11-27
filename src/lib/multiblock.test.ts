import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { analyse, buildDataset } from './analyse';
import { buildDeck } from './pptx';
import { defaultSelection, exportableQuestions, questionKey } from './selection';
import { inferSchema, type Table } from './schema';

/**
 * Multi-answer blocks whose question text has brackets of its own.
 *
 * "B.15 Language(s) of the speeches" is the question, and the languages are
 * its option columns. The option used to be read as the *first* bracketed
 * group in the header, which on this question is the "(s)" of "Language(s)",
 * so every column got a different stem, the block never formed, and the
 * question was charted as its first column alone: one bar reading "No speech
 * delivered" and no languages at all.
 */
const LANGUAGES: Table = {
  headers: [
    'B.15 Language(s) of the speeches',
    'B.15 Language(s) of the speeches (English)',
    'B.15 Language(s) of the speeches (Mandinka)',
    'B.15 Language(s) of the speeches (Wolof)',
    'B.15.1 If other, please specify',
  ],
  rows: [
    ['', 'English', 'Mandinka', '', ''],
    ['', '', 'Mandinka', 'Wolof', ''],
    ['No speech delivered', '', '', '', ''],
    ['', '', 'Mandinka', '', ''],
  ],
};

describe('multi-answer blocks', () => {
  it('keeps a block together when the question text has its own brackets', () => {
    const q = inferSchema(LANGUAGES).find((x) => x.code === 'B.15')!;
    expect(q.kind).toBe('multi');
    expect(q.options.map((o) => o.label)).toEqual([
      'No speech delivered',
      'English',
      'Mandinka',
      'Wolof',
    ]);
  });

  it('does not swallow the question that follows the block', () => {
    const codes = inferSchema(LANGUAGES).map((q) => q.code);
    expect(codes).toContain('B.15');
    // B.15.1 is empty here, so it is dropped rather than charted - what
    // matters is that it was never read as one of B.15's options.
    const q = inferSchema(LANGUAGES).find((x) => x.code === 'B.15')!;
    expect(q.columns).toEqual([0, 1, 2, 3]);
  });

  it('still reads an option that has brackets inside it', () => {
    const table: Table = {
      headers: [
        'F.9.1 If Yes, please specify:',
        'F.9.1 If Yes, please specify: (Voting booth(s))',
        'F.9.1 If Yes, please specify: ((Tamper-evident) bags)',
      ],
      rows: [
        ['Ballot papers', 'Voting booth(s)', ''],
        ['Ballot papers', '', '(Tamper-evident) bags'],
      ],
    };
    const q = inferSchema(table).find((x) => x.code === 'F.9.1')!;
    expect(q.kind).toBe('multi');
    expect(q.options.map((o) => o.label)).toEqual([
      'Ballot papers',
      'Voting booth(s)',
      '(Tamper-evident) bags',
    ]);
  });
});

describe('a block of tick boxes', () => {
  const dataset = () => buildDataset(LANGUAGES, inferSchema(LANGUAGES));

  it('counts each option as a share of the reports, not of the ticks', () => {
    /*
     * One report ticks several options, so the ticks add up to more than
     * the reports: Mandinka on three reports of four is 75%, and it used
     * to be drawn as 43% - three of the seven boxes ticked, which answers
     * a question nobody asked.
     */
    const ds = dataset();
    const b = analyse(ds, ds.questions.find((q) => q.code === 'B.15')!);
    expect(b.reports).toBe(4);
    const mandinka = b.total.find((c) => c.label === 'Mandinka')!;
    expect(mandinka.n).toBe(3);
    expect(Math.round(mandinka.pct)).toBe(75);
  });

  it('says on the slide what the share is of', () => {
    // A percentage on a slide says what it is a share of, always.
    const ds = dataset();
    const deck = buildDeck(ds, undefined, {
      selection: {
        ...defaultSelection(ds, 'test'),
        coverage: false,
        maps: false,
        ratings: false,
        questions: exportableQuestions(ds).map(questionKey),
      },
      includeMaps: false,
    });
    return deck.write({ outputType: 'nodebuffer' }).then(async (buf) => {
      const zip = await JSZip.loadAsync(buf as Buffer);
      const charts = Object.keys(zip.files).filter((f) => /ppt\/charts\/chart\d+\.xml$/.test(f));
      const texts = await Promise.all(charts.map((f) => zip.files[f]!.async('string')));
      const page = texts.find((x) => x.includes('Mandinka'))!;
      expect(page).toContain('Share of all 4 reports');
      // The share and the count are written together, after the bar, so
      // a reader does not carry the count across the chart to reach it.
      const slides = Object.keys(zip.files).filter((f) => /ppt\/slides\/slide\d+\.xml$/.test(f));
      const written = await Promise.all(slides.map((f) => zip.files[f]!.async('string')));
      expect(written.some((x) => x.includes('<a:t>75% (3)</a:t>'))).toBe(true);
    });
  });
});
