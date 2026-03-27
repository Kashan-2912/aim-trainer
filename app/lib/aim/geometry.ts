export function maxRayDistFromCenter(
  w: number,
  h: number,
  angle: number
): number {
  const cx = w / 2;
  const cy = h / 2;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  let t = Infinity;
  if (ux > 1e-9) t = Math.min(t, (w - cx) / ux);
  if (ux < -1e-9) t = Math.min(t, (0 - cx) / ux);
  if (uy > 1e-9) t = Math.min(t, (h - cy) / uy);
  if (uy < -1e-9) t = Math.min(t, (0 - cy) / uy);
  return Number.isFinite(t) ? Math.max(0, t) : 0;
}

export function targetSizePx(
  dist: number,
  w: number,
  h: number,
  angle: number,
  minDim: number,
  sizeScale: number
): number {
  const D = maxRayDistFromCenter(w, h, angle);
  const minS = minDim * 0.028 * sizeScale;
  const maxS = minDim * 0.13 * sizeScale;
  if (D < 1e-6) return minS;
  const dReachMax = D * 0.48;
  const u = Math.min(1, dist / Math.max(1e-6, dReachMax));
  const eased = u * u * (3 - 2 * u);
  return minS + (maxS - minS) * eased;
}

export function targetFitsPlayfield(
  dist: number,
  w: number,
  h: number,
  angle: number,
  minDim: number,
  sizeScale: number
): boolean {
  const size = targetSizePx(dist, w, h, angle, minDim, sizeScale);
  const half = size / 2;
  const cx = w / 2 + Math.cos(angle) * dist;
  const cy = h / 2 + Math.sin(angle) * dist;
  return (
    cx - half >= 0 &&
    cx + half <= w &&
    cy - half >= 0 &&
    cy + half <= h
  );
}

export function maxSafeDistAlongRay(
  w: number,
  h: number,
  angle: number,
  minDim: number,
  sizeScale: number
): number {
  const ray = maxRayDistFromCenter(w, h, angle);
  if (ray < 1e-6) return 0;
  if (!targetFitsPlayfield(0, w, h, angle, minDim, sizeScale)) return 0;
  let lo = 0;
  let hi = ray;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (targetFitsPlayfield(mid, w, h, angle, minDim, sizeScale)) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function escapeQuadrant(
  cx: number,
  cy: number,
  w: number,
  h: number
): 0 | 1 | 2 | 3 {
  const left = cx < w / 2;
  const top = cy < h / 2;
  if (top && left) return 0;
  if (top && !left) return 1;
  if (!top && left) return 2;
  return 3;
}

export function randomBetween(
  min: number,
  max: number,
  rng: () => number = Math.random
) {
  return min + rng() * (max - min);
}

export function randomIntInclusive(
  min: number,
  max: number,
  rng: () => number = Math.random
) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/** Accuracy as tenths of a percent: 0–1000 → 0.0%–100.0% (avoids rigid integer %). */
export function accuracyHitsToTenths(hits: number, attempts: number): number {
  if (attempts <= 0 || hits < 0) return 0;
  return Math.min(1000, Math.floor((hits / attempts) * 1000));
}

export function formatAccuracyTenths(tenths: number): string {
  return `${(tenths / 10).toFixed(1)}%`;
}
