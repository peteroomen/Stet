/** Where the time in a turn actually goes. Temporary. */
import { chooseTrait, newGame, step } from '../src/game/engine';
import { chooseGreedy, makeSearchBrain, playRun } from '../src/game/bots';
import { SHIPPED } from '../src/game/rules';
import { Rng } from '../src/game/rng';
import { cloneState } from '../src/game/types';

// A representative mid-game board that is still ALIVE — a dead state makes
// step() return on its first line and measures nothing at all.
let s = newGame(7, SHIPPED);
const rng = new Rng(99);
const brain = makeSearchBrain(1);
// Play down to a busy mid-game floor and stop with foes still on it. A cleared
// board is wrong twice over: nothing to plan against, and `step` would descend,
// which runs the whole floor generator and is not what a turn costs. Search
// seeds rather than trusting one, since a 1-ply bot's median run is short.
function busyBoard() {
  for (let seed = 0; seed < 200; seed++) {
    let g = newGame(seed, SHIPPED);
    const r2 = new Rng(seed ^ 0x9e3779b9);
    for (let i = 0; i < 900; i++) {
      if (g.screen === 'choosing') {
        g = chooseTrait(g, chooseGreedy(g, g.offer, r2)).state;
        continue;
      }
      const a = brain(g, r2);
      if (!a) break;
      const r = step(g, a);
      if (!r.spent) continue;
      g = r.state;
      // Check BEFORE the screen guard: a descent lands on 'choosing', which is
      // exactly the moment a fresh, fully-populated floor exists.
      if (g.depth >= 3 && g.enemies.length >= 3 && !g.stairsOpen) {
        return g.screen === 'choosing' ? { ...g, screen: 'playing' as const, offer: [] } : g;
      }
      if (g.screen === 'dead') break;
    }
  }
  throw new Error('no busy board found');
}
s = busyBoard();
if (s.screen !== 'playing') throw new Error('bench board is not alive');
console.log(`board: depth ${s.depth}, ${s.enemies.length} foes, hp ${s.player.hp}\n`);

const time = (label: string, n: number, f: () => unknown) => {
  for (let i = 0; i < 200; i++) f(); // warm
  const t0 = Date.now();
  for (let i = 0; i < n; i++) f();
  const ms = Date.now() - t0;
  console.log(`${label.padEnd(18)} ${((ms / n) * 1000).toFixed(2)} µs   (${ms} ms / ${n})`);
  return ms / n;
};

const N = 50000;
const sc = time('structuredClone', N, () => structuredClone(s));
const cs = time('cloneState', N, () => cloneState(s));
const st = time('step()', N, () => step(s, 'right'));
console.log(`\ncloneState is ${(sc / cs).toFixed(1)}x faster than structuredClone`);
console.log(`clone is now ${((cs / st) * 100).toFixed(0)}% of a step`);

const t0 = Date.now();
for (let i = 0; i < 8; i++) playRun(i, 4000, makeSearchBrain(3), SHIPPED);
console.log(`\n8 x 3-ply runs   ${Date.now() - t0} ms`);
