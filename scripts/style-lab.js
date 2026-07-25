/**
 * Five treatments of one board.
 *
 * Standalone on purpose — it copies the glyph paths and the ink primitives
 * rather than importing the game, so a style can be pushed hard without
 * destabilising the thing that ships. Whatever wins gets folded back into
 * src/render.
 */

/* ---------------------------------------------------------------- helpers -- */

function hash3(a, b, c) {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 2246822519)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function wobble(pts, seed, amp) {
  if (pts.length < 2) return pts;
  const out = [];
  let n = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    for (let j = 0; j < 3; j++, n++) {
      const t = j / 3;
      out.push([
        x0 + (x1 - x0) * t + (hash3(seed, n, 0) - 0.5) * amp * 2,
        y0 + (y1 - y0) * t + (hash3(seed + 8191, n, 0) - 0.5) * amp * 2,
      ]);
    }
  }
  const l = pts[pts.length - 1];
  out.push([
    l[0] + (hash3(seed, 4093, 0) - 0.5) * amp * 2,
    l[1] + (hash3(seed + 8191, 4093, 0) - 0.5) * amp * 2,
  ]);
  return out;
}

function stroke(ctx, pts, o) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = o.color;
  if (o.dash) ctx.setLineDash(o.dash);
  const passes = o.passes ?? 2;
  for (let k = 0; k < passes; k++) {
    ctx.globalAlpha = (o.alpha ?? 1) * (k === 0 ? 1 : 0.38);
    ctx.lineWidth = o.width * (k === 0 ? 1 : 0.62);
    const w = wobble(pts, o.seed + k * 977, o.amp ?? 1);
    ctx.beginPath();
    ctx.moveTo(w[0][0], w[0][1]);
    for (let i = 1; i < w.length; i++) ctx.lineTo(w[i][0], w[i][1]);
    if (o.closed) ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

/** A stroke whose width swells in the middle and tapers at both ends. */
function brushStroke(ctx, pts, o) {
  if (pts.length < 2) return;
  const w = wobble(pts, o.seed, o.amp ?? 1);
  const n = w.length;
  const left = [];
  const right = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // Loaded at the start, drying to a point — plus a little belly.
    const taper = Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.55;
    const half = (o.width / 2) * (0.25 + 0.95 * taper);
    const p = w[Math.max(0, i - 1)];
    const q = w[Math.min(n - 1, i + 1)];
    const a = Math.atan2(q[1] - p[1], q[0] - p[0]) + Math.PI / 2;
    left.push([w[i][0] + Math.cos(a) * half, w[i][1] + Math.sin(a) * half]);
    right.push([w[i][0] - Math.cos(a) * half, w[i][1] - Math.sin(a) * half]);
  }
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.fillStyle = o.color;
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (const p of left) ctx.lineTo(p[0], p[1]);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.fill();
  // Dry-brush: scrub a few voids out of the body.
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 14; i++) {
    const t = hash3(o.seed, i, 7);
    const idx = Math.floor(t * (n - 1));
    const p = w[idx];
    ctx.globalAlpha = 0.25 + hash3(o.seed, i, 9) * 0.4;
    ctx.beginPath();
    ctx.ellipse(
      p[0] + (hash3(o.seed, i, 11) - 0.5) * o.width,
      p[1] + (hash3(o.seed, i, 13) - 0.5) * o.width,
      o.width * (0.05 + hash3(o.seed, i, 15) * 0.16),
      o.width * 0.05,
      hash3(o.seed, i, 17) * Math.PI,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

function blobPath(ctx, cx, cy, r, seed, irr = 0.34, points = 13) {
  ctx.beginPath();
  const pts = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const rr = r * (1 - irr / 2 + hash3(seed, i, 0) * irr);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  ctx.moveTo((pts[0][0] + pts[points - 1][0]) / 2, (pts[0][1] + pts[points - 1][1]) / 2);
  for (let i = 0; i < points; i++) {
    const c = pts[i];
    const nx = pts[(i + 1) % points];
    ctx.quadraticCurveTo(c[0], c[1], (c[0] + nx[0]) / 2, (c[1] + nx[1]) / 2);
  }
  ctx.closePath();
}

/* ----------------------------------------------------------------- glyphs -- */

const HERO = {
  paths: [
    [[0, -0.9], [0.82, 0.62], [0, 0.3], [-0.82, 0.62], [0, -0.9]],
    [[0, -0.32], [0, 0.28]],
  ],
  weight: 1.18,
};
const GLYPHS = {
  rat: {
    paths: [
      [[-0.72, 0.34], [-0.34, -0.32], [0.04, 0.3], [0.42, -0.34]],
      [[0.42, -0.34], [0.78, 0.06]],
    ],
    dots: [[-0.58, 0.02, 0.09]],
    weight: 0.86,
  },
  stalker: {
    paths: [
      [[0, -0.86], [0.72, 0], [0, 0.86], [-0.72, 0], [0, -0.86]],
      [[-0.3, -0.3], [0.3, 0.3]],
      [[0.3, -0.3], [-0.3, 0.3]],
    ],
    weight: 1,
  },
  charger: {
    paths: [
      [[-0.78, -0.66], [0.02, 0], [-0.78, 0.66]],
      [[0.1, -0.66], [0.9, 0], [0.1, 0.66]],
    ],
    weight: 1.1,
  },
  warden: {
    paths: [
      [[-0.66, -0.46], [0.66, -0.46], [0.66, 0.76], [-0.66, 0.76], [-0.66, -0.46]],
      [[-0.66, -0.46], [-0.94, -0.92]],
      [[0.66, -0.46], [0.94, -0.92]],
      [[-0.4, -0.12], [0.4, -0.12]],
      [[-0.4, 0.2], [0.4, 0.2]],
      [[-0.4, 0.5], [0.4, 0.5]],
    ],
    weight: 1.34,
  },
};
const NIB = {
  paths: [
    [[0, -0.88], [0.54, 0.1], [0, 0.86], [-0.54, 0.1], [0, -0.88]],
    [[0, -0.16], [0, 0.56]],
  ],
  dots: [[0, -0.3, 0.13]],
  weight: 1,
};
const STAIRS = {
  paths: [
    [[-0.8, -0.56], [0.8, -0.56]],
    [[-0.54, -0.12], [0.54, -0.12]],
    [[-0.28, 0.32], [0.28, 0.32]],
    [[-0.36, 0.5], [0, 0.88], [0.36, 0.5]],
  ],
  weight: 1.05,
};

function drawGlyph(ctx, def, cx, cy, o) {
  const half = o.size / 2;
  const w = o.size * 0.075 * (def.weight ?? 1) * (o.widthScale ?? 1);
  ctx.save();
  ctx.translate(cx, cy);
  if (o.rotation) ctx.rotate(o.rotation);
  const map = (p) => [p[0] * half, p[1] * half];
  def.paths.forEach((path, i) => {
    const opts = {
      color: o.color,
      width: w,
      seed: o.seed + i * 313,
      amp: o.size * 0.014,
      alpha: o.alpha ?? 1,
      passes: o.passes ?? 2,
      dash: o.dash,
    };
    if (o.brush) brushStroke(ctx, path.map(map), { ...opts, width: w * 1.9 });
    else stroke(ctx, path.map(map), opts);
  });
  for (const [dx, dy, r] of def.dots ?? []) {
    ctx.save();
    ctx.globalAlpha = o.alpha ?? 1;
    ctx.fillStyle = o.color;
    blobPath(ctx, dx * half, dy * half, r * half, o.seed + 77, 0.3, 9);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/* ------------------------------------------------------------- the board --- */

// One fixed scenario, so the five panels are honestly comparable.
const BOARD = {
  player: { x: 1, y: 2, facing: 'right' },
  enemies: [
    { kind: 'stalker', x: 3, y: 1, seed: 11, intent: [[2, 1]], threat: false, hp: 2, maxHp: 2 },
    { kind: 'charger', x: 4, y: 3, seed: 23, wind: true, hp: 3, maxHp: 3 },
    { kind: 'rat', x: 2, y: 4, seed: 31, intent: [[1, 4], [1, 3]], threat: true, hp: 1, maxHp: 1 },
    { kind: 'warden', x: 0, y: 0, seed: 47, intent: [[0, 1]], threat: false, hp: 4, maxHp: 5, braced: true },
  ],
  blots: [{ x: 3, y: 3 }],
  items: [{ kind: 'nib', x: 4, y: 0, seed: 5 }],
  stairs: { x: 0, y: 4 },
};

const SIZE = 5;
const ROT = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };

function geom(size) {
  const pad = size * 0.075;
  return { pad, cell: (size - pad * 2) / SIZE };
}
const centre = (g, v) => [g.pad + g.cell * (v.x + 0.5), g.pad + g.cell * (v.y + 0.5)];

/* ------------------------------------------------------------ treatments --- */

function paperWash(ctx, W, H, t, seed) {
  ctx.fillStyle = t.paper;
  ctx.fillRect(0, 0, W, H);
  const vg = ctx.createRadialGradient(W / 2, H / 2, W * 0.28, W / 2, H / 2, W * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, t.paperDeep);
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = t.grain;
  for (let i = 0; i < 6; i++) {
    blobPath(
      ctx,
      hash3(seed, i * 3, 0) * W,
      hash3(seed, i * 3 + 1, 0) * H,
      (0.05 + hash3(seed, i * 3 + 2, 0) * 0.12) * W,
      seed + i * 91,
      0.6,
      11,
    );
    ctx.fill();
  }
  ctx.restore();
  // Grain.
  const gc = document.createElement('canvas');
  gc.width = gc.height = 96;
  const gx = gc.getContext('2d');
  const img = gx.createImageData(96, 96);
  const rgb = [
    parseInt(t.grain.slice(1, 3), 16),
    parseInt(t.grain.slice(3, 5), 16),
    parseInt(t.grain.slice(5, 7), 16),
  ];
  for (let i = 0; i < 96 * 96; i++) {
    const n = Math.random();
    img.data[i * 4] = rgb[0];
    img.data[i * 4 + 1] = rgb[1];
    img.data[i * 4 + 2] = rgb[2];
    img.data[i * 4 + 3] = n < 0.55 ? 0 : Math.floor(n * 26);
  }
  gx.putImageData(img, 0, 0);
  const pat = ctx.createPattern(gc, 'repeat');
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function ruledGrid(ctx, g, t, seed, o = {}) {
  const x0 = g.pad;
  const y0 = g.pad;
  const x1 = g.pad + g.cell * SIZE;
  const y1 = g.pad + g.cell * SIZE;
  for (let i = 1; i < SIZE; i++) {
    const x = x0 + g.cell * i;
    const y = y0 + g.cell * i;
    stroke(ctx, [[x, y0], [x, y1]], {
      color: o.rule ?? t.rule,
      width: Math.max(1, g.cell * 0.016),
      seed: seed + i * 17,
      amp: g.cell * 0.012,
      alpha: 0.85,
      passes: 1,
    });
    stroke(ctx, [[x0, y], [x1, y]], {
      color: o.rule ?? t.rule,
      width: Math.max(1, g.cell * 0.016),
      seed: seed + i * 41 + 500,
      amp: g.cell * 0.012,
      alpha: 0.85,
      passes: 1,
    });
  }
  const frame = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  stroke(ctx, frame, {
    color: t.ink,
    width: Math.max(1.6, g.cell * 0.038),
    seed: seed + 3001,
    amp: g.cell * 0.018,
    alpha: 0.9,
    closed: true,
  });
  const off = g.cell * 0.075;
  stroke(
    ctx,
    [
      [x0 - off, y0 - off],
      [x1 + off, y0 - off],
      [x1 + off, y1 + off],
      [x0 - off, y1 + off],
      [x0 - off, y0 - off],
    ],
    {
      color: t.ink,
      width: Math.max(1, g.cell * 0.016),
      seed: seed + 4001,
      amp: g.cell * 0.02,
      alpha: 0.5,
      passes: 1,
      closed: true,
    },
  );
}

/** Telegraphs, actors and props — shared skeleton, per-style overrides via `s`. */
function actors(ctx, g, t, s = {}) {
  // Blots
  for (const b of BOARD.blots) {
    const [cx, cy] = centre(g, b);
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = t.ink;
    if (s.bleed) {
      ctx.shadowColor = t.ink;
      ctx.shadowBlur = g.cell * 0.28;
    }
    blobPath(ctx, cx, cy, g.cell * 0.36, b.x * 131 + b.y * 977 + 17, 0.42);
    ctx.fill();
    ctx.restore();
  }

  // Sealed stairs
  {
    const [cx, cy] = centre(g, BOARD.stairs);
    drawGlyph(ctx, STAIRS, cx, cy, {
      color: t.inkSoft,
      size: g.cell * 0.62,
      seed: 5501,
      alpha: 0.42,
      passes: 1,
    });
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = t.blood;
    blobPath(ctx, cx, cy, g.cell * 0.19, 6601, 0.36, 11);
    ctx.fill();
    ctx.restore();
  }

  // Item
  for (const it of BOARD.items) {
    const [cx, cy] = centre(g, it);
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = t.gold;
    ctx.beginPath();
    ctx.arc(cx, cy, g.cell * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawGlyph(ctx, NIB, cx, cy, {
      color: t.gold,
      size: g.cell * 0.46,
      seed: it.seed,
      brush: s.brush,
    });
  }

  // Telegraphs
  for (const e of BOARD.enemies) {
    const [ex, ey] = centre(g, e);
    if (e.wind) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = t.blood;
      ctx.lineWidth = g.cell * 0.035;
      ctx.setLineDash([g.cell * 0.09, g.cell * 0.07]);
      ctx.beginPath();
      ctx.arc(ex, ey, g.cell * 0.38, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      continue;
    }
    if (!e.intent) continue;
    const color = e.threat ? t.blood : t.ghost;
    const alpha = e.threat ? 0.75 : 0.4;
    const pts = [[ex, ey]];
    for (const p of e.intent) pts.push(centre(g, { x: p[0], y: p[1] }));
    stroke(ctx, pts, {
      color,
      width: g.cell * (e.threat ? 0.045 : 0.032) * (e.braced ? 1.35 : 1),
      seed: e.seed + 909,
      amp: g.cell * 0.012,
      alpha: e.braced ? Math.min(1, alpha * 1.4) : alpha,
      passes: e.braced ? 2 : 1,
      ...(e.braced ? {} : { dash: [g.cell * 0.1, g.cell * 0.09] }),
    });
    const last = e.intent[e.intent.length - 1];
    const [dx, dy] = centre(g, { x: last[0], y: last[1] });
    drawGlyph(ctx, GLYPHS[e.kind], dx, dy, {
      color,
      size: g.cell * 0.5,
      seed: e.seed,
      alpha: alpha * 0.6,
      passes: 1,
      widthScale: 0.8,
    });
    const ang = Math.atan2(dy - ey, dx - ex);
    const head = g.cell * 0.13;
    const back = g.cell * 0.3;
    const hx = dx - Math.cos(ang) * back;
    const hy = dy - Math.sin(ang) * back;
    stroke(
      ctx,
      [
        [hx - Math.cos(ang - 0.6) * head, hy - Math.sin(ang - 0.6) * head],
        [hx, hy],
        [hx - Math.cos(ang + 0.6) * head, hy - Math.sin(ang + 0.6) * head],
      ],
      { color, width: g.cell * 0.04, seed: e.seed + 77, amp: g.cell * 0.008, alpha, passes: 1 },
    );
  }

  // Enemies
  for (const e of BOARD.enemies) {
    const [cx, cy] = centre(g, e);
    ctx.save();
    if (s.bleed) {
      ctx.shadowColor = t.ink;
      ctx.shadowBlur = g.cell * 0.16;
    }
    drawGlyph(ctx, GLYPHS[e.kind], cx, cy, {
      color: t.ink,
      size: g.cell * 0.56 * (e.wind ? 1.06 : 1),
      seed: e.seed,
      brush: s.brush,
    });
    ctx.restore();
    if (e.braced) {
      const w = g.cell * 0.22;
      const y = cy - g.cell * 0.42;
      stroke(
        ctx,
        [[cx - w, y + g.cell * 0.05], [cx - w, y], [cx + w, y], [cx + w, y + g.cell * 0.05]],
        { color: t.inkSoft, width: g.cell * 0.03, seed: e.seed + 1717, amp: g.cell * 0.006, alpha: 0.75, passes: 1 },
      );
    }
    if (e.maxHp > 1) {
      const r = g.cell * 0.028;
      const gap = r * 3.1;
      const total = (e.maxHp - 1) * gap;
      for (let i = 0; i < e.maxHp; i++) {
        ctx.save();
        ctx.globalAlpha = i < e.hp ? 0.85 : 0.22;
        ctx.fillStyle = t.ink;
        blobPath(ctx, cx - total / 2 + i * gap, cy + g.cell * 0.47, r, e.seed + i * 53, 0.35, 8);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // Hero, exposed
  {
    const [cx, cy] = centre(g, BOARD.player);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = t.blood;
    ctx.lineWidth = g.cell * 0.045;
    ctx.beginPath();
    ctx.arc(cx, cy, g.cell * 0.43, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    if (s.bleed) {
      ctx.shadowColor = t.ink;
      ctx.shadowBlur = g.cell * 0.2;
    }
    drawGlyph(ctx, HERO, cx, cy, {
      color: t.ink,
      size: g.cell * 0.58,
      seed: 101,
      rotation: ROT[BOARD.player.facing],
      brush: s.brush,
    });
    ctx.restore();
    stroke(ctx, [[cx - g.cell * 0.34, cy], [cx + g.cell * 0.34, cy]], {
      color: t.blood,
      width: g.cell * 0.055,
      seed: 2222,
      amp: g.cell * 0.012,
      alpha: 0.95,
    });
    ctx.save();
    ctx.fillStyle = t.blood;
    ctx.globalAlpha = 0.9;
    for (let i = -1; i <= 1; i++) {
      blobPath(ctx, cx + i * g.cell * 0.15, cy + g.cell * 0.3, g.cell * 0.022, 3300 + i, 0.3, 8);
      ctx.fill();
    }
    ctx.restore();
  }
}

const BASE = {
  paper: '#F3ECDE',
  paperDeep: '#DFD3B8',
  grain: '#7d6b49',
  rule: '#C6B896',
  ink: '#1A1714',
  inkSoft: '#5E5348',
  blood: '#8C2F1E',
  gold: '#A87B2C',
  ghost: '#7E7362',
};

const STYLES = [
  {
    id: 'current',
    name: 'Current',
    note: 'what ships today — pen, ruled paper',
    draw(ctx, W, H, g) {
      paperWash(ctx, W, H, BASE, 13);
      ruledGrid(ctx, g, BASE, 13);
      actors(ctx, g, BASE);
    },
  },

  {
    id: 'illuminated',
    name: 'Illuminated',
    note: 'gold leaf, rubrication, a decorated border, marginalia',
    draw(ctx, W, H, g) {
      const t = { ...BASE, paper: '#F6F0E0', rule: '#CDBE9C', gold: '#B08322' };
      paperWash(ctx, W, H, t, 91);

      // Illuminated border: a gold band with a repeating vine, drawn OUTSIDE the
      // play area so it decorates without competing with the board.
      const m = g.pad * 0.42;
      const x0 = m;
      const y0 = m;
      const x1 = W - m;
      const y1 = H - m;
      ctx.save();
      ctx.strokeStyle = t.gold;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = g.cell * 0.05;
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = g.cell * 0.02;
      ctx.strokeRect(x0 + 5, y0 + 5, x1 - x0 - 10, y1 - y0 - 10);
      ctx.restore();

      // Vine leaves along the band.
      const per = 26;
      for (let i = 0; i < per; i++) {
        const t01 = i / per;
        const edges = [
          [x0 + (x1 - x0) * t01, y0],
          [x1, y0 + (y1 - y0) * t01],
          [x1 - (x1 - x0) * t01, y1],
          [x0, y1 - (y1 - y0) * t01],
        ];
        for (let e = 0; e < 4; e++) {
          const [px, py] = edges[e];
          const inward = [[0, 1], [-1, 0], [0, -1], [1, 0]][e];
          const r = g.cell * (0.045 + hash3(i, e, 3) * 0.04);
          ctx.save();
          ctx.globalAlpha = 0.5 + hash3(i, e, 5) * 0.4;
          ctx.fillStyle = i % 3 === 0 ? t.blood : t.gold;
          blobPath(ctx, px + inward[0] * r * 1.5, py + inward[1] * r * 1.5, r, i * 31 + e, 0.5, 9);
          ctx.fill();
          ctx.restore();
        }
      }

      ruledGrid(ctx, g, t, 91);

      // Gilded tile behind the treasure — leaf laid on the page.
      for (const it of BOARD.items) {
        const [cx, cy] = centre(g, it);
        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, g.cell * 0.52);
        grd.addColorStop(0, 'rgba(214,168,72,0.55)');
        grd.addColorStop(1, 'rgba(214,168,72,0)');
        ctx.save();
        ctx.fillStyle = grd;
        ctx.fillRect(cx - g.cell * 0.6, cy - g.cell * 0.6, g.cell * 1.2, g.cell * 1.2);
        ctx.restore();
      }

      actors(ctx, g, t);

      // Rubricated depth numeral in the margin, the way a scribe would.
      ctx.save();
      ctx.fillStyle = t.blood;
      ctx.globalAlpha = 0.9;
      ctx.font = `700 ${Math.round(g.pad * 0.72)}px "Iowan Old Style", Palatino, Georgia, serif`;
      ctx.fillText('IX', g.pad * 0.62, g.pad * 0.92);
      ctx.restore();
    },
  },

  {
    id: 'bleed',
    name: 'Wet bleed',
    note: 'ink sinking into the fibres — everything feathers and pools',
    draw(ctx, W, H, g) {
      const t = { ...BASE, paper: '#EFE7D4', paperDeep: '#D6C9AC' };
      paperWash(ctx, W, H, t, 41);
      ruledGrid(ctx, g, t, 41);

      // Capillary halo under every mark: a soft, spreading second pass.
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.filter = 'blur(6px)';
      actors(ctx, g, { ...t, ghost: t.inkSoft });
      ctx.restore();

      actors(ctx, g, t, { bleed: true });

      // Pooled stains where ink has sat and dried at the edges.
      for (let i = 0; i < 7; i++) {
        const cx = g.pad + hash3(i, 1, 2) * g.cell * SIZE;
        const cy = g.pad + hash3(i, 2, 3) * g.cell * SIZE;
        ctx.save();
        ctx.globalAlpha = 0.1;
        ctx.fillStyle = t.ink;
        ctx.filter = 'blur(3px)';
        blobPath(ctx, cx, cy, g.cell * (0.08 + hash3(i, 3, 4) * 0.14), i * 77, 0.7, 13);
        ctx.fill();
        ctx.filter = 'none';
        ctx.globalAlpha = 0.16;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = t.ink;
        ctx.stroke();
        ctx.restore();
      }
    },
  },

  {
    id: 'brush',
    name: 'Sumi-e brush',
    note: 'a loaded brush instead of a nib — tapered, dry-scrubbed, gestural',
    draw(ctx, W, H, g) {
      const t = { ...BASE, paper: '#F1EADA', rule: '#D3C7A9', ink: '#141210' };
      paperWash(ctx, W, H, t, 7);

      // The grid as four dry sweeps rather than ruled lines.
      const x0 = g.pad;
      const y0 = g.pad;
      const x1 = g.pad + g.cell * SIZE;
      const y1 = g.pad + g.cell * SIZE;
      for (let i = 1; i < SIZE; i++) {
        brushStroke(ctx, [[x0 + g.cell * i, y0], [x0 + g.cell * i, y1]], {
          color: t.rule,
          width: g.cell * 0.05,
          seed: 500 + i,
          amp: g.cell * 0.02,
          alpha: 0.75,
        });
        brushStroke(ctx, [[x0, y0 + g.cell * i], [x1, y0 + g.cell * i]], {
          color: t.rule,
          width: g.cell * 0.05,
          seed: 900 + i,
          amp: g.cell * 0.02,
          alpha: 0.75,
        });
      }
      // A single confident enclosing sweep per side.
      const sides = [
        [[x0, y0], [x1, y0]],
        [[x1, y0], [x1, y1]],
        [[x1, y1], [x0, y1]],
        [[x0, y1], [x0, y0]],
      ];
      sides.forEach((sd, i) =>
        brushStroke(ctx, sd, {
          color: t.ink,
          width: g.cell * 0.11,
          seed: 3000 + i * 71,
          amp: g.cell * 0.022,
          alpha: 0.92,
        }),
      );

      actors(ctx, g, t, { brush: true });
    },
  },

  {
    id: 'plate',
    name: 'Engraved plate',
    note: 'an anatomical figure — cross-hatched, ticked, labelled',
    draw(ctx, W, H, g) {
      const t = {
        ...BASE,
        paper: '#EDE6D6',
        paperDeep: '#CFC3A6',
        rule: '#B7A98A',
        ink: '#211D18',
        blood: '#7A2A1B',
      };
      paperWash(ctx, W, H, t, 3);

      // Hatched shading in each cell, engraver-style: fine parallel rules.
      ctx.save();
      ctx.globalAlpha = 0.07;
      ctx.strokeStyle = t.ink;
      ctx.lineWidth = 0.7;
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const density = 4 + Math.floor(hash3(x, y, 1) * 5);
          const cx = g.pad + g.cell * x;
          const cy = g.pad + g.cell * y;
          for (let i = 0; i < density; i++) {
            const off = (i / density) * g.cell;
            ctx.beginPath();
            ctx.moveTo(cx + off, cy);
            ctx.lineTo(cx, cy + off);
            ctx.stroke();
          }
        }
      }
      ctx.restore();

      ruledGrid(ctx, g, t, 3);

      // Measurement ticks down the left and along the top.
      ctx.save();
      ctx.strokeStyle = t.ink;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      for (let i = 0; i <= SIZE * 4; i++) {
        const p = g.pad + (g.cell * SIZE * i) / (SIZE * 4);
        const len = i % 4 === 0 ? g.pad * 0.36 : g.pad * 0.16;
        ctx.beginPath();
        ctx.moveTo(g.pad - len, p);
        ctx.lineTo(g.pad, p);
        ctx.moveTo(p, g.pad - len);
        ctx.lineTo(p, g.pad);
        ctx.stroke();
      }
      ctx.restore();

      actors(ctx, g, t);

      // Leader lines and plate labels — the specimen, annotated.
      const labels = [
        { at: BOARD.enemies[1], text: 'fig. II — coiled' },
        { at: BOARD.player, text: 'fig. I — exposed' },
      ];
      ctx.save();
      ctx.strokeStyle = t.ink;
      ctx.fillStyle = t.ink;
      ctx.globalAlpha = 0.62;
      ctx.lineWidth = 1;
      ctx.font = `italic 500 ${Math.round(g.cell * 0.15)}px "Iowan Old Style", Palatino, Georgia, serif`;
      for (const l of labels) {
        const [cx, cy] = centre(g, l.at);
        const ex = cx + g.cell * 0.55;
        const ey = cy - g.cell * 0.5;
        ctx.beginPath();
        ctx.moveTo(cx + g.cell * 0.2, cy - g.cell * 0.2);
        ctx.lineTo(ex, ey);
        ctx.lineTo(ex + g.cell * 0.28, ey);
        ctx.stroke();
        ctx.fillText(l.text, ex + g.cell * 0.06, ey - g.cell * 0.06);
      }
      ctx.restore();
    },
  },
];

/* --------------------------------------------------------------- mounting -- */

const S = 520;
const DPR = 2;
const grid = document.getElementById('grid');

for (const style of STYLES) {
  const fig = document.createElement('figure');
  const c = document.createElement('canvas');
  c.width = S * DPR;
  c.height = S * DPR;
  c.style.width = S + 'px';
  c.style.height = S + 'px';
  c.dataset.style = style.id;
  const ctx = c.getContext('2d');
  ctx.scale(DPR, DPR);
  style.draw(ctx, S, S, geom(S));

  const cap = document.createElement('figcaption');
  cap.innerHTML = `<b>${style.name}</b> · ${style.note}`;
  fig.append(c, cap);
  grid.append(fig);
}

window.__labReady = true;
