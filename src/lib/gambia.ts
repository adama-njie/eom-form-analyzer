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

import { DISTRICT_BOUNDARIES, LGA_BOUNDARIES, type BoundaryShape } from '@/data/boundaries';
import { boxOf } from './projection';

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
    .replace(/jokadou|jokadu/g, 'jokadu')
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

/* ------------------------------------------------------------------ */
/* Which division of the country a form uses                           */
/* ------------------------------------------------------------------ */

/**
 * The two divisions the mission's forms report against.
 *
 * The campaign form asks for the Local Government Area and offers all
 * eight. The polling-day forms - opening, voting, closing, counting - ask
 * for the region and offer seven, because the IEC treats Kuntaur and
 * Janjanbureh as one Central River region and names it after its
 * administrative capital, Janjanbureh.
 *
 * Which one a file uses is read from the file itself, in `divisionOf`. It
 * cannot be read from the name: both divisions call that place
 * Janjanbureh, and in one it is half of Central River and in the other it
 * is all of it.
 */
export type Division = 'lga' | 'region';

/** The LGAs the IEC reports together as Central River. */
export const CENTRAL_RIVER: LgaCode[] = ['KUN', 'JAN'];
/** The one of them that names the region. */
export const CENTRAL_RIVER_UNIT: LgaCode = 'JAN';

/**
 * One area as a given form counts them: an LGA, or a region made of two.
 *
 * Everything that groups, counts, shades or divides by area goes through
 * this list, so a file that reports seven areas is never counted against
 * eight. Central River's electorate and its constituencies are the two
 * LGAs' put together, which is what makes the coverage figures add up.
 */
export interface AreaUnit {
  /** The LGA code this unit is keyed by; Central River is keyed by JAN. */
  code: LgaCode;
  /** What the form calls it, and what every chart and table prints. */
  name: string;
  /**
   * What the map prints, which is longer where the unit covers two LGAs: a
   * shape twice the size of the Janjanbureh on a campaign map needs to say
   * so on the map itself, not in the deck that happens to hold it.
   */
  mapLabel: string;
  /** The LGAs inside it. One, except for Central River. */
  lgas: LgaCode[];
  constituencies: string[];
  registered: number;
}

function unitOf(lgas: LgaCode[], name: string, mapLabel: string): AreaUnit {
  const members = lgas.map((c) => LGAS.find((a) => a.code === c)!);
  const constituencies = members.flatMap((a) => a.constituencies);
  return {
    code: lgas[lgas.length - 1]!,
    name,
    mapLabel,
    lgas,
    constituencies,
    registered: constituencies.reduce((n, c) => n + (REGISTERED_2026[c] ?? 0), 0),
  };
}

/** The areas of the country as one division counts them, west to east. */
export function areaUnits(division: Division): AreaUnit[] {
  if (division === 'lga') {
    return LGAS.map((a) => unitOf([a.code], a.name, a.name));
  }
  const out: AreaUnit[] = [];
  for (const a of LGAS) {
    if (a.code === 'KUN') continue; // folded into the unit below
    if (a.code === CENTRAL_RIVER_UNIT) {
      out.push(unitOf(CENTRAL_RIVER, a.name, `${a.name} (Central River)`));
    } else {
      out.push(unitOf([a.code], a.name, a.name));
    }
  }
  return out;
}

/**
 * The unit an LGA belongs to under a division.
 *
 * A report filed from Kuntaur in a seven-region file does not exist - the
 * form offers no such answer - but a report whose constituency resolves to
 * Kuntaur does, so the fold has to happen on the way in rather than at the
 * chart.
 */
export function unitCodeFor(code: LgaCode, division: Division): LgaCode {
  return division === 'region' && CENTRAL_RIVER.includes(code) ? CENTRAL_RIVER_UNIT : code;
}

/** What to call an area, in the words the file's own division uses. */
export interface AreaWords {
  /** "Local Government Area" or "region". */
  one: string;
  /** "Local Government Areas" or "regions". */
  many: string;
  /** A tile's caption: "LGAs" or "Regions". */
  tile: string;
  /** A table's column heading: "Area" or "Region". */
  heading: string;
}

export const AREA_WORDS: Record<Division, AreaWords> = {
  lga: {
    one: 'Local Government Area',
    many: 'Local Government Areas',
    tile: 'LGAs',
    heading: 'Area',
  },
  region: { one: 'region', many: 'regions', tile: 'Regions', heading: 'Region' },
};

