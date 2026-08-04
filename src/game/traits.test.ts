import { describe, expect, it } from 'vitest';
import { chooseTrait, newGame, step } from './engine';
import { ERA_FLOORS } from './eras';
import { Rng } from './rng';
import { SHIPPED } from './rules';
import { RARE_CHANCE, TRAITS, TRAIT_BY_ID, offerTraits } from './traits';
import type { GameState } from './types';

/**
 * Rarity, and the promise that pays for it.
 *
 * A pool where every card is equally likely has no shape: nothing is a find, and
 * a good run differs from a bad one only in arithmetic. But scarcity on its own
 * is just a tax — a run can simply never see the card it needed. So the rares
 * are GUARANTEED on the hand dealt as you arrive at a boss, which puts the spike
 * exactly where the game asks the most.
 */
describe('rare marginalia', () => {
  const rares = TRAITS.filter((t) => t.rare);
  const deal = (opts: { atBoss?: boolean; seed?: number; taken?: string[]; count?: number } = {}) => {
    const rng = new Rng(opts.seed ?? 1);
    return offerTraits(opts.taken ?? [], (n) => rng.int(n), opts.count ?? 3, false, 6, opts.atBoss);
  };

  it('reserves rarity for the cards that change what a stroke is', () => {
    // Reach, breadth, and a turn that does not end. Not raw damage: the run has
    // to be able to find a way to hurt things, or a boss becomes unwinnable
    // rather than merely hard.
    expect(rares.map((t) => t.id).sort()).toEqual(['broad-nib', 'long-nib', 'momentum']);
    expect(TRAIT_BY_ID.get('whetstone')?.rare).toBeFalsy();
    expect(TRAIT_BY_ID.get('vellum')?.rare).toBeFalsy();
  });

  it('keeps them off most ordinary hands', () => {
    let withRare = 0;
    const TRIALS = 600;
    for (let i = 0; i < TRIALS; i++) {
      const hand = deal({ seed: i });
      if (hand.some((t) => t.rare)) withRare++;
    }
    const rate = withRare / TRIALS;
    // Roughly RARE_CHANCE. Loose bounds: this is a property of the deal, not a
    // fixture, and pinning it exactly would break on any pool change.
    expect(rate).toBeGreaterThan(RARE_CHANCE * 0.5);
    expect(rate).toBeLessThan(RARE_CHANCE * 1.8);
  });

  it('always puts one in the hand dealt at a boss', () => {
    for (let i = 0; i < 200; i++) {
      expect(deal({ atBoss: true, seed: i }).some((t) => t.rare)).toBe(true);
    }
  });

  /*
   * The guarantee has to survive the pool running dry, or arriving at the last
   * boss with every rare already taken deals a broken hand.
   */
  it('deals an ordinary hand when every rare is already taken', () => {
    const taken = rares.map((t) => t.id);
    for (let i = 0; i < 50; i++) {
      const hand = deal({ atBoss: true, seed: i, taken });
      expect(hand.length).toBeGreaterThan(0);
      expect(hand.some((t) => taken.includes(t.id))).toBe(false);
    }
  });

  it('never offers a hand with the same card in it twice', () => {
    for (const atBoss of [false, true]) {
      for (let i = 0; i < 200; i++) {
        const ids = deal({ atBoss, seed: i, count: 4 }).map((t) => t.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });

  /** The whole point, checked end to end through a real descent. */
  it('the hand on the boss floor itself carries one', () => {
    for (const seed of [1, 2, 3, 5, 8]) {
      let s: GameState = newGame(seed, SHIPPED);
      let guard = 0;
      while (s.depth < ERA_FLOORS && guard++ < 400) {
        if (s.screen === 'choosing') {
          s = chooseTrait(s, s.offer[0]).state;
          continue;
        }
        const st = s.stairs;
        const above = st.y > 0;
        s = {
          ...s,
          enemies: [],
          stairsOpen: true,
          player: { ...s.player, pos: { x: st.x, y: above ? st.y - 1 : st.y + 1 } },
        };
        s = step(s, above ? 'down' : 'up').state;
      }
      expect(s.depth).toBe(ERA_FLOORS);
      expect(s.screen).toBe('choosing');
      expect(s.offer.some((id) => TRAIT_BY_ID.get(id)?.rare)).toBe(true);
    }
  });
});
