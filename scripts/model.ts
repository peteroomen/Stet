/**
 * Rule-variant model.
 *
 *   npx vite-node scripts/model.ts            all variants
 *   npx vite-node scripts/model.ts flow rally just those
 *
 * Plays the same seeds under every rule variant in `src/game/rules.ts` with the
 * same set of bots, and prints the comparison. This is how a design direction
 * gets argued in this project: not "this would feel better" but "this moves a
 * reactive player from depth 4 to depth 9 and costs the skill ceiling 30%".
 *
 * The number to watch is `reacting` — a bot that sees the consequence of its own
 * move but plans nothing further. That is the honest model of a player reading
 * the board in real time on a phone, and its depth is roughly how far the game
 * actually feels playable. `thinking` (3 plies) is the ceiling. A good arcade
 * shift raises the floor a lot and the ceiling a little; a bad one flattens the
 * gap, which would mean skill stopped mattering.
 */

import { BOTS, playRun, summarise, type RunRecord } from '../src/game/bots';
import { VARIANTS, type Rules } from '../src/game/rules';

const SEEDS = 0;

function pad(s: string | number, n: number): string {
  return String(s).padStart(n);
}

interface VariantResult {
  rules: Rules;
  byBot: Map<string, { summary: ReturnType<typeof summarise>; runs: RunRecord[] }>;
}

function run(rules: Rules): VariantResult {
  const byBot = new Map<string, { summary: ReturnType<typeof summarise>; runs: RunRecord[] }>();
  for (const bot of BOTS) {
    const runs = Array.from({ length: bot.runs }, (_, i) => playRun(SEEDS + i, 4000, bot.brain, rules));
    byBot.set(bot.name, { summary: summarise(runs), runs });
  }
  return { rules, byBot };
}

/** Damage taken and inputs spent, per floor, averaged over every run that reached it. */
function perFloor(runs: RunRecord[], depth: number): { dmg: number; inputs: number; clean: number } | null {
  const recs = runs.flatMap((r) => r.floors.filter((f) => f.depth === depth));
  if (recs.length < 8) return null;
  return {
    dmg: recs.reduce((a, f) => a + f.damage, 0) / recs.length,
    inputs: recs.reduce((a, f) => a + f.inputs, 0) / recs.length,
    clean: recs.filter((f) => f.damage === 0).length / recs.length,
  };
}

/** Where does a reactive player's run actually end? */
function deathHistogram(runs: RunRecord[]): string {
  const buckets = [1, 2, 3, 4, 5, 6, 8, 10, 99];
  const counts = new Array(buckets.length).fill(0);
  for (const r of runs) {
    if (r.state.screen !== 'dead') continue;
    const i = buckets.findIndex((b) => r.state.depth <= b);
    counts[i >= 0 ? i : buckets.length - 1]++;
  }
  const total = runs.length || 1;
  const labels = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7-8', 'd9-10', 'd11+'];
  return labels
    .map((l, i) => `${l} ${pad(((counts[i] / total) * 100).toFixed(0) + '%', 4)}`)
    .join('  ');
}

const wanted = process.argv.slice(2);
const chosen = wanted.length ? VARIANTS.filter((v) => wanted.includes(v.id)) : VARIANTS;
if (chosen.length === 0) {
  console.error(`no variant matched. known: ${VARIANTS.map((v) => v.id).join(', ')}`);
  process.exit(1);
}

const results = chosen.map((v) => {
  const t0 = Date.now();
  const res = run(v);
  process.stderr.write(`  ${v.id} … ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
  return res;
});

const line = (n: number) => '─'.repeat(n);

console.log(`\n${line(78)}`);
console.log('MEDIAN DEPTH REACHED  (same seeds, same bots, one rule variant per row)');
console.log(line(78));
console.log(
  `${'variant'.padEnd(14)}${BOTS.map((b) => pad(b.name, 10)).join('')}${pad('ceiling', 10)}`,
);
for (const res of results) {
  const cells = BOTS.map((b) => pad(res.byBot.get(b.name)!.summary.median, 10)).join('');
  const floor = res.byBot.get('reacting')!.summary.median;
  const ceil = res.byBot.get('thinking')!.summary.median;
  const ratio = `${(ceil / Math.max(1, floor)).toFixed(1)}x`;
  console.log(`${res.rules.id.padEnd(14)}${cells}${pad(ratio, 10)}`);
}

console.log(`\n${line(78)}`);
console.log('MEAN DEPTH, and how runs end');
console.log(line(78));
for (const res of results) {
  const r = res.byBot.get('reacting')!;
  const h = res.byBot.get('human*')!;
  const t = res.byBot.get('thinking')!;
  console.log(
    `${res.rules.id.padEnd(14)} reacting mean ${pad(r.summary.mean.toFixed(1), 5)}  deepest ${pad(r.summary.max, 3)}` +
      `   human* mean ${pad(h.summary.mean.toFixed(1), 5)}` +
      `   thinking mean ${pad(t.summary.mean.toFixed(1), 5)}  deepest ${pad(t.summary.max, 3)}` +
      `   stalled ${pad(r.runs.filter((x) => x.timedOut).length, 3)}`,
  );
}

console.log(`\n${line(78)}`);
console.log('WHERE A REACTIVE PLAYER DIES  (% of runs ending on that floor)');
console.log(line(78));
for (const res of results) {
  console.log(`${res.rules.id.padEnd(14)}${deathHistogram(res.byBot.get('reacting')!.runs)}`);
}

console.log(`\n${line(78)}`);
console.log('DAMAGE TAKEN PER FLOOR  (reacting bot)  ·  d = depth');
console.log(line(78));
const depths = [1, 2, 3, 4, 5, 6, 7, 8];
console.log(`${'variant'.padEnd(14)}${depths.map((d) => pad('d' + d, 8)).join('')}`);
for (const res of results) {
  const runs = res.byBot.get('reacting')!.runs;
  const cells = depths
    .map((d) => {
      const f = perFloor(runs, d);
      return pad(f ? f.dmg.toFixed(2) : '·', 8);
    })
    .join('');
  console.log(`${res.rules.id.padEnd(14)}${cells}`);
}

console.log(`\n${line(78)}`);
console.log('FLOORS CLEARED WITHOUT TAKING A HIT  (reacting bot)');
console.log(line(78));
console.log(`${'variant'.padEnd(14)}${depths.map((d) => pad('d' + d, 8)).join('')}`);
for (const res of results) {
  const runs = res.byBot.get('reacting')!.runs;
  const cells = depths
    .map((d) => {
      const f = perFloor(runs, d);
      return pad(f ? (f.clean * 100).toFixed(0) + '%' : '·', 8);
    })
    .join('');
  console.log(`${res.rules.id.padEnd(14)}${cells}`);
}

console.log(`\n${line(78)}`);
console.log('PACE — player inputs spent per floor (reacting bot). Lower is more arcade.');
console.log(line(78));
console.log(`${'variant'.padEnd(14)}${depths.map((d) => pad('d' + d, 8)).join('')}`);
for (const res of results) {
  const runs = res.byBot.get('reacting')!.runs;
  const cells = depths
    .map((d) => {
      const f = perFloor(runs, d);
      return pad(f ? f.inputs.toFixed(1) : '·', 8);
    })
    .join('');
  console.log(`${res.rules.id.padEnd(14)}${cells}`);
}

console.log(`\n${line(78)}`);
for (const res of results) console.log(`${res.rules.id.padEnd(14)} ${res.rules.label}`);
console.log(`\n* human = 1-ply with a 12% misplay rate — the closest model of a real player.\n`);
