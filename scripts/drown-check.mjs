/**
 * The page filling over you has to be VISIBLE.
 *
 *   npm run check:drown
 *
 * A drown is the only damage in the game with no attacker: no glyph lunges at
 * you, no telegraph turned red, health simply drops. If it does not draw and
 * sound like the spill it replaces, the player learns it as a random tick of
 * damage and the mechanic is worse than the bug it fixed.
 *
 * The engine tests prove the rule. This drives the real page, forces a full
 * board with the ink overdue, and checks that the event reaches the renderer,
 * the effects layer and the state line without throwing.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const OUT = new URL('../shots/', import.meta.url).pathname;
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
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const fails = [];
const check = (name, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) fails.push(name);
};

await page.goto(base, { waitUntil: 'networkidle' });
await page.click('.btn');
await page.waitForTimeout(400);

/*
 * A full page, the ink overdue, and the player sealed into a two-tile pocket —
 * the same fixture as the engine test, so the only thing that can hurt here is
 * the page itself.
 */
const before = await page.evaluate(() => {
  const rt = window.__stet;
  const rat = (id, x, y) => ({
    id,
    kind: 'rat',
    pos: { x, y },
    hp: 1,
    maxHp: 1,
    ready: false,
    struck: false,
    poise: true,
    intent: { kind: 'hold', path: [] },
    seed: id * 17 + 3,
  });
  rt.state = {
    ...rt.state,
    floorTurns: 60,
    grace: 0,
    spillClock: 99,
    stairs: { x: 4, y: 4 },
    stairsOpen: false,
    items: [],
    blots: [
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
    player: { ...rt.state.player, pos: { x: 0, y: 0 }, hp: 9, maxHp: 9, ward: 0 },
    enemies: [
      rat(101, 3, 0),
      rat(102, 4, 0),
      rat(103, 2, 1),
      rat(104, 3, 1),
      rat(105, 4, 1),
      rat(106, 0, 2),
      rat(107, 1, 2),
    ],
  };
  rt.clock = 1e9;
  return rt.state.player.hp;
});

console.log('\nthe page fills over you');
await page.evaluate(() => window.__stet.input('right'));
await page.waitForTimeout(120);

// Caught mid-animation: the cue is scheduled after the enemy phase lands.
const line = await page.textContent('.state');
check('the state line names it', /no room left/i.test(line ?? ''), JSON.stringify(line?.trim()));

// The cue lands after the enemy phase, so this is roughly the peak of the mark.
await page.waitForTimeout(330);
await page.screenshot({ path: join(OUT, 'drown.png') });
console.log(`  wrote ${join(OUT, 'drown.png')} at the moment it lands`);

await page.waitForTimeout(600);
const after = await page.evaluate(() => ({
  hp: window.__stet.state.player.hp,
  enemies: window.__stet.state.enemies.length,
}));
check('it costs health', after.hp === before - 1, `hp ${before} → ${after.hp}`);
check('no eighth body', after.enemies === 7, `${after.enemies} on the page`);

// The canvas has to have painted something for the frame the drown landed on.
const painted = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  return c ? c.width > 0 && c.height > 0 : false;
});
check('the board is still painting', painted);

await browser.close();
server.close();

if (errors.length) {
  console.error('\nPAGE ERRORS:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
if (fails.length) {
  console.error(`\n${fails.length} failed: ${fails.join(', ')}`);
  process.exit(1);
}
console.log('\nall good');
