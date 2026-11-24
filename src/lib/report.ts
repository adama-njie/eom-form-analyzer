/**
 * Build the Word report.
 *
 * The deck is for briefing; this is the document an analyst edits and parts
 * of which end up in the mission's own reporting. So it leads with prose,
 * puts a sentence under every chart, and states its limits at both ends.
 *
 * Charts are rendered to PNG here rather than being native Word charts,
 * because a native Word chart needs an embedded spreadsheet part and opens
 * badly outside Word. See chartImage.ts.
 */

import {
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import {
  analyse,
  coverage,
  displayCounts,
  findings,
  rateByPlace,
  textValues,
  reportsByPlace,
  type Dataset,
} from './analyse';
import { barChartPng, meanBarsPng, stackedByAreaPng, wordCloudPng } from './chartImage';
import { UNMAPPED_CONSTITUENCIES } from './gambia';
import { wordFrequencies } from './text';
import { mapPng } from './mapImage';
import { describe, describeFinding, executiveSummary } from './narrative';
import { JUDGED, colourFor, fillsFor } from './pptx';
import { ACCENT_DEEP, CAT, FLAG, INK, MUTED } from './theme';
import { exportFileName, selectedQuestions, type ExportSelection } from './selection';

// One palette for every output. A figure that appears in the deck and in
// the report should be the same colour in both, because they get shown in
// the same meeting.
const BRAND = ACCENT_DEEP;
const BAD = FLAG;

export interface ReportOptions {
  /** What the user chose in the export dialogue. */
  selection: ExportSelection;
}

function body(text: string, opts: { italics?: boolean; color?: string; size?: number } = {}) {
  return new Paragraph({
    spacing: { after: 140, line: 276 },
    children: [
      new TextRun({
        text,
        italics: opts.italics,
        color: opts.color ?? INK,
        size: opts.size ?? 21,
      }),
    ],
  });
}

function h(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) {
  return new Paragraph({
    heading: level,
    spacing: { before: 260, after: 120 },
    children: [new TextRun({ text, color: level === HeadingLevel.HEADING_1 ? BRAND : INK })],
  });
}

function cell(text: string, opts: { bold?: boolean; fill?: string; color?: string; width?: number } = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill, color: 'auto' } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: opts.bold, color: opts.color ?? INK, size: 19 })],
      }),
    ],
  });
}

function table(header: string[], rows: string[][], widths?: number[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'D9E0E5' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'D9E0E5' },
      left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'EDF1F3' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: header.map((t, i) =>
          cell(t, { bold: true, fill: BRAND, color: 'FFFFFF', width: widths?.[i] }),
        ),
      }),
      ...rows.map((r) => new TableRow({ children: r.map((t, i) => cell(t, { width: widths?.[i] })) })),
    ],
  });
}

function caption(text: string) {
  return new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text, size: 18, color: MUTED, italics: true })],
  });
}

function chartParagraph(png: { data: Uint8Array; width: number; height: number }): Paragraph {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [
      new ImageRun({
        type: 'png',
        data: png.data,
        transformation: { width: png.width, height: png.height },
      }),
    ],
  });
}

/* ------------------------------------------------------------------ */

