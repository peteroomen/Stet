import { blobPath, brushStroke, inkStroke, type Pt } from './ink';
import type { EnemyKind, ItemKind } from '../game/types';

/**
 * Every actor is a set of polylines in unit space (roughly -1..1), inked at draw
 * time. Nothing is a sprite, so everything scales to any board size and picks up
 * the same wobble and boil as the rules and the border.
 *
 * Silhouettes are deliberately distinct at a glance on a phone: RAT is a low
 * zigzag, STALKER a slashed diamond, CHARGER a double arrowhead pointing where
 * it will go, WARDEN a horned block.
 */

export interface GlyphDef {
  paths: Pt[][];
  /**
   * Alternate paths for brush rendering.
   *
   * A brush mark is roughly twice the width of the same stroke from a nib, so
   * anything with close parallel detail merges into a solid block. The WARDEN's
   * three body bars did exactly that. Where a silhouette needs redrawing for the
   * brush rather than merely re-weighting, it goes here.
   */
  brushPaths?: Pt[][];
  /** Solid dots — eyes, nib vents. [x, y, radius]. */
  dots?: [number, number, number][];
  /** Filled closed shapes rather than strokes. */
  fills?: Pt[][];
  /** Stroke weight multiplier; heavy things read heavy. */
  weight?: number;
  /** Extra width multiplier applied only in brush mode. */
  brushWeight?: number;
}

export const HERO: GlyphDef = {
  // A chevron rune with a stem — reads as a nib, and as an arrow when rotated.
  paths: [
    [
      [0, -0.9],
      [0.82, 0.62],
      [0, 0.3],
      [-0.82, 0.62],
      [0, -0.9],
    ],
    [
      [0, -0.32],
      [0, 0.28],
    ],
  ],
  weight: 1.18,
};

export const ENEMY_GLYPHS: Record<EnemyKind, GlyphDef> = {
  rat: {
    paths: [
      [
        [-0.72, 0.34],
        [-0.34, -0.32],
        [0.04, 0.3],
        [0.42, -0.34],
      ],
      [
        [0.42, -0.34],
        [0.78, 0.06],
      ],
    ],
    dots: [[-0.58, 0.02, 0.09]],
    weight: 0.86,
  },
  stalker: {
    paths: [
      [
        [0, -0.86],
        [0.72, 0],
        [0, 0.86],
        [-0.72, 0],
        [0, -0.86],
      ],
      [
        [-0.3, -0.3],
        [0.3, 0.3],
      ],
      [
        [0.3, -0.3],
        [-0.3, 0.3],
      ],
    ],
    weight: 1,
  },
  charger: {
    paths: [
      [
        [-0.78, -0.66],
        [0.02, 0],
        [-0.78, 0.66],
      ],
      [
        [0.1, -0.66],
        [0.9, 0],
        [0.1, 0.66],
      ],
    ],
    weight: 1.1,
  },
  warden: {
    paths: [
      [
        [-0.66, -0.46],
        [0.66, -0.46],
        [0.66, 0.76],
        [-0.66, 0.76],
        [-0.66, -0.46],
      ],
      [
        [-0.66, -0.46],
        [-0.94, -0.92],
      ],
      [
        [0.66, -0.46],
        [0.94, -0.92],
      ],
      [
        [-0.4, -0.12],
        [0.4, -0.12],
      ],
      [
        [-0.4, 0.2],
        [0.4, 0.2],
      ],
      [
        [-0.4, 0.5],
        [0.4, 0.5],
      ],
    ],
    // Under a brush the three body bars merge into a solid block and the WARDEN
    // stops reading as barred. Two bars, spread wider, survive the wider mark.
    brushPaths: [
      [
        [-0.62, -0.42],
        [0.62, -0.42],
        [0.62, 0.72],
        [-0.62, 0.72],
        [-0.62, -0.42],
      ],
      [
        [-0.62, -0.42],
        [-0.96, -0.94],
      ],
      [
        [0.62, -0.42],
        [0.96, -0.94],
      ],
      [
        [-0.34, 0.02],
        [0.34, 0.02],
      ],
      [
        [-0.34, 0.44],
        [0.34, 0.44],
      ],
    ],
    weight: 1.34,
    brushWeight: 0.82,
  },
};

