import { describe, expect, it } from 'vitest';
import { ENEMY_STATS } from './enemies';
import { newGame, step } from './engine';
import { previewMoves, underThreat } from './preview';
import type { Enemy, EnemyKind, GameState, Vec } from './types';

function enemy(id: number, kind: EnemyKind, pos: Vec, over: Partial<Enemy> = {}): Enemy {
  const hp = ENEMY_STATS[kind].hp;
  return {
    id,
    kind,
    pos,
    hp,
    maxHp: hp,
    ready: false,
    struck: false,
    poise: true,
    intent: { kind: 'hold', path: [] },
    seed: id * 17,
    ...over,
  };
}

/** A blank floor with the player centred and nothing else on it. */
function board(over: Partial<GameState> = {}): GameState {
  const s = newGame(1);
  return {
    ...s,
    enemies: [],
    items: [],
    blots: [],
    stairs: { x: 4, y: 4 },
    stairsOpen: false,
    grace: 999, // keep the spill out of every one of these
    player: { ...s.player, pos: { x: 2, y: 2 } },
    ...over,
  };
}

const dir = (s: GameState, d: string) => previewMoves(s).find((m) => m.dir === d)!;

describe('the preview tells you what a move costs', () => {
  it('marks a wall as illegal, because it spends no turn', () => {
    const s = board({ player: { ...board().player, pos: { x: 0, y: 0 } } });
    expect(dir(s, 'left').legal).toBe(false);
    expect(dir(s, 'up').legal).toBe(false);
    expect(dir(s, 'right').legal).toBe(true);
  });

  it('marks a blot as illegal', () => {
    const s = board({ blots: [{ x: 3, y: 2 }] });
    expect(dir(s, 'right').legal).toBe(false);
  });

  it('separates a step from a strike', () => {
    const s = board({ enemies: [enemy(1, 'rat', { x: 3, y: 2 })] });
    expect(dir(s, 'right').kind).toBe('strike');
    expect(dir(s, 'left').kind).toBe('step');
  });

  it('reports damage dealt and a kill', () => {
    const s = board({ enemies: [enemy(1, 'rat', { x: 3, y: 2 })] });
    const m = dir(s, 'right');
    expect(m.dealt).toBe(1);
    expect(m.kills).toBe(true);
    expect(m.breaks).toBe(true);
  });

  /**
   * The headline case. A WARDEN's poiseBreak is 3 and appears nowhere in the
   * game, so "my stroke lands but does not stop it" was pure surprise.
   */
  it('warns that a light stroke will be shrugged off by a heavy', () => {
    const s = board({ enemies: [enemy(1, 'warden', { x: 3, y: 2 })] });
    const m = dir(s, 'right');
    expect(m.dealt).toBe(1);
    expect(m.kills).toBe(false);
    expect(m.breaks).toBe(false);
    expect(m.shrugged).toBe(true);
  });

  it('and that a heavy enough stroke will break the same stance', () => {
    const base = board({ enemies: [enemy(1, 'warden', { x: 3, y: 2 })] });
    const s = { ...base, player: { ...base.player, dmg: 3 } };
    const m = dir(s, 'right');
    expect(m.dealt).toBe(3);
    expect(m.breaks).toBe(true);
    expect(m.shrugged).toBe(false);
  });

  it('counts damage you would take from a committed blow', () => {
    // A rat square-on, already committed to stepping onto the player.
    const s = board({
      enemies: [
        enemy(1, 'rat', { x: 3, y: 2 }, { intent: { kind: 'move', path: [{ x: 2, y: 2 }] } }),
      ],
    });
    // Stepping away from the tile it aimed at costs nothing.
    expect(dir(s, 'left').taken).toBe(0);
  });

  /**
   * The reason the board was answering the wrong question: telegraphs are
   * coloured against the tile you are standing on, so a move INTO a threatened
   * tile looked exactly as safe as a move into an empty one.
   */
  it('sees a blow that lands on the tile you are moving into', () => {
    const s = board({
      enemies: [
        // Aimed at (1,2) — not where the player stands, so nothing on the board
        // was drawing this in blood.
        enemy(1, 'rat', { x: 0, y: 2 }, { intent: { kind: 'move', path: [{ x: 1, y: 2 }] } }),
      ],
      player: { ...board().player, pos: { x: 2, y: 2 } },
    });
    expect(dir(s, 'left').taken).toBeGreaterThan(0);
    expect(dir(s, 'right').taken).toBe(0);
  });

  it('doubles what a strike costs, because striking leaves you mid-swing', () => {
    // Two rats: one to hit, one already committed to hitting you back.
    const s = board({
      enemies: [
        enemy(1, 'rat', { x: 3, y: 2 }),
        enemy(2, 'rat', { x: 1, y: 2 }, { intent: { kind: 'move', path: [{ x: 2, y: 2 }] } }),
      ],
    });
    const strike = dir(s, 'right');
    expect(strike.kind).toBe('strike');
    expect(strike.taken).toBe(2); // a rat hits for 1, doubled while exposed
    expect(strike.doubled).toBe(true);

    // Stepping out of the line instead costs nothing at all.
    expect(dir(s, 'up').taken).toBe(0);
    expect(dir(s, 'up').doubled).toBe(false);
  });

  it('flags a move that would end the run', () => {
    const base = board({
      enemies: [
        enemy(1, 'rat', { x: 3, y: 2 }),
        enemy(2, 'rat', { x: 1, y: 2 }, { intent: { kind: 'move', path: [{ x: 2, y: 2 }] } }),
      ],
    });
    const s = { ...base, player: { ...base.player, hp: 2 } };
    // Striking costs 2 while exposed, which is the last of the health.
    expect(dir(s, 'right').lethal).toBe(true);
    expect(dir(s, 'up').lethal).toBe(false);
  });

  it('never mutates the state it is previewing', () => {
    const s = board({ enemies: [enemy(1, 'rat', { x: 3, y: 2 })] });
    const before = structuredClone(s);
    previewMoves(s);
    expect(s).toEqual(before);
  });
});

