import { describe, expect, it } from 'vitest';
import { makeSearchBrain, playRun } from './bots';
import { newGame, step } from './engine';
import { chebyshev, eq, manhattan } from './grid';
import { Rng } from './rng';
import { SHIPPED } from './rules';
import type { GameState } from './types';

/**
 * Things that must never happen, checked over thousands of real turns.
 *
 * Both of these were reported from play rather than found by reading the code —
 * "I still teleport weirdly sometimes" and "I spawned on an enemy once" — which
 * is exactly the shape of bug a property test catches and a unit test does not:
 * rare, state-dependent, and invisible until the one seed that triggers it.
 */

interface Violation {
  seed: number;
  turn: number;
  what: string;
}

/** Everything that must hold of a single board, at rest. */
function checkBoard(s: GameState, seed: number, turn: number, out: Violation[]): void {
  const p = s.player.pos;

  for (const e of s.enemies) {
    if (eq(e.pos, p)) {
      out.push({ seed, turn, what: `player shares a tile with ${e.kind} #${e.id} at ${p.x},${p.y}` });
    }
    if (s.blots.some((b) => eq(b, e.pos))) {
      out.push({ seed, turn, what: `${e.kind} #${e.id} stands on a blot at ${e.pos.x},${e.pos.y}` });
    }
  }

  for (let i = 0; i < s.enemies.length; i++) {
    for (let j = i + 1; j < s.enemies.length; j++) {
      if (eq(s.enemies[i].pos, s.enemies[j].pos)) {
        out.push({
          seed,
          turn,
          what: `${s.enemies[i].kind} #${s.enemies[i].id} and ${s.enemies[j].kind} #${s.enemies[j].id} share a tile`,
        });
      }
    }
  }

  if (s.blots.some((b) => eq(b, p))) {
    out.push({ seed, turn, what: `player stands on a blot at ${p.x},${p.y}` });
  }
}

describe('invariants that must hold across a whole run', () => {
  it('never puts two things on the same tile, and never moves you more than one step', () => {
    const out: Violation[] = [];
    const brain = makeSearchBrain(1);

    for (let seed = 0; seed < 260; seed++) {
      let s = newGame(seed, SHIPPED);
      const rng = new Rng(seed ^ 0x51ed270b);
      checkBoard(s, seed, 0, out);

      for (let turn = 0; turn < 260 && s.screen === 'playing'; turn++) {
        const act = brain(s, rng);
        if (!act) break;
        const before = s;
        const r = step(s, act);
        if (!r.spent) continue;
        s = r.state;

        /*
         * One input is at most one tile.
         *
         * The exception is a DESCENT: the stairs rebuild the board and put you
         * somewhere on a new floor, which is a teleport by design. Everything
         * else that moves you further than a single orthogonal step is a bug,
         * and it is the one the player reported as "I still teleport weirdly".
         */
        if (s.depth === before.depth) {
          const d = manhattan(before.player.pos, s.player.pos);
          if (d > 1) {
            out.push({
              seed,
              turn,
              what: `'${act}' moved the player ${d} tiles: ${before.player.pos.x},${before.player.pos.y} → ${s.player.pos.x},${s.player.pos.y}`,
            });
          }
        }

        // An enemy may step at most one tile per turn — except a CHARGER, whose
        // whole identity is a committed two-tile lunge. Measured in CHEBYSHEV,
        // because a STALKER closes on the diagonal and one diagonal step is two
        // tiles of manhattan distance while still being a single step.
        for (const e of s.enemies) {
          const was = before.enemies.find((o) => o.id === e.id);
          if (!was) continue;
          const d = chebyshev(was.pos, e.pos);
          const cap = e.kind === 'charger' ? 2 : 1;
          if (d > cap) {
            out.push({ seed, turn, what: `${e.kind} #${e.id} moved ${d} tiles (cap ${cap})` });
          }
        }

        checkBoard(s, seed, turn + 1, out);
        if (out.length > 12) break;
      }
      if (out.length > 12) break;
    }

    expect(out.slice(0, 12)).toEqual([]);
  });

  /**
   * Arriving on a new floor standing on top of something.
   *
   * `generateFloor` reserves the player's tile before it places anything else,
   * so this cannot happen at generation — which means if it happens at all it
   * happens on the way IN, and that is worth checking separately from the
   * turn-by-turn sweep above.
   */
  it('never drops you onto an occupant when a floor opens', () => {
    const out: Violation[] = [];

    for (let seed = 0; seed < 400; seed++) {
      const run = playRun(seed, 900, makeSearchBrain(1), SHIPPED);
      // Re-walk the run and check every board the moment its depth changes.
      let s = newGame(seed, SHIPPED);
      const rng = new Rng(seed ^ 0x9e3779b9);
      const brain = makeSearchBrain(1);
      checkBoard(s, seed, 0, out);

      for (let turn = 0; turn < 900 && s.screen === 'playing'; turn++) {
        const act = brain(s, rng);
        if (!act) break;
        const before = s.depth;
        const r = step(s, act);
        if (!r.spent) continue;
        s = r.state;
        if (s.depth !== before) checkBoard(s, seed, turn, out);
        if (out.length > 8) break;
      }
      if (out.length > 8) break;
      expect(run.state.depth).toBeGreaterThan(0);
    }

    expect(out.slice(0, 8)).toEqual([]);
  });
});
