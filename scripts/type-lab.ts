/**
 * The era's hand, judged against the one it replaces.
 *
 *   node scripts/type-shots.mjs   →  shots/type-lab.png
 *
 * Every actor, drawn in all three hands, on each era's own paper. Picking a
 * mark-making system by eye on a live board does not work — the marks are small,
 * half of them are moving, and the failure mode (a silhouette that has stopped
 * reading as itself) is exactly what a busy screen hides. This is the same
 * reason `brush-lab` exists, and the same method.
 *
 * The whole claim of the era system is that a RAT is a RAT in any hand: the
 * SILHOUETTES carry across and only the instrument changes. So the test is not
 * "does the typed mark look like a typewriter" on its own — it is whether the
 * row still reads left to right as the same five creatures.
 */
import { ENEMY_GLYPHS, HERO, drawGlyph, type GlyphDef, type Mark } from '../src/render/glyphs';
import { ERAS } from '../src/game/eras';
import { themeFor, type Theme } from '../src/render/theme';

const DEFS: [string, GlyphDef][] = [
  ['hero', HERO],
  ['rat', ENEMY_GLYPHS.rat],
  ['stalker', ENEMY_GLYPHS.stalker],
  ['charger', ENEMY_GLYPHS.charger],
  ['warden', ENEMY_GLYPHS.warden],
  ['typebar', ENEMY_GLYPHS.typebar],
  ['drollery', ENEMY_GLYPHS.drollery],
];

const out = document.getElementById('out')!;
const S = 96;

function strip(label: string, theme: Theme, mark: Mark, heroColour: boolean) {
  const row = document.createElement('div');
  row.className = 'row';
  const tag = document.createElement('div');
  tag.className = 'lab';
  tag.textContent = label;
  row.appendChild(tag);

  for (const [name, def] of DEFS) {
    const c = document.createElement('canvas');
    c.width = c.height = S * 2;
    c.style.width = c.style.height = `${S}px`;
    const ctx = c.getContext('2d')!;
    ctx.scale(2, 2);
    ctx.fillStyle = theme.paper;
    ctx.fillRect(0, 0, S, S);
    ctx.translate(S / 2, S / 2);
    drawGlyph(ctx, def, 0, 0, {
      color: name === 'hero' && heroColour ? theme.hero : theme.ink,
      size: S * 0.62,
      // Distinct per glyph AND per row, so the misregistration is not identical
      // down a column — a machine out of adjustment is out of adjustment
      // differently every strike.
      seed: name.charCodeAt(0) * 131 + mark.charCodeAt(0) * 7717,
      mark,
      uncached: true,
    });
    row.appendChild(c);
  }
  out.appendChild(row);
}

const head = document.createElement('div');
head.className = 'row head';
head.innerHTML = `<div class="lab"></div>${DEFS.map(([n]) => `<div class="cap">${n}</div>`).join('')}`;
out.appendChild(head);

for (const era of ERAS) {
  for (const lighting of ['day', 'night'] as const) {
    const theme = themeFor(lighting, era.palette);
    const banner = document.createElement('div');
    banner.className = 'era';
    banner.textContent = `${era.name} · ${lighting} · hand: ${era.hand}`;
    out.appendChild(banner);
    // The era's own hand first, then the others on the same paper as controls:
    // if the typed mark only looks right because the page changed, that shows up
    // here and nowhere else.
    const hands: Mark[] = [era.hand, ...(['brush', 'nib', 'type'] as Mark[]).filter((m) => m !== era.hand)];
    for (const m of hands) strip(m === era.hand ? `${m}  ← shipped` : m, theme, m, true);
  }
}
