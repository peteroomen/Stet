/**
 * Simulated players.
 *
 * These are the closest thing this project has to a playtest that runs in CI,
 * and — because enemies commit to their telegraphs — the enemy phase is fully
 * determined, so N-ply search here is EXACT rather than heuristic. Whatever a
 * bot scores is genuinely available to a human reading the same board, which is
 * what makes the spread between bots a real measurement of the skill curve
 * rather than a property of the search.
 *
 * Shared by `balance.test.ts` (regression bounds) and `scripts/model.ts`
 * (comparing rule variants), so both are measuring the same players.
 */

import { newGame, step } from './engine';
import { ORTHO, add, eq, inBounds, manhattan } from './grid';
import { Rng } from './rng';
import { SHIPPED, type Rules } from './rules';
import type { Dir, GameState, Vec } from './types';

export const DIRS: Dir[] = ['up', 'right', 'down', 'left'];

const DIR_OF: Record<string, Dir> = {
  '0,-1': 'up',
  '0,1': 'down',
  '-1,0': 'left',
  '1,0': 'right',
};

export type Brain = (s: GameState, rng: Rng) => Dir | null;

/**
 * A deliberately mediocre player: walks toward the nearest enemy, hits it, takes
 * the stairs when the floor is clear. It does not read telegraphs and does not
 * understand exposure — so it establishes the FLOOR of the difficulty curve.
 */
export function botMove(s: GameState, rng: Rng): Dir | null {
  const p = s.player.pos;

  const goal: Vec | null = s.enemies.length
    ? s.enemies.reduce((a, b) => (manhattan(a.pos, p) <= manhattan(b.pos, p) ? a : b)).pos
    : s.stairsOpen
      ? s.stairs
      : null;
  if (!goal) return null;

  const legal = ORTHO.map((d) => ({ d, v: add(p, d) })).filter(
    ({ v }) => inBounds(v) && !s.blots.some((b) => eq(b, v)),
  );
  if (legal.length === 0) return null;

  const best = Math.min(...legal.map(({ v }) => manhattan(v, goal)));
  const closing = legal.filter(({ v }) => manhattan(v, goal) === best);
  const chosen = closing[rng.int(closing.length)];
  return DIR_OF[`${chosen.d.x},${chosen.d.y}`];
}

/** Static evaluation of a position, from the player's side. */
export function evaluate(n: GameState, depthAtStart: number): number {
  let score = 0;
  if (n.screen === 'dead') return -100000 + n.depth * 100;

  score += n.player.hp * 34;
  score += n.stats.kills * 60;

  // Standing work left on the floor. Without a strong term here the search values
  // its own health so highly that it never swings — and kiting is not survivable
  // on a board this small, so it kites into a corner and dies on floor one.
  score -= n.enemies.reduce((a, e) => a + e.hp, 0) * 12;
  score -= n.enemies.length * 26;
  score += n.player.dmg * 40;

  for (const e of n.enemies) {
    if (manhattan(e.pos, n.player.pos) <= 1) score -= 8;
    if (e.intent.kind === 'move' && e.intent.path.some((v) => eq(v, n.player.pos))) {
      score -= n.player.exposed ? 34 : 16;
    }
  }

  // A banked dodge is worth something only if it gets spent, so price it below a
  // single point of health — enough to prefer taking it, not enough to hoard.
  if (n.player.flow) score += 22;

  score += (n.depth - depthAtStart) * 500;
  if (n.stairsOpen && n.enemies.length === 0) {
    score -= manhattan(n.player.pos, n.stairs) * 12;
  }
  // Idling toward the spill is a real cost the search should feel.
  score -= Math.max(0, n.floorTurns - n.grace) * 8;
  return score;
}

function search(s: GameState, ply: number, depthAtStart: number): number {
  if (ply === 0 || s.screen !== 'playing') return evaluate(s, depthAtStart);
  let best = -Infinity;
  for (const dir of DIRS) {
    const r = step(s, dir);
    if (!r.spent) continue;
    /*
     * A ply is one ENEMY PHASE, not one input.
     *
     * Under MOMENTUM a kill returns before the enemies act, so counting it as a
     * ply truncates the search exactly on the moves that need looking past —
     * the bot scored the board mid-chain, saw a free kill, and never simulated
     * the retaliation. Measured: it read as the rule killing 94% of runs on
     * floor one while a 3-ply bot reached depth 25 off the same rule, which is
     * not a difficulty curve, it is a horizon artifact. The chain is bounded by
     * `killGrantsActions`, so not decrementing here still terminates.
     */
    const free = r.state.chain > s.chain;
    best = Math.max(best, search(r.state, free ? ply : ply - 1, depthAtStart));
  }
  return best === -Infinity ? evaluate(s, depthAtStart) : best;
}

