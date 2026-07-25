import { ENEMY_STATS, intentThreatens } from '../game/enemies';
import { SIZE } from '../game/grid';
import type { Ev, GameState, Vec } from '../game/types';
import { Effects } from './effects';
import {
  FACING_ROTATION,
  HERO,
  ITEM_GLYPHS,
  STAIRS,
  drawGlyph,
  glyphFor,
} from './glyphs';
import {
  blobPath,
  clamp01,
  easeOutCubic,
  easeOutQuint,
  hash3,
  inkStroke,
  lerp,
  type Pt,
} from './ink';
import { THEMES, type Theme, type ThemeName } from './theme';

/* -------------------------------------------------------------------------
 * Turn timing. Snappy on purpose: a whole turn resolves in about a quarter of a
 * second, so thinking time is yours and animation time is not.
 * ---------------------------------------------------------------------- */
export const MOVE_MS = 105;
export const BUMP_MS = 185;
/** Fraction of a bump spent lunging out; the rest is the recovery back. */
const BUMP_OUT = 0.42;
const BLOCK_MS = 150;
const GAP_MS = 25;
const ENEMY_MS = 135;
const TAIL_MS = 40;

interface Motion {
  from: Vec;
  to: Vec;
  t0: number;
  t1: number;
  kind: 'move' | 'bump' | 'block';
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

