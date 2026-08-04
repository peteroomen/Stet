/**
 * Taking a card must not throw the run away.
 *
 *   node scripts/cards-check.mjs
 *
 * This exists because it happened. The card overlay is rendered INSIDE the
 * element that owns the swipe gestures, so a tap aimed at a card was also a tap
 * on the board underneath it — and a tap on the board resolves to "confirm",
 * which on any screen that was not `playing` started a new run. Choosing an
 * upgrade dealt you a fresh run at depth 1.
 *
 * No unit test could have caught it: the engine was correct throughout, the bug
 * lived entirely in which handler saw a pointer event. So this drives the real
 * page and checks the only thing that matters — that the run you were playing is
 * still the run you are playing.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
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

const depth = () => page.evaluate(() => window.__stet.state.depth);
const screen = () => page.evaluate(() => window.__stet.state.screen);

/** Clear the floor and walk onto the stairs, landing on the card hand. */
async function descend() {
  await page.evaluate(() => {
    const rt = window.__stet;
    const st = rt.state.stairs;
    rt.state = {
      ...rt.state,
      enemies: [],
      stairsOpen: true,
      player: { ...rt.state.player, pos: { x: st.x, y: st.y > 0 ? st.y - 1 : st.y + 1 } },
    };
    rt.clock = 1e9;
    rt.input(st.y > 0 ? 'down' : 'up');
  });
  await page.waitForTimeout(500);
}

await page.goto(base, { waitUntil: 'networkidle' });
await page.click('.btn');
await page.waitForTimeout(400);

console.log('\ntaking a card');
await descend();
check('a descent offers a hand', (await screen()) === 'choosing');
const before = await depth();

await page.click('.card >> nth=0');
await page.waitForTimeout(400);
const after = await depth();
check('the run survives the tap', after === before, `depth ${before} → ${after}`);
check('play resumes', (await screen()) === 'playing');
// A real assertion: something was actually written in the margin, or a heal was
// spent. `>= 0` would pass on a click that did nothing at all.
const taken = await page.evaluate(() => window.__stet.state.traits.length);
check('a mark was written', taken === 1, `traits ${taken}`);

console.log('\ntapping the page while the hand is up');
await descend();
check('a hand is up again', (await screen()) === 'choosing');
const d2 = await depth();
// A tap on the board itself, missing every card — this is the exact gesture
// that used to restart the run.
await page.mouse.click(195, 120);
await page.waitForTimeout(400);
check('a stray tap changes nothing', (await depth()) === d2, `depth ${d2} → ${await depth()}`);
check('the hand is still up', (await screen()) === 'choosing');

console.log('\npressing space while the hand is up');
await page.keyboard.press(' ');
await page.waitForTimeout(400);
check('space changes nothing', (await depth()) === d2, `depth ${d2} → ${await depth()}`);
check('the hand is still up', (await screen()) === 'choosing');

console.log('\nkeyboard takes a card');
await page.keyboard.press('1');
await page.waitForTimeout(400);
check('play resumes', (await screen()) === 'playing');
check('the run survives', (await depth()) === d2, `depth ${d2} → ${await depth()}`);

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
