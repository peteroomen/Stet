import { describe, expect, it } from 'vitest';
import { chooseGreedy, makeSearchBrain } from './bots';
import { chooseTrait, newGame, step } from './engine';
import { Rng } from './rng';
import { SHIPPED, VARIANTS } from './rules';
import { cloneState } from './types';
import type { GameState } from './types';

/**
 * `cloneState` is a hand-written `structuredClone`, and these are what make that
 * safe to have done.
 *
 * It exists because the clone was the whole cost of a turn — 24.6 µs against
 * 3.1 µs for everything else `step()` does on a depth-3 board — and `step()` is
 * called exponentially by the search bots and four times per real input by the
 * previews. Hand-written it is 34x faster.
 *
 * The risk is entirely in what a hand-written copy might MISS. A field added to
 * `GameState` and forgotten here would either vanish (caught by equality) or, far
 * worse, be shared by reference with the original — and in a mutating engine that
 * means a bot's hypothetical move silently edits the real board. So both are
 * checked, over real boards rather than a fixture, and the alias check walks
 * every nested structure rather than trusting a spot check.
 */

/** Play a run to a board with something interesting on it. */
function boards(seed: number, want: number): GameState[] {
  const out: GameState[] = [];
  let s = newGame(seed, SHIPPED);
  const rng = new Rng(seed ^ 0x51ed270b);
  const brain = makeSearchBrain(1);
  for (let i = 0; i < 600 && out.length < want; i++) {
    if (s.screen === 'choosing') {
      out.push(s); // a hand up is its own shape of state
      s = chooseTrait(s, chooseGreedy(s, s.offer, rng)).state;
      continue;
    }
    if (s.screen !== 'playing') break;
    const act = brain(s, rng);
    if (!act) break;
    const r = step(s, act);
    if (!r.spent) continue;
    s = r.state;
    if (i % 7 === 0) out.push(s);
  }
  return out;
}

describe('cloneState', () => {
  it('copies exactly what structuredClone copies', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (const s of boards(seed, 12)) {
        expect(cloneState(s)).toEqual(structuredClone(s));
      }
    }
  });

  it('leaves the original untouched', () => {
    for (let seed = 0; seed < 20; seed++) {
      for (const s of boards(seed, 6)) {
        const before = structuredClone(s);
        cloneState(s);
        expect(s).toEqual(before);
      }
    }
  });

  /**
   * The one that actually matters.
   *
   * Every mutable object reachable from the copy must be a DIFFERENT object from
   * the one reachable from the original, or `step()` — which mutates freely,
   * because it believes it owns its copy — writes through into the caller's
   * board. `rules` is the deliberate exception: it is immutable by contract
   * (`applyTraitRules` builds a new object) and copying it on the hottest path
   * in the game would be pure waste.
   */
  it('shares no mutable object with the original', () => {
    const shared: string[] = [];

    const walk = (a: unknown, b: unknown, path: string): void => {
      if (a === null || typeof a !== 'object') return;
      if (path === 'rules') return; // immutable by contract, shared on purpose
      if (a === b) {
        shared.push(path);
        return;
      }
      if (Array.isArray(a) && Array.isArray(b)) {
        for (let i = 0; i < a.length; i++) walk(a[i], b[i], `${path}[${i}]`);
        return;
      }
      for (const k of Object.keys(a as object)) {
        walk(
          (a as Record<string, unknown>)[k],
          (b as Record<string, unknown>)[k],
          path ? `${path}.${k}` : k,
        );
      }
    };

    for (let seed = 0; seed < 20; seed++) {
      for (const s of boards(seed, 8)) walk(s, cloneState(s), '');
    }
    expect(shared).toEqual([]);
  });

  /*
   * Every intent shape has its own branch in `cloneIntent`, so every shape has
   * to be seen by the tests above. A sweep only exists from depth 5, which a
   * 1-ply bot rarely reaches, so it is constructed here rather than hoped for.
   */
  it('copies every shape of intent, including a sweep', () => {
    const s = newGame(1, SHIPPED);
    const withIntents: GameState = {
      ...s,
      enemies: [
        { ...s.enemies[0], id: 91, intent: { kind: 'move', path: [{ x: 1, y: 1 }] } },
        { ...s.enemies[0], id: 92, intent: { kind: 'wind', path: [] } },
        { ...s.enemies[0], id: 93, intent: { kind: 'hold', path: [] } },
        {
          ...s.enemies[0],
          id: 94,
          intent: { kind: 'sweep', path: [], tiles: [{ x: 0, y: 2 }, { x: 1, y: 2 }] },
        },
      ],
    };

    const copy = cloneState(withIntents);
    expect(copy).toEqual(structuredClone(withIntents));
    for (let i = 0; i < 4; i++) {
      expect(copy.enemies[i].intent).not.toBe(withIntents.enemies[i].intent);
    }
    const swept = copy.enemies[3].intent;
    const orig = withIntents.enemies[3].intent;
    if (swept.kind !== 'sweep' || orig.kind !== 'sweep') throw new Error('unreachable');
    expect(swept.tiles[0]).not.toBe(orig.tiles[0]);
  });

  /*
   * Rule variants move fields that the shipped game leaves at zero — the fade
   * fills `player.ink`, WEAR fills `player.trail`. A clone tested only against
   * SHIPPED would not copy them and nothing would notice until a variant ran.
   */
  it('copies fields only the rule variants ever use', () => {
    for (const rules of VARIANTS) {
      let s = newGame(5, rules);
      const rng = new Rng(5);
      const brain = makeSearchBrain(1);
      for (let i = 0; i < 40; i++) {
        if (s.screen === 'choosing') {
          s = chooseTrait(s, chooseGreedy(s, s.offer, rng)).state;
          continue;
        }
        if (s.screen !== 'playing') break;
        const act = brain(s, rng);
        if (!act) break;
        const r = step(s, act);
        if (r.spent) s = r.state;
      }
      expect(cloneState(s)).toEqual(structuredClone(s));
    }
  });
});
