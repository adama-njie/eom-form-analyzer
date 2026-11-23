import { describe, expect, it } from 'vitest';
import { isList, isProse, wordFrequencies } from './text';

describe('telling prose from identifiers', () => {
  it('rejects a column of place names', () => {
    expect(isProse(['Bakau', 'Banjul Central', 'Sandu', 'Jarra West'])).toBe(false);
  });

  it('rejects a column of codes and dates', () => {
    expect(isProse(['BJL040', 'URR056', 'KMC012', 'NBR003'])).toBe(false);
    expect(isProse(['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'])).toBe(false);
  });

  it('accepts a column of written answers', () => {
    expect(
      isProse([
        'The road going to Banjul, by demban clinic',
        'Support for the candidate and his development record',
        'A big convoy of cars and supporters going to the nomination',
      ]),
    ).toBe(true);
  });

  it('will not build a cloud from one or two answers', () => {
    expect(isProse(['a fairly long written answer here', 'another long written answer'])).toBe(
      false,
    );
  });
});

describe('counting words', () => {
  it('ranks by frequency', () => {
    const w = wordFrequencies(['roads roads roads clinic clinic school']);
    expect(w.map((x) => x.word)).toEqual(['roads', 'clinic', 'school']);
    expect(w[0]!.n).toBe(3);
  });

  it('drops function words and the form’s own vocabulary', () => {
    const w = wordFrequencies(['the event was at the polling station and it was calm']);
    expect(w.map((x) => x.word)).toEqual(['calm']);
  });

  it('folds case but keeps the commonest spelling', () => {
    const w = wordFrequencies(['Sanneh spoke', 'Sanneh arrived', 'sanneh left']);
    expect(w[0]).toEqual({ word: 'Sanneh', n: 3 });
  });

  it('ignores one and two letter tokens and bare numbers', () => {
    const w = wordFrequencies(['500000 dalasi to be shared by 20 of us']);
    expect(w.map((x) => x.word)).toEqual(['dalasi', 'shared']);
  });

  it('keeps the list to the limit asked for', () => {
    const many = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ');
    expect(wordFrequencies([many], 25)).toHaveLength(25);
  });
});

describe('keeping phrases whole', () => {
  /** As observers answered "which security forces were present?". */
  const FORCES = [
    'Police Intervention Unit, Army',
    'police officers and the Police Intervention Unit',
    'Police Intervention Unit',
    'police, Army, Police Intervention Unit',
    'police officers',
  ];

  it('keeps a recurring three-word name together', () => {
    const w = wordFrequencies(FORCES);
    const labels = w.map((x) => x.word);
    expect(labels).toContain('Police Intervention Unit');
    expect(labels).not.toContain('Intervention');
    expect(labels).not.toContain('Unit');
  });

  it('does not consume the other mentions of its words', () => {
    const w = wordFrequencies(FORCES);
    const byWord = Object.fromEntries(w.map((x) => [x.word, x.n]));
    expect(byWord['Police Intervention Unit']).toBe(4);
    // "police" is used on its own twice more, plus "police officers".
    expect(w.some((x) => /^police/i.test(x.word) && x.word !== 'Police Intervention Unit')).toBe(
      true,
    );
  });

  it('keeps a two-word outlet name together', () => {
    const w = wordFrequencies(['Kerr Fatou, GRTS', 'GRTS and Kerr Fatou', 'Kerr Fatou']);
    expect(w.map((x) => x.word)).toContain('Kerr Fatou');
    expect(w.find((x) => x.word === 'Kerr Fatou')!.n).toBe(3);
  });

  it('will not join words across a comma', () => {
    const w = wordFrequencies(['Army, police', 'Army, police', 'Army, police']);
    expect(w.map((x) => x.word).sort()).toEqual(['Army', 'Police']);
  });

  it('will not join words across a comma in the middle of prose either', () => {
    const words = wordFrequencies([
      'The candidate raised water, roads were promised to the community as well',
      'Water was the concern most often raised at the meeting by the elders',
      'He promised water to the village, roads came up only at the end',
    ]).map((x) => x.word.toLowerCase());
    expect(words).not.toContain('water roads');
    expect(words).toContain('water');
  });
});

