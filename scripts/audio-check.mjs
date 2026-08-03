/**
 * Fire every sound in a real browser and fail on any error.
 *
 * This cannot tell you whether the palette sounds good — only a person can do
 * that. What it does prove is that every node graph builds, every envelope has
 * legal parameters (an exponentialRamp to 0 throws, a negative time throws), and
 * that nothing in the audio layer breaks a turn.
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
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(base, { waitUntil: 'networkidle' });
await page.click('.btn');
await page.waitForTimeout(400);

const report = await page.evaluate(async () => {
  const rt = window.__stet;
  if (!rt) return { fatal: 'no runtime on window.__stet' };

  // Reach the sfx singleton through the runtime's own module graph.
  rt.unlockAudio();
  const mod = await import('/assets/' + [...document.querySelectorAll('script[type=module]')]
    .map((s) => s.src.split('/assets/')[1])
    .filter(Boolean)[0]);
  void mod;

  const results = [];
  // Drive the real event path rather than poking the synth directly, so this
  // covers the wiring in runtime.fire() as well as the synth itself.
  const events = [
    { t: 'move', phase: 'p', from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, dir: 'right' },
    { t: 'blocked', phase: 'p', pos: { x: 0, y: 0 }, dir: 'left' },
    { t: 'wait', phase: 'p', pos: { x: 1, y: 1 } },
    { t: 'bump', phase: 'p', from: { x: 1, y: 1 }, to: { x: 2, y: 1 }, dir: 'right', dmg: 1, combo: 0, killed: false, kind: 'rat', id: 1, broke: true },
    { t: 'bump', phase: 'p', from: { x: 1, y: 1 }, to: { x: 2, y: 1 }, dir: 'right', dmg: 4, combo: 3, killed: true, kind: 'warden', id: 2, broke: true },
    // Shrugged: lands, does not stop it. A different sound, not a quieter one —
    // and `broke` must be present, or every bump silently takes this path.
    { t: 'bump', phase: 'p', from: { x: 1, y: 1 }, to: { x: 2, y: 1 }, dir: 'right', dmg: 1, combo: 0, killed: false, kind: 'warden', id: 3, broke: false },
    { t: 'kill', phase: 'p', pos: { x: 2, y: 1 }, kind: 'warden' },
    { t: 'emove', phase: 'e', id: 3, kind: 'charger', from: { x: 4, y: 2 }, to: { x: 2, y: 2 } },
    { t: 'wind', phase: 'e', id: 3, kind: 'charger', pos: { x: 4, y: 2 } },
    { t: 'eattack', phase: 'e', id: 3, kind: 'rat', from: { x: 1, y: 1 }, at: { x: 2, y: 1 }, dmg: 1, exposed: false, hpAfter: 5 },
    { t: 'eattack', phase: 'e', id: 4, kind: 'warden', from: { x: 1, y: 1 }, at: { x: 2, y: 1 }, dmg: 6, exposed: true, hpAfter: 1 },
    { t: 'pickup', phase: 'p', pos: { x: 3, y: 3 }, kind: 'vial', amount: 3 },
    { t: 'pickup', phase: 'p', pos: { x: 3, y: 3 }, kind: 'nib', amount: 1 },
    { t: 'spill', phase: 'e', pos: { x: 0, y: 4 }, kind: 'rat' },
    { t: 'unseal', phase: 'e', pos: { x: 4, y: 4 } },
    { t: 'descend', phase: 'p', depth: 3 },
    { t: 'death', phase: 'e', depth: 3 },
  ];

  for (const ev of events) {
    try {
      // fire() is private by convention only; this is a test harness.
      rt['fire'](ev);
      results.push({ ev: ev.t + (ev.exposed ? ':exposed' : ev.killed ? ':kill' : ''), ok: true });
    } catch (e) {
      results.push({ ev: ev.t, ok: false, err: String(e) });
    }
    await new Promise((r) => setTimeout(r, 60));
  }

  // Mute round-trip and the persistent drone.
  try {
    rt.toggleMute();
    rt.toggleMute();
    results.push({ ev: 'mute round-trip', ok: true });
  } catch (e) {
    results.push({ ev: 'mute', ok: false, err: String(e) });
  }

  return { results };
});

await browser.close();
server.close();

if (report.fatal) {
  console.error('FATAL:', report.fatal);
  process.exit(1);
}
for (const r of report.results) {
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.ev}${r.err ? '  ' + r.err : ''}`);
}
const failed = report.results.filter((r) => !r.ok);
if (failed.length || errors.length) {
  for (const e of errors) console.error('  page error: ' + e);
  process.exit(1);
}
console.log(`\n${report.results.length} sound events fired, no errors`);
