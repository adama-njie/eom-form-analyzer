import { describe, expect, it } from 'vitest';
import { DISTRICT_BOUNDARIES, GAMBIA_BBOX, LGA_BOUNDARIES } from '@/data/boundaries';
import {
  ALL_CONSTITUENCIES,
  CONSTITUENCY_TO_DISTRICT,
  DISTRICT_TO_LGA,
  LGAS,
  LGA_SHAPES,
  TOTAL_REGISTERED_2021,
  UNMAPPED_CONSTITUENCIES,
  resolveConstituency,
  resolveLga,
} from './gambia';
import { makeProjector, pathFor } from './projection';

describe('geography', () => {
  it('has the eight Local Government Areas', () => {
    expect(LGAS).toHaveLength(8);
    expect(LGAS.map((a) => a.name)).toContain('Kuntaur');
  });

  it('has 53 constituencies', () => {
    expect(ALL_CONSTITUENCIES).toHaveLength(53);
    expect(new Set(ALL_CONSTITUENCIES).size).toBe(53);
  });

  it('reconciles to the official 2021 register', () => {
    expect(TOTAL_REGISTERED_2021).toBe(962_157);
  });

  it('splits Central River back into Kuntaur and Janjanbureh', () => {
    const kuntaur = LGAS.find((a) => a.code === 'KUN')!;
    const janjan = LGAS.find((a) => a.code === 'JAN')!;
    expect(kuntaur.registered2021 + janjan.registered2021).toBe(119_606);
  });
});

describe('name matching', () => {
  it('accepts the LGA name, the IEC name and the code', () => {
    for (const raw of ['West Coast', 'Brikama', 'BRI', 'brikama ', 'West Coast Region']) {
      expect(resolveLga(raw)).toBe('BRI');
    }
  });

  it('tolerates the common spelling variants', () => {
    // These all appear in official Gambian documents.
    expect(resolveConstituency('Lower Niumi')?.name).toBe('Lower Nuimi');
    expect(resolveConstituency('Wuli East')?.name).toBe('Wulli East');
    expect(resolveConstituency('Lower Fuladu West')?.name).toBe('Lower Fulladu West');
    expect(resolveConstituency('Illiasa')?.name).toBe('Illiassa');
    expect(resolveConstituency('Central Badibu')?.name).toBe('Central Baddibu');
    expect(resolveConstituency('Sabach Sanjar')?.name).toBe('Sabach Sanjal');
  });

  it('maps every constituency to its LGA', () => {
    for (const c of ALL_CONSTITUENCIES) {
      expect(resolveConstituency(c), c).not.toBeNull();
    }
  });

  it('still resolves the IEC seven-area name', () => {
    expect(resolveLga('Central River')).not.toBeNull();
  });
});

describe('boundaries', () => {
  it('has a real shape for all eight LGAs', () => {
    expect(LGA_BOUNDARIES).toHaveLength(8);
    expect(LGA_SHAPES).toHaveLength(8);
    for (const { shape } of LGA_SHAPES) expect(shape.rings.length).toBeGreaterThan(0);
  });

  it('has the 48 districts', () => {
    expect(DISTRICT_BOUNDARIES).toHaveLength(48);
  });

  it('stores rings as flat coordinate pairs', () => {
    for (const b of [...LGA_BOUNDARIES, ...DISTRICT_BOUNDARIES]) {
      for (const ring of b.rings) {
        expect(ring.length % 2).toBe(0);
        expect(ring.length).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it('keeps every vertex inside The Gambia', () => {
    const [minLon, minLat, maxLon, maxLat] = GAMBIA_BBOX;
    expect(minLon).toBeGreaterThan(-18);
    expect(maxLon).toBeLessThan(-13);
    expect(minLat).toBeGreaterThan(12);
    expect(maxLat).toBeLessThan(14);
    for (const b of LGA_BOUNDARIES) {
      for (const ring of b.rings) {
        for (let i = 0; i < ring.length; i += 2) {
          expect(ring[i]!).toBeGreaterThanOrEqual(minLon - 0.01);
          expect(ring[i]!).toBeLessThanOrEqual(maxLon + 0.01);
        }
      }
    }
  });

  it('assigns most districts to an LGA', () => {
    const mapped = DISTRICT_BOUNDARIES.filter((d) => DISTRICT_TO_LGA[d.name]).length;
    expect(mapped / DISTRICT_BOUNDARIES.length).toBeGreaterThan(0.85);
  });

  it('is honest about constituencies with no district', () => {
    // 53 constituencies do not fit onto 48 districts. The ones that cannot
    // be placed must be listed, not quietly dropped.
    const mapped = Object.keys(CONSTITUENCY_TO_DISTRICT).length;
    expect(mapped + UNMAPPED_CONSTITUENCIES.length).toBe(53);
    expect(UNMAPPED_CONSTITUENCIES.length).toBeGreaterThan(0);
    expect(mapped).toBeGreaterThan(30);
  });
});

describe('projection', () => {
  it('produces a landscape canvas, as the country is wide and thin', () => {
    const p = makeProjector(900);
    expect(p.width).toBe(900);
    expect(p.height).toBeLessThan(p.width / 2);
  });

  it('draws every shape inside the canvas', () => {
    const p = makeProjector(900);
    for (const b of LGA_BOUNDARIES) {
      for (const ring of b.rings) {
        for (let i = 0; i < ring.length; i += 2) {
          const [x, y] = p.project(ring[i]!, ring[i + 1]!);
          expect(x).toBeGreaterThanOrEqual(-0.5);
          expect(x).toBeLessThanOrEqual(p.width + 0.5);
          expect(y).toBeGreaterThanOrEqual(-0.5);
          expect(y).toBeLessThanOrEqual(p.height + 0.5);
        }
      }
    }
  });

  it('emits a closed SVG path per shape', () => {
    const p = makeProjector(900);
    for (const b of LGA_BOUNDARIES) {
      const d = pathFor(b, p);
      expect(d.startsWith('M')).toBe(true);
      expect(d.endsWith('Z')).toBe(true);
    }
  });
});
