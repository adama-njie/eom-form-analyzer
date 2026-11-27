import { describe, expect, it } from 'vitest';
import { buildDataset } from './analyse';
import { inferSchema, toTable } from './schema';
import { defaultSelection, defaultTitle, exportFileName } from './selection';

const TODAY = new Date().toISOString().slice(0, 10);

function selection(title: string) {
  const table = toTable([
    ['A.2 Local Government Area (LGA)', 'B.5 Was a candidate present'],
    ['Banjul', 'Yes'],
  ]);
  const ds = buildDataset(table, inferSchema(table));
  return { ...defaultSelection(ds, title), title };
}

describe('what an export is called', () => {
  it('is named after the title the dialogue was given', () => {
    // Not "observer-analysis": a deck for the Chief Observer and one for
    // the EMB, produced the same afternoon, used to differ only by a (1).
    expect(exportFileName(selection('Weekly campaign briefing'), 'pptx')).toBe(
      `Weekly-campaign-briefing-${TODAY}.pptx`,
    );
  });

  it('drops the source workbook extension, which is noise in a file name', () => {
    expect(exportFileName(selection('campaign-report-20261124.xlsx — Campaign Report'), 'docx')).toBe(
      `campaign-report-20261124-Campaign-Report-${TODAY}.docx`,
    );
  });

  it('says which period it covers, so two exports of one file differ', () => {
    const campaign = { ...selection('Briefing'), periodId: 'campaign' as const };
    const before = { ...selection('Briefing'), periodId: 'before' as const };
    expect(exportFileName(campaign, 'pptx')).toBe(`Briefing-campaign-period-${TODAY}.pptx`);
    expect(exportFileName(before, 'pptx')).toBe(`Briefing-before-campaign-${TODAY}.pptx`);
  });

  it('still produces a name when the title has been emptied', () => {
    expect(exportFileName(selection('   '), 'csv')).toBe(`observer-analysis-${TODAY}.csv`);
  });

  it('keeps a long title to a length a file system will take', () => {
    const name = exportFileName(selection('x'.repeat(200)), 'pptx');
    expect(name.length).toBeLessThan(100);
  });
});

describe('what an export is called before anyone renames it', () => {
  it('is the form the workbook holds, not the file it arrived in', () => {
    // The cover used to read "campaign-report-20261124-143212.xlsx -
    // Campaign Report", which is a file name on a briefing slide.
    expect(defaultTitle('campaign-report-20261124-143212.xlsx', 'Campaign Report')).toBe(
      'Analysis of Campaign Report',
    );
  });

  it('says it is an analysis of the form, not the form', () => {
    // A cover reading "Form B Voting" promises the questionnaire.
    expect(defaultTitle('x.xlsx', 'Form B Voting')).toBe('Analysis of Form B Voting');
    expect(defaultTitle('x.xlsx', 'Analysis of Form B')).toBe('Analysis of Form B');
  });

  it('falls back to the file when the sheet was never named', () => {
    expect(defaultTitle('Form B sample.xlsx', 'Sheet1')).toBe('Analysis of Form B sample');
    expect(defaultTitle('Form B sample.xlsx', '')).toBe('Analysis of Form B sample');
  });
});
