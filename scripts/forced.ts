/**
 * How often is there no move that avoids damage?
 *
 *   npx vite-node scripts/forced.ts
 *
 * The claim this exists to test: "without a wait there are situations you can't
 * avoid damage." That is measurable rather than arguable, because the preview
 * already computes the exact cost of every option — enemies commit, so the phase
 * following any move is fully determined.
 *
 * For every turn a reactive bot plays, this asks:
 *
 *   - is there ANY direction that costs nothing?
 *   - if not, what is the cheapest direction, and would HOLDING beat it?
 *
 * That last question is the whole argument for a wait action. Holding does not
 * dodge anything — a blow committed to your tile still lands — but you are not
 * mid-swing when it does, so it lands once instead of twice. If forced-damage
 * turns are common and holding is routinely cheaper, the button is fixing a real
 * hole rather than handing patience a free verb.
 */

import { makeSearchBrain, playRun } from '../src/game/bots';
import { step } from '../src/game/engine';
import { previewMoves } from '../src/game/preview';
import { Rng } from '../src/game/rng';
import { SHIPPED, type Rules } from '../src/game/rules';
import type { GameState } from '../src/game/types';

const RUNS = 120;

/** SHIPPED, but with holding legal, purely so its cost can be priced. */
const PROBE: Rules = { ...SHIPPED, allowWait: true, waitCost: 1 };

function waitCost(s: GameState): number | null {
  const r = step({ ...s, rules: PROBE }, 'wait');
  if (!r.spent) return null;
  let taken = 0;
  for (const ev of r.events) if (ev.t === 'eattack') taken += ev.dmg;
  return taken;
}

let turns = 0;
let forced = 0; // no direction avoids damage
let forcedWaitBetter = 0; // ...and holding is strictly cheaper
let forcedWaitFree = 0; // ...and holding costs nothing at all
let forcedWhileExposed = 0;
let lethalOnly = 0; // every option ends the run

const brain = makeSearchBrain(1);

for (let seed = 0; seed < RUNS; seed++) {
  // Replay the run one turn at a time so each board can be inspected before the
  // bot commits to it.
  const rng = new Rng(seed ^ 0x9e3779b9);
  let s = playRun(seed, 0, brain, SHIPPED).state;
  s = { ...s };

  // playRun with maxTurns 0 just builds the floor; drive it manually from here.
  let guard = 0;
  while (s.screen === 'playing' && guard++ < 400) {
    const moves = previewMoves(s).filter((m) => m.legal);
    if (moves.length === 0) break;

    turns++;
    const cheapest = Math.min(...moves.map((m) => m.taken));
    if (cheapest > 0) {
      forced++;
      if (s.player.exposed) forcedWhileExposed++;
      if (moves.every((m) => m.lethal)) lethalOnly++;
      const w = waitCost(s);
      if (w !== null && w < cheapest) forcedWaitBetter++;
      if (w === 0) forcedWaitFree++;
    }

    const act = brain(s, rng);
    if (!act) break;
    const r = step(s, act);
    if (!r.spent) break;
    s = r.state;
  }
}

const pc = (n: number, d: number) => `${((n / d) * 100).toFixed(1)}%`;

console.log(`
Turns inspected                         ${turns}
No direction avoids damage              ${forced}  (${pc(forced, turns)})
  ...of those, holding is cheaper       ${forcedWaitBetter}  (${pc(forcedWaitBetter, Math.max(1, forced))})
  ...of those, holding is FREE          ${forcedWaitFree}  (${pc(forcedWaitFree, Math.max(1, forced))})
  ...of those, you were mid-swing       ${forcedWhileExposed}  (${pc(forcedWhileExposed, Math.max(1, forced))})
Every option ends the run               ${lethalOnly}  (${pc(lethalOnly, turns)})
`);
