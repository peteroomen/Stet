/** The same board, drawn in each era's hand. */
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

for (const [name, depth] of [['manuscript', 3], ['typewriter', 6]]) {
  await page.evaluate((d) => {
    const rt = window.__stet;
    const mk = (id, kind, x, y, ready) => ({ id, kind, pos: { x, y }, hp: 3, maxHp: 5, ready, struck: false, poise: true, intent: { kind: 'hold', path: [] }, seed: id * 17 + 3 });
    rt.state = { ...rt.state, depth: d, blots: [{ x: 1, y: 3 }], stairsOpen: false,
      items: [{ id: 900, kind: 'gesso', pos: { x: 4, y: 0 }, seed: 5 }],
      player: { ...rt.state.player, pos: { x: 2, y: 2 }, hp: 5, maxHp: 7, ward: 1 },
      enemies: [mk(101, 'warden', 3, 1, true), mk(102, 'stalker', 0, 1, true), mk(103, 'charger', 4, 4, false), mk(104, 'typebar', 1, 0, true)] };
    rt.clock = 1e9;
    rt.input('wait');
  }, depth);
  await page.waitForTimeout(1100);
  await page.screenshot({ path: join(OUT, `era-${name}.png`) });
  console.log(`wrote shots/era-${name}.png`);
}
await browser.close();
server.close();
