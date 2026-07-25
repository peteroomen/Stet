/**
 * Drive the built game in a real browser and capture the states worth looking
 * at. This is the visual check for the feel work — screenshots of the title, a
 * clean board, a board mid-fight, and the death screen.
 *
 * Usage: node scripts/shots.mjs [outDir]
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { mkdirSync } from 'node:fs';

const DIST = new URL('../dist/', import.meta.url).pathname;
const OUT = process.argv[2] ?? new URL('../shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
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
const base = `http://127.0.0.1:${server.address().port}`;

// Use the browser already on the machine rather than downloading one that
// matches this Playwright build.
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const errors = [];

async function shot(page, name) {
  await page.waitForTimeout(420);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`  → ${name}.png`);
}

/** Reach into the running game and set up an exact board to photograph. */
async function scripted(page, fn) {
  return page.evaluate(fn);
}

for (const [label, size] of [
  ['phone', { width: 390, height: 844 }],
  ['desktop', { width: 900, height: 900 }],
]) {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(`[${label}] ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${label}] ${m.text()}`));

  await page.goto(base, { waitUntil: 'networkidle' });
  console.log(`\n${label} ${size.width}x${size.height}`);
  await shot(page, `${label}-01-title`);

  // Begin a run.
  await page.click('.btn');
  await page.waitForTimeout(500);
  await shot(page, `${label}-02-floor-1`);

  // Walk into things so the board has a fight on it.
  for (const key of ['ArrowRight', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(300);
  }
  await shot(page, `${label}-03-mid-fight`);

  // Force the interesting states rather than hoping to stumble into them.
  await scripted(page, () => {
    const rt = window.__stet;
    if (!rt) return;
    rt.state.player.exposed = true;
    rt.state.player.combo = 3;
    rt.state.player.hp = 2;
  });
  await page.waitForTimeout(260);
  await shot(page, `${label}-04-exposed-low-hp`);

  if (label === 'desktop') {
    // Night theme.
    await page.click('.chrome .iconbtn:last-child');
    await page.waitForTimeout(420);
    await shot(page, `${label}-05-night`);
    await page.click('.chrome .iconbtn:last-child');

    // A deep floor, so chargers and wardens are on the page.
    await scripted(page, () => {
      const rt = window.__stet;
      if (!rt) return;
      rt.jumpTo(9);
    });
    await page.waitForTimeout(600);
    await shot(page, `${label}-06-depth-9`);

    // Death screen.
    await scripted(page, () => {
      const rt = window.__stet;
      if (!rt) return;
      rt.kill();
    });
    await page.waitForTimeout(900);
    await shot(page, `${label}-07-death`);
  }

  await page.close();
}

await browser.close();
server.close();

if (errors.length) {
  console.error('\nPAGE ERRORS:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log('\nno page errors');
