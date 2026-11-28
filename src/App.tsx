import { useCallback, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  BarList,
  Donut,
  MeanBars,
  PercentPanel,
  StackedByArea,
  WordCloud,
  fmtPct,
} from '@/components/charts';
import { GambiaMap } from '@/components/GambiaMap';
import {
  analyse,
  chartScale,
  displayCounts,
  mapsConstituencies,
  buildDataset,
  coverage,
  constituencyCoverage,
  findings,
  isWordCloud,
  ratingOf,
  ratingQuestions,
  reportsByPlace,
  reportsByUnit,
  scoreLabel,
  stationsObserved,
  textValues,
  turnoutByHour,
  type Breakdown,
  type Dataset,
} from '@/lib/analyse';
import {
  PERIODS,
  canSplitByPeriod,
  periodLabel,
  periodMask,
  periodNote,
  type Period,
} from '@/lib/period';
import { inferSchema, toTable, type Question, type Table } from '@/lib/schema';
import { AREA_WORDS, CONSTITUENCY_UNITS, SHARED_UNITS, type Division } from '@/lib/gambia';
import { wordFrequencies } from '@/lib/text';
import { downloadCsv, exportAllTables } from '@/lib/export';
import { exportPptx } from '@/lib/pptx';
import { exportReport } from '@/lib/report';
import MapTab from '@/components/MapTab';
import ExportDialog, { type ExportKind } from '@/components/ExportDialog';
import PrintView from '@/components/PrintView';
import {
  defaultSelection,
  defaultTitle,
  exportFileName,
  exportableQuestions,
  selectedQuestions,
  type ExportSelection,
} from '@/lib/selection';

type Tab = 'overview' | 'map' | 'findings' | 'questions' | 'data';

/** Questions where "Yes" is bad, so the charts should say so in colour. */
const JUDGED =
  /(problem|unauthorised|unauthorized|interfer|overcrowd|unrest|tension|campaign|missing|turned away|without proper|influence|voting together|stuffing|proxy|compelled|objection|intimidat|violence|vote buying|able to observe|accessible|adequate|protect|plain view|suitable|explained|marked with ink|secrecy|confidence|transparen|conduct|performance|understanding)/i;

