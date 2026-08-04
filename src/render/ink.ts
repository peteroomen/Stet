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

/**
 * A loaded-brush stroke: a tapered polygon along a wobbled path, with voids
 * scrubbed out of the body for dry-brush texture.
 *
 * A stroked polyline has one width for its whole length, which is exactly what
 * makes a nib a nib. A brush swells where it presses and runs dry as it lifts,
 * so the mark has to be built as a filled shape whose half-width varies along
 * the path. That is the entire difference between the two looks.
 *
 * This is expensive — the destination-out pass forces compositing — so callers
 * that draw the same mark every frame should render it through the glyph cache
 * rather than calling this directly in a render loop.
 */
export interface BrushOpts {
  color: string;
  /** Width at the fattest point of the belly. */
  width: number;
  seed: number;
  amp?: number;
  alpha?: number;
  boil?: number;
  /** 0..1 — draw only this much of the stroke, for a mark that paints itself on. */
  progress?: number;
  /** How hard the tail runs dry. 0 = none. */
  dryness?: number;
  /**
   * Depth of the low-frequency width swell along the stroke, 0..~0.5.
   *
   * This is where a brush's variation actually lives. 0 gives an even ribbon —
   * technically a brush shape, but it reads as a fat nib.
   */
  pressure?: number;
}

export function brushStroke(ctx: CanvasRenderingContext2D, pts: Pt[], o: BrushOpts): void {
  if (pts.length < 2) return;
  const full = wobble(pts, o.seed, o.amp ?? 1, o.boil ?? 0);
  const progress = clamp01(o.progress ?? 1);
  if (progress <= 0.001) return;

  // Reveal along the path so the mark reads as a brush being drawn, not a shape
  // appearing. Interpolates the final vertex so short strokes still animate.
  const exact = 1 + (full.length - 1) * progress;
  const keep = Math.max(2, Math.ceil(exact));
  const w = full.slice(0, keep);
  if (keep > 1 && keep <= full.length) {
    const t = exact - (keep - 1);
    const a = full[keep - 2];
    const b = full[keep - 1];
    w[keep - 1] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  const n = w.length;
  const left: Pt[] = [];
  const right: Pt[] = [];

  /*
   * Pressure: three fixed harmonics with a per-stroke random phase.
   *
   * The width variation used to be a single taper plus per-vertex jitter, and
   * that reads as a uniform ribbon with a fuzzy edge — the mark is the same
   * weight everywhere and only its outline wobbles. A real brush varies over the
   * LENGTH of the stroke, not vertex to vertex, so the swell has to be
   * low-frequency. Two-and-a-bit cycles across the stroke is enough to see and
   * not so much that a short glyph path turns into a caterpillar.
   */
  const ph = hash3(o.seed + 991, 0, 0) * Math.PI * 2;
  const ph2 = hash3(o.seed + 992, 0, 0) * Math.PI * 2;
  const press = o.pressure ?? 0.34;

  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    // Loaded at the start, drying to a point. The exponent controls how much of
    // the stroke sits at full width: 0.55 held ~60% of it within a fifth of the
    // maximum, which is the "too constant" read.
    const taper = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.12)), 0.72);
    const swell =
      1 + press * (0.62 * Math.sin(ph + t * 5.1) + 0.38 * Math.sin(ph2 + t * 11.3));
    const jitter = 0.93 + hash3(o.seed + 555, i, o.boil ?? 0) * 0.14;
    // The floor matters more than it looks: a glyph path is drawn as ONE stroke,
    // so its ends are the corners of a silhouette. Taper them to nothing and the
    // shape stops closing and reads as broken rather than as drawn.
    const half = (o.width / 2) * (0.24 + 0.9 * taper) * swell * jitter;
    const p = w[Math.max(0, i - 1)];
    const q = w[Math.min(n - 1, i + 1)];
    const a = Math.atan2(q[1] - p[1], q[0] - p[0]) + Math.PI / 2;
    left.push([w[i][0] + Math.cos(a) * half, w[i][1] + Math.sin(a) * half]);
    right.push([w[i][0] - Math.cos(a) * half, w[i][1] - Math.sin(a) * half]);
  }

  /*
   * Dry-brush breakup is done by SKIPPING spans of the body, not by erasing
   * them.
   *
   * The obvious implementation — fill the whole shape, then scrub voids out with
   * globalCompositeOperation 'destination-out' — works only on a canvas that
   * contains nothing else. On the shared board canvas it punched holes straight
   * through the paper, the grid and every actor underneath, and it cost a
   * composite-mode switch plus a dozen extra fills per stroke every frame.
   * Emitting the mark as disjoint runs is additive, safe anywhere, and cheaper.
   */
  const dryness = o.dryness ?? 1;
  const skip: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    // Breakup rises toward the tail, where a real brush has run out of ink.
    const chance = dryness * 0.5 * Math.pow(t, 1.7);
    skip[i] = i > 0 && i < n - 1 && hash3(o.seed + 77, i, o.boil ?? 0) < chance;
  }

  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.fillStyle = o.color;

  let start = 0;
  const emit = (a: number, b: number) => {
    if (b - a < 1) return;
    ctx.beginPath();
    ctx.moveTo(left[a][0], left[a][1]);
    for (let i = a; i <= b; i++) ctx.lineTo(left[i][0], left[i][1]);
    for (let i = b; i >= a; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath();
    ctx.fill();
  };
  for (let i = 0; i < n; i++) {
    if (skip[i]) {
      emit(start, i - 1);
      start = i + 1;
    }
  }
  emit(start, n - 1);

  ctx.restore();
}

