import { ENEMY_STATS, intentThreatens } from '../game/enemies';
import { eraAt, isBossFloor, type Era } from '../game/eras';
import { DIR_VEC, SIZE, add } from '../game/grid';
import type { MoveOutcome } from '../game/preview';
import type { Dir, Ev, GameState, Vec } from '../game/types';
import { Effects } from './effects';
import {
  FACING_ROTATION,
  HERO,
  ITEM_GLYPHS,
  STAIRS,
  clearGlyphCache,
  drawGlyph,
  glyphFor,
  type Mark,
} from './glyphs';
import {
  blobPath,
  brushStroke,
  clamp01,
  easeOutCubic,
  easeOutQuint,
  hash3,
  inkStroke,
  lerp,
  strikeStroke,
  volutePath,
  type Pt,
} from './ink';
import { themeFor, type EraPalette, type Theme, type ThemeName } from './theme';

/* -------------------------------------------------------------------------
 * Turn timing. Snappy on purpose: a whole turn resolves in about a quarter of a
 * second, so thinking time is yours and animation time is not.
 * ---------------------------------------------------------------------- */
/**
 * The cost at which the weight mark is full.
 *
 * Roughly a bar of health. Past it the exact figure has stopped informing the
 * decision — everything above is "this is enormous" — so the mark saturates
 * rather than growing until it leaves the tile.
 */
export const COST_FULL = 6;

export const MOVE_MS = 85;
/**
 * A stroke's duration scales with what it was worth.
 *
 * Everything used to cost a flat 185 ms, which is why nothing felt explosive:
 * contrast is the entire mechanism. A tap is over before you notice it; a blow
 * that matters holds the page. Reach, shake and hitstop scale off the same
 * weight, so one blow reads as one event rather than four tuned effects.
 */
export const STRIKE_MS = 150;
export const STRIKE_HEAVY_MS = 300;
export const BUMP_MS = STRIKE_MS;
/**
 * The shape of a lunge: snap out, HOLD at extension, settle slowly.
 *
 * It used to be a symmetric 42% out / 58% back, which reads as a step you took
 * back — precisely the thing the rules say did not happen. A held extension
 * reads as a swing. The hold also lands where the hitstop already freezes the
 * frame, so the freeze now sustains the pose instead of interrupting the travel.
 */
const BUMP_OUT = 0.16;
const BUMP_HOLD = 0.34;
const BLOCK_MS = 130;
/** Holding your ground. Short — nothing moved — but not zero, or it reads as a dropped input. */
const WAIT_MS = 70;
const GAP_MS = 25;
const ENEMY_MS = 135;
const TAIL_MS = 40;

/** Stable seed for a cost mark, so its wobble does not reshuffle every frame. */
function costSeed(s: GameState, dir: Dir): number {
  return s.player.pos.x * 7919 + s.player.pos.y * 104729 + dir.charCodeAt(0) * 31;
}

/** 0 for a glancing tap, 1 for a killing blow. Drives every part of the feel. */
export function strikeWeight(dmg: number, killed: boolean): number {
  return clamp01((dmg - 1) / 3) * (killed ? 1 : 0.85) + (killed ? 0.35 : 0);
}

export interface Motion {
  from: Vec;
  to: Vec;
  t0: number;
  t1: number;
  kind: 'move' | 'bump' | 'block';
  /** Strike weight, for bumps. See `strikeWeight`. */
  weight: number;
}

export interface TurnAnim {
  playerMotion: Motion | null;
  enemyMotions: Map<number, Motion>;
  cues: { at: number; ev: Ev }[];
  fired: boolean[];
  total: number;
}

export const EMPTY_ANIM: TurnAnim = {
  playerMotion: null,
  enemyMotions: new Map(),
  cues: [],
  fired: [],
  total: 0,
};

/** Turn an event list into a timeline the renderer and audio can both play back. */
export function buildAnim(events: Ev[]): TurnAnim {
  let playerMotion: Motion | null = null;
  let playerDur = 0;

  /** Set by the bump, so its cues fire against the duration that blow earned. */
  let strikeMs = STRIKE_MS;

  for (const ev of events) {
    if (ev.t === 'move') {
      playerMotion = { from: ev.from, to: ev.to, t0: 0, t1: MOVE_MS, kind: 'move', weight: 0 };
      playerDur = Math.max(playerDur, MOVE_MS);
    } else if (ev.t === 'bump' && !ev.glance) {
      /*
       * The AIMED blow only.
       *
       * A stroke can now land on several things — the reach card carrying
       * through, the splash card catching what you are touching — and a glance
       * can be in any direction at all. Taking the hero's lunge from the last
       * bump in the list would swing them at whatever happened to be caught
       * last, which on a splash is a tile they never swiped toward.
       */
      const weight = strikeWeight(ev.dmg, ev.killed);
      strikeMs = lerp(STRIKE_MS, STRIKE_HEAVY_MS, weight);
      playerMotion = { from: ev.from, to: ev.to, t0: 0, t1: strikeMs, kind: 'bump', weight };
      playerDur = Math.max(playerDur, strikeMs);
    } else if (ev.t === 'wait') {
      playerDur = Math.max(playerDur, WAIT_MS);
    } else if (ev.t === 'blocked') {
      const wall = { x: ev.pos.x, y: ev.pos.y };
      playerMotion = { from: ev.pos, to: wall, t0: 0, t1: BLOCK_MS, kind: 'block', weight: 0 };
      playerDur = Math.max(playerDur, BLOCK_MS);
    }
  }

  /*
   * A descent throws every motion away.
   *
   * Taking the stairs rebuilds the board inside the same turn, so the `move`
   * event that carried you onto them describes the floor you just LEFT: its
   * coordinates, its occupants. Animating it over the new floor slid the hero
   * across the page from an old tile to its new spawn — a visible teleport on
   * every descent — and if the old stairs tile happened to hold one of the new
   * floor's foes, it drew you standing on top of it for the length of the step.
   */
  if (events.some((ev) => ev.t === 'descend')) {
    playerMotion = null;
    playerDur = 0;
  }

  const eStart = playerDur + GAP_MS;
  const enemyMotions = new Map<number, Motion>();
  const cues: { at: number; ev: Ev }[] = [];
  let total = playerDur;

  for (const ev of events) {
    switch (ev.t) {
      case 'blocked':
        cues.push({ at: BLOCK_MS * 0.3, ev });
        break;
      case 'move':
        cues.push({ at: 8, ev });
        break;
      case 'wait':
        cues.push({ at: 8, ev });
        break;
      // Impact at full extension, at the TOP of the stroke rather than 42% into
      // it. The hitstop fires here too, so the frame freezes on the held pose.
      case 'bump':
        cues.push({ at: strikeMs * BUMP_OUT, ev });
        break;
      case 'kill':
        cues.push({ at: strikeMs * BUMP_OUT + 10, ev });
        break;
      case 'pickup':
        cues.push({ at: MOVE_MS * 0.7, ev });
        break;
      case 'descend':
        cues.push({ at: 0, ev });
        break;
      // The cards going down, and the one taken. Both are chrome rather than
      // board, but they still need a cue or the sound layer never hears them.
      case 'offer':
        cues.push({ at: 40, ev });
        break;
      case 'trait':
        cues.push({ at: 0, ev });
        break;
      case 'emove':
        enemyMotions.set(ev.id, {
          from: ev.from,
          to: ev.to,
          t0: eStart,
          t1: eStart + ENEMY_MS,
          kind: 'move',
          weight: 0,
        });
        cues.push({ at: eStart + 8, ev });
        total = Math.max(total, eStart + ENEMY_MS);
        break;
      case 'wind':
        cues.push({ at: eStart + 20, ev });
        total = Math.max(total, eStart + ENEMY_MS);
        break;
      case 'eattack':
        cues.push({ at: eStart + ENEMY_MS * 0.55, ev });
        total = Math.max(total, eStart + ENEMY_MS);
        break;
      case 'stagger':
        // Right at the top of the enemy phase — the interrupt reads as landing
        // before the blow it prevented would have.
        cues.push({ at: eStart + 6, ev });
        total = Math.max(total, eStart + ENEMY_MS);
        break;
      case 'spill':
      // After the enemy phase has landed, so the new arrival is not mistaken
      // for one of the foes that just moved.
      case 'drown':
      // The bell rings AFTER the band it just finished has landed, because it
      // announces the next one — "that was the last pass at this width".
      case 'bell':
        // Same slot as the spill it replaces — it IS the spill, landing on you
        // because the page had nowhere else to put it.
        cues.push({ at: eStart + ENEMY_MS + 40, ev });
        total = Math.max(total, eStart + ENEMY_MS + 220);
        break;
      case 'unseal':
        cues.push({ at: eStart + ENEMY_MS + 70, ev });
        total = Math.max(total, eStart + ENEMY_MS + 70);
        break;
      case 'death':
        cues.push({ at: eStart + ENEMY_MS * 0.55 + 130, ev });
        total = Math.max(total, eStart + ENEMY_MS + 200);
        break;
    }
  }

  cues.sort((a, b) => a.at - b.at);
  return {
    playerMotion,
    enemyMotions,
    cues,
    fired: new Array(cues.length).fill(false),
    total: total + TAIL_MS,
  };
}

