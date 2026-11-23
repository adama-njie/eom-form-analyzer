import { describe, expect, it } from 'vitest';
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
