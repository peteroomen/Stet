import { blobPath, inkStroke, type Pt } from './ink';
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
  /** Solid dots — eyes, nib vents. [x, y, radius]. */
  dots?: [number, number, number][];
  /** Filled closed shapes rather than strokes. */
  fills?: Pt[][];
  /** Stroke weight multiplier; heavy things read heavy. */
  weight?: number;
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
    weight: 1.34,
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
}

export function drawGlyph(
  ctx: CanvasRenderingContext2D,
  def: GlyphDef,
  cx: number,
  cy: number,
  o: DrawOpts,
): void {
  const half = o.size / 2;
  const w = (o.size * 0.075) * (def.weight ?? 1) * (o.widthScale ?? 1);

  ctx.save();
  ctx.translate(cx, cy);
  if (o.rotation) ctx.rotate(o.rotation);

  const map = (p: Pt): Pt => [p[0] * half, p[1] * half];

  for (const fill of def.fills ?? []) {
    ctx.save();
    ctx.globalAlpha = o.alpha ?? 1;
    ctx.fillStyle = o.color;
    const m = fill.map(map);
    ctx.beginPath();
    ctx.moveTo(m[0][0], m[0][1]);
    for (let i = 1; i < m.length; i++) ctx.lineTo(m[i][0], m[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  def.paths.forEach((path, i) => {
    inkStroke(ctx, path.map(map), {
      color: o.color,
      width: w,
      seed: o.seed + i * 313,
      amp: o.size * 0.014,
      alpha: o.alpha ?? 1,
      boil: o.boil ?? 0,
      dash: o.dash,
      passes: o.passes ?? 2,
    });
  });

  for (const [dx, dy, r] of def.dots ?? []) {
    ctx.save();
    ctx.globalAlpha = o.alpha ?? 1;
    ctx.fillStyle = o.color;
    blobPath(ctx, dx * half, dy * half, r * half, o.seed + 77, 0.3, 9, o.boil ?? 0);
    ctx.fill();
    ctx.restore();
  }

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
