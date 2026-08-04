import { describe, expect, it } from 'vitest';
import { makeSearchBrain, playRun } from './bots';
import { DROWN_DMG, newGame, step } from './engine';
import { makeEnemy } from './enemies';
import { MAX_ENEMIES, chebyshev, eq, manhattan } from './grid';
import { Rng } from './rng';
import { SHIPPED } from './rules';
import type { GameState } from './types';

/**
 * Things that must never happen, checked over thousands of real turns.
 *
 * Both of these were reported from play rather than found by reading the code —
 * "I still teleport weirdly sometimes" and "I spawned on an enemy once" — which
 * is exactly the shape of bug a property test catches and a unit test does not:
 * rare, state-dependent, and invisible until the one seed that triggers it.
 */

interface Violation {
  seed: number;
  turn: number;
  what: string;
}

/** Everything that must hold of a single board, at rest. */
function checkBoard(s: GameState, seed: number, turn: number, out: Violation[]): void {
  const p = s.player.pos;

  for (const e of s.enemies) {
    if (eq(e.pos, p)) {
      out.push({ seed, turn, what: `player shares a tile with ${e.kind} #${e.id} at ${p.x},${p.y}` });
    }
    if (s.blots.some((b) => eq(b, e.pos))) {
      out.push({ seed, turn, what: `${e.kind} #${e.id} stands on a blot at ${e.pos.x},${e.pos.y}` });
    }
  }

  for (let i = 0; i < s.enemies.length; i++) {
    for (let j = i + 1; j < s.enemies.length; j++) {
      if (eq(s.enemies[i].pos, s.enemies[j].pos)) {
        out.push({
          seed,
          turn,
          what: `${s.enemies[i].kind} #${s.enemies[i].id} and ${s.enemies[j].kind} #${s.enemies[j].id} share a tile`,
        });
      }
    }
  }

  if (s.blots.some((b) => eq(b, p))) {
    out.push({ seed, turn, what: `player stands on a blot at ${p.x},${p.y}` });
  }

  if (s.enemies.length > MAX_ENEMIES) {
    out.push({ seed, turn, what: `${s.enemies.length} bodies on a page that holds ${MAX_ENEMIES}` });
  }
}

describe('invariants that must hold across a whole run', () => {
  it('never puts two things on the same tile, and never moves you more than one step', () => {
    const out: Violation[] = [];
    const brain = makeSearchBrain(1);

    for (let seed = 0; seed < 260; seed++) {
      let s = newGame(seed, SHIPPED);
      const rng = new Rng(seed ^ 0x51ed270b);
      checkBoard(s, seed, 0, out);

      for (let turn = 0; turn < 260 && s.screen === 'playing'; turn++) {
        const act = brain(s, rng);
        if (!act) break;
        const before = s;
        const r = step(s, act);
        if (!r.spent) continue;
        s = r.state;

        /*
         * One input is at most one tile.
         *
         * The exception is a DESCENT: the stairs rebuild the board and put you
         * somewhere on a new floor, which is a teleport by design. Everything
         * else that moves you further than a single orthogonal step is a bug,
         * and it is the one the player reported as "I still teleport weirdly".
         */
        if (s.depth === before.depth) {
          const d = manhattan(before.player.pos, s.player.pos);
          if (d > 1) {
            out.push({
              seed,
              turn,
              what: `'${act}' moved the player ${d} tiles: ${before.player.pos.x},${before.player.pos.y} → ${s.player.pos.x},${s.player.pos.y}`,
            });
          }
        }

        // An enemy may step at most one tile per turn — except a CHARGER, whose
        // whole identity is a committed two-tile lunge. Measured in CHEBYSHEV,
        // because a STALKER closes on the diagonal and one diagonal step is two
        // tiles of manhattan distance while still being a single step.
        for (const e of s.enemies) {
          const was = before.enemies.find((o) => o.id === e.id);
          if (!was) continue;
          const d = chebyshev(was.pos, e.pos);
          const cap = e.kind === 'charger' ? 2 : 1;
          if (d > cap) {
            out.push({ seed, turn, what: `${e.kind} #${e.id} moved ${d} tiles (cap ${cap})` });
          }
        }

        checkBoard(s, seed, turn + 1, out);
        if (out.length > 12) break;
      }
      if (out.length > 12) break;
    }

    expect(out.slice(0, 12)).toEqual([]);
  });

  /**
   * Arriving on a new floor standing on top of something.
   *
   * `generateFloor` reserves the player's tile before it places anything else,
   * so this cannot happen at generation — which means if it happens at all it
   * happens on the way IN, and that is worth checking separately from the
   * turn-by-turn sweep above.
   */
  it('never drops you onto an occupant when a floor opens', () => {
    const out: Violation[] = [];

    for (let seed = 0; seed < 400; seed++) {
      const run = playRun(seed, 900, makeSearchBrain(1), SHIPPED);
      // Re-walk the run and check every board the moment its depth changes.
      let s = newGame(seed, SHIPPED);
      const rng = new Rng(seed ^ 0x9e3779b9);
      const brain = makeSearchBrain(1);
      checkBoard(s, seed, 0, out);

      for (let turn = 0; turn < 900 && s.screen === 'playing'; turn++) {
        const act = brain(s, rng);
        if (!act) break;
        const before = s.depth;
        const r = step(s, act);
        if (!r.spent) continue;
        s = r.state;
        if (s.depth !== before) checkBoard(s, seed, turn, out);
        if (out.length > 8) break;
      }
      if (out.length > 8) break;
      expect(run.state.depth).toBeGreaterThan(0);
    }

    expect(out.slice(0, 8)).toEqual([]);
  });
});