export default function App() {
  /*
   * The parsed file, and the dataset built from it.
   *
   * Two states rather than one, because the dataset depends on which
   * division of the country the file reports against, and that is a
   * choice the analyst can override: rebuilding it is a few passes over
   * the rows and happens only when they change the setting.
   */
  const [source, setSource] = useState<{ table: Table; questions: Question[] } | null>(null);
  const [divisionChoice, setDivisionChoice] = useState<Division | null>(null);
  const dataset = useMemo<Dataset | null>(
    () =>
      source ? buildDataset(source.table, source.questions, divisionChoice ?? undefined) : null,
    [source, divisionChoice],
  );
  const [formName, setFormName] = useState('');
  // What the export dialogue opens with: the form's own name, not the
  // workbook's file name, because it ends up on a cover and on a file.
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [group, setGroup] = useState<string>('');
  const [team, setTeam] = useState<string>('');
  const [period, setPeriod] = useState<Period>('all');
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
      setSource({ table, questions });
      setDivisionChoice(null);
      setFormName(`${file.name} — ${best.n}`);
      setTitle(defaultTitle(file.name, best.n));
      setGroup('');
      setTeam('');
      setPeriod('all');
      setTab('overview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.');
      setSource(null);
    }
  }, []);

  const placeFilter = useMemo(() => {
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

  /*
   * The place and team filter, narrowed to the chosen period.
   *
   * Everything follows it, the exports included: picking an area and then
   * building a deck has always produced a deck of that area, and a period
   * works the same way. What that costs is a document that has to say what
   * it covers, which every cover now does - see `lib/period.ts`.
   */
  const rowFilter = useMemo(() => {
    if (!dataset) return undefined;
    const days = periodMask(dataset, period);
    if (!days) return placeFilter;
    return days.map((inside, i) => inside && (!placeFilter || placeFilter[i]!));
  }, [dataset, placeFilter, period]);

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
    // The period is the dashboard's, not the dialogue's: whatever is on
    // screen is what the export covers, and the cover says which that is.
    const note = periodNote(dataset, period);
    setSelection((current) => ({
      ...(current ?? defaultSelection(dataset, title)),
      period: note,
      periodId: period,
    }));
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
  const periodic = canSplitByPeriod(dataset);

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
          {/*
            * Which division the file reports against.
            *
            * Inferred, and switchable: both divisions call the place
            * Janjanbureh, so a file that says nothing either way - no
            * Central River reports, no list of areas in its headers - is
            * read as eight areas, and this is how an analyst says it is
            * seven. See `divisionOf`.
            */}
          {dataset.geo && (
            <select
              value={dataset.division}
              onChange={(e) => setDivisionChoice(e.target.value as Division)}
              title="Which division of the country this form reports against"
            >
              <option value="lga">Areas: 8 LGAs</option>
              <option value="region">Areas: 7 regions</option>
            </select>
          )}
          {periodic && (
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              title="Reports are placed by the date of the event, where the form records one"
            >
              {PERIODS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
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
            onClick={() =>
              exportAllTables(
                dataset,
                rowFilter,
                exportFileName(
                  { ...(selection ?? defaultSelection(dataset, title)), periodId: period },
                  'csv',
                ),
              )
            }
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

      {(group || team || period !== 'all') && (
        <p className="filter-note no-print">
          {cov!.reports} of {dataset.table.rows.length} reports
          {period === 'all' ? '' : ` · ${periodLabel(period)}`}
          {group ? ` · ${group}` : ''}
          {team ? ` · ${team} teams` : ''}
          <button
            type="button"
            className="link"
            onClick={() => {
              setGroup('');
              setTeam('');
              setPeriod('all');
            }}
          >
            clear
          </button>
          {period !== 'all' && (
            <span className="muted"> {periodNote(dataset, period)}</span>
          )}
        </p>
      )}

      <main>
        {tab === 'overview' && cov && (
          <Overview
            dataset={dataset}
            cov={cov}
            filter={rowFilter}
            periodFilter={periodMask(dataset, period)}
            onGroup={setGroup}
            group={group}
          />
        )}
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

/**
 * Reports by constituency, under the area each belongs to.
 *
 * The form asks for the LGA and then the constituency inside it, and the
 * coverage figures above only show the first. Opening an area answers the
 * next question a deployment asks: nine reports from Kanifing, but from
 * which parts of Kanifing, and which parts were not reached at all.
 */
function ConstituencyPanel({
  dataset,
  filter,
}: {
  dataset: Dataset;
  filter?: boolean[];
}) {
  const { groups, ungrouped } = useMemo(
    () => constituencyCoverage(dataset, filter),
    [dataset, filter],
  );
  if (groups.length === 0 || groups.every((g) => g.constituencies.length === 0)) return null;

  return (
    <section className="card">
      <h2>Reports by constituency</h2>
      <p className="muted small">
        Open an area to see the constituencies its reports name. A constituency that returned
        nothing is not listed, which is not the same as reporting no problems.
      </p>
      {groups.map((g) => {
        const named = g.reports - g.unnamed;
        return (
          <details key={g.area} className="byarea">
            <summary>
              {g.area}
              <span className="muted">
                {' · '}
                {g.reports} {g.reports === 1 ? 'report' : 'reports'}
                {' · '}
                {g.constituencies.length} of {g.totalConstituencies} constituencies
              </span>
            </summary>
            <BarList
              counts={[
                ...g.constituencies.map((c) => ({
                  label: c.name,
                  n: c.reports,
                  pct: named ? (c.reports / named) * 100 : 0,
                })),
                ...(g.unnamed > 0
                  ? [
                      {
                        // What those reports actually wrote. "Not named"
                        // reads as missing data when the field was filled
                        // in with a neighbourhood or a region.
                        label: g.unrecognised.length
                          ? `not a constituency: ${g.unrecognised
                              .map((u) => (u.reports > 1 ? `${u.text} (${u.reports})` : u.text))
                              .join(', ')}`
                          : 'constituency not given',
                        n: g.unnamed,
                        pct: g.reports ? (g.unnamed / g.reports) * 100 : 0,
                      },
                    ]
                  : []),
              ]}
            />
          </details>
        );
      })}
      {ungrouped > 0 && (
        <p className="muted small">
          {ungrouped} {ungrouped === 1 ? 'report names' : 'reports name'} no area and are not
          counted here.
        </p>
      )}
    </section>
  );
}

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
  filter,
  periodFilter,
  onGroup,
  group,
}: {
  dataset: Dataset;
  cov: ReturnType<typeof coverage>;
  filter?: boolean[];
  /**
   * The period alone. The map is how an area is chosen, so it keeps showing
   * every area whichever one is selected - but it must still count only the
   * period on screen, or the tile above it and the map below it disagree.
   */
  periodFilter?: boolean[];
  onGroup: (g: string) => void;
  group: string;
}) {
  // Every question the form scores, whatever section it sits in.
  const ratings = ratingQuestions(dataset);
  const stations = stationsObserved(dataset, filter);
  const turnout = turnoutByHour(dataset, filter);
  return (
    <div className="stack">
      <section className="card">
        <h2>Coverage</h2>
        <div className="statrow">
          <Stat label="Reports" value={cov.reports} />
          <Stat
            label={dataset.geo ? AREA_WORDS[dataset.division].tile : 'Districts covered'}
            value={`${cov.groupsCovered} / ${cov.groupsTotal}`}
            sub={dataset.geo ? AREA_WORDS[dataset.division].many : 'as named in the file'}
          />
          {cov.constituenciesTotal > 0 ? (
            <Stat
              label="Constituencies covered"
              value={`${cov.constituenciesCovered} / ${cov.constituenciesTotal}`}
              sub="returned at least one report"
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
          {stations !== null && (
            <Stat
              label="Polling stations"
              value={stations}
              sub="distinct stations observed"
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
            <h2>Reports by {AREA_WORDS[dataset.division].one}</h2>
            <GambiaMap
              rates={reportsByPlace(dataset, periodFilter)}
              suffix=""
              selected={group || null}
              onSelect={(p) => onGroup(p ?? '')}
              division={dataset.division}
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

      {mapsConstituencies(dataset, periodFilter) && (
        <section className="card">
          <h2>Reports by constituency</h2>
          {/*
            * The one line of prose a map gets, and it states a unit:
            * nine constituencies share a shape with their neighbours,
            * so a reader counting shapes would count 46 and believe it
            * was 53. See `CONSTITUENCY_UNITS`.
            */}
          <p className="muted small">
            Forty-four of the 53 constituencies are drawn on their own boundary;{' '}
            {SHARED_UNITS.map((u) => `${u.label} is ${u.constituencies.length}`).join(', ')}.
            Only the ones with reports are named. Hatched ground returned no reports, which is
            not the same as reporting no problems.
          </p>
          <GambiaMap
            rates={reportsByUnit(dataset, periodFilter)}
            suffix=""
            division={dataset.division}
            units={CONSTITUENCY_UNITS}
          />
        </section>
      )}

      {turnout && (
        <section className="card">
          <h2>Turnout through the day</h2>
          <p className="muted small">
            Mean share of each station&rsquo;s list that had voted, by the hour the reading was
            taken. {turnout.readings} readings, on arrival and on departure.
          </p>
          <MeanBars rows={turnout.points} />
        </section>
      )}

      {dataset.geo && <ConstituencyPanel dataset={dataset} filter={filter} />}

      {ratings.length > 0 && (
        <section className="card">
          <h2>Overall assessments</h2>
          <div className="statrow">
            {ratings.map((q) => {
              const r = ratingOf(dataset, q, filter);
              return (
                <Stat
                  key={`${q.code}-${q.columns[0]}`}
                  label={`${q.code} ${q.label}`}
                  value={r ? `${scoreLabel(r.mean)} / ${r.points}` : '—'}
                  sub={
                    r
                      ? `${fmtPct(r.goodPct)} ${r.goodLabels.join(' or ').toLowerCase()}`
                      : 'no ratings'
                  }
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
  // Only prose gets a cloud. The constituency question is also a text
  // column, and a cloud of place names sized by how often each was observed
  // is a worse version of the bar chart it gets instead.
  const words = useMemo(
    () =>
      isWordCloud(dataset, q, filter)
        ? wordFrequencies(textValues(dataset, q, filter), 45)
        : null,
    [dataset, q, filter],
  );
  const judged = JUDGED.test(q.label);
  // The order a chart reads in, which for a scale is best first. The
  // deck and the screen take it from the same place.
  const shown = displayCounts(q, b);
  const order = shown.map((c) => c.label);
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

      {b.percent && <PercentPanel p={b.percent} division={dataset.division} />}

      {q.kind === 'numeric' && !b.percent && b.numeric && (
        <>
          {/* Most first and on one blue ramp, as the deck draws it. */}
          <BarList counts={shown} scale={chartScale(q, b.total)} />
          <p className="muted small">
            {b.numeric.n} reports, totalling {b.numeric.sum.toLocaleString('en-GB')}.
          </p>
        </>
      )}

      {(q.kind === 'binary' || q.kind === 'categorical') && shown.length <= 6 && (
        <Donut counts={shown} scale={chartScale(q, b.total)} />
      )}

      {(q.kind === 'multi' || q.kind === 'time' || (q.kind === 'text' && !words) ||
        ((q.kind === 'categorical' || q.kind === 'ordinal') && shown.length > 6)) && (
        <BarList counts={shown} judged={judged} scale={chartScale(q, b.total)} />
      )}

      {q.kind === 'ordinal' && shown.length <= 6 && (
        <>
          <BarList counts={shown} judged scale={q.scale} />
          {b.meanScore !== undefined && (
            <p className="muted small">Mean score {scoreLabel(b.meanScore)} on a {q.scale?.length}-point scale.</p>
          )}
        </>
      )}

      {showByParty && (
        <details className="byarea" open>
          <summary>By party</summary>
          <StackedByArea
            scale={chartScale(q, b.total)}
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
            scale={chartScale(q, b.total)}
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
              ...shown.map((c) => [c.label, c.n, c.pct.toFixed(1)]),
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
                  <span className="muted"> · check the spelling in the area column</span>
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
