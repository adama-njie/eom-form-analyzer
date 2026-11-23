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
 * Registered-voter figures are the 2021 presidential register, from the
 * IEC's published constituency results. They sum to the official national
 * total of 962,157.
 *
 * Boundaries are real, from geoBoundaries gbOpen, in `../data/boundaries`.
 */

import { DISTRICT_BOUNDARIES, LGA_BOUNDARIES, type BoundaryShape } from '@/data/boundaries';

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
  registered2021: number;
  constituencies: string[];
}

export const LGAS: Lga[] = [
  {
    code: 'BJL',
    name: 'Banjul',
    boundaryName: 'Banjul',
    registered2021: 21_372,
    constituencies: ['Banjul North', 'Banjul Central', 'Banjul South'],
  },
  {
    code: 'KMC',
    name: 'Kanifing',
    boundaryName: 'Kanifing',
    registered2021: 179_800,
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
    registered2021: 359_451,
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
    registered2021: 109_262,
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
    registered2021: 54_456,
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
    registered2021: 50_864,
    constituencies: ['Lower Saloum', 'Upper Saloum', 'Nianija', 'Niani', 'Sami'],
  },
  {
    code: 'JAN',
    name: 'Janjanbureh',
    boundaryName: 'Janjanbureh',
    alias: 'Central River South',
    registered2021: 68_742,
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
    registered2021: 118_210,
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

export const TOTAL_REGISTERED_2021 = LGAS.reduce((s, a) => s + a.registered2021, 0);

export const ALL_CONSTITUENCIES: string[] = LGAS.flatMap((a) => a.constituencies);

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
  for (const [candidate, code] of lgaLookup) {
    if (candidate.length >= 4 && (k.startsWith(candidate) || candidate.startsWith(k))) return code;
  }
  return null;
}

export function lgaName(code: LgaCode): string {
  return LGAS.find((a) => a.code === code)?.name ?? code;
}

const constituencyLookup = new Map<string, { name: string; lga: LgaCode }>();
for (const a of LGAS) {
  for (const c of a.constituencies) constituencyLookup.set(key(c), { name: c, lga: a.code });
}

export function resolveConstituency(raw: string): { name: string; lga: LgaCode } | null {
  const k = key(raw);
  if (!k) return null;
  const hit = constituencyLookup.get(k);
  if (hit) return hit;
  for (const [candidate, value] of constituencyLookup) {
    if (candidate.length >= 5 && (k.startsWith(candidate) || candidate.startsWith(k))) return value;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Boundaries                                                          */
/* ------------------------------------------------------------------ */

export type MapUnit = 'lga' | 'district';

/** LGA boundaries, keyed by the name this app uses rather than the file's. */
export const LGA_SHAPES: { key: string; shape: BoundaryShape }[] = LGAS.map((a) => {
  const shape = LGA_BOUNDARIES.find((b) => key(b.name) === key(a.boundaryName));
  if (!shape) throw new Error(`No boundary for LGA ${a.name}`);
  return { key: a.name, shape };
});

export const DISTRICT_SHAPES: { key: string; shape: BoundaryShape }[] = DISTRICT_BOUNDARIES.map(
  (shape) => ({ key: shape.name, shape }),
);

/**
 * Which district a constituency sits in.
 *
 * The 53 constituencies and the 48 districts are different divisions: the
 * urban ones in Kanifing and the Kombos were split into more constituencies
 * than there are districts. Where a constituency matches a district by name
 * it is mapped; the rest are listed by `unmappedConstituencies` so the
 * interface can say which reports a district map leaves out, rather than
 * dropping them without a word.
 */
const districtKeys = new Map(DISTRICT_BOUNDARIES.map((d) => [key(d.name), d.name]));

export const CONSTITUENCY_TO_DISTRICT: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const c of ALL_CONSTITUENCIES) {
    const direct = districtKeys.get(key(c));
    if (direct) out[c] = direct;
  }
  return out;
})();

export const UNMAPPED_CONSTITUENCIES: string[] = ALL_CONSTITUENCIES.filter(
  (c) => !(c in CONSTITUENCY_TO_DISTRICT),
);

/** Which LGA a district belongs to, so districts can be grouped and coloured. */
export const DISTRICT_TO_LGA: Record<string, LgaCode> = (() => {
  const out: Record<string, LgaCode> = {};
  for (const d of DISTRICT_BOUNDARIES) {
    const viaConstituency = resolveConstituency(d.name);
    if (viaConstituency) {
      out[d.name] = viaConstituency.lga;
      continue;
    }
    const viaLga = resolveLga(d.name);
    if (viaLga) out[d.name] = viaLga;
  }
  return out;
})();
