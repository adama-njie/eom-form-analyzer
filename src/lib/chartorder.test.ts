import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { analyse, buildDataset, displayCounts } from './analyse';
import { buildDeck } from './pptx';
import { inferSchema, toTable } from './schema';
import { defaultSelection, exportableQuestions, questionKey } from './selection';

/*
 * These run against a real form export, which holds observation data and so
 * is not in the repository. Without it they are skipped rather than failing:
 * a clone should be able to run `npm test` and see the rest of the suite
 * pass. Put the file in place locally to run them.
 */
const HAS_FIXTURE = existsSync('public/gambia.xlsx');

function gambia() {
  const wb = XLSX.read(readFileSync('public/gambia.xlsx'), { type: 'buffer' });
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]!]!, {
    header: 1, blankrows: false, defval: '',
  });
  const table = toTable(grid);
  return buildDataset(table, inferSchema(table));
}

async function deckXml() {
  const ds = gambia();
  const deck = buildDeck(ds, undefined, {
    selection: {
      ...defaultSelection(ds, 'test'),
      questions: exportableQuestions(ds).map(questionKey),
    },
    includeMaps: false,
  });
  const buf = (await deck.write({ outputType: 'nodebuffer' })) as Buffer;
  const zip = await JSZip.loadAsync(buf);
  const charts = Object.keys(zip.files).filter((f) => /ppt\/charts\/chart\d+\.xml$/.test(f));
  return Promise.all(charts.map((f) => zip.files[f]!.async('string')));
}

describe.skipIf(!HAS_FIXTURE)('chart ordering', () => {
  it('draws time questions as columns, not bars', async () => {
    const ds = gambia();
    const time = ds.questions.filter((q) => q.kind === 'time');
    expect(time.length, 'the sample form has a time question').toBeGreaterThan(0);

    const xmls = await deckXml();
    const hourly = xmls.filter((x) => /<c:v>\d{2}:00<\/c:v>/.test(x));
    expect(hourly.length, 'a chart of hours exists').toBeGreaterThan(0);
    for (const x of hourly) {
      expect(x).toContain('<c:barDir val="col"/>');
    }
  });

  it('keeps the hours in chronological order', () => {
    const ds = gambia();
    const q = ds.questions.find((x) => x.kind === 'time')!;
    const labels = displayCounts(q, analyse(ds, q)).map((c) => c.label);
    expect([...labels].sort()).toEqual(labels);
  });

  it('hands horizontal bar charts their categories reversed, so they read top down', async () => {
    const xmls = await deckXml();
    // "Reports by area": the data is sorted commonest first, so the XML,
    // being reversed, must end with the largest.
    const bars = xmls.filter((x) => x.includes('<c:barDir val="bar"/>'));
    expect(bars.length).toBeGreaterThan(0);

    const counted = bars.find((x) => /Brikama/.test(x) && /Banjul/.test(x));
    expect(counted, 'the coverage chart is there').toBeTruthy();
    const values = [...counted!.matchAll(/<c:v>(\d+)<\/c:v>/g)]
      .map((m) => Number(m[1]))
      .slice(-7);
    // Ascending in the XML means descending on the slide.
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });
});