export const ITEM_GLYPHS: Record<ItemKind, GlyphDef> = {
  vial: {
    // An ink droplet.
    paths: [
      [
        [0, -0.86],
        [0.5, -0.06],
        [0.44, 0.44],
        [0, 0.8],
        [-0.44, 0.44],
        [-0.5, -0.06],
        [0, -0.86],
      ],
    ],
    weight: 0.95,
  },
  nib: {
    // A pen nib: leaf, slit, vent hole.
    paths: [
      [
        [0, -0.88],
        [0.54, 0.1],
        [0, 0.86],
        [-0.54, 0.1],
        [0, -0.88],
      ],
      [
        [0, -0.16],
        [0, 0.56],
      ],
    ],
    dots: [[0, -0.3, 0.13]],
    weight: 1,
  },
};

export const STAIRS: GlyphDef = {
  paths: [
    [
      [-0.8, -0.56],
      [0.8, -0.56],
    ],
    [
      [-0.54, -0.12],
      [0.54, -0.12],
    ],
    [
      [-0.28, 0.32],
      [0.28, 0.32],
    ],
    [
      [-0.36, 0.5],
      [0, 0.88],
      [0.36, 0.5],
    ],
  ],
  weight: 1.05,
};

export interface DrawOpts {
  color: string;
  size: number;
  seed: number;
  boil?: number;
  alpha?: number;
  /** Radians. The hero turns to face its last step. */
  rotation?: number;
  widthScale?: number;
  dash?: number[];
  passes?: number;
  /** Render with a loaded brush rather than a nib. */
  brush?: boolean;
  /** Skip the cache — for one-off marks that will never repeat. */
  uncached?: boolean;
  /**
   * Uniform scale applied when the cached bitmap is blitted.
   *
   * Animated squash and stretch MUST come through here rather than through
   * `size`. Continuous values in the cache key mint a fresh bitmap every frame
   * and then blow the cache limit, which turns the cache into a slow path: the
   * hero's bump scale alone took a busy board from 16.6ms a frame to 21.3ms.
   */
  scale?: number;
}

