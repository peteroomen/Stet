/**
 * Shoot each panel of the style lab as its own image, so treatments can be
 * compared at full size rather than as thumbnails in a contact sheet.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const DIR = new URL('./', import.meta.url).pathname;
const OUT = new URL('../shots/styles/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  // The browser always asks; a mockup has none, and the resulting console 404
  // is indistinguishable from a real one at the console-message level.
  if (url === '/favicon.ico') return void res.writeHead(204).end();
  const path = join(DIR, normalize(url === '/' ? '/style-lab.html' : url));
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('nope');
  }
});
await new Promise((r) => server.listen(0, r));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage({ viewport: { width: 1180, height: 1400 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(`http://127.0.0.1:${server.address().port}/style-lab.html`, {
  waitUntil: 'networkidle',
});
await page.waitForFunction(() => window.__labReady === true, { timeout: 15000 });
await page.waitForTimeout(300);

for (const fig of await page.$$('figure')) {
  const id = await fig.$eval('canvas', (c) => c.dataset.style);
  await fig.screenshot({ path: join(OUT, `${id}.png`) });
  console.log(`  → ${id}.png`);
}

await browser.close();
server.close();

if (errors.length) {
  console.error('\nERRORS:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log('\nno errors');