export interface StrikeOpts {
  color: string;
  /** Constant. A typebar has one width and hits with all of it. */
  width: number;
  seed: number;
  alpha?: number;
  boil?: number;
  /** Mechanical slop, in pixels. Small — this is a machine, not a hand. */
  amp?: number;
  /**
   * How worn the ribbon is, 0..1.
   *
   * Drives the uneven inking ALONG the stroke. 0 prints like a fresh ribbon and
   * reads as vector art; the whole character of a typed page is that it does not.
   */
  wear?: number;
}

/**
 * A struck mark — the typewriter's answer to `brushStroke`.
 *
 * Not a parameterisation of the brush, because what makes type read as type is
 * the ABSENCE of everything the brush is made of. `brushStroke` is a taper plus
 * three pressure harmonics plus dry-brush breakup: a hand varying its weight
 * along a stroke. A typebar cannot vary anything. It is a piece of metal, one
 * width, hitting the page as hard as the spring will drive it.
 *
 * So what is left has to carry the whole impression, and it is three things:
 *
 *   - **Hard edges and constant weight.** Butt caps, mitred joins, one lineWidth.
 *   - **Misregistration.** Handled a level up in `paintGlyph`, because a typed
 *     character is ONE strike of one bar: the whole glyph shifts and tilts
 *     together, which is exactly what makes a typed line look typed rather than
 *     set. Per-stroke jitter would read as a shaky hand again.
 *   - **Ribbon fade.** The inking is uneven along the LENGTH of the stroke,
 *     because a worn ribbon is worn in patches — so the unevenness is walked at
 *     a fixed spatial step rather than applied per vertex.
 *
 * Segments overlap by a hair. Butt caps abutting exactly leave hairline seams of
 * bare paper at every step, which reads as a dotted line rather than a struck
 * one.
 */
export function strikeStroke(ctx: CanvasRenderingContext2D, pts: Pt[], o: StrikeOpts): void {
  if (pts.length < 2) return;
  const path = wobble(pts, o.seed, o.amp ?? 0, o.boil ?? 0);
  const alpha = o.alpha ?? 1;
  const wear = clamp01(o.wear ?? 0.4);
  /*
   * The unevenness must be FINER than the stroke is wide.
   *
   * Stepping at about the stroke width makes the mottle the same size as the
   * letterform, and the render grid was blunt about the result: every glyph read
   * as a checkerboard of tiles rather than as a struck mark, and the WARDEN's
   * bars merged into a grey block. Half the width is texture; a whole width is
   * a pattern competing with the silhouette.
   */
  const step = Math.max(1, o.width * 0.62);

  ctx.save();
  ctx.strokeStyle = o.color;
  ctx.lineWidth = o.width;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  let k = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = path[i];
    const [bx, by] = path[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 0.01) continue;
    const n = Math.max(1, Math.ceil(len / step));
    const lap = Math.min(0.5, (o.width * 0.35) / len);

    for (let j = 0; j < n; j++) {
      const t0 = j / n;
      const t1 = Math.min(1, (j + 1) / n + lap);
      const h = hash3(o.seed + 601, k++, o.boil ?? 0);
      /*
       * Mostly solid, occasionally starved — and the starved patches are only a
       * LITTLE lighter.
       *
       * A worn ribbon under-inks; it does not punch holes. The first version
       * dropped to a quarter alpha and the glyphs came apart into dashes. What
       * a typed page actually looks like is an even mark that is slightly
       * blotchy, so the contrast here is deliberately narrow.
       */
      const ink = h < wear * 0.32 ? 0.62 + h * 0.44 : 0.93 + h * 0.07;
      ctx.globalAlpha = alpha * Math.min(1, ink);
      ctx.beginPath();
      ctx.moveTo(ax + (bx - ax) * t0, ay + (by - ay) * t0);
      ctx.lineTo(ax + (bx - ax) * t1, ay + (by - ay) * t1);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * A volute — the scrolled corner flourish of a decorated page.
 *
 * Starts exactly at (cx, cy), sweeps out along `angle`, and spirals inward to a
 * point. The spiral is drawn about a centre offset from the start, which is what
 * separates a scroll from a circle: an arc of constant radius closes into a ring
 * and reads, unmistakably, as a coffee-cup stain.
 */
export function volutePath(
  cx: number,
  cy: number,
  len: number,
  angle: number,
  dir = 1,
  turns = 4.2,
  steps = 30,
): Pt[] {
  const ox = cx + Math.cos(angle) * len;
  const oy = cy + Math.sin(angle) * len;
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const th = angle + Math.PI + dir * t * turns;
    const r = len * (1 - 0.84 * t);
    pts.push([ox + Math.cos(th) * r, oy + Math.sin(th) * r]);
  }
  return pts;
}

/** A calligraphic swash: an arc that curls back on itself. Used for flourishes. */
export function swashPath(
  cx: number,
  cy: number,
  radius: number,
  angle: number,
  sweep: number,
  curl = 0.34,
  steps = 22,
): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = angle + sweep * t;
    // Radius grows then tucks back in, which is what gives a swash its hook.
    const r = radius * (0.55 + Math.sin(Math.PI * t) * 0.75 - curl * t * t);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
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
