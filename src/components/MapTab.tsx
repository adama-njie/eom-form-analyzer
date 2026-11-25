import { useEffect, useMemo, useState } from 'react';
import { GambiaMap, MapTable } from './GambiaMap';
import { analyse, rateByPlace, reportsByPlace, type Dataset } from '@/lib/analyse';
import { downloadCsv } from '@/lib/export';
import { AREA_WORDS } from '@/lib/gambia';
import { JUDGED } from '@/lib/pptx';

/**
 * Map any question onto the country.
 *
 * The question that matters to a mission is rarely "where did reports come
 * from"; it is "where is this particular problem concentrated". So the map
 * shades the rate of any chosen answer to any chosen question, at area or
 * constituency level, and the whole report can be filtered from it.
 */
export default function MapTab({
  dataset,
  filter,
  selected,
  onSelect,
}: {
  dataset: Dataset;
  filter?: boolean[];
  selected: string;
  onSelect: (place: string) => void;
}) {
  const mappable = useMemo(
    () =>
      dataset.questions.filter(
        (q) =>
          (q.kind === 'binary' || q.kind === 'categorical' || q.kind === 'ordinal' || q.kind === 'multi') &&
          q.columns.length > 0,
      ),
    [dataset],
  );

  // Default to the first question whose wording marks it as an irregularity,
  // because that is what a mission looks at first.
  const defaultQ = useMemo(() => {
    const flagged = mappable.find((q) => q.kind === 'binary' && JUDGED.test(q.label));
    return flagged?.code ?? '';
  }, [mappable]);

  const [code, setCode] = useState<string>(defaultQ);
  const [answer, setAnswer] = useState<string>('');

  const question = useMemo(
    () => mappable.find((q) => q.code === code) ?? null,
    [mappable, code],
  );

  const breakdown = useMemo(
    () => (question ? analyse(dataset, question, filter) : null),
    [dataset, question, filter],
  );

  // Keep the chosen answer valid when the question changes.
  useEffect(() => {
    if (!breakdown) return;
    const labels = breakdown.total.map((c) => c.label);
    if (!labels.includes(answer)) setAnswer(labels.includes('Yes') ? 'Yes' : (labels[0] ?? ''));
  }, [breakdown, answer]);

  const showingCoverage = !question || !answer;

  const rates = useMemo(() => {
    if (showingCoverage) return reportsByPlace(dataset, filter);
    return rateByPlace(dataset, question!, answer, filter);
  }, [dataset, question, answer, filter, showingCoverage]);
  const suffix: '%' | '' = showingCoverage ? '' : '%';

  const headline = showingCoverage
    ? 'Reports received'
    : `${question!.code} — share answering “${answer}”`;

  return (
    <div className="stack">
      <section className="card">
        <div className="maptoolbar no-print">
          <label>
            <span className="muted small">Show</span>
            <select
              value={code}
              onChange={(e) => setCode(e.target.value)}
            >
              <option value="">Reports received (coverage)</option>
              {mappable.map((q) => (
                <option key={`${q.code}-${q.columns[0]}`} value={q.code}>
                  {`${q.code} ${q.label}`.slice(0, 72)}
                </option>
              ))}
            </select>
          </label>

          {question && breakdown && (
            <label>
              <span className="muted small">Answer</span>
              <select value={answer} onChange={(e) => setAnswer(e.target.value)}>
                {breakdown.total.map((c) => (
                  <option key={c.label} value={c.label}>
                    {c.label} ({c.n})
                  </option>
                ))}
              </select>
            </label>
          )}

          <button
            type="button"
            className="ghost"
            onClick={() =>
              downloadCsv(
                `map-${showingCoverage ? 'coverage' : `${question!.code}-${answer}`}-${
                  dataset.division === 'region' ? 'region' : 'lga'
                }.csv`,
                [
                  [
                    AREA_WORDS[dataset.division].heading,
                    'Matching',
                    'Reports',
                    suffix === '%' ? 'Rate %' : 'Count',
                  ],
                  ...rates.map((r) => [
                    r.place,
                    r.n,
                    r.total,
                    r.pct === null ? '' : r.pct.toFixed(1),
                  ]),
                ],
              )
            }
          >
            CSV
          </button>
        </div>

        <h2 className="mt">{headline}</h2>
        {question && (
          <p className="muted small">{question.label}</p>
        )}

        <GambiaMap
          rates={rates}
          suffix={suffix}
          colour={showingCoverage ? '#12239E' : '#E66C37'}
          selected={selected || null}
          onSelect={(p) => onSelect(p ?? '')}
          division={dataset.division}
        />
      </section>

      <section className="card">
        <h2>By {AREA_WORDS[dataset.division].one}</h2>
        <MapTable
          rates={rates}
          suffix={suffix}
          answerLabel={showingCoverage ? 'Reports' : answer}
          division={dataset.division}
        />
      </section>
    </div>
  );
}
