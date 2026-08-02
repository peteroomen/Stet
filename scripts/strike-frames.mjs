/**
 * Photograph a single stroke, frame by frame.
 *
 * The feel work cannot be checked from a live board — the whole stroke is over
 * in a sixth of a second and the thing being verified is what the page looks
 * like DURING it. So this stops the runtime's own loop and drives
 * `renderer.draw()` at exact clock offsets, which is the only way to actually
 * look at the moment the hero has left its tile.
 *
 * What to look for: at every offset there must be a visible mark on the tile the
 * hero actually occupies. That is the whole point of the anchor.
 *
 * Usage: node scripts/strike-frames.mjs [outDir]
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { mkdirSync } from 'node:fs';

const DIST = new URL('../dist/', import.meta.url).pathname;
const OUT = process.argv[2] ?? new URL('../shots/strike/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = createServer(async (req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  const path = join(DIST, normalize(url === '/' ? '/index.html' : url));
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('nope');
  }
});

await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const errors = [];
const page = await browser.newPage({ viewport: { width: 500, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(base, { waitUntil: 'networkidle' });
await page.click('.btn');
await page.waitForTimeout(500);

/**
 * Stand the hero next to exactly one foe and swing at it, then hand back the
 * timeline so frames can be requested at precise offsets.
 */
async function setUp(kind, hp) {
  return page.evaluate(
    ({ kind, hp }) => {
      const rt = window.__stet;
      rt.stop();
      const s = rt.state;
      s.player.pos = { x: 2, y: 2 };
      s.player.hp = s.player.maxHp;
      s.player.exposed = false;
      s.player.combo = 0;
      s.blots = [];
      s.items = [];
      // One foe, directly above, and nothing else to muddy the picture.
      s.enemies = [
        {
          id: 900,
          kind,
          pos: { x: 2, y: 1 },
          hp,
          maxHp: hp,
          ready: false,
          struck: false,
          poise: true,
          intent: { kind: 'hold', path: [] },
          seed: 4242,
        },
      ];
      // input() buffers the direction when the previous turn is still playing,
      // and with the loop stopped the clock never advances past it — so the
      // second stroke would silently never resolve. Age the clock out first.
      rt.clock = 1e9;
      rt.input('up');
      rt.stop(); // input() does not restart the loop, but be certain
      // The STROKE's duration, not the turn's — `anim.total` covers the enemy
      // phase too, so a stagger in the reply makes every turn look the same
      // length whatever the blow was worth.
      return { stroke: rt.anim.playerMotion?.t1 ?? 0, weight: rt.anim.playerMotion?.weight ?? 0 };
    },
    { kind, hp },
  );
}

/** Render one exact instant of the stroke. */
async function frameAt(name, t) {
  await page.evaluate((t) => {
    const rt = window.__stet;
    rt.renderer.draw(rt.state, rt.anim, t, 1000);
  }, t);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`  → ${name}.png  (t=${t}ms)`);
}

// A light tap and a heavy blow, so the contrast between them is visible side by
// side rather than asserted.
for (const [label, kind, hp] of [
  ['light', 'rat', 9],
  ['heavy', 'warden', 9],
]) {
  if (label === 'heavy') {
    // Load the combo ladder so this stroke actually carries weight.
    await page.evaluate(() => {
      const rt = window.__stet;
      rt.state.player.dmg = 4;
    });
  }
  const { stroke, weight } = await setUp(kind, hp);
  console.log(`\n${label} stroke — ${Math.round(stroke)}ms, weight ${weight.toFixed(2)}`);
  for (const t of [0, 12, 25, 45, 70, 110, 170, 260]) {
    if (t > stroke) break;
    await frameAt(`${label}-t${String(t).padStart(3, '0')}`, t);
  }
}

// A plain step, for contrast. Here the engine has ALREADY moved you, so the
// anchor sits on the destination and the body settles into it — brightest at the
// moment the body is furthest away. Worth photographing rather than assuming:
// an anchor that reads as a second hero would be worse than no anchor at all.
await page.evaluate(() => {
  const rt = window.__stet;
  const s = rt.state;
  s.player.pos = { x: 2, y: 3 };
  s.player.exposed = false;
  s.player.combo = 0;
  s.enemies = [];
  rt.clock = 1e9;
  rt.input('up');
  rt.stop();
});
console.log('\nstep');
for (const t of [0, 20, 45, 85]) {
  await frameAt(`step-t${String(t).padStart(3, '0')}`, t);
}

// A settled board with a foe in reach. The adjacency tell is gated behind the
// same settle timer as the telegraphs, so it is invisible in every mid-stroke
// frame above and has to be photographed on its own.
await page.evaluate(() => {
  const rt = window.__stet;
  const s = rt.state;
  s.player.pos = { x: 2, y: 2 };
  s.player.exposed = false;
  s.player.combo = 0;
  s.enemies = [
    { id: 901, kind: 'rat', pos: { x: 3, y: 2 }, hp: 1, maxHp: 1, ready: false, struck: false, poise: true, intent: { kind: 'hold', path: [] }, seed: 11 },
    // Two tiles off: must NOT get a tell, or the mark stops meaning "in reach".
    { id: 902, kind: 'stalker', pos: { x: 0, y: 2 }, hp: 2, maxHp: 2, ready: false, struck: false, poise: true, intent: { kind: 'hold', path: [] }, seed: 22 },
  ];
  rt.stop();
});
console.log('\nreach');
await frameAt('reach-settled', 4000);

await browser.close();
server.close();

if (errors.length) {
  console.error('\nPAGE ERRORS:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log('\nno page errors');
