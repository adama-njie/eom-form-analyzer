import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildDataset, parseDay } from './analyse';
import { buildDeck } from './pptx';
import { inferSchema, toTable } from './schema';
import { defaultSelection } from './selection';
import {
  CAMPAIGN_START,
  canSplitByPeriod,
  periodCounts,
  periodMask,
  periodNote,
} from './period';

const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

describe('reading a date', () => {
  it('reads the ISO dates the mission\u2019s own exports write', () => {
    expect(parseDay('2026-11-16')).toBe(day(2026, 11, 16));
    expect(parseDay('2026-11-10 11:15:50')).toBe(day(2026, 11, 10));
  });

  it('drops the clock rather than converting it', () => {
    // Whether an event was on the 15th or the 16th must not depend on the
    // time zone of the laptop the file is opened on.
    expect(parseDay('2026-11-16 00:30:00')).toBe(day(2026, 11, 16));
    expect(parseDay('2026-11-15 23:45:00')).toBe(day(2026, 11, 15));
  });

  it('reads a date typed day first, as the forms are written', () => {
    expect(parseDay('16/11/2026')).toBe(day(2026, 11, 16));
    expect(parseDay('16.11.2026')).toBe(day(2026, 11, 16));
  });

  it('reads one typed month first, which it can only be', () => {
    expect(parseDay('11/16/2026')).toBe(day(2026, 11, 16));
  });

  it('reads an Excel date cell, which arrives as a serial number', () => {
    const serial = (day(2026, 11, 16) - Date.UTC(1899, 11, 30)) / 86_400_000;
    expect(parseDay(String(serial))).toBe(day(2026, 11, 16));
  });

  it('refuses anything that is not a date', () => {
    expect(parseDay('')).toBeNull();
    expect(parseDay('Kanifing')).toBeNull();
    expect(parseDay('2026-02-31')).toBeNull();
    expect(parseDay('2026-13-01')).toBeNull();
    // A count, not a date: a serial that small is 1900.
    expect(parseDay('12')).toBeNull();
  });
});

const HEADER = [
  'Date',
  'A.1 LTO team',
  'A.2 Local Government Area (LGA)',
  'B.1 Date of the Event',
  'B.3 Type of event',
];

const ROWS = [
  // Filed on the 17th, but the event was before the campaign began.
  ['2026-11-17 09:00:00', 'LTO01', 'Banjul', '2026-11-15', 'Public rally'],
  ['2026-11-12 18:00:00', 'LTO01', 'Banjul', '2026-11-12', 'Caravan/Convoy'],
  ['2026-11-18 10:00:00', 'LTO02', 'Kanifing', '2026-11-16', 'Public rally'],
  ['2026-11-20 10:00:00', 'LTO02', 'Kanifing', '2026-11-20', 'Public rally'],
  ['2026-11-21 10:00:00', 'LTO03', 'Basse', '2026-11-21', 'Caravan/Convoy'],
  ['2026-11-22 10:00:00', 'LTO03', 'Basse', '', 'Public rally'],
];

function form(rows = ROWS) {
  const table = toTable([HEADER, ...rows]);
  return buildDataset(table, inferSchema(table));
}

describe('the date a report belongs to', () => {
  it('is the date of the event, not the date it was filed', () => {
    // The first report was filed on the 17th about an event on the 15th. It
    // belongs to the days before the campaign, where the event was.
    const ds = form();
    expect(ds.dateColumn).toBe(HEADER.indexOf('B.1 Date of the Event'));
    expect(ds.rowDay[0]).toBe(day(2026, 11, 15));
  });

  it('is nothing at all when the observer left the date blank', () => {
    expect(form().rowDay[5]).toBeNull();
  });

  it('falls back to the submission date on a form that asks for no other', () => {
    const header = HEADER.filter((h) => h !== 'B.1 Date of the Event');
    const rows = ROWS.map((r) => r.filter((_v, i) => i !== 3));
    const ds = buildDataset(
      toTable([header, ...rows]),
      inferSchema(toTable([header, ...rows])),
    );
    expect(ds.dateColumn).toBe(0);
    expect(ds.rowDay[0]).toBe(day(2026, 11, 17));
  });

  it('is not read from a column that merely says "date"', () => {
    const header = ['Date', 'A.2 Local Government Area (LGA)'];
    const rows = [
      ['no date given', 'Banjul'],
      ['see comments', 'Banjul'],
      ['unknown', 'Kanifing'],
    ];
    const ds = buildDataset(toTable([header, ...rows]), inferSchema(toTable([header, ...rows])));
    expect(ds.dateColumn).toBeNull();
    expect(ds.rowDay.every((d) => d === null)).toBe(true);
  });
});

