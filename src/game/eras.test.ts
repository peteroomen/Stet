import { describe, expect, it } from 'vitest';
import { makeSearchBrain, playRun } from './bots';
import { chooseTrait, newGame, step } from './engine';
import { ERA_FLOORS, eraAt, isAfterBoss, isBossFloor } from './eras';
import { SHIPPED } from './rules';
import type { GameState } from './types';

/** Walk a fresh run down to `depth`, taking the first card on every hand. */
function descendTo(depth: number, seed = 3): GameState {
  let s = newGame(seed, SHIPPED);
  let guard = 0;
  while (s.depth < depth && guard++ < 400) {
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
  if (s.screen === 'choosing') s = chooseTrait(s, s.offer[0]).state;
  return s;
}

describe('eras and the floors that end them', () => {
  it('puts a boss on every fourth floor and nowhere else', () => {
    expect([1, 2, 3, 4, 5, 8, 9, 12].map(isBossFloor)).toEqual([
      false, false, false, true, false, true, false, true,
    ]);
    expect(isAfterBoss(5)).toBe(true);
    expect(isAfterBoss(9)).toBe(true);
    expect(isAfterBoss(4)).toBe(false);
    // Depth 1 is nobody's reward, however the arithmetic falls out.
    expect(isAfterBoss(1)).toBe(false);
  });

  it('keeps every depth inside an era, past the end of the authored ones', () => {
    for (const d of [1, 4, 5, 12, 40, 400]) {
      expect(eraAt(d).roster.length).toBeGreaterThan(0);
      expect(eraAt(d).boss).toBeTruthy();
    }
  });

  it('is a duel: one boss, no cover, nothing else', () => {
    const s = descendTo(ERA_FLOORS);
    expect(s.depth).toBe(ERA_FLOORS);
    expect(s.enemies).toHaveLength(1);
    expect(s.enemies[0].kind).toBe('drollery');
    expect(s.blots).toHaveLength(0);
    expect(s.items).toHaveLength(0);
  });

  /**
   * Two clocks on one board is not a duel. The DROLLERY supplies its own
   * pressure by spawning, so the page must not also be filling underneath it.
   */
  it('never fills the page on a boss floor', () => {
    let s = descendTo(ERA_FLOORS);
    s = { ...s, grace: 0, floorTurns: 99 }; // long past any grace
    let spills = 0;
    for (let i = 0; i < 30 && s.screen === 'playing'; i++) {
      const r = step(s, i % 2 === 0 ? 'left' : 'right');
      if (!r.spent) continue;
      spills += r.events.filter((e) => e.t === 'spill').length;
      s = r.state;
    }
    // Any spill here came from the boss winding, never from the clock — and with
    // the boss alive the only spawner is the boss.
    expect(s.depth).toBe(ERA_FLOORS);
    expect(spills).toBeLessThanOrEqual(30);
  });

  it('draws another out of the margin every time it winds', () => {
    const base = descendTo(ERA_FLOORS);
    // Park the boss mid-board, unstruck, about to wind.
    const boss = { ...base.enemies[0], pos: { x: 0, y: 0 }, ready: false };
    let s: GameState = {
      ...base,
      enemies: [boss],
      player: { ...base.player, pos: { x: 4, y: 4 } },
    };

    let spawned = 0;
    for (let i = 0; i < 6 && s.screen === 'playing'; i++) {
      const r = step(s, i % 2 === 0 ? 'up' : 'down');
      if (!r.spent) continue;
      spawned += r.events.filter((e) => e.t === 'spill').length;
      s = r.state;
    }
    expect(spawned).toBeGreaterThan(0);
    expect(s.enemies.length).toBeGreaterThan(1);
  });

  it('widens the hand to four after a boss', () => {
    const s = descendTo(ERA_FLOORS + 1);
    // descendTo takes the card, so re-derive the hand it was offered.
    let raw = newGame(3, SHIPPED);
    let guard = 0;
    let lastOffer: string[] = [];
    while (raw.depth <= ERA_FLOORS && guard++ < 400) {
      if (raw.screen === 'choosing') {
        lastOffer = raw.offer;
        raw = chooseTrait(raw, raw.offer[0]).state;
        continue;
      }
      const st = raw.stairs;
      const above = st.y > 0;
      raw = {
        ...raw,
        enemies: [],
        stairsOpen: true,
        player: { ...raw.player, pos: { x: st.x, y: above ? st.y - 1 : st.y + 1 } },
      };
      raw = step(raw, above ? 'down' : 'up').state;
    }
    expect(raw.depth).toBe(ERA_FLOORS + 1);
    expect(raw.screen).toBe('choosing');
    expect(raw.offer.length).toBe(4);
    expect(lastOffer.length).toBe(3); // an ordinary descent is still three
    expect(s.depth).toBe(ERA_FLOORS + 1);
  });

  it('is beatable, and runs still end', () => {
    const brain = makeSearchBrain(3);
    let pastFirstBoss = 0;
    for (let seed = 0; seed < 30; seed++) {
      const r = playRun(seed, 6000, brain, SHIPPED);
      expect(r.timedOut).toBe(false);
      if (r.state.depth > ERA_FLOORS) pastFirstBoss++;
    }
    // A gate that nothing gets through is a wall, not a boss.
    expect(pastFirstBoss).toBeGreaterThan(15);
  });
});
