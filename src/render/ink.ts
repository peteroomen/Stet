/**
 * Hand-inked drawing primitives.
 *
 * Two rules make this read as pen on paper rather than as vector art:
 *
 *  1. Wobble is DETERMINISTIC, hashed from a stable per-entity seed. Random
 *     jitter per frame looks like the board is vibrating, not like it was drawn.
 *  2. Every stroke is drawn twice — a confident pass and a lighter one slightly
 *     offset — because a real nib never lays a line down evenly.
 *
 * The `boil` argument opts a stroke into 2-frame animation boil (the classic
 * hand-drawn shimmer). It is quantised to ~9fps so it reads as redrawing rather
 * than as noise. The cached paper layer passes boil = 0; live entities don't.
 */

export type Pt = [number, number];

/** Stable hash → [0,1). Three inputs so (seed, vertex, boil-frame) all vary it. */
export function hash3(a: number, b: number, c: number): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 2246822519)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const SUBDIV = 3;

/** Subdivide a polyline and nudge every vertex — the line "was drawn by hand". */
export function wobble(pts: Pt[], seed: number, amp: number, boil: number): Pt[] {
  if (pts.length < 2) return pts;
  const out: Pt[] = [];
  let n = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    for (let j = 0; j < SUBDIV; j++, n++) {
      const t = j / SUBDIV;
      const ox = (hash3(seed, n, boil) - 0.5) * amp * 2;
      const oy = (hash3(seed + 8191, n, boil) - 0.5) * amp * 2;
      out.push([x0 + (x1 - x0) * t + ox, y0 + (y1 - y0) * t + oy]);
    }
  }
  const last = pts[pts.length - 1];
  out.push([
    last[0] + (hash3(seed, 4093, boil) - 0.5) * amp * 2,
    last[1] + (hash3(seed + 8191, 4093, boil) - 0.5) * amp * 2,
  ]);
  return out;
}

export interface StrokeOpts {
  color: string;
  width: number;
  seed: number;
  amp?: number;
  alpha?: number;
  boil?: number;
  closed?: boolean;
  /** Two passes reads as ink; one reads as a plotter. */
  passes?: number;
  dash?: number[];
}

export function inkStroke(ctx: CanvasRenderingContext2D, pts: Pt[], o: StrokeOpts): void {
  if (pts.length < 2) return;
  const amp = o.amp ?? 1.0;
  const passes = o.passes ?? 2;
  const alpha = o.alpha ?? 1;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = o.color;
  if (o.dash) ctx.setLineDash(o.dash);

  for (let k = 0; k < passes; k++) {
    ctx.globalAlpha = alpha * (k === 0 ? 1 : 0.38);
    ctx.lineWidth = o.width * (k === 0 ? 1 : 0.62);
    const w = wobble(pts, o.seed + k * 977, amp, o.boil ?? 0);
    ctx.beginPath();
    ctx.moveTo(w[0][0], w[0][1]);
    for (let i = 1; i < w.length; i++) ctx.lineTo(w[i][0], w[i][1]);
    if (o.closed) ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

/** An irregular closed blob — ink blots, splatter, wax seals. */
export function blobPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  seed: number,
  irregularity = 0.34,
  points = 13,
  boil = 0,
): void {
  ctx.beginPath();
  const pts: Pt[] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const rr = r * (1 - irregularity / 2 + hash3(seed, i, boil) * irregularity);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  // Midpoint-quadratic so the outline curves like a spreading blot rather than
  // reading as a polygon.
  ctx.moveTo((pts[0][0] + pts[points - 1][0]) / 2, (pts[0][1] + pts[points - 1][1]) / 2);
  for (let i = 0; i < points; i++) {
    const cur = pts[i];
    const next = pts[(i + 1) % points];
    ctx.quadraticCurveTo(cur[0], cur[1], (cur[0] + next[0]) / 2, (cur[1] + next[1]) / 2);
  }
  ctx.closePath();
}

export function inkBlob(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  seed: number,
  alpha = 1,
  irregularity = 0.34,
  boil = 0,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  blobPath(ctx, cx, cy, r, seed, irregularity, 13, boil);
  ctx.fill();
  ctx.restore();
}

/**
 * A splatter: one body plus a scatter of satellites, thrown along `angle`.
 * Used both for live particles and for the stains they leave behind.
 */
export function inkSplat(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  seed: number,
  alpha: number,
  angle: number,
  spread: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  blobPath(ctx, cx, cy, r, seed, 0.5);
  ctx.fill();
  const n = 3 + Math.floor(hash3(seed, 71, 0) * 4);
  for (let i = 0; i < n; i++) {
    const a = angle + (hash3(seed, i * 13 + 3, 0) - 0.5) * spread;
    const d = r * (0.9 + hash3(seed, i * 7 + 11, 0) * 2.6);
    const rr = r * (0.14 + hash3(seed, i * 5 + 17, 0) * 0.34);
    ctx.globalAlpha = alpha * (0.5 + hash3(seed, i * 3 + 23, 0) * 0.5);
    blobPath(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr, seed + i * 131, 0.55);
    ctx.fill();
  }
  ctx.restore();
}

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeOutQuint = (t: number): number => 1 - Math.pow(1 - t, 5);
export const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
