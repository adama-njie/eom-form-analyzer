import type { Count, GroupMean, Percentage } from '@/lib/analyse';
import { basisLine, meanLabel } from '@/lib/analyse';
import { AREA_WORDS, type Division } from '@/lib/gambia';
import { NON_ANSWERS } from '@/lib/schema';
import { ACCENT, ACCENT_DEEP, CAT, NOT_APPLICABLE, SCALE } from '@/lib/theme';

/**
 * Hand-rolled SVG charts.
 *
 * No charting library: the whole tool has to inline into a single HTML file
 * that opens offline, and the four shapes a form report needs are simple
 * enough that a dependency would cost more than it saves.
 */

/*
 * The same palette the deck and the report use, so a chart looks the same on
 * screen as it does in the file the briefing is given from. The values live
 * in theme.ts, measured out of the mission's own reference report.
 */

/** Sequential palette for ordered scales, bad to good. */
export const SCALE_COLOURS = SCALE.map((c) => `#${c}`);
/** Categorical palette. */
export const CAT_COLOURS = CAT.map((c) => `#${c}`);
const YES = `#${ACCENT}`;
const NO = `#${ACCENT_DEEP}`;
const NEUTRAL = `#${NOT_APPLICABLE}`;
/** The single fill for a plain count chart. */
const BAR = `#${ACCENT_DEEP}`;

/**
 * Yes/No/NA get fixed colours so a reader never has to check the legend.
 *
 * The same three everywhere, and the same ones the deck uses: Yes light
 * blue, No dark blue, NA grey. They used to turn on whether Yes was the bad
 * answer to this particular question, which meant the same answer was a
 * different colour on the next card down.
 */
export function colourFor(label: string, index: number, scale?: string[]): string {
  if (label === 'Yes') return YES;
  if (label === 'No') return NO;
  if (NON_ANSWERS.has(label)) return NEUTRAL;
  if (scale && scale.length > 1) {
    const i = scale.indexOf(label);
    if (i >= 0) {
      const step = (SCALE_COLOURS.length - 1) / (scale.length - 1);
      return SCALE_COLOURS[Math.round(i * step)]!;
    }
  }
  return CAT_COLOURS[index % CAT_COLOURS.length]!;
}

export function fmtPct(v: number): string {
  return `${v.toFixed(v < 10 ? 1 : 0)}%`;
}

/* ------------------------------------------------------------------ */