  for (const ev of events) {
    if (ev.t === 'move') {
      playerMotion = { from: ev.from, to: ev.to, t0: 0, t1: MOVE_MS, kind: 'move' };
      playerDur = Math.max(playerDur, MOVE_MS);
    } else if (ev.t === 'bump') {
      playerMotion = { from: ev.from, to: ev.to, t0: 0, t1: BUMP_MS, kind: 'bump' };
      playerDur = Math.max(playerDur, BUMP_MS);
    } else if (ev.t === 'blocked') {
      const wall = { x: ev.pos.x, y: ev.pos.y };
      playerMotion = { from: ev.pos, to: wall, t0: 0, t1: BLOCK_MS, kind: 'block' };
      playerDur = Math.max(playerDur, BLOCK_MS);
    }
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
      case 'bump':
        cues.push({ at: BUMP_MS * BUMP_OUT, ev });
        break;
      case 'kill':
        cues.push({ at: BUMP_MS * BUMP_OUT + 10, ev });
        break;
      case 'pickup':
        cues.push({ at: MOVE_MS * 0.7, ev });
        break;
      case 'descend':
        cues.push({ at: 0, ev });
        break;
      case 'emove':
        enemyMotions.set(ev.id, {
          from: ev.from,
          to: ev.to,
          t0: eStart,
          t1: eStart + ENEMY_MS,
          kind: 'move',
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
      case 'spill':
        // After the enemy phase has landed, so the new arrival is not mistaken
        // for one of the foes that just moved.
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

/** Interpolated tile-space position for a motion at time `clock`. */
function motionAt(m: Motion, clock: number): { pos: Vec; scale: number } {
  if (clock <= m.t0) return { pos: m.from, scale: 1 };
  if (clock >= m.t1) return { pos: m.to, scale: 1 };
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

  // Bump / block: lunge out, snap back. You never arrive — that is the point.
  const reach = m.kind === 'bump' ? 0.46 : 0.16;
  let f: number;
  let scale: number;
  if (p < BUMP_OUT) {
    const q = p / BUMP_OUT;
    f = easeOutQuint(q) * reach;
    scale = 1 + q * 0.16;
  } else {
    const q = (p - BUMP_OUT) / (1 - BUMP_OUT);
    f = reach * (1 - easeOutCubic(q));
    scale = 1 + (1 - q) * 0.16 - q * 0.06;
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
  const pad = size * 0.058;
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

  // Foxing — a few soft age spots, stable per depth.
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = theme.grain;
  for (let i = 0; i < 6; i++) {
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
  for (let i = 1; i < SIZE; i++) {
    const x = x0 + g.cell * i;
    const y = y0 + g.cell * i;
    inkStroke(ctx, [[x, y0], [x, y1]] as Pt[], {
      color: theme.rule,
      width: Math.max(1, g.cell * 0.016),
      seed: seed + i * 17,
      amp: g.cell * 0.012,
      alpha: 0.85,
      passes: 1,
    });
    inkStroke(ctx, [[x0, y], [x1, y]] as Pt[], {
      color: theme.rule,
      width: Math.max(1, g.cell * 0.016),
      seed: seed + i * 41 + 500,
      amp: g.cell * 0.012,
      alpha: 0.85,
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

  // The depth, written in the margin.
  ctx.save();
  ctx.globalAlpha = 0.36;
  ctx.fillStyle = theme.ink;
  ctx.font = `italic 600 ${Math.round(g.pad * 0.62)}px "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${depth}`, x0 + 2, y0 - g.pad * 0.28);
  ctx.restore();

  return c;
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

  constructor(
    public canvas: HTMLCanvasElement,
    public effects: Effects,
    public themeName: ThemeName = 'day',
  ) {}

  get theme(): Theme {
    return THEMES[this.themeName];
  }

  invalidatePaper(): void {
    this.paperKey = '';
  }

  draw(state: GameState, anim: TurnAnim, clock: number, wallClock: number): void {
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

    const key = `${cssW}x${cssH}:${size}:${this.themeName}:${state.depth}:${dpr}`;
    if (!this.paper || this.paperKey !== key) {
      this.paper = makePaper(cssW, cssH, size, ox, oy, theme, state.depth, dpr);
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
    this.drawTelegraphs(ctx, g, state, clock, anim, boil, wallClock);
    this.drawEnemies(ctx, g, state, anim, clock, boil);
    this.drawHero(ctx, g, state, anim, clock, boil, wallClock);

    this.effects.drawRings(ctx);
    this.effects.drawDrops(ctx);
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

  private drawBlots(ctx: CanvasRenderingContext2D, g: Geometry, s: GameState, boil: number): void {
    for (const b of s.blots) {
      const [cx, cy] = centerOf(g, b);
      const seed = b.x * 131 + b.y * 977 + 17;
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
        color: theme.gold,
        size: g.cell * 0.62,
        seed: 5501,
        boil,
        alpha: 0.95,
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
      ctx.globalAlpha = 0.1 + pulse * 0.1;
      ctx.fillStyle = this.theme.gold;
      ctx.beginPath();
      ctx.arc(cx, cy + bob, g.cell * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      drawGlyph(ctx, ITEM_GLYPHS[it.kind], cx, cy + bob, {
        color: this.theme.gold,
        size: g.cell * 0.46,
        seed: it.seed,
        boil,
      });
    }
  }

  /**
   * Telegraphs. This is the game's primary information channel, so it is drawn
   * UNDER the actors (never obscuring a silhouette) and colour-coded: ink for a
   * step, blood for a blow that lands on you.
   */
  private drawTelegraphs(
    ctx: CanvasRenderingContext2D,
    g: Geometry,
    s: GameState,
    clock: number,
    anim: TurnAnim,
    boil: number,
    wall: number,
  ): void {
    // Hide telegraphs while the turn they belong to is still resolving,
    // otherwise the new plan appears before the old one has finished playing.
    const settled = clamp01((clock - anim.total * 0.55) / 120);
    if (settled <= 0.01) return;

    const theme = this.theme;
    const pulse = 0.5 + 0.5 * Math.sin(wall / 300);

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
      if (intent.kind === 'hold' || intent.path.length === 0) continue;

      const threat = intentThreatens(intent, s.player.pos);
      const color = threat ? theme.blood : theme.ghost;
      const alpha = settled * (threat ? 0.55 + pulse * 0.3 : 0.4);
      const dest = intent.path[intent.path.length - 1];
      const [dx, dy] = centerOf(g, dest);

      // The committed path.
      const pts: Pt[] = [[ex, ey]];
      for (const p of intent.path) pts.push(centerOf(g, p));
      inkStroke(ctx, pts, {
        color,
        width: g.cell * (threat ? 0.045 : 0.032),
        seed: e.seed + 909,
        amp: g.cell * 0.012,
        alpha,
        boil,
        passes: 1,
        dash: [g.cell * 0.1, g.cell * 0.09],
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

  private drawEnemies(
    ctx: CanvasRenderingContext2D,
    g: Geometry,
    s: GameState,
    anim: TurnAnim,
    clock: number,
    boil: number,
  ): void {
    for (const e of s.enemies) {
      const m = anim.enemyMotions.get(e.id);
      const at = m ? motionAt(m, clock).pos : e.pos;
      const [cx, cy] = centerOf(g, at);
      const st = ENEMY_STATS[e.kind];

      // A wound-up slow enemy leans forward — readable even without the ring.
      const coiled = st.slow && e.ready ? 1.06 : 1;

      drawGlyph(ctx, glyphFor(e.kind), cx, cy, {
        color: this.theme.ink,
        size: g.cell * 0.56 * coiled,
        seed: e.seed,
        boil,
      });

      // Health pips, so "how many more strokes" is never a memory test. They sit
      // clear of the wind-up ring (r ≈ 0.40 cell) — overlapping it made a
      // WARDEN's remaining health read as part of the telegraph.
      if (e.maxHp > 1) {
        const pipR = g.cell * 0.028;
        const gap = pipR * 3.1;
        const total = (e.maxHp - 1) * gap;
        const py = cy + g.cell * 0.47;
        for (let i = 0; i < e.maxHp; i++) {
          const px = cx - total / 2 + i * gap;
          ctx.save();
          ctx.globalAlpha = i < e.hp ? 0.85 : 0.22;
          ctx.fillStyle = this.theme.ink;
          blobPath(ctx, px, py, pipR, e.seed + i * 53, 0.35, 8, boil);
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
    wall: number,
  ): void {
    const m = anim.playerMotion;
    const { pos, scale } = m ? motionAt(m, clock) : { pos: s.player.pos, scale: 1 };
    const [cx, cy] = centerOf(g, pos);
    const theme = this.theme;

    // EXPOSED: a blood ring on the tile plus a strike through the rune. This is
    // the proofreader's delete mark, and it is also literally what happened.
    if (s.player.exposed) {
      const pulse = 0.5 + 0.5 * Math.sin(wall / 170);
      ctx.save();
      ctx.globalAlpha = 0.3 + pulse * 0.35;
      ctx.strokeStyle = theme.blood;
      ctx.lineWidth = g.cell * 0.045;
      ctx.beginPath();
      ctx.arc(cx, cy, g.cell * (0.42 + pulse * 0.03), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    drawGlyph(ctx, HERO, cx, cy, {
      color: theme.ink,
      size: g.cell * 0.58 * scale,
      seed: 101,
      boil,
      rotation: FACING_ROTATION[s.player.facing] ?? 0,
    });

    if (s.player.exposed) {
      inkStroke(
        ctx,
        [
          [cx - g.cell * 0.34, cy],
          [cx + g.cell * 0.34, cy],
        ] as Pt[],
        {
          color: theme.blood,
          width: g.cell * 0.055,
          seed: 2222,
          amp: g.cell * 0.012,
          alpha: 0.95,
          boil,
        },
      );
      // The dots beneath — "stet: let it stand".
      ctx.save();
      ctx.fillStyle = theme.blood;
      ctx.globalAlpha = 0.9;
      for (let i = -1; i <= 1; i++) {
        blobPath(ctx, cx + i * g.cell * 0.15, cy + g.cell * 0.3, g.cell * 0.022, 3300 + i, 0.3, 8, boil);
        ctx.fill();
      }
      ctx.restore();
    }

    // Combo tally — scratched marks beside the rune.
    if (s.player.combo > 0) {
      for (let i = 0; i < s.player.combo; i++) {
        const bx = cx + g.cell * 0.3 + i * g.cell * 0.07;
        inkStroke(
          ctx,
          [
            [bx, cy - g.cell * 0.34],
            [bx + g.cell * 0.03, cy - g.cell * 0.18],
          ] as Pt[],
          {
            color: theme.blood,
            width: g.cell * 0.028,
            seed: 4400 + i * 31,
            amp: g.cell * 0.006,
            alpha: 0.85,
            boil,
            passes: 1,
          },
        );
      }
    }
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