describe('exposure only matters when something can reach you', () => {
  it('is quiet on an empty board', () => {
    expect(underThreat(board())).toBe(false);
  });

  it('is quiet when the committed blow lands somewhere else', () => {
    const s = board({
      enemies: [
        enemy(1, 'rat', { x: 0, y: 0 }, { intent: { kind: 'move', path: [{ x: 1, y: 0 }] } }),
      ],
    });
    expect(underThreat(s)).toBe(false);
  });

  it('fires when something is committed to your tile', () => {
    const s = board({
      enemies: [
        enemy(1, 'rat', { x: 3, y: 2 }, { intent: { kind: 'move', path: [{ x: 2, y: 2 }] } }),
      ],
    });
    expect(underThreat(s)).toBe(true);
  });
});

describe('holding your ground', () => {
  const held = (over: Partial<GameState> = {}): GameState => {
    const b = board(over);
    return { ...b, rules: { ...b.rules, allowWait: true, waitsPerFloor: 2 } };
  };

  it('is rejected outright under a variant that does not allow it', () => {
    const b = board();
    const r = step({ ...b, rules: { ...b.rules, allowWait: false } }, 'wait');
    expect(r.spent).toBe(false);
    expect(r.events).toHaveLength(0);
  });

  it('spends a turn and hands the floor to the enemy phase', () => {
    const s = held({
      enemies: [
        enemy(1, 'rat', { x: 4, y: 2 }, { intent: { kind: 'move', path: [{ x: 3, y: 2 }] } }),
      ],
    });
    const r = step(s, 'wait');
    expect(r.spent).toBe(true);
    expect(r.events.some((e) => e.t === 'wait')).toBe(true);
    expect(r.state.player.pos).toEqual({ x: 2, y: 2 });
    expect(r.state.enemies[0].pos).toEqual({ x: 3, y: 2 });
  });

  it('sheds the swing, so the blow that lands is not doubled', () => {
    const base = held({
      enemies: [
        enemy(1, 'rat', { x: 3, y: 2 }, { intent: { kind: 'move', path: [{ x: 2, y: 2 }] } }),
      ],
    });
    const s = { ...base, player: { ...base.player, exposed: true } };
    const r = step(s, 'wait');
    expect(r.state.player.exposed).toBe(false);
    expect(r.state.stats.damageTaken).toBe(1); // not 2
  });

  /**
   * The hole this exists for. Measured at 2.8% of turns in scripts/forced.ts, and
   * in 56% of those, standing still is free while every direction costs health.
   */
  it('answers a board where every direction costs health', () => {
    const s = held({
      enemies: [
        // Committed to the four tiles AROUND the player, but not onto it.
        enemy(1, 'rat', { x: 2, y: 0 }, { intent: { kind: 'move', path: [{ x: 2, y: 1 }] } }),
        enemy(2, 'rat', { x: 2, y: 4 }, { intent: { kind: 'move', path: [{ x: 2, y: 3 }] } }),
        enemy(3, 'rat', { x: 0, y: 2 }, { intent: { kind: 'move', path: [{ x: 1, y: 2 }] } }),
        enemy(4, 'rat', { x: 4, y: 2 }, { intent: { kind: 'move', path: [{ x: 3, y: 2 }] } }),
      ],
    });
    expect(previewMoves(s).every((m) => !m.legal || m.taken > 0)).toBe(true);
    expect(step(s, 'wait').state.stats.damageTaken).toBe(0);
  });

  it('is rationed per floor, and a spent budget costs no turn', () => {
    let s = held();
    for (let i = 0; i < 2; i++) {
      const r = step(s, 'wait');
      expect(r.spent).toBe(true);
      s = r.state;
    }
    const denied = step(s, 'wait');
    expect(denied.spent).toBe(false);
    expect(denied.state.turn).toBe(s.turn);
  });
});