export function Donut({
  counts,
  scale,
  size = 150,
}: {
  counts: Count[];
  scale?: string[];
  size?: number;
}) {
  const total = counts.reduce((s, c) => s + c.n, 0);
  if (total === 0) return <p className="muted">No answers.</p>;
  const r = size / 2;
  const thickness = size * 0.26;
  const circumference = 2 * Math.PI * (r - thickness / 2);
  let offset = 0;

  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
        <title>{counts.map((c) => `${c.label}: ${c.n}`).join(', ')}</title>
        <g transform={`rotate(-90 ${r} ${r})`}>
          {counts.map((c, i) => {
            const frac = c.n / total;
            const dash = frac * circumference;
            const el = (
              <circle
                key={c.label}
                cx={r}
                cy={r}
                r={r - thickness / 2}
                fill="none"
                stroke={colourFor(c.label, i, scale)}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return el;
          })}
        </g>
        <text x={r} y={r - 2} textAnchor="middle" className="donut-total">
          {total}
        </text>
        <text x={r} y={r + 14} textAnchor="middle" className="donut-sub">
          reports
        </text>
      </svg>
      <ul className="legend">
        {counts.map((c, i) => (
          <li key={c.label}>
            <span
              className="swatch"
              style={{ background: colourFor(c.label, i, scale) }}
            />
            <span className="legend-label">{c.label}</span>
            <span className="legend-value">
              {c.n} <span className="muted">({fmtPct(c.pct)})</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function BarList({
  counts,
  judged,
  scale,
  max,
}: {
  counts: Count[];
  judged?: boolean;
  scale?: string[];
  max?: number;
}) {
  if (counts.length === 0) return <p className="muted">No answers.</p>;
  const ceiling = max ?? Math.max(...counts.map((c) => c.n), 1);
  return (
    <ul className="barlist">
      {counts.map((c, i) => (
        <li key={c.label}>
          <span className="barlist-label" title={c.label}>
            {c.label}
          </span>
          <span className="barlist-track">
            <span
              className="barlist-fill"
              style={{
                width: `${(c.n / ceiling) * 100}%`,
                // One colour down the list unless colour is carrying
                // something. Each bar already has its name beside it, so a
                // different hue per bar only suggests a grouping that is not
                // there, and on a banded numeric question it contradicts the
                // order the bands are in.
                background:
                  judged || scale
                    ? colourFor(c.label, i, scale)
                    : NON_ANSWERS.has(c.label)
                      ? NEUTRAL
                      : BAR,
              }}
            />
          </span>
          <span className="barlist-value">
            {c.n} <span className="muted">{fmtPct(c.pct)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */

/**
 * A percentage question, averaged.
 *
 * The bars run against a fixed 0 to 100 track rather than against the
 * largest of them, because the thing being drawn is already a percentage:
 * a party averaging 30% must not fill the same width as one averaging 95%.
 * Each bar carries the number of reports behind it, since an average of
 * two estimates and an average of twelve look identical otherwise.
 */
export function MeanBars({ rows }: { rows: GroupMean[] }) {
  if (rows.length === 0) return <p className="muted">No answers.</p>;
  return (
    <ul className="barlist">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="barlist-label" title={r.label}>
            {r.label}
          </span>
          <span className="barlist-track">
            <span
              className="barlist-fill"
              style={{ width: `${Math.max(0, Math.min(100, r.mean))}%`, background: BAR }}
            />
          </span>
          <span className="barlist-value">
            {meanLabel(r.mean)}% <span className="muted">of {r.n}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The figure, then the same figure by party and by area. */
export function PercentPanel({ p, division }: { p: Percentage; division: Division }) {
  return (
    <>
      {/*
        * The figure alone. It used to carry "mean of 36 estimates" beside
        * it, which read as a hedge rather than as a base; how many reports
        * are behind each bar is on the bars, and the total is on the
        * coverage line at the top of the page.
        */}
      <p className="percent-headline">
        <strong>{meanLabel(p.mean)}%</strong>
      </p>
      {/*
        * Except where the form did not ask for a share. "32%" under "Total
        * number of voters who had already voted" needs its denominator: it
        * is a share of the station's list, not of the reports.
        */}
      {basisLine(p) && <p className="muted small percent-basis">{basisLine(p)}</p>}
      {p.byParty.length > 1 && (
        <>
          <h4 className="chart-sub">By party</h4>
          <MeanBars rows={p.byParty} />
        </>
      )}
      {p.byType && p.byType.length > 1 && (
        <>
          <h4 className="chart-sub">By station type</h4>
          <MeanBars rows={p.byType} />
        </>
      )}
      {p.byArea.length > 1 && (
        <>
          <h4 className="chart-sub">By {AREA_WORDS[division].one}</h4>
          <MeanBars rows={p.byArea} />
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

export interface StackedRow {
  label: string;
  counts: Count[];
  emphasis?: boolean;
}

/**
 * 100 per cent stacked bars, one row per area plus a national row. This is
 * the view a mission reads first: it answers "is this worse somewhere than
 * it is overall" at a glance.
 */
export function StackedByArea({
  rows,
  order,
  scale,
}: {
  rows: StackedRow[];
  order: string[];
  scale?: string[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="stacked">
      {rows.map((row) => {
        const total = row.counts.reduce((s, c) => s + c.n, 0);
        return (
          <div key={row.label} className={`stacked-row${row.emphasis ? ' is-national' : ''}`}>
            <span className="stacked-label">{row.label}</span>
            <span className="stacked-track">
              {total === 0 ? (
                <span className="stacked-empty">no reports</span>
              ) : (
                order.map((label, i) => {
                  const c = row.counts.find((x) => x.label === label);
                  if (!c || c.n === 0) return null;
                  const pct = (c.n / total) * 100;
                  return (
                    <span
                      key={label}
                      className="stacked-seg"
                      style={{
                        width: `${pct}%`,
                        background: colourFor(label, i, scale),
                      }}
                      title={`${row.label} — ${label}: ${c.n} (${fmtPct(pct)})`}
                    >
                      {pct >= 11 ? fmtPct(pct) : ''}
                    </span>
                  );
                })
              )}
            </span>
            <span className="stacked-n muted">{total}</span>
          </div>
        );
      })}
      <ul className="legend legend-inline">
        {order.map((label, i) => (
          <li key={label}>
            <span
              className="swatch"
              style={{ background: colourFor(label, i, scale) }}
            />
            <span className="legend-label">{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * A word cloud, as HTML rather than canvas.
 *
 * On screen the words can simply be laid out by the browser: a flex wrap with
 * the type size set per word reads the same as a packed cloud, reflows with
 * the pane, and keeps the words selectable, which an image does not. The deck
 * and the report need a picture and use the canvas renderer instead.
 */
export function WordCloud({ words }: { words: { word: string; n: number }[] }) {
  if (words.length === 0) return <p className="muted">No text answers.</p>;
  const max = words[0]!.n;
  const min = words[words.length - 1]!.n;
  const span = Math.max(1, max - min);

  return (
    <ul className="wordcloud">
      {words.map((w, i) => {
        // Area is what a reader judges, so size goes as the square root.
        const weight = Math.sqrt((w.n - min) / span);
        return (
          <li
            key={w.word}
            title={`${w.word}: ${w.n}`}
            style={{
              fontSize: `${(0.85 + weight * 1.9).toFixed(2)}rem`,
              color: CAT_COLOURS[i % CAT_COLOURS.length],
              fontWeight: 700,
            }}
          >
            {w.word}
          </li>
        );
      })}
    </ul>
  );
}
