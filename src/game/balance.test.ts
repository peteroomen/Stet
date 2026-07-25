import { describe, expect, it } from 'vitest';
import { newGame, step } from './engine';
import { fullyConnected } from './floors';
import { ORTHO, add, eq, inBounds, manhattan } from './grid';
import { Rng } from './rng';
import type { Dir, GameState, Vec } from './types';

/**
 * Whole-run simulation.
 *
 * These are not unit tests of a rule — they are the closest thing to a playtest
 * that runs in CI: thousands of floors generated and hundreds of runs played by
 * a crude bot, checking the things that only show up over a run. A soft-locked
 * floor or a difficulty curve that never bites is invisible from any single
 * assertion.
 */

const DIR_OF: Record<string, Dir> = {
  '0,-1': 'up',
  '0,1': 'down',
  '-1,0': 'left',
  '1,0': 'right',
};

/**
 * A deliberately mediocre player: walks toward the nearest enemy, hits it, takes
 * the stairs when the floor is clear. It does not read telegraphs and does not
 * understand exposure — so it establishes the FLOOR of the difficulty curve. A
 * thinking player should do meaningfully better than this.
 */
function botMove(s: GameState, rng: Rng): Dir | null {
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

/**
 * A player who actually reads the board.
 *
 * Because enemies commit to their telegraphs, one `step()` of lookahead is not a
 * heuristic — it is EXACT. Whatever this bot scores is genuinely available to a
 * human studying the same telegraphs, so the gap between it and the mindless bot
 * above is the size of the skill ceiling the design creates.
 */
const DIRS: Dir[] = ['up', 'right', 'down', 'left'];

/** Static evaluation of a position, from the player's side. */
function evaluate(n: GameState, depthAtStart: number): number {
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

  score += (n.depth - depthAtStart) * 500;
  if (n.stairsOpen && n.enemies.length === 0) {
    score -= manhattan(n.player.pos, n.stairs) * 12;
  }
  // Idling toward the spill is a real cost the search should feel.
  score -= Math.max(0, n.floorTurns - n.grace) * 8;
  return score;
}

/**
 * Search over the player's own choices.
 *
 * Because enemies commit to their telegraphs, the enemy phase is fully
 * determined — so this is not a guess about a hidden opponent, it is exactly the
 * lookahead a human gets for free by reading the board. Ply 1 is "what happens if
 * I do this"; ply 3 is a player thinking two moves ahead. The gap between them is
 * the size of the skill ceiling the design creates.
 */
function search(s: GameState, ply: number, depthAtStart: number): number {
  if (ply === 0 || s.screen !== 'playing') return evaluate(s, depthAtStart);
  let best = -Infinity;
  for (const dir of DIRS) {
    const r = step(s, dir);
    if (!r.spent) continue;
    best = Math.max(best, search(r.state, ply - 1, depthAtStart));
  }
  return best === -Infinity ? evaluate(s, depthAtStart) : best;
}

function makeSearchBrain(ply: number) {
  return (s: GameState, rng: Rng): Dir | null => {
    let bestScore = -Infinity;
    let best: Dir | null = null;
    for (const dir of DIRS) {
      const r = step(s, dir);
      if (!r.spent) continue;
      const score = search(r.state, ply - 1, s.depth) + rng.next() * 2;
      if (score > bestScore) {
        bestScore = score;
        best = dir;
      }
    }
    return best;
  };
}

const smartMove = makeSearchBrain(1);
const thinkingMove = makeSearchBrain(3);

function playRun(seed: number, maxTurns = 4000, brain = botMove) {
  let s = newGame(seed);
  const rng = new Rng(seed ^ 0x9e3779b9);
  let turns = 0;
  let stalled = 0;

  while (s.screen === 'playing' && turns < maxTurns) {
    const dir = brain(s, rng);
    if (!dir) break;
    const r = step(s, dir);
    if (!r.spent) {
      stalled++;
      if (stalled > 40) break; // bot wedged against a wall, not a game bug
    } else {
      stalled = 0;
    }
    s = r.state;
    turns++;
  }
  return { state: s, turns, timedOut: turns >= maxTurns };
}

describe('floor generation is always solvable', () => {
  it('never seals a pocket, across every floor of a long descent', () => {
    // 200 seeds x 14 floors — enough to hit the L-shaped corner seal that made
    // a floor unclearable before blots were connectivity-checked.
    for (let seed = 0; seed < 200; seed++) {
      let s = newGame(seed);
      for (let floor = 0; floor < 14; floor++) {
        expect(fullyConnected(s.blots, s.player.pos)).toBe(true);

        // Everything that matters is standing on walkable ground.
        for (const e of s.enemies) {
          expect(s.blots.some((b) => eq(b, e.pos))).toBe(false);
        }
        expect(s.blots.some((b) => eq(b, s.stairs))).toBe(false);
        for (const i of s.items) expect(s.blots.some((b) => eq(b, i.pos))).toBe(false);

        // Force the descent to reach the next floor's generator.
        const st = s.stairs;
        const above = st.y > 0;
        s = {
          ...s,
          enemies: [],
          blots: [],
          stairsOpen: true,
          player: { ...s.player, pos: { x: st.x, y: above ? st.y - 1 : st.y + 1 } },
        };
        s = step(s, above ? 'down' : 'up').state;
      }
    }
  });

  it('keeps the board playable — never more blots than it can hold', () => {
    for (let seed = 0; seed < 120; seed++) {
      let s = newGame(seed);
      for (let floor = 0; floor < 10; floor++) {
        expect(s.blots.length).toBeLessThanOrEqual(3);
        expect(s.enemies.length).toBeLessThanOrEqual(7);
        expect(s.enemies.length).toBeGreaterThanOrEqual(2);
        const st = s.stairs;
        const above = st.y > 0;
        s = {
          ...s,
          enemies: [],
          blots: [],
          stairsOpen: true,
          player: { ...s.player, pos: { x: st.x, y: above ? st.y - 1 : st.y + 1 } },
        };
        s = step(s, above ? 'down' : 'up').state;
      }
    }
  });
});

function stats(runs: ReturnType<typeof playRun>[]) {
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

describe('the difficulty curve actually bites', () => {
  const dumb = stats(Array.from({ length: 150 }, (_, i) => playRun(i)));
  const smart = stats(Array.from({ length: 150 }, (_, i) => playRun(i, 4000, smartMove)));
  const thinking = stats(Array.from({ length: 60 }, (_, i) => playRun(i, 4000, thinkingMove)));

  it('reports the curve', () => {
    const row = (name: string, s: ReturnType<typeof stats>) =>
      `      ${name.padEnd(9)}: median ${String(s.median).padStart(2)}  mean ${s.mean.toFixed(1).padStart(4)}  deepest ${String(s.max).padStart(2)}` +
      `  turns ${String(s.medianTurns).padStart(4)}  died ${(s.died * 100).toFixed(0).padStart(3)}%  died-on-1 ${(s.diedOnOne * 100).toFixed(0)}%`;
    console.log(
      `\n${row('mindless', dumb)}\n${row('1-ply', smart)}\n${row('3-ply', thinking)}\n`,
    );
    expect(dumb.depths.length).toBe(150);
  });

  /**
   * The spill exists because of this test. Before it, a bot that read telegraphs
   * and simply refused to engage kited three rats for 4000 turns on floor one and
   * never died — 56% of runs never ended. Every enemy moves at exactly your
   * speed, so on an open board patience beat commitment, which is the opposite of
   * the game.
   */
  it('cannot be stalled — every run ends', () => {
    expect(smart.died).toBe(1);
    expect(thinking.died).toBe(1);
    for (const r of Array.from({ length: 40 }, (_, i) => playRun(i, 4000, thinkingMove))) {
      expect(r.timedOut).toBe(false);
    }
  });

  it('punishes a bot that ignores telegraphs and exposure', () => {
    // If a mindless bumper could descend forever, commitment would cost nothing.
    expect(dumb.median).toBeLessThan(6);
  });

  /**
   * The whole design rests on this gap. Telegraphs plus exposure only matter if
   * reading them is worth a lot of depth; if every bot scored the same, the game
   * would be a slot machine with a nice coat of ink on it.
   *
   * Measured: mindless 2 · 1-ply 3 · 3-ply 10. Thinking two moves ahead is worth
   * roughly five times the depth of bumping into things.
   */
  it('rewards reading the board with real depth', () => {
    expect(thinking.median).toBeGreaterThanOrEqual(dumb.median * 3);
    expect(thinking.median).toBeGreaterThanOrEqual(6);
  });

  it('does not hand depth to a player who only reacts', () => {
    // 1-ply sees the consequence of its own move but plans nothing.
    expect(smart.median).toBeLessThan(thinking.median);
  });

  it('is not a coin flip on floor one', () => {
    // The opening floor is all rats and should be survivable even played badly.
    expect(dumb.diedOnOne).toBeLessThan(0.2);
    expect(thinking.diedOnOne).toBe(0);
  });
});

describe('invariants hold across a full run', () => {
  it('nothing ever occupies a blot, overlaps, or leaves the board', () => {
    for (let seed = 300; seed < 340; seed++) {
      let s = newGame(seed);
      const rng = new Rng(seed);
      for (let i = 0; i < 400 && s.screen === 'playing'; i++) {
        const dir = botMove(s, rng);
        if (!dir) break;
        s = step(s, dir).state;

        expect(inBounds(s.player.pos)).toBe(true);
        expect(s.blots.some((b) => eq(b, s.player.pos))).toBe(false);
        expect(s.player.hp).toBeGreaterThanOrEqual(0);
        expect(s.player.hp).toBeLessThanOrEqual(s.player.maxHp);

        const occupied = new Set<string>();
        for (const e of s.enemies) {
          expect(inBounds(e.pos)).toBe(true);
          expect(s.blots.some((b) => eq(b, e.pos))).toBe(false);
          expect(eq(e.pos, s.player.pos)).toBe(false);
          const k = `${e.pos.x},${e.pos.y}`;
          expect(occupied.has(k)).toBe(false);
          occupied.add(k);
          expect(e.hp).toBeGreaterThan(0);
        }
      }
    }
  });
});
