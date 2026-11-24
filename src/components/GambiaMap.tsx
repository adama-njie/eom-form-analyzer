import { useId, useMemo, useState } from 'react';
import type { PlaceRate } from '@/lib/analyse';
import { LGAS, LGA_SHAPES } from '@/lib/gambia';
import { labelPoint, makeProjector, pathFor, shapeWidth } from '@/lib/projection';

/**
 * Choropleth of The Gambia on its real boundaries.
 *
 * Two rules it must not break:
 *
 *  - A place with no reports is hatched, never shaded at the bottom of the
 *    ramp. "Nobody observed here" and "nobody reported a problem here" are
 *    different statements, and an observation map that conflates them is
 *    misleading in the direction that matters most.
 *  - Every figure on the map is also available as text beside it, because a
 *    colour ramp is not a readable substitute for a number.
 */

const VIEW_W = 980;

export interface MapProps {
  rates: PlaceRate[];
  /** "%" for rates, "" for counts. */
  suffix: '%' | '';
  colour?: string;
  selected?: string | null;
  onSelect?: (place: string | null) => void;
  /** Hide in-shape labels, for small renders. */
  compact?: boolean;
}

export function GambiaMap({
  rates,
  suffix,
  colour = '#12239E',
  selected,
  onSelect,
  compact,
}: MapProps) {
  const titleId = useId();
  const [hover, setHover] = useState<string | null>(null);

  const projector = useMemo(() => makeProjector(VIEW_W), []);
  const shapes = LGA_SHAPES;
  const byPlace = useMemo(() => new Map(rates.map((r) => [r.place, r])), [rates]);

  const max = useMemo(() => {
    const vals = rates.map((r) => r.pct).filter((v): v is number => v !== null);
    return vals.length ? Math.max(...vals, 0.0001) : 1;
  }, [rates]);

  const drawn = useMemo(
    () =>
      shapes.map(({ key, shape }) => ({
        key,
        d: pathFor(shape, projector),
        label: labelPoint(shape, projector),
        width: shapeWidth(shape, projector),
      })),
    [shapes, projector],
  );

  const active = hover ?? selected ?? null;
  const activeRate = active ? byPlace.get(active) : undefined;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${projector.width} ${projector.height}`}
        className="map"
        role="group"
        aria-labelledby={titleId}
        onMouseLeave={() => setHover(null)}
      >
        <title id={titleId}>
          Map of The Gambia by Local Government Area. The same figures appear in the table
          beside the map.
        </title>
        <defs>
          <pattern
            id="gm-nodata"
            width="7"
            height="7"
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
          >
            <rect width="7" height="7" fill="#F0F3F5" />
            <line x1="0" y1="0" x2="0" y2="7" stroke="#C3CBD1" strokeWidth="2.5" />
          </pattern>
        </defs>

        {drawn.map(({ key, d }) => {
          const r = byPlace.get(key);
          const has = r && r.pct !== null;
          const intensity = has ? 0.14 + (r.pct! / max) * 0.86 : 0;
          const isSel = selected === key;
          const isHot = active === key;
          return (
            <path
              key={key}
              d={d}
              fill={has ? colour : 'url(#gm-nodata)'}
              fillOpacity={has ? intensity : 1}
              stroke={isSel ? '#101518' : '#FFFFFF'}
              strokeWidth={isSel ? 2.6 : isHot ? 1.8 : 0.9}
              strokeLinejoin="round"
              tabIndex={0}
              role="button"
              aria-pressed={isSel}
              aria-label={
                has
                  ? `${key}: ${r!.pct!.toFixed(1)}${suffix}, ${r!.n} of ${r!.total} reports`
                  : `${key}: no reports`
              }
              className="map-shape"
              onMouseEnter={() => setHover(key)}
              onFocus={() => setHover(key)}
              onBlur={() => setHover(null)}
              onClick={() => onSelect?.(isSel ? null : key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect?.(isSel ? null : key);
                }
              }}
            />
          );
        })}


        {!compact &&
          drawn.map(({ key, label }) => {
            const r = byPlace.get(key);
            const has = r && r.pct !== null;
            const size = 15;
            return (
              <g key={`t-${key}`} pointerEvents="none">
                <text
                  x={label[0]}
                  y={label[1] - 4}
                  textAnchor="middle"
                  className="map-name"
                  style={{ fontSize: size }}
                >
                  {key}
                </text>
                <text
                  x={label[0]}
                  y={label[1] + 13}
                  textAnchor="middle"
                  className="map-figure"
                  style={{ fontSize: size + 1 }}
                >
                  {has ? `${r!.pct!.toFixed(0)}${suffix}` : '–'}
                </text>
              </g>
            );
          })}
      </svg>

      {activeRate && (
        <div className="card map-readout" role="status">
          <strong>{activeRate.place}</strong>
          {activeRate.pct === null ? (
            <span className="muted"> · no reports</span>
          ) : (
            <span>
              {' '}
              · <strong>
                {activeRate.pct.toFixed(1)}
                {suffix}
              </strong>
              <span className="muted">
                {' '}
                ({activeRate.n} of {activeRate.total} reports)
              </span>
            </span>
          )}
        </div>
      )}

      <Legend colour={colour} max={max} suffix={suffix} />
    </figure>
  );
}

function Legend({ colour, max, suffix }: { colour: string; max: number; suffix: '%' | '' }) {
  const steps = [0.14, 0.355, 0.57, 0.785, 1];
  return (
    <div className="map-legend">
      <span className="muted small">0</span>
      {steps.map((s) => (
        <span key={s} className="legend-step" style={{ background: colour, opacity: s }} />
      ))}
      <span className="muted small">
        {max.toFixed(0)}
        {suffix}
      </span>
      <span className="legend-nodata" />
      <span className="muted small">no reports</span>
    </div>
  );
}

/** The map's data as a table, always rendered alongside it. */
export function MapTable({
  rates,
  suffix,
  answerLabel,
}: {
  rates: PlaceRate[];
  suffix: '%' | '';
  answerLabel: string;
}) {
  const withData = rates.filter((r) => r.total > 0).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
  const without = rates.filter((r) => r.total === 0);
  return (
    <div className="overflow-x">
      <table className="plain">
        <thead>
          <tr>
            <th>Local Government Area</th>
            <th style={{ textAlign: 'right' }}>{answerLabel}</th>
            <th style={{ textAlign: 'right' }}>Reports</th>
            <th style={{ textAlign: 'right' }}>{suffix === '%' ? 'Rate' : 'Count'}</th>
          </tr>
        </thead>
        <tbody>
          {withData.map((r) => (
            <tr key={r.place}>
              <th scope="row">{r.place}</th>
              <td style={{ textAlign: 'right' }}>{r.n}</td>
              <td style={{ textAlign: 'right' }}>{r.total}</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>
                {r.pct === null ? '—' : `${r.pct.toFixed(1)}${suffix}`}
              </td>
            </tr>
          ))}
          {without.length > 0 && (
            <tr>
              <th scope="row" className="muted">
                No reports
              </th>
              <td colSpan={3} className="muted">
                {without.map((r) => r.place).join(', ')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {withData.length < LGAS.length && (
        <p className="muted small mt">
          {LGAS.length - withData.length} of the 8 Local Government Areas returned no reports.
        </p>
      )}
    </div>
  );
}
