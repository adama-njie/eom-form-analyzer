import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildDataset } from './analyse';
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
  const buf = readFileSync('public/gambia.xlsx');
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: '' });
  const table = toTable(grid);
  return buildDataset(table, inferSchema(table));
}

describe.skipIf(!HAS_FIXTURE)('PowerPoint export', () => {
  it('builds a deck and writes a real pptx', async () => {
    const ds = gambia();
    const deck = buildDeck(ds, undefined, {
      selection: {
        ...defaultSelection(ds, 'Dummy data for testing'),
        title: 'Analysis of the Campaign Reports',
        questions: exportableQuestions(ds).map(questionKey),
      },
      // Maps need a canvas; they are verified in the browser instead.
      includeMaps: false,
    });
    const buf = (await deck.write({ outputType: 'nodebuffer' })) as Buffer;
    expect(buf.length).toBeGreaterThan(20_000);
    // A pptx is a zip: check the magic bytes rather than trusting the size.
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
    writeFileSync('tmp-deck.pptx', buf);
  });
});
