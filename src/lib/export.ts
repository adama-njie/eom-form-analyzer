import type { Dataset } from './analyse';
import { analyse } from './analyse';
import { LGAS } from './gambia';

/** Minimal CSV writer: quotes anything containing a comma, quote or newline. */
export function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const t = String(cell ?? '');
          return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
        })
        .join(','),
    )
    .join('\n');
}

export function downloadCsv(filename: string, rows: (string | number)[][]): void {
  // A BOM so Excel opens UTF-8 correctly, which it otherwise will not.
  const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * One long CSV holding every question's table, overall and by area. This is
 * what gets pasted into a report or handed to someone who wants to check a
 * number without opening the tool.
 */
export function exportAllTables(dataset: Dataset, filter?: boolean[]): void {
  const rows: (string | number)[][] = [
    ['Observer form analysis'],
    ['Generated', new Date().toISOString()],
    ['Reports', filter ? filter.filter(Boolean).length : dataset.table.rows.length],
    [],
    ['Code', 'Question', 'Type', 'Scope', 'Answer', 'Reports', 'Percent'],
  ];

  for (const q of dataset.questions) {
    if (q.kind === 'meta' || q.kind === 'text') continue;
    const b = analyse(dataset, q, filter);
    for (const c of b.total) {
      rows.push([q.code, q.label, q.kind, 'All areas', c.label, c.n, c.pct.toFixed(1)]);
    }
    for (const area of LGAS) {
      const counts = b.byArea[area.code];
      if (!counts) continue;
      for (const c of counts) {
        rows.push([q.code, q.label, q.kind, area.name, c.label, c.n, c.pct.toFixed(1)]);
      }
    }
  }

  downloadCsv('observer-form-analysis.csv', rows);
}
