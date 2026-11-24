/**
 * Gambian electoral geography.
 *
 * The country has eight Local Government Areas and 53 constituencies. The
 * IEC reports presidential results across seven tabulation areas, combining
 * Kuntaur and Janjanbureh into "Central River", which is why an earlier
 * version of this file had seven. Eight is correct for anything an observer
 * will be reporting against, so the LGA is the unit used here and the
 * Central River electorate has been split back out from the IEC's own
 * constituency table.
 *
 * Registered-voter figures are the 2026 register, totalled from the IEC's
 * "Total Number of Registered Voters Per Polling Station 2026". They are
 * held per constituency and summed per LGA, so there is one number to
 * check rather than two; they come to 1,119,143 nationally. The same
 * document is where this file's constituency list is checked against: all
 * 53 names below appear in it, under the IEC's seven reporting regions,
 * with Central River split back into Kuntaur and Janjanbureh here.
 *
 * Boundaries are real, from geoBoundaries gbOpen, in `../data/boundaries`.
 */

import { LGA_BOUNDARIES, type BoundaryShape } from '@/data/boundaries';

export type LgaCode = 'BJL' | 'KMC' | 'BRI' | 'KER' | 'MAN' | 'KUN' | 'JAN' | 'BAS';

export interface Lga {
  code: LgaCode;
  /**
   * How the LGA is named in this mission's reporting: its administrative
   * capital, which is what observers write on the form and what the EOM
   * uses in its own documents. Brikama rather than West Coast, Kerewan
   * rather than North Bank. The regional name is kept as the alias, so a
   * file using it still resolves.
   */
  name: string;
  /** Name in the boundary file, where it differs. */
  boundaryName: string;
  /** Alternative name people use for the same place. */
  alias?: string;
  constituencies: string[];
}

export const LGAS: Lga[] = [
  {
    code: 'BJL',
    name: 'Banjul',
    boundaryName: 'Banjul',
    constituencies: ['Banjul North', 'Banjul Central', 'Banjul South'],
  },
  {
    code: 'KMC',
    name: 'Kanifing',
    boundaryName: 'Kanifing',
    constituencies: [
      'Bakau',
      'Jeshwang',
      'Serekunda',
      'Serekunda West',
      'Bundungka Kunda',
      'Latrikunda Sabiji',
      'Tallinding Kunjang',
    ],
  },
  {
    code: 'BRI',
    name: 'Brikama',
    boundaryName: 'Brikama',
    alias: 'West Coast',
    constituencies: [
      'Sanneh Mentereng',
      'Old Yundum',
      'Busumbala',
      'Kombo South',
      'Kombo East',
      'Brikama North',
      'Brikama South',
      'Foni Brefet',
      'Foni Bintang',
      'Foni Kansala',
      'Foni Bondali',
      'Foni Jarrol',
    ],
  },
  {
    code: 'KER',
    name: 'Kerewan',
    boundaryName: 'Kerewan',
    alias: 'North Bank',
    constituencies: [
      'Lower Nuimi',
      'Upper Nuimi',
      'Jokadou',
      'Lower Baddibu',
      'Central Baddibu',
      'Illiassa',
      'Sabach Sanjal',
    ],
  },
  {
    code: 'MAN',
    name: 'Mansa Konko',
    boundaryName: 'Mansakonko',
    alias: 'Lower River',
    constituencies: [
      'Jarra West',
      'Jarra Central',
      'Jarra East',
      'Kiang West',
      'Kiang Central',
      'Kiang East',
    ],
  },
  {
    code: 'KUN',
    name: 'Kuntaur',
    boundaryName: 'Kuntaur',
    // Central River West in the IEC's own table; both resolve.
    alias: 'Central River North',
    constituencies: ['Lower Saloum', 'Upper Saloum', 'Nianija', 'Niani', 'Sami'],
  },
  {
    code: 'JAN',
    name: 'Janjanbureh',
    boundaryName: 'Janjanbureh',
    alias: 'Central River South',
    constituencies: [
      'Niamina Dankunku',
      'Niamina West',
      'Niamina East',
      'Lower Fulladu West',
      'Upper Fulladu West',
      'Janjanbureh',
    ],
  },
  {
    code: 'BAS',
    name: 'Basse',
    boundaryName: 'Basse',
    alias: 'Upper River',
    constituencies: [
      'Jimara',
      'Basse',
      'Tumana',
      'Kantora',
      'Sandu',
      'Wulli West',
      'Wulli East',
    ],
  },
];

