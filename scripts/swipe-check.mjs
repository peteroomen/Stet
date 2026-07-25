/**
 * How many turns does ONE swipe actually spend?
 *
 *   node scripts/swipe-check.mjs
 *
 * The bot harness cannot see this. Every bot in `src/game/bots.ts` submits
 * exactly one direction per turn, so an input layer that spends two or three
 * turns on a single thumb flick is invisible to every table `scripts/model.ts`
 * prints — the rules would look perfectly fair while the game ate your health.
 *
 * So this drives the REAL page with synthetic pointer events at realistic
 * speeds, and counts turns spent (`state.turn`) against gestures made. A flick
 * must cost exactly one turn. A deliberate held drag must still chain, because
 * that is the thing that makes the game feel good in a thumb — the two have to
 * be told apart, and distance alone cannot do it.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
};
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
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

/**
 * One gesture, described the way a thumb actually makes it: a total travel and a
 * duration, delivered as N discrete pointermove events. `steps` stands in for
 * the pointer's report rate — a 120 Hz phone delivers many small moves, a busy
 * frame delivers few large ones, and the input layer has to survive both.
 */
async function gesture(page, { travel, ms, steps }) {
  await page.evaluate(() => {
    window.__swipes = 0;
    const rt = window.__stet;
    if (!rt.__wrapped) {
      const orig = rt.input.bind(rt);
      rt.input = (d) => {
        window.__swipes++;
        orig(d);
      };
      rt.__wrapped = true;
    }
  });

  /*
   * Dispatched inside the page, not through page.mouse.
   *
   * Playwright's mouse.move is a round trip to the browser and costs ~180 ms per
   * call, so a gesture asked to last 120 ms actually spanned 1080 ms of wall
   * time — and the input layer is gated on wall time. Measured that way a flick
   * looked like a slow drag and the harness was reporting the driver's latency
   * rather than the game's behaviour.
   *
   * setTimeout between events rather than a busy-wait, so the page keeps
   * animating and `turns` stays meaningful; a blocked main thread cannot run the
   * rAF loop and would make every gesture look like one turn.
   */
  return page.evaluate(
    async ({ travel, ms, steps }) => {
      const el = document.querySelector('.stage');
      const r = el.getBoundingClientRect();
      const x = r.x + r.width / 2;
      const y = r.y + r.height / 2;
      const rt = window.__stet;
      const before = rt.state.turn;

      const send = (type, cx) =>
        el.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 1,
            isPrimary: true,
            pointerType: 'touch',
            bubbles: true,
            cancelable: true,
            clientX: cx,
            clientY: y,
          }),
        );

      const t0 = performance.now();
      send('pointerdown', x);
      for (let i = 1; i <= steps; i++) {
        const due = t0 + (ms * i) / steps;
        const wait = due - performance.now();
        if (wait > 0) await new Promise((res) => setTimeout(res, wait));
        send('pointermove', x + (travel * i) / steps);
      }
      const realMs = Math.round(performance.now() - t0);
      send('pointerup', x + travel);

      // Let any buffered input drain — a turn queued mid-gesture still costs you.
      await new Promise((res) => setTimeout(res, 600));
      return { turns: rt.state.turn - before, fired: window.__swipes, realMs };
    },
    { travel, ms, steps },
  );
}

const CASES = [
  { name: 'fast flick        ', travel: 110, ms: 110, steps: 8 },
  { name: 'fast flick, coarse', travel: 110, ms: 110, steps: 3 },
  { name: 'normal swipe      ', travel: 130, ms: 220, steps: 10 },
  { name: 'long lazy swipe   ', travel: 200, ms: 420, steps: 14 },
  { name: 'deliberate drag   ', travel: 260, ms: 950, steps: 20 },
];

console.log('\n  gesture              travel   ms*  steps fired   turns spent');
console.log('  ' + '─'.repeat(60));

const results = [];
for (const c of CASES) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: false });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  // Into a run, on a fresh board, at a known depth.
  await page.evaluate(() => window.__stet.jumpTo(1));
  await page.waitForTimeout(400);
  // Clear the board and stand at the LEFT edge, so a rightward gesture has four
  // legal steps ahead of it. Both details matter: swiping into the board edge
  // spends no turn (which made a two-step flick read as a clean single step),
  // and starting mid-board capped a held drag at 2 turns no matter how many
  // steps it asked for.
  await page.evaluate(() => {
    const rt = window.__stet;
    rt.state = {
      ...rt.state,
      enemies: [],
      blots: [],
      stairsOpen: false,
      player: { ...rt.state.player, pos: { x: 0, y: 2 }, hp: 99, maxHp: 99 },
    };
  });

  const { turns, fired, realMs } = await gesture(page, c);
  results.push({ ...c, turns, fired, realMs });
  console.log(
    `  ${c.name}   ${String(c.travel).padStart(4)}  ${String(realMs).padStart(4)}   ` +
      `${String(fired).padStart(11)}   ${String(turns).padStart(11)}` +
      (errors.length ? `   ERRORS: ${errors.join(' | ')}` : ''),
  );
  await page.close();
}

console.log('');
const flicks = results.filter((r) => r.realMs <= 260);
const worst = Math.max(...flicks.map((r) => r.turns));
const drag = results[results.length - 1];
console.log(`  worst turns spent on a single flick : ${worst}   (want 1)`);
console.log(`  turns from a deliberate held drag   : ${drag.turns}   (want > 1 — chaining)`);

console.log('');

await browser.close();
server.close();
process.exit(worst > 1 ? 1 : 0);
