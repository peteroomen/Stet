import { describe, expect, it } from 'vitest';
import { makeSearchBrain, playRun } from './bots';
import { chooseTrait, newGame, step } from './engine';
import { pageAt, ringsBell } from './enemies';
import {
  ERAS,
  ERA_FLOORS,
  eraAt,
  eraNumeral,
  isAfterBoss,
  isBossFloor,
  isEraOpening,
} from './eras';
import { SIZE } from './grid';
import { themeFor } from '../render/theme';
import { SHIPPED } from './rules';
import type { Dir, GameState } from './types';

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

  /*
   * The floor an era is NAMED on, and it is deliberately the same floor as the
   * post-boss hand — which is why the title had to move onto that hand. Drawn on
   * the board it was covered by the cards every single time.
   */
  it('opens an era on the floor after each boss', () => {
    expect([1, 2, 4, 5, 8, 9, 12, 13].map(isEraOpening)).toEqual([
      false, false, false, true, false, true, false, true,
    ]);
    // An opening is always also a post-boss hand; that is not a coincidence.
    for (const d of [5, 9, 13]) expect(isAfterBoss(d)).toBe(isEraOpening(d));
  });

  it('numbers each era in the margin', () => {
    expect([1, 4, 5, 8, 9].map(eraNumeral)).toEqual(['I', 'I', 'II', 'II', 'III']);
  });

  it('keeps every depth inside an era, past the end of the authored ones', () => {
    for (const d of [1, 4, 5, 12, 40, 400]) {
      expect(eraAt(d).roster.length).toBeGreaterThan(0);
      expect(eraAt(d).boss).toBeTruthy();
      expect(eraAt(d).hand).toBeTruthy();
    }
  });

  /**
   * An era is a PLACE, and a place has to differ in what it asks of you as well
   * as in how it looks. These are the two halves of that claim.
   */
  it('changes hands between the manuscript and the typewriter', () => {
    expect(eraAt(1).hand).toBe('brush');
    expect(eraAt(ERA_FLOORS + 1).hand).toBe('type');
    // Depth 4 is still the first era's boss floor, not the second era.
    expect(eraAt(ERA_FLOORS).hand).toBe('brush');
  });

  it('gives each era a roster the previous one did not have', () => {
    const first = new Set(ERAS[0].roster);
    const second = new Set(ERAS[1].roster);
    expect([...second].some((k) => !first.has(k))).toBe(true);
    expect([...first].some((k) => !second.has(k))).toBe(true);
  });

  /*
   * A palette is a DELTA over the lighting, so an era that states a colour must
   * state it for both — otherwise night play silently falls back to era I's
   * page for that one value and the board ends up half in each medium.
   */
  it('states every colour it changes in both lightings', () => {
    for (const era of ERAS) {
      const day = Object.keys(era.palette.day ?? {}).sort();
      const night = Object.keys(era.palette.night ?? {}).sort();
      expect(day).toEqual(night);
    }
  });

  it('lays the era over the lighting rather than replacing it', () => {
    const base = themeFor('day', {});
    const typed = themeFor('day', ERAS[1].palette);
    expect(typed.paper).not.toBe(base.paper);
    // Untouched keys fall through, so an era only has to say what differs.
    for (const k of Object.keys(base) as (keyof typeof base)[]) {
      if (!(k in (ERAS[1].palette.day ?? {}))) expect(typed[k]).toBe(base[k]);
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

  /**
   * THE CARRIAGE RETURN — era II's boss, and the one whose fight terminates by
   * arithmetic rather than by probability. The DROLLERY needed two rules bolted
   * on to guarantee it ever ended; this one's clock IS its attack.
   */
  describe('the carriage return', () => {
    it('waits on the last floor of era II', () => {
      const s = descendTo(ERA_FLOORS * 2);
      expect(s.depth).toBe(ERA_FLOORS * 2);
      expect(s.enemies).toHaveLength(1);
      expect(s.enemies[0].kind).toBe('carriageReturn');
    });

    it('travels one row every other turn, and turns around at the margins', () => {
      const lanes = Array.from({ length: 18 }, (_, i) => pageAt(i).lane);
      // Two turns to a row — the odd turns are the ones you get to spend.
      expect(lanes.slice(0, 10)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
      // Then back up the page rather than wrapping: a carriage travels and
      // returns, it does not teleport to the margin.
      expect(lanes.slice(10, 18)).toEqual([3, 3, 2, 2, 1, 1, 0, 0]);
    });

    it('closes the shelter until only the machine is left', () => {
      // Starts as the whole row: |x - bossX| <= 4 is every column.
      expect(pageAt(0).shelter).toBe(SIZE - 1);
      expect(pageAt(5).shelter).toBe(SIZE - 2);
      expect(pageAt(15).shelter).toBe(1);
      // A single square beside the machine, and then none at all.
      expect(pageAt(20).shelter).toBe(0);
      expect(pageAt(40).shelter).toBe(0);
    });

    /*
     * The whole redesign, checked as a property: until the deadline there is
     * ALWAYS somewhere to stand. A boss you cannot dodge is a stat check, and
     * this one was played and reported as exactly that before this change.
     */
    it('always leaves somewhere to stand, right up to the deadline', () => {
      const s = descendTo(ERA_FLOORS * 2);
      const boss = s.enemies[0];
      for (let t = 0; t < 20; t++) {
        const { lane, shelter } = pageAt(t);
        const safe: string[] = [];
        for (let y = 0; y < SIZE; y++) {
          for (let x = 0; x < SIZE; x++) {
            if (x === boss.pos.x && y === boss.pos.y) continue;
            if (y === lane && Math.abs(x - boss.pos.x) <= shelter) safe.push(`${x},${y}`);
          }
        }
        expect({ t, safe: safe.length }).toMatchObject({ t });
        expect(safe.length).toBeGreaterThan(0);
      }
    });

    it('rings the bell when the carriage reaches a margin and starts back', () => {
      const rung = Array.from({ length: 24 }, (_, i) => i).filter(ringsBell);
      expect(rung.length).toBeGreaterThan(0);
      // Only ever at a margin, and only on the turn the travel reverses.
      for (const at of rung) {
        expect([0, SIZE - 1]).toContain(pageAt(at).lane);
        expect(pageAt(at - 1).lane).not.toBe(pageAt(at).lane);
      }
    });

    it('runs out of paper, which is what still makes the fight end', () => {
      // Shelter zero: the only unstruck square is the one the boss stands on,
      // and nobody can stand there.
      expect(pageAt(25).shelter).toBe(0);
    });

    /*
     * The rule the whole design rests on: hitting the machine stops the blow you
     * were about to eat, and does NOT stop the paper. A boss whose clock you can
     * pause by hitting it is a boss you can stall forever, which is the exact
     * failure the drollery's two extra rules exist to patch.
     */
    it('keeps closing the page even while it is being interrupted', () => {
      let s = descendTo(ERA_FLOORS * 2);
      // Stood right next to it, so a stroke is available from the first turn —
      // the loop below is about the clock, not about pathfinding.
      const boss = s.enemies[0];
      const beside = boss.pos.x > 0 ? { x: boss.pos.x - 1, y: boss.pos.y } : { x: 1, y: boss.pos.y };
      // A light stroke on purpose: a run that reaches depth 8 carries a combo
      // ladder, and a heavy one kills the boss on the second swing however often
      // its health is pinned back — the kill has already happened by then.
      s = { ...s, player: { ...s.player, pos: beside, hp: 99, maxHp: 99, dmg: 1 } };

      const DIRS: Dir[] = ['left', 'right', 'up', 'down'];
      const shelterAtStart = pageAt(s.floorTurns).shelter;
      let struck = 0;

      for (let i = 0; i < SIZE * 3 && s.screen === 'playing'; i++) {
        if (!s.enemies[0]) break;

        // Prefer a stroke, but take ANY move that spends a turn: a direction
        // that is merely a wall costs nothing and would spin this loop forever.
        const tried = DIRS.map((d) => ({ d, r: step(s, d) })).filter((x) => x.r.spent);
        if (tried.length === 0) break;
        const hit = tried.find((x) => x.r.events.some((ev) => ev.t === 'bump'));
        if (hit) struck++;
        s = (hit ?? tried[0]).r.state;

        // Pinned at full health AFTER the blow, so the only thing that can end
        // this loop is the clock. Pinning before the stroke is not enough — a
        // run that reaches depth 8 has a combo ladder, and this one killed the
        // boss on the second swing.
        const alive = s.enemies[0];
        if (alive) s = { ...s, enemies: [{ ...alive, hp: alive.maxHp }] };
      }

      expect(struck).toBeGreaterThan(0); // it really was being interrupted
      expect(pageAt(s.floorTurns).shelter).toBeLessThan(shelterAtStart);
    });

    it('ends on its own, against a player who only runs away', () => {
      let s = descendTo(ERA_FLOORS * 2);
      let turns = 0;
      for (; turns < 200 && s.screen === 'playing'; turns++) {
        // Never strike, never approach — just weave. The drollery had to be
        // given rules to stop this working; this one does not.
        const r = step(s, (['up', 'down', 'left', 'right'] as Dir[])[turns % 4]);
        if (r.spent) s = r.state;
      }
      expect(s.screen).toBe('dead');
      expect(turns).toBeLessThan(200);
    });
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

  it('forgets everything the moment you land a KILL', () => {
    const base = worn({
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
          seed: 3,
        },
      ],
    });
    let s = step(base, 'up').state; // (2,1)
    s = step(s, 'down').state; // back to (2,2): charged
    expect(s.player.ink).toBeLessThan(40);
    expect(s.player.trail.length).toBeGreaterThan(1);

    s = step(s, 'right').state; // kill the rat
    // The page keeps only the tile you demonstrably still occupy, and the kill
    // also gives ink back — both are the reward for actually finishing something.
    expect(s.player.trail).toEqual([{ x: 2, y: 2 }]);
    expect(s.player.ink).toBe(40);

    // (2,1) was remembered before the kill and is not any more.
    const after = step(s, 'up').state;
    expect(after.player.ink).toBe(40);
  });

  /**
   * Clearing on any stroke was launderable: strike-move-strike-move never builds
   * a trail, so on a crowded board wear cost nothing at all. Only a kill clears.
   */
  it('is NOT cleared by a stroke that merely lands', () => {
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
    s = step(s, 'right').state; // swing at the warden, does not kill it
    expect(s.player.trail.length).toBeGreaterThan(1);
    const before = s.player.ink;
    s = step(s, 'down').state; // back to (2,2), still remembered
    expect(s.player.ink).toBeLessThan(before);
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