describe('lists of named things', () => {
  /** As observers answered "if yes, please specify outlet:". */
  const OUTLETS = [
    'StarTV, Paradise Kombo, QTV',
    'GRTS',
    'GRTS, small online media outlets',
    'Television&digital:GRTS,QTV, Kerr Fatou, / Print&Online: the standard newspaper',
    'Television & Digital: GRTS, QTV, Kerr Fatou, Gambia Talents TV',
    'Forayaa + own media',
    'GRTS, Bessel TV, The Standard Newspaper',
    'GRTS, Star radio, Coastal TV and others',
  ];

  it('recognises a column of lists', () => {
    expect(isList(OUTLETS)).toBe(true);
  });

  it('counts each named outlet once per report, whole', () => {
    const w = wordFrequencies(OUTLETS);
    const n = Object.fromEntries(w.map((x) => [x.word, x.n]));
    expect(n['GRTS']).toBe(6);
    expect(n['QTV']).toBe(3);
    expect(n['Kerr Fatou']).toBe(2);
    expect(n['Standard Newspaper']).toBe(2);
    // Never the pieces of a name.
    expect(w.map((x) => x.word)).not.toContain('Kerr');
    expect(w.map((x) => x.word)).not.toContain('Fatou');
  });

  it('splits on a slash, an ampersand and a plus as well as a comma', () => {
    const w = wordFrequencies(OUTLETS);
    const labels = w.map((x) => x.word);
    expect(labels).toContain('Forayaa');
    expect(labels).toContain('Own media');
    expect(labels).toContain('Gambia Talents TV');
  });

  it('drops a heading the observer wrote in front of the list', () => {
    const labels = wordFrequencies(OUTLETS).map((x) => x.word);
    expect(labels).not.toContain('Television');
    expect(labels).not.toContain('Print');
    expect(labels).not.toContain('Digital');
  });

  it('reads a count in front of a thing as the same thing', () => {
    const w = wordFrequencies([
      '8 police officers and 6 private guards',
      '33 police officers, 15 private security men',
      'more than 10 police officers and 6 private guards',
      '25 police officers',
    ]);
    const n = Object.fromEntries(w.map((x) => [x.word, x.n]));
    expect(n['Police officers']).toBe(4);
    expect(n['Private guards']).toBe(2);
  });

  it('leaves two spellings of a name apart', () => {
    // Merging them would invent a figure that no form supports.
    const labels = wordFrequencies(OUTLETS).map((x) => x.word);
    expect(labels).toContain('Forayaa');
    expect(labels.some((l) => /^Foroyaa$/i.test(l))).toBe(false);
  });

  it('does not take prose for a list just because it has commas', () => {
    const prose = [
      'Speakers set out the programme for the coming term, citing the cost of living, the state of the roads and the shortage of medicines',
      'The candidate addressed the women in the crowd, saying that this is the time for women to lead, and called for their support',
      'All speakers stressed the development brought to the region, and the candidate promised to continue it if elected',
    ];
    expect(isList(prose)).toBe(false);
    const words = wordFrequencies(prose).map((x) => x.word.toLowerCase());
    expect(words).toContain('speakers');
  });

  it('will not join words across a function word', () => {
    const w = wordFrequencies([
      'arrival in Basse',
      'arrival in Basse',
      'arrival in Basse',
    ]);
    expect(w.map((x) => x.word).sort()).toEqual(['Basse', 'arrival']);
  });

  it('leaves an incidental pairing of two common words apart', () => {
    // "candidate" and "speakers" are each common; they happen to adjoin once.
    const w = wordFrequencies([
      'candidate speakers',
      'candidate spoke about roads',
      'candidate spoke about health',
      'speakers raised water',
      'speakers raised jobs',
      'the candidate and the speakers',
    ]);
    expect(w.map((x) => x.word)).not.toContain('candidate speakers');
    expect(w.map((x) => x.word)).toContain('candidate');
  });

  it('still reduces a one-off sentence to its words', () => {
    // The phrase occurs once, so nothing is kept whole, which is right: a
    // word cloud of one sentence is that sentence's words.
    const w = wordFrequencies([
      'This meeting was a press event marking the candidate arrival in the region.',
    ]);
    expect(w.every((x) => !x.word.includes(' '))).toBe(true);
    expect(w.map((x) => x.word)).toContain('meeting');
  });
});
