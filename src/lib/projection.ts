import { GAMBIA_BBOX, type BoundaryShape } from '@/data/boundaries';

/**
 * Project longitude and latitude onto a drawing surface.
 *
 * An equirectangular projection with the x axis scaled by the cosine of the
 * mid-latitude. For a country 350km wide sitting at 13 degrees north, that
 * is visually indistinguishable from a proper conic projection and needs no
 * projection library, which keeps the bundle small enough to inline.
 */

export interface Projector {
  width: number;
  height: number;
  project(lon: number, lat: number): [number, number];
}

export function makeProjector(width: number, padding = 6): Projector {
  if (!(width > padding * 2 + 1)) {
    throw new Error(`makeProjector needs a width greater than ${padding * 2 + 1}, got ${width}`);
  }
  const [minLon, minLat, maxLon, maxLat] = GAMBIA_BBOX;
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const kx = Math.cos(midLat);

  const spanX = (maxLon - minLon) * kx;
  const spanY = maxLat - minLat;

  const inner = width - padding * 2;
  const scale = inner / spanX;
  const height = spanY * scale + padding * 2;

  return {
    width,
    height,
    project(lon: number, lat: number) {
      return [
        padding + (lon - minLon) * kx * scale,
        // Latitude increases northwards, screen y increases downwards.
        padding + (maxLat - lat) * scale,
      ];
    },
  };
}

/** An SVG path for one shape, all rings included. */
export function pathFor(shape: BoundaryShape, p: Projector): string {
  const parts: string[] = [];
  for (const ring of shape.rings) {
    let d = '';
    for (let i = 0; i < ring.length; i += 2) {
      const [x, y] = p.project(ring[i]!, ring[i + 1]!);
      d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    if (d) parts.push(`${d}Z`);
  }
  return parts.join('');
}

/**
 * A point inside the shape to hang a label on.
 *
 * The centroid of the largest ring, pulled back inside the ring's bounding
 * box if the shape is concave enough to put its centroid outside itself,
 * which happens with the river districts.
 */
export function labelPoint(shape: BoundaryShape, p: Projector): [number, number] {
  return p.project(...shapeCentre(shape));
}

/**
 * Where a shape's label or bubble sits, in degrees.
 *
 * The centroid of the largest ring, clamped into its own bounding box
 * so a crescent-shaped area does not put its name out at sea.
 */
export function shapeCentre(shape: BoundaryShape): [number, number] {
  const ring = shape.rings[0];
  if (!ring || ring.length < 4) return [0, 0];

  let area = 0;
  let cx = 0;
  let cy = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < ring.length; i += 2) {
    const x1 = ring[i]!;
    const y1 = ring[i + 1]!;
    const j = (i + 2) % ring.length;
    const x2 = ring[j]!;
    const y2 = ring[j + 1]!;
    const cross = x1 * y2 - x2 * y1;
    area += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
    if (x1 < minX) minX = x1;
    if (x1 > maxX) maxX = x1;
    if (y1 < minY) minY = y1;
    if (y1 > maxY) maxY = y1;
  }

  if (Math.abs(area) < 1e-12) {
    return [(minX + maxX) / 2, (minY + maxY) / 2];
  }
  area /= 2;
  let lon = cx / (6 * area);
  let lat = cy / (6 * area);
  lon = Math.min(maxX, Math.max(minX, lon));
  lat = Math.min(maxY, Math.max(minY, lat));
  return [lon, lat];
}

/** Width of a shape on screen, for deciding whether a label will fit. */
export function shapeWidth(shape: BoundaryShape, p: Projector): number {
  const ring = shape.rings[0];
  if (!ring) return 0;
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    const [x] = p.project(ring[i]!, ring[i + 1]!);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  return maxX - minX;
}

/**
 * A projector that fits one rectangle of the world into one rectangle
 * of a canvas.
 *
 * `makeProjector` always draws the whole country at the width it is
 * given. The inset draws a corner of it - Greater Banjul, where a
 * third of the electorate lives on one per cent of the land - at
 * whatever scale the panel allows.
 */
export function fitProjector(
  box: [number, number, number, number],
  width: number,
  height: number,
  padding = 4,
): Projector {
  const [minLon, minLat, maxLon, maxLat] = box;
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max(1e-9, (maxLon - minLon) * kx);
  const spanY = Math.max(1e-9, maxLat - minLat);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
  const offX = (width - spanX * scale) / 2;
  const offY = (height - spanY * scale) / 2;
  return {
    width,
    height,
    project(lon: number, lat: number) {
      return [offX + (lon - minLon) * kx * scale, offY + (maxLat - lat) * scale];
    },
  };
}

/** The bounding box of some shapes, in degrees, padded by a fraction. */
export function boxOf(shapes: BoundaryShape[], pad = 0.06): [number, number, number, number] {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const s of shapes) {
    for (const ring of s.rings) {
      for (let i = 0; i < ring.length; i += 2) {
        const lon = ring[i]!;
        const lat = ring[i + 1]!;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  const px = (maxLon - minLon) * pad;
  const py = (maxLat - minLat) * pad;
  return [minLon - px, minLat - py, maxLon + px, maxLat + py];
}
