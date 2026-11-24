/**
 * Viewing the reports from one part of the calendar.
 *
 * Parties were allowed to campaign early, and observers reported on those
 * events, but the official campaign period began on 16 November 2026.
 * "What did we see during the campaign" and "what did we see altogether"
 * are two different questions, and the data team wants to ask both of the
 * same file without keeping two files.
 *
 * This is a dashboard lens, not an export setting. The deck and the Word
 * report are built from the whole file, because a deck that silently
 * covered three weeks or two depending on a dropdown somebody left set is
 * a document nobody can check. If a period-only deck is ever wanted it
 * should say so on its cover, which is a decision for the mission and not
 * for a dropdown.
 *
 * A report whose date cannot be read belongs to no period. It is shown
 * under "All period" and excluded from the other two, and the count of
 * such reports is put on screen rather than quietly absorbed.
 */

import type { Dataset } from './analyse';

/**
 * The first day of the official campaign period, as UTC midnight.
 *
 * One date, in one place. The Gambia 2026 campaign period runs from 16
 * November; pointing the tool at another election means changing this line.
 */
export const CAMPAIGN_START = Date.UTC(2026, 10, 16);

/** How that date reads in the interface. */
export const CAMPAIGN_START_LABEL = '16 Nov';

export type Period = 'all' | 'campaign' | 'before';

export const PERIODS: { id: Period; label: string }[] = [
  { id: 'all', label: 'All period' },
  { id: 'campaign', label: `Campaign period (from ${CAMPAIGN_START_LABEL})` },
  { id: 'before', label: `Before the campaign (to 15 Nov)` },
];

export function periodLabel(period: Period): string {
  return PERIODS.find((p) => p.id === period)?.label ?? PERIODS[0]!.label;
}

/** Whether a report of this day falls inside the chosen period. */
export function inPeriod(day: number | null, period: Period): boolean {
  if (period === 'all') return true;
  if (day === null) return false;
  return period === 'campaign' ? day >= CAMPAIGN_START : day < CAMPAIGN_START;
}

/**
 * A row mask for the chosen period, or undefined for the whole file.
 *
 * Undefined rather than an all-true array, so that the callers that treat
 * "no filter" as a distinct state keep working and nothing is recomputed
 * for a filter that filters nothing.
 */
export function periodMask(dataset: Dataset, period: Period): boolean[] | undefined {
  if (period === 'all') return undefined;
  return dataset.rowDay.map((day) => inPeriod(day, period));
}

export interface PeriodCounts {
  campaign: number;
  before: number;
  /** Reports whose date is blank or unreadable, so they sit in no period. */
  undated: number;
}

export function periodCounts(dataset: Dataset): PeriodCounts {
  let campaign = 0;
  let before = 0;
  let undated = 0;
  for (const day of dataset.rowDay) {
    if (day === null) undated += 1;
    else if (day >= CAMPAIGN_START) campaign += 1;
    else before += 1;
  }
  return { campaign, before, undated };
}

/**
 * Whether the period filter is worth offering.
 *
 * Only when the file actually straddles the start of the campaign. A
 * polling-day form is one day's work and a campaign file whose first report
 * came after the 16th has nothing to split, and a dropdown that cannot
 * change the screen is one more control to read and ignore.
 */
export function canSplitByPeriod(dataset: Dataset): boolean {
  if (dataset.dateColumn === null) return false;
  const { campaign, before } = periodCounts(dataset);
  return campaign > 0 && before > 0;
}