/**
 * The shapes to draw for a division, keyed by the name charts use.
 *
 * In region mode Central River is one shape made of both its LGAs' rings,
 * so the region gets one fill, one figure and one label across the pair.
 * The hairline still visible between them is the Gambia river, which is
 * where their boundary runs and where the river belongs anyway.
 */
export function areaShapes(
  division: Division,
): { key: string; label: string; shape: BoundaryShape }[] {
  return areaUnits(division).map((unit) => {
    const parts = unit.lgas.map((code) => {
      const a = LGAS.find((x) => x.code === code)!;
      const shape = LGA_BOUNDARIES.find((b) => key(b.name) === key(a.boundaryName));
      if (!shape) throw new Error(`No boundary for LGA ${a.name}`);
      return shape;
    });
    return {
      key: unit.name,
      label: unit.mapLabel,
      shape: { name: unit.name, rings: parts.flatMap((p) => p.rings) },
    };
  });
}

/** LGA boundaries, keyed by the name this app uses rather than the file's. */
export const LGA_SHAPES: { key: string; shape: BoundaryShape }[] = LGAS.map((a) => {
  const shape = LGA_BOUNDARIES.find((b) => key(b.name) === key(a.boundaryName));
  if (!shape) throw new Error(`No boundary for LGA ${a.name}`);
  return { key: a.name, shape };
});


/* ------------------------------------------------------------------ */
/* The deployment                                                      */
/* ------------------------------------------------------------------ */

/**
 * Every team the mission deployed, by the type the form asks for.
 *
 * This is the mission's own figure, as the register is the IEC's, and
 * it is the only place it is written. The teams page is read during a
 * deployment to see who has not filed yet, and that question cannot be
 * answered from the reports alone: a team that has sent nothing in is
 * absent from the file by definition. Inferring the range from the
 * numbers that did file got LTO right - 01 to 08 with two gaps - and
 * could not get STO right at all, because "STO 0401" is a region and a
 * team rather than team four hundred and one.
 *
 * The listed teams are shown whether or not they filed. A team that
 * filed and is not listed here is still shown, after them, because a
 * roster that silently swallowed a report would be worse than one that
 * is out of date; if that happens, this list is what needs correcting.
 */
export const DEPLOYMENT: Record<string, readonly string[]> = {
  LTO: ['LTO 01', 'LTO 02', 'LTO 03', 'LTO 04', 'LTO 05', 'LTO 06', 'LTO 07', 'LTO 08'],
  STO: [
    'STO 0101',
    'STO 0201',
    'STO 0301',
    'STO 0401',
    'STO 0402',
    'STO 0501',
    'STO 0601',
    'STO 0701',
    'STO 0702',
    'STO 0801',
  ],
  LSTO: ['LSTO 01', 'LSTO 02', 'LSTO 03', 'LSTO 04', 'LSTO 05', 'LSTO 06'],
  MEP: ['MEP 1', 'MEP 2', 'MEP 3'],
  CT: ['CT 1', 'CT 2', 'CT 3', 'CO'],
};

/** How a team name is compared, so "lto01" and "LTO 01" are one team. */
export function teamKey(name: string): string {
  return name.replace(/\s+/g, '').toUpperCase();
}

/** The teams deployed as this type, or null where the mission lists none. */
export function deployedTeams(type: string): readonly string[] | null {
  return DEPLOYMENT[teamKey(type)] ?? null;
}

/* ------------------------------------------------------------------ */
/* Constituencies on the map                                           */
/* ------------------------------------------------------------------ */

/**
 * Where a constituency's shape is filed under a longer name.
 *
 * `key` already folds the spellings the two sources differ on -
 * Niumi/Nuimi, Baddibu/Badibu, Fulladu/Fuladu, Wulli/Wuli,
 * Illiassa/Illiasa, Sanjal/Sanjar, Jokadou/Jokadu - which is most of
 * them. This is for the one that differs by a whole word.
 */
const CONSTITUENCY_BOUNDARY: Record<string, string> = {
  'Foni Bintang': 'Foni Bintang Karanai',
};

