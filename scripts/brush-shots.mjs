/**
 * Boot a dev server, shoot the brush lab, shut down. See scripts/brush-lab.ts.
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const OUT = new URL('../shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const PORT = 5199;
const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  cwd: new URL('../', import.meta.url).pathname,
  stdio: 'ignore',
});
process.on('exit', () => vite.kill());

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage({ viewport: { width: 820, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

// The dev server takes a moment; retry rather than guessing a sleep length.
let ok = false;
for (let i = 0; i < 40 && !ok; i++) {
  try {
    await page.goto(`http://127.0.0.1:${PORT}/scripts/brush-lab.html`, { waitUntil: 'networkidle' });
    ok = true;
  } catch {
    await page.waitForTimeout(250);
  }
}
if (!ok) throw new Error('dev server never came up');

await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}brush-lab.png`, fullPage: true });
console.log(errors.length ? `errors: ${errors.join(' | ')}` : '  → shots/brush-lab.png');
await browser.close();
vite.kill();
