import { describe, expect, it } from 'vitest';
import {
  analyse,
  answeredReports,
  buildDataset,
  chartScale,
  displayCounts,
  moreIsWorse,
  namesStations,
  namesStationsOnly,
  sectionOverviews,
  sharesAcross,
  teamColumns,
  teamReports,
} from './analyse';
import { answerHead, colourFor } from './pptx';
import { COUNT, SCALE } from './theme';
import { inferSchema, parseCode, toTable } from './schema';

/**
 * An opening form with the things a section's pages are read for: who
 * filed, how late a station opened, and a count of a few things.
 */
const HEADER = [
  'A.1 Team number - LTO',
  'A.1 Team number - STO',
  'A.2 Local Government Area (LGA)',
  'B.3 Polling station name',
  'B.5 Polling station type',
  'D.1 Did the PS open for voting at 08:00?',
  'D.1.1 If No to D.1 the delay was:',
  'E.3 How many citizen observers are present',
];

const ROWS = [
  ['LTO 01', '', 'Banjul', 'Albion School', 'Urban', 'No', 'Between 16-30 minutes', '2'],
  ['LTO 01', '', 'Banjul', 'Crab Island', 'Urban', 'Yes', '', '1'],
  ['LTO 02', '', 'Kanifing', 'Bakau Lower', 'Urban', 'No', 'Between 1-15 minutes', '0'],
  ['LTO 04', '', 'Kanifing', 'Serrekunda West', 'Urban', 'Yes', '', '3'],
  ['LTO 05', '', 'Brikama', 'Busumbala', 'Rural', 'Yes', '', '4'],
  ['LTO 05', '', 'Brikama', 'Kansala', 'Rural', 'Yes', '', '9'],
  ['', 'STO 0401', 'Brikama', 'Sanyang', 'Rural', 'Yes', '', '2'],
  ['', 'STO 0601', 'Basse', 'Basse Lower', 'Rural', 'Yes', '', '2'],
  // Two more reports of a late opening, so the delay has answers that
  // repeat and reads as a question with a set of them rather than as
  // free text.
  ['', '', 'Basse', 'Basse Upper', 'Rural', 'No', 'Between 1-15 minutes', '2'],
  ['', '', 'Banjul', 'Half Die', 'Urban', 'No', 'Between 1-15 minutes', '1'],
];

function form(): ReturnType<typeof buildDataset> {
  const table = toTable([HEADER, ...ROWS]);
  return buildDataset(table, inferSchema(table));
}

const q = (code: string) => form().questions.find((x) => x.code === code)!;

/** A form from a mission this tool holds no roster for. */
function otherMission(): ReturnType<typeof buildDataset> {
  const table = toTable([
    ['A.2 Local Government Area (LGA)', 'A.1 Team number - FIELD', 'A.1 Team number - AREA'],
    ['Banjul', 'FIELD 01', 'AREA 0401'],
    ['Banjul', 'FIELD 02', ''],
    ['Kanifing', 'FIELD 04', 'AREA 0601'],
  ]);
  return buildDataset(table, inferSchema(table));
}

describe('the page of teams', () => {
  it('shows every team the mission deployed, filed from or not', () => {
    const lto = teamReports(form()).find((p) => p.label === 'LTO')!;
    expect(lto.counts.map((c) => `${c.label}:${c.n}`)).toEqual([
      'LTO 01:2',
      'LTO 02:1',
      'LTO 03:0',
      'LTO 04:1',
      'LTO 05:2',
      'LTO 06:0',
      'LTO 07:0',
      'LTO 08:0',
    ]);
  });

  it('knows how its short-term teams are numbered, which no file could say', () => {
    // Two reports, from STO 0401 and STO 0601. The ten teams between
    // them cannot be inferred: "0401" is a region and a team.
    const sto = teamReports(form()).find((p) => p.label === 'STO')!;
    expect(sto.counts.map((c) => c.n)).toEqual([0, 0, 0, 1, 0, 0, 1, 0, 0, 0]);
    expect(sto.counts.map((c) => c.label)[4]).toBe('STO 0402');
  });

  it('falls back to the numbering for a type the roster does not list', () => {
    const panels = teamReports(otherMission());
    expect(panels[0]!.counts.map((c) => `${c.label}:${c.n}`)).toEqual([
      'FIELD 01:1',
      'FIELD 02:1',
      'FIELD 03:0',
      'FIELD 04:1',
    ]);
  });

  it('invents no teams where the numbering is not a sequence', () => {
    // "AREA 0401" and "AREA 0601" could be a region and a team, so the
    // two hundred between them are not drawn as teams that filed
    // nothing.
    const areas = teamReports(otherMission())[1]!;
    expect(areas.counts.map((c) => c.label)).toEqual(['AREA 0401', 'AREA 0601']);
  });
});

