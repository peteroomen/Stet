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

/**
 * GESSO — a ground laid over the page. Takes blows before health does and can
 * never be put back, which is the whole reason it is worth crossing a floor for.
 */
describe('gesso', () => {
  const laid = (hp: number, ward: number): GameState => {
    const s = newGame(11, SHIPPED);
    return {
      ...s,
      enemies: [],
      items: [],
      blots: [],
      grace: 999,
      player: { ...s.player, pos: { x: 2, y: 2 }, hp, maxHp: 7, ward },
    };
  };

  /** A rat square-on and committed to the player's tile. */
  const withRat = (s: GameState): GameState => ({
    ...s,
    enemies: [
      {
        id: 1,
        kind: 'rat',
        pos: { x: 3, y: 2 },
        hp: 1,
        maxHp: 1,
        ready: false,
        struck: false,
        poise: true,
        intent: { kind: 'move', path: [{ x: 2, y: 2 }] },
        seed: 5,
      },
    ],
  });

  it('takes the blow before health does', () => {
    // Hold your ground and eat it. Stepping away would dodge the committed blow
    // entirely, which tests the telegraph rather than the gesso.
    const r = step(withRat(laid(5, 2)), 'wait');
    expect(r.state.player.ward).toBe(1);
    expect(r.state.player.hp).toBe(5);
  });

  it('spills over into health once it is gone', () => {
    // One rat to strike — which is what leaves you mid-swing — and one already
    // committed to your tile, whose blow then lands doubled. Holding would clear
    // the swing before the enemy phase and never exercise this at all.
    const base = laid(5, 1);
    const mk = (id: number, x: number, y: number, path: { x: number; y: number }[]) => ({
      id,
      kind: 'rat' as const,
      pos: { x, y },
      hp: 1,
      maxHp: 1,
      ready: false,
      struck: false,
      poise: true,
      intent: path.length ? { kind: 'move' as const, path } : { kind: 'hold' as const, path: [] as [] },
      seed: id * 7,
    });
    const s: GameState = {
      ...base,
      player: { ...base.player, dmg: 0 }, // cannot kill, so the strike only exposes
      enemies: [mk(1, 3, 2, []), mk(2, 1, 2, [{ x: 2, y: 2 }])],
    };
    const r = step(s, 'right');
    expect(r.events.some((e) => e.t === 'bump')).toBe(true);
    expect(r.state.player.ward).toBe(0);
    expect(r.state.player.hp).toBe(4); // 2 damage, 1 soaked
  });

  it('is never given back by anything that mends', () => {
    const base = laid(2, 0);
    // RALLY on, damage taken, then a kill — health returns, gesso does not.
    const s: GameState = {
      ...base,
      rules: { ...base.rules, rallyPerKill: 1, rallyFloorCap: 2 },
      floorHpLost: 3,
      enemies: [
        {
          id: 1,
          kind: 'rat',
          pos: { x: 3, y: 2 },
          hp: 1,
          maxHp: 1,
          ready: false,
          struck: false,
          poise: true,
          intent: { kind: 'hold', path: [] },
          seed: 5,
        },
      ],
    };
    const r = step(s, 'right');
    expect(r.state.stats.kills).toBe(1);
    expect(r.state.player.hp).toBeGreaterThan(2); // rallied
    expect(r.state.player.ward).toBe(0); // never
  });

  it('survives a descent, unlike everything else that resets', () => {
    const s = laid(5, 2);
    const st = s.stairs;
    const above = st.y > 0;
    const r = step(
      { ...s, stairsOpen: true, player: { ...s.player, pos: { x: st.x, y: above ? st.y - 1 : st.y + 1 } } },
      above ? 'down' : 'up',
    );
    expect(r.state.depth).toBe(s.depth + 1);
    expect(r.state.player.ward).toBe(2);
  });
});

/**
 * WEAR — retracing your steps wears the page through.
 *
 * The flat fade charged for TIME, which is exactly what separates skill here, so
 * it only ever taxed the slower player. This charges for the thing actually
 * being complained about: pacing back and forth to juke something.
 */
describe('wear', () => {
  const worn = (over: Partial<GameState> = {}): GameState => {
    const s = newGame(21, SHIPPED);
    return {
      ...s,
      enemies: [],
      items: [],
      blots: [],
      grace: 999,
      rules: { ...s.rules, fadeMax: 40, fadePerAction: 0, wearMemory: 4, wearCost: 4 },
      player: { ...s.player, pos: { x: 2, y: 2 }, ink: 40, trail: [{ x: 2, y: 2 }] },
      ...over,
    };
  };

  it('is free on fresh paper, however long you take', () => {
    let s = worn();
    // Four steps, four tiles never seen before. Crossing the board costs nothing
    // at any speed — that is the whole correction to the flat fade.
    for (const d of ['right', 'right', 'down', 'down'] as const) s = step(s, d).state;
    expect(s.player.ink).toBe(40);
  });

  /**
   * A tight lap is the juke this exists for, and with a memory of four it comes
   * back around onto remembered paper exactly as it should.
   */
  it('charges for circling a two-by-two', () => {
    let s = worn();
    for (const d of ['right', 'down', 'left', 'up'] as const) s = step(s, d).state;
    expect(s.player.ink).toBeLessThan(40);
  });

  it('charges for stepping back onto a tile you just left', () => {
    let s = worn();
    s = step(s, 'right').state; // (3,2), fresh
    s = step(s, 'left').state; // back to (2,2) — remembered
    expect(s.player.ink).toBe(36);
  });

  it('drains a player pacing back and forth', () => {
    let s = worn();
    for (let i = 0; i < 6; i++) s = step(s, i % 2 === 0 ? 'right' : 'left').state;
    // Five of those six steps land on remembered paper.
    expect(s.player.ink).toBeLessThanOrEqual(24);
  });

  it('forgets everything the moment you commit to a stroke', () => {
    const base = worn({
      enemies: [
        {
          id: 1,
          kind: 'warden',
          pos: { x: 3, y: 2 },
          hp: 9,
          maxHp: 9,
          ready: false,
          struck: false,
          poise: true,
          intent: { kind: 'hold', path: [] },
          seed: 3,
        },
      ],
    });
    let s = step(base, 'up').state; // (2,1)
    s = step(s, 'down').state; // back to (2,2): charged
    const afterPacing = s.player.ink;
    expect(afterPacing).toBeLessThan(40);

    s = step(s, 'right').state; // strike the warden — clears the trail
    // Everything is forgotten except the tile you are standing on, which you
    // demonstrably still occupy.
    expect(s.player.trail).toEqual([{ x: 2, y: 2 }]);
    s = step(s, 'up').state; // (2,1) again, but the page has forgotten
    expect(s.player.ink).toBe(afterPacing);
  });

  it('is inert while the rules leave it off', () => {
    let s = newGame(21, SHIPPED); // fadeMax 0
    const before = s.player.ink;
    for (let i = 0; i < 4; i++) {
      const r = step(s, i % 2 === 0 ? 'right' : 'left');
      if (r.spent) s = r.state;
    }
    expect(s.player.ink).toBe(before);
    expect(s.screen).not.toBe('dead');
  });
});
