/**
 * Verify a deployed STET is actually playable, not merely built.
 *
 * A green build says the bundle compiled. It says nothing about whether the
 * canvas paints, the swipe surface responds, or the engine advances — so this
 * loads the real URL, plays a few turns, and fails on any console error.
 *
 * Usage: node scripts/live-check.mjs https://stet-psi.vercel.app
 */
import { chromium } from 'playwright-core';

const url = process.argv[2];
if (!url) {
  console.error('usage: node scripts/live-check.mjs <url>');
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 2 });

const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));

const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
console.log(`HTTP ${res.status()}  ${url}`);

const title = await page.title();
console.log(`title: ${title}`);

// The title screen must be there before anything else is meaningful.
await page.waitForSelector('.mark', { timeout: 15000 });
console.log('title screen: ok');

await page.click('.btn');
await page.waitForTimeout(600);

const started = await page.evaluate(() => {
  const rt = window.__stet;
  return rt ? { depth: rt.state.depth, foes: rt.state.enemies.length, hp: rt.state.player.hp } : null;
});
console.log(`floor 1: depth ${started?.depth} · ${started?.foes} foes · ${started?.hp} hp`);

// Play real turns and confirm the engine actually advances.
for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']) {
  await page.keyboard.press(key);
  await page.waitForTimeout(320);
}

const after = await page.evaluate(() => {
  const rt = window.__stet;
  return { turn: rt.state.turn, hp: rt.state.player.hp, kills: rt.state.stats.kills };
});
console.log(`after 6 inputs: turn ${after.turn} · ${after.kills} felled · ${after.hp} hp`);

// The canvas must have actually painted — a blank board is a silent failure a
// build check can never catch.
const painted = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  if (!c) return { ok: false, why: 'no canvas' };
  const ctx = c.getContext('2d');
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  const seen = new Set();
  for (let i = 0; i < data.length; i += 4 * 997) {
    seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
  }
  return { ok: seen.size > 5, colours: seen.size, w: c.width, h: c.height };
});
console.log(`canvas: ${painted.w}x${painted.h}, ${painted.colours} distinct colours sampled`);

// Drive a floor past its grace so the spill actually fires end to end — the
// path that was silently dropped before, and the one a build check cannot see.
const spilled = await page.evaluate(async () => {
  const rt = window.__stet;
  const keys = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
  const before = rt.state.enemies.length;
  let fired = false;
  for (let i = 0; i < 60 && rt.state.screen === 'playing' && !fired; i++) {
    const dir = ['up', 'right', 'down', 'left'][i % 4];
    rt.input(dir);
    await new Promise((r) => setTimeout(r, 60));
    fired = rt.anim.cues.some((c) => c.ev.t === 'spill');
  }
  void keys;
  void before;
  return fired;
});

await page.screenshot({ path: '/tmp/live-stet.png' });
await browser.close();

if (!painted.ok) {
  console.error('\nFAIL: canvas did not paint');
  process.exit(1);
}
if (after.turn < 3) {
  console.error('\nFAIL: engine did not advance');
  process.exit(1);
}
if (errors.length) {
  console.error('\nFAIL: page errors');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
if (!spilled) {
  console.error('\nFAIL: the spill never scheduled a cue — the page never filled');
  process.exit(1);
}
console.log('spill: fires and schedules');
console.log('\nlive and playable, no errors');