describe('a count of a few things', () => {
  it('gathers a tail rather than losing the page to one odd answer', () => {
    // 0, 1, 2, 3, 4 and 9 is six answers, and the page that puts a
    // question against the station type and the areas holds five.
    const b = analyse(form(), q('E.3'));
    expect(b.total.map((c) => c.label)).toEqual(['0', '1', '2', '3', '4 or more']);
    expect(sharesAcross(form(), q('E.3'))).not.toBeNull();
  });

  it('is charted the most first, as a rating is charted the best first', () => {
    const b = analyse(form(), q('E.3'));
    expect(displayCounts(q('E.3'), b).map((c) => c.label)).toEqual([
      '4 or more',
      '3',
      '2',
      '1',
      '0',
    ]);
  });

  it('is coloured along one blue ramp, deepest for the most', () => {
    const scale = chartScale(q('E.3'), analyse(form(), q('E.3')).total)!;
    expect(scale).toEqual(['0', '1', '2', '3', '4 or more']);
    expect(colourFor('4 or more', 0, scale)).toBe(COUNT[4]);
    expect(colourFor('0', 4, scale)).toBe(COUNT[0]);
  });

  it('leaves the rating scale to the questions that are judgements', () => {
    // The second point of a four-point rating is the orange a flagged
    // answer wears; the second of a count is another blue.
    expect(colourFor('Bad', 1, ['Very bad', 'Bad', 'Good', 'Very good'])).toBe(SCALE[1]);
    expect(colourFor('1', 1, ['0', '1', '2', '3', '4 or more'])).toBe(COUNT[1]);
  });
});

describe('the stations behind a follow-up', () => {
  it('is named for a follow-up to a Yes/No question', () => {
    expect(namesStations(form(), q('D.1.1'))).toBe(true);
    expect(namesStations(form(), q('D.1'))).toBe(false);
    expect(namesStations(form(), q('E.3'))).toBe(false);
  });

  it('lists where they were and what they said, the longest first', () => {
    const rows = answeredReports(form(), q('D.1.1'));
    expect(rows.map((r) => `${r.area} ${r.station} ${r.rating}`)).toEqual([
      'Banjul Albion School Between 16-30 minutes',
      'Banjul Half Die Between 1-15 minutes',
      'Kanifing Bakau Lower Between 1-15 minutes',
      'Basse Basse Upper Between 1-15 minutes',
    ]);
    // The form does not ask for a constituency, so the table leaves the
    // column out rather than filling it with blanks.
    expect(rows.every((r) => r.constituency === '')).toBe(true);
  });

  it('heads its last column with the question, not with the whole question', () => {
    expect(answerHead(q('D.1.1'))).toBe('Delay');
  });
});

/**
 * A form whose count runs the other way, and a team type nobody filed
 * from.
 */
const PROBLEM = [
  'A.2 Local Government Area (LGA)',
  'A.1 Team number - LTO',
  'A.1 Team number - FIELD',
  'E.4 How many unauthorised persons are present inside the PS',
];

function problemForm(): ReturnType<typeof buildDataset> {
  const table = toTable([
    PROBLEM,
    ['Banjul', 'LTO 01', '', '0'],
    ['Banjul', 'LTO 01', '', '2'],
    ['Kanifing', 'LTO 02', '', '1'],
    ['Brikama', 'LTO 02', '', '0'],
  ]);
  return buildDataset(table, inferSchema(table));
}