export async function buildReport(
  dataset: Dataset,
  filter: boolean[] | undefined,
  options: ReportOptions,
): Promise<Blob> {
  const sel = options.selection;
  const canDrawMaps = sel.maps && dataset.geo && typeof document !== 'undefined';
  const cov = coverage(dataset, filter);
  const probs = findings(dataset, filter, 12);
  const children: (Paragraph | Table)[] = [];

  /* Cover ---------------------------------------------------------- */
  children.push(
    new Paragraph({
      spacing: { before: 800, after: 80 },
      children: [new TextRun({ text: sel.title, bold: true, size: 56, color: BRAND })],
    }),
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({ text: `Prepared by ${sel.preparedBy}`, size: 26, color: MUTED }),
      ],
    }),
    new Paragraph({
      spacing: { after: sel.period ? 80 : 600 },
      children: [
        new TextRun({
          text: `${cov.reports} observer reports  ·  ${cov.groupsCovered} of ${cov.groupsTotal} areas  ·  generated ${new Date().toLocaleDateString('en-GB')}`,
          size: 20,
          color: MUTED,
        }),
      ],
    }),
    ...(sel.period
      ? [
          // The report follows the dashboard's period filter, so it has to
          // say which period it is.
          new Paragraph({
            spacing: { after: 600 },
            children: [new TextRun({ text: sel.period, bold: true, size: 22, color: BRAND })],
          }),
        ]
      : []),
    new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: BRAND, space: 8 } },
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: 'These are observer reports, not election results. Only the electoral commission can declare a result.',
          bold: true,
          size: 20,
          color: BAD,
        }),
      ],
    }),
  );

  /* Executive summary ----------------------------------------------- */
  children.push(h('Summary', HeadingLevel.HEADING_1));
  for (const p of executiveSummary(dataset, filter)) children.push(body(p));

  /* Coverage --------------------------------------------------------- */
  if (sel.coverage) {
  children.push(h('Coverage', HeadingLevel.HEADING_1));
  children.push(
    body(
      `Reports were submitted by ${cov.byTeam.length} ${cov.byTeam.length === 1 ? 'team' : 'teams'}. The table below shows how they are distributed. Coverage is a deployment, not a random sample, so it describes what was observed and should not be read as representative of the election as a whole.`,
    ),
  );
  children.push(
    table(
      [dataset.geo ? 'Area' : 'District', 'Reports', 'Share of reports', ...(dataset.geo ? ['2021 register'] : [])],
      cov.byGroup.map((g) => [
        g.label,
        String(g.reports),
        cov.reports ? `${((g.reports / cov.reports) * 100).toFixed(1)}%` : '0%',
        ...(dataset.geo ? [g.registered ? g.registered.toLocaleString('en-GB') : '—'] : []),
      ]),
      dataset.geo ? [34, 18, 22, 26] : [46, 24, 30],
    ),
  );
  children.push(caption(`Table 1. Reports by ${dataset.geo ? 'administrative area' : 'district'}.`));

  if (canDrawMaps) {
    children.push(chartParagraph(mapPng(reportsByPlace(dataset, 'lga', filter), 'lga', '', BRAND, 640)));
    children.push(caption('Figure 1. Reports by Local Government Area. Hatched areas returned no reports.'));
    if (dataset.constituencies.length > 0) {
      children.push(
        chartParagraph(mapPng(reportsByPlace(dataset, 'district', filter), 'district', '', BRAND, 640)),
      );
      children.push(
        caption(
          `Figure 2. Reports by constituency, drawn on district boundaries. ${dataset.constituencies.length} of 53 constituencies returned reports; ${UNMAPPED_CONSTITUENCIES.length} constituencies have no boundary of their own and are not shown on this map.`,
        ),
      );
    }
  }

  const teamPng = barChartPng(
    cov.byTeam.map((t) => ({
      label: t.team,
      n: t.reports,
      pct: cov.reports ? (t.reports / cov.reports) * 100 : 0,
    })),
    cov.byTeam.map((_, i) => CAT[i % CAT.length]!),
  );
  children.push(chartParagraph(teamPng));
  children.push(caption(`Figure ${canDrawMaps ? (dataset.constituencies.length > 0 ? 3 : 2) : 1}. Reports by team type.`));

  }

  /* Findings ---------------------------------------------------------- */
  if (sel.findingsTable) {
  children.push(h('Findings', HeadingLevel.HEADING_1));
  if (probs.length === 0) {
    children.push(body('No question indicating an irregularity recorded a positive answer.'));
  } else {
    children.push(
      body(
        'The questions below are those whose answers indicate a problem, ranked by how often that answer was given. Areas listed are those above the overall rate, counted only where an area returned at least five reports. This is a triage aid: each item needs confirmation before it is used in reporting.',
      ),
    );
    children.push(
      table(
        ['Rate', 'Question', 'Reports', 'Above that rate in'],
        probs.map((f) => [
          `${f.pct.toFixed(1)}%`,
          `${f.question.code} ${f.question.label}`.trim(),
          String(f.n),
          f.hotspots.slice(0, 3).map((x) => `${x.group} ${x.pct.toFixed(0)}%`).join(', ') || '—',
        ]),
        [10, 50, 12, 28],
      ),
    );
    children.push(caption('Table 2. Ranked findings.'));
    for (const f of probs.slice(0, 6)) children.push(body(describeFinding(f)));

    if (canDrawMaps) {
      // Map the three most frequent findings: where a problem clusters is
      // usually the first question a mission asks of it.
      for (const f of probs.slice(0, 3)) {
        children.push(h(`${f.question.code} by LGA`, HeadingLevel.HEADING_3));
        children.push(body(describeFinding(f)));
        children.push(
          chartParagraph(
            mapPng(
              rateByPlace(dataset, f.question, f.label, 'lga', filter),
              'lga',
              '%',
              FLAG,
              640,
            ),
          ),
        );
        children.push(
          caption(
            `Share of reports answering ${f.label} to ${f.question.code}, by Local Government Area.`,
          ),
        );
      }
    }
  }

  }

  /* Overall assessments ----------------------------------------------- */
  const ratings = dataset.questions.filter((q) => q.kind === 'ordinal' && /^J\./.test(q.code));
  const scored = ratings
    .map((q) => ({ q, b: analyse(dataset, q, filter) }))
    .filter((r) => r.b.meanScore !== undefined);
  if (sel.ratings && scored.length > 0) {
    children.push(h('Overall assessments', HeadingLevel.HEADING_1));
    children.push(
      body(
        'Observers rate each polling station on several dimensions. The means below are on each question’s own scale, so they are comparable with each other only where the scales match.',
      ),
    );
    children.push(
      table(
        ['Question', 'Mean', 'Scale', 'Ratings'],
        scored.map((r) => [
          `${r.q.code} ${r.q.label}`,
          r.b.meanScore!.toFixed(2),
          `1–${r.q.scale?.length ?? '?'}`,
          String(r.b.answered),
        ]),
        [58, 12, 14, 16],
      ),
    );
    children.push(caption('Table 3. Mean of each overall assessment question.'));
  }

  /* Question by question ------------------------------------------------ */
  const picked = selectedQuestions(dataset, sel);
  if (picked.length > 0) {
    children.push(h('Question by question', HeadingLevel.HEADING_1));
    children.push(
      body(
        'Every question in the form, in the order it appears. Percentages are of the reports that answered, NA included where observers gave it; the n column counts real answers only.',
        { italics: true, color: MUTED },
      ),
    );

    const reportable = picked;
    let section = '';
    let figure = canDrawMaps ? (dataset.constituencies.length > 0 ? 4 : 3) : 2;

    for (const q of reportable) {
      if (q.section && q.section !== section) {
        section = q.section;
        children.push(h(`Section ${section}`, HeadingLevel.HEADING_2));
      }
      const b = analyse(dataset, q, filter);
      if (b.total.length === 0) continue;

      children.push(h(`${q.code} ${q.label}`.trim(), HeadingLevel.HEADING_3));
      children.push(body(describe(q, b, dataset.geo)));

      if (q.kind === 'text') {
        const words = wordFrequencies(textValues(dataset, q, filter));
        if (words.length === 0) continue;
        children.push(chartParagraph(wordCloudPng(words, CAT.map((c) => `#${c}`), 640, 330)));
        children.push(caption(`Figure ${figure}. ${q.code} ${q.label}`.trim()));
        figure += 1;
        continue;
      }

      // A percentage question is averaged, not banded: the figure, then
      // the same figure by party and by area.
      if (b.percent) {
        const p = b.percent;
        for (const [title, rows] of [
          ['by party', p.byParty],
          [`by ${dataset.geo ? 'Local Government Area' : 'district'}`, p.byArea],
        ] as const) {
          if (rows.length < 2) continue;
          children.push(chartParagraph(meanBarsPng(rows, `#${ACCENT_DEEP}`)));
          children.push(caption(`Figure ${figure}. ${q.code} ${title}.`));
          figure += 1;
        }
        continue;
      }

      const judged = JUDGED.test(q.label);
      const shown = displayCounts(q, b);
      const fills = fillsFor(shown, { judged, scale: q.scale, perMark: false });
      const colours = shown.map((_, i) => fills[i % fills.length]!);
      children.push(chartParagraph(barChartPng(shown, colours)));
      children.push(caption(`Figure ${figure}. ${q.code} ${q.label}`.trim()));
      figure += 1;

      // By-area comparison, where there is enough to compare.
      const groups = Object.entries(b.byArea);
      if ((q.kind === 'binary' || q.kind === 'ordinal') && groups.length > 2) {
        const order = b.total.map((c) => c.label);
        const colourMap: Record<string, string> = {};
        order.forEach((label, i) => {
          colourMap[label] = colourFor(label, i, q.scale);
        });
        children.push(
          chartParagraph(
            stackedByAreaPng(
              [
                ...groups.map(([label, counts]) => ({ label, counts })),
                { label: 'All areas', counts: b.total, emphasis: true },
              ],
              order,
              colourMap,
            ),
          ),
        );
        children.push(caption(`Figure ${figure}. ${q.code} by ${dataset.geo ? 'lga' : 'district'}.`));
        figure += 1;
      }
    }
  }

  /* Method and limits ---------------------------------------------------- */
  children.push(h('Method and limits', HeadingLevel.HEADING_1));
  for (const [title, text] of [
    [
      'What these figures are',
      'Each row in the source file is one submitted observer report. A chart shows every answer observers gave, NA among them, and its percentages are of those. The rates in the findings table leave NA out, because they are meant to read as a share of the reports that could judge. Neither is a share of the polling stations in the country.',
    ],
    [
      'Coverage is not a sample',
      'Observers are deployed to a plan rather than drawn at random. Nothing here can be projected onto the election as a whole, and an area with few reports will produce unstable percentages.',
    ],
    [
      'How findings were ranked',
      'Questions were classified automatically from their wording to decide which answer indicates a problem, then ranked by how often that answer was given. An area is listed as above the overall rate only where it returned at least five reports. Every item needs confirmation before use.',
    ],
    [
      'How the form was read',
      'Question types were inferred from the column headers and the values beneath them, rather than configured by hand. If a question has been typed wrongly, its figures here will be wrong too; the Data quality view in the tool lists how every column was interpreted.',
    ],
  ] as [string, string][]) {
    children.push(h(title, HeadingLevel.HEADING_3));
    children.push(body(text));
  }

  const doc = new Document({
    creator: 'Observer Form Analyser',
    title: sel.title,
    styles: {
      default: {
        document: { run: { font: 'Arial', size: 21, color: INK } },
      },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal',
          run: { size: 32, bold: true, color: BRAND } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal',
          run: { size: 26, bold: true, color: INK } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal',
          run: { size: 22, bold: true, color: INK } },
      ],
    },
    sections: [
      {
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}

export async function exportReport(
  dataset: Dataset,
  filter: boolean[] | undefined,
  options: ReportOptions,
): Promise<void> {
  const blob = await buildReport(dataset, filter, options);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFileName(options.selection, 'docx');
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