/**
 * The page holds seven bodies, and fills anyway.
 *
 * The floor generator buys against MAX_ENEMIES and the DROLLERY checks it before
 * drawing, but the spill — the only source that runs forever — never did. It
 * only bit deep (a 3-ply bot exceeded seven on 17% of runs, peaking at thirteen
 * on depth 27), which is precisely the wrong place for the board to stop being
 * readable.
 *
 * A bare cap is not the fix, and these tests are the reason it is not: with the
 * ink simply switched off at seven, a 1-ply bot pinned the board at seven on
 * depth 13 and wove for 3,614 turns, which is the exact stall the spill was
 * built to prevent. So a page with no room fills over YOU instead.
 */
describe('the spill respects the size of the page', () => {
  /*
   * A crowded floor with the ink well past due, and the player sealed into a
   * two-tile pocket behind blots.
   *
   * The pocket is what makes the test about the spill and nothing else: the
   * player can shuttle back and forth spending turns forever without ever being
   * able to strike anything or be struck. The first version of this let the
   * player walk on an open board, and stepping into an adjacent rat killed it —
   * so the count fell below the cap, the spill correctly fired, and the test
   * failed against working code.
   */
  function crowded(bodies: number, hp = 99): GameState {
    const s = newGame(4242, SHIPPED);
    const spots = [
      { x: 3, y: 0 },
      { x: 4, y: 0 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 4, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 },
    ].slice(0, bodies);
    return {
      ...s,
      depth: 3,
      floorTurns: 60,
      grace: 0,
      spillClock: 99, // the ink is overdue; only the cap can hold it back
      stairs: { x: 4, y: 4 },
      stairsOpen: false,
      blots: [
        { x: 2, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
      ],
      items: [],
      // Deep by default so a test can watch forty turns of drowning without the
      // run ending underneath it; the terminating test passes a real total.
      player: { ...s.player, pos: { x: 0, y: 0 }, hp, maxHp: hp },
      enemies: spots.map((p, i) => makeEnemy(i + 1, 'rat', p, i * 17 + 3)),
    };
  }

  /** Shuttle inside the pocket. Spends a turn, touches nothing. */
  const shuttle = (turn: number) => (turn % 2 === 0 ? 'right' : 'left');

  it('never puts an eighth body on the page', () => {
    let s = crowded(MAX_ENEMIES);

    for (let turn = 0; turn < 40; turn++) {
      const r = step(s, shuttle(turn));
      expect(r.spent).toBe(true);
      s = r.state;
      expect(r.events.filter((e) => e.t === 'spill')).toEqual([]);
      expect(s.enemies.length).toBe(MAX_ENEMIES);
    }
  });

  /*
   * The other half of the claim. Without this, a spill that never fired at all
   * would pass the test above — and the spill is the only thing standing between
   * this game and a patient player who kites forever.
   */
  it('still fills a page with room on it', () => {
    const s = crowded(MAX_ENEMIES - 1);
    const r = step(s, 'right');
    expect(r.events.some((e) => e.t === 'spill')).toBe(true);
    expect(r.state.enemies.length).toBe(MAX_ENEMIES);
  });

  it('fills over you when there is no room, and does not double it for exposure', () => {
    let s = crowded(MAX_ENEMIES);
    s = { ...s, player: { ...s.player, exposed: true } };

    const r = step(s, 'right');
    const drowned = r.events.filter((e) => e.t === 'drown');
    expect(drowned).toHaveLength(1);
    expect(drowned[0]).toMatchObject({ t: 'drown', dmg: DROWN_DMG });
    // Nothing struck you, so nothing is credited with it and exposure is
    // irrelevant — this is the page, not a blow.
    expect(r.events.some((e) => e.t === 'eattack')).toBe(false);
    expect(r.state.player.hp).toBe(s.player.hp - DROWN_DMG);
    expect(r.state.stats.damageTaken).toBe(s.stats.damageTaken + DROWN_DMG);
  });

  it('takes gesso before health, exactly as a blow does', () => {
    let s = crowded(MAX_ENEMIES);
    s = { ...s, player: { ...s.player, ward: 1 } };

    const r = step(s, 'right');
    expect(r.events.some((e) => e.t === 'drown')).toBe(true);
    expect(r.state.player.ward).toBe(0);
    expect(r.state.player.hp).toBe(s.player.hp);
  });

  /*
   * The whole reason the drown exists rather than a bare cap. A player who lets
   * the page fill and then refuses to engage must still run out of page.
   */
  it('ends a run that pins the board and hides', () => {
    let s = crowded(MAX_ENEMIES, SHIPPED.startHp);

    let turn = 0;
    for (; turn < 400 && s.screen === 'playing'; turn++) {
      s = step(s, shuttle(turn)).state;
    }
    expect(s.screen).toBe('dead');
    // Sealed away from every enemy on the board, so the page is the only thing
    // that can have killed you.
    expect(turn).toBeLessThan(400);
  });
});
