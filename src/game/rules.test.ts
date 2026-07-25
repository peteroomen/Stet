import { describe, expect, it } from 'vitest';
import { newGame, spillEvery, step } from './engine';
import { makeEnemy, planIntent } from './enemies';
import { Rng } from './rng';
import { FLOW, MOMENTUM, PRESS, RALLY, SHIPPED, type Rules } from './rules';
import type { GameState, Vec } from './types';

/**
 * The rule variants must actually do what they claim.
 *
 * `scripts/model.ts` reports numbers per variant, and those numbers are only
 * evidence if the variant is implemented correctly — a mechanic that silently
 * never fires would simply report the baseline and read as "no effect", which is
 * indistinguishable from a real null result. So each candidate gets a test that
 * pins its rule AND a test that pins its bound, before any of them is argued for
 * on the strength of a table.
 */

function board(rules: Rules, overrides: Partial<GameState> = {}): GameState {
  const s = newGame(1234, rules);
  return {
    ...s,
    enemies: [],
    items: [],
    blots: [],
    stairs: { x: 4, y: 4 },
    stairsOpen: false,
    player: { ...s.player, pos: { x: 2, y: 2 }, hp: 8, maxHp: 8, dmg: 1, exposed: false, combo: 0 },
    ...overrides,
  };
}

const at = (x: number, y: number): Vec => ({ x, y });

function replan(s: GameState): GameState {
  const rng = new Rng(s.rng);
  for (const e of s.enemies) e.intent = planIntent(e, s, rng);
  return s;
}

describe('the shipped rules are the default', () => {
  it('newGame with no rules argument plays the shipped variant', () => {
    expect(newGame(1).rules.id).toBe('shipped');
  });

  it('leaves every candidate mechanic switched off', () => {
    expect(SHIPPED.killGrantsActions).toBe(0);
    expect(SHIPPED.flowBonus).toBe(0);
    expect(SHIPPED.rallyPerKill).toBe(0);
    expect(SHIPPED.spillRampTurns).toBe(0);
    expect(newGame(1).player.flow).toBe(false);
  });
});

describe('FLOW — dodging a committed strike charges the next one', () => {
  /** A rat one tile away, already committed to stepping onto you. */
  function aimedAt(rules: Rules) {
    const s = board(rules, { enemies: [makeEnemy(1, 'rat', at(1, 2), 7)] });
    return replan(s);
  }

  it('charges when you step out of a strike that was aimed at your tile', () => {
    const s = aimedAt(FLOW);
    expect(s.enemies[0].intent.path).toContainEqual(at(2, 2));
    const r = step(s, 'right');
    expect(r.state.player.flow).toBe(true);
    expect(r.state.stats.damageTaken).toBe(0);
  });

  it('does NOT charge for walking around an empty board', () => {
    // The same move, with nothing committed to the tile being left. Without this
    // the mechanic is just "moving is good", which is the kiting the spill exists
    // to prevent.
    const s = board(FLOW, { enemies: [makeEnemy(1, 'rat', at(4, 4), 7)] });
    const r = step(replan(s), 'right');
    expect(r.state.player.flow).toBe(false);
  });

  it('does NOT charge when you weave out of one strike into another', () => {
    const s = board(FLOW, {
      enemies: [makeEnemy(1, 'rat', at(1, 2), 7), makeEnemy(2, 'rat', at(4, 2), 9)],
    });
    const r = step(replan(s), 'right'); // into the second rat's reach
    expect(r.state.stats.damageTaken).toBeGreaterThan(0);
    expect(r.state.player.flow).toBe(false);
  });

  it('is switched off entirely under the shipped rules', () => {
    const r = step(aimedAt(SHIPPED), 'right');
    expect(r.state.player.flow).toBe(false);
  });

  it('spends on the next strike, adds its bonus, and breaks a WARDEN stance', () => {
    // A warden has poiseBreak 3, so a bare 1-damage stroke cannot interrupt it.
    // This is the whole point of the mechanic: a dodge buys you the one thing a
    // combo would otherwise cost you three turns of standing still to earn.
    const s = board(FLOW, {
      enemies: [makeEnemy(1, 'warden', at(3, 2), 5)],
      player: { ...board(FLOW).player, flow: true },
    });
    s.enemies[0].ready = true;
    const r = step(replan(s), 'right');

    const bump = r.events.find((e) => e.t === 'bump');
    expect(bump).toMatchObject({ dmg: 1 + FLOW.flowBonus, broke: true });
    expect(r.events.some((e) => e.t === 'stagger')).toBe(true);
    expect(r.state.player.flow).toBe(false); // spent, not retained
  });

  it('is lost if you are hit before you can spend it', () => {
    const s = board(FLOW, {
      enemies: [makeEnemy(1, 'rat', at(1, 2), 7)],
      player: { ...board(FLOW).player, flow: true },
    });
    const r = step(replan(s), 'up'); // steps somewhere the rat still reaches
    if (r.state.stats.damageTaken > 0) expect(r.state.player.flow).toBe(false);
  });
});

