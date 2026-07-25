/**
 * Brush parameter lab.
 *
 *   node scripts/brush-shots.mjs   →  shots/brush-lab.png
 *
 * Every actor glyph, drawn with the real `brushStroke`, across a grid of width /
 * pressure / dryness settings, with the nib version on top as a reference for
 * what the silhouette is SUPPOSED to look like. Picking these by eye on a live
 * board does not work: the marks are small, half of them are moving, and the
 * failure mode (a silhouette that has stopped reading as itself) is exactly the
 * thing a busy screen hides.
 *
 * This is how the shipped values were chosen — 1.85 / no pressure / 0.85 dryness
 * fragmented every glyph, and the row comparison is what made that obvious.
 */
import { ENEMY_GLYPHS, HERO } from '../src/render/glyphs';
import type { GlyphDef } from '../src/render/glyphs';
import { brushStroke, inkStroke, type Pt } from '../src/render/ink';

const DEFS: [string, GlyphDef][] = [
  ['hero', HERO],
  ['rat', ENEMY_GLYPHS.rat],
  ['stalker', ENEMY_GLYPHS.stalker],
  ['charger', ENEMY_GLYPHS.charger],
  ['warden', ENEMY_GLYPHS.warden],
];

// label, widthMultiplier, pressure, dryness  (0 width = nib reference)
const SETTINGS: [string, number, number, number][] = [
  ['nib (reference)', 0, 0, 0],
  ['before 1.85 p0 d0.85', 1.85, 0, 0.85],
  ['1.70 p0.18 d0.45', 1.7, 0.18, 0.45],
  ['1.55 p0.26 d0.35', 1.55, 0.26, 0.35],
  ['1.42 p0.30 d0.30', 1.42, 0.3, 0.3],
  ['1.42 p0.18 d0.50', 1.42, 0.18, 0.5],
  ['1.30 p0.34 d0.25', 1.3, 0.34, 0.25],
];

const out = document.getElementById('out')!;
const S = 104;
for (const [label, wm, pr, dry] of SETTINGS) {
  const row = document.createElement('div');
  row.className = 'row';
  const lab = document.createElement('div');
  lab.className = 'lab';
  lab.textContent = label;
  row.appendChild(lab);
  for (const [, def] of DEFS) {
    const c = document.createElement('canvas');
    c.width = S * 2;
    c.height = S * 2;
    c.style.width = `${S}px`;
    c.style.height = `${S}px`;
    const g = c.getContext('2d')!;
    g.scale(2, 2);
    g.translate(S / 2, S / 2);
    const size = S * 0.68;
    const half = size / 2;
    const map = (p: Pt): Pt => [p[0] * half, p[1] * half];
    const base = size * 0.075 * (def.weight ?? 1);
    if (wm === 0) {
      def.paths.forEach((path, i) =>
        inkStroke(g, path.map(map), { color: '#12100c', width: base, seed: 41 + i * 313 }),
      );
    } else {
      const paths = def.brushPaths ?? def.paths;
      paths.forEach((path, i) =>
        brushStroke(g, path.map(map), {
          color: '#12100c',
          width: base * wm * (def.brushWeight ?? 1),
          seed: 41 + i * 313,
          amp: size * 0.016,
          dryness: dry,
          pressure: pr,
        }),
      );
    }
    row.appendChild(c);
  }
  out.appendChild(row);
}