describe('a count of something that should not be there', () => {
  const ds = problemForm();
  const unauthorised = ds.questions.find((x) => x.code === 'E.4')!;

  it('is read as a count where more is worse', () => {
    expect(moreIsWorse(unauthorised)).toBe(true);
    expect(moreIsWorse(q('E.3'))).toBe(false);
  });

  it('opens on none of them, not on the most of them', () => {
    const b = analyse(ds, unauthorised);
    expect(displayCounts(unauthorised, b).map((c) => c.label)).toEqual(['0', '1', '2']);
  });

  it('wears the warm end of the ramp at the end that is bad news', () => {
    const scale = chartScale(unauthorised, analyse(ds, unauthorised).total)!;
    expect(colourFor('2', 0, scale)).toBe(COUNT[0]);
    expect(colourFor('0', 2, scale)).toBe(COUNT[4]);
    // And the other way round where more is what the mission wants.
    const staff = chartScale(q('E.3'), analyse(form(), q('E.3')).total)!;
    expect(colourFor('0', 0, staff)).toBe(COUNT[0]);
    expect(colourFor('4 or more', 4, staff)).toBe(COUNT[4]);
  });

  it('places a count by its value, not by its place in the list', () => {
    // 4 of 5 staff present is four fifths of the way along the ramp,
    // not two thirds of the way through a list of three answers.
    expect(colourFor('4', 1, ['1', '4', '5'])).toBe(COUNT[3]);
  });

  it('keeps a panel for a team type that filed nothing and is not listed', () => {
    // The roster fills in the types it knows; one it does not know and
    // nobody filed from has nothing to draw, and says so.
    const panels = teamReports(ds);
    expect(panels.map((p) => p.label)).toEqual(['LTO', 'FIELD']);
    expect(panels[1]!.counts).toEqual([]);
  });
});

/**
 * The closing form's shape: a Yes/No question followed by a count, and
 * a count with one impossible answer in it.
 */
const CLOSING = [
  'A.2 Local Government Area (LGA)',
  'B.3 Polling station name',
  'D.1 Were there voters queueing at the time of closing?',
  'D.1.1 If Yes, how many approximately?',
  'E.3 How many citizen observers are present',
];

function closingForm(): ReturnType<typeof buildDataset> {
  const table = toTable([
    CLOSING,
    ['Banjul', 'Albion School', 'Yes', '89', '0'],
    ['Banjul', 'Half Die', 'No', '', '1'],
    ['Kanifing', 'Bakau Lower', 'Yes', '34', '2'],
    ['Kanifing', 'Serrekunda West', 'No', '', '3'],
    ['Brikama', 'Busumbala', 'Yes', '57', '4'],
    ['Brikama', 'Kansala', 'No', '', '5'],
    ['Brikama', 'Sanyang', 'Yes', '15', '678'],
    ['Basse', 'Basse Lower', 'No', '', '2'],
  ]);
  return buildDataset(table, inferSchema(table));
}

const cq = (code: string) => closingForm().questions.find((x) => x.code === code)!;

describe('a count asked only of the stations where something happened', () => {
  it('is named rather than charted', () => {
    // 89, 34, 57 and 15 on four reports is four bands of one, drawn as
    // four equal quarters of a column: it says only that four different
    // numbers were written down.
    expect(namesStationsOnly(closingForm(), cq('D.1.1'))).toBe(true);
    expect(sharesAcross(closingForm(), cq('D.1.1'))).toBeNull();
  });

  it('lists the longest queue first, with the station standing in it', () => {
    const rows = answeredReports(closingForm(), cq('D.1.1'));
    expect(rows.map((r) => `${r.station} ${r.rating}`)).toEqual([
      'Albion School 89',
      'Busumbala 57',
      'Bakau Lower 34',
      'Sanyang 15',
    ]);
  });

  it('heads the column with what it counts off', () => {
    expect(answerHead(cq('D.1.1'))).toBe('How many');
  });

  it('leaves a follow-up answered in words its chart as well', () => {
    expect(namesStationsOnly(form(), q('D.1.1'))).toBe(false);
    expect(sharesAcross(form(), q('D.1.1'))).not.toBeNull();
  });
});

