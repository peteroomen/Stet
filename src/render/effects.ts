import { blobPath, clamp01, easeOutCubic, hash3, inkSplat } from './ink';

/**
 * Splatter, floating numbers, screenshake and hitstop.
 *
 * The one non-obvious piece is the stain layer: a droplet that finishes its
 * flight is STAMPED into a persistent offscreen canvas rather than deleted, so
 * a floor accumulates a record of the fight you had on it. It wipes on descent —
 * a fresh page.
 */

export interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  maxLife: number;
  color: string;
  seed: number;
  /** Whether this drop leaves a mark when it lands. */
  stains: boolean;
}

export interface FloatText {
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  text: string;
  color: string;
  size: number;
  weight: number;
}

export interface Ring {
  x: number;
  y: number;
  r0: number;
  r1: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
  seed: number;
}

export class Effects {
  drops: Drop[] = [];
  texts: FloatText[] = [];
  rings: Ring[] = [];

  /** Screenshake, in board pixels, decaying exponentially. */
  shake = 0;
  shakeSeed = 0;
  /** Frozen milliseconds still owed. Impact reads as weight when time stops. */
  freeze = 0;
  /** 0..1 white/blood full-screen flash. */
  flash = 0;
  flashColor = '#000';

  private stain: HTMLCanvasElement | null = null;
  private stainCtx: CanvasRenderingContext2D | null = null;

  ensureStainLayer(w: number, h: number): void {
    if (this.stain && this.stain.width === w && this.stain.height === h) return;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    this.stain = c;
    this.stainCtx = c.getContext('2d');
  }

  clearStains(): void {
    if (this.stain && this.stainCtx) {
      this.stainCtx.clearRect(0, 0, this.stain.width, this.stain.height);
    }
  }

  get stainCanvas(): HTMLCanvasElement | null {
    return this.stain;
  }

  addShake(amount: number): void {
    // Take the strongest shake rather than summing, so a big hit during a small
    // one doesn't get watered down and a flurry doesn't stack into nausea.
    this.shake = Math.max(this.shake, amount);
    this.shakeSeed = (this.shakeSeed + 1) | 0;
  }

  addFreeze(ms: number): void {
    this.freeze = Math.max(this.freeze, ms);
  }

  addFlash(strength: number, color: string): void {
    this.flash = Math.max(this.flash, strength);
    this.flashColor = color;
  }