/** Paint a glyph straight onto `ctx`, centred at the origin. */
function paintGlyph(ctx: CanvasRenderingContext2D, def: GlyphDef, o: DrawOpts): void {
  const half = o.size / 2;
  const map = (p: Pt): Pt => [p[0] * half, p[1] * half];
  const alpha = o.alpha ?? 1;

  for (const fill of def.fills ?? []) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = o.color;
    const m = fill.map(map);
    ctx.beginPath();
    ctx.moveTo(m[0][0], m[0][1]);
    for (let i = 1; i < m.length; i++) ctx.lineTo(m[i][0], m[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  if (o.brush) {
    // 1.85x read as a blot rather than a brush mark — at that weight a 5x5 board
    // of actors is mostly ink, and the silhouettes stop being distinguishable at
    // a glance, which is the one thing they have to do. The variation that was
    // lost by thinning is put back as pressure, not as width.
    const w =
      o.size * 0.075 * (def.weight ?? 1) * (o.widthScale ?? 1) * 1.48 * (def.brushWeight ?? 1);
    const paths = def.brushPaths ?? def.paths;
    paths.forEach((path, i) => {
      brushStroke(ctx, path.map(map), {
        color: o.color,
        width: w,
        seed: o.seed + i * 313,
        amp: o.size * 0.016,
        alpha,
        boil: o.boil ?? 0,
        dryness: 0.32,
        pressure: 0.28,
      });
    });
  } else {
    const w = o.size * 0.075 * (def.weight ?? 1) * (o.widthScale ?? 1);
    def.paths.forEach((path, i) => {
      inkStroke(ctx, path.map(map), {
        color: o.color,
        width: w,
        seed: o.seed + i * 313,
        amp: o.size * 0.014,
        alpha,
        boil: o.boil ?? 0,
        dash: o.dash,
        passes: o.passes ?? 2,
      });
    });
  }

  for (const [dx, dy, r] of def.dots ?? []) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = o.color;
    blobPath(ctx, dx * half, dy * half, r * half, o.seed + 77, 0.3, 9, o.boil ?? 0);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Rendered-glyph cache.
 *
 * The inputs are a tiny discrete set — a handful of kinds, three boil frames,
 * one size, two or three colours — so each distinct mark is drawn once to an
 * offscreen canvas and blitted thereafter.
 *
 * Measured, on a busy depth-9 board at 3x device pixel ratio, as median cost of
 * one renderer.draw():
 *
 *   nib glyphs            0.20 ms
 *   brush, cache off      0.40 ms
 *   brush, cache on       0.30 ms
 *
 * So this is a modest win, not a dramatic one, and it is kept for the worst case
 * and for weaker hardware rather than because it rescued the frame. The cost
 * that actually mattered was in brushStroke: scrubbing dry-brush voids with
 * globalCompositeOperation was both slow and wrong (it erased the page beneath),
 * and removing it took p95 frame time from 32 ms to 25 ms on its own.
 *
 * Building this cache is still what surfaced that, though — it was only obvious
 * something else was wrong once a cache that should have made glyphs free
 * did not.
 */
const cache = new Map<string, HTMLCanvasElement>();
const CACHE_LIMIT = 240;

/** Registered so a glyph's identity is part of its cache key. */
const defIds = new WeakMap<GlyphDef, number>();
let nextDefId = 1;
function defId(def: GlyphDef): number {
  let id = defIds.get(def);
  if (id === undefined) {
    id = nextDefId++;
    defIds.set(def, id);
  }
  return id;
}

export function clearGlyphCache(): void {
  cache.clear();
}

export function drawGlyph(
  ctx: CanvasRenderingContext2D,
  def: GlyphDef,
  cx: number,
  cy: number,
  o: DrawOpts,
): void {
  const rot = o.rotation ?? 0;
  const alpha = o.alpha ?? 1;
  const scale = o.scale ?? 1;

  // Dashed variants are rare; skip caching rather than growing the key space.
  const cacheable = !o.uncached && !o.dash && o.size > 0;

  if (!cacheable) {
    ctx.save();
    ctx.translate(cx, cy);
    if (rot) ctx.rotate(rot);
    if (scale !== 1) ctx.scale(scale, scale);
    paintGlyph(ctx, def, o);
    ctx.restore();
    return;
  }

  // Everything in the key must be DISCRETE. Alpha and scale are deliberately
  // absent — they are applied to the blit instead, so a pulsing telegraph and a
  // squashing hero both reuse one bitmap.
  const size = Math.round(o.size);
  const key = [
    defId(def),
    size,
    o.color,
    o.seed,
    o.boil ?? 0,
    Math.round(rot * 100),
    Math.round((o.widthScale ?? 1) * 20),
    o.passes ?? 2,
    o.brush ? 'b' : 'n',
  ].join('|');

  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  let bitmap = cache.get(key);
  if (!bitmap) {
    // Generous margin: a brush belly plus wobble reaches well past the unit box.
    const pad = Math.ceil(size * 0.45);
    const dim = size + pad * 2;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(dim * dpr));
    c.height = Math.max(1, Math.ceil(dim * dpr));
    const g = c.getContext('2d');
    if (!g) return;
    g.scale(dpr, dpr);
    g.translate(dim / 2, dim / 2);
    if (rot) g.rotate(rot);
    // Baked fully opaque; the caller's alpha is applied to the blit.
    paintGlyph(g, def, { ...o, size, alpha: 1, scale: 1 });
    if (cache.size > CACHE_LIMIT) cache.clear();
    cache.set(key, c);
    bitmap = c;
  }

  const dim = (bitmap.width / dpr) * scale;
  ctx.save();
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  ctx.drawImage(bitmap, cx - dim / 2, cy - dim / 2, dim, dim);
  ctx.restore();
}

export function glyphFor(kind: EnemyKind): GlyphDef {
  return ENEMY_GLYPHS[kind];
}

/** The hero rune points where you last stepped. */
export const FACING_ROTATION: Record<string, number> = {
  up: 0,
  right: Math.PI / 2,
  down: Math.PI,
  left: -Math.PI / 2,
};