/**
 * The two places where the boundary file is coarser than the
 * constituencies.
 *
 * Forty-four of the fifty-three constituencies are one district and
 * carry its name. The nine that are not were made by splitting three
 * old districts in the two towns, and nothing published records which
 * part went where - so each cluster is drawn as one shape covering the
 * constituencies inside it, and says so. The alternative was to leave
 * them white, which is what the first attempt at this map did: a third
 * of the electorate, and the ground the mission works on.
 */
export const SHARED_UNITS: {
  label: string;
  constituencies: string[];
  boundaries: string[];
}[] = [
  {
    label: 'Greater Serrekunda',
    constituencies: [
      'Serekunda',
      'Bundungka Kunda',
      'Latrikunda Sabiji',
      'Tallinding Kunjang',
    ],
    boundaries: ['Serrekunda Central', 'Serrekunda East'],
  },
  {
    label: 'Brikama and Kombo North',
    constituencies: [
      'Sanneh Mentereng',
      'Old Yundum',
      'Busumbala',
      'Brikama North',
      'Brikama South',
    ],
    boundaries: ['Kombo North', 'Kombo Central'],
  },
];

/** One shape on the constituency map, and what it covers. */
export interface MapUnit {
  /** What rates are grouped by: the constituency, or the shared unit. */
  key: string;
  /** What the map prints. */
  label: string;
  /** The constituencies inside this shape: one, or several. */
  constituencies: string[];
  shape: BoundaryShape;
}

function district(name: string): BoundaryShape {
  const want = key(CONSTITUENCY_BOUNDARY[name] ?? name);
  const shape = DISTRICT_BOUNDARIES.find((b) => key(b.name) === want);
  if (!shape) throw new Error(`No boundary for ${name}`);
  return shape;
}

/**
 * Every shape the constituency map draws, in the gazetteer's order.
 *
 * Forty-six units for fifty-three constituencies, and every
 * constituency is inside exactly one of them: the map has no white
 * ground anywhere in the country.
 */
export const CONSTITUENCY_UNITS: MapUnit[] = (() => {
  const shared = new Map<string, (typeof SHARED_UNITS)[number]>();
  for (const unit of SHARED_UNITS) {
    for (const c of unit.constituencies) shared.set(key(c), unit);
  }
  const out: MapUnit[] = [];
  const done = new Set<string>();
  for (const name of ALL_CONSTITUENCIES) {
    const group = shared.get(key(name));
    if (!group) {
      out.push({
        key: name,
        label: name,
        constituencies: [name],
        shape: district(name),
      });
      continue;
    }
    if (done.has(group.label)) continue;
    done.add(group.label);
    out.push({
      key: group.label,
      label: group.label,
      constituencies: group.constituencies,
      shape: {
        name: group.label,
        rings: group.boundaries.flatMap((b) => district(b).rings),
      },
    });
  }
  return out;
})();

const unitLookup = new Map<string, string>();
for (const unit of CONSTITUENCY_UNITS) {
  for (const c of unit.constituencies) unitLookup.set(key(c), unit.key);
}

/** The shape a constituency is drawn in, or null for a name off the gazetteer. */
export function unitOfConstituency(name: string): string | null {
  return unitLookup.get(key(name)) ?? null;
}

/**
 * The corner of the country a national map cannot show.
 *
 * Banjul and Kanifing together are a hundredth of the land and a
 * sixth of the electorate, so on a map of the whole country they are a
 * few pixels across - and they are where a mission does much of its
 * observing. They are drawn again in an inset beside the country, at
 * whatever scale the panel allows. The Brikama townships are not in
 * it: they are large enough to hold a circle where they are, and
 * taking them in made the inset taller than the country.
 */
const INSET_LGAS: LgaCode[] = ['BJL', 'KMC'];

export const INSET_UNITS: MapUnit[] = CONSTITUENCY_UNITS.filter((u) => {
  const codes = u.constituencies.map((c) => lgaLookup.get(key(c)));
  return codes.every((code) => code !== undefined && INSET_LGAS.includes(code));
});

/** The box the inset covers, in degrees. */
export const INSET_BOX: [number, number, number, number] = boxOf(
  INSET_UNITS.map((u) => u.shape),
  0.08,
);

/** Whether a unit is drawn in the inset rather than on the country. */
export function inInset(unitKey: string): boolean {
  return INSET_UNITS.some((u) => u.key === unitKey);
}