/**
 * Registered voters per constituency, 2026.
 *
 * From the IEC's published polling-station register, summed over every
 * stream of every station in the constituency. It is the only place a
 * voter figure is written: an LGA's electorate is the sum of its
 * constituencies, so the two can never drift apart.
 */
export const REGISTERED_2026: Record<string, number> = Object.fromEntries([
  ['Banjul North', 7_986],
  ['Banjul Central', 9_673],
  ['Banjul South', 7_161],
  ['Bakau', 16_549],
  ['Jeshwang', 31_040],
  ['Serekunda', 15_444],
  ['Serekunda West', 51_522],
  ['Bundungka Kunda', 28_506],
  ['Latrikunda Sabiji', 39_243],
  ['Tallinding Kunjang', 25_102],
  ['Sanneh Mentereng', 57_604],
  ['Old Yundum', 60_985],
  ['Busumbala', 61_114],
  ['Kombo South', 72_986],
  ['Kombo East', 31_917],
  ['Brikama North', 40_636],
  ['Brikama South', 41_500],
  ['Foni Brefet', 10_887],
  ['Foni Bintang', 12_366],
  ['Foni Kansala', 10_806],
  ['Foni Bondali', 5_735],
  ['Foni Jarrol', 6_184],
  ['Lower Nuimi', 31_925],
  ['Upper Nuimi', 19_318],
  ['Jokadou', 13_144],
  ['Lower Baddibu', 10_931],
  ['Central Baddibu', 11_533],
  ['Illiassa', 25_124],
  ['Sabach Sanjal', 15_206],
  ['Jarra West', 18_574],
  ['Jarra Central', 7_016],
  ['Jarra East', 12_841],
  ['Kiang West', 12_533],
  ['Kiang Central', 8_450],
  ['Kiang East', 6_528],
  ['Lower Saloum', 10_342],
  ['Upper Saloum', 12_041],
  ['Nianija', 6_239],
  ['Niani', 16_835],
  ['Sami', 16_484],
  ['Niamina Dankunku', 4_302],
  ['Niamina West', 5_797],
  ['Niamina East', 14_858],
  ['Lower Fulladu West', 24_355],
  ['Upper Fulladu West', 27_795],
  ['Janjanbureh', 1_851],
  ['Jimara', 28_167],
  ['Basse', 27_483],
  ['Tumana', 19_693],
  ['Kantora', 21_437],
  ['Sandu', 15_641],
  ['Wulli West', 13_208],
  ['Wulli East', 14_546],
]);

export const ALL_CONSTITUENCIES: string[] = LGAS.flatMap((a) => a.constituencies);

/** The 2026 register of one LGA: the sum of its constituencies. */
export function registeredOf(code: LgaCode): number {
  const a = LGAS.find((x) => x.code === code);
  if (!a) return 0;
  return a.constituencies.reduce((n, c) => n + (REGISTERED_2026[c] ?? 0), 0);
}

export const TOTAL_REGISTERED_2026 = ALL_CONSTITUENCIES.reduce(
  (n, c) => n + (REGISTERED_2026[c] ?? 0),
  0,
);

/* ------------------------------------------------------------------ */
/* Name matching                                                       */
/* ------------------------------------------------------------------ */

function key(s: string): string {
  return s
    .toLowerCase()
    // Gambian place names are spelled several ways in official documents:
    // Niumi/Nuimi, Baddibu/Badibu, Fulladu/Fuladu, Wuli/Wulli, Illiasa/
    // Illiassa, Sanjal/Sanjar. Fold them so an observer's spelling does not
    // silently drop their report.
    .replace(/niumi|nuimi/g, 'numi')
    .replace(/baddibu|badibu/g, 'badibu')
    .replace(/fulladu|fuladu/g, 'fuladu')
    .replace(/wulli|wuli/g, 'wuli')
    .replace(/serrekunda|serekunda/g, 'serekunda')
    .replace(/illiassa|illiasa/g, 'iliasa')
    .replace(/sanjal|sanjar/g, 'sanja')
    .replace(/mentereng|menterreng/g, 'menterng')
    .replace(/karanai|karenai/g, 'karanai')
    .replace(/[^a-z0-9]/g, '');
}

