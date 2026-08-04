import { blobPath, brushStroke, hash3, inkStroke, strikeStroke, type Pt } from './ink';
import type { EnemyKind, ItemKind } from '../game/types';

/**
 * The hand a mark is made in. One per era — see game/eras.ts.
 *
 * The SILHOUETTES do not change between them. A RAT is a RAT whether brushed or
 * struck, so everything a player learned in the first four floors keeps paying;
 * only the instrument changes. That is the whole payoff of the era system, and
 * it is why this is a mode on the renderer rather than a second set of glyphs.
 */
export type Mark = 'brush' | 'nib' | 'type';

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
  /*
   * THE DROLLERY — the grotesque in the margin.
   *
   * Bigger and heavier than anything else on the page, and deliberately the only
   * ASYMMETRIC silhouette in the set: every other kind is mirror-balanced, so a
   * lopsided shape reads as wrong before it reads as anything, which is what a
   * boss should do at a glance. A hooked horn one side, a curled flourish the
   * other, and a wide mouth.
   */
  drollery: {
    paths: [
      // The body: a broad, sagging bell.
      [
        [-0.82, 0.12],
        [-0.62, -0.5],
        [0, -0.72],
        [0.62, -0.5],
        [0.82, 0.12],
        [0.44, 0.66],
        [-0.44, 0.66],
        [-0.82, 0.12],
      ],
      // A hooked horn, left only.
      [
        [-0.5, -0.6],
        [-0.72, -0.98],
        [-0.3, -0.9],
      ],
      // A scribe's curl for the other, because a drollery is drawn, not born.
      [
        [0.52, -0.58],
        [0.86, -0.92],
        [0.7, -0.36],
      ],
      // The mouth.
      [
        [-0.34, 0.28],
        [-0.1, 0.44],
        [0.14, 0.28],
        [0.36, 0.44],
      ],
    ],
    dots: [
      [-0.3, -0.24, 0.11],
      [0.3, -0.24, 0.11],
    ],
    weight: 1.3,
  },
  /*
   * THE SEMICOLON — a stray mark, and the smallest silhouette in the set.
   *
   * Drawn as the character itself: a struck point above, a comma's tail below.
   * Deliberately TINY next to everything else, because it is chaff and the
   * board has to say so before you read anything — a player should never spend
   * a turn working out whether the little mark is worth worrying about.
   *
   * It is also the only glyph in the game that is literally a letterform, which
   * is the joke the era is built on: in a typewriter's world the vermin are the
   * punctuation.
   */
  semicolon: {
    paths: [
      // The comma's tail, hooking left the way it does on a page.
      [
        [0.1, 0.12],
        [0.16, 0.42],
        [-0.14, 0.62],
      ],
    ],
    // The point above it. Small and square: struck, not spattered.
    dots: [[0.12, -0.3, 0.15]],
    weight: 1.15,
  },
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
  /*
   * THE TYPEBAR — the arm, the slug, and the line it will strike.
   *
   * The only VERTICAL silhouette in the set, and deliberately so: everything
   * else is broad or pointed sideways, and this is the one thing whose threat
   * runs up and down the board. The shape is the mechanic — a heavy slug head
   * with a long stem under it, hinged at a foot it never leaves.
   *
   * Under a brush the head and the stem merge into one blob at this size, so the
   * brush version drops the slug's cross-bar and widens the head instead.
   */
  typebar: {
    paths: [
      // The slug: a heavy head, flat-topped where it meets the paper.
      [
        [-0.44, -0.9],
        [0.44, -0.9],
        [0.44, -0.52],
        [-0.44, -0.52],
        [-0.44, -0.9],
      ],
      // The face of the type, cut into the slug.
      [
        [-0.2, -0.78],
        [0.2, -0.78],
      ],
      // The arm.
      [
        [0, -0.52],
        [0, 0.6],
      ],
      // The pivot it swings from and never leaves.
      [
        [-0.34, 0.6],
        [0.34, 0.6],
      ],
    ],
    brushPaths: [
      [
        [-0.5, -0.86],
        [0.5, -0.86],
        [0.5, -0.5],
        [-0.5, -0.5],
        [-0.5, -0.86],
      ],
      [
        [0, -0.5],
        [0, 0.6],
      ],
      [
        [-0.36, 0.6],
        [0.36, 0.6],
      ],
    ],
    weight: 1.05,
  },
  /*
   * THE CARRIAGE — the platen and its rails.
   *
   * Deliberately the exact opposite of the TYPEBAR: that one is the only
   * vertical silhouette in the set and threatens a column, this is the widest
   * horizontal one and threatens a row. The shape is the mechanic, and the pair
   * is legible against each other before either is legible on its own.
   *
   * A long roller, two end flanges it runs between, and the rail under it.
   */
  carriage: {
    paths: [
      // The roller: a wide flat drum.
      [
        [-0.78, -0.4],
        [0.78, -0.4],
        [0.78, 0.12],
        [-0.78, 0.12],
        [-0.78, -0.4],
      ],
      // Its knurl, so the drum reads as something that turns.
      [
        [-0.4, -0.4],
        [-0.4, 0.12],
      ],
      [
        [0.4, -0.4],
        [0.4, 0.12],
      ],
      // The rail it travels along.
      [
        [-0.92, 0.52],
        [0.92, 0.52],
      ],
      // The flanges, standing on the rail at each end.
      [
        [-0.78, 0.12],
        [-0.78, 0.52],
      ],
      [
        [0.78, 0.12],
        [0.78, 0.52],
      ],
    ],
    // A brush merges the knurl into the drum, so the brushed carriage drops it
    // and says the same thing with a wider gap between roller and rail.
    brushPaths: [
      [
        [-0.76, -0.44],
        [0.76, -0.44],
        [0.76, 0.06],
        [-0.76, 0.06],
        [-0.76, -0.44],
      ],
      [
        [-0.94, 0.56],
        [0.94, 0.56],
      ],
      [
        [-0.76, 0.06],
        [-0.76, 0.56],
      ],
      [
        [0.76, 0.06],
        [0.76, 0.56],
      ],
    ],
    weight: 1.1,
  },
  /*
   * THE CARRIAGE RETURN — the lever, and the machine it throws.
   *
   * Built out of the CARRIAGE's own silhouette so the boss reads as the same
   * family grown up: the same roller and rail, plus the long return lever
   * sweeping up and left, which is the one part of a typewriter everyone can
   * picture. Asymmetric on purpose — the DROLLERY is the only lopsided shape in
   * era I for exactly this reason, because a shape that is not mirror-balanced
   * reads as WRONG before it reads as anything, which is a boss's whole job at
   * a glance.
   */
  carriageReturn: {
    paths: [
      // The roller, wider and heavier than the carriage's.
      [
        [-0.84, -0.22],
        [0.84, -0.22],
        [0.84, 0.3],
        [-0.84, 0.3],
        [-0.84, -0.22],
      ],
      [
        [-0.34, -0.22],
        [-0.34, 0.3],
      ],
      [
        [0.34, -0.22],
        [0.34, 0.3],
      ],
      // The rail.
      [
        [-0.96, 0.7],
        [0.96, 0.7],
      ],
      [
        [-0.84, 0.3],
        [-0.84, 0.7],
      ],
      [
        [0.84, 0.3],
        [0.84, 0.7],
      ],
      // The return lever: up and out to the left, with a grip on the end.
      [
        [-0.6, -0.22],
        [-0.72, -0.72],
        [-0.16, -0.96],
      ],
    ],
    weight: 1.25,
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
  /*
   * GESSO — the ground laid over a page before anything is written on it.
   *
   * A shield shape, because that is what it does, but drawn as a laid PANEL with
   * a burnished edge rather than a heater shield: this is a coat applied to the
   * page, not a piece of armour someone is carrying.
   */
  gesso: {
    paths: [
      [
        [-0.62, -0.66],
        [0.62, -0.66],
        [0.62, 0.18],
        [0, 0.82],
        [-0.62, 0.18],
        [-0.62, -0.66],
      ],
      // The burnish: a diagonal sheen across the laid ground.
      [
        [-0.34, -0.3],
        [0.3, -0.3],
      ],
      [
        [-0.34, 0.06],
        [0.14, 0.06],
      ],
    ],
    weight: 1.05,
  },
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
  /** Which instrument makes the mark. Defaults to the nib. */
  mark?: Mark;
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

  /*
   * MISREGISTRATION, applied to the whole glyph and nothing smaller.
   *
   * A typed character is one strike of one bar, so it lands slightly off its
   * place on the line and slightly off square — together, not stroke by stroke.
   * Jittering the strokes independently reads as a shaky hand, which is the
   * thing this era exists to stop reading as.
   *
   * Small numbers on purpose: about 3% of a cell and under two degrees. Past
   * that it stops looking like a machine out of adjustment and starts looking
   * like a mistake.
   */
  let ribbon = 1;
  if (o.mark === 'type') {
    ctx.save();
    ctx.translate(
      (hash3(o.seed + 31, 0, 0) - 0.5) * o.size * 0.06,
      (hash3(o.seed + 32, 0, 0) - 0.5) * o.size * 0.06,
    );
    ctx.rotate((hash3(o.seed + 33, 0, 0) - 0.5) * 0.055);
    // And the ribbon is unevenly inked from character to character, not only
    // along one stroke — some letters simply come out grey.
    ribbon = 0.76 + hash3(o.seed + 34, 0, 0) * 0.24;
  }

  if (o.mark === 'type') {
    /*
     * The NIB silhouettes, not the brush ones.
     *
     * `brushPaths` exists because a brush mark is twice the width of the same
     * stroke and close parallel detail merges — the WARDEN's three body bars had
     * to become two. A struck mark is a hard thin face, much closer to a nib than
     * to a brush, so it can carry the full detail and should: taking the brush's
     * simplified paths cost the warden its bars for no reason.
     *
     * Barely heavier than the nib. A slug is a solid face rather than a drawn
     * line, but 1.15x was enough to close the drollery's mouth.
     */
    const w = o.size * 0.075 * (def.weight ?? 1) * (o.widthScale ?? 1) * 1.04;
    def.paths.forEach((path, i) => {
      strikeStroke(ctx, path.map(map), {
        color: o.color,
        width: w,
        seed: o.seed + i * 313,
        amp: o.size * 0.004,
        alpha: alpha * ribbon,
        boil: o.boil ?? 0,
        wear: 0.38,
      });
    });
  } else if (o.mark === 'brush') {
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
    ctx.globalAlpha = alpha * ribbon;
    ctx.fillStyle = o.color;
    if (o.mark === 'type') {
      // A struck dot is a slug face, not a blob. Square, like everything else
      // a machine puts on a page.
      const s = r * half * 1.7;
      ctx.fillRect(dx * half - s / 2, dy * half - s / 2, s, s);
    } else {
      blobPath(ctx, dx * half, dy * half, r * half, o.seed + 77, 0.3, 9, o.boil ?? 0);
      ctx.fill();
    }
    ctx.restore();
  }

  // Closes the misregistration transform opened above, after the dots so the
  // whole character has shifted as one thing.
  if (o.mark === 'type') ctx.restore();
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
    o.mark ?? 'nib',
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
