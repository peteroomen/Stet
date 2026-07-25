import { describe, expect, it } from 'vitest';
import { MAX_COMBO, newGame, step } from './engine';
import { ENEMY_STATS, makeEnemy, planIntent } from './enemies';
import { Rng } from './rng';
import type { Dir, GameState, Vec } from './types';

/** A bare board with nothing on it, so each test can place exactly what it needs. */
function board(overrides: Partial<GameState> = {}): GameState {
  const s = newGame(1234);
  return {
    ...s,
    enemies: [],
    items: [],
    blots: [],
    stairs: { x: 4, y: 4 },
    stairsOpen: false,
    player: { ...s.player, pos: { x: 2, y: 2 }, hp: 6, maxHp: 6, dmg: 1, exposed: false, combo: 0 },
    ...overrides,
  };
}

const at = (x: number, y: number): Vec => ({ x, y });

/** Give every enemy a fresh telegraph, the way the engine does at end of turn. */
function replan(s: GameState): GameState {
  const rng = new Rng(s.rng);
  for (const e of s.enemies) e.intent = planIntent(e, s, rng);
  return s;
}

describe('movement', () => {
  it('steps into an empty tile', () => {
    const s = board();
    const r = step(s, 'right');
    expect(r.state.player.pos).toEqual(at(3, 2));
    expect(r.spent).toBe(true);
  });

  it('refuses to leave the board and does not spend the turn', () => {
    const s = board({ player: { ...board().player, pos: at(0, 2) } });
    const r = step(s, 'left');
    expect(r.state.player.pos).toEqual(at(0, 2));
    expect(r.spent).toBe(false);
    expect(r.state.turn).toBe(s.turn);
    expect(r.events[0].t).toBe('blocked');
  });

  it('a blot blocks the player without costing a turn', () => {
    const s = board({ blots: [at(3, 2)] });
    const r = step(s, 'right');
    expect(r.state.player.pos).toEqual(at(2, 2));
    expect(r.spent).toBe(false);
  });

  it('does not mutate the state it was given', () => {
    const s = board();
    const before = structuredClone(s);
    step(s, 'right');
    expect(s).toEqual(before);
  });

  it('is deterministic for a given seed', () => {
    const moves: Dir[] = ['right', 'down', 'down', 'left', 'up', 'right', 'right'];
    const run = () => {
      let s = newGame(99);
      for (const m of moves) s = step(s, m).state;
      return s;
    };
    expect(run()).toEqual(run());
  });
});

describe('bump attack — the commitment', () => {
  it('striking damages the enemy and leaves you standing still', () => {
    const s = replan(board({ enemies: [makeEnemy(1, 'stalker', at(3, 2), 0)] }));
    const r = step(s, 'right');
    expect(r.state.player.pos).toEqual(at(2, 2)); // did NOT advance
    expect(r.state.enemies[0].hp).toBe(ENEMY_STATS.stalker.hp - 1);
  });

  it('striking sets EXPOSED', () => {
    const s = replan(board({ enemies: [makeEnemy(1, 'stalker', at(3, 2), 0)] }));
    expect(step(s, 'right').state.player.exposed).toBe(true);
  });

  it('stepping into empty space clears EXPOSED and the combo', () => {
    let s = replan(board({ enemies: [makeEnemy(1, 'warden', at(3, 2), 0)] }));
    s = step(s, 'right').state;
    expect(s.player.exposed).toBe(true);
    s = step(s, 'left').state;
    expect(s.player.exposed).toBe(false);
    expect(s.player.combo).toBe(0);
  });

  it('killing removes the enemy and banks a kill', () => {
    const s = replan(board({ enemies: [makeEnemy(1, 'rat', at(3, 2), 0)] }));
    const r = step(s, 'right');
    expect(r.state.enemies).toHaveLength(0);
    expect(r.state.stats.kills).toBe(1);
    expect(r.events.some((e) => e.t === 'kill')).toBe(true);
  });
});