/**
 * Interpolated tile-space position for a motion at time `clock`.
 *
 * Note where a finished motion RESTS. A step ends on its destination, but a
 * bump — and a blocked swipe — ends back where it started, because you never
 * advanced: `m.to` is the tile you swung at, not a tile you ever occupied.
 *
 * Returning `m.to` unconditionally is what made striking so confusing. The
 * moment the swing animation finished, roughly a third of the way through the
 * turn, the hero teleported onto the foe's tile and stayed there until the next
 * input — so the rules said "you do not advance" while the picture showed you
 * standing on top of the thing you had just hit.
 */
export function motionAt(m: Motion, clock: number): { pos: Vec; scale: number } {
  const rest = m.kind === 'move' ? m.to : m.from;
  if (clock <= m.t0) return { pos: m.from, scale: 1 };
  if (clock >= m.t1) return { pos: rest, scale: 1 };
  const p = (clock - m.t0) / (m.t1 - m.t0);

  if (m.kind === 'move') {
    const e = easeOutCubic(p);
    // Squash into the step, stretch out of it.
    const scale = 1 + Math.sin(p * Math.PI) * 0.11;
    return {
      pos: { x: lerp(m.from.x, m.to.x, e), y: lerp(m.from.y, m.to.y, e) },
      scale,
    };
  }

  // Bump / block: snap out, hold, settle. You never arrive — that is the point,
  // and at the old 0.46 reach the mark travelled far enough into the gap that it
  // read as arriving anyway. The anchor on the true tile (see drawHero) is what
  // actually carries "you did not move"; this just stops fighting it.
  const reach = m.kind === 'bump' ? lerp(0.22, 0.34, m.weight) : 0.14;
  let f: number;
  let scale: number;
  if (p < BUMP_OUT) {
    const q = p / BUMP_OUT;
    f = easeOutQuint(q) * reach;
    scale = 1 + q * 0.18;
  } else if (p < BUMP_HOLD) {
    // Held at full extension. This is the beat the whole stroke is built around.
    f = reach;
    scale = 1.18;
  } else {
    const q = (p - BUMP_HOLD) / (1 - BUMP_HOLD);
    f = reach * (1 - easeOutCubic(q));
    scale = 1 + (1 - q) * 0.18 - q * 0.07;
  }
  const dx = m.to.x - m.from.x;
  const dy = m.to.y - m.from.y;
  return { pos: { x: m.from.x + dx * f, y: m.from.y + dy * f }, scale };
}

export interface Geometry {
  size: number;
  pad: number;
  cell: number;
}

export function geometry(size: number): Geometry {
  // Wider than a plain ruled page needs, because the illuminated band and its
  // corner flourishes live in this margin.
  const pad = size * 0.078;
  return { size, pad, cell: (size - pad * 2) / SIZE };
}

const centerOf = (g: Geometry, v: Vec): [number, number] => [
  g.pad + g.cell * (v.x + 0.5),
  g.pad + g.cell * (v.y + 0.5),
];

/* -------------------------------------------------------------------------
 * The paper layer. Expensive and static, so it is drawn once per (size, theme,
 * depth) and blitted every frame. This is also why the grid does not boil: a
 * cached layer cannot shimmer, and a shimmering grid reads as a fault.
 * ---------------------------------------------------------------------- */
/**
 * The page.
 *
 * Full-bleed portrait — a phone screen IS roughly a sheet of paper, and a square
 * board floating in the middle of one wastes half the display. The wash covers
 * the whole canvas; the ruled 5x5 is drawn centred on it at (ox, oy), which is
 * exactly the origin the actors are drawn from. Sharing that origin is
 * load-bearing: when it did not, the grid drifted off the pieces standing on it
 * on every viewport that was not already square.
 */