  /** A burst of ink thrown from an impact, biased along `angle`. */
  splatter(
    x: number,
    y: number,
    angle: number,
    power: number,
    color: string,
    scale: number,
    stains = true,
  ): void {
    const n = Math.round(6 + power * 7);
    for (let i = 0; i < n; i++) {
      const spread = 1.5;
      const a = angle + (Math.random() - 0.5) * spread;
      const speed = (0.06 + Math.random() * 0.26) * power * scale;
      this.drops.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        r: scale * (0.012 + Math.random() * 0.035) * (0.6 + power * 0.5),
        life: 0,
        maxLife: 260 + Math.random() * 320,
        color,
        seed: (Math.random() * 1e6) | 0,
        stains,
      });
    }
  }

  /** A shape coming apart — used when something dies. */
  shatter(x: number, y: number, color: string, scale: number): void {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + Math.random() * 0.4;
      const speed = (0.1 + Math.random() * 0.3) * scale;
      this.drops.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        r: scale * (0.014 + Math.random() * 0.03),
        life: 0,
        maxLife: 340 + Math.random() * 380,
        color,
        seed: (Math.random() * 1e6) | 0,
        stains: true,
      });
    }
  }

  text(x: number, y: number, text: string, color: string, size: number, weight = 1): void {
    this.texts.push({ x, y, vy: -0.035 * size, life: 0, maxLife: 780, text, color, size, weight });
  }

  ring(x: number, y: number, r0: number, r1: number, color: string, width: number, ms = 420): void {
    this.rings.push({
      x,
      y,
      r0,
      r1,
      life: 0,
      maxLife: ms,
      color,
      width,
      seed: (Math.random() * 1e6) | 0,
    });
  }

  /** Advance everything. `dt` is real elapsed ms; freeze is handled by the caller. */
  update(dt: number): void {
    const drag = Math.pow(0.9955, dt);
    for (const d of this.drops) {
      d.life += dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vx *= drag;
      d.vy *= drag;
    }
    const landed = this.drops.filter((d) => d.life >= d.maxLife);
    for (const d of landed) if (d.stains) this.stampStain(d);
    this.drops = this.drops.filter((d) => d.life < d.maxLife);

    for (const t of this.texts) {
      t.life += dt;
      t.y += t.vy * dt;
      t.vy *= Math.pow(0.994, dt);
    }
    this.texts = this.texts.filter((t) => t.life < t.maxLife);

    for (const r of this.rings) r.life += dt;
    this.rings = this.rings.filter((r) => r.life < r.maxLife);

    this.shake *= Math.pow(0.986, dt);
    if (this.shake < 0.05) this.shake = 0;
    this.flash *= Math.pow(0.988, dt);
    if (this.flash < 0.004) this.flash = 0;
  }

  private stampStain(d: Drop): void {
    const ctx = this.stainCtx;
    if (!ctx) return;
    // Dried ink is darker and duller than the wet droplet that made it.
    inkSplat(ctx, d.x, d.y, d.r * 0.92, d.color, d.seed, 0.3, Math.atan2(d.vy, d.vx), 1.6);
  }

  /** Current shake offset. Two hashed axes so it doesn't read as a single wobble. */
  shakeOffset(clock: number): [number, number] {
    if (this.shake <= 0) return [0, 0];
    const f = Math.floor(clock / 16);
    return [
      (hash3(this.shakeSeed, f, 1) - 0.5) * 2 * this.shake,
      (hash3(this.shakeSeed, f, 2) - 0.5) * 2 * this.shake,
    ];
  }

  drawDrops(ctx: CanvasRenderingContext2D): void {
    for (const d of this.drops) {
      const t = clamp01(d.life / d.maxLife);
      const a = 1 - easeOutCubic(t) * 0.35;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = d.color;
      blobPath(ctx, d.x, d.y, d.r * (1 - t * 0.25), d.seed, 0.5, 9);
      ctx.fill();
      ctx.restore();
    }
  }

  drawRings(ctx: CanvasRenderingContext2D): void {
    for (const r of this.rings) {
      const t = clamp01(r.life / r.maxLife);
      const e = easeOutCubic(t);
      const radius = r.r0 + (r.r1 - r.r0) * e;
      ctx.save();
      ctx.globalAlpha = (1 - e) * 0.85;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - e * 0.6);
      ctx.beginPath();
      // Slightly irregular so it reads as a splash of ink, not a UI ping.
      const pts = 20;
      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * Math.PI * 2;
        const rr = radius * (0.93 + hash3(r.seed, i % pts, 0) * 0.14);
        const x = r.x + Math.cos(a) * rr;
        const y = r.y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  drawTexts(ctx: CanvasRenderingContext2D): void {
    for (const t of this.texts) {
      const p = clamp01(t.life / t.maxLife);
      const pop = p < 0.12 ? 1 + (1 - p / 0.12) * 0.5 : 1;
      ctx.save();
      ctx.globalAlpha = p > 0.6 ? 1 - (p - 0.6) / 0.4 : 1;
      ctx.fillStyle = t.color;
      ctx.font = `${t.weight > 1 ? '700 ' : '600 '}${Math.round(t.size * pop)}px "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    }
  }

  reset(): void {
    this.drops = [];
    this.texts = [];
    this.rings = [];
    this.shake = 0;
    this.freeze = 0;
    this.flash = 0;
    this.clearStains();
  }
}
