import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildDeck } from './pptx';
import { defaultSelection, exportableQuestions, questionKey } from './selection';
import {
  buildDataset,
  sectionOverviews,
  sharesAcross,
  teamQuestion,
  teamReports,
} from './analyse';
import { inferSchema, toTable } from './schema';

/**
 * A polling-day form with a section asked the same way throughout, which is
 * what most of the form is: ten questions answered Yes or No, five scored
 * against one legend, and the teams asked for once per team type.
 */
const HEADER = [
  'A.1 Team number - LTO',
  'A.1 Team number - STO',
  'B.1 Polling station administrative area',
  'B.5 Polling station type',
  'F.1 Is the PS layout adequate to conduct the poll?',
  'F.2 Does the PS layout ensure the secrecy of the vote?',
  'F.3 Is the PS overcrowded?',
  '4=Very good  3=Good  2=Bad  1=Very bad',
  'J.1 The overall conduct of the voting in this PS was',
  'J.2 General environment',
  'J.3 Polling staff overall performance',
];

const ROWS = [
  ['LTO 01', '', 'Banjul', 'Urban', 'Yes', 'Yes', 'No', '', '3', '3', '4'],
  ['', 'STO 02', 'Banjul', 'Urban', 'Yes', 'No', 'No', '', '4', '3', '3'],
  ['LTO 01', '', 'Kanifing', 'Rural', 'No', 'Yes', 'No', '', '2', '2', '3'],
  ['', 'STO 01', 'Kanifing', 'Urban', 'Yes', 'Yes', 'No', '', '3', '4', '4'],
  ['LTO 02', '', 'Basse', 'Rural', 'Yes', 'Yes', 'No', '', '4', '3', '3'],
  ['', 'STO 02', 'Basse', 'Rural', 'Yes', 'No', 'No', '', '3', '3', '2'],
];

function form() {
  const table = toTable([HEADER, ...ROWS]);
  return buildDataset(table, inferSchema(table));
}

const q = (code: string) => form().questions.find((x) => x.code === code)!;

/** The deck's slides, in order, as text. Maps need a browser; these do not. */
async function slides(): Promise<string[]> {
  const ds = form();
  const deck = buildDeck(ds, undefined, {
    selection: {
      ...defaultSelection(ds, 'test'),
      coverage: false,
      ratings: false,
      questions: exportableQuestions(ds).map(questionKey),
    },
    includeMaps: false,
  });
  const buf = (await deck.write({ outputType: 'nodebuffer' })) as Buffer;
  const zip = await JSZip.loadAsync(buf);
  return Promise.all(
    Object.keys(zip.files)
      .filter((f) => /ppt\/slides\/slide\d+\.xml$/.test(f))
      .sort((a, b) => Number(/(\d+)/.exec(a)![1]) - Number(/(\d+)/.exec(b)![1]))
      .map((f) => zip.files[f]!.async('string')),
  );
}

describe('the deck a section makes', () => {
  it('opens a section with the page that holds all of it', async () => {
    const texts = await slides();
    const page = texts.findIndex((x) => x.includes('Section F'));
    expect(page).toBeGreaterThan(0);
    expect(texts.findIndex((x) => x.includes('F.1 Is the PS layout'))).toBeGreaterThan(page);
  });

  it('draws the teams as a chart per team type', async () => {
    const texts = await slides();
    const page = texts.find((x) => x.includes('A.1 Team number'))!;
    expect(page).toContain('>LTO<');
    expect(page).toContain('>STO<');
  });
});

describe('the teams that filed the reports', () => {
  it('is one chart per team type, not sixty bars on one axis', () => {
    const ds = form();
    expect(teamQuestion(ds)?.code).toBe('A.1');
    const panels = teamReports(ds);
    expect(panels.map((p) => p.label)).toEqual(['LTO', 'STO']);
  });

  it('shows every team of a type, with the reports it filed', () => {
    const panels = teamReports(form());
    expect(panels[0]!.counts.map((c) => [c.label, c.n])).toEqual([
      ['LTO 01', 2],
      ['LTO 02', 1],
    ]);
    expect(panels[1]!.counts.map((c) => [c.label, c.n])).toEqual([
      ['STO 01', 1],
      ['STO 02', 2],
    ]);
  });
});

describe('a section on one page', () => {
  it('puts every question asked the same way on one chart', () => {
    const ds = form();
    const f = sectionOverviews(ds, ds.questions).find((o) => o.section === 'F')!;
    expect(f.rows.map((r) => r.question.code)).toEqual(['F.1', 'F.2', 'F.3']);
    expect(f.answers).toEqual(['Yes', 'No']);
  });

  it('keeps a question nobody answered Yes to, which is the one worth seeing', () => {
    /*
     * Keyed on the answers that were actually given, F.3 - answered No on
     * every report - has a set of one and would be split onto a chart of
     * its own. The scale is what makes two questions comparable.
     */
    const ds = form();
    const f = sectionOverviews(ds, ds.questions).find((o) => o.section === 'F')!;
    const overcrowded = f.rows.find((r) => r.question.code === 'F.3')!;
    expect(overcrowded.counts.map((c) => [c.label, c.n])).toEqual([
      ['Yes', 0],
      ['No', 6],
    ]);
    expect(overcrowded.n).toBe(6);
  });

  it('reads a scored section in the words of its own legend', () => {
    const ds = form();
    const j = sectionOverviews(ds, ds.questions).find((o) => o.section === 'J')!;
    expect(j.rows.map((r) => r.question.code)).toEqual(['J.1', 'J.2', 'J.3']);
    expect(j.answers).toEqual(['Very bad', 'Bad', 'Good', 'Very good']);
  });

  it('leaves a section of one or two questions to its own pages', () => {
    // Two rows is a pair of charts that each had room to say more.
    const ds = form();
    expect(sectionOverviews(ds, ds.questions).map((o) => o.section)).toEqual(['F', 'J']);
  });
});

describe('a question across the country', () => {
  it('is the nation, the kind of station, and then each area', () => {
    const shares = sharesAcross(form(), q('F.1'))!;
    expect(shares.panels.map((p) => p.title)).toEqual([
      'National',
      'By station type',
      'By Local Government Area',
    ]);
    expect(shares.answers).toEqual(['Yes', 'No']);
  });

  it('carries the reports each column rests on', () => {
    // A share of one report and a share of eighty are the same height and
    // not the same evidence.
    const shares = sharesAcross(form(), q('F.1'))!;
    const areas = shares.panels[2]!;
    expect(areas.groups.map((g) => [g.label, g.n])).toEqual([
      ['Banjul', 2],
      ['Kanifing', 2],
      ['Basse', 2],
    ]);
    expect(shares.panels[0]!.groups[0]!.n).toBe(6);
  });

  it('gives an area that never said No a No of nought', () => {
    // A stacked column drawn from the answers an area gave puts the wrong
    // colour in the wrong place when an area skipped one of them.
    const shares = sharesAcross(form(), q('F.1'))!;
    const banjul = shares.panels[2]!.groups.find((g) => g.label === 'Banjul')!;
    expect(banjul.counts.map((c) => [c.label, c.n, c.pct])).toEqual([
      ['Yes', 2, 100],
      ['No', 0, 0],
    ]);
  });

  it('is not drawn for the question that names the area itself', () => {
    expect(sharesAcross(form(), q('B.1'))).toBeNull();
  });
});