/**
 * Ply 1 is "what happens if I do this"; ply 3 is a player thinking two moves
 * ahead. The gap between them is the size of the skill ceiling the design
 * creates — and the ABSOLUTE value of ply 1 is how far a reactive player gets,
 * which is the number that matters for whether the game feels playable.
 */
export function makeSearchBrain(ply: number): Brain {
  return (s, rng) => {
    let bestScore = -Infinity;
    let best: Dir | null = null;
    for (const dir of DIRS) {
      const r = step(s, dir);
      if (!r.spent) continue;
      // Same horizon rule as `search`: a granted free action is not a ply.
      const free = r.state.chain > s.chain;
      const score = search(r.state, free ? ply : ply - 1, s.depth) + rng.next() * 2;
      if (score > bestScore) {
        bestScore = score;
        best = dir;
      }
    }
    return best;
  };
}

/**
 * A human proxy.
 *
 * A real player on a phone does not evaluate every option every turn — they read
 * the board, mostly get it right, and sometimes swipe the wrong way or miss a
 * telegraph under time pressure. This is 1-ply with a fixed misplay rate, and it
 * is the bot whose depth most closely matches "how far am I actually getting".
 */
export function makeSloppyBrain(ply: number, misplay: number): Brain {
  const clean = makeSearchBrain(ply);
  return (s, rng) => {
    if (rng.next() < misplay) return DIRS[rng.int(DIRS.length)];
    return clean(s, rng);
  };
}

export const BOTS: { name: string; brain: Brain; runs: number }[] = [
  { name: 'mindless', brain: botMove, runs: 150 },
  { name: 'reacting', brain: makeSearchBrain(1), runs: 150 },
  { name: 'human*', brain: makeSloppyBrain(1, 0.12), runs: 150 },
  { name: '2-ply', brain: makeSearchBrain(2), runs: 80 },
  { name: 'thinking', brain: makeSearchBrain(3), runs: 60 },
];

export interface FloorRecord {
  depth: number;
  /** Player inputs spent on this floor. Under MOMENTUM some of them are free. */
  inputs: number;
  /** Game turns — inputs that actually ran an enemy phase. */
  turns: number;
  damage: number;
}

export interface RunRecord {
  state: GameState;
  turns: number;
  timedOut: boolean;
  floors: FloorRecord[];
}

export function playRun(
  seed: number,
  maxTurns = 4000,
  brain: Brain = botMove,
  rules: Rules = SHIPPED,
): RunRecord {
  let s = newGame(seed, rules);
  const rng = new Rng(seed ^ 0x9e3779b9);
  let turns = 0;
  let stalled = 0;

  const floors: FloorRecord[] = [];
  let floorDepth = s.depth;
  let floorInputs = 0;
  let floorTurns = 0;
  let floorDamage = 0;

  while (s.screen === 'playing' && turns < maxTurns) {
    const dir = brain(s, rng);
    if (!dir) break;
    const r = step(s, dir);
    if (!r.spent) {
      stalled++;
      if (stalled > 40) break; // bot wedged against a wall, not a game bug
      continue;
    }
    stalled = 0;

    // Damage is measured from the stats counter rather than from the HP delta,
    // so healing on the same turn cannot hide a blow.
    floorDamage += r.state.stats.damageTaken - s.stats.damageTaken;
    floorInputs++;
    floorTurns += r.state.stats.turns - s.stats.turns;

    if (r.state.depth !== floorDepth) {
      floors.push({
        depth: floorDepth,
        inputs: floorInputs,
        turns: floorTurns,
        damage: floorDamage,
      });
      floorDepth = r.state.depth;
      floorInputs = 0;
      floorTurns = 0;
      floorDamage = 0;
    }

    s = r.state;
    turns++;
  }
  return { state: s, turns, timedOut: turns >= maxTurns, floors };
}

export interface RunStatsSummary {
  depths: number[];
  median: number;
  mean: number;
  max: number;
  medianTurns: number;
  diedOnOne: number;
  died: number;
}

export function summarise(runs: RunRecord[]): RunStatsSummary {
  const depths = runs.map((r) => r.state.depth).sort((a, b) => a - b);
  const turns = runs.map((r) => r.turns).sort((a, b) => a - b);
  return {
    depths,
    median: depths[Math.floor(depths.length / 2)],
    mean: depths.reduce((a, b) => a + b, 0) / depths.length,
    max: depths[depths.length - 1],
    medianTurns: turns[Math.floor(turns.length / 2)],
    // Deaths only. Counting "finished at depth 1" also counted runs that were
    // still alive and healthy when the harness stopped them, which read as a
    // 35% floor-one death rate that was not happening.
    diedOnOne:
      runs.filter((r) => r.state.screen === 'dead' && r.state.depth === 1).length / runs.length,
    died: runs.filter((r) => r.state.screen === 'dead').length / runs.length,
  };
}
