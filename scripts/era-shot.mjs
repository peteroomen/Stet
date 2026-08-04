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

/*
 * Page one names the manuscript, so the run opens on the brushed title — and it
 * has to be shot and then dismissed, or it would still be standing over the
 * first board in the loop below.
 */
await page.waitForTimeout(760);
await page.screenshot({ path: join(OUT, 'era-opening1-written.png') });
console.log('wrote shots/era-opening1-written.png');
await page.click('.overlay--era');
await page.waitForTimeout(300);

for (const [name, depth] of [['manuscript', 3], ['typewriter', 6], ['boss', 8], ['wordprocessor', 10], ['boss3', 12], ['opening', 5], ['opening3', 9]]) {
  await page.evaluate((d) => {
    const rt = window.__stet;
    const mk = (id, kind, x, y, ready) => ({ id, kind, pos: { x, y }, hp: 3, maxHp: 5, ready, struck: false, poise: true, intent: { kind: 'hold', path: [] }, seed: id * 17 + 3 });
    const boss = d === 8 || d === 12;
    if (d === 5 || d === 9) {
      /*
       * A REAL descent from the last floor of era I into the first of era II.
       * Faking the cue left the board showing the previous fixture, which is
       * exactly the sort of thing a screenshot is for catching.
       */
      const st = rt.state.stairs;
      const above = st.y > 0;
      rt.state = {
        ...rt.state,
        depth: d - 1,
        screen: 'playing',
        enemies: [],
        stairsOpen: true,
        player: { ...rt.state.player, pos: { x: st.x, y: above ? st.y - 1 : st.y + 1 } },
      };
      rt.clock = 1e9;
      rt.input(above ? 'down' : 'up');
      return;
    }
    rt.state = { ...rt.state, depth: d, blots: boss ? [] : [{ x: 1, y: 3 }], stairsOpen: false,
      // A build in the margin, so the shot shows the page as it is actually read.
      traits: ['whetstone', 'vellum', 'long-nib'],
      // Well into the fight, so the band has widened and the bell has rung twice.
      floorTurns: boss ? 10 : 0, floorWaits: 0,
      items: boss ? [] : [{ id: 900, kind: 'gesso', pos: { x: 4, y: 0 }, seed: 5 }],
      player: { ...rt.state.player, pos: { x: 2, y: 2 }, hp: 5, maxHp: 7, ward: 1 },
      enemies: boss
        ? [mk(200, d === 12 ? 'selectAll' : 'carriageReturn', 4, 1, true)]
        : d >= 9
          ? [mk(101, 'warden', 3, 1, true), mk(102, 'stalker', 0, 1, true), mk(105, 'selection', 0, 4, true), mk(106, 'autocomplete', 1, 0, true), mk(107, 'cursor', 4, 3, true)]
          : [mk(101, 'warden', 3, 1, true), mk(102, 'stalker', 0, 1, true), mk(103, 'carriage', 0, 4, true), mk(104, 'typebar', 1, 0, true)] };
    rt.clock = 1e9;
    rt.input(boss ? 'left' : 'wait');
    // Era III's SELECTION needs a second beat to open its mark out into the
    // block, and the block is the whole point of the picture.
    if (!boss && d >= 9) {
      rt.clock = 1e9;
      rt.input('wait');
    }
  }, depth);
  const opening = name.startsWith('opening');
  await page.waitForTimeout(opening ? 260 : 1100);
  await page.screenshot({ path: join(OUT, `era-${name}.png`) });
  console.log(`wrote shots/era-${name}.png`);

  /*
   * The title card twice: caught mid-write, and finished.
   *
   * The whole claim of that screen is that the name is WRITTEN rather than set,
   * and a single frame of it cannot show that. One shot at 260ms shows the hand
   * partway along; one at 1.6s shows what it settles into, before the card
   * stands down of its own accord.
   */
  if (opening) {
    await page.waitForTimeout(620);
    await page.screenshot({ path: join(OUT, `era-${name}-written.png`) });
    console.log(`wrote shots/era-${name}-written.png`);
  }
}
await browser.close();
server.close();