describe('a count with one impossible answer in it', () => {
  it('gathers the tail rather than losing the page to the outlier', () => {
    // One station reported 678 citizen observers. Testing the largest
    // answer left the question with seven bands and no page at all;
    // what has to be small is the band the tail starts at.
    const b = analyse(closingForm(), cq('E.3'));
    expect(b.total.map((c) => c.label)).toEqual(['0', '1', '2', '3', '4 or more']);
    expect(sharesAcross(closingForm(), cq('E.3'))).not.toBeNull();
  });

  it('shades by position where the values are too far apart to place', () => {
    // Against a range of 678 every other answer sits at the same end of
    // the ramp, in the same colour.
    const wide = ['0', '1', '2', '678'];
    expect(new Set(wide.map((l) => colourFor(l, 0, wide))).size).toBe(4);
  });
});

describe('a form whose headers lost something', () => {
  it('reads a code the questionnaire typed with a space', () => {
    // The collation form heads one question "E 3.1 If Yes, did you
    // observe any discrepancy". Read strictly that is no code at all:
    // the question lost its section, its place after E.3 and the
    // question it follows up.
    expect(parseCode('E 3.1 If Yes, did you observe any discrepancy?')).toEqual({
      code: 'E.3.1',
      label: 'If Yes, did you observe any discrepancy?',
      section: 'E',
    });
  });

  it('names a team column whose type the export left off', () => {
    // "A.1 Team number" with the "- CT" of every other form missing,
    // where CT is the one type on the roster nothing else accounts
    // for, is the contact teams' column.
    const table = toTable([
      [
        'A.2 Local Government Area (LGA)',
        'A.1 Team number - LTO',
        'A.1 Team number - STO',
        'A.1 Team number - LSTO',
        'A.1 Team number - MEP',
        'A.1 Team number',
      ],
      ['Banjul', 'LTO 01', '', '', '', ''],
      ['Kanifing', 'LTO 02', 'STO 0101', '', '', ''],
    ]);
    const ds = buildDataset(table, inferSchema(table));
    expect(teamColumns(ds).map((c) => c.label)).toEqual(['LTO', 'STO', 'LSTO', 'MEP', 'CT']);
  });

  it('drops an unnamed team column it cannot place and nobody filed', () => {
    // Two types unaccounted for is not a deduction, and a panel headed
    // "Team number" saying "No reports" is neither a kind of team nor
    // a gap in the deployment.
    const table = toTable([
      ['A.2 Local Government Area (LGA)', 'A.1 Team number - LTO', 'A.1 Team number'],
      ['Banjul', 'LTO 01', ''],
      ['Kanifing', 'LTO 02', ''],
    ]);
    const ds = buildDataset(table, inferSchema(table));
    expect(teamColumns(ds).map((c) => c.label)).toEqual(['LTO']);
  });

  it('keeps an unnamed team column that somebody filed', () => {
    const table = toTable([
      ['A.2 Local Government Area (LGA)', 'A.1 Team number - LTO', 'A.1 Team number'],
      ['Banjul', 'LTO 01', 'Roving 2'],
      ['Kanifing', 'LTO 02', ''],
    ]);
    const ds = buildDataset(table, inferSchema(table));
    expect(teamColumns(ds)).toHaveLength(2);
  });
});

/** A section of thirteen questions asked the same way. */
const STEPS = [
  'A.2 Local Government Area (LGA)',
  ...Array.from({ length: 13 }, (_, i) => `D.${i + 1} Was step ${i + 1} carried out?`),
];

describe('a section that runs to two pages', () => {
  it('fills them evenly, rather than leaving the last question alone', () => {
    const table = toTable([
      STEPS,
      ['Banjul', ...Array.from({ length: 13 }, () => 'Yes')],
      ['Kanifing', ...Array.from({ length: 13 }, (_, i) => (i % 2 === 0 ? 'Yes' : 'No'))],
      ['Brikama', ...Array.from({ length: 13 }, () => 'No')],
    ]);
    const ds = buildDataset(table, inferSchema(table));
    const pages = sectionOverviews(ds, ds.questions);
    expect(pages.map((p) => p.rows.length)).toEqual([7, 6]);
    expect(pages[1]!.rows[pages[1]!.rows.length - 1]!.question.code).toBe('D.13');
  });
});
