import { useId, useMemo, useState } from 'react';
import type { PlaceRate } from '@/lib/analyse';
import {
  AREA_WORDS,
  areaShapes,
  CONSTITUENCY_UNITS,
  inInset,
  INSET_BOX,
  type Division,
  type MapUnit,
} from '@/lib/gambia';
import {
  fitProjector,
  labelPoint,
  makeProjector,
  pathFor,
  shapeCentre,
  shapeWidth,
  type Projector,
} from '@/lib/projection';

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
  /** Which division the file counts: eight LGAs, or seven regions. */
  division?: Division;
  /**
   * The shapes to draw, where they are not the areas.
   *
   * The constituency map passes its forty-six units, and only the ones
   * that were observed are named: forty-six names will not fit a
   * country thirty miles across, and the hatching says the rest.
   */
  units?: MapUnit[];
}

export function GambiaMap({
  rates,
  suffix,
  colour = '#12239E',
  selected,
  onSelect,
  compact,
  division = 'lga',
  units,
}: MapProps) {
  const titleId = useId();
  const [hover, setHover] = useState<string | null>(null);

  const projector = useMemo(() => makeProjector(VIEW_W), []);
  const shapes = useMemo(() => units ?? areaShapes(division), [units, division]);
  const byPlace = useMemo(() => new Map(rates.map((r) => [r.place, r])), [rates]);

  const max = useMemo(() => {
    const vals = rates.map((r) => r.pct).filter((v): v is number => v !== null);
    return vals.length ? Math.max(...vals, 0.0001) : 1;
  }, [rates]);

  const drawn = useMemo(
    () =>
      shapes.map(({ key, label, shape }) => ({
        key,
        name: label,
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
          Map of The Gambia by {AREA_WORDS[division].one}. The same figures appear in the
          table beside the map.
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
          drawn.map(({ key, name, label, width }) => {
            const r = byPlace.get(key);
            const has = r && r.pct !== null;
            if (units && !has) return null;
            const size = 15;
            /*
             * A name wider than the shape it names is dropped.
             *
             * On the areas every name fits. On the constituencies the
             * urban ones are a few pixels across, and "Banjul North"
             * written over them lands on Bakau and then neither can be
             * read. The figure stays, the name is on hover, and the
             * list below the map names them all.
             */
            const fits = !units || name.length * size * 0.55 <= width;
            return (
              <g key={`t-${key}`} pointerEvents="none">
                {fits && (
                  <text
                    x={label[0]}
                    y={label[1] - 4}
                    textAnchor="middle"
                    className="map-name"
                    style={{ fontSize: size }}
                  >
                    {name}
                  </text>
                )}
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
  division = 'lga',
}: {
  rates: PlaceRate[];
  suffix: '%' | '';
  answerLabel: string;
  division?: Division;
}) {
  const withData = rates.filter((r) => r.total > 0).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
  const without = rates.filter((r) => r.total === 0);
  return (
    <div className="overflow-x">
      <table className="plain">
        <thead>
          <tr>
            <th>{AREA_WORDS[division].heading}</th>
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
      {without.length > 0 && (
        <p className="muted small mt">
          {without.length} of the {rates.length} {AREA_WORDS[division].many} returned no
          reports.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** One constituency's reports. */
export interface BubblePoint {
  key: string;
  label: string;
  n: number;
}

/**
 * Where the reports came from, as a circle on each constituency.
 *
 * The same picture the deck draws, and for the same reasons: a
 * choropleth of 46 shapes is mostly hatching with thin ribbons along
 * the river, and the names do not fit. The circle says where and how
 * much; which constituency it is, is on hover and in the list under
 * the map.
 */
export function BubbleMap({
  points,
  colour = '#12239E',
  division = 'lga',
}: {
  points: BubblePoint[];
  colour?: string;
  division?: Division;
}) {
  const titleId = useId();
  const [hover, setHover] = useState<string | null>(null);

  const projector = useMemo(() => makeProjector(VIEW_W), []);
  const shapes = useMemo(() => areaShapes(division), [division]);
  const units = useMemo(() => new Map(CONSTITUENCY_UNITS.map((u) => [u.key, u])), []);

  const size = VIEW_W / 45;
  const gap = size * 0.8;
  const titleH = size * 1.5;
  const [bminLon, bminLat, bmaxLon, bmaxLat] = INSET_BOX;
  const aspect =
    ((bmaxLon - bminLon) * Math.cos((((bminLat + bmaxLat) / 2) * Math.PI) / 180)) /
    (bmaxLat - bminLat);
  // As on the deck: a wide picture is scaled to its column by width,
  // so height is the scarce dimension and the inset takes what is left.
  const insetW = Math.min(VIEW_W * 0.3, (VIEW_W * 0.47 - projector.height - gap - titleH) * aspect);
  const insetH = insetW / aspect;
  const x0 = size * 0.6;
  const y0 = projector.height + gap + titleH;
  const height = y0 + insetH;

  const inset = useMemo(() => {
    const fitted = fitProjector(INSET_BOX, insetW, insetH, 2);
    return {
      width: insetW,
      height: insetH,
      project: (lon: number, lat: number): [number, number] => {
        const [px, py] = fitted.project(lon, lat);
        return [x0 + px, y0 + py];
      },
    };
  }, [insetW, insetH, x0, y0]);

  const biggest = Math.max(1, ...points.map((p) => p.n));
  // The deck sizes them the same way. See `bubbleMapPng`.
  const rMin = size * 0.32;
  const rMax = size * 0.95;
  const radiusOf = (n: number): number => rMin + (rMax - rMin) * Math.sqrt(n / biggest);

  const circles = (p: Projector, which: BubblePoint[]) =>
    // Biggest first, so a small circle lands on top of a large one
    // rather than inside it.
    [...which]
      .sort((a, b) => b.n - a.n)
      .map((point) => {
        const unit = units.get(point.key);
        if (!unit) return null;
        const [cx, cy] = p.project(...shapeCentre(unit.shape));
        const r = radiusOf(point.n);
        return (
          <g
            key={`${p === projector ? 'c' : 'i'}-${point.key}`}
            onMouseEnter={() => setHover(point.key)}
            onMouseLeave={() => setHover(null)}
            tabIndex={0}
            onFocus={() => setHover(point.key)}
            onBlur={() => setHover(null)}
          >
            <title>{`${point.label}: ${point.n} reports`}</title>
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill={colour}
              fillOpacity={hover === point.key ? 1 : 0.85}
              stroke="#FFFFFF"
              strokeWidth={Math.max(1, size / 12)}
            />
            {r > size * 0.62 && (
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#FFFFFF"
                style={{ fontSize: size * 0.8, fontWeight: 700 }}
                pointerEvents="none"
              >
                {point.n}
              </text>
            )}
          </g>
        );
      });

  /*
   * The country, and the name of each area on it. The circles carry no
   * names - fifty-three will not fit - so the area under them is what
   * says where a reader is looking. An area too narrow for its own
   * name goes without one; Banjul and Kanifing are named in the inset.
   */
  const spotsOf = (p: Projector, which: BubblePoint[]) =>
    which.flatMap((point) => {
      const unit = units.get(point.key);
      if (!unit) return [];
      const [cx, cy] = p.project(...shapeCentre(unit.shape));
      return [{ cx, cy, r: radiusOf(point.n) }];
    });

  const land = (
    p: Projector,
    keyPrefix: string,
    spots: { cx: number; cy: number; r: number }[],
  ) => [
    ...shapes.map(({ key, shape }) => (
      <path
        key={`${keyPrefix}-${key}`}
        d={pathFor(shape, p)}
        fill="#EDF0F3"
        stroke="#FFFFFF"
        strokeWidth={1.2}
      />
    )),
    ...shapes
      .map(({ key, label, shape }) => {
        // The deck measures the text; an SVG cannot, so this is the
        // width of an average character in this face, and a shade
        // under it rather than over: a name dropped that would have
        // fitted is the worse mistake of the two.
        const w = label.length * size * 0.38;
        if (w > shapeWidth(shape, p)) return null;
        const [nx, ny] = p.project(...shapeCentre(shape));
        // Clear of the circles, which are drawn over the names: an
        // area's centroid is often where one of its circles lands.
        const clear = (at: number): boolean =>
          !spots.some(
            (sp) =>
              Math.abs(sp.cx - nx) < sp.r + w / 2 + size * 0.2 &&
              Math.abs(sp.cy - at) < sp.r + size * 0.6,
          );
        const at = [0, -1.3, 1.3, -2.6, 2.6].map((k) => ny + k * size).find(clear);
        if (at === undefined) return null;
        // A name just placed is something for the next one to avoid.
        spots.push({ cx: nx, cy: at, r: Math.max(w, size) / 2 });
        return (
          <text
            key={`${keyPrefix}-n-${key}`}
            x={nx}
            y={at}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#5D6B76"
            style={{ fontSize: size * 0.78 }}
            pointerEvents="none"
          >
            {label}
          </text>
        );
      })
      .filter((n) => n !== null),
  ];

  const onCountry = points.filter((p) => !inInset(p.key));
  const urban = points.filter((p) => inInset(p.key));
  const [bx1, by1] = projector.project(bminLon, bmaxLat);
  const [bx2, by2] = projector.project(bmaxLon, bminLat);
  const hovered = points.find((p) => p.key === hover);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${VIEW_W} ${height}`}
        className="map"
        role="group"
        aria-labelledby={titleId}
      >
        <title id={titleId}>
          Reports by constituency, as a circle on each one heard from, with Greater Banjul
          drawn again beside the country. The same figures are in the list below.
        </title>
        <defs>
          <clipPath id={`${titleId}-inset`}>
            <rect x={x0} y={y0} width={insetW} height={insetH} />
          </clipPath>
        </defs>

        {land(projector, 'c', spotsOf(projector, onCountry))}
        {circles(projector, onCountry)}

        {/* The box on the country saying where the inset is: without it
            a reader has a second map of somewhere and no way of telling
            where. */}
        <rect
          x={bx1}
          y={by1}
          width={bx2 - bx1}
          height={by2 - by1}
          fill="none"
          stroke="#5D6B76"
          strokeWidth={1.2}
        />
        <path
          d={`M${bx1} ${by2} L${x0} ${y0} M${bx2} ${by2} L${x0 + insetW} ${y0}`}
          stroke="#5D6B76"
          strokeWidth={1.2}
          fill="none"
        />
        <text
          x={x0}
          y={y0 - size * 0.45}
          fill="#252423"
          style={{ fontSize: size * 0.8, fontWeight: 700 }}
        >
          Greater Banjul
        </text>

        <g clipPath={`url(#${titleId}-inset)`}>
          {land(inset, 'i', spotsOf(inset, urban))}
          {circles(inset, urban)}
        </g>
        <rect
          x={x0}
          y={y0}
          width={insetW}
          height={insetH}
          fill="none"
          stroke="#5D6B76"
          strokeWidth={1.2}
        />
      </svg>

      {hovered && (
        <div className="card map-readout" role="status">
          <strong>{hovered.label}</strong>
          <span>
            {' '}
            · <strong>{hovered.n}</strong> {hovered.n === 1 ? 'report' : 'reports'}
          </span>
        </div>
      )}
    </figure>
  );
}