describe('exposure doubles incoming damage', () => {
  /**
   * The load-bearing rule of the whole game, so it is measured against the
   * alternative rather than asserted in isolation: the SAME rat, hitting from
   * the SAME tile, must cost twice as much when you spent the turn swinging.
   */
  it('costs exactly double what the same blow costs when you step away', () => {
    // Two rats: one to trade with, one to take the counter-hit from.
    const layout = () =>
      replan(
        board({
          enemies: [makeEnemy(1, 'warden', at(3, 2), 0), makeEnemy(2, 'rat', at(1, 2), 0)],
        }),
      );

    // Swing at the warden — the rat's committed step lands on you while exposed.
    const swinging = step(layout(), 'right').state;
    const exposedLoss = 6 - swinging.player.hp;

    // Same board, but step up instead. The rat's telegraphed step still lands
    // where you were, so it misses entirely — commitment cuts both ways.
    const stepping = step(layout(), 'up').state;
    const safeLoss = 6 - stepping.player.hp;

    expect(swinging.player.exposed).toBe(true);
    expect(exposedLoss).toBe(ENEMY_STATS.rat.dmg * 2);
    expect(safeLoss).toBeLessThan(exposedLoss);
  });

  it('records the doubling on the event so the HUD cannot disagree with the rules', () => {
    const s = replan(
      board({ enemies: [makeEnemy(1, 'warden', at(3, 2), 0), makeEnemy(2, 'rat', at(1, 2), 0)] }),
    );
    const r = step(s, 'right');
    const hit = r.events.find((e) => e.t === 'eattack');
    expect(hit).toBeDefined();
    if (hit?.t === 'eattack') {
      expect(hit.exposed).toBe(true);
      expect(hit.dmg).toBe(ENEMY_STATS.rat.dmg * 2);
    }
  });
});

describe('combo', () => {
  it('adds +1 damage per consecutive strike, capped', () => {
    // A padded target so the combo curve can be read past the point where a real
    // enemy would have died, and the player is restored each turn so the rule is
    // isolated from the damage race it normally loses.
    const bag = makeEnemy(1, 'warden', at(3, 2), 0);
    bag.hp = bag.maxHp = 99;
    let s = replan(board({ enemies: [bag] }));

    const dealt: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = step(s, 'right');
      const bump = r.events.find((e) => e.t === 'bump');
      if (bump?.t === 'bump') dealt.push(bump.dmg);
      s = { ...r.state, screen: 'playing', player: { ...r.state.player, hp: 6 } };
    }

    expect(dealt.slice(0, 4)).toEqual([1, 2, 3, 4]);
    expect(dealt.every((d) => d <= 1 + MAX_COMBO)).toBe(true);
    expect(dealt[5]).toBe(1 + MAX_COMBO); // plateaus rather than running away
  });

  it('breaking off resets the ladder to a single stroke', () => {
    const bag = makeEnemy(1, 'warden', at(3, 2), 0);
    bag.hp = bag.maxHp = 99;
    let s = replan(board({ enemies: [bag] }));

    for (let i = 0; i < 3; i++) {
      s = { ...step(s, 'right').state, screen: 'playing', player: { ...s.player, combo: i + 1 } };
    }
    s = { ...s, player: { ...s.player, hp: 6 } };
    s = { ...step(s, 'up').state, screen: 'playing' }; // step away
    s = { ...s, player: { ...s.player, hp: 6 } };

    const bump = step(s, 'down').events.find((e) => e.t === 'bump');
    expect(bump?.t === 'bump' && bump.dmg).toBe(1);
  });
});

describe('enemies commit too', () => {
  it("a charger's telegraphed lunge is not re-aimed when you sidestep", () => {
    // Charger three tiles to the right, on the same row, already wound up.
    const e = makeEnemy(1, 'charger', at(4, 2), 0);
    e.ready = true;
    const s = replan(board({ enemies: [e] }));

    const intent = s.enemies[0].intent;
    expect(intent.kind).toBe('move');
    expect(intent.path).toHaveLength(2); // a two-tile lunge down the row

    // Step out of the row. The lunge still happens, into empty paper.
    const r = step(s, 'up');
    expect(r.state.player.hp).toBe(6);
    expect(r.state.enemies[0].pos).toEqual(at(2, 2)); // it went where it said it would
  });

  it('a slow enemy winds up before it acts, so you always get a warning', () => {
    const s = replan(board({ enemies: [makeEnemy(1, 'charger', at(4, 2), 0)] }));
    expect(s.enemies[0].intent.kind).toBe('wind');
    const r = step(s, 'up');
    expect(r.state.enemies[0].pos).toEqual(at(4, 2)); // did not move while winding
    expect(r.state.enemies[0].ready).toBe(true);
  });

  it('a stalker closes on the diagonal but will not strike from it', () => {
    const s = replan(board({ enemies: [makeEnemy(1, 'stalker', at(3, 3), 0)] }));
    const intent = s.enemies[0].intent;
    // Diagonally adjacent — it must step square-on first.
    expect(intent.kind).toBe('move');
    expect(intent.path[0]).not.toEqual(at(2, 2));
    const r = step(s, 'up');
    expect(r.state.player.hp).toBe(6);
  });

  it('enemies do not stack on the same tile', () => {
    let s = newGame(7);
    for (let i = 0; i < 40 && s.screen === 'playing'; i++) {
      s = step(s, (['up', 'right', 'down', 'left'] as Dir[])[i % 4]).state;
      const seen = new Set(s.enemies.map((e) => `${e.pos.x},${e.pos.y}`));
      expect(seen.size).toBe(s.enemies.length);
    }
  });
});

