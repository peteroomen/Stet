import { describe, expect, it } from 'vitest';
import { BOTS, botMove, playRun, summarise } from './bots';
import { chooseTrait, newGame, step } from './engine';
import { isBossFloor } from './eras';
import { fullyConnected } from './floors';
import { eq, inBounds } from './grid';
import { Rng } from './rng';

/**
 * Whole-run simulation.
 *
 * These are not unit tests of a rule — they are the closest thing to a playtest
 * that runs in CI: thousands of floors generated and hundreds of runs played by
 * bots of increasing lookahead, checking the things that only show up over a
 * run. A soft-locked floor or a difficulty curve that never bites is invisible
 * from any single assertion.
 *
 * The bots themselves live in `bots.ts` so that this suite and the rule-variant
 * model (`scripts/model.ts`) are measuring the same players. Comparing a
 * candidate rule against a baseline measured by a DIFFERENT bot would be
 * comparing two things at once.
 */

const brainOf = (name: string) => BOTS.find((b) => b.name === name)!.brain;
const smartMove = brainOf('reacting');
const thinkingMove = brainOf('thinking');

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
        // A descent now holds the run open on a card hand, and nothing else
        // resolves until one is taken.
        if (s.screen === 'choosing') s = chooseTrait(s, s.offer[0]).state;
      }
    }
  });

  it('keeps the board playable — never more blots than it can hold', () => {
    for (let seed = 0; seed < 120; seed++) {
      let s = newGame(seed);
      for (let floor = 0; floor < 10; floor++) {
        expect(s.blots.length).toBeLessThanOrEqual(3);
        expect(s.enemies.length).toBeLessThanOrEqual(7);
        // A boss floor is a duel: exactly one thing, and no cover.
        if (isBossFloor(s.depth)) {
          expect(s.enemies).toHaveLength(1);
          expect(s.blots).toHaveLength(0);
        } else {
          expect(s.enemies.length).toBeGreaterThanOrEqual(2);
        }
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
        // A descent now holds the run open on a card hand, and nothing else
        // resolves until one is taken.
        if (s.screen === 'choosing') s = chooseTrait(s, s.offer[0]).state;
      }
    }
  });
});

describe('the difficulty curve actually bites', () => {
  const dumb = summarise(Array.from({ length: 150 }, (_, i) => playRun(i)));
  const smart = summarise(Array.from({ length: 150 }, (_, i) => playRun(i, 4000, smartMove)));
  const thinking = summarise(Array.from({ length: 60 }, (_, i) => playRun(i, 4000, thinkingMove)));

  it('reports the curve', () => {
    const row = (name: string, s: ReturnType<typeof summarise>) =>
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