describe('MOMENTUM — a kill does not end your turn', () => {
  const twoRats = (rules: Rules) =>
    replan(
      board(rules, {
        enemies: [makeEnemy(1, 'rat', at(3, 2), 7), makeEnemy(2, 'rat', at(2, 1), 9)],
      }),
    );

  it('skips the enemy phase on a kill', () => {
    const r = step(twoRats(MOMENTUM), 'right');
    expect(r.events.some((e) => e.t === 'kill')).toBe(true);
    expect(r.events.some((e) => e.phase === 'e')).toBe(false);
    expect(r.state.chain).toBe(1);
    expect(r.state.turn).toBe(twoRats(MOMENTUM).turn); // no turn elapsed
  });

  it('runs the enemy phase normally under the shipped rules', () => {
    const r = step(twoRats(SHIPPED), 'right');
    expect(r.events.some((e) => e.t === 'kill')).toBe(true);
    expect(r.events.some((e) => e.phase === 'e')).toBe(true);
    expect(r.state.chain).toBe(0);
  });

  it('is bounded — you cannot chain past killGrantsActions without the enemies acting', () => {
    // Four rats in a cross, all one-hit kills, plus one out of reach so the floor
    // never clears (a clearing kill grants no chain, which would mask the bound).
    //
    // Counted as CONSECUTIVE phase-free kills. Reading `state.chain` after the
    // loop does not work — the enemy phase resets it to 0, so the assertion holds
    // trivially whether the bound exists or not. Removing the bound left that
    // version of this test green.
    let s = replan(
      board(MOMENTUM, {
        enemies: [
          makeEnemy(1, 'rat', at(3, 2), 1),
          makeEnemy(2, 'rat', at(1, 2), 2),
          makeEnemy(3, 'rat', at(2, 1), 3),
          makeEnemy(4, 'rat', at(2, 3), 4),
          makeEnemy(5, 'rat', at(0, 0), 5),
        ],
      }),
    );
    let streak = 0;
    let worst = 0;
    for (const d of ['right', 'left', 'up', 'down'] as const) {
      const r = step(s, d);
      expect(r.events.some((e) => e.t === 'kill')).toBe(true);
      if (r.events.some((e) => e.phase === 'e')) streak = 0;
      else worst = Math.max(worst, ++streak);
      s = r.state;
    }
    expect(worst).toBe(MOMENTUM.killGrantsActions);
  });

  it('does not grant a free action on the kill that clears the floor', () => {
    const s = replan(board(MOMENTUM, { enemies: [makeEnemy(1, 'rat', at(3, 2), 7)] }));
    const r = step(s, 'right');
    expect(r.state.enemies).toHaveLength(0);
    expect(r.state.chain).toBe(0);
    expect(r.state.stairsOpen).toBe(true); // the enemy phase ran, so it unsealed
  });
});

describe('RALLY — a kill wins back health lost on this floor', () => {
  it('gives nothing back when you have not been hurt on this floor', () => {
    const s = replan(board(RALLY, { enemies: [makeEnemy(1, 'rat', at(3, 2), 7)] }));
    const r = step(s, 'right');
    expect(r.state.player.hp).toBe(s.player.hp);
  });

  it('returns health, and never more than the floor cap', () => {
    // Measured on `floorHpRallied` rather than derived from an HP delta: the HP
    // delta is not a faithful measure of healing, because a lethal blow clamps hp
    // to zero while `damageTaken` records it in full. Derived that way this test
    // "failed" at a rallied value of 1 against a cap of 2.
    let cur = replan(
      board(RALLY, {
        enemies: [
          makeEnemy(1, 'rat', at(3, 2), 1),
          makeEnemy(2, 'rat', at(1, 2), 2),
          makeEnemy(3, 'rat', at(2, 1), 3),
          makeEnemy(4, 'rat', at(2, 3), 4),
        ],
        player: { ...board(RALLY).player, hp: 20, maxHp: 30 },
        floorHpLost: 5,
      }),
    );
    for (const d of ['right', 'left', 'up', 'down'] as const) cur = step(cur, d).state;
    expect(cur.stats.kills).toBeGreaterThanOrEqual(RALLY.rallyFloorCap);
    expect(cur.floorHpRallied).toBe(RALLY.rallyFloorCap);
  });

  it('gives back no more than was actually lost on the floor', () => {
    let cur = replan(
      board(RALLY, {
        enemies: [makeEnemy(1, 'rat', at(3, 2), 1), makeEnemy(2, 'rat', at(1, 2), 2)],
        player: { ...board(RALLY).player, hp: 20, maxHp: 30 },
        floorHpLost: 1,
      }),
    );
    const lostBefore = cur.floorHpLost;
    cur = step(cur, 'right').state;
    expect(cur.stats.kills).toBe(1);
    expect(cur.floorHpRallied).toBeLessThanOrEqual(lostBefore + cur.stats.damageTaken);
  });
});

describe('PRESS — the spill accelerates the longer you linger', () => {
  it('is a flat cadence under the shipped rules', () => {
    const s = newGame(1, SHIPPED);
    expect(spillEvery(s, 1)).toBe(spillEvery(s, 40));
  });

  it('tightens with time spent on the floor, and never reaches zero', () => {
    const s = newGame(1, PRESS);
    const early = spillEvery(s, 1);
    const late = spillEvery(s, 40);
    expect(late).toBeLessThan(early);
    expect(late).toBeGreaterThanOrEqual(1);
  });

  it('still tightens with depth, as it always did', () => {
    const shallow = { ...newGame(1, PRESS), depth: 1 };
    const deep = { ...newGame(1, PRESS), depth: 18 };
    expect(spillEvery(deep, 1)).toBeLessThan(spillEvery(shallow, 1));
  });
});
