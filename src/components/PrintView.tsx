import { useMemo } from 'react';
import { BarList, Donut, StackedByArea, WordCloud, fmtPct } from './charts';
import { GambiaMap } from './GambiaMap';
import {
  analyse,
  coverage,
  displayCounts,
  findings,
  textValues,
  reportsByPlace,
  type Dataset,
} from '@/lib/analyse';
import { describe, describeFinding, executiveSummary } from '@/lib/narrative';
import { JUDGED } from '@/lib/pptx';
import type { ExportSelection } from '@/lib/selection';
import type { Question } from '@/lib/schema';
import { wordFrequencies } from '@/lib/text';

/**
 * The print output.
 *
 * Rendered only while printing, and holding exactly what was chosen in the
 * export dialogue. Printing the current tab would mean the output depended
 * on where the user happened to be standing, and would silently ignore the
 * selection they had just made.
 */
export default function PrintView({
  dataset,
  filter,
  selection,
  questions,
}: {
  dataset: Dataset;
  filter?: boolean[];
  selection: ExportSelection;
  questions: Question[];
}) {
  const cov = useMemo(() => coverage(dataset, filter), [dataset, filter]);
  const probs = useMemo(() => findings(dataset, filter, 12), [dataset, filter]);
  const showMaps = selection.maps && dataset.geo;

  const ratings = dataset.questions.filter((q) => q.kind === 'ordinal' && /^J\./.test(q.code));

  return (
    <div className="printview">
      <header className="print-cover">
        <h1>{selection.title}</h1>
        {selection.preparedBy && <p className="lede">Prepared by {selection.preparedBy}</p>}
        <p className="muted small">
          {cov.reports} observer reports · {cov.groupsCovered} of {cov.groupsTotal} areas ·{' '}
          {new Date().toLocaleDateString('en-GB')}
        </p>
        {selection.period && <p className="lede">{selection.period}</p>}
        <p className="print-warning">
          These are observer reports, not election results. Only the electoral commission can
          declare a result.
        </p>
      </header>

      <section className="print-block">
        <h2>Summary</h2>
        {executiveSummary(dataset, filter).map((p) => (
          <p key={p.slice(0, 40)}>{p}</p>
        ))}
      </section>

      {selection.coverage && (
        <section className="print-block">
          <h2>Coverage</h2>
          <div className="statrow">
            <div className="stat">
              <span className="stat-label">Reports</span>
              <span className="stat-value">{cov.reports}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Areas covered</span>
              <span className="stat-value">
                {cov.groupsCovered} / {cov.groupsTotal}
              </span>
            </div>
            {cov.constituenciesTotal > 0 && (
            <div className="stat">
              <span className="stat-label">Constituencies covered</span>
              <span className="stat-value">
                {cov.constituenciesCovered} / {cov.constituenciesTotal}
              </span>
            </div>
          )}
          {cov.registerShare !== null && (
              <div className="stat">
                <span className="stat-label">Electorate reached</span>
                <span className="stat-value">{fmtPct(cov.registerShare)}</span>
              </div>
            )}
            <div className="stat">
              <span className="stat-label">Teams</span>
              <span className="stat-value">{cov.byTeam.length}</span>
            </div>
          </div>
          <BarList
            counts={cov.byTeam.map((t) => ({
              label: t.team,
              n: t.reports,
              pct: cov.reports ? (t.reports / cov.reports) * 100 : 0,
            }))}
          />
        </section>
      )}

      {showMaps && (
        <section className="print-block">
          <h2>Where the reports came from</h2>
          <GambiaMap
            rates={reportsByPlace(dataset, 'lga', filter)}
            unit="lga"
            suffix=""
            compact={false}
          />
          {dataset.constituencies.length > 0 && (
            <GambiaMap
              rates={reportsByPlace(dataset, 'district', filter)}
              unit="district"
              suffix=""
              compact={false}
            />
          )}
        </section>
      )}

      {selection.findingsTable && probs.length > 0 && (
        <section className="print-block">
          <h2>Ranked findings</h2>
          <p className="muted small">
            Questions whose answer indicates a problem, most frequent first. A triage aid, not a
            conclusion.
          </p>
          <ol className="findings">
            {probs.map((f) => (
              <li key={`${f.question.code}-${f.question.columns[0]}`}>
                <div className="finding-head">
                  <span className="finding-pct">{fmtPct(f.pct)}</span>
                  <span>{describeFinding(f)}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {selection.ratings && ratings.length > 0 && (
        <section className="print-block">
          <h2>Overall assessments</h2>
          <table className="plain">
            <thead>
              <tr>
                <th>Question</th>
                <th style={{ textAlign: 'right' }}>Mean</th>
                <th style={{ textAlign: 'right' }}>Ratings</th>
              </tr>
            </thead>
            <tbody>
              {ratings.map((q) => {
                const b = analyse(dataset, q, filter);
                return (
                  <tr key={q.code}>
                    <th scope="row">
                      {q.code} {q.label}
                    </th>
                    <td style={{ textAlign: 'right' }}>
                      {b.meanScore ? b.meanScore.toFixed(2) : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>{b.answered}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {questions.length > 0 && (
        <section className="print-block">
          <h2>Question by question</h2>
          <div className="print-questions">
            {questions.map((q) => (
              <PrintQuestion key={`${q.code}-${q.columns[0]}`} dataset={dataset} q={q} filter={filter} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function PrintQuestion({
  dataset,
  q,
  filter,
}: {
  dataset: Dataset;
  q: Question;
  filter?: boolean[];
}) {
  const b = useMemo(() => analyse(dataset, q, filter), [dataset, q, filter]);
  const words = useMemo(
    () => (q.kind === 'text' ? wordFrequencies(textValues(dataset, q, filter), 45) : null),
    [dataset, q, filter],
  );
  if (words) {
    return (
      <article className="print-q">
        <h3>
          <span className="qcode">{q.code}</span> {q.label}
        </h3>
        <WordCloud words={words} />
      </article>
    );
  }
  if (b.total.length === 0) return null;
  const judged = JUDGED.test(q.label);
  const areas = Object.keys(b.byArea);
  const order = b.total.map((c) => c.label);
  const shown = displayCounts(q, b);

  return (
    <article className="print-q">
      <h3>
        <span className="qcode">{q.code}</span> {q.label}
      </h3>
      {(q.kind === 'binary' || q.kind === 'categorical') && b.total.length <= 6 ? (
        <Donut counts={b.total} scale={q.scale} size={120} />
      ) : (
        <BarList counts={shown} judged={judged} scale={q.scale} />
      )}
      <p className="muted small">{describe(q, b, dataset.geo)}</p>
      {(q.kind === 'binary' || q.kind === 'ordinal') && areas.length > 1 && (
        <StackedByArea
          scale={q.scale}
          order={order}
          rows={[
            ...areas.map((label) => ({ label, counts: b.byArea[label]! })),
            { label: 'All areas', counts: b.total, emphasis: true },
          ]}
        />
      )}
    </article>
  );
}
