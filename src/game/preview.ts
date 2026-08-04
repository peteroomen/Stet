/**
 * What each of your four moves would actually cost.
 *
 * The game claims to be readable exactly one turn ahead. It was not, and the
 * reason is structural rather than cosmetic: telegraphs are coloured against the
 * tile you are STANDING ON, so for the three directions where you would move,
 * the board was answering a different question than the one you were asking. A
 * grey path can run straight through the tile you are about to step into.
 *
 * And a stroke's outcome needed arithmetic across three numbers, one of which
 * (`poiseBreak`) appeared nowhere in the game at all — only in `enemies.ts` and
 * the README. Nothing on screen could tell you a WARDEN shrugs off anything
 * under 3.
 *
 * This is computed by playing each move on a throwaway copy of the state, so it
 * cannot drift from the rules the way a re-implementation would. That is only
 * possible because of two decisions the game already made:
 *
 *   - `step()` is pure, so a speculative move costs nothing and leaves no trace.
 *   - enemies COMMIT to their intents, so the enemy phase that follows your move
 *     is fully determined. This is not a forecast or a heuristic. It is what will
 *     happen.
 *
 * On whether this gives the game away: it hands the player exactly what the
 * `reacting` bot has — one ply, the consequence of its own move and nothing
 * further — and that bot reaches median depth 4 against `thinking`'s 18. The
 * whole remaining gap is multi-turn planning, which a preview does not provide.
 * It raises the floor without touching the ceiling.
 *
 * It cannot be measured by the bot harness, and that should be said plainly:
 * bots already compute all of this internally. The change closes the gap between
 * what a bot knows and what a human can see, which is exactly the kind of thing
 * `npm run model` is blind to.
 */

import { step } from './engine';
import { intentThreatens } from './enemies';
import { DIR_VEC, add } from './grid';
import type { Dir, EnemyKind, GameState } from './types';

export const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

export interface MoveOutcome {
  dir: Dir;
  /** False for a wall or a blot — the input is rejected and no turn passes. */
  legal: boolean;
  /** A bump is a swing; a step is a step. The one input verb, disambiguated. */
  kind: 'step' | 'strike';

  /* --- what your stroke does, for a strike ----------------------------- */
  target?: EnemyKind;
  /** Damage this stroke would carry, combo and charge included. */
  dealt: number;
  kills: boolean;
  /** The stroke is heavy enough to break the stance and cancel what it committed to. */
  breaks: boolean;
  /**
   * It lands, but it does not stop them — too light for this kind's poise, or
   * the stance is already braced. The single most surprising outcome in the
   * game, and previously invisible until after you had paid for it.
   */
  shrugged: boolean;

  /* --- what it costs you ------------------------------------------------ */
  /** HP lost in the enemy phase that follows this move. */
  taken: number;
  /** Any of that doubled because you were mid-swing. */
  doubled: boolean;
  /** This move ends the run. */
  lethal: boolean;
}

/**
 * Play all four directions on throwaway copies and read off what happened.
 *
 * Cheap enough to run once per turn, which is where the runtime calls it — NOT
 * per frame. `step()` deep-clones, so four of these per frame at 60fps would be
 * a real cost for a board that has not changed.
 */
export function previewMoves(s: GameState): MoveOutcome[] {
  return DIRS.map((dir) => outcomeOf(s, dir));
}

function outcomeOf(s: GameState, dir: Dir): MoveOutcome {
  const to = add(s.player.pos, DIR_VEC[dir]);
  const enemy = s.enemies.find((e) => e.pos.x === to.x && e.pos.y === to.y);

  const base: MoveOutcome = {
    dir,
    legal: true,
    kind: enemy ? 'strike' : 'step',
    target: enemy?.kind,
    dealt: 0,
    kills: false,
    breaks: false,
    shrugged: false,
    taken: 0,
    doubled: false,
    lethal: false,
  };

  const r = step(s, dir);

  // A wall costs nothing and spends no turn, so there is nothing to preview.
  if (!r.spent) return { ...base, legal: false };

  for (const ev of r.events) {
    if (ev.t === 'bump') {
      base.dealt = ev.dmg;
      base.kills = ev.killed;
      base.breaks = ev.broke;
      base.shrugged = !ev.broke;
    } else if (ev.t === 'eattack') {
      base.taken += ev.dmg;
      if (ev.exposed) base.doubled = true;
    } else if (ev.t === 'death') {
      base.lethal = true;
    }
  }

  return base;
}

/**
 * Is anything currently committed to a blow that would land on you?
 *
 * EXPOSED doubles incoming damage, so it is terrifying — but only when something
 * can actually reach you. Standing exposed on an empty board costs exactly
 * nothing, and the readout used to shout equally loudly in both cases, which is
 * a reliable way to make a mechanic feel arbitrary rather than learnable.
 */
export function underThreat(s: GameState): boolean {
  return s.enemies.some((e) => intentThreatens(e.intent, s.player.pos));
}