const lgaLookup = new Map<string, LgaCode>();
for (const a of LGAS) {
  for (const n of [a.code, a.name, a.boundaryName, a.alias].filter(Boolean) as string[]) {
    lgaLookup.set(key(n), a.code);
  }
  for (const c of a.constituencies) lgaLookup.set(key(c), a.code);
}
// The IEC's seven-area reporting name, so older files still resolve.
lgaLookup.set(key('Central River'), 'JAN');

export function resolveLga(raw: string): LgaCode | null {
  const k = key(raw);
  if (!k) return null;
  const hit = lgaLookup.get(k);
  if (hit) return hit;
  // A prefix, but only when every name it could be is in the same area.
  // "Brikama" starts both Brikama North and Brikama South and they are
  // both in Brikama, so it resolves; a prefix that straddles two areas
  // does not.
  const codes = new Set<LgaCode>();
  for (const [candidate, code] of lgaLookup) {
    if (candidate.length >= 4 && (k.startsWith(candidate) || candidate.startsWith(k))) {
      codes.add(code);
    }
  }
  return codes.size === 1 ? [...codes][0]! : null;
}

export function lgaName(code: LgaCode): string {
  return LGAS.find((a) => a.code === code)?.name ?? code;
}

const constituencyLookup = new Map<string, { name: string; lga: LgaCode }>();
for (const a of LGAS) {
  for (const c of a.constituencies) constituencyLookup.set(key(c), { name: c, lga: a.code });
}

/**
 * Levenshtein distance, abandoned as soon as it passes `max`.
 *
 * Only ever asked whether two names are a letter or two apart, so the
 * whole matrix is never worth computing.
 */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
      row.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length]!;
}

/**
 * The constituency an observer's entry names, or null.
 *
 * Three ways in, each narrower than it looks.
 *
 * The name itself, spelling folded. Then a prefix, but only where it
 * points at exactly one constituency: "Latrikunda" can only be Latrikunda
 * Sabiji, while "Brikama" is the start of both Brikama North and Brikama
 * South, so it names the area rather than a constituency and used to be
 * filed under whichever of the two the lookup reached first - a report
 * placed in a constituency nobody reported from. Then a near miss, for
 * the spellings observers actually write: Kantoro for Kantora, Foni Jarol
 * for Foni Jarrol. One letter, or two in a long name, and only when
 * exactly one constituency is that close.
 *
 * What is left over is left over. "Westfield" is a neighbourhood, "URR" is
 * a region and "Kanifing" is an area: none of them is a constituency, and
 * the honest answer is to say so rather than to pick the nearest.
 */
export function resolveConstituency(raw: string): { name: string; lga: LgaCode } | null {
  const k = key(raw);
  if (k.length < 4) return null;
  const hit = constituencyLookup.get(k);
  if (hit) return hit;

  const prefixes = [...constituencyLookup].filter(
    ([c]) => c.length >= 5 && (k.startsWith(c) || c.startsWith(k)),
  );
  if (prefixes.length > 0) return prefixes.length === 1 ? prefixes[0]![1] : null;

  if (k.length < 5) return null;
  const max = k.length >= 12 ? 2 : 1;
  const near = [...constituencyLookup].filter(([c]) => distance(k, c, max) <= max);
  return near.length === 1 ? near[0]![1] : null;
}

/* ------------------------------------------------------------------ */
/* Boundaries                                                          */
/* ------------------------------------------------------------------ */

/** LGA boundaries, keyed by the name this app uses rather than the file's. */
export const LGA_SHAPES: { key: string; shape: BoundaryShape }[] = LGAS.map((a) => {
  const shape = LGA_BOUNDARIES.find((b) => key(b.name) === key(a.boundaryName));
  if (!shape) throw new Error(`No boundary for LGA ${a.name}`);
  return { key: a.name, shape };
});

