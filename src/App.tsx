import { useCallback, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { BarList, Donut, StackedByArea, WordCloud, fmtPct } from '@/components/charts';
import { GambiaMap } from '@/components/GambiaMap';
import {
  analyse,
  buildDataset,
  coverage,
  findings,
  reportsByPlace,
  textValues,
  type Breakdown,
  type Dataset,
} from '@/lib/analyse';
import { inferSchema, toTable, type Question } from '@/lib/schema';
import { wordFrequencies } from '@/lib/text';
import { downloadCsv, exportAllTables } from '@/lib/export';
import { exportPptx } from '@/lib/pptx';
import { exportReport } from '@/lib/report';
import MapTab from '@/components/MapTab';
import ExportDialog, { type ExportKind } from '@/components/ExportDialog';
import PrintView from '@/components/PrintView';
import {
  defaultSelection,
  exportableQuestions,
  selectedQuestions,
  type ExportSelection,
} from '@/lib/selection';

type Tab = 'overview' | 'map' | 'findings' | 'questions' | 'data';

/** Questions where "Yes" is bad, so the charts should say so in colour. */
const JUDGED =
  /(problem|unauthorised|unauthorized|interfer|overcrowd|unrest|tension|campaign|missing|turned away|without proper|influence|voting together|stuffing|proxy|compelled|objection|intimidat|violence|vote buying|able to observe|accessible|adequate|protect|plain view|suitable|explained|marked with ink|secrecy|confidence|transparen|conduct|performance|understanding)/i;

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [formName, setFormName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [group, setGroup] = useState<string>('');
  const [team, setTeam] = useState<string>('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const [selection, setSelection] = useState<ExportSelection | null>(null);
  const [printing, setPrinting] = useState<ExportSelection | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const readFile = useCallback(async (file: File) => {
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      // Pick the sheet with the most rows: exports often carry a stub sheet.
      const best = wb.SheetNames.map((n) => {
        const ws = wb.Sheets[n]!;
        const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, {
          header: 1,
          blankrows: false,
          defval: '',
        });
        return { n, grid };
      }).sort((a, b) => b.grid.length - a.grid.length)[0];
      if (!best || best.grid.length < 2) throw new Error('No data rows found in this workbook.');
      const table = toTable(best.grid);
      const questions = inferSchema(table);
      if (questions.length === 0) throw new Error('No questions could be identified.');
      setDataset(buildDataset(table, questions));
      setFormName(`${file.name} — ${best.n}`);
      setGroup('');
      setTeam('');
      setTab('overview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.');
      setDataset(null);
    }
  }, []);

  const rowFilter = useMemo(() => {
    if (!dataset) return undefined;
    if (!group && !team) return undefined;
    // `group` may be an area or a constituency, depending on what was
    // clicked on the map, so match either rather than silently filtering
    // everything out.
    return dataset.table.rows.map(
      (_r, i) =>
        (!group ||
          dataset.rowGroup[i] === group ||
          dataset.rowConstituency[i] === group) &&
        (!team || dataset.rowTeam[i] === team),
    );
  }, [dataset, group, team]);

  const cov = useMemo(
    () => (dataset ? coverage(dataset, rowFilter) : null),
    [dataset, rowFilter],
  );
  const probs = useMemo(
    () => (dataset ? findings(dataset, rowFilter) : []),
    [dataset, rowFilter],
  );

  // The same list the exports use, so what is on screen is what comes out.
  const reportable = useMemo(
    () => (dataset ? exportableQuestions(dataset) : []),
    [dataset],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return reportable;
    return reportable.filter(
      (q) => q.label.toLowerCase().includes(needle) || q.code.toLowerCase().includes(needle),
    );
  }, [reportable, search]);

  const openExport = (kind: ExportKind) => {
    if (!dataset) return;
    setSelection((current) => current ?? defaultSelection(dataset, formName));
    setExporting(kind);
  };

  const runExport = async (kind: ExportKind, sel: ExportSelection) => {
    if (!dataset) return;
    setSelection(sel);
    setBusy(true);
    try {
      if (kind === 'pptx') {
        await exportPptx(dataset, rowFilter, { selection: sel });
      } else if (kind === 'report') {
        await exportReport(dataset, rowFilter, { selection: sel });
      } else {
        // Render a print-only view holding exactly the chosen content, so
        // what prints does not depend on which tab happens to be open.
        setPrinting(sel);
        await new Promise((r) => window.setTimeout(r, 350));
        window.print();
        setPrinting(null);
      }
      setExporting(null);
    } finally {
      setBusy(false);
    }
  };

  if (!dataset) {
    return (
      <Landing
        onFile={readFile}
        error={error}
        inputRef={inputRef}
      />
    );
  }

  const teams = [...new Set(dataset.rowTeam.filter(Boolean))].sort();

  return (
    <div className="app">
      <header className="topbar no-print">
        <div className="brand">
          <Flag />
          <div>
            <strong>Observer Form Analyser</strong>
            <span className="muted"> · {formName}</span>
          </div>
        </div>
        <div className="controls">
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">{dataset.geo ? 'All areas' : 'All districts'}</option>
            {dataset.groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
            {dataset.constituencies.length > 0 && (
              <optgroup label="Constituencies">
                {dataset.constituencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <select value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button type="button" disabled={busy} onClick={() => openExport('pptx')}>
            PowerPoint
          </button>
          <button type="button" disabled={busy} onClick={() => openExport('report')}>
            Build report
          </button>
          <button type="button" disabled={busy} onClick={() => openExport('print')}>
            Print / PDF
          </button>
          <button
            type="button"
            onClick={() => exportAllTables(dataset, rowFilter)}
          >
            Export tables
          </button>
          <button type="button" className="ghost" onClick={() => inputRef.current?.click()}>
            New file
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void readFile(f);
            }}
          />
        </div>
      </header>

      <nav className="tabs no-print">
        {(['overview', 'map', 'findings', 'questions', 'data'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={t === tab ? 'is-active' : ''}
            onClick={() => setTab(t)}
          >
            {t === 'overview' && 'Overview'}
            {t === 'map' && 'Map'}
            {t === 'findings' && `Findings (${probs.length})`}
            {t === 'questions' && `All questions (${reportable.length})`}
            {t === 'data' && 'Data quality'}
          </button>
        ))}
      </nav>

      {(group || team) && (
        <p className="filter-note no-print">
          Filtered to {group || 'all areas'}
          {team ? ` · ${team} teams` : ''} · {cov!.reports} reports
          <button type="button" className="link" onClick={() => { setGroup(''); setTeam(''); }}>
            clear
          </button>
        </p>
      )}

      <main>
        {tab === 'overview' && cov && <Overview dataset={dataset} cov={cov} onGroup={setGroup} group={group} />}
        {tab === 'map' && (
          <MapTab
            dataset={dataset}
            filter={rowFilter}
            selected={group}
            onSelect={setGroup}
          />
        )}
        {tab === 'findings' && <Findings probs={probs} />}
        {tab === 'questions' && (
          <>
            <div className="searchbar no-print">
              <input
                type="search"
                placeholder="Filter questions by text or code, e.g. F.9 or campaign"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <span className="muted">{visible.length} shown</span>
            </div>
            <div className="qgrid">
              {visible.map((q) => (
                <QuestionCard key={`${q.code}-${q.columns[0]}`} dataset={dataset} q={q} filter={rowFilter} />
              ))}
            </div>
          </>
        )}
        {tab === 'data' && <DataQuality dataset={dataset} cov={cov!} />}
      </main>

      {exporting && selection && (
        <ExportDialog
          dataset={dataset}
          kind={exporting}
          initial={selection}
          busy={busy}
          onCancel={() => setExporting(null)}
          onConfirm={(sel) => void runExport(exporting, sel)}
        />
      )}

      {printing && (
        <PrintView
          dataset={dataset}
          filter={rowFilter}
          selection={printing}
          questions={selectedQuestions(dataset, printing)}
        />
      )}

      <footer className="foot">
        <p>
          Generated in your browser from {dataset.table.rows.length} submitted reports. No data was
          uploaded or transmitted. Figures are observer reports, not official results.
        </p>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Flag() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#0D2B36" />
      <rect x="3" y="6" width="18" height="12" fill="#FFFFFF" />
      <rect x="3" y="6" width="18" height="4" fill="#CE1126" />
      <rect x="3" y="10.667" width="18" height="2.666" fill="#0C1C8C" />
      <rect x="3" y="14" width="18" height="4" fill="#3A7728" />
    </svg>
  );
}

function Landing({
  onFile,
  error,
  inputRef,
}: {
  onFile: (f: File) => void;
  error: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [over, setOver] = useState(false);
  return (
    <div className="landing">
      <div className="landing-card">
        <Flag />
        <h1>Observer Form Analyser</h1>
        <p className="lede">
          Drop an observer form export in, and the whole analysis builds itself: coverage,
          ranked findings, and a chart for every question, broken down by administrative area.
        </p>
        <div
          className={`drop${over ? ' is-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onFile(f);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
          }}
        >
          <strong>Drop the Excel here</strong>
          <span className="muted">or click to choose a file (.xlsx, .xls, .csv)</span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        {error && <p className="error">{error}</p>}
        <ul className="assurances">
          <li>
            <strong>Nothing leaves this computer.</strong> The file is read in the browser. There is
            no server, no upload and no network request.
          </li>
          <li>
            <strong>Works on any form.</strong> Question types are inferred from the column headers,
            so Forms A, B, C and D all work without configuration.
          </li>
          <li>
            <strong>Works offline.</strong> Save this page and open it anywhere, with no install.
          </li>
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub muted">{sub}</span>}
    </div>
  );
}

function Overview({
  dataset,
  cov,
  onGroup,
  group,
}: {
  dataset: Dataset;
  cov: ReturnType<typeof coverage>;
  onGroup: (g: string) => void;
  group: string;
}) {
  const ratings = dataset.questions.filter((q) => q.kind === 'ordinal' && /^J\./.test(q.code));
  return (
    <div className="stack">
      <section className="card">
        <h2>Coverage</h2>
        <div className="statrow">
          <Stat label="Reports" value={cov.reports} />
          <Stat
            label={dataset.geo ? 'Areas covered' : 'Districts covered'}
            value={`${cov.groupsCovered} / ${cov.groupsTotal}`}
            sub={dataset.geo ? 'administrative areas' : 'as named in the file'}
          />
          {cov.registerShare !== null ? (
            <Stat
              label="Electorate reached"
              value={fmtPct(cov.registerShare)}
              sub="share of the 2021 register in observed areas"
            />
          ) : (
            <Stat
              label="Reports per district"
              value={
                cov.groupsCovered ? (cov.reports / cov.groupsCovered).toFixed(1) : '—'
              }
              sub="mean across covered districts"
            />
          )}
          <Stat label="Teams reporting" value={cov.byTeam.length} />
        </div>
        {!dataset.geo && cov.groupsCovered > 0 && (
          <p className="muted small">
            These district names are not Gambian administrative areas, so the map is not shown.
            Everything else works the same way.
          </p>
        )}
      </section>

      <div className="two">
        {dataset.geo ? (
          <section className="card">
            <h2>Reports by Local Government Area</h2>
            <GambiaMap
              rates={reportsByPlace(dataset, 'lga', undefined)}
              unit="lga"
              suffix=""
              selected={group || null}
              onSelect={(p) => onGroup(p ?? '')}
            />
            <p className="muted small">
              Click an area to filter the whole report. Hatched areas returned no reports, which is
              not the same as reporting no problems. Open the Map tab to shade by any question.
            </p>
          </section>
        ) : (
          <section className="card">
            <h2>Reports by district</h2>
            <BarList
              counts={cov.byGroup
                .filter((g) => g.reports > 0)
                .map((g) => ({
                  label: g.label,
                  n: g.reports,
                  pct: cov.reports ? (g.reports / cov.reports) * 100 : 0,
                }))}
            />
          </section>
        )}
        <section className="card">
          <h2>Reports by team</h2>
          <BarList
            counts={cov.byTeam.map((t) => ({
              label: t.team,
              n: t.reports,
              pct: cov.reports ? (t.reports / cov.reports) * 100 : 0,
            }))}
          />
          {dataset.geo && (
            <>
              <h2 className="mt">Reports per area</h2>
              <BarList
                counts={cov.byGroup
                  .filter((g) => g.reports > 0)
                  .map((g) => ({
                    label: g.label,
                    n: g.reports,
                    pct: cov.reports ? (g.reports / cov.reports) * 100 : 0,
                  }))}
              />
            </>
          )}
        </section>
      </div>

      {ratings.length > 0 && (
        <section className="card">
          <h2>Overall assessments</h2>
          <div className="statrow">
            {ratings.map((q) => {
              const b = analyse(dataset, q);
              return (
                <Stat
                  key={q.code}
                  label={`${q.code} ${q.label}`}
                  value={b.meanScore ? b.meanScore.toFixed(2) : '—'}
                  sub={`mean of ${b.answered} ratings`}
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Findings({ probs }: { probs: ReturnType<typeof findings> }) {
  if (probs.length === 0) {
    return (
      <section className="card">
        <h2>No flagged findings</h2>
        <p className="muted">
          No question that indicates an irregularity recorded a single positive answer in the
          current selection.
        </p>
      </section>
    );
  }
  return (
    <section className="card">
      <h2>Ranked findings</h2>
      <p className="muted">
        Questions where the answer indicates a problem, most frequent first. Hotspots are areas
        above the overall rate. This is a triage aid, not a conclusion.
      </p>
      <ol className="findings">
        {probs.map((f) => (
          <li key={`${f.question.code}-${f.question.columns[0]}`}>
            <div className="finding-head">
              <span className="finding-pct">{fmtPct(f.pct)}</span>
              <span>
                <strong>
                  {f.question.code} {f.question.label}
                </strong>
                <span className="muted"> · {f.n} reports answered “{f.label}”</span>
              </span>
            </div>
            {f.hotspots.length > 0 && (
              <p className="hotspots">
                Above average in{' '}
                {f.hotspots
                  .slice(0, 4)
                  .map((h) => `${h.group} ${fmtPct(h.pct)}`)
                  .join(', ')}
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function QuestionCard({
  dataset,
  q,
  filter,
}: {
  dataset: Dataset;
  q: Question;
  filter?: boolean[];
}) {
  const b: Breakdown = useMemo(() => analyse(dataset, q, filter), [dataset, q, filter]);
  const words = useMemo(
    () => (q.kind === 'text' ? wordFrequencies(textValues(dataset, q, filter), 45) : null),
    [dataset, q, filter],
  );
  const judged = JUDGED.test(q.label);
  const order = b.total.map((c) => c.label);
  const areasWithData = Object.keys(b.byArea);
  const partiesWithData = Object.keys(b.byParty);
  const stackable = q.kind === 'binary' || q.kind === 'ordinal' || q.kind === 'categorical';
  const showStacked = stackable && areasWithData.length > 1;
  // Both are offered on screen. The deck has room for one and takes party
  // where the form has it; here a reader can open whichever they want.
  const showByParty = stackable && partiesWithData.length > 1;

  return (
    <section className="card q">
      <header>
        <h3>
          {q.code && <span className="qcode">{q.code}</span>} {q.label}
        </h3>
        <span className="muted small">
          {q.kind === 'text' ? textValues(dataset, q, filter).length : b.answered} answered
          {b.notApplicable > 0 && ` · ${b.notApplicable} NA/DK`}
          {' · '}
          {q.kind}
        </span>
      </header>

      {words && <WordCloud words={words} />}

      {q.kind === 'numeric' && b.numeric && (
        <>
          <BarList counts={b.numeric.bins} />
          <p className="muted small">
            {b.numeric.n} reports, totalling {b.numeric.sum.toLocaleString('en-GB')}.
          </p>
        </>
      )}

      {(q.kind === 'binary' || q.kind === 'categorical') && b.total.length <= 6 && (
        <Donut counts={b.total} scale={q.scale} />
      )}

      {(q.kind === 'multi' || q.kind === 'time' ||
        ((q.kind === 'categorical' || q.kind === 'ordinal') && b.total.length > 6)) && (
        <BarList counts={b.total} judged={judged} scale={q.scale} />
      )}

      {q.kind === 'ordinal' && b.total.length <= 6 && (
        <>
          <BarList counts={b.total} judged scale={q.scale} />
          {b.meanScore !== undefined && (
            <p className="muted small">Mean score {b.meanScore.toFixed(2)} on a {q.scale?.length}-point scale.</p>
          )}
        </>
      )}

      {showByParty && (
        <details className="byarea" open>
          <summary>By party</summary>
          <StackedByArea
            scale={q.scale}
            order={order}
            rows={[
              ...partiesWithData.map((label) => ({
                label,
                counts: b.byParty[label]!,
              })),
              { label: 'All parties', counts: b.total, emphasis: true },
            ]}
          />
        </details>
      )}

      {showStacked && (
        <details className="byarea">
          <summary>By area</summary>
          <StackedByArea
            scale={q.scale}
            order={order}
            rows={[
              ...areasWithData.map((label) => ({
                label,
                counts: b.byArea[label]!,
              })),
              { label: 'All areas', counts: b.total, emphasis: true },
            ]}
          />
        </details>
      )}

      <button
        type="button"
        className="link no-print"
        onClick={() =>
          downloadCsv(
            `${q.code || 'question'}.csv`,
            [
              ['Answer', 'Reports', 'Percent'],
              ...b.total.map((c) => [c.label, c.n, c.pct.toFixed(1)]),
            ],
          )
        }
      >
        CSV
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function DataQuality({ dataset, cov }: { dataset: Dataset; cov: ReturnType<typeof coverage> }) {
  const { table, questions } = dataset;
  const unknownCols = table.headers.length - new Set(questions.flatMap((q) => q.columns)).size;
  const blankAreas = cov.byGroup.filter((g) => g.reports === 0);

  return (
    <div className="stack">
      <section className="card">
        <h2>What the tool found in this file</h2>
        <table className="plain">
          <tbody>
            <tr><th>Rows read</th><td>{table.rows.length}</td></tr>
            <tr><th>Columns</th><td>{table.headers.length}</td></tr>
            <tr><th>Questions identified</th><td>{questions.length}</td></tr>
            <tr><th>Columns not mapped to a question</th><td>{unknownCols}</td></tr>
            <tr>
              <th>Rows whose area could not be matched</th>
              <td>
                {cov.ungroupedRows}
                {cov.ungroupedRows > 0 && (
                  <span className="muted"> · check the spelling in the district column</span>
                )}
              </td>
            </tr>
            <tr>
              <th>Areas with no reports</th>
              <td>{blankAreas.length ? blankAreas.map((g) => g.label).join(', ') : 'none'}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Questions as detected</h2>
        <p className="muted">
          If a question is the wrong type here, its chart will be wrong too. This table is the
          place to check that first.
        </p>
        <table className="plain scroll">
          <thead>
            <tr><th>Code</th><th>Type</th><th>Cols</th><th>Question</th></tr>
          </thead>
          <tbody>
            {questions.map((q) => (
              <tr key={`${q.code}-${q.columns[0]}`}>
                <td>{q.code || '—'}</td>
                <td>{q.kind}</td>
                <td>{q.columns.length}</td>
                <td>{q.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
