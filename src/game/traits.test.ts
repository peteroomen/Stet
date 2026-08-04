import { describe, expect, it } from 'vitest';
import { chooseTrait, newGame, step } from './engine';
import { ERA_FLOORS } from './eras';
import { Rng } from './rng';
import { SHIPPED } from './rules';
import { KEYWORDS, keywordFor, markedWords, splitKeywords } from './keywords';
import { MEND, RARE_CHANCE, TRAITS, TRAIT_BY_ID, offerTraits } from './traits';
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

  it('always puts one in the hand dealt at a boss, while you have none', () => {
    for (let i = 0; i < 200; i++) {
      expect(deal({ atBoss: true, seed: i }).some((t) => t.rare)).toBe(true);
    }
  });

  /*
   * The condition the promise was missing.
   *
   * What the guarantee is FOR is "a boss is never lost to a run that simply
   * never saw a rare". A run already holding one does not have that problem, so
   * handing it another is not keeping a promise — it is just a bigger pile. And
   * it was the larger of the two sources by a distance: measured over 120 3-ply
   * runs, 81% of boss hands carried a rare against 13% of ordinary ones, on a
   * quarter of all hands dealt.
   */
  it('stops guaranteeing one once the run already holds a rare', () => {
    const held = [rares[0].id];
    let withRare = 0;
    const TRIALS = 400;
    for (let i = 0; i < TRIALS; i++) {
      if (deal({ atBoss: true, seed: i, taken: held }).some((t) => t.rare)) withRare++;
    }
    // Back to taking its chances like any other hand, so well under half.
    expect(withRare / TRIALS).toBeLessThan(0.4);
    // But still possible — the roll is halved, not switched off.
    expect(withRare).toBeGreaterThan(0);
  });

  it('is half what it was', () => {
    // Reported from play as "I see them all the time". The roll is the half of
    // the problem this constant owns; the boss promise is the other half.
    expect(RARE_CHANCE).toBeCloseTo(0.12, 5);
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

/**
 * The vocabulary, and the promise it rests on.
 *
 * A card may use a jargon word only if the word is defined in one place — see
 * `game/keywords.ts`. What makes that fair rather than obscure is that the set
 * is CLOSED, so these are the tests that keep it closed: a marked word that
 * resolves to nothing would ship as a bold word with no meaning behind it, which
 * is the FOOLSCAP failure again in a new costume.
 */
describe('card copy', () => {
  const all = [...TRAITS, MEND];

  it('only marks words the game has defined', () => {
    for (const t of all) {
      for (const word of markedWords(t.line)) {
        expect({ card: t.id, word, known: keywordFor(word) !== undefined }).toMatchObject({
          known: true,
        });
      }
    }
  });

  it('says what it does in one short line', () => {
    for (const t of all) {
      // Measured without the markers, which are not read by anybody.
      const plain = t.line.replace(/\*/g, '');
      expect({ card: t.id, len: plain.length <= 74 }).toMatchObject({ len: true });
      expect(plain.endsWith('.')).toBe(true);
    }
  });

  /*
   * Every keyword has to be earned by a card that uses it. A glossary entry
   * nothing refers to is a rule the player is asked to learn for nothing.
   */
  it('defines nothing it does not use', () => {
    const used = new Set(all.flatMap((t) => markedWords(t.line).map((w) => keywordFor(w)?.label)));
    for (const [key, kw] of Object.entries(KEYWORDS)) {
      expect({ key, used: used.has(kw.label) }).toMatchObject({ used: true });
    }
  });

  it('resolves a marked word into a run that carries its meaning', () => {
    const runs = splitKeywords('+1 damage on every *stroke*.');
    expect(runs.map((r) => r.text)).toEqual(['+1 damage on every ', 'stroke', '.']);
    expect(runs[1].keyword?.means).toContain('Swipe into a foe');
    // An inflected form still resolves — copy is written as English.
    expect(splitKeywords('always *breaks*')[1].keyword?.label).toBe('break');
  });
});
