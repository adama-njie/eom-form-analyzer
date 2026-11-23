import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { analyse, buildDataset } from './analyse';
import { inferSchema, toTable } from './schema';
import {
  PRESETS,
  areaBreakdown,
  countOwnSlides,
  defaultSelection,
  estimateSlides,
  exportableQuestions,
  needsOwnSlide,
  questionKey,
  selectedQuestions,
  type ExportSelection,
} from './selection';

/*
 * These run against a real form export, which holds observation data and so
 * is not in the repository. Without it they are skipped rather than failing:
 * a clone should be able to run `npm test` and see the rest of the suite
 * pass. Put the file in place locally to run them.
 */
const HAS_FIXTURE = existsSync('public/gambia.xlsx');

let cached: ReturnType<typeof read> | null = null;

/**
 * Read once, and only if the fixture is there. `describe.skipIf` still runs
 * the body of the describe, so a clone without the file would throw here
 * before the skip took effect.
 */
function gambia(): ReturnType<typeof read> {
  cached ??= HAS_FIXTURE ? read() : (null as never);
  return cached;
}

function read() {
  const buf = readFileSync('public/gambia.xlsx');
  const wb = XLSX.read(buf, { type: 'buffer' });
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]!]!, {
    header: 1,
    blankrows: false,
    defval: '',
  });
  const table = toTable(grid);
  return buildDataset(table, inferSchema(table));
}

describe.skipIf(!HAS_FIXTURE)('export selection', () => {
  const ds = gambia();
  // The describe body runs even when the tests in it are skipped.
  const all = HAS_FIXTURE ? exportableQuestions(ds) : [];

  it('gives every question a unique key', () => {
    // Several questions share a code: a form asks "A.1 Team number" once
    // per team type. Keying on the code alone made them toggle together.
    const keys = all.map(questionKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has more than one question sharing a code, which is why that matters', () => {
    const codes = all.map((q) => q.code).filter(Boolean);
    expect(new Set(codes).size).toBeLessThan(codes.length);
  });

  it('round-trips the full selection without losing a question', () => {
    const sel = { ...defaultSelection(ds, 'x'), questions: all.map(questionKey) };
    expect(selectedQuestions(ds, sel)).toHaveLength(all.length);
  });

  it('returns selected questions in form order, not click order', () => {
    const reversed = [...all].reverse().map(questionKey);
    const sel = { ...defaultSelection(ds, 'x'), questions: reversed };
    expect(selectedQuestions(ds, sel).map(questionKey)).toEqual(all.map(questionKey));
  });

  it('ignores a key that is not in this form', () => {
    const sel = { ...defaultSelection(ds, 'x'), questions: ['Z.9#999'] };
    expect(selectedQuestions(ds, sel)).toHaveLength(0);
  });

  describe('presets', () => {
    it('short brief includes no question pages', () => {
      const p = PRESETS.find((x) => x.id === 'brief')!.build(ds);
      expect(p.questions).toHaveLength(0);
      expect(p.findingsTable).toBe(true);
    });

    it('everything selects every exportable question', () => {
      const p = PRESETS.find((x) => x.id === 'full')!.build(ds);
      expect(p.questions).toHaveLength(all.length);
    });

    it('questions only drops the summary sections', () => {
      const p = PRESETS.find((x) => x.id === 'questions')!.build(ds);
      expect(p.coverage).toBe(false);
      expect(p.findingsTable).toBe(false);
      expect(p.questions!.length).toBeGreaterThan(0);
    });

    it('flagged selects fewer questions than everything, but not none', () => {
      const flagged = PRESETS.find((x) => x.id === 'flagged')!.build(ds).questions!;
      expect(flagged.length).toBeGreaterThan(0);
      expect(flagged.length).toBeLessThan(all.length);
    });
  });

  it('estimates a smaller deck for a smaller selection', () => {
    const brief = { ...defaultSelection(ds, 'x'), ...PRESETS[0]!.build(ds) };
    const full = { ...defaultSelection(ds, 'x'), ...PRESETS[2]!.build(ds) };
    expect(estimateSlides(brief, 0)).toBeLessThan(estimateSlides(full, all.length));
  });
});

describe.skipIf(!HAS_FIXTURE)('how questions are packed onto slides', () => {
  it('gives a question with a by-area comparison its own slide', () => {
    const ds = gambia();
    const binary = ds.questions.find(
      (q) => q.kind === 'binary' && Object.keys(analyse(ds, q).byArea).length > 1,
    );
    expect(binary).toBeDefined();
    expect(needsOwnSlide(binary!, analyse(ds, binary!))).toBe(true);
  });

  it('lets a short question share', () => {
    const ds = gambia();
    const short = ds.questions.find((q) => {
      if (q.kind !== 'numeric' && q.kind !== 'multi') return false;
      const b = analyse(ds, q);
      return b.total.length > 0 && !needsOwnSlide(q, b);
    });
    expect(short).toBeDefined();
  });

  it('counts the slides the deck will actually produce', () => {
    const ds = gambia();
    const all = exportableQuestions(ds);
    const heavy = countOwnSlides(ds, all);
    const sel: ExportSelection = {
      ...defaultSelection(ds, 'test'),
      coverage: false,
      maps: false,
      findingsTable: false,
      ratings: false,
      questions: all.map(questionKey),
    };
    // The cover and the question slides.
    const expected = 1 + heavy + Math.ceil((all.length - heavy) / 2);
    expect(estimateSlides(sel, all.length, heavy)).toBe(expected);
  });

  it('never compares across areas when there is only one area', () => {
    const q = { kind: 'binary', label: 'x', code: 'X', columns: [0], options: [] } as never;
    const b = { total: [{ label: 'Yes', n: 1, pct: 100 }], byArea: { Banjul: [] }, answered: 1, notApplicable: 0 };
    expect(areaBreakdown(q, b as never)).toEqual([]);
  });
});
