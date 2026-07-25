import { describe, expect, it } from 'vitest';
import { buildAnim } from './renderer';
import { newGame, step } from '../game/engine';
import type { Dir, Ev } from '../game/types';

/**
 * Every event the engine can emit must get a cue in the timeline.
 *
 * buildAnim() schedules events with a switch, and an unhandled case is not an
 * error — it silently drops the event, so the thing it describes happens with no
 * sound and no particles. That is exactly what happened to `spill`: the page
 * filled in total silence, and the audio harness missed it because it called
 * runtime.fire() directly and never went through the scheduler.
 */
describe('the turn timeline schedules everything', () => {
  const ALL_EVENTS: Ev['t'][] = [
    'blocked',
    'move',
    'bump',
    'kill',
    'emove',
    'wind',
    'eattack',
    'pickup',
    'spill',
    'unseal',
    'descend',
    'death',
  ];

  it.each(ALL_EVENTS)('gives %s a cue', (t) => {
    // A minimal well-formed instance of each event kind.
    const at = { x: 1, y: 1 };
    const to = { x: 2, y: 1 };
    const samples: Record<Ev['t'], Ev> = {
      blocked: { t: 'blocked', phase: 'p', pos: at, dir: 'left' },
      move: { t: 'move', phase: 'p', from: at, to, dir: 'right' },
      bump: {
        t: 'bump',
        phase: 'p',
        from: at,
        to,
        dir: 'right',
        dmg: 1,
        combo: 0,
        killed: false,
        kind: 'rat',
        id: 1,
      },
      kill: { t: 'kill', phase: 'p', pos: to, kind: 'rat' },
      emove: { t: 'emove', phase: 'e', id: 1, kind: 'rat', from: at, to },
      wind: { t: 'wind', phase: 'e', id: 1, kind: 'charger', pos: at },
      eattack: {
        t: 'eattack',
        phase: 'e',
        id: 1,
        kind: 'rat',
        from: at,
        at: to,
        dmg: 1,
        exposed: false,
        hpAfter: 5,
      },
      pickup: { t: 'pickup', phase: 'p', pos: to, kind: 'vial', amount: 3 },
      spill: { t: 'spill', phase: 'e', pos: to, kind: 'rat' },
      unseal: { t: 'unseal', phase: 'e', pos: to },
      descend: { t: 'descend', phase: 'p', depth: 2 },
      death: { t: 'death', phase: 'e', depth: 2 },
    };

    const anim = buildAnim([samples[t]]);
    expect(anim.cues.map((c) => c.ev.t)).toContain(t);
  });

  /**
   * A cue scheduled past the end of the timeline never fires: the runtime stops
   * advancing the turn clock at `total` and moves on to the next input.
   */
  it('never schedules a cue past the end of its own timeline', () => {
    let s = newGame(555);
    let checked = 0;
    for (let run = 0; run < 30; run++) {
      s = newGame(run * 977 + 3);
      for (let i = 0; i < 120 && s.screen === 'playing'; i++) {
        const r = step(s, nearestFoe(s));
        const anim = buildAnim(r.events);
        for (const cue of anim.cues) {
          expect(cue.at).toBeLessThanOrEqual(anim.total);
          checked++;
        }
        s = r.state;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  /**
   * Played for real rather than hand-built: whatever the engine actually emits
   * over many runs must survive the scheduler. A bot that walks at the nearest
   * foe generates bumps, kills, attacks, spills, unseals and descents.
   */
  it('drops nothing across hundreds of real turns', () => {
    let seen = 0;
    for (let run = 0; run < 30; run++) {
      let s = newGame(run * 131 + 7);
      for (let i = 0; i < 200 && s.screen === 'playing'; i++) {
        const r = step(s, nearestFoe(s));
        const scheduled = new Set(buildAnim(r.events).cues.map((c) => c.ev));
        for (const ev of r.events) {
          expect(scheduled.has(ev)).toBe(true);
          seen++;
        }
        s = r.state;
      }
    }
    expect(seen).toBeGreaterThan(1000);
  });
});

/** Walk at the nearest foe; good enough to exercise every event kind. */
function nearestFoe(s: ReturnType<typeof newGame>): Dir {
  const p = s.player.pos;
  const goal = s.enemies.length
    ? s.enemies.reduce((a, b) =>
        Math.abs(a.pos.x - p.x) + Math.abs(a.pos.y - p.y) <=
        Math.abs(b.pos.x - p.x) + Math.abs(b.pos.y - p.y)
          ? a
          : b,
      ).pos
    : s.stairs;
  const dx = goal.x - p.x;
  const dy = goal.y - p.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx === 0 ? (dy > 0 ? 'down' : 'up') : dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}