describe('the campaign period filter', () => {
  it('starts on 16 November, which is in the period', () => {
    const ds = form();
    const mask = periodMask(ds, 'campaign')!;
    expect(ds.rowDay[2]).toBe(CAMPAIGN_START);
    expect(mask[2]).toBe(true);
    expect(mask[0]).toBe(false);
  });

  it('keeps the earlier events when asked for the days before', () => {
    const mask = periodMask(form(), 'before')!;
    expect(mask.slice(0, 2)).toEqual([true, true]);
    expect(mask.slice(2, 5)).toEqual([false, false, false]);
  });

  it('leaves an undated report out of both, rather than guessing', () => {
    expect(periodMask(form(), 'campaign')![5]).toBe(false);
    expect(periodMask(form(), 'before')![5]).toBe(false);
    expect(periodCounts(form())).toEqual({ campaign: 3, before: 2, undated: 1 });
  });

  it('shows the whole file when no period is chosen', () => {
    expect(periodMask(form(), 'all')).toBeUndefined();
  });

  it('is offered only when the file straddles the start of the campaign', () => {
    expect(canSplitByPeriod(form())).toBe(true);
    // A polling-day form, or a campaign file that begins after the 16th:
    // nothing to split, so no dropdown.
    expect(canSplitByPeriod(form(ROWS.slice(2)))).toBe(false);
    expect(canSplitByPeriod(form(ROWS.slice(0, 2)))).toBe(false);
  });
});

describe('an export of one period', () => {
  async function cover(period: 'all' | 'campaign' | 'before'): Promise<string> {
    const ds = form();
    const deck = buildDeck(ds, periodMask(ds, period), {
      selection: {
        ...defaultSelection(ds, 'Campaign report'),
        period: periodNote(ds, period),
        maps: false,
        questions: [],
      },
      includeMaps: false,
    });
    const buf = (await deck.write({ outputType: 'nodebuffer' })) as Buffer;
    const zip = await JSZip.loadAsync(buf);
    return zip.files['ppt/slides/slide1.xml']!.async('string');
  }

  it('says on its cover which period it covers', async () => {
    // A deck built from 26 of 36 reports is unanswerable six months later
    // unless it says so itself.
    expect(await cover('campaign')).toContain(
      'Campaign period only: events from 16 November 2026',
    );
  });

  it('says how many reports it had to leave out', async () => {
    expect(periodNote(form(), 'campaign')).toContain(
      'One report whose date could not be read is not included',
    );
  });

  it('counts only that period', async () => {
    // Three of the six reports are in the campaign period, and the tile on
    // the coverage slide has to say three.
    const ds = form();
    const sel = {
      ...defaultSelection(ds, 'Campaign report'),
      period: periodNote(ds, 'campaign'),
      maps: false,
      questions: [],
    };
    const deck = buildDeck(ds, periodMask(ds, 'campaign'), {
      selection: sel,
      includeMaps: false,
    });
    const buf = (await deck.write({ outputType: 'nodebuffer' })) as Buffer;
    const zip = await JSZip.loadAsync(buf);
    const coverage = await zip.files['ppt/slides/slide2.xml']!.async('string');
    expect(coverage).toContain('Coverage');
    expect(coverage).toContain('<a:t>3</a:t>');
    expect(coverage).not.toContain('<a:t>6</a:t>');
  });

  it('leaves the cover alone when the whole file is in', async () => {
    expect(periodNote(form(), 'all')).toBe('');
    expect(await cover('all')).not.toContain('Campaign period only');
  });
});