function makePaper(
  w: number,
  h: number,
  size: number,
  ox: number,
  oy: number,
  theme: Theme,
  depth: number,
  dpr: number,
  era: Era,
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.floor(w * dpr));
  c.height = Math.max(1, Math.floor(h * dpr));
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const g = geometry(size);
  const seed = depth * 7919 + 13;

  ctx.fillStyle = theme.paper;
  ctx.fillRect(0, 0, w, h);

  // Aged edges.
  const vg = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.3,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.72,
  );
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, theme.paperDeep);
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // Foxing — a few soft age spots, stable per depth. Machine-made paper is
  // younger and has had less time to spot, so later eras get fewer and fainter.
  const foxing = era.hand === 'brush' ? 6 : 2;
  ctx.save();
  ctx.globalAlpha = era.hand === 'brush' ? 0.05 : 0.03;
  ctx.fillStyle = theme.grain;
  for (let i = 0; i < foxing; i++) {
    const x = hash3(seed, i * 3, 0) * w;
    const y = hash3(seed, i * 3 + 1, 0) * h;
    const r = (0.05 + hash3(seed, i * 3 + 2, 0) * 0.12) * Math.min(w, h);
    blobPath(ctx, x, y, r, seed + i * 91, 0.6, 11);
    ctx.fill();
  }
  ctx.restore();

  // Grain.
  const grain = document.createElement('canvas');
  grain.width = grain.height = 128;
  const gctx = grain.getContext('2d')!;
  const img = gctx.createImageData(128, 128);
  const rgb = hexToRgb(theme.grain);
  for (let i = 0; i < 128 * 128; i++) {
    const n = Math.random();
    img.data[i * 4] = rgb[0];
    img.data[i * 4 + 1] = rgb[1];
    img.data[i * 4 + 2] = rgb[2];
    img.data[i * 4 + 3] = n < 0.55 ? 0 : Math.floor(n * 26);
  }
  gctx.putImageData(img, 0, 0);
  const pattern = ctx.createPattern(grain, 'repeat');
  if (pattern) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // From here on, board space — the same origin the actors use.
  ctx.translate(ox, oy);

  // Ruled grid — light, like graph paper under the ink.
  const x0 = g.pad;
  const y0 = g.pad;
  const x1 = g.pad + g.cell * SIZE;
  const y1 = g.pad + g.cell * SIZE;
  /*
   * RULED FOOLSCAP in era II, and the ruling is doing teaching work.
   *
   * A manuscript page is gridded both ways because a scribe rules a grid. Ruled
   * paper is ruled in one direction only — and horizontal lines are what this
   * era's threats are made of, so the page's own furniture says "this place is
   * about lines" before a single enemy has moved. The verticals survive as a
   * much fainter tint so the tiles are still legible as tiles.
   */
  const ruled = era.hand !== 'brush';
  for (let i = 1; i < SIZE; i++) {
    const x = x0 + g.cell * i;
    const y = y0 + g.cell * i;
    inkStroke(ctx, [[x, y0], [x, y1]] as Pt[], {
      color: theme.rule,
      width: Math.max(1, g.cell * (ruled ? 0.01 : 0.016)),
      seed: seed + i * 17,
      amp: g.cell * (ruled ? 0.002 : 0.012),
      alpha: ruled ? 0.3 : 0.85,
      passes: 1,
    });
    inkStroke(ctx, [[x0, y], [x1, y]] as Pt[], {
      color: theme.rule,
      width: Math.max(1, g.cell * (ruled ? 0.02 : 0.016)),
      seed: seed + i * 41 + 500,
      // A machine rules a straight line. Only the hand wanders.
      amp: g.cell * (ruled ? 0.002 : 0.012),
      alpha: ruled ? 1 : 0.85,
      passes: 1,
    });
  }

  // The border: two hand-drawn rules, the way a page gets framed by hand.
  const frame: Pt[] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ];
  inkStroke(ctx, frame, {
    color: theme.ink,
    width: Math.max(1.6, g.cell * 0.038),
    seed: seed + 3001,
    amp: g.cell * 0.018,
    alpha: 0.9,
    closed: true,
  });
  const o = g.cell * 0.075;
  inkStroke(
    ctx,
    [
      [x0 - o, y0 - o],
      [x1 + o, y0 - o],
      [x1 + o, y1 + o],
      [x0 - o, y1 + o],
      [x0 - o, y0 - o],
    ] as Pt[],
    {
      color: theme.ink,
      width: Math.max(1, g.cell * 0.016),
      seed: seed + 4001,
      amp: g.cell * 0.02,
      alpha: 0.5,
      passes: 1,
      closed: true,
    },
  );

  decorate(ctx, g, theme, seed, x0, y0, x1, y1, era);

  /*
   * The depth, set the way the era would set it.
   *
   * A scribe rubricates a roman numeral in the margin. A typist types a page
   * number — arabic, monospaced, red because the ribbon has a red half and a
   * page number is the one thing worth rolling the ribbon over for.
   */
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = theme.blood;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  if (era.hand === 'brush') {
    ctx.font = `700 ${Math.round(g.pad * 0.5)}px "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`;
    ctx.fillText(roman(depth), x0 + g.cell * 0.02, y0 - g.pad * 0.34);
  } else {
    ctx.font = `700 ${Math.round(g.pad * 0.4)}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    ctx.letterSpacing = '0.12em';
    // Off its line and off square, like everything else the machine puts down.
    ctx.translate(x0 + g.cell * 0.02, y0 - g.pad * 0.34);
    ctx.rotate(-0.012);
    ctx.fillText(String(depth).padStart(2, '0'), 0, 0);
  }
  ctx.restore();

  return c;
}

/** Depth as a scribe would set it. Falls back to arabic past what reads cleanly. */
function roman(n: number): string {
  if (n <= 0 || n > 3999) return String(n);
  const table: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let out = '';
  let v = n;
  for (const [val, sym] of table) {
    while (v >= val) {
      out += sym;
      v -= val;
    }
  }
  return out;
}

/**
 * The illuminated band.
 *
 * Gilding, a vine of leaves, and a brush flourish curling into each corner. All
 * of it lives in the margin OUTSIDE the play area — decoration that competes
 * with the board for attention is decoration that makes the game worse, and this
 * board has to stay readable a turn ahead.
 */
/**
 * The margin, set the way the era sets margins.
 *
 * Recolouring the gilded vine for era II was tried and is wrong — a gilt vine in
 * grey is not a typed page, it is a manuscript with the lights off. The decision
 * an era makes about its margin is not "what colour is the gold", it is what a
 * page of that kind has in its margin AT ALL, and a typewriter's answer is: the
 * red margin stop and the tab ticks, because those are the only marks a typist
 * ever puts outside the text block.
 */
function decorate(
  ctx: CanvasRenderingContext2D,
  g: Geometry,
  theme: Theme,
  seed: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  era: Era,
): void {
  if (era.hand === 'brush') illuminate(ctx, g, theme, seed, x0, y0, x1, y1);
  else typeset(ctx, g, theme, seed, x0, y0, x1, y1);
}

/**
 * II · the typed margin: a steel band and a single red stop rule.
 *
 * The first version added tab ticks along the head as well, and it was reported
 * straight back as crowded and less beautiful than the gold it replaced — which
 * it was. The gilding's elegance never came from the vine; it came from a BRIGHT
 * RULE OVER A SHADOWED ONE, which is what reads as metal rather than as a
 * coloured line. So era II keeps exactly that and changes the metal: steel
 * instead of leaf, and no foliage on it, because a typed page is not decorated.
 *
 * What it adds is one mark and one only — the red margin stop. It is the single
 * thing a typist actually puts outside the text block, it is the ribbon's own
 * second colour, and one line is not crowding.
 */
function typeset(
  ctx: CanvasRenderingContext2D,
  g: Geometry,
  theme: Theme,
  seed: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  const m = g.pad * 0.4;
  const bx0 = x0 - m;
  const by0 = y0 - m;
  const bx1 = x1 + m;
  const by1 = y1 + m;

  // The same two-tone band the illumination uses, in the machine's material.
  // Tighter and a shade quieter: steel catches less light than gold leaf.
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = theme.leafDeep;
  ctx.lineWidth = g.cell * 0.034;
  ctx.strokeRect(bx0, by0, bx1 - bx0, by1 - by0);
  ctx.globalAlpha = 0.62;
  ctx.strokeStyle = theme.leaf;
  ctx.lineWidth = g.cell * 0.016;
  ctx.strokeRect(bx0 - 1, by0 - 1, bx1 - bx0, by1 - by0);
  ctx.restore();

  // The margin stop. Full height, because that is what a margin is.
  strikeStroke(ctx, [[x0 - m * 0.5, by0 - g.cell * 0.1], [x0 - m * 0.5, by1 + g.cell * 0.1]] as Pt[], {
    color: theme.blood,
    width: Math.max(1, g.cell * 0.018),
    seed: seed + 1201,
    amp: g.cell * 0.001,
    alpha: 0.42,
    wear: 0.5,
  });
}

function illuminate(
  ctx: CanvasRenderingContext2D,
  g: Geometry,
  theme: Theme,
  seed: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  const m = g.pad * 0.4;
  const bx0 = x0 - m;
  const by0 = y0 - m;
  const bx1 = x1 + m;
  const by1 = y1 + m;

  // Two-tone rule: a bright face over a shadowed one reads as metal rather than
  // as a yellow line.
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = theme.leafDeep;
  ctx.lineWidth = g.cell * 0.042;
  ctx.strokeRect(bx0, by0, bx1 - bx0, by1 - by0);
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = theme.leaf;
  ctx.lineWidth = g.cell * 0.022;
  ctx.strokeRect(bx0 - 1, by0 - 1, bx1 - bx0, by1 - by0);
  ctx.restore();

  // The vine: leaves growing off the band, each a short tapered brush mark angled
  // outward. Round beads read as a string of pearls on a wire; a tapered stroke
  // reads as foliage.
  const per = 8;
  const edges: [number, number, number, number, number, number][] = [
    [bx0, by0, bx1, by0, 0, -1],
    [bx1, by0, bx1, by1, 1, 0],
    [bx1, by1, bx0, by1, 0, 1],
    [bx0, by1, bx0, by0, -1, 0],
  ];
  edges.forEach(([ax, ay, bx, by, nx, ny], e) => {
    for (let i = 1; i < per; i++) {
      const t = i / per;
      const px = ax + (bx - ax) * t;
      const py = ay + (by - ay) * t;
      const h = hash3(seed + e * 31, i, 0);
      const len = g.cell * (0.07 + h * 0.05);
      // Alternate which side of the band each leaf grows from.
      const s = i % 2 === 0 ? 1 : -1;
      const lean = (h - 0.5) * 0.9;
      const tip: Pt = [
        px + nx * len * s + -ny * len * lean,
        py + ny * len * s + nx * len * lean,
      ];
      brushStroke(ctx, [[px, py], tip], {
        color: i % 3 === 0 ? theme.blood : h > 0.5 ? theme.leaf : theme.leafDeep,
        width: g.cell * (0.038 + h * 0.018),
        seed: seed + e * 131 + i * 17,
        amp: g.cell * 0.006,
        alpha: 0.4 + h * 0.32,
        dryness: 0.5,
      });
    }
  });

  // A scrolled volute out of each corner, doubled: a heavy shadowed arm and a
  // brighter one curling the other way.
  const corners: [number, number, number][] = [
    [bx0, by0, Math.PI * 1.25],
    [bx1, by0, Math.PI * 1.75],
    [bx1, by1, Math.PI * 0.25],
    [bx0, by1, Math.PI * 0.75],
  ];
  corners.forEach(([cx, cy, a], i) => {
    // Sized against the margin actually available (band corner to page edge),
    // not against the cell — a longer flourish is guaranteed to clip.
    const reach = Math.min(g.cell * 0.34, g.pad * 0.52);
    brushStroke(ctx, volutePath(cx, cy, reach, a, 1, 4.2, 30), {
      color: theme.leafDeep,
      width: g.cell * 0.055,
      seed: seed + 700 + i * 97,
      amp: g.cell * 0.007,
      alpha: 0.65,
      dryness: 0.6,
    });
    brushStroke(ctx, volutePath(cx, cy, reach * 0.62, a + 0.55, -1, 3.4, 24), {
      color: theme.leaf,
      width: g.cell * 0.036,
      seed: seed + 900 + i * 53,
      amp: g.cell * 0.005,
      alpha: 0.7,
      dryness: 0.7,
    });
  });
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export class Renderer {
  private paper: HTMLCanvasElement | null = null;
  private paperKey = '';
  /** The era's instrument. Set from the depth at the top of every draw. */
  private hand: Mark = 'brush';
  /**
   * The era's palette, likewise.
   *
   * Held here rather than looked up per call because `theme` is read from a few
   * dozen places a frame, and every one of them has to agree about which era it
   * is drawing — a floor half in one palette would be worse than either.
   */
  private palette: EraPalette = {};

  constructor(
    public canvas: HTMLCanvasElement,
    public effects: Effects,
    public themeName: ThemeName = 'day',
  ) {}

  get theme(): Theme {
    return themeFor(this.themeName, this.palette);
  }

  invalidatePaper(): void {
    this.paperKey = '';
  }

  /** Called on theme change: cached glyphs are tinted, so they must be redrawn. */
  invalidateGlyphs(): void {
    clearGlyphCache();
  }

  draw(
    state: GameState,
    anim: TurnAnim,
    clock: number,
    wallClock: number,
    moves: MoveOutcome[] = [],
  ): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    const wantW = Math.floor(cssW * dpr);
    const wantH = Math.floor(cssH * dpr);
    if (this.canvas.width !== wantW || this.canvas.height !== wantH) {
      this.canvas.width = wantW;
      this.canvas.height = wantH;
      this.invalidatePaper();
    }

    const size = Math.min(cssW, cssH);
    const g = geometry(size);
    const theme = this.theme;
    // ~9fps boil. Hand-drawn animation redraws; it does not tween.
    const boil = Math.floor(wallClock / 112) % 3;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const ox = (cssW - size) / 2;
    const oy = (cssH - size) / 2;

    /*
     * The instrument this floor is drawn with.
     *
     * Read off the era rather than passed in, so every mark on the board changes
     * hand together the moment you descend into a new one — actors, items, hero.
     */
    const era = eraAt(state.depth);
    this.hand = era.hand;
    // The effects layer draws outside this class but must speak the same hand:
    // its splatter, its flourishes and its floating numerals all branch on it.
    this.effects.hand = era.hand;
    if (this.palette !== era.palette) {
      // A new era is a different set of colours in every cached glyph bitmap.
      this.palette = era.palette;
      clearGlyphCache();
    }

    const key = `${cssW}x${cssH}:${size}:${this.themeName}:${era.id}:${state.depth}:${dpr}`;
    if (!this.paper || this.paperKey !== key) {
      this.paper = makePaper(cssW, cssH, size, ox, oy, theme, state.depth, dpr, era);
      this.paperKey = key;
    }

    const [sx, sy] = this.effects.shakeOffset(wallClock);
    ctx.save();
    ctx.translate(ox + sx, oy + sy);

    // The whole page is what gets knocked, so the wash is drawn inside the
    // shaken transform and offset back to cover the full canvas.
    ctx.drawImage(this.paper, -ox, -oy, cssW, cssH);

    this.effects.ensureStainLayer(Math.floor(size), Math.floor(size));
    const stains = this.effects.stainCanvas;
    if (stains) ctx.drawImage(stains, 0, 0, size, size);

    this.drawBlots(ctx, g, state, boil);
    this.drawStairs(ctx, g, state, boil, wallClock);
    this.drawItems(ctx, g, state, boil, wallClock);
    this.drawTrail(ctx, g, state);
    this.drawTelegraphs(ctx, g, state, clock, anim, boil, wallClock, moves);
    this.drawEnemies(ctx, g, state, anim, clock, boil, moves);
    this.drawHero(ctx, g, state, anim, clock, boil);
    // Last, and over everything. This is now the most important information on
    // the page — a silhouette it covered would be a fair trade, and it sits on
    // tile edges rather than centres so it does not have to make one.
    this.drawCosts(ctx, g, state, clock, anim, moves, boil);

    this.effects.drawRings(ctx);
    this.effects.drawDrops(ctx);
    // Over the actors: the flourish is the stroke you just made, so it sits on
    // top of the thing it was made at.
    this.effects.drawFlourishes(ctx);
    this.effects.drawTexts(ctx);

    ctx.restore();

    this.drawVignette(ctx, cssW, cssH, state, wallClock);

    if (this.effects.flash > 0.004) {
      ctx.save();
      ctx.globalAlpha = this.effects.flash;
      ctx.fillStyle = this.effects.flashColor;
      ctx.fillRect(0, 0, cssW, cssH);
      ctx.restore();
    }
  }

  /**
   * Impassable ink.
   *
   * What that MEANS is era-dependent, and it is the last thing on the board that
   * was still a manuscript artefact in era II. A scribe's page gets a spilled
   * blot; a typist does not spill ink, a typist strikes a passage out — so era II
   * blocks a tile with a block of struck-over characters, xxxx, which is exactly
   * what "you cannot go here, this is deleted" looks like on a typed page.
   */
  private drawBlots(ctx: CanvasRenderingContext2D, g: Geometry, s: GameState, boil: number): void {
    for (const b of s.blots) {
      const [cx, cy] = centerOf(g, b);
      const seed = b.x * 131 + b.y * 977 + 17;

      if (this.hand !== 'brush') {
        const r = g.cell * 0.34;
        const rows = 3;
        for (let row = 0; row < rows; row++) {
          const y = cy + (row - (rows - 1) / 2) * (r * 0.62);
          // Struck over twice, the way a typist actually kills a word: the
          // crossbars first, then the same line hit again slightly off.
          for (const lean of [1, -1]) {
            strikeStroke(
              ctx,
              [
                [cx - r, y - r * 0.26 * lean],
                [cx + r, y + r * 0.26 * lean],
              ] as Pt[],
              {
                color: this.theme.ink,
                width: g.cell * 0.055,
                seed: seed + row * 71 + (lean > 0 ? 0 : 311),
                amp: g.cell * 0.004,
                alpha: 0.88,
                boil,
                wear: 0.3,
              },
            );
          }
        }
        continue;
      }

      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = this.theme.ink;
      blobPath(ctx, cx, cy, g.cell * 0.36, seed, 0.42, 13, boil);
      ctx.fill();
      // A couple of satellites so it reads as spilled, not placed.
      for (let i = 0; i < 3; i++) {
        const a = hash3(seed, i, 0) * Math.PI * 2;
        const d = g.cell * (0.34 + hash3(seed, i + 9, 0) * 0.14);
        ctx.globalAlpha = 0.55;
        blobPath(
          ctx,
          cx + Math.cos(a) * d,
          cy + Math.sin(a) * d,
          g.cell * (0.03 + hash3(seed, i + 21, 0) * 0.05),
          seed + i * 37,
          0.5,
          9,
          boil,
        );
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawStairs(
    ctx: CanvasRenderingContext2D,
    g: Geometry,
    s: GameState,
    boil: number,
    wall: number,
  ): void {
    const [cx, cy] = centerOf(g, s.stairs);
    const theme = this.theme;

    if (s.stairsOpen) {
      const pulse = 0.5 + 0.5 * Math.sin(wall / 420);
      ctx.save();
      ctx.globalAlpha = 0.14 + pulse * 0.12;
      ctx.strokeStyle = theme.gold;
      ctx.lineWidth = g.cell * 0.05;
      ctx.beginPath();
      ctx.arc(cx, cy, g.cell * (0.4 + pulse * 0.05), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      drawGlyph(ctx, STAIRS, cx, cy, {
        color: theme.leaf,
        size: g.cell * 0.62,
        seed: 5501,
        boil,
        alpha: 0.95,
        mark: this.hand,
      });
    } else {
      // Sealed: the way down is visible from the moment you arrive, so the floor
      // can be planned around it — but a wax seal says you have not earned it.
      drawGlyph(ctx, STAIRS, cx, cy, {
        color: theme.inkSoft,
        size: g.cell * 0.62,
        seed: 5501,
        boil,
        alpha: 0.42,
        passes: 1,
      });
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = theme.blood;
      blobPath(ctx, cx, cy, g.cell * 0.19, 6601, 0.36, 11, boil);
      ctx.fill();
      ctx.restore();
      // A cross pressed into the wax — legible at a glance as "shut".
      const s = g.cell * 0.085;
      for (const [ax, ay, bx, by] of [
        [-s, -s, s, s],
        [s, -s, -s, s],
      ]) {
        inkStroke(
          ctx,
          [
            [cx + ax, cy + ay],
            [cx + bx, cy + by],
          ] as Pt[],
          {
            color: theme.paper,
            width: g.cell * 0.03,
            seed: 6700 + ax,
            amp: g.cell * 0.005,
            alpha: 0.8,
            boil,
            passes: 1,
          },
        );
      }
    }
  }

  private drawItems(
    ctx: CanvasRenderingContext2D,
    g: Geometry,
    s: GameState,
    boil: number,
    wall: number,
  ): void {
    for (const it of s.items) {
      const [cx, cy] = centerOf(g, it.pos);
      const bob = Math.sin(wall / 380 + it.seed) * g.cell * 0.035;
      const pulse = 0.5 + 0.5 * Math.sin(wall / 300 + it.seed);
      ctx.save();
      // A brighter, wider halo than the border gilding gets: a pickup has to read
      // as treasure at a glance, against a hero that is now blue and foes that
      // are still ink.
      ctx.globalAlpha = 0.16 + pulse * 0.14;
      ctx.fillStyle = this.theme.leaf;
      ctx.beginPath();
      ctx.arc(cx, cy + bob, g.cell * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      drawGlyph(ctx, ITEM_GLYPHS[it.kind], cx, cy + bob, {
        color: this.theme.leafDeep,
        size: g.cell * 0.46,
        seed: it.seed,
        boil,
        mark: this.hand,
      });
    }
  }

  /**
   * Telegraphs. This is the game's primary information channel, so it is drawn
   * UNDER the actors (never obscuring a silhouette) and colour-coded: ink for a
   * step, blood for a blow that lands on you.
   */
  /**
   * The ink you have already left on the page.
   *
   * WEAR charges for stepping onto paper you have marked, so the marks have to
   * be ON the paper — a cost the player cannot see is a cost they cannot avoid,
   * and the whole point of this mechanic is that it is avoidable.
   *
   * Drawn as a smudge rather than a symbol: a faint darkening of the tile,
   * heaviest where you most recently stood and fading back through the trail.
   * It reads as texture the way the foxing and the paper wash do, so it costs
   * the board nothing in legibility — which is exactly the argument for choosing
   * this over adding more bodies to it.
   */
  private drawTrail(ctx: CanvasRenderingContext2D, g: Geometry, s: GameState): void {
    const trail = s.player.trail;
    if (s.rules.wearMemory <= 0 || trail.length === 0) return;

    ctx.save();
    for (let i = 0; i < trail.length; i++) {
      const [cx, cy] = centerOf(g, trail[i]);
      // Freshest smudge is darkest; the oldest is nearly gone, which also tells
      // you which ones are about to stop costing anything.
      const age = 1 - i / Math.max(1, trail.length);
      ctx.globalAlpha = 0.05 + age * 0.07;
      ctx.fillStyle = this.theme.grain;
      ctx.beginPath();
      ctx.arc(cx, cy, g.cell * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawTelegraphs(
    ctx: CanvasRenderingContext2D,
    g: Geometry,
    s: GameState,
    clock: number,
    anim: TurnAnim,
    boil: number,
    wall: number,
    moves: MoveOutcome[],
  ): void {
    // Hide telegraphs while the turn they belong to is still resolving,
    // otherwise the new plan appears before the old one has finished playing.
    const settled = clamp01((clock - anim.total * 0.55) / 120);
    if (settled <= 0.01) return;

    const theme = this.theme;
    const pulse = 0.5 + 0.5 * Math.sin(wall / 300);

    // Which foes your stroke could actually stop this turn.
    //
    // Dashed has always meant "breakable" and solid "happening regardless", but
    // it was reading the enemy's stance alone — so a WARDEN you cannot dent for
    // want of three damage still advertised itself as interruptible. Where you
    // are in reach and therefore actually deciding, the line now tells the truth
    // about YOUR stroke. Out of reach it keeps its old meaning, which is the
    // enemy's stance, because nothing you do this turn can change it anyway.
    const stoppable = new Set<string>();
    const inReach = new Set<string>();
    for (const m of moves) {
      if (!m.legal || m.kind !== 'strike') continue;
      const t = add(s.player.pos, DIR_VEC[m.dir]);
      inReach.add(`${t.x},${t.y}`);
      if (m.breaks || m.kills) stoppable.add(`${t.x},${t.y}`);
    }

    for (const e of s.enemies) {
      const intent = e.intent;
      const [ex, ey] = centerOf(g, e.pos);

      if (intent.kind === 'wind') {
        // Winding up: a tightening dashed ring. You have exactly one turn.
        ctx.save();
        ctx.globalAlpha = settled * (0.35 + pulse * 0.4);
        ctx.strokeStyle = theme.blood;
        ctx.lineWidth = g.cell * 0.035;
        ctx.setLineDash([g.cell * 0.09, g.cell * 0.07]);
        ctx.beginPath();
        ctx.arc(ex, ey, g.cell * (0.4 - pulse * 0.06), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        continue;
      }
      /*
       * A sweep. Drawn as a struck RULE through every tile it covers, plus a
       * tick across each one, because the thing being promised is a line and not
       * a destination — there is no arrowhead and no ghost, since nothing is
       * going anywhere.
       *
       * Always the danger colour when it covers you and always drawn solid: a
       * sweep is not dodged by stepping one tile, it is dodged by not being in
       * the line, so "you could break this" is the wrong emphasis entirely.
       */
      if (intent.kind === 'sweep') {
        if (intent.tiles.length === 0) continue;
        const threat = intentThreatens(intent, s.player.pos);
        const color = threat ? theme.blood : theme.ghost;
        const alpha = settled * (threat ? 0.6 + pulse * 0.3 : 0.34);

        /*
         * One rule per LINE, worked out from the tiles themselves.
         *
         * The first version drew a single spine between the bounding corners of
         * the tile set, which is right for one row and one column and wrong for
         * anything else — the CARRIAGE RETURN's band of three rows came out as a
         * single diagonal across the board, which says nothing true at all.
         * Caught by a screenshot rather than a test, because the engine was
         * correct throughout and only the drawing lied.
         *
         * A column is the special case: everything shares an x. Everything else
         * is drawn as horizontal rules, one per distinct row, which covers both
         * a single swept row and a band of them.
         */
        const lines: Pt[][] = [];
        const allSameX = intent.tiles.every((t) => t.x === intent.tiles[0].x);
        if (allSameX) {
          const ys = intent.tiles.map((t) => centerOf(g, t)[1]);
          const [x] = centerOf(g, intent.tiles[0]);
          lines.push([
            [x, Math.min(...ys)],
            [x, Math.max(...ys)],
          ]);
        } else {
          const byRow = new Map<number, number[]>();
          for (const t of intent.tiles) {
            const [cx, cy] = centerOf(g, t);
            const row = byRow.get(cy) ?? [];
            row.push(cx);
            byRow.set(cy, row);
          }
          for (const [cy, xs] of byRow) {
            lines.push([
              [Math.min(...xs), cy],
              [Math.max(...xs), cy],
            ]);
          }
        }

        lines.forEach((line, i) => {
          inkStroke(ctx, line, {
            color,
            width: g.cell * (threat ? 0.05 : 0.034),
            seed: e.seed + 313 + i * 37,
            amp: g.cell * 0.008,
            alpha,
            boil,
            passes: threat ? 2 : 1,
          });
        });

        // A tick on every covered tile, so a line reads as "these squares"
        // rather than as a wall drawn between them. Crosswise to its own rule.
        const across = g.cell * (threat ? 0.2 : 0.14);
        for (const t of intent.tiles) {
          const [tx, ty] = centerOf(g, t);
          const tick: Pt[] = allSameX
            ? [
                [tx - across, ty],
                [tx + across, ty],
              ]
            : [
                [tx, ty - across],
                [tx, ty + across],
              ];
          inkStroke(ctx, tick, {
            color,
            width: g.cell * 0.03,
            seed: e.seed + 404 + tx,
            amp: g.cell * 0.006,
            alpha: alpha * 0.85,
            boil,
            passes: 1,
          });
        }
        continue;
      }

      if (intent.kind === 'hold' || intent.path.length === 0) continue;

      const threat = intentThreatens(intent, s.player.pos);
      const color = threat ? theme.blood : theme.ghost;
      const alpha = settled * (threat ? 0.55 + pulse * 0.3 : 0.4);
      const dest = intent.path[intent.path.length - 1];
      const [dx, dy] = centerOf(g, dest);

      // Drawn SOLID and heavier when no stroke of yours will stop it this turn —
      // either its stance is already braced, or it is standing next to you and
      // your blow is too light for its poise. Dashed means "you can break this".
      const key = `${e.pos.x},${e.pos.y}`;
      const braced = !e.poise || (inReach.has(key) && !stoppable.has(key));

      // The committed path.
      const pts: Pt[] = [[ex, ey]];
      for (const p of intent.path) pts.push(centerOf(g, p));
      inkStroke(ctx, pts, {
        color,
        width: g.cell * (threat ? 0.045 : 0.032) * (braced ? 1.35 : 1),
        seed: e.seed + 909,
        amp: g.cell * 0.012,
        alpha: braced ? Math.min(1, alpha * 1.4) : alpha,
        boil,
        passes: braced ? 2 : 1,
        ...(braced ? {} : { dash: [g.cell * 0.1, g.cell * 0.09] }),
      });

      // Ghost of where it will stand.
      drawGlyph(ctx, glyphFor(e.kind), dx, dy, {
        color,
        size: g.cell * 0.5,
        seed: e.seed,
        boil,
        alpha: alpha * 0.6,
        passes: 1,
        widthScale: 0.8,
      });

      // Arrowhead into the destination.
      const ang = Math.atan2(dy - ey, dx - ex);
      const head = g.cell * 0.13;
      const back = g.cell * 0.3;
      const hx = dx - Math.cos(ang) * back;
      const hy = dy - Math.sin(ang) * back;
      inkStroke(
        ctx,
        [
          [hx - Math.cos(ang - 0.6) * head, hy - Math.sin(ang - 0.6) * head],
          [hx, hy],
          [hx - Math.cos(ang + 0.6) * head, hy - Math.sin(ang + 0.6) * head],
        ] as Pt[],
        {
          color,
          width: g.cell * 0.04,
          seed: e.seed + 77,
          amp: g.cell * 0.008,
          alpha,
          boil,
          passes: 1,
        },
      );
    }
  }

  /**
   * What each of your four moves costs, stated before you spend the turn.
   *
   * The game claimed to be readable one turn ahead and was not. Telegraphs are
   * coloured against the tile you are STANDING ON, so for the three directions
   * where you would move, the board answered a different question than the one
   * being asked — a grey path can run straight through the tile you are about to
   * step into. And a stroke's outcome needed arithmetic over three numbers, one
   * of which (poiseBreak) appeared nowhere in the game at all.
   *
   * These figures are not estimates. `previewMoves` plays each direction on a
   * throwaway copy of the state, and because enemies commit to their intents the
   * phase that follows your move is fully determined. It is what will happen.
   */
  private drawCosts(
    ctx: CanvasRenderingContext2D,
    g: Geometry,
    s: GameState,
    clock: number,
    anim: TurnAnim,
    moves: MoveOutcome[],
    boil: number,
  ): void {
    if (moves.length === 0) return;
    // Same settle gate as the telegraphs: no advice about the next turn until
    // the one it belongs to has finished playing out.
    const settled = clamp01((clock - anim.total * 0.55) / 120);
    if (settled <= 0.01) return;

    const [px, py] = centerOf(g, s.player.pos);
    const theme = this.theme;

    for (const m of moves) {
      if (!m.legal) continue;
      const v = DIR_VEC[m.dir];

      /* --- your stroke stops this one ---------------------------------- */
      // Drawn as a break mark on the foe rather than as a warning on the ones
      // you cannot stop: absence then means "this happens whatever you do",
      // which is how poise becomes learnable without ever showing a number.
      // There is no longer a mark for "your stroke stops this one".
      //
      // It was an ✗ beside the foe, and it was read as "this will damage me" —
      // the exact opposite of what it said. A cross on a board game means bad,
      // or forbidden, or dead, and no amount of placement was going to overrule
      // that. What survives says the same thing without a symbol to learn: the
      // foe's health pips turn to blood for the damage your stroke would do, and
      // its telegraph is drawn solid when you cannot break it.

      if (m.taken <= 0) continue;

      /* --- what it costs you ------------------------------------------- */
      /*
       * WEIGHED, not numbered.
       *
       * Four numerals in a ring around the hero is four things to READ, and the
       * moment you most need them is the moment you have least time —
       * surrounded, everything ready. Reported from play as exactly that: "if
       * you are surrounded by enemies all ready to attack there's a lot of
       * numbers on the screen".
       *
       * So an ordinary cost is struck as a WEIGHT on the edge you would leave
       * by: a bar whose length and darkness are the price. Four options become a
       * shape — you see which side of you is heavy and which is clear without
       * parsing anything — and comparing directions, which is the actual
       * decision, becomes the thing the drawing is best at.
       *
       * A tally of one mark per point was tried first and is wrong, because
       * exposure doubles: a surrounded board at depth nine costs sixteen and
       * eighteen, not one and two. Nothing countable survives contact with the
       * numbers this game actually produces.
       *
       * The bar saturates at SIX, which is roughly a full bar of health. Past
       * that the exact figure has stopped mattering — everything above it is
       * simply "this is enormous" — and the one number that still does have a
       * numeral of its own.
       *
       * Inside your own tile, because these are your four options and not
       * properties of your neighbours; on the neighbours they collided with
       * whatever already lived there.
       */
      const ex = px + v.x * g.cell * 0.44;
      const ey = py + v.y * g.cell * 0.44;
      const perp = { x: -v.y, y: v.x };

      ctx.save();

      if (!m.lethal) {
        const heft = clamp01((m.taken - 1) / (COST_FULL - 1));
        const half = g.cell * (0.11 + 0.23 * heft);
        inkStroke(
          ctx,
          [
            [ex - perp.x * half, ey - perp.y * half],
            [ex + perp.x * half, ey + perp.y * half],
          ] as Pt[],
          {
            color: theme.blood,
            width: g.cell * (0.022 + 0.03 * heft),
            seed: costSeed(s, m.dir),
            amp: g.cell * 0.007,
            alpha: settled * (0.45 + 0.5 * heft),
            boil,
            passes: 1,
          },
        );
        ctx.restore();
        continue;
      }

      // A cost that ENDS THE RUN keeps its numeral and its ring. It is the one
      // thing on the board worth stopping to read, and the paper is cleared out
      // from under it so it can never be lost against a foe behind.
      const cx = px + v.x * g.cell * 0.33;
      const cy = py + v.y * g.cell * 0.33;
      const size = g.cell * (m.lethal ? 0.25 : 0.19);

      ctx.fillStyle = theme.paper;
      ctx.globalAlpha = settled * 0.82;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.78, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = settled;
      ctx.fillStyle = theme.blood;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(size)}px "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`;
      ctx.fillText(String(m.taken), cx, cy + size * 0.04);

      if (m.lethal) {
        ctx.globalAlpha = settled * 0.9;
        ctx.strokeStyle = theme.blood;
        ctx.lineWidth = g.cell * 0.028;
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.86, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawEnemies(
    ctx: CanvasRenderingContext2D,
    g: Geometry,
    s: GameState,
    anim: TurnAnim,
    clock: number,
    boil: number,
    moves: MoveOutcome[],
  ): void {
    // How much a stroke into each foe would take off it, so "will this kill it"
    // stops being arithmetic over a number the game never showed you.
    const incoming = new Map<string, MoveOutcome>();
    for (const m of moves) {
      if (m.legal && m.kind === 'strike') {
        const t = add(s.player.pos, DIR_VEC[m.dir]);
        incoming.set(`${t.x},${t.y}`, m);
      }
    }

    for (const e of s.enemies) {
      const m = anim.enemyMotions.get(e.id);
      const at = m ? motionAt(m, clock).pos : e.pos;
      const [cx, cy] = centerOf(g, at);
      const st = ENEMY_STATS[e.kind];

      // A wound-up slow enemy leans forward — readable even without the ring.
      const coiled = st.slow && e.ready ? 1.06 : 1;
      // A boss fills more of its tile than anything else on the page. It is the
      // only thing on the floor and it should look like the reason you are here.
      const scale = e.kind === eraAt(s.depth).boss && isBossFloor(s.depth) ? 0.78 : 0.56;

      drawGlyph(ctx, glyphFor(e.kind), cx, cy, {
        color: this.theme.ink,
        size: g.cell * scale,
        scale: coiled,
        seed: e.seed,
        boil,
        mark: this.hand,
      });

      // The guard bracket over a braced foe is gone. It meant "a stroke will not
      // break this", which is now exactly what a solid telegraph says — and one
      // fact does not need two symbols on a board this small.

      // Health pips, so "how many more strokes" is never a memory test. They sit
      // clear of the wind-up ring (r ≈ 0.40 cell) — overlapping it made a
      // WARDEN's remaining health read as part of the telegraph. Drawn even for
      // a one-health RAT, so "all its pips are blood" reads as death on every
      // foe rather than only on the ones big enough to have a row.
      {
        const pipR = g.cell * 0.028;
        const gap = pipR * 3.1;
        const total = (e.maxHp - 1) * gap;
        const py = cy + g.cell * 0.47;
        // Pips your next stroke would take off, marked in blood. Reading "5 down
        // to 2" off the row it already lives on beats a floating number, and a
        // kill is unmistakable because every filled pip is struck.
        const hit = incoming.get(`${e.pos.x},${e.pos.y}`);
        const doomed = hit ? Math.max(0, e.hp - hit.dealt) : e.hp;
        for (let i = 0; i < e.maxHp; i++) {
          const px = cx - total / 2 + i * gap;
          const alive = i < e.hp;
          const taken = alive && i >= doomed;
          ctx.save();
          ctx.globalAlpha = alive ? 0.85 : 0.22;
          ctx.fillStyle = taken ? this.theme.blood : this.theme.ink;
          // Pips your stroke would take off are drawn heavier as well as red. On
          // a one-health RAT the entire message is a single dot, and a dot that
          // only changes hue is not a message.
          blobPath(ctx, px, py, taken ? pipR * 1.5 : pipR, e.seed + i * 53, 0.35, 8, boil);
          ctx.fill();
          ctx.restore();
        }
      }
    }
  }

  private drawHero(
    ctx: CanvasRenderingContext2D,
    g: Geometry,
    s: GameState,
    anim: TurnAnim,
    clock: number,
    boil: number,
  ): void {
    const m = anim.playerMotion;
    const { pos, scale } = m ? motionAt(m, clock) : { pos: s.player.pos, scale: 1 };
    const [cx, cy] = centerOf(g, pos);
    // The tile you are ACTUALLY standing on. After a bump this is where you
    // started, because a bump is a swing and not a step; after a move the engine
    // has already put you at the destination, so the anchor leads you into it.
    const [tx, ty] = centerOf(g, s.player.pos);
    const theme = this.theme;

    /* ---------------------------------------------------------------------
     * The anchor: where you are, while the body is somewhere else.
     *
     * Only drawn DURING a swing, and only for a swing. At rest it is four more
     * marks on a page that already had too many, and a plain step needs no
     * anchor at all because the body is travelling toward it and arrives.
     * ------------------------------------------------------------------ */
    {
      const swinging = m !== null && m.kind !== 'move';
      const travel = swinging
        ? Math.abs(pos.x - s.player.pos.x) + Math.abs(pos.y - s.player.pos.y)
        : 0;
      const lift = clamp01(travel / 0.3);
      const r = g.cell * 0.4;
      const arm = g.cell * 0.12;
      // Straight into inkStroke's own alpha: it assigns globalAlpha rather than
      // multiplying into it, so anything set on the context here is discarded.
      const ink = lift * 0.62;
      if (ink >= 0.02) {
        for (const [sx, sy] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ]) {
          inkStroke(
            ctx,
            [
              [tx + sx * r - sx * arm, ty + sy * r],
              [tx + sx * r, ty + sy * r],
              [tx + sx * r, ty + sy * r - sy * arm],
            ] as Pt[],
            {
              color: theme.hero,
              width: g.cell * 0.026,
              seed: 5150 + sx * 7 + sy * 13,
              amp: g.cell * 0.005,
              alpha: ink,
              boil,
              passes: 1,
            },
          );
        }
      }
    }

    /* ---------------------------------------------------------------------
     * Nothing here draws EXPOSED, and that is deliberate.
     *
     * It used to carry four indicators at once — a pulsing blood ring on the
     * tile, a strike through the rune, three dots beneath it, and a struck-out
     * line in the chrome — for one boolean. Every one of them was asking the
     * player to learn a symbol and then do the arithmetic it implied.
     *
     * The per-direction costs already carry the whole consequence. Exposure
     * doubles incoming damage, and the cost numerals are computed by actually
     * running the turn, so a strike that would cost 3 simply reads 6. The
     * mechanism does not need a glyph when the outcome is on the board, and one
     * number beats four symbols and a multiplication.
     *
     * The combo tally went the same way: what a combo does is make your next
     * stroke heavier, and that shows up as more of a foe's health pips turning
     * to blood.
     * ------------------------------------------------------------------ */
    drawGlyph(ctx, HERO, cx, cy, {
      color: theme.hero,
      size: g.cell * 0.58,
      scale,
      seed: 101,
      boil,
      rotation: FACING_ROTATION[s.player.facing] ?? 0,
      mark: this.hand,
    });
  }

  /** Low health darkens the page from the edges in. */
  private drawVignette(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    s: GameState,
    wall: number,
  ): void {
    const ratio = s.player.hp / s.player.maxHp;
    if (ratio > 0.5) return;
    const danger = 1 - ratio / 0.5;
    const pulse = 0.72 + 0.28 * Math.sin(wall / (ratio <= 0.2 ? 320 : 620));
    const grd = ctx.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.24,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.66,
    );
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, this.theme.danger);
    ctx.save();
    ctx.globalAlpha = danger * 0.34 * pulse;
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /** Board pixel position for a tile — used to aim effects from event data. */
  tileCenter(size: number, v: Vec): [number, number] {
    return centerOf(geometry(size), v);
  }
}