describe('floor flow', () => {
  it('stairs stay sealed until the floor is clear, then unseal', () => {
    const s = replan(
      board({ enemies: [makeEnemy(1, 'rat', at(3, 2), 0)], stairs: at(0, 0), stairsOpen: false }),
    );
    const r = step(s, 'right');
    expect(r.state.enemies).toHaveLength(0);
    expect(r.state.stairsOpen).toBe(true);
    expect(r.events.some((e) => e.t === 'unseal')).toBe(true);
  });

  it('descending builds a new floor and deepens the run', () => {
    const s = board({ stairs: at(3, 2), stairsOpen: true, enemies: [] });
    const r = step(s, 'right');
    expect(r.state.depth).toBe(s.depth + 1);
    expect(r.state.enemies.length).toBeGreaterThan(0);
    expect(r.events.some((e) => e.t === 'descend')).toBe(true);
  });

  it('every enemy on a fresh floor carries a telegraph', () => {
    const s = newGame(4242);
    expect(s.enemies.length).toBeGreaterThan(0);
    for (const e of s.enemies) expect(e.intent).toBeDefined();
  });

  it('nothing spawns on top of you, or in your face', () => {
    for (let seed = 0; seed < 60; seed++) {
      const s = newGame(seed);
      for (const e of s.enemies) {
        const d = Math.max(
          Math.abs(e.pos.x - s.player.pos.x),
          Math.abs(e.pos.y - s.player.pos.y),
        );
        expect(d).toBeGreaterThanOrEqual(2);
      }
      for (const b of s.blots) expect(b).not.toEqual(s.player.pos);
      expect(s.stairs).not.toEqual(s.player.pos);
    }
  });

  it('depth 1 is all rats', () => {
    for (let seed = 0; seed < 25; seed++) {
      for (const e of newGame(seed).enemies) expect(e.kind).toBe('rat');
    }
  });
});

describe('death', () => {
  it('ends the run at zero HP and never reports negative health', () => {
    const s = replan(
      board({
        player: { ...board().player, hp: 1 },
        enemies: [makeEnemy(1, 'warden', at(3, 2), 0), makeEnemy(2, 'rat', at(1, 2), 0)],
      }),
    );
    const r = step(s, 'right'); // swing, get countered while exposed
    expect(r.state.screen).toBe('dead');
    expect(r.state.player.hp).toBe(0);
  });

  it('ignores input once the run is over', () => {
    const dead: GameState = { ...board(), screen: 'dead' };
    const r = step(dead, 'right');
    expect(r.spent).toBe(false);
    expect(r.state).toBe(dead);
  });
});

describe('items', () => {
  it('a vial heals but never past the cap', () => {
    const s = board({
      player: { ...board().player, hp: 5 },
      items: [{ id: 9, kind: 'vial', pos: at(3, 2), seed: 0 }],
    });
    const r = step(s, 'right');
    expect(r.state.player.hp).toBe(6);
    expect(r.state.items).toHaveLength(0);
  });

  it('a nib permanently raises damage', () => {
    const s = board({ items: [{ id: 9, kind: 'nib', pos: at(3, 2), seed: 0 }] });
    const r = step(s, 'right');
    expect(r.state.player.dmg).toBe(2);
    expect(r.state.stats.nibs).toBe(1);
  });
});
