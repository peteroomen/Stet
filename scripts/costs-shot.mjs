/** Surrounded, everything ready. The exact board the tally marks exist for. */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
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
  } catch { res.writeHead(404).end('nope'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
await page.goto(base, { waitUntil: 'networkidle' });
await page.click('.btn');
await page.waitForTimeout(400);
await page.evaluate(() => {
  const rt = window.__stet;
  // HOLD intents so the turn we spend to force a recompute changes nothing;
  // the replan that follows is what aims them at you and computes the costs.
  const mk = (id, kind, x, y) => ({ id, kind, pos: { x, y }, hp: 2, maxHp: 2, ready: true, struck: false, poise: true, intent: { kind: 'hold', path: [] }, seed: id * 17 + 3 });
  rt.state = { ...rt.state, depth: 9, blots: [], items: [], stairsOpen: false,
    player: { ...rt.state.player, pos: { x: 2, y: 2 }, hp: 9, maxHp: 9 },
    enemies: [mk(101, 'rat', 1, 2), mk(102, 'warden', 3, 2), mk(103, 'rat', 2, 1), mk(104, 'charger', 2, 3)] };
  rt.clock = 1e9;
  rt.input('wait');
});
await page.waitForTimeout(900);
await page.screenshot({ path: join(OUT, 'costs-heavy.png') });

// And the ordinary case: two rats, one of them committed.
await page.evaluate(() => {
  const rt = window.__stet;
  const mk = (id, kind, x, y) => ({ id, kind, pos: { x, y }, hp: 1, maxHp: 1, ready: true, struck: false, poise: true, intent: { kind: 'hold', path: [] }, seed: id * 17 + 3 });
  rt.state = { ...rt.state, depth: 3, blots: [], items: [], stairsOpen: false,
    player: { ...rt.state.player, pos: { x: 2, y: 2 }, hp: 7, maxHp: 7, dmg: 1 },
    enemies: [mk(201, 'rat', 1, 2), mk(202, 'stalker', 3, 3)] };
  rt.clock = 1e9;
  rt.input('wait');
});
await page.waitForTimeout(900);
await page.screenshot({ path: join(OUT, 'costs-light.png') });
console.log('wrote shots/costs-heavy.png and shots/costs-light.png');
await browser.close();
server.close();
