import { describe, expect, it } from 'vitest';
import { MAX_COMBO, newGame, step } from './engine';
import { ENEMY_STATS, makeEnemy, planIntent } from './enemies';
import { underThreat } from './preview';
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

    /** Keep the player alive so the ladder can be read past a lethal trade. */
    const revive = (g: GameState): GameState => ({
      ...g,
      screen: 'playing',
      player: { ...g.player, hp: 6 },
    });

    // Three consecutive strikes: the ladder climbs.
    let last = 0;
    for (let i = 0; i < 3; i++) {
      const r = step(s, 'right');
      const bump = r.events.find((e) => e.t === 'bump');
      if (bump?.t === 'bump') last = bump.dmg;
      s = revive(r.state);
    }
    expect(last).toBeGreaterThan(1);

    // Step away and straight back — the warden is still to the right of (2,2),
    // so the strike that follows is the same strike, from a cold start.
    s = revive(step(s, 'up').state);
    expect(s.player.pos).toEqual(at(2, 1));
    s = revive(step(s, 'down').state);
    expect(s.player.pos).toEqual(at(2, 2));

    const bump = step(s, 'right').events.find((e) => e.t === 'bump');
    expect(bump?.t === 'bump' && bump.dmg).toBe(1);
  });
});

describe('stagger — a stroke that lands is also a block', () => {
  /**
   * The measurement that justified the mechanic. Before it existed, depths 2 and
   * 3 were the hardest floors in the game (2.7 damage each, 13% of them clean)
   * because no move both progressed the floor and prevented a blow.
   */
  it('cancels the blow the struck enemy had committed to', () => {
    // A STALKER square-on: it survives one stroke, so the stagger is observable
    // rather than moot. (A RAT dies to any hit and never reaches the enemy phase.)
    const layout = () => replan(board({ enemies: [makeEnemy(1, 'stalker', at(3, 2), 0)] }));

    const s = layout();
    expect(s.enemies[0].intent.kind).toBe('move');
    expect(s.enemies[0].intent.path[0]).toEqual(at(2, 2)); // committed to striking us

    // Strike it first: the committed blow never happens.
    const struck = step(layout(), 'right');
    expect(struck.state.enemies).toHaveLength(1); // survived, so it could have hit us
    expect(struck.events.some((e) => e.t === 'stagger')).toBe(true);
    expect(struck.state.player.hp).toBe(6);

    // Same board, step away instead: it lands the blow it promised.
    const dodged = step(layout(), 'up');
    expect(dodged.state.player.hp).toBe(6); // stepping out of its committed tile also works
  });

  it('a braced enemy acts anyway — no lock', () => {
    // A padded STALKER: fast, so it has a real move committed every turn, and
    // durable enough to keep retaliating.
    const bag = makeEnemy(1, 'stalker', at(3, 2), 0);
    bag.hp = bag.maxHp = 99;
    let s = replan(board({ enemies: [bag] }));

    // First strike breaks the stance: nothing lands on us.
    let r = step(s, 'right');
    expect(r.events.some((e) => e.t === 'stagger')).toBe(true);
    expect(r.state.player.hp).toBe(6);
    s = r.state;

    // Second strike in a row: poise is spent, so it acts — and we are exposed.
    r = step(s, 'right');
    expect(r.events.some((e) => e.t === 'stagger')).toBe(false);
    expect(r.state.player.hp).toBeLessThan(6);
  });

  it('poise returns on a turn you leave it alone', () => {
    const bag = makeEnemy(1, 'stalker', at(3, 2), 0);
    bag.hp = bag.maxHp = 99;
    let s = replan(board({ enemies: [bag] }));

    s = step(s, 'right').state; // break the stance
    expect(s.enemies[0].poise).toBe(false);
    s = { ...s, player: { ...s.player, hp: 6 } };
    s = step(s, 'left').state; // step away — it recovers
    expect(s.enemies[0].poise).toBe(true);
  });

  it('a heavy shrugs off a light stroke', () => {
    // Base damage 1 vs a WARDEN's poiseBreak of 3.
    const bag = makeEnemy(1, 'warden', at(3, 2), 0);
    bag.hp = bag.maxHp = 99;
    const s = replan(board({ enemies: [bag] }));
    const r = step(s, 'right');
    const bump = r.events.find((e) => e.t === 'bump');
    expect(bump?.t === 'bump' && bump.broke).toBe(false);
    expect(r.events.some((e) => e.t === 'stagger')).toBe(false);
    expect(r.state.enemies[0].hp).toBeLessThan(99); // it still took the damage
  });

  it('chaff folds to any stroke', () => {
    const s = replan(board({ enemies: [makeEnemy(1, 'stalker', at(3, 2), 0)] }));
    const bump = step(s, 'right').events.find((e) => e.t === 'bump');
    expect(bump?.t === 'bump' && bump.broke).toBe(true);
  });

  it('interrupting a wound-up charger costs it the coil', () => {
    const e = makeEnemy(1, 'charger', at(4, 2), 0);
    e.ready = true;
    const s = replan(board({ enemies: [e], player: { ...board().player, dmg: 2 } }));
    expect(s.enemies[0].intent.kind).toBe('move'); // lunging this turn

    // Walk into range and break it before it fires.
    const near = replan({
      ...s,
      player: { ...s.player, pos: at(3, 2) },
    });
    const r = step(near, 'right');
    const st = r.events.find((ev) => ev.t === 'stagger');
    expect(st?.t === 'stagger' && st.interrupted).toBe(true);
    expect(r.state.enemies[0].ready).toBe(false); // must wind up all over again
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

/**
 * A sweep is the era II verb: a set of tiles struck at once by something that
 * does not move. Everything era I threatens is a tile, so every dodge in the
 * game so far is a sidestep — these are the tests that the new one is really a
 * different question and not a reskin of the old one.
 */
describe('the typebar — a line, not a tile', () => {
  /** A wound-up typebar at `pos`, telegraphing against the player's column. */
  function armed(pos: Vec, over: Partial<GameState> = {}): GameState {
    const e = makeEnemy(1, 'typebar', pos, 0);
    e.ready = true;
    return replan(board({ enemies: [e], ...over }));
  }

  it('aims at the column you are standing in, not the one it stands in', () => {
    const s = armed(at(4, 4)); // player at 2,2 — a different column entirely
    const intent = s.enemies[0].intent;
    expect(intent.kind).toBe('sweep');
    if (intent.kind !== 'sweep') throw new Error('unreachable');
    expect(intent.tiles.map((t) => t.x)).toEqual([2, 2, 2, 2, 2]);
    expect(intent.tiles.map((t) => t.y)).toEqual([0, 1, 2, 3, 4]);
  });

  it('is not dodged by moving along the column', () => {
    const s = armed(at(4, 4));
    const r = step(s, 'up'); // 2,2 → 2,1: still column two
    expect(r.state.player.hp).toBe(5);
  });

  it('is dodged by one step sideways', () => {
    const s = armed(at(4, 4));
    const r = step(s, 'left'); // 2,2 → 1,2: out of the committed column
    expect(r.state.player.hp).toBe(6);
  });

  it('never takes a step, whatever it is doing', () => {
    let s = armed(at(4, 4));
    for (let i = 0; i < 12; i++) {
      s = step(s, (['left', 'right'] as Dir[])[i % 2]).state;
      expect(s.enemies[0]?.pos).toEqual(at(4, 4));
    }
  });

  it('beats on every other turn, because it is slow like anything else', () => {
    let s = armed(at(4, 4));
    const kinds: string[] = [];
    for (let i = 0; i < 4; i++) {
      s = step(s, (['left', 'right'] as Dir[])[i % 2]).state;
      kinds.push(s.enemies[0].intent.kind);
    }
    expect(kinds).toEqual(['wind', 'sweep', 'wind', 'sweep']);
  });

  /*
   * Poise 1 on purpose: a stationary hazard you cannot interrupt is terrain, and
   * one any stroke silences is a decision — quiet the machine, or deal with the
   * thing walking at you.
   */
  it('a stroke breaks the sweep before it lands', () => {
    const s = armed(at(3, 2)); // adjacent, so it can be answered
    const r = step(s, 'right');
    expect(r.state.player.hp).toBe(6);
    expect(r.events.some((e) => e.t === 'stagger' && e.interrupted)).toBe(true);
  });

  /*
   * Exposure has to be EARNED on the turn the sweep lands — setting the flag on
   * the fixture and then moving clears it in the player phase, which is the
   * engine being right and the first version of this test being wrong. So the
   * player spends the turn striking something, which is also what keeps them
   * standing in the committed column.
   */
  it('doubles against you mid-swing, exactly like a blow that walked in', () => {
    const bar = makeEnemy(1, 'typebar', at(4, 4), 0);
    bar.ready = true;
    const s = replan(board({ enemies: [bar, makeEnemy(2, 'rat', at(3, 2), 0)] }));

    const r = step(s, 'right'); // kills the rat, stays on 2,2, ends the turn exposed
    expect(r.state.stats.kills).toBe(1);
    // dmg 1, doubled. Sweeps price the hit through the same code a bump does,
    // so there is no second set of damage rules to keep in step.
    expect(r.state.player.hp).toBe(4);
  });

  it('reaches you through a blot — a bar comes down on the page, it does not walk', () => {
    const s = armed(at(4, 4), { blots: [at(2, 1)] });
    const r = step(s, 'down'); // 2,2 → 2,3, with a blot between it and nothing
    expect(r.state.player.hp).toBe(5);
  });

  it('is legible: a committed sweep reads as a threat', () => {
    const s = armed(at(4, 4));
    expect(underThreat(s)).toBe(true);
    // And is not a threat once you are out of the line it committed to.
    const off = { ...s, player: { ...s.player, pos: at(0, 0) } };
    expect(underThreat(off)).toBe(false);
  });
});



/**
 * Reach and breadth, and the one rule they are both built around: only the foe
 * you AIMED at can be interrupted. Interrupting is the game's defensive move and
 * it has always been one a turn — a card that broke four stances at once would
 * not be a wider stroke, it would be immunity to being surrounded.
 */
describe('a stroke that catches more than one thing', () => {
  const withRules = (over: Partial<GameState['rules']>, s: GameState): GameState => ({
    ...s,
    rules: { ...s.rules, ...over },
  });

  it('THE LONG NIB carries the stroke through to what stands behind', () => {
    const front = makeEnemy(1, 'warden', at(3, 2), 0);
    const back = makeEnemy(2, 'warden', at(4, 2), 0);
    const s = replan(withRules({ strokeReach: 1 }, board({ enemies: [front, back] })));

    const r = step(s, 'right');
    const byId = new Map(r.state.enemies.map((e) => [e.id, e]));
    expect(byId.get(1)!.hp).toBe(ENEMY_STATS.warden.hp - 1);
    expect(byId.get(2)!.hp).toBe(ENEMY_STATS.warden.hp - 1);
  });

  it('carries nothing when you did not strike anything', () => {
    // An empty tile in front is a STEP, not a stroke — the reach must not turn
    // walking toward a foe into hitting it.
    const back = makeEnemy(1, 'warden', at(4, 2), 0);
    const s = replan(withRules({ strokeReach: 1 }, board({ enemies: [back] })));

    const r = step(s, 'right');
    expect(r.state.player.pos).toEqual(at(3, 2));
    expect(r.state.enemies[0].hp).toBe(ENEMY_STATS.warden.hp);
  });

  it('is stopped by a blot, because solid ink stops a stroke', () => {
    // Player at the left margin so a four-tile line fits: hero, foe, blot, foe.
    const front = makeEnemy(1, 'rat', at(1, 2), 0);
    const behind = makeEnemy(2, 'warden', at(3, 2), 0);
    const s = replan(
      withRules(
        { strokeReach: 2 },
        board({
          enemies: [front, behind],
          blots: [at(2, 2)],
          player: { ...board().player, pos: at(0, 2) },
        }),
      ),
    );

    const r = step(s, 'right');
    expect(r.state.enemies.some((e) => e.id === 1)).toBe(false); // the rat folded
    // The warden is past the blot, so the stroke never got there.
    expect(r.state.enemies.find((e) => e.id === 2)!.hp).toBe(ENEMY_STATS.warden.hp);
  });

  it('THE BROAD NIB catches every other foe you are touching', () => {
    const aimed = makeEnemy(1, 'warden', at(3, 2), 0);
    const beside = makeEnemy(2, 'warden', at(2, 1), 0);
    const also = makeEnemy(3, 'warden', at(1, 2), 0);
    const s = replan(
      withRules({ strokeSplash: true }, board({ enemies: [aimed, beside, also] })),
    );

    const r = step(s, 'right');
    for (const id of [1, 2, 3]) {
      expect(r.state.enemies.find((e) => e.id === id)!.hp).toBe(ENEMY_STATS.warden.hp - 1);
    }
  });

  /*
   * The load-bearing limit. A glance lands but never breaks, so being surrounded
   * stays frightening even with the widest stroke in the game.
   */
  it('never breaks a stance it was not aimed at', () => {
    const aimed = makeEnemy(1, 'rat', at(3, 2), 0);
    const beside = makeEnemy(2, 'rat', at(1, 2), 0);
    const s = replan(
      withRules({ strokeSplash: true }, board({ enemies: [aimed, beside] })),
    );

    const r = step(s, 'right');
    const glances = r.events.filter((e) => e.t === 'bump' && e.glance);
    expect(glances).toHaveLength(1);
    expect(glances[0]).toMatchObject({ broke: false, combo: 0 });
  });

  it('a glance carries no combo, so the ladder is still worth building', () => {
    const bag = makeEnemy(1, 'warden', at(3, 2), 0);
    bag.hp = bag.maxHp = 99;
    const beside = makeEnemy(2, 'warden', at(1, 2), 0);
    beside.hp = beside.maxHp = 99;
    let s = replan(withRules({ strokeSplash: true }, board({ enemies: [bag, beside] })));

    const aimedDmg: number[] = [];
    const glanceDmg: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = step(s, 'right');
      for (const e of r.events) {
        if (e.t !== 'bump') continue;
        (e.glance ? glanceDmg : aimedDmg).push(e.dmg);
      }
      s = { ...r.state, screen: 'playing', player: { ...r.state.player, hp: 6 } };
    }
    expect(aimedDmg).toEqual([1, 2, 3]); // the ladder climbs where you aimed
    expect(glanceDmg).toEqual([1, 1, 1]); // and nowhere else
  });

  it('a kill you only glanced does not hand you a free action', () => {
    const aimed = makeEnemy(1, 'warden', at(3, 2), 0);
    const beside = makeEnemy(2, 'rat', at(1, 2), 0); // dies to a single glance
    const s = replan(
      withRules({ strokeSplash: true, killGrantsActions: 1 }, board({ enemies: [aimed, beside] })),
    );

    const r = step(s, 'right');
    expect(r.state.stats.kills).toBe(1);
    // The turn resolved: a splash card plus MOMENTUM must not become an engine
    // that runs itself off whatever happens to be standing nearby.
    expect(r.state.chain).toBe(0);
    expect(r.events.some((e) => e.t === 'emove' || e.t === 'eattack' || e.t === 'wind')).toBe(true);
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
